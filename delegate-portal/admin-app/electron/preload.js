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
  onSyncProgress: (handler) => {
    const listener = (_event, line) => handler(line);
    ipcRenderer.on('sync-progress', listener);
    return () => ipcRenderer.removeListener('sync-progress', listener);
  }
});
