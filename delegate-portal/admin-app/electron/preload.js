const { contextBridge, ipcRenderer } = require('electron');

function readLaunchArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const hit = (process.argv || []).find((a) => String(a).startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

contextBridge.exposeInMainWorld('edariDesktop', {
  isDesktop: true,
  backendUrl: readLaunchArg('edari-backend', 'http://187.124.23.65:5005'),
  useRemote: readLaunchArg('edari-remote', '1') !== '0',
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
  lookupEdariMaterial: (code) => ipcRenderer.invoke('lookup-edari-material', code),
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
