const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const dataService = require('../lib/data-service');

let mainWindow;

process.on('uncaughtException', (err) => {
  dialog.showErrorBox('Edari Desktop — خطأ', err.message || String(err));
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: 'Edari Desktop — قارئ إداري',
    backgroundColor: '#0f1419',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'desktop', 'index.html'));

  const menu = Menu.buildFromTemplate([
    {
      label: 'ملف',
      submenu: [
        {
          label: 'تحديث كل البيانات',
          accelerator: 'F5',
          click: () => mainWindow.webContents.send('menu:refresh')
        },
        { type: 'separator' },
        {
          label: 'خروج',
          accelerator: 'Alt+F4',
          role: 'quit'
        }
      ]
    },
    {
      label: 'عرض',
      submenu: [
        { role: 'reload', label: 'إعادة تحميل الواجهة' },
        { role: 'toggleDevTools', label: 'أدوات المطور' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'حجم طبيعي' },
        { role: 'zoomIn', label: 'تكبير' },
        { role: 'zoomOut', label: 'تصغير' }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);
}

ipcMain.handle('app:status', async () => dataService.getStatus());

ipcMain.handle('app:field-labels', async () => dataService.getFieldLabels());

ipcMain.handle('app:set-connection', async (_e, conn) => {
  dataService.setConnection(conn);
  return dataService.getStatus();
});

ipcMain.handle('app:sync-all', async (event) => {
  const send = (payload) => {
    event.sender.send('sync:progress', payload);
  };
  return dataService.syncEssential(send);
});

ipcMain.handle('app:sync-section', async (event, section) => {
  const send = (payload) => event.sender.send('sync:progress', payload);
  return dataService.syncSection(section, send);
});

ipcMain.handle('app:get-section', async (_e, section) => ({
  data: dataService.getSection(section),
  meta: dataService.syncMeta[section] || null
}));

ipcMain.handle('app:page-rows', async (_e, opts) => dataService.pageOrLive(opts.section, opts));

ipcMain.handle('app:query-live', async (_e, opts) => dataService.queryLive(opts.section, opts));

ipcMain.handle('app:item-detail', async (_e, seq) => dataService.getItemDetail(seq));

ipcMain.handle('app:invoice-lines', async (_e, seq) => dataService.getInvoiceLines(seq));

ipcMain.handle('app:receipt-items', async (_e, id) => dataService.getReceiptItems(id));

ipcMain.handle('app:materials-children', async (_e, parent) => dataService.getMaterialsChildren(parent));

ipcMain.handle('app:export-csv', async (_e, { defaultName, content }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'حفظ ملف CSV',
    defaultPath: defaultName,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, `\ufeff${content}`, 'utf8');
  return { ok: true, filePath };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
