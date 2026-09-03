/**
 * HTTP bridge for Edari operations when admin runs as LAN client (browser or thin Electron).
 */
(function () {
  const desktop = window.edariDesktop || {};

  function isLocalhostHost(hostname) {
    return hostname === '127.0.0.1' || hostname === 'localhost';
  }

  function resolveBridgeBase() {
    if (typeof window.getLanApiBase === 'function') return window.getLanApiBase();
    return resolveEdariBase();
  }

  /**
   * Live Edari work (posting receipts, reading trees over ODBC) only runs on
   * the machine where Edari is installed — and that machine is the one serving
   * this page, so same-origin is correct even when data comes from elsewhere.
   */
  function resolveEdariBase() {
    if (lanClient && typeof window.getLanApiBase === 'function') {
      return window.getLanApiBase();
    }
    const override = String(
      desktop.edariHostUrl || localStorage.getItem('edariHostUrl') || ''
    ).trim().replace(/\/$/, '');
    const origin = (window.location.origin && window.location.origin !== 'null')
      ? window.location.origin
      : '';
    if (!override) return /^https?:/i.test(origin) ? '' : resolveBridgeBase();
    try {
      if (origin && new URL(override).origin === origin) return '';
    } catch { /* ignore */ }
    return override;
  }

  function isEdariPath(path) {
    return path.startsWith('/api/admin/edari/')
      || path.startsWith('/api/admin/trigger-sync')
      || path.startsWith('/api/admin/reports/')
      || path.startsWith('/api/admin/receipts/accounts/')
      || path.startsWith('/api/admin/server-settings')
      || path.startsWith('/api/admin/trees')
      || path.startsWith('/api/admin/accounts/')
      || path.startsWith('/api/admin/search')
      || path.startsWith('/api/admin/sync/');
  }

  /** Same as apiJson but always aimed at the machine that owns Edari. */
  function edariJson(path, opts = {}) {
    const base = resolveEdariBase();
    return apiJson(path, { ...opts, __base: base });
  }

  function bridgeHeaders(extra = {}) {
    const auth = window.adminAuth?.authHeaders?.() || {};
    return { 'Content-Type': 'application/json', Accept: 'application/json', ...auth, ...extra };
  }

  async function apiJson(path, opts = {}, attempt = 0) {
    const { __base, ...fetchOpts } = opts;
    const base = __base ?? (isEdariPath(path) ? resolveEdariBase() : resolveBridgeBase());
    const url = `${base}${path}`;
    try {
      const res = await fetch(url, {
        headers: bridgeHeaders(fetchOpts.headers),
        ...fetchOpts
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
    } catch (err) {
      const retry = isEdariPath(path)
        && attempt < 2
        && window.adminLanConnection?.isNetworkFailure?.(err);
      if (retry) {
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
        return apiJson(path, opts, attempt + 1);
      }
      throw err;
    }
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

  const lanClient = Boolean(desktop.lanClient || desktop.isLanClient);

  window.edariDesktop = {
    ...desktop,
    isDesktop: desktop.isDesktop === true && !lanClient,
    isLanClient: lanClient,
    lanClient,
    backendUrl: desktop.backendUrl || resolveBridgeBase() || window.ADMIN_CONFIG?.BACKEND_URL || '',
    edariHostUrl: resolveEdariBase(),
    postEdariReceipt: wrap('postEdariReceipt', '/api/admin/edari/post-receipt'),
    postEdariCustomer: wrap('postEdariCustomer', '/api/admin/edari/post-customer'),
    searchEdariAccounts: wrap('searchEdariAccounts', '/api/admin/edari/search-accounts'),
    searchEdariMaterialTrees: wrap('searchEdariMaterialTrees', '/api/admin/edari/search-material-trees'),
    queryEdariAccountStatements: wrap('queryEdariAccountStatements', '/api/admin/edari/account-statements'),
    exportEdariAccountStatementsPdf: wrap('exportEdariAccountStatementsPdf', '/api/admin/edari/account-statements.pdf'),
    exportEdariSalesReportPdf: wrap('exportEdariSalesReportPdf', '/api/admin/edari/sales-report.pdf'),
    listEdariSalesBranches: wrap('listEdariSalesBranches', '/api/admin/edari/sales-branches', { method: 'GET', queryFromParams: true }),
    searchEdariSalesBranches: wrap('searchEdariSalesBranches', '/api/admin/edari/search-sales-branches'),
    lookupEdariMaterial: wrap('lookupEdariMaterial', '/api/admin/edari/lookup-material'),
    fetchEdariCatalogMaterials: wrap('fetchEdariCatalogMaterials', '/api/admin/edari/catalog-materials'),
    fetchEdariMaterials: wrap('fetchEdariMaterials', '/api/admin/edari/materials'),
    listEdariTrees: wrap('listEdariTrees', '/api/admin/edari/trees', { method: 'GET' }),
    listEdariMaterialTrees: wrap('listEdariMaterialTrees', '/api/admin/edari/material-trees', { method: 'GET' }),
    getEdariSettings: async () => {
      if (typeof desktop.getEdariSettings === 'function') return desktop.getEdariSettings();
      const data = await edariJson('/api/admin/server-settings', { method: 'GET' });
      return { ok: true, edari: data.edari || {} };
    },
    saveEdariSettings: async (edari) => {
      if (typeof desktop.saveEdariSettings === 'function') return desktop.saveEdariSettings(edari);
      return edariJson('/api/admin/server-settings', { method: 'PUT', body: JSON.stringify({ edari }) });
    },
    saveBackgroundSyncSettings: async (patch = {}) => {
      if (typeof desktop.saveBackgroundSyncSettings === 'function') {
        return desktop.saveBackgroundSyncSettings(patch);
      }
      const current = await edariJson('/api/admin/server-settings', { method: 'GET' });
      const backgroundSync = {
        ...(current.backgroundSync || {}),
        serverUrl: patch.serverUrl,
        syncKey: patch.syncKey,
        treeSeqs: patch.treeSeqs,
        autoSyncEnabled: patch.autoSyncEnabled
      };
      Object.keys(backgroundSync).forEach((k) => backgroundSync[k] === undefined && delete backgroundSync[k]);
      const body = { backgroundSync };
      if (patch.edari) body.edari = { ...(current.edari || {}), ...patch.edari };
      if (Array.isArray(patch.treeSeqs)) {
        body.uiPrefs = {
          ...(current.uiPrefs || {}),
          syncTreeSeqs: patch.treeSeqs,
          updatedAt: new Date().toISOString()
        };
      }
      return edariJson('/api/admin/server-settings', { method: 'PUT', body: JSON.stringify(body) });
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
      if (Number(p.previewLines) > 0) qs.set('previewLines', String(Number(p.previewLines)));
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
      const fallback = typeof window.getApiBase === 'function' ? window.getApiBase() : resolveBridgeBase();
      const base = String(serverUrl || fallback).replace(/\/$/, '');
      const res = await fetch(`${base}/api/sync/status`, {
        headers: { 'X-Sync-Key': String(syncKey || '').trim(), ...bridgeHeaders() }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'تعذّر التحقق من السيرفر');
      return data;
    }
  };
})();
