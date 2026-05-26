const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('edariDesktop', {
  isDesktop: true,
  runLocalSync: (serverUrl, syncKey) => ipcRenderer.invoke('run-local-sync', { serverUrl, syncKey }),
  onSyncProgress: (handler) => {
    const listener = (_event, line) => handler(line);
    ipcRenderer.on('sync-progress', listener);
    return () => ipcRenderer.removeListener('sync-progress', listener);
  }
});
