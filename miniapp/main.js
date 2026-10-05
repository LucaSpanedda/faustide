// Faust IDE: native macOS shell (Electron) around the Faust Web IDE build (dist/)
const { app, BrowserWindow, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep the data of the previous launcher (files and settings saved by the IDE)
app.setPath('userData', path.join(app.getPath('appData'), 'faustide-mini'));

// Audio, timers and meters must not slow down when the window is in the background
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// dist/ is copied inside the packaged app; when run with "npm start" use ../dist
const DIST = fs.existsSync(path.join(__dirname, 'dist', 'index.html'))
  ? path.join(__dirname, 'dist')
  : path.join(__dirname, '..', 'dist');

const BOUNDS_FILE = path.join(app.getPath('userData'), 'window-bounds.json');

let mainWindow = null;

function loadBounds() {
  try {
    return JSON.parse(fs.readFileSync(BOUNDS_FILE, 'utf8'));
  } catch (e) {
    return { width: 1400, height: 1000 };
  }
}

function saveBounds() {
  try {
    fs.writeFileSync(BOUNDS_FILE, JSON.stringify(mainWindow.getBounds()));
  } catch (e) {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    ...loadBounds(),
    minWidth: 800,
    minHeight: 500,
    show: false,
    backgroundColor: '#1e1e1e',
    title: 'Faust IDE',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  // show the window only when the first frame is ready (no white flash)
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // links to documentation etc. open in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(DIST, 'index.html'));

  mainWindow.on('close', saveBounds);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// only one instance: a second launch focuses the existing window
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // audio input and MIDI are always allowed
    const allowed = new Set(['media', 'midi', 'midiSysex', 'audioCapture', 'speaker-selection']);
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(allowed.has(permission)));
    session.defaultSession.setPermissionCheckHandler((wc, permission) => allowed.has(permission));
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());

  app.on('activate', () => {
    if (mainWindow === null) createWindow();
  });
}
