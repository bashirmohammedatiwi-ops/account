const { contextBridge, ipcRenderer } = require('electron');

function readLaunchArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const hit = (process.argv || []).find((a) => String(a).startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const LAN_CLIENT = readLaunchArg('edari-lan-client', process.env.ADMIN_LAN_CLIENT === '1' ? '1' : '0') === '1';
const backendUrl = readLaunchArg('edari-backend', (process.env.BACKEND_URL || '').replace(/\/$/, ''));

const base = {
  isDesktop: !LAN_CLIENT,
  lanClient: LAN_CLIENT,
  backendUrl,
  useRemote: readLaunchArg('edari-remote', LAN_CLIENT ? '1' : '0') !== '0',
  apiSameOrigin: readLaunchArg('edari-api-same-origin', '0') === '1',
  // LAN machine that owns Edari — empty when this machine owns it itself.
  edariHostUrl: readLaunchArg('edari-host', '').replace(/\/$/, ''),
  // Server holding delegate data (receipts, agents). Empty = use page origin.
  dataBackendUrl: readLaunchArg('edari-data-backend', '').replace(/\/$/, ''),
  probeBackendHealth: (url) => ipcRenderer.invoke('probe-backend-health', url || '')
};

if (LAN_CLIENT) {
  // The client can fall back to the setup page after a dropped LAN link, so it
  // needs the setup bridge under the same preload.
  contextBridge.exposeInMainWorld('lanSetup', {
    getConfig: () => ipcRenderer.invoke('lan-client:get-setup-config'),
    save: (url) => ipcRenderer.invoke('lan-client:save-url', url)
  });
}

if (!LAN_CLIENT) {
  Object.assign(base, {
    runLocalSync: (serverUrl, syncKey, treeSeqs) => ipcRenderer.invoke('run-local-sync', { serverUrl, syncKey, treeSeqs }),
    verifySyncTarget: (serverUrl, syncKey) => ipcRenderer.invoke('verify-sync-target', { serverUrl, syncKey }),
    listEdariTrees: () => ipcRenderer.invoke('list-edari-trees'),
    listEdariMaterialTrees: () => ipcRenderer.invoke('list-edari-material-trees'),
    listEdariSalesBranches: (params) => ipcRenderer.invoke('list-edari-sales-branches', params || {}),
    queryEdariSalesReport: (params) => ipcRenderer.invoke('query-edari-sales-report', params || {}),
    exportEdariSalesReportPdf: (params) => ipcRenderer.invoke('export-edari-sales-report-pdf', params || {}),
    queryEdariAccountStatements: (params) => ipcRenderer.invoke('query-edari-account-statements', params || {}),
    exportEdariAccountStatementsPdf: (params) => ipcRenderer.invoke('export-edari-account-statements-pdf', params || {}),
    fetchEdariMaterials: () => ipcRenderer.invoke('fetch-edari-materials'),
    fetchEdariCatalogMaterials: (opts) => ipcRenderer.invoke('fetch-edari-catalog-materials', opts || {}),
    getAutoSyncState: () => ipcRenderer.invoke('get-auto-sync-state'),
    saveBackgroundSyncSettings: (patch) => ipcRenderer.invoke('save-background-sync-settings', patch),
    getEdariSettings: () => ipcRenderer.invoke('get-edari-settings'),
    saveEdariSettings: (edari) => ipcRenderer.invoke('save-edari-settings', edari),
    testEdariConnection: (edari) => ipcRenderer.invoke('test-edari-connection', edari),
    listEdariDatabases: (opts) => ipcRenderer.invoke('list-edari-databases', opts || {}),
    setAutoSyncEnabled: (enabled) => ipcRenderer.invoke('set-auto-sync-enabled', enabled),
    setStartAtLogin: (enabled) => ipcRenderer.invoke('set-start-at-login', enabled),
    runBackgroundSyncNow: () => ipcRenderer.invoke('run-background-sync-now'),
    runPriceAppSync: (params) => ipcRenderer.invoke('run-price-app-sync', params || {}),
    onPriceSyncProgress: (handler) => {
      const listener = (_event, line) => handler(line);
      ipcRenderer.on('sync-progress', listener);
      return () => ipcRenderer.removeListener('sync-progress', listener);
    },
    lookupEdariMaterial: (code) => ipcRenderer.invoke('lookup-edari-material', code),
    searchEdariAccounts: (params) => ipcRenderer.invoke('search-edari-accounts', params || {}),
    postEdariReceipt: (payload) => ipcRenderer.invoke('post-edari-receipt', payload || {}),
    postEdariCustomer: (payload) => ipcRenderer.invoke('post-edari-customer', payload || {}),
    onSyncProgress: (handler) => {
      const listener = (_event, line) => handler(line);
      ipcRenderer.on('sync-progress', listener);
      return () => ipcRenderer.removeListener('sync-progress', listener);
    },
    onAutoSyncState: (handler) => {
      const listener = (_event, state) => handler(state);
      ipcRenderer.on('auto-sync-state', listener);
      return () => ipcRenderer.removeListener('auto-sync-state', listener);
    },
    onSyncActivity: (handler) => {
      const listener = (_event, payload) => handler(payload);
      ipcRenderer.on('sync-activity', listener);
      return () => ipcRenderer.removeListener('sync-activity', listener);
    }
  });
}

contextBridge.exposeInMainWorld('edariDesktop', base);
