'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const zlib = require('node:zlib');

const MAGIC = Buffer.from('MIKAP01\0', 'ascii');
const MAX_UNPACKED_BYTES = 50 * 1024 * 1024;
const ALLOWED_DOWNLOAD_HOSTS = [
  'github.com',
  'api.github.com',
  'githubusercontent.com',
];

function isAllowedHost(hostname) {
  const lower = String(hostname || '').toLowerCase();
  return ALLOWED_DOWNLOAD_HOSTS.some((domain) => lower === domain || lower.endsWith(`.${domain}`));
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseSemver(version) {
  const cleaned = String(version || '').trim().replace(/^v/i, '');
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(cleaned);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa && !pb) return String(a).localeCompare(String(b));
  if (!pa) return -1;
  if (!pb) return 1;
  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
  if (pa.prerelease.length === 0 && pb.prerelease.length === 0) return 0;
  if (pa.prerelease.length === 0) return 1;
  if (pb.prerelease.length === 0) return -1;
  const len = Math.max(pa.prerelease.length, pb.prerelease.length);
  for (let i = 0; i < len; i += 1) {
    const ia = pa.prerelease[i];
    const ib = pb.prerelease[i];
    if (ia === undefined) return -1;
    if (ib === undefined) return 1;
    if (ia === ib) continue;
    const na = /^\d+$/.test(ia) ? Number(ia) : null;
    const nb = /^\d+$/.test(ib) ? Number(ib) : null;
    if (na !== null && nb !== null) return na > nb ? 1 : -1;
    if (na !== null) return -1;
    if (nb !== null) return 1;
    return ia > ib ? 1 : -1;
  }
  return 0;
}

const SHELL_ABI_GENERATION = 'electron-45-shell-v1';

function computeShellHash(appRootDir) {
  const hash = crypto.createHash('sha256');
  hash.update(`ABI:${SHELL_ABI_GENERATION}\n`);
  const shellFiles = [
    'electron/main.cjs',
    'electron/preload.cjs',
    'electron/updater-core.cjs',
  ];
  for (const rel of shellFiles) {
    const full = path.join(appRootDir, rel);
    const text = fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
    hash.update(`FILE:${rel}\n${text}\n`);
  }
  return hash.digest('hex').slice(0, 24);
}

