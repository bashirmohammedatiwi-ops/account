const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('delegateApp', {
  config: () => ipcRenderer.invoke('cfg:get'),
  setServer: (url) => ipcRenderer.invoke('cfg:set-server', url),
  health: () => ipcRenderer.invoke('api:health'),
  trees: () => ipcRenderer.invoke('api:trees'),
  children: (seq) => ipcRenderer.invoke('api:children', seq),
  statement: (seq) => ipcRenderer.invoke('api:statement', seq),
  search: (q) => ipcRenderer.invoke('api:search', q),
  onRefresh: (cb) => {
    const h = () => cb();
    ipcRenderer.on('menu:refresh', h);
    return () => ipcRenderer.removeListener('menu:refresh', h);
  }
});
