'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const https = require('node:https');
const http = require('node:http');
const semver = require('semver');
const MAX_FILE = 20 * 1024 * 1024;
const MAX_TOTAL = 80 * 1024 * 1024;
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
function compare(a, b) { const x = semver.valid(a); const y = semver.valid(b); if (!x || !y) throw new Error('Некорректная версия обновления'); return semver.compare(x, y); }
function shellHash(root, electronVersion = process.versions.electron) {
  const h = crypto.createHash('sha256');
  h.update(`mi-kapital-shell-2:${electronVersion}\0`);
  for (const name of fs.readdirSync(path.join(root, 'electron')).filter(n => n.endsWith('.cjs')).sort()) {
    h.update(name); h.update('\0'); h.update(fs.readFileSync(path.join(root, 'electron', name), 'utf8').replace(/\r\n/g, '\n')); h.update('\0');
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  h.update(JSON.stringify(pkg.dependencies || {}));
  return h.digest('hex');
}
function filesIn(root, relative = '') {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    return entry.isDirectory() ? filesIn(root, rel) : entry.isFile() ? [rel] : [];
  });
}
function safePath(rel) {
  if (typeof rel !== 'string' || !rel || rel.length > 240 || /[\\\x00-\x1f]/.test(rel) || /^[a-z]:/i.test(rel) || rel.startsWith('/') || rel.split('/').some(s => !s || s === '.' || s === '..')) throw new Error('Небезопасный путь в обновлении');
  return rel;
}
function describeDist(root) {
  const files = filesIn(root).map(rel => { const buffer = fs.readFileSync(path.join(root, rel)); return { path: safePath(rel), size: buffer.length, sha256: hash(buffer) }; });
  if (!files.some(f => f.path === 'index.html')) throw new Error('В сборке нет index.html');
  return files;
}
function validateManifest(value, expectedShell) {
  if (!value || value.format !== 'mi-kapital-update-2' || !semver.valid(value.version) || !/^v\d+\.\d+\.\d+$/.test(value.tag || '') || value.tag !== `v${value.version}` || !Array.isArray(value.files) || !value.files.length || value.files.length > 500) throw new Error('Неверный формат манифеста обновления');
  if (expectedShell && value.shellHash !== expectedShell) { const e = new Error('Требуется обновление оболочки'); e.code = 'SHELL_CHANGED'; throw e; }
  if (!/^[a-f0-9]{64}$/.test(value.shellHash || '')) throw new Error('Неверная подпись оболочки');
  let total = 0; const paths = new Set();
  for (const file of value.files) {
    safePath(file.path);
    if (paths.has(file.path) || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FILE || !/^[a-f0-9]{64}$/.test(file.sha256 || '') || file.asset !== `update-${file.sha256}.gz`) throw new Error('Повреждено описание файла обновления');
    paths.add(file.path); total += file.size;
  }
  if (total > MAX_TOTAL || !paths.has('index.html')) throw new Error('Недопустимый состав обновления');
  return value;
}
function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeFileSync(fd, content); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
function activeBundle(userData, builtinRoot, builtinVersion, expectedShell) {
  const file = path.join(userData, 'updates', 'active.json');
  try {
    const pointer = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (pointer.quarantined || pointer.shellHash !== expectedShell || compare(pointer.version, builtinVersion) <= 0) return { root: builtinRoot, version: builtinVersion, live: false };
    const root = path.resolve(path.join(userData, 'updates', 'bundles', pointer.version));
    if (!root.startsWith(path.resolve(path.join(userData, 'updates', 'bundles')) + path.sep)) throw new Error('Unsafe bundle');
    const manifest = validateManifest(JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')), expectedShell);
    if (manifest.version !== pointer.version) throw new Error('Version mismatch');
    for (const entry of manifest.files) { const buffer = fs.readFileSync(path.join(root, 'dist', entry.path)); if (buffer.length !== entry.size || hash(buffer) !== entry.sha256) throw new Error('Bundle integrity'); }
    return { root, version: pointer.version, live: true };
  } catch { return { root: builtinRoot, version: builtinVersion, live: false }; }
}
function quarantine(userData) {
  const file = path.join(userData, 'updates', 'active.json');
  if (fs.existsSync(file)) { try { const p = JSON.parse(fs.readFileSync(file, 'utf8')); p.quarantined = true; atomicWrite(file, JSON.stringify(p)); } catch { fs.rmSync(file, { force: true }); } }
}
function stageBundle(userData, builtinRoot, manifest, expectedShell) {
  validateManifest(manifest, expectedShell);
  const base = path.join(userData, 'updates');
  const cache = path.join(base, 'cache');
  const builtin = Object.fromEntries(describeDist(builtinRoot).map(f => [f.sha256, path.join(builtinRoot, f.path)]));
  const target = path.join(base, 'bundles', manifest.version);
  const staging = path.join(base, `staging-${process.pid}-${Date.now()}`);
  try {
    for (const file of manifest.files) {
      const dest = path.join(staging, 'dist', file.path);
      if (!dest.startsWith(path.join(staging, 'dist') + path.sep)) throw new Error('Path traversal');
      const candidates = [path.join(cache, file.sha256), builtin[file.sha256]].filter(Boolean);
      let content;
      for (const candidate of candidates) { try { const b = fs.readFileSync(candidate); if (b.length === file.size && hash(b) === file.sha256) { content = b; break; } } catch {} }
      if (!content) throw new Error(`Не загружен файл ${file.path}`);
      fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, content);
    }
    fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(manifest));
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.renameSync(staging, target);
    return target;
  } catch (error) { fs.rmSync(staging, { recursive: true, force: true }); throw error; }
}
function activate(userData, manifest, expectedShell) {
  atomicWrite(path.join(userData, 'updates', 'active.json'), JSON.stringify({ version: manifest.version, shellHash: expectedShell, quarantined: false, installedAt: new Date().toISOString() }));
}
function receiveFile(userData, file, compressed) {
  if (compressed.length > MAX_FILE) throw new Error('Файл обновления слишком большой');
  const buffer = zlib.gunzipSync(compressed, { maxOutputLength: MAX_FILE });
  if (buffer.length !== file.size || hash(buffer) !== file.sha256) throw new Error('Контрольная сумма файла не совпадает');
  atomicWrite(path.join(userData, 'updates', 'cache', file.sha256), buffer);
}
function allowedHost(hostname) { return ['github.com', 'api.github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com'].includes(hostname.toLowerCase()); }
function download(url, onProgress = () => {}, options = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    let parsed; try { parsed = new URL(url); } catch { reject(new Error('Неверный адрес обновления')); return; }
    const localTest = options.testServer && ['127.0.0.1', 'localhost'].includes(parsed.hostname) && parsed.protocol === 'http:';
    if (!(parsed.protocol === 'https:' && allowedHost(parsed.hostname)) && !localTest) { reject(new Error('Загрузка разрешена только с GitHub')); return; }
    if (redirects > 6) { reject(new Error('Слишком много перенаправлений')); return; }
    const req = (localTest ? http : https).get(parsed, { headers: { 'User-Agent': 'Mi-Kapital/2', 'Cache-Control': 'no-cache', Accept: 'application/octet-stream' } }, res => {
      if ([301,302,303,307,308].includes(res.statusCode)) { res.resume(); if (!res.headers.location) return reject(new Error('Перенаправление без адреса')); download(new URL(res.headers.location, parsed).toString(), onProgress, options, redirects + 1).then(resolve, reject); return; }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`GitHub вернул HTTP ${res.statusCode}`)); return; }
      const total = Number(res.headers['content-length'] || 0); let size = 0; const chunks = [];
      res.on('data', chunk => { size += chunk.length; if (size > MAX_FILE) { req.destroy(new Error('Обновление превышает допустимый размер')); return; } chunks.push(chunk); onProgress(size, total); });
      res.on('end', () => resolve(Buffer.concat(chunks))); res.on('error', reject);
    });
    req.setTimeout(options.timeout || 30000, () => req.destroy(new Error('Время ожидания GitHub истекло'))); req.on('error', reject);
  });
}
module.exports = { hash, compare, shellHash, filesIn, safePath, describeDist, validateManifest, atomicWrite, activeBundle, quarantine, stageBundle, activate, receiveFile, download, MAX_FILE, MAX_TOTAL };
