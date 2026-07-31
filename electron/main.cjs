/**
 * Окно настольной игры.
 *
 * Обычный CommonJS без сборки: главный процесс Electron состоит из полусотни
 * строк, и городить для них отдельный конвейер незачем.
 *
 * Игра полностью офлайн. Здесь это не пожелание, а настройка: навигация наружу
 * и любые новые окна запрещены жёстко, ниже по файлу.
 */

const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('node:path');

/** Пропорции макета — окно открывается ровно в них. */
const WIDTH = 1609;
const HEIGHT = 918;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: Math.round((1280 * HEIGHT) / WIDTH) + 28,
    minWidth: 960,
    minHeight: Math.round((960 * HEIGHT) / WIDTH),
    backgroundColor: '#0a0510',
    title: 'GAINS & CHAINS',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      // Игре нечего делать в Node: она рисует картинки и считает числа.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // Полный экран переключается здесь, а не через браузерный API: тот требует
  // доверенного жеста и в упакованном приложении срабатывает не всегда.
  ipcMain.handle('toggle-fullscreen', () => {
    const target = !win.isFullScreen();
    win.setFullScreen(target);
    return target;
  });

  // Меню не нужно — оно только отъедает высоту у полноэкранной картинки.
  Menu.setApplicationMenu(null);

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Наружу не ходим. Если в игре когда-нибудь появится ссылка, она откроется
  // в системном браузере, а не подменит собой окно игры.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  return win;
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
