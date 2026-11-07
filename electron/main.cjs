'use strict';

const { app, BrowserWindow, ipcMain, nativeTheme, protocol, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {
  compareSemver,
  computeShellHash,
  httpsDownloadBuffer,
  quarantineLiveBundle,
  resolveActiveDist,
  unpackDistBundle,
} = require('./updater-core.cjs');

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch {
  autoUpdater = null;
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const GITHUB_OWNER = 'eclipsru';
const GITHUB_REPO = 'Mi-Kapital';
const RELEASES_PAGE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const LATEST_MANIFEST_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/app-update-manifest.json`;
const LATEST_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const UPDATE_EVENT = 'app:update:event';

const appRootDir = path.join(__dirname, '..');
const builtInDistDir = path.join(appRootDir, 'dist');
const builtInShellHash = (() => {
  try {
    return computeShellHash(appRootDir);
  } catch {
    return 'unknown';
  }
})();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webm': 'audio/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

let activeDistState = {
  mode: 'builtin',
  version: '1.0.0',
  distDir: builtInDistDir,
};
let pendingManifest = null;
let pendingInstallMode = null; // 'bundle' | 'installer' | null
let updateBusy = false;
let bootConfirmed = false;
let bootWatchdog = null;

function refreshActiveDistState() {
  activeDistState = resolveActiveDist({
    builtInDistDir,
    builtInVersion: app.getVersion(),
    builtInShellHash,
    userDataDir: app.getPath('userData'),
  });
  return activeDistState;
}

function getEffectiveVersion() {
  return activeDistState.version || app.getVersion();
}

function broadcast(payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(UPDATE_EVENT, payload);
    }
  }
}

function configureNativeInstallerUpdater() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableWebInstaller = true;

  autoUpdater.on('checking-for-update', () => {
    if (pendingInstallMode === 'installer') broadcast({ type: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    pendingInstallMode = 'installer';
    broadcast({
      type: 'available',
      version: info && info.version,
      mode: 'installer',
    });
  });
  autoUpdater.on('update-not-available', () => {
    if (pendingInstallMode === 'installer') {
      pendingInstallMode = null;
      broadcast({ type: 'none', version: getEffectiveVersion() });
    }
  });
  autoUpdater.on('download-progress', (progress) => {
    broadcast({
      type: 'progress',
      percent: Math.round(progress.percent || 0),
      transferred: progress.transferred || 0,
      total: progress.total || 0,
      mode: 'installer',
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    pendingInstallMode = 'installer';
    updateBusy = false;
    broadcast({
      type: 'downloaded',
      version: (info && info.version) || (pendingManifest && pendingManifest.version),
      mode: 'installer',
    });
  });
  autoUpdater.on('error', (error) => {
    updateBusy = false;
    broadcast({
      type: 'error',
      message: (error && error.message) || String(error),
    });
  });
}

async function fetchRemoteManifest() {
  try {
    const buf = await httpsDownloadBuffer(`${LATEST_MANIFEST_URL}?t=${Date.now()}`, {
      headers: { Accept: 'application/json' },
    });
    return JSON.parse(buf.toString('utf8'));
  } catch {
    const apiBuf = await httpsDownloadBuffer(LATEST_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    const release = JSON.parse(apiBuf.toString('utf8'));
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const manifestAsset = assets.find((item) => item && item.name === 'app-update-manifest.json');
    if (!manifestAsset || !manifestAsset.browser_download_url) {
      return {
        version: String(release.tag_name || '').replace(/^v/i, ''),
        tag: release.tag_name,
        shellHash: 'force-installer',
      };
    }
    const buf = await httpsDownloadBuffer(manifestAsset.browser_download_url, {
      headers: { Accept: 'application/json' },
    });
    return JSON.parse(buf.toString('utf8'));
  }
}

async function downloadHotBundle(manifest) {
  const tag = manifest.tag || `v${manifest.version}`;
  const bundleUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(manifest.bundleFile)}`;
  broadcast({
    type: 'progress',
    percent: 0,
    transferred: 0,
    total: Number(manifest.bundleSize || 0),
    mode: 'bundle',
  });
  const pakBuffer = await httpsDownloadBuffer(bundleUrl, {
    onProgress: ({ percent, transferred, total }) => {
      broadcast({
        type: 'progress',
        percent,
        transferred,
        total: total || Number(manifest.bundleSize || 0),
        mode: 'bundle',
      });
    },
  });

  const liveBundleRoot = path.join(app.getPath('userData'), 'live-bundle');
  unpackDistBundle(pakBuffer, manifest.bundleSha256, liveBundleRoot, {
    expectedShellHash: builtInShellHash,
  });

  pendingInstallMode = 'bundle';
  updateBusy = false;
  broadcast({
    type: 'downloaded',
    version: manifest.version,
    mode: 'bundle',
    totalBytes: pakBuffer.length,
  });
}

async function checkAndDownloadUpdates() {
  if (updateBusy) return { ok: true, busy: true, version: getEffectiveVersion() };
  updateBusy = true;
  broadcast({ type: 'checking' });

  try {
    const manifest = await fetchRemoteManifest();
    const currentVersion = getEffectiveVersion();

    if (!manifest || !manifest.version || compareSemver(manifest.version, currentVersion) <= 0) {
      updateBusy = false;
      pendingManifest = null;
      pendingInstallMode = null;
      broadcast({ type: 'none', version: currentVersion });
      return { ok: true, available: false, version: currentVersion };
    }

    pendingManifest = manifest;

    // Fast path (99% of updates): only web UI / business logic changed — download ~130 KB bundle!
    if (
      manifest.shellHash === builtInShellHash &&
      manifest.bundleFile &&
      manifest.bundleSha256
    ) {
      broadcast({
        type: 'available',
        version: manifest.version,
        mode: 'bundle',
        totalBytes: Number(manifest.bundleSize || 0),
      });
      await downloadHotBundle(manifest);
      return {
        ok: true,
        available: true,
        mode: 'bundle',
        version: manifest.version,
      };
    }

    // Native shell changed: use electron-updater differential blockmap downloader.
    if (autoUpdater && app.isPackaged) {
      pendingInstallMode = 'installer';
      await autoUpdater.checkForUpdates();
      return {
        ok: true,
        available: true,
        mode: 'installer',
        version: manifest.version,
      };
    }

    updateBusy = false;
    broadcast({
      type: 'available',
      version: manifest.version,
      mode: 'manual',
    });
    return { ok: true, available: true, mode: 'manual', version: manifest.version };
  } catch (error) {
    updateBusy = false;
    const message = (error && error.message) || 'Не удалось проверить обновления';
    broadcast({ type: 'error', message });
    return { ok: false, reason: message };
  }
}

ipcMain.on('app:boot:ready', () => {
  bootConfirmed = true;
  if (bootWatchdog) {
    clearTimeout(bootWatchdog);
    bootWatchdog = null;
  }
});

ipcMain.handle('app:update:info', () => ({
  supported: true,
  isPackaged: app.isPackaged,
  version: getEffectiveVersion(),
  shellVersion: app.getVersion(),
  deliveryMode: activeDistState.mode,
}));

ipcMain.handle('app:update:check', async () => checkAndDownloadUpdates());

ipcMain.handle('app:update:download', async () => {
  if (pendingManifest && pendingManifest.shellHash === builtInShellHash && pendingManifest.bundleFile) {
    try {
      updateBusy = true;
      await downloadHotBundle(pendingManifest);
      return { ok: true };
    } catch (error) {
      updateBusy = false;
      const message = (error && error.message) || 'Не удалось скачать пакет обновления';
      broadcast({ type: 'error', message });
      return { ok: false, reason: message };
    }
  }
  if (autoUpdater && app.isPackaged) {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: (error && error.message) || 'Не удалось скачать обновление' };
    }
  }
  return checkAndDownloadUpdates();
});

