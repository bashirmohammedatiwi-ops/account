/**
 * LAN Network Center — discovery, connection, monitoring, setup wizard.
 */
(function () {
  const state = {
    role: 'unknown',
    serverInfo: null,
    pingTimer: null,
    scanning: false
  };

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function apiBase() {
    if (typeof window.getLanApiBase === 'function' && (window.isLanClientMode?.() || window.edariDesktop?.lanClient)) {
      return window.getLanApiBase();
    }
    return typeof window.getApiBase === 'function' ? window.getApiBase() : '';
  }

  function savedBackend() {
    return (localStorage.getItem('backendUrl') || '').trim().replace(/\/$/, '');
  }

  function isPrivateIp(host) {
    return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  }

  const LAN_DEFAULT_SUBNETS = ['192.168.75', '192.168.1', '192.168.0', '10.0.0'];
  const LAN_DEFAULT_PREFILL = `http://${LAN_DEFAULT_SUBNETS[0]}.1:4100`;

  function defaultPrefillUrl() {
    const saved = savedBackend();
    if (saved && !/^https?:\/\/(127\.0\.0\.1|localhost)/i.test(saved)) return saved;
    return LAN_DEFAULT_PREFILL;
  }

  function guessSubnets() {
    const out = new Set(LAN_DEFAULT_SUBNETS);
    try {
      const host = window.location.hostname;
      if (isPrivateIp(host)) {
        const parts = host.split('.');
        if (parts.length === 4) out.add(parts.slice(0, 3).join('.'));
      }
    } catch { /* ignore */ }
    const saved = savedBackend();
    if (saved) {
      try {
        const h = new URL(saved).hostname;
        if (isPrivateIp(h)) {
          const parts = h.split('.');
          if (parts.length === 4) out.add(parts.slice(0, 3).join('.'));
        }
      } catch { /* ignore */ }
    }
    return [...out];
  }

  async function probeServerBase(url, timeoutMs = 900) {
    const norm = String(url || '').trim().replace(/\/$/, '');
    if (!norm) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${norm}/api/admin/lan-info`, { signal: ctrl.signal, cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.ok && data.role === 'server') return norm;
    } catch { /* ignore */ }
    finally {
      clearTimeout(timer);
    }
    return null;
  }

  async function tryAutoConnectUrls(urls = []) {
    const list = [...new Set(urls.map((u) => String(u || '').trim().replace(/\/$/, '')).filter(Boolean))];
    const batch = 12;
    for (let i = 0; i < list.length; i += batch) {
      const slice = list.slice(i, i + batch);
      const hits = await Promise.all(slice.map((u) => probeServerBase(u)));
      const ok = hits.find(Boolean);
      if (ok) {
        connectToServer(ok);
        return true;
      }
    }
    return false;
  }

  function quickProbeUrls() {
    const urls = [];
    for (const prefix of LAN_DEFAULT_SUBNETS) {
      for (const host of [1, 10, 100]) {
        for (const port of LAN_PORTS) urls.push(`http://${prefix}.${host}:${port}`);
      }
    }
    return urls;
  }

  async function probeLanHost(ip, port = 5005, timeoutMs = 700) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`http://${ip}:${port}/api/admin/lan-info`, {
        signal: ctrl.signal,
        cache: 'no-store'
      });
      const data = await res.json();
      if (res.ok && data.ok && data.role === 'server') {
        return { ip, port, ...data };
      }
    } catch { /* ignore */ }
    finally {
      clearTimeout(timer);
    }
    return null;
  }

  const LAN_PORTS = [4100, 5005];

  async function probeLanHostAnyPort(ip, ports = LAN_PORTS, timeoutMs = 700) {
    for (const port of ports) {
      const hit = await probeLanHost(ip, port, timeoutMs);
      if (hit) return hit;
    }
    return null;
  }

  async function scanLanNetwork(ports = LAN_PORTS, onProgress) {
    if (state.scanning) return [];
    state.scanning = true;
    const portList = Array.isArray(ports) ? ports : [ports];
    const subnets = guessSubnets();
    const ips = [];
    for (const prefix of subnets) {
      for (let i = 1; i <= 254; i++) ips.push(`${prefix}.${i}`);
    }
    const found = [];
    const seen = new Set();
    const batchSize = 48;
    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      const results = await Promise.all(batch.map((ip) => probeLanHostAnyPort(ip, portList)));
      for (const hit of results) {
        if (hit && !seen.has(`${hit.ip}:${hit.port}`)) {
          seen.add(`${hit.ip}:${hit.port}`);
          found.push(hit);
        }
      }
      if (onProgress) onProgress(Math.min(100, Math.round(((i + batch.length) / ips.length) * 100)), found);
    }
    state.scanning = false;
    return found;
  }

  function connectToServer(url) {
    const norm = String(url || '').trim().replace(/\/$/, '');
    if (!norm) return;
    localStorage.setItem('backendUrl', norm);
    localStorage.setItem('syncServerUrl', norm);
    const syncEl = document.getElementById('syncServerUrl');
    const backendEl = document.getElementById('backendUrl');
    const clientInput = document.getElementById('lanServerInput');
    if (syncEl) syncEl.value = norm;
    if (backendEl) backendEl.value = norm;
    if (clientInput) clientInput.value = norm;
    if (typeof window.applySyncServerUrl === 'function') window.applySyncServerUrl(norm);
    if (window.edariDesktop) window.edariDesktop.backendUrl = norm;
    window.location.reload();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      prompt('انسخ:', text);
      return false;
    }
  }

  function setRoleBadge(role, label) {
    const badge = document.getElementById('lanTopbarBadge');
    if (!badge) return;
    badge.hidden = false;
    badge.textContent = label;
    badge.className = `lan-topbar-badge ${role === 'server' ? '' : role === 'client' ? 'client' : 'offline'}`;
  }

  function renderServerDeck(info) {
    const roleEl = document.getElementById('lanRoleBadge');
    const statsEl = document.getElementById('lanServerStats');
    const urlsEl = document.getElementById('lanUrlCards');
    const clientBlock = document.getElementById('lanClientBlock');
    const serverBlock = document.getElementById('lanServerBlock');
    const fwEl = document.getElementById('lanFirewallHint');
    const port = info.port || 5005;

    if (roleEl) {
      roleEl.className = 'lan-role-badge is-server';
      roleEl.textContent = 'جهاز رئيسي — سيرفر LAN';
    }
    if (clientBlock) clientBlock.hidden = true;
    if (serverBlock) serverBlock.hidden = false;
    setRoleBadge('server', 'سيرفر LAN');

    if (statsEl) {
      statsEl.innerHTML = `
        <div class="lan-stat"><strong>${esc(info.hostname || '—')}</strong><span>اسم الجهاز</span></div>
        <div class="lan-stat"><strong>${Math.floor((info.uptimeSec || 0) / 60)}</strong><span>دقيقة تشغيل</span></div>
        <div class="lan-stat"><strong>${info.stats?.agents ?? '—'}</strong><span>مندوب</span></div>
      `;
    }

    const cards = [];
    const connectUrl = info.clientConnectUrl
      || (info.ethernetAddress ? `http://${info.ethernetAddress}:${port}` : null);
    if (connectUrl) {
      cards.push({
        label: '⭐ للأجهزة الثانوية (Ethernet)',
        url: connectUrl,
        highlight: true
      });
    }
    if (info.adminUrl) {
      cards.push({ label: 'لوحة التحكم', url: info.adminUrl });
    }
    if (info.mobileUrl) {
      cards.push({ label: 'تطبيق المندوب (PWA)', url: info.mobileUrl });
    }
    for (const row of info.addresses || []) {
      if (row.address === info.ethernetAddress) continue;
      cards.push({ label: `شبكة ${row.name}`, url: `http://${row.address}:${port}/admin` });
    }

    if (urlsEl) {
      urlsEl.innerHTML = cards.map((c) => `
        <div class="lan-url-row${c.highlight ? ' lan-url-row-highlight' : ''}">
          <div style="min-width:140px"><strong>${esc(c.label)}</strong></div>
          <code>${esc(c.url)}</code>
          <button type="button" class="btn btn-soft btn-sm" data-copy="${esc(c.url)}">نسخ</button>
          ${c.highlight ? '' : `<a class="btn btn-soft btn-sm" href="${esc(c.url)}" target="_blank" rel="noopener">فتح</a>`}
        </div>
      `).join('') || '<p class="muted">لم يُعثر على عنوان LAN</p>';

      urlsEl.querySelectorAll('[data-copy]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await copyText(btn.dataset.copy);
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = 'نسخ'; }, 1200);
        });
      });
    }

    if (fwEl) {
      fwEl.innerHTML = `
        <strong>جدار الحماية Windows</strong> — اسمح بالمنفذ ${port} TCP على الشبكة الخاصة:
        <code>netsh advfirewall firewall add rule name="Edari Portal ${port}" dir=in action=allow protocol=TCP localport=${port} profile=private</code>
      `;
    }
  }

  function renderClientDeck() {
    const roleEl = document.getElementById('lanRoleBadge');
    const clientBlock = document.getElementById('lanClientBlock');
    const serverBlock = document.getElementById('lanServerBlock');
    const statusEl = document.getElementById('lanPageStatus');
    if (roleEl) {
      roleEl.className = 'lan-role-badge is-client';
      roleEl.textContent = 'جهاز ثانوي — عميل LAN';
    }
    if (clientBlock) clientBlock.hidden = false;
    if (serverBlock) serverBlock.hidden = true;
    setRoleBadge('client', 'عميل LAN');
    const backend = savedBackend() || apiBase() || window.location.origin;
    if (statusEl) statusEl.textContent = backend ? `متصل بـ ${backend}` : 'حدّد عنوان الجهاز الرئيسي';
    const input = document.getElementById('lanServerInput');
    if (input) {
      input.value = savedBackend() || defaultPrefillUrl();
      input.placeholder = defaultPrefillUrl();
    }
  }

  function renderScanResults(servers) {
    const list = document.getElementById('lanScanResults');
    if (!list) return;
    if (!servers.length) {
      list.innerHTML = '<p class="muted">لم يُعثر على سيرفر — تأكد أن الجهاز الرئيسي يعمل</p>';
      return;
    }
    list.innerHTML = servers.map((s) => `
      <div class="lan-scan-item">
        <div class="lan-scan-meta">
          <strong>${esc(s.hostname || s.primaryAddress || s.ip)}</strong>
          <span>${esc(s.adminUrl || `http://${s.ip}:${s.port}/admin`)} · ${s.stats?.agents ?? 0} مندوب</span>
        </div>
        <button type="button" class="btn btn-primary btn-sm" data-connect="${esc(s.adminUrl || `http://${s.ip}:${s.port}`)}">اتصال</button>
      </div>
    `).join('');
    list.querySelectorAll('[data-connect]').forEach((btn) => {
      btn.addEventListener('click', () => connectToServer(btn.dataset.connect));
    });
  }

  async function loadServerInfo() {
    const prefix = apiBase();
    const res = await fetch(`${prefix}/api/admin/lan-info`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'ليس سيرفر');
    state.role = 'server';
    state.serverInfo = data;
    renderServerDeck(data);
    syncPanelFromServer(data);
    return data;
  }

  function syncPanelFromServer(info) {
    const panel = document.getElementById('lanNetworkPanel');
    const statusEl = document.getElementById('lanNetworkStatus');
    const urlsEl = document.getElementById('lanAdminUrls');
    if (panel) panel.dataset.role = 'server';
    if (statusEl) {
      const host = info.ethernetAddress || info.primaryAddress;
      statusEl.textContent = host
        ? `Ethernet — ${host}:${info.port || 5005} (للأجهزة الثانوية)`
        : 'السيرفر يعمل';
    }
    if (urlsEl && (info.clientConnectUrl || info.adminUrl)) {
      const u = info.clientConnectUrl || info.adminUrl;
      urlsEl.innerHTML = `<ul class="simple-list"><li><strong>Ethernet:</strong> <a href="${esc(u)}">${esc(u)}</a></li></ul>`;
    }
  }

  async function refreshLanPage() {
    const statusEl = document.getElementById('lanPageStatus');
    try {
      await loadServerInfo();
      if (statusEl) statusEl.textContent = 'السيرفر الرئيسي يعمل ويستقبل اتصالات LAN';
    } catch {
      state.role = 'client';
      renderClientDeck();
    }
  }

  async function runScan() {
    const btn = document.getElementById('btnLanScan');
    const bar = document.getElementById('lanScanBar');
    const fill = document.getElementById('lanScanBarFill');
    if (btn) btn.disabled = true;
    if (bar) bar.hidden = false;
    if (fill) fill.style.width = '0%';
    const found = await scanLanNetwork(LAN_PORTS, (pct, hits) => {
      if (fill) fill.style.width = `${pct}%`;
      renderScanResults(hits);
    });
    renderScanResults(found);
    if (btn) btn.disabled = false;
    if (bar) setTimeout(() => { if (bar) bar.hidden = true; }, 800);
    return found;
  }

  function needsSetupWizard() {
    // نافذة «اتصال بالجهاز الرئيسي» مخصّصة حصراً لتطبيق سطح المكتب في وضع عميل LAN.
    // على الويب (المتصفح) تُخدَم اللوحة من السيرفر الرئيسي على السحابة مباشرةً،
    // فلا داعي لها إطلاقاً — window.edariDesktop غير معرّف إلا داخل Electron.
    if (!window.edariDesktop) return false;
    if (window.edariDesktop.isDesktop && !window.edariDesktop.lanClient) return false;
    const saved = savedBackend();
    if (saved && !/^https?:\/\/(127\.0\.0\.1|localhost)/i.test(saved)) return false;
    return !saved;
  }

  function renderSetupScanResults(servers, targetId = 'lanSetupScanResults') {
    const list = document.getElementById(targetId);
    if (!list) return;
    if (!servers.length) {
      list.innerHTML = '<p class="muted">لم يُعثر على سيرفر — تأكد أن Edari Admin Server يعمل على الجهاز الرئيسي</p>';
      return;
    }
    list.innerHTML = servers.map((s) => `
      <div class="lan-scan-item">
        <div class="lan-scan-meta">
          <strong>${esc(s.hostname || s.primaryAddress || s.ip)}</strong>
          <span>${esc(s.clientConnectUrl || s.adminUrl || `http://${s.ip}:${s.port}/admin`)}</span>
        </div>
        <button type="button" class="btn btn-primary btn-sm" data-connect="${esc(s.adminUrl || `http://${s.ip}:${s.port}`)}">اتصال</button>
      </div>
    `).join('');
    list.querySelectorAll('[data-connect]').forEach((btn) => {
      btn.addEventListener('click', () => connectToServer(btn.dataset.connect));
    });
  }

  async function autoDiscoverForSetup() {
    const status = document.getElementById('lanSetupScanStatus');
    const input = document.getElementById('lanSetupInput');
    if (input && !input.value.trim()) input.value = defaultPrefillUrl();
    if (status) status.textContent = 'جاري الاتصال التلقائي…';
    if (await tryAutoConnectUrls([input?.value, defaultPrefillUrl()])) return true;
    if (status) status.textContent = 'بحث سريع في Ethernet…';
    if (await tryAutoConnectUrls(quickProbeUrls())) return true;
    if (status) status.textContent = 'جاري البحث في الشبكة عن الجهاز الرئيسي…';
    const found = await scanLanNetwork(LAN_PORTS, (pct, hits) => {
      if (status) status.textContent = `بحث… ${pct}%`;
      if (hits.length) renderSetupScanResults(hits);
    });
    renderSetupScanResults(found);
    if (status) {
      status.textContent = found.length
        ? `وُجد ${found.length} جهاز — اضغط «اتصال» أو انتظر الاتصال التلقائي`
        : 'لم يُعثر على جهاز — عدّل العنوان الافتراضي أعلاه';
    }
    if (found.length >= 1) {
      const url = (found[0].clientConnectUrl
        || found[0].adminUrl
        || `http://${found[0].ip}:${found[0].port}`).replace(/\/admin\/?$/, '');
      if (input) input.value = url;
      if (found.length === 1) await tryAutoConnectUrls([url]);
    }
    return found;
  }

  function showSetupWizard(show) {
    const gate = document.getElementById('lanSetupGate');
    if (!gate) return;
    gate.classList.toggle('hidden', !show);
  }

  async function pingServerHealth() {
    const base = apiBase() || savedBackend() || '';
    if (!base) {
      setRoleBadge('offline', 'غير متصل');
      return false;
    }
    try {
      const res = await fetch(`${base}/api/health`, { cache: 'no-store' });
      if (!res.ok) throw new Error('offline');
      if (state.role === 'client') setRoleBadge('client', 'عميل · متصل');
      return true;
    } catch {
      setRoleBadge('offline', 'انقطع الاتصال');
      return false;
    }
  }

  function startHealthMonitor() {
    if (state.pingTimer) clearInterval(state.pingTimer);
    state.pingTimer = setInterval(() => void pingServerHealth(), 25000);
    void pingServerHealth();
  }

  document.getElementById('btnLanConnect')?.addEventListener('click', () => {
    connectToServer(document.getElementById('lanServerInput')?.value);
  });

  document.getElementById('btnLanPageConnect')?.addEventListener('click', () => {
    connectToServer(document.getElementById('lanServerInput')?.value);
  });

  document.getElementById('btnLanRefresh')?.addEventListener('click', () => void refreshLanPage());
  document.getElementById('btnLanPageRefresh')?.addEventListener('click', () => void refreshLanPage());
  document.getElementById('btnLanScan')?.addEventListener('click', () => void runScan());
  document.getElementById('btnLanSetupConnect')?.addEventListener('click', () => {
    connectToServer(document.getElementById('lanSetupInput')?.value);
  });
  document.getElementById('btnLanSetupScan')?.addEventListener('click', () => void autoDiscoverForSetup());

  function openSetupIfNeeded() {
    if (!needsSetupWizard()) return;
    const input = document.getElementById('lanSetupInput');
    if (input && !input.value.trim()) input.value = defaultPrefillUrl();
    showSetupWizard(true);
    void autoDiscoverForSetup();
  }

  document.getElementById('lanServerInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') connectToServer(e.target.value);
  });

  window.adminPages = window.adminPages || {};
  window.adminPages.lan = refreshLanPage;

  window.addEventListener('DOMContentLoaded', () => {
    startHealthMonitor();
    openSetupIfNeeded();
    void refreshLanPage();
  });
  if (document.readyState !== 'loading') {
    startHealthMonitor();
    openSetupIfNeeded();
    void refreshLanPage();
  }

  window.lanCenter = {
    scanLanNetwork,
    connectToServer,
    refreshLanPage,
    probeLanHost
  };
})();
