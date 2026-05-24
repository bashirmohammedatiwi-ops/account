const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('edari', {
  status: () => ipcRenderer.invoke('app:status'),
  fieldLabels: () => ipcRenderer.invoke('app:field-labels'),
  setConnection: (conn) => ipcRenderer.invoke('app:set-connection', conn),
  syncAll: () => ipcRenderer.invoke('app:sync-all'),
  syncSection: (section) => ipcRenderer.invoke('app:sync-section', section),
  getSection: (section) => ipcRenderer.invoke('app:get-section', section),
  pageRows: (opts) => ipcRenderer.invoke('app:page-rows', opts),
  queryLive: (opts) => ipcRenderer.invoke('app:query-live', opts),
  itemDetail: (seq) => ipcRenderer.invoke('app:item-detail', seq),
  invoiceLines: (seq) => ipcRenderer.invoke('app:invoice-lines', seq),
  receiptItems: (id) => ipcRenderer.invoke('app:receipt-items', id),
  materialsChildren: (parent) => ipcRenderer.invoke('app:materials-children', parent),
  exportCsv: (opts) => ipcRenderer.invoke('app:export-csv', opts),
  onSyncProgress: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('sync:progress', handler);
    return () => ipcRenderer.removeListener('sync:progress', handler);
  },
  onMenuRefresh: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('menu:refresh', handler);
    return () => ipcRenderer.removeListener('menu:refresh', handler);
  }
});
