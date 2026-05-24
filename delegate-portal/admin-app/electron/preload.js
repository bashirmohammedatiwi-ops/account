const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('edariDesktop', {
  isDesktop: true,
  runLocalSync: (serverUrl, syncKey) => ipcRenderer.invoke('run-local-sync', { serverUrl, syncKey })
});
