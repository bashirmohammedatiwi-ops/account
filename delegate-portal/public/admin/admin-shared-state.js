/**
 * Shared admin UI state — synced via LAN server so main + client stay identical.
 */
(function () {
  const PINNED_TREES_KEY = 'edari.salesPinnedTrees';
  const PINNED_BRANCHES_KEY = 'edari.salesPinnedBranches';
  const SYNC_TREE_KEY = 'syncTreeSeqs';
  const RECEIPT_POST_KEY = 'mandob_receipt_post_accounts';
  const STMT_SAVED_KEY = 'edari_stmt_saved_accounts';
  const STMT_NAMES_KEY = 'edari_stmt_account_names';

  let cache = null;
  let saveTimer = null;
  let pollTimer = null;

  function apiBase() {
    if (typeof window.getLanApiBase === 'function') return window.getLanApiBase();
    const origin = window.location.origin;
    if (/^https?:/i.test(origin)) {
      try {
        const host = new URL(origin).hostname;
        if (host !== '127.0.0.1' && host !== 'localhost') return '';
      } catch { /* ignore */ }
    }
    return (localStorage.getItem('edariHostUrl') || localStorage.getItem('backendUrl') || '').trim().replace(/\/$/, '');
  }

  function authHeaders() {
    return window.adminAuth?.authHeaders?.() || {};
  }

  async function fetchSettings() {
    if (window.adminLanConnection?.lanFetch) {
      try {
        const data = await window.adminLanConnection.lanFetch('/api/admin/server-settings', { method: 'GET' });
        cache = data;
        return data;
      } catch (err) {
        throw err;
      }
    }
    const base = apiBase();
    const res = await fetch(`${base}/api/admin/server-settings`, {
      headers: { Accept: 'application/json', ...authHeaders() },
      cache: 'no-store'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    cache = data;
    return data;
  }

  function normalizePinnedTrees(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => {
      if (typeof item === 'string' || typeof item === 'number') {
        const key = String(item);
        return { key, num: key, name1: '' };
      }
      if (item && typeof item === 'object') {
        const key = String(item.key || item.num || item.seq || '');
        return {
          key,
          num: String(item.num || key),
          name1: String(item.name1 || item.name || '')
        };
      }
      return null;
    }).filter((t) => t && t.key);
  }

  function normalizePinnedBranches(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((b) => (typeof b === 'string'
        ? { code: b, label: `الفرع ${b}` }
        : { code: String(b.code || ''), label: String(b.label || `الفرع ${b.code || ''}`) }))
      .filter((b) => b.code);
  }

  function applyToLocalStorage(settings = {}) {
    const ui = settings.uiPrefs || {};
    const bg = settings.backgroundSync || {};

    if (Array.isArray(ui.pinnedTrees)) {
      localStorage.setItem(PINNED_TREES_KEY, JSON.stringify(normalizePinnedTrees(ui.pinnedTrees)));
    }
    if (Array.isArray(ui.pinnedBranches)) {
      localStorage.setItem(PINNED_BRANCHES_KEY, JSON.stringify(normalizePinnedBranches(ui.pinnedBranches)));
    }
    if (ui.receiptPostAccounts && typeof ui.receiptPostAccounts === 'object') {
      localStorage.setItem(RECEIPT_POST_KEY, JSON.stringify(ui.receiptPostAccounts));
    }
    if (Array.isArray(ui.stmtSavedAccounts)) {
      localStorage.setItem(STMT_SAVED_KEY, JSON.stringify(ui.stmtSavedAccounts.map(String)));
    }
    if (ui.stmtAccountNames && typeof ui.stmtAccountNames === 'object') {
      localStorage.setItem(STMT_NAMES_KEY, JSON.stringify(ui.stmtAccountNames));
    }
    const treeSeqs = ui.syncTreeSeqs || bg.treeSeqs;
    if (Array.isArray(treeSeqs) && treeSeqs.length) {
      localStorage.setItem(SYNC_TREE_KEY, JSON.stringify(treeSeqs.map(String)));
    }
    if (bg.syncKey && !localStorage.getItem('syncApiKey')) {
      localStorage.setItem('syncApiKey', String(bg.syncKey));
    }
    if (bg.serverUrl) {
      localStorage.setItem('syncServerUrl', String(bg.serverUrl).replace(/\/$/, ''));
    }
  }

  async function init(options = {}) {
    try {
      const data = await fetchSettings();
      applyToLocalStorage(data);
      if (options.startPoll !== false) {
        startPoll();
      }
      return data;
    } catch (err) {
      console.warn('adminSharedState.init', err);
      return null;
    }
  }

  function isLanClient() {
    return Boolean(window.edariDesktop?.isLanClient || window.edariDesktop?.lanClient);
  }

  function getUiPrefs() {
    return cache?.uiPrefs || {};
  }

  function getUpdatedAt() {
    return cache?.updatedAt || cache?.uiPrefs?.updatedAt || '';
  }

  async function patch(patchBody = {}) {
    const current = cache || await fetchSettings();
    const body = {
      edari: patchBody.edari != null ? { ...(current.edari || {}), ...patchBody.edari } : undefined,
      backgroundSync: patchBody.backgroundSync != null
        ? { ...(current.backgroundSync || {}), ...patchBody.backgroundSync }
        : undefined,
      uiPrefs: patchBody.uiPrefs != null
        ? { ...(current.uiPrefs || {}), ...patchBody.uiPrefs, updatedAt: new Date().toISOString() }
        : undefined
    };
    Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);

    if (window.adminLanConnection?.lanFetch) {
      const data = await window.adminLanConnection.lanFetch('/api/admin/server-settings', {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      cache = data;
      applyToLocalStorage(data);
      return data;
    }

    const base = apiBase();
    const res = await fetch(`${base}/api/admin/server-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders() },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    cache = data;
    applyToLocalStorage(data);
    return data;
  }

  function patchDebounced(partial, delayMs = 500) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void patch(partial).catch((err) => console.warn('adminSharedState.save', err));
    }, delayMs);
  }

  function patchUiPrefs(prefs = {}) {
    patchDebounced({ uiPrefs: prefs });
  }

  function patchBackgroundSync(bg = {}) {
    patchDebounced({ backgroundSync: bg });
  }

  async function refreshIfChanged() {
    try {
      const prev = getUpdatedAt();
      const data = await fetchSettings();
      const next = data.updatedAt || data.uiPrefs?.updatedAt || '';
      if (next && next !== prev) {
        applyToLocalStorage(data);
        window.dispatchEvent(new CustomEvent('admin-shared-state-changed', { detail: data }));
      } else if (!prev && next) {
        applyToLocalStorage(data);
      }
      return data;
    } catch {
      return null;
    }
  }

  function startPoll(intervalMs) {
    if (pollTimer) return;
    const ms = intervalMs
      || (window.adminLanConnection?.isLanClient?.() ? 8000 : 12000);
    pollTimer = setInterval(() => void refreshIfChanged(), ms);
  }

  function stopPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  window.adminSharedState = {
    init,
    fetchSettings,
    patch,
    patchUiPrefs,
    patchBackgroundSync,
    refreshIfChanged,
    getUiPrefs,
    applyToLocalStorage,
    isLanClient,
    startPoll,
    stopPoll
  };
})();
