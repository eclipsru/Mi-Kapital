'use strict';
const { app, BrowserWindow, ipcMain, protocol, session, shell, dialog, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { autoUpdater } = require('electron-updater');
const core = require('./update-core.cjs');
const { createStore } = require('./store.cjs');
const ROOT = path.join(__dirname, '..');
const BUILTIN = path.join(ROOT, 'dist');
const REPO = 'https://github.com/eclipsru/Mi-Kapital';
const SHELL = core.shellHash(ROOT);
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2', '.json':'application/json; charset=utf-8', '.ico':'image/x-icon' };
let win, active, store, watchdog, pending, busy = false;
let state = { phase:'idle', version:app.getVersion(), shellVersion:app.getVersion(), mode:'none', percent:0, transferred:0, total:0, packaged:app.isPackaged };
let nativeDownloaded = false;
let quitting = false;
const configuredTestServer = process.env.MIKAPITAL_TEST_SERVER || '';
if (configuredTestServer) { const u = new URL(configuredTestServer); if (u.protocol !== 'http:' || !['127.0.0.1','localhost'].includes(u.hostname)) throw new Error('Test feed must use loopback HTTP'); }
const testServer = configuredTestServer;
const feed = testServer ? `${testServer}/update-manifest.json` : `${REPO}/releases/latest/download/update-manifest.json`;
protocol.registerSchemesAsPrivileged([{ scheme:'app', privileges:{ standard:true, secure:true, supportFetchAPI:true, corsEnabled:true, stream:true } }]);
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
function emit(patch) { state = { ...state, ...patch }; if (win && !win.isDestroyed()) win.webContents.send('updates:state', state); }
function bootWatch() {
  clearTimeout(watchdog);
  if (!active?.live) return;
  watchdog = setTimeout(() => { if (win && !win.isDestroyed()) { core.quarantine(app.getPath('userData')); active = core.activeBundle(app.getPath('userData'), BUILTIN, app.getVersion(), SHELL); emit({ version:active.version, phase:'idle' }); win.reload(); } }, 15000);
}
function trusted(event) { return win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame?.url.startsWith('app://mi-kapital/'); }
function registerProtocol() {
  protocol.handle('app', request => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'mi-kapital') { if (testServer) console.log('Protocol host mismatch:', request.url); return new Response('Not found', { status:404 }); }
      const rel = core.safePath(decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html');
      const file = path.resolve(active.root, rel);
      if (!file.startsWith(path.resolve(active.root) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        if (testServer) console.log('Protocol file unavailable:', JSON.stringify({ url:request.url, root:active.root, file, exists:fs.existsSync(file) }));
        return new Response('Not found', { status:404 });
      }
      return new Response(fs.readFileSync(file), { headers:{ 'Content-Type':MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' } });
    } catch { return new Response('Bad request', { status:400 }); }
  });
}
function configureNative() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.disableWebInstaller = true;
  if (testServer) { autoUpdater.setFeedURL({ provider:'generic', url:testServer }); autoUpdater.previousBlockmapBaseUrlOverride = testServer; }
  autoUpdater.on('download-progress', p => emit({ phase:'downloading', mode:'native', percent:Math.round(p.percent), transferred:p.transferred, total:p.total }));
  autoUpdater.on('update-downloaded', info => { nativeDownloaded = true; busy = false; emit({ phase:'ready', mode:'native', targetVersion:info.version, percent:100 }); });
  autoUpdater.on('error', error => { busy = false; emit({ phase:'error', message:`Обновление не установлено: ${error.message}. Ваши данные сохранены.` }); });
}
async function checkUpdates() {
  if (busy) return;
  if (nativeDownloaded) { emit({ phase:'ready', mode:'native' }); return; }
  busy = true; pending = null;
  emit({ phase:'checking', message:undefined, percent:0, transferred:0, total:0 });
  try {
    const manifest = JSON.parse((await core.download(feed, () => {}, { testServer:!!testServer })).toString('utf8'));
    if (!manifest || !core.compare(manifest.version, '0.0.0')) throw new Error('Неверная версия');
    if (core.compare(manifest.version, active.version) <= 0) { busy = false; emit({ phase:'idle', targetVersion:undefined, checkedAt:new Date().toISOString(), message:'У вас актуальная версия' }); return; }
    emit({ phase:'available', targetVersion:manifest.version });
    try { core.validateManifest(manifest, SHELL); }
    catch (error) {
      if (error.code !== 'SHELL_CHANGED') throw error;
      if (!app.isPackaged) throw new Error('Для обновления оболочки нужна установленная Windows-версия');
      emit({ phase:'downloading', mode:'native', targetVersion:manifest.version });
      // CI includes the previous shell's blockmap under its original filename in this release.
      // GitHub asset URLs are immutable per tag; looking for an old filename in a new tag otherwise returns 404.
      const result = await autoUpdater.checkForUpdates();
      if (!result?.updateInfo || core.compare(result.updateInfo.version, active.version) <= 0) throw new Error('Установщик новой версии пока не опубликован');
      await autoUpdater.downloadUpdate();
      return;
    }
    const known = new Set(core.describeDist(BUILTIN).map(f => f.sha256));
    const userData = app.getPath('userData');
    for (const f of manifest.files) { const cache = path.join(userData, 'updates', 'cache', f.sha256); try { if (core.hash(fs.readFileSync(cache)) === f.sha256) known.add(f.sha256); } catch {} }
    const missing = manifest.files.filter(f => !known.has(f.sha256));
    const total = missing.reduce((n,f) => n + f.size, 0);
    let transferred = 0;
    const compressedSizes = new Map();
    pending = manifest;
    emit({ phase:'downloading', mode:'files', targetVersion:manifest.version, total, files:missing.length });
    const base = testServer || `${REPO}/releases/download/${manifest.tag}`;
    for (const file of missing) {
      const compressed = await core.download(`${base}/${file.asset}`, (current, length) => { if (length) compressedSizes.set(file.sha256, length); const estimated = [...compressedSizes.values()].reduce((a,b)=>a+b,0); emit({ transferred:Math.min(current, file.size), percent:total ? Math.min(99, Math.round((transferred + Math.min(current, file.size)) / total * 100)) : 0, message:`Загружено ${(estimated/1024).toFixed(1)} КБ сжатых изменений` }); }, { testServer:!!testServer });
      core.receiveFile(userData, file, compressed);
      transferred += file.size;
      emit({ transferred, percent:total ? Math.round(transferred / total * 100) : 100 });
    }
    core.stageBundle(userData, BUILTIN, manifest, SHELL);
    busy = false;
    emit({ phase:'ready', mode:'files', percent:100, targetVersion:manifest.version, message:missing.length ? 'Загружены только изменившиеся файлы' : 'Обновление уже загружено' });
  } catch (error) { busy = false; pending = null; emit({ phase:'error', message:`Не удалось обновиться: ${error.message}. Попробуйте ещё раз; данные останутся на месте.` }); }
}
async function installUpdate() {
  if (state.phase !== 'ready') return { ok:false, message:'Сначала проверьте и загрузите обновление' };
  try {
    await store.flush();
    if (state.mode === 'files' && pending) {
      core.activate(app.getPath('userData'), pending, SHELL);
      active = core.activeBundle(app.getPath('userData'), BUILTIN, app.getVersion(), SHELL);
      pending = null; nativeDownloaded = false;
      emit({ version:active.version, phase:'idle', targetVersion:undefined, checkedAt:new Date().toISOString(), message:'Обновление установлено. Данные сохранены.' });
      bootWatch(); win.reload();
    } else if (state.mode === 'native' && nativeDownloaded && app.isPackaged) {
      quitting = true; clearTimeout(watchdog);
      setImmediate(() => autoUpdater.quitAndInstall(true, true));
    } else return { ok:false, message:'Обновление ещё не готово' };
    return { ok:true };
  } catch (error) { return { ok:false, message:error.message }; }
}
function createWindow() {
  win = new BrowserWindow({ width:1440, height:960, minWidth:760, minHeight:600, title:'Мой капитал', icon:path.join(ROOT,'assets/icon.png'), backgroundColor:'#0B0D11', show:false, autoHideMenuBar:true, webPreferences:{ preload:path.join(__dirname,'preload.cjs'), contextIsolation:true, nodeIntegration:false, sandbox:true } });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action:'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('did-fail-load', (_e, code, _description, _url, isMainFrame) => { if (isMainFrame && code !== -3 && active.live) { core.quarantine(app.getPath('userData')); active = core.activeBundle(app.getPath('userData'),BUILTIN,app.getVersion(),SHELL); win.loadURL('app://mi-kapital/index.html'); } });
  win.on('close', event => { if (!quitting) { event.preventDefault(); store.flush().catch(() => undefined).finally(() => { quitting = true; win.close(); }); } });
  win.on('closed', () => { win = null; });
  bootWatch(); win.loadURL('app://mi-kapital/index.html');
}
app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  store = createStore(app.getPath('userData'));
  active = core.activeBundle(app.getPath('userData'), BUILTIN, app.getVersion(), SHELL);
  state.version = active.version;
  registerProtocol();
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback) => callback(false));
  ipcMain.handle('info', event => trusted(event) ? state : Promise.reject(new Error('Forbidden')));
  ipcMain.handle('updates:check', event => trusted(event) ? checkUpdates() : Promise.reject(new Error('Forbidden')));
  ipcMain.handle('updates:install', event => trusted(event) ? installUpdate() : Promise.reject(new Error('Forbidden')));
  ipcMain.handle('updates:releases', async event => { if (!trusted(event)) throw new Error('Forbidden'); await shell.openExternal(`${REPO}/releases/latest`); });
  ipcMain.handle('data:load', event => trusted(event) ? store.load() : Promise.reject(new Error('Forbidden')));
  ipcMain.handle('data:save', (event, data) => trusted(event) ? store.save(data) : Promise.reject(new Error('Forbidden')));
  ipcMain.handle('data:export', async (event, json) => {
    if (!trusted(event) || typeof json !== 'string' || Buffer.byteLength(json) > 15000000) throw new Error('Forbidden');
    const result = await dialog.showSaveDialog(win, { title:'Сохранить резервную копию', defaultPath:`Mi-Kapital-${new Date().toISOString().slice(0,10)}.json`, filters:[{ name:'Резервная копия JSON', extensions:['json'] }] });
    if (result.canceled || !result.filePath) return false;
    core.atomicWrite(result.filePath, json);
    return true;
  });
  ipcMain.on('boot:ready', event => { if (trusted(event)) clearTimeout(watchdog); });
  configureNative(); createWindow();
  if (!process.env.MIKAPITAL_TEST_NO_AUTO) { setTimeout(() => checkUpdates(), 5000); setInterval(() => checkUpdates(), 30 * 60 * 1000); }
}).catch(error => { dialog.showErrorBox('Мой капитал', error.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
