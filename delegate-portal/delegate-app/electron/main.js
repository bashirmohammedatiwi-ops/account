const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { request } = require('./api-client');

let mainWindow;
let serverUrl = 'http://127.0.0.1:4100';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Edari Delegate — كشف حساب',
    backgroundColor: '#0a0f1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'desktop', 'index.html'));

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'ملف',
      submenu: [
        { label: 'تحديث', accelerator: 'F5', click: () => mainWindow.webContents.send('menu:refresh') },
        { type: 'separator' },
        { role: 'quit', label: 'خروج' }
      ]
    },
    { label: 'عرض', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] }
  ]));
}

ipcMain.handle('cfg:get', () => ({ serverUrl }));

ipcMain.handle('cfg:set-server', (_e, url) => {
  serverUrl = String(url || '').trim() || serverUrl;
  return { ok: true, serverUrl };
});

async function apiGet(route) {
  return request(serverUrl, route);
}

ipcMain.handle('api:trees', () => apiGet('/api/delegate/trees'));
ipcMain.handle('api:children', (_e, seq) => apiGet(`/api/delegate/accounts/${seq}/children`));
ipcMain.handle('api:statement', (_e, seq) => apiGet(`/api/delegate/accounts/${seq}/statement`));
ipcMain.handle('api:search', (_e, q) => apiGet(`/api/delegate/search?q=${encodeURIComponent(q)}`));
ipcMain.handle('api:health', async () => {
  try {
    return await request(serverUrl, '/api/health');
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
