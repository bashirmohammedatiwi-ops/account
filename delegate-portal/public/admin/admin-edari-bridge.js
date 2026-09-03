/**
 * HTTP bridge for Edari operations when admin runs as LAN client (browser or thin Electron).
 */
(function () {
  const desktop = window.edariDesktop || {};

  function isLocalhostHost(hostname) {
    return hostname === '127.0.0.1' || hostname === 'localhost';
  }

  function resolveBridgeBase() {
    const saved = (localStorage.getItem('backendUrl') || '').trim().replace(/\/$/, '');
    if (saved) {
      try {
        if (!isLocalhostHost(new URL(saved).hostname)) return saved;
      } catch { /* ignore */ }
    }
    const remote = (desktop.backendUrl || window.ADMIN_CONFIG?.BACKEND_URL || '').trim().replace(/\/$/, '');
    if (remote) {
      try {
        const origin = window.location.origin;
        if (origin && origin !== 'null' && new URL(remote).origin === origin) return '';
      } catch { /* ignore */ }
      if (!isLocalhostHost(new URL(remote).hostname)) return remote;
    }
    if (window.location.origin && window.location.origin !== 'null') {
      return window.location.origin;
    }
    return remote || '';
  }

  function bridgeHeaders(extra = {}) {
    const auth = window.adminAuth?.authHeaders?.() || {};
    return { 'Content-Type': 'application/json', Accept: 'application/json', ...auth, ...extra };
  }

  async function apiJson(path, opts = {}) {
    const base = resolveBridgeBase();
    const url = `${base}${path}`;
    const res = await fetch(url, {
      headers: bridgeHeaders(opts.headers),
      ...opts
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (res.status === 401 && window.adminAuth) window.adminAuth.logout();
    if (!res.ok) {
      throw new Error(data.error || data.message || `HTTP ${res.status}`);
    }
    return data;
  }

  function wrap(name, path, { method = 'POST', queryFromParams = false } = {}) {
    if (typeof desktop[name] === 'function') return desktop[name];
    return async (params = {}) => {
      if (queryFromParams) {
        const qs = new URLSearchParams(params).toString();
        return apiJson(`${path}${qs ? `?${qs}` : ''}`, { method: 'GET' });
      }
      return apiJson(path, { method, body: JSON.stringify(params || {}) });
    };
  }

  const lanClient = Boolean(desktop.lanClient) || (!desktop.isDesktop && !desktop.postEdariReceipt);

  window.edariDesktop = {
    ...desktop,
    isLanClient: lanClient,
    backendUrl: desktop.backendUrl || resolveBridgeBase() || window.ADMIN_CONFIG?.BACKEND_URL || '',
    postEdariReceipt: wrap('postEdariReceipt', '/api/admin/edari/post-receipt'),
    postEdariCustomer: wrap('postEdariCustomer', '/api/admin/edari/post-customer'),
    searchEdariAccounts: wrap('searchEdariAccounts', '/api/admin/edari/search-accounts'),
    queryEdariAccountStatements: wrap('queryEdariAccountStatements', '/api/admin/edari/account-statements'),
    exportEdariAccountStatementsPdf: wrap('exportEdariAccountStatementsPdf', '/api/admin/edari/account-statements.pdf'),
    exportEdariSalesReportPdf: wrap('exportEdariSalesReportPdf', '/api/admin/edari/sales-report.pdf'),
    listEdariSalesBranches: wrap('listEdariSalesBranches', '/api/admin/edari/sales-branches', { method: 'GET', queryFromParams: true }),
    lookupEdariMaterial: wrap('lookupEdariMaterial', '/api/admin/edari/lookup-material'),
    fetchEdariCatalogMaterials: wrap('fetchEdariCatalogMaterials', '/api/admin/edari/catalog-materials'),
    fetchEdariMaterials: wrap('fetchEdariMaterials', '/api/admin/edari/materials'),
    listEdariTrees: wrap('listEdariTrees', '/api/admin/edari/trees', { method: 'GET' }),
    listEdariMaterialTrees: wrap('listEdariMaterialTrees', '/api/admin/edari/material-trees', { method: 'GET' }),
    getEdariSettings: async () => {
      if (typeof desktop.getEdariSettings === 'function') return desktop.getEdariSettings();
      const data = await apiJson('/api/admin/server-settings', { method: 'GET' });
      return { ok: true, edari: data.edari || {} };
    },
    saveEdariSettings: async (edari) => {
      if (typeof desktop.saveEdariSettings === 'function') return desktop.saveEdariSettings(edari);
      return apiJson('/api/admin/server-settings', { method: 'PUT', body: JSON.stringify({ edari }) });
    },
    testEdariConnection: async (edari) => {
      if (typeof desktop.testEdariConnection === 'function') return desktop.testEdariConnection(edari);
      return apiJson('/api/admin/edari/test-connection', { method: 'POST', body: JSON.stringify({ edari }) });
    },
    listEdariDatabases: async (opts) => {
      if (typeof desktop.listEdariDatabases === 'function') return desktop.listEdariDatabases(opts);
      return apiJson('/api/admin/edari/list-databases', { method: 'POST', body: JSON.stringify(opts || {}) });
    },
    runPriceAppSync: async (params) => {
      if (typeof desktop.runPriceAppSync === 'function') return desktop.runPriceAppSync(params);
      return apiJson('/api/admin/edari/price-sync', { method: 'POST', body: JSON.stringify(params || {}) });
    },
    queryEdariSalesReport: async (params = {}) => {
      if (typeof desktop.queryEdariSalesReport === 'function') return desktop.queryEdariSalesReport(params);
      const qs = new URLSearchParams();
      const p = params || {};
      if (Array.isArray(p.treeSeqs) && p.treeSeqs.length) qs.set('treeSeqs', p.treeSeqs.join(','));
      if (p.dateFrom) qs.set('dateFrom', p.dateFrom);
      if (p.dateTo) qs.set('dateTo', p.dateTo);
      if (p.includeSales === false) qs.set('includeSales', '0');
      if (p.includeReturns === false) qs.set('includeReturns', '0');
      if (p.onlyGifts) qs.set('onlyGifts', '1');
      if (Array.isArray(p.branches) && p.branches.length) qs.set('branches', p.branches.join(','));
      return apiJson(`/api/admin/reports/sales?${qs.toString()}`, { method: 'GET' });
    },
    runLocalSync: async (serverUrl, syncKey, treeSeqs) => {
      if (typeof desktop.runLocalSync === 'function') return desktop.runLocalSync(serverUrl, syncKey, treeSeqs);
      return apiJson('/api/admin/trigger-sync', {
        method: 'POST',
        body: JSON.stringify({ serverUrl, syncKey, treeSeqs })
      });
    },
    verifySyncTarget: async (serverUrl, syncKey) => {
      if (typeof desktop.verifySyncTarget === 'function') return desktop.verifySyncTarget(serverUrl, syncKey);
      const base = String(serverUrl || resolveBridgeBase()).replace(/\/$/, '');
      const res = await fetch(`${base}/api/sync/status`, {
        headers: { 'X-Sync-Key': String(syncKey || '').trim(), ...bridgeHeaders() }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'تعذّر التحقق من السيرفر');
      return data;
    }
  };
})();
