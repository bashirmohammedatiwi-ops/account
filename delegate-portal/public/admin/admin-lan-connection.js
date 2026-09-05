/**
 * LAN connection layer — health probes, retries, and shared-state sync for main ↔ client.
 */
(function () {
  const POLL_FAST_MS = 8000;
  const POLL_SLOW_MS = 15000;
  const PROBE_TIMEOUT_MS = 4500;

  let monitorTimer = null;
  let lastSnapshot = '';
  let lastLanOk = null;
  const state = {
    lanOk: null,
    remoteOk: null,
    lanInfo: null,
    remoteUrl: '',
    mode: 'unknown',
    lastCheckAt: 0,
    lastError: ''
  };

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function isLanClient() {
    if (typeof window.isLanClientMode === 'function') return window.isLanClientMode();
    return Boolean(window.edariDesktop?.lanClient || window.edariDesktop?.isLanClient);
  }

  function lanBase() {
    if (typeof window.getLanApiBase === 'function') return window.getLanApiBase();
    return '';
  }

  function remoteBase() {
    if (typeof window.getApiBase === 'function') return window.getApiBase();
    return '';
  }

  function isNetworkFailure(err) {
    const msg = String(err?.message || err || '').toLowerCase();
    return err instanceof TypeError
      || msg.includes('failed to fetch')
      || msg.includes('network')
      || msg.includes('abort');
  }

  async function probe(base, path, timeoutMs = PROBE_TIMEOUT_MS) {
    const root = String(base || '').replace(/\/$/, '');
    if (!root && path.startsWith('/api')) {
      // same-origin
    }
    const url = `${root}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      let data = {};
      try { data = await res.json(); } catch { /* ignore */ }
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { ok: false, status: 0, error: err.message || 'network' };
    } finally {
      clearTimeout(timer);
    }
  }

  async function probeRemoteHealth(remote) {
    const root = String(remote || '').replace(/\/$/, '');
    if (!root) return { ok: true, status: 200 };
    if (window.edariDesktop?.probeBackendHealth) {
      try {
        const r = await window.edariDesktop.probeBackendHealth(root);
        return { ok: Boolean(r?.ok), status: r?.ok ? 200 : 0, data: r };
      } catch (err) {
        return { ok: false, status: 0, error: err.message || 'probe failed' };
      }
    }
    return probe(root, '/api/health', 5000);
  }

  function statusLabel() {
    if (isLanClient()) {
      if (state.lanOk && state.remoteOk) return 'متصل بالرئيسي والسيرفر البعيد';
      if (state.lanOk && state.remoteOk === false) return 'متصل بالرئيسي — السيرفر البعيد غير متاح';
      if (state.lanOk) return 'متصل بالرئيسي';
      return 'غير متصل بالرئيسي';
    }
    if (state.lanOk && state.remoteOk) return 'متصل محليًا والسيرفر البعيد';
    if (state.remoteOk) return 'متصل بالسيرفر البعيد';
    if (state.lanOk && state.remoteUrl) return 'متصل محليًا — السيرفر البعيد غير متاح';
    if (state.lanOk) return 'متصل محليًا';
    return 'غير متصل';
  }

  function snapshot() {
    return JSON.stringify({
      lanOk: state.lanOk,
      remoteOk: state.remoteOk,
      mode: state.mode,
      settingsAt: state.lanInfo?.settingsUpdatedAt || ''
    });
  }

  function publishStatus() {
    if (typeof window.setServerStatus === 'function') {
      let dot = 'err';
      if (isLanClient()) {
        dot = state.lanOk && state.remoteOk !== false ? 'on' : (state.lanOk ? 'on' : 'err');
      } else {
        dot = (state.lanOk && state.remoteOk !== false) || state.remoteOk ? 'on' : (state.lanOk ? 'on' : 'err');
      }
      window.setServerStatus(dot, statusLabel());
    }
    window.dispatchEvent(new CustomEvent('lan-connection-changed', { detail: { ...state } }));
  }

  async function refreshConnectionState(options = {}) {
    const client = isLanClient();
    state.mode = client ? 'client' : 'server';
    state.remoteUrl = remoteBase();
    state.lastCheckAt = Date.now();

    if (client || lanBase() !== remoteBase()) {
      const lanProbe = await probe(lanBase(), '/api/admin/lan-info');
      state.lanOk = lanProbe.ok && lanProbe.data?.ok && lanProbe.data?.role === 'server';
      state.lanInfo = lanProbe.ok ? lanProbe.data : null;
      if (!state.lanOk) {
        const healthProbe = await probe(lanBase(), '/api/health', 2500);
        state.lanOk = healthProbe.ok;
      }
    } else {
      const healthProbe = await probe('', '/api/health', 2500);
      state.lanOk = healthProbe.ok;
      state.lanInfo = null;
    }

    const remote = state.remoteUrl;
    if (remote) {
      const remoteProbe = await probeRemoteHealth(remote);
      state.remoteOk = remoteProbe.ok;
    } else {
      state.remoteOk = true;
    }

    state.lastError = state.lanOk ? '' : (client ? 'LAN unreachable' : 'server offline');
    publishStatus();

    const snap = snapshot();
    const changed = snap !== lastSnapshot;
    lastSnapshot = snap;

    const reconnected = lastLanOk === false && state.lanOk === true;
    lastLanOk = state.lanOk;

    if (reconnected && options.onReconnect) {
      try { await options.onReconnect(state); } catch (e) { console.warn('lan reconnect', e); }
    }
    return { ...state, changed, reconnected };
  }

  async function lanFetch(path, opts = {}, retries = 2) {
    const base = lanBase();
    const auth = window.adminAuth?.authHeaders?.() || {};
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json', ...auth, ...(opts.headers || {}) };
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const res = await fetch(`${base}${path}`, { ...opts, headers });
        let data = {};
        try { data = await res.json(); } catch { data = {}; }
        if (res.status === 401 && window.adminAuth) window.adminAuth.logout();
        if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
        return data;
      } catch (err) {
        lastErr = err;
        if (attempt < retries && isNetworkFailure(err)) {
          await sleep(350 * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  function startMonitor(options = {}) {
    if (monitorTimer) return;
    const intervalMs = isLanClient() ? POLL_FAST_MS : POLL_SLOW_MS;
    const tick = async () => {
      await refreshConnectionState({
        onReconnect: options.onReconnect
      });
    };
    void tick();
    monitorTimer = setInterval(() => void tick(), intervalMs);
  }

  function stopMonitor() {
    if (monitorTimer) clearInterval(monitorTimer);
    monitorTimer = null;
  }

  function getState() {
    return { ...state };
  }

  window.adminLanConnection = {
    refreshConnectionState,
    startMonitor,
    stopMonitor,
    getState,
    lanFetch,
    isLanClient,
    lanBase,
    remoteBase,
    isNetworkFailure
  };
})();
