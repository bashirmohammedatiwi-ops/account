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
  listEdariTrees: () => ipcRenderer.invoke('list-edari-trees'),
  getAutoSyncState: () => ipcRenderer.invoke('get-auto-sync-state'),
  saveBackgroundSyncSettings: (patch) => ipcRenderer.invoke('save-background-sync-settings', patch),
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