function collectFilesRecursive(baseDir, currentRel = '') {
  const results = [];
  const entries = fs.readdirSync(path.join(baseDir, currentRel), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const nextRel = currentRel ? `${currentRel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursive(baseDir, nextRel));
    } else if (entry.isFile()) {
      results.push(nextRel);
    }
  }
  return results;
}

function validateRelativeBundlePath(relPath) {
  if (typeof relPath !== 'string' || !relPath.trim()) {
    throw new Error('Empty path in update bundle');
  }
  if (relPath.startsWith('/') || relPath.includes('\\') || relPath.includes('\0') || /^[a-zA-Z]:/.test(relPath)) {
    throw new Error(`Unsafe path in update bundle: ${relPath}`);
  }
  const segments = relPath.split('/');
  if (segments.some((seg) => !seg || seg === '.' || seg === '..')) {
    throw new Error(`Invalid path segment in update bundle: ${relPath}`);
  }
}

function packDistBundle(distDir, meta) {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error(`dist/index.html not found in ${distDir}`);
  }
  const relPaths = collectFilesRecursive(distDir);
  const fileMeta = [];
  const chunks = [];
  for (const relPath of relPaths) {
    validateRelativeBundlePath(relPath);
    const data = fs.readFileSync(path.join(distDir, relPath));
    fileMeta.push({
      path: relPath,
      size: data.length,
      sha256: sha256Hex(data),
    });
    chunks.push(data);
  }
  const headerJson = Buffer.from(JSON.stringify({
    format: 1,
    version: String(meta.version),
    shellHash: String(meta.shellHash),
    createdAt: meta.createdAt || new Date().toISOString(),
    files: fileMeta,
  }), 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(headerJson.length, 0);
  const rawArchive = Buffer.concat([MAGIC, lenBuf, headerJson, ...chunks]);
  const compressed = zlib.gzipSync(rawArchive, { level: 9 });
  return {
    buffer: compressed,
    sha256: sha256Hex(compressed),
    size: compressed.length,
    rawSize: rawArchive.length,
    fileCount: fileMeta.length,
  };
}

function unpackDistBundle(pakGzBuffer, expectedSha256, liveBundleRootDir, options = {}) {
  if (!Buffer.isBuffer(pakGzBuffer) || pakGzBuffer.length < 16) {
    const err = new Error('Повреждённый пакет обновления (пустой буфер)');
    err.code = 'ERR_BUNDLE_CORRUPT';
    throw err;
  }
  const actualSha = sha256Hex(pakGzBuffer);
  if (String(expectedSha256 || '').toLowerCase() !== actualSha.toLowerCase()) {
    const err = new Error('Контрольная сумма пакета обновления не совпадает');
    err.code = 'ERR_BUNDLE_CHECKSUM';
    throw err;
  }
  const raw = zlib.gunzipSync(pakGzBuffer, { maxOutputLength: MAX_UNPACKED_BYTES });
  if (raw.length < 12 || !raw.subarray(0, 8).equals(MAGIC)) {
    const err = new Error('Неверный заголовок пакета обновления');
    err.code = 'ERR_BUNDLE_MAGIC';
    throw err;
  }
  const headerLen = raw.readUInt32BE(8);
  if (12 + headerLen > raw.length) {
    const err = new Error('Повреждённые метаданные пакета обновления');
    err.code = 'ERR_BUNDLE_HEADER';
    throw err;
  }
  const header = JSON.parse(raw.subarray(12, 12 + headerLen).toString('utf8'));
  if (!header || header.format !== 1 || !Array.isArray(header.files) || !parseSemver(header.version)) {
    const err = new Error('Неподдерживаемый формат пакета обновления');
    err.code = 'ERR_BUNDLE_FORMAT';
    throw err;
  }
  if (options.expectedShellHash && header.shellHash !== options.expectedShellHash) {
    const err = new Error('Пакет требует обновления оболочки приложения');
    err.code = 'ERR_SHELL_MISMATCH';
    throw err;
  }

  const totalExpectedBytes = header.files.reduce((sum, item) => sum + Number(item.size || 0), 0);
  if (12 + headerLen + totalExpectedBytes !== raw.length) {
    const err = new Error('Размер файлов в пакете обновления не сходится');
    err.code = 'ERR_BUNDLE_SIZE';
    throw err;
  }

  const hasIndexHtml = header.files.some((item) => item.path === 'index.html');
  if (!hasIndexHtml) {
    const err = new Error('В пакете обновления отсутствует index.html');
    err.code = 'ERR_BUNDLE_NO_INDEX';
    throw err;
  }

  const parentDir = path.dirname(liveBundleRootDir);
  fs.mkdirSync(parentDir, { recursive: true });
  const stagingDir = `${liveBundleRootDir}-staging-${process.pid}-${Date.now()}`;
  const stagingDistDir = path.resolve(stagingDir, 'dist');
  fs.mkdirSync(stagingDistDir, { recursive: true });

  try {
    let offset = 12 + headerLen;
    for (const fileInfo of header.files) {
      validateRelativeBundlePath(fileInfo.path);
      const destPath = path.resolve(stagingDistDir, fileInfo.path);
      if (!destPath.startsWith(stagingDistDir + path.sep)) {
        throw new Error(`Path traversal blocked: ${fileInfo.path}`);
      }
      const slice = raw.subarray(offset, offset + fileInfo.size);
      offset += fileInfo.size;
      if (sha256Hex(slice) !== String(fileInfo.sha256).toLowerCase()) {
        const err = new Error(`Повреждён файл в пакете обновления: ${fileInfo.path}`);
        err.code = 'ERR_FILE_CHECKSUM';
        throw err;
      }
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, slice);
    }

    const manifest = {
      version: header.version,
      shellHash: header.shellHash,
      bundleSha256: actualSha,
      installedAt: new Date().toISOString(),
      quarantined: false,
    };
    fs.writeFileSync(path.join(stagingDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const backupDir = `${liveBundleRootDir}-old-${Date.now()}`;
    if (fs.existsSync(liveBundleRootDir)) {
      fs.renameSync(liveBundleRootDir, backupDir);
    }
    fs.renameSync(stagingDir, liveBundleRootDir);
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
    return manifest;
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

function resolveActiveDist({ builtInDistDir, builtInVersion, builtInShellHash, userDataDir }) {
  const liveRoot = path.join(userDataDir, 'live-bundle');
  const manifestPath = path.join(liveRoot, 'manifest.json');
  const liveDistDir = path.join(liveRoot, 'dist');
  try {
    if (fs.existsSync(manifestPath) && fs.existsSync(path.join(liveDistDir, 'index.html'))) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (
        manifest &&
        !manifest.quarantined &&
        manifest.shellHash === builtInShellHash &&
        compareSemver(manifest.version, builtInVersion) > 0
      ) {
        return {
          mode: 'live-bundle',
          version: manifest.version,
          distDir: liveDistDir,
          liveRoot,
        };
      }
      if (manifest && compareSemver(manifest.version, builtInVersion) <= 0) {
        fs.rmSync(liveRoot, { recursive: true, force: true });
      }
    }
  } catch {
    // Ignore corrupted local manifest and fall back safely to built-in dist.
  }
  return {
    mode: 'builtin',
    version: builtInVersion,
    distDir: builtInDistDir,
    liveRoot,
  };
}

function quarantineLiveBundle(userDataDir) {
  const manifestPath = path.join(userDataDir, 'live-bundle', 'manifest.json');
  try {
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.quarantined = true;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }
  } catch {
    fs.rmSync(path.join(userDataDir, 'live-bundle'), { recursive: true, force: true });
  }
}

function httpsDownloadBuffer(urlString, options = {}) {
  const maxRedirects = options.maxRedirects ?? 6;
  const allowCustomHost = Boolean(options.allowCustomHost);
  const timeoutMs = options.timeoutMs ?? 30000;

  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const client = parsed.protocol === 'http:' && allowCustomHost ? require('node:http') : https;
    if (!allowCustomHost && (parsed.protocol !== 'https:' || !isAllowedHost(parsed.hostname))) {
      reject(new Error(`Неразрешённый адрес загрузки обновления: ${parsed.origin}`));
      return;
    }

    const req = client.get(
      parsed,
      {
        headers: {
          'User-Agent': 'Mi-Kapital-Desktop-Updater',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          ...(options.headers || {}),
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          res.resume();
          if (maxRedirects <= 0) {
            reject(new Error('Слишком много перенаправлений при загрузке обновления'));
            return;
          }
          const nextUrl = new URL(res.headers.location, parsed).toString();
          httpsDownloadBuffer(nextUrl, { ...options, maxRedirects: maxRedirects - 1 }).then(resolve, reject);
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          const err = new Error(`HTTP ${status} при обращении к ${parsed.pathname}`);
          err.statusCode = status;
          reject(err);
          return;
        }

        const total = Number(res.headers['content-length'] || 0);
        let transferred = 0;
        const chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
          transferred += chunk.length;
          if (typeof options.onProgress === 'function') {
            const percent = total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0;
            options.onProgress({ percent, transferred, total });
          }
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Превышено время ожидания ответа от сервера обновлений'));
    });
    req.on('error', reject);
  });
}

module.exports = {
  MAGIC,
  compareSemver,
  computeShellHash,
  httpsDownloadBuffer,
  isAllowedHost,
  packDistBundle,
  parseSemver,
  quarantineLiveBundle,
  resolveActiveDist,
  sha256Hex,
  unpackDistBundle,
  validateRelativeBundlePath,
};
