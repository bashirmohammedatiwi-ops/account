const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('accountsApp', {
  status: () => ipcRenderer.invoke('acc:status'),
  labels: () => ipcRenderer.invoke('acc:labels'),
  load: () => ipcRenderer.invoke('acc:load'),
  stats: () => ipcRenderer.invoke('acc:stats'),
  get: (seq) => ipcRenderer.invoke('acc:get', seq),
  path: (seq) => ipcRenderer.invoke('acc:path', seq),
  byNum: (num) => ipcRenderer.invoke('acc:by-num', num),
  children: (parentSeq) => ipcRenderer.invoke('acc:children', parentSeq),
  childrenMeta: (parentSeq) => ipcRenderer.invoke('acc:children-meta', parentSeq),
  descendants: (parentSeq) => ipcRenderer.invoke('acc:descendants', parentSeq),
  statement: (seq) => ipcRenderer.invoke('acc:statement', seq),
  groupSummary: (parentSeq) => ipcRenderer.invoke('acc:group-summary', parentSeq),
  filter: (q) => ipcRenderer.invoke('acc:filter', q),
  exportCsv: (opts) => ipcRenderer.invoke('acc:export-csv', opts),
  onProgress: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on('acc:progress', h);
    return () => ipcRenderer.removeListener('acc:progress', h);
  },
  onRefresh: (cb) => {
    const h = () => cb();
    ipcRenderer.on('menu:refresh', h);
    return () => ipcRenderer.removeListener('menu:refresh', h);
  }
});