ipcMain.handle('app:update:install', () => {
  if (pendingInstallMode === 'bundle') {
    const nextState = refreshActiveDistState();
    pendingInstallMode = null;
    pendingManifest = null;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        startBootWatchdog(win);
        win.webContents.reloadIgnoringCache();
      }
    }
    broadcast({ type: 'applied', version: nextState.version });
    return { ok: true, mode: 'bundle', version: nextState.version };
  }
  if (autoUpdater && app.isPackaged && pendingInstallMode === 'installer') {
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { ok: true, mode: 'installer' };
  }
  return { ok: false, reason: 'Нет готового к установке обновления' };
});

ipcMain.handle('app:update:open-release', async () => {
  await shell.openExternal(RELEASES_PAGE_URL);
  return { ok: true };
});

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    try {
      const parsed = new URL(request.url);
      let relPath = decodeURIComponent(parsed.pathname || '/');
      if (relPath === '/' || !relPath) relPath = '/index.html';

      const baseDir = path.resolve(activeDistState.distDir);
      let filePath = path.resolve(baseDir, `.${relPath}`);
      if (!filePath.startsWith(baseDir + path.sep) && filePath !== path.join(baseDir, 'index.html')) {
        return new Response('Forbidden', { status: 403 });
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        if (!path.extname(relPath)) {
          filePath = path.join(baseDir, 'index.html');
        } else {
          return new Response('Not Found', { status: 404 });
        }
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const data = fs.readFileSync(filePath);
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-store',
        },
      });
    } catch {
      return new Response('Internal Error', { status: 500 });
    }
  });
}

function startBootWatchdog(win) {
  bootConfirmed = false;
  if (bootWatchdog) clearTimeout(bootWatchdog);
  if (activeDistState.mode !== 'live-bundle') return;
  bootWatchdog = setTimeout(() => {
    if (!bootConfirmed && !win.isDestroyed()) {
      quarantineLiveBundle(app.getPath('userData'));
      refreshActiveDistState();
      win.webContents.reloadIgnoringCache();
    }
  }, 8000);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1540,
    height: 960,
    minWidth: 380,
    minHeight: 640,
    title: 'Мой капитал',
    icon: path.join(appRootDir, 'assets', 'icon.png'),
    backgroundColor: '#0B0D11',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.on('did-fail-load', () => {
    if (activeDistState.mode === 'live-bundle') {
      quarantineLiveBundle(app.getPath('userData'));
      refreshActiveDistState();
      window.loadURL('app://mi-kapital/index.html');
    }
  });

  startBootWatchdog(window);
  window.loadURL('app://mi-kapital/index.html');
}

app.whenReady().then(() => {
  // Strictly dark theme matching Arenda-Nvk screenshot — never light.
  nativeTheme.themeSource = 'dark';
  refreshActiveDistState();
  registerAppProtocol();
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || permission === 'audioCapture');
  });
  configureNativeInstallerUpdater();
  createWindow();

  // Automatically check for updates shortly after launch and every 30 minutes.
  const runScheduledCheck = () => {
    checkAndDownloadUpdates().catch(() => undefined);
  };
  setTimeout(runScheduledCheck, 3000);
  setInterval(runScheduledCheck, 30 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
