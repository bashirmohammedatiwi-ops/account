const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const accountsService = require('../lib/accounts-service');
const accountLabels = require('../lib/account-labels');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1280,
    minHeight: 760,
    title: 'Edari Accounts — دليل الحسابات',
    backgroundColor: '#0c1220',
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
        { label: 'تحديث البيانات', accelerator: 'F5', click: () => mainWindow.webContents.send('menu:refresh') },
        { type: 'separator' },
        { role: 'quit', label: 'خروج' }
      ]
    },
    { label: 'عرض', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] }
  ]));
}

ipcMain.handle('acc:status', () => accountsService.getStatus());
ipcMain.handle('acc:labels', () => accountLabels);
ipcMain.handle('acc:load', (e) => {
  const send = (p) => e.sender.send('acc:progress', p);
  return accountsService.loadAccounts(send);
});
ipcMain.handle('acc:stats', () => accountsService.getStats());
ipcMain.handle('acc:get', (_e, seq) => accountsService.getAccount(seq));
ipcMain.handle('acc:path', (_e, seq) => accountsService.getAccountPath(seq));
ipcMain.handle('acc:children', (_e, parentSeq) => accountsService.getChildren(parentSeq));
ipcMain.handle('acc:children-meta', (_e, parentSeq) => accountsService.getChildrenMeta(parentSeq));
ipcMain.handle('acc:descendants', (_e, parentSeq) => accountsService.getDescendants(parentSeq));
ipcMain.handle('acc:by-num', (_e, num) => accountsService.getAccountByNum(num));
ipcMain.handle('acc:statement', (_e, seq) => accountsService.getStatement(seq));
ipcMain.handle('acc:group-summary', (_e, parentSeq) => accountsService.getGroupSummary(parentSeq));
ipcMain.handle('acc:filter', (_e, q) => accountsService.filterAccounts(q));
ipcMain.handle('acc:export-csv', async (_e, { name, content }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: name,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, `\ufeff${content}`, 'utf8');
  return { ok: true, filePath };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
