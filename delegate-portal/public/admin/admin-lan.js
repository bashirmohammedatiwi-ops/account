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
    return typeof window.getApiBase === 'function' ? window.getApiBase() : '';
  }

  function savedBackend() {
    return (localStorage.getItem('backendUrl') || '').trim().replace(/\/$/, '');
  }

  function isPrivateIp(host) {
    return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  }

  function guessSubnets() {
    const out = new Set(['192.168.1', '192.168.0', '10.0.0']);
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

  async function scanLanNetwork(port = 5005, onProgress) {
    if (state.scanning) return [];
    state.scanning = true;
    const subnets = guessSubnets();
    const ips = [];
    for (const prefix of subnets) {
      for (let i = 1; i <= 254; i++) ips.push(`${prefix}.${i}`);
    }
    const found = [];
    const batchSize = 48;
    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      const results = await Promise.all(batch.map((ip) => probeLanHost(ip, port)));
      for (const hit of results) {
        if (hit) found.push(hit);
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
    if (info.adminUrl) {
      cards.push({ label: 'لوحة التحكم', url: info.adminUrl });
    }
    if (info.mobileUrl) {
      cards.push({ label: 'تطبيق المندوب (PWA)', url: info.mobileUrl });
    }
    for (const row of info.addresses || []) {
      cards.push({ label: `شبكة ${row.name}`, url: `http://${row.address}:${port}/admin` });
    }

    if (urlsEl) {
      urlsEl.innerHTML = cards.map((c) => `
        <div class="lan-url-row">
          <div style="min-width:120px"><strong>${esc(c.label)}</strong></div>
          <code>${esc(c.url)}</code>
          <button type="button" class="btn btn-soft btn-sm" data-copy="${esc(c.url)}">نسخ</button>
          <a class="btn btn-soft btn-sm" href="${esc(c.url)}" target="_blank" rel="noopener">فتح</a>
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
    if (input && savedBackend()) input.value = savedBackend();
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
      statusEl.textContent = info.primaryAddress
        ? `السيرفر على الشبكة — ${info.primaryAddress}:${info.port || 5005}`
        : 'السيرفر يعمل';
    }
    if (urlsEl && info.adminUrl) {
      urlsEl.innerHTML = `<ul class="simple-list"><li><a href="${esc(info.adminUrl)}">${esc(info.adminUrl)}</a></li></ul>`;
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
    const port = Number(document.getElementById('lanScanPort')?.value || 5005);
    if (btn) btn.disabled = true;
    if (bar) bar.hidden = false;
    if (fill) fill.style.width = '0%';
    const found = await scanLanNetwork(port, (pct, hits) => {
      if (fill) fill.style.width = `${pct}%`;
      renderScanResults(hits);
    });
    renderScanResults(found);
    if (btn) btn.disabled = false;
    if (bar) setTimeout(() => { if (bar) bar.hidden = true; }, 800);
  }

  function needsSetupWizard() {
    if (window.edariDesktop?.isDesktop && !window.edariDesktop?.lanClient) return false;
    const base = apiBase();
    const saved = savedBackend();
    if (saved && !/^https?:\/\/(127\.0\.0\.1|localhost)/i.test(saved)) return false;
    if (base && !/^https?:\/\/(127\.0\.0\.1|localhost)/i.test(base)) return false;
    try {
      const host = window.location.hostname;
      if (isPrivateIp(host) && host !== '127.0.0.1' && host !== 'localhost') return false;
    } catch { /* ignore */ }
    return !saved;
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
  document.getElementById('btnLanSetupScan')?.addEventListener('click', async () => {
    const port = Number(document.getElementById('lanScanPort')?.value || 5005);
    const found = await scanLanNetwork(port);
    renderScanResults(found);
    if (found.length) {
      connectToServer(found[0].adminUrl || `http://${found[0].ip}:${found[0].port}`);
    }
  });

  document.getElementById('lanServerInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') connectToServer(e.target.value);
  });

  window.adminPages = window.adminPages || {};
  window.adminPages.lan = refreshLanPage;

  window.addEventListener('DOMContentLoaded', () => {
    startHealthMonitor();
    if (needsSetupWizard()) showSetupWizard(true);
    void refreshLanPage();
  });
  if (document.readyState !== 'loading') {
    startHealthMonitor();
    if (needsSetupWizard()) showSetupWizard(true);
    void refreshLanPage();
  }

  window.lanCenter = {
    scanLanNetwork,
    connectToServer,
    refreshLanPage,
    probeLanHost
  };
})();
