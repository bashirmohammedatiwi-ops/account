const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lanSetup', {
  save: (url) => ipcRenderer.invoke('lan-client:save-url', url)
});
