import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const updater = require('../electron/updater-core.cjs');

const tempDirs: string[] = [];
function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('dual-engine in-app updater core', () => {
  it('compares SemVer versions accurately across 0.x and 1.0.x builds', () => {
    expect(updater.compareSemver('1.0.12', '0.2.2')).toBe(1);
    expect(updater.compareSemver('1.0.13', '1.0.12')).toBe(1);
    expect(updater.compareSemver('v1.0.12', '1.0.12')).toBe(0);
    expect(updater.compareSemver('1.0.0', '1.0.0-beta.1')).toBe(1);
    expect(updater.compareSemver('1.0.2', '1.0.10')).toBe(-1);
  });

  it('computes identical shellHash regardless of CRLF conversion or package.json stripping', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const fakeAsarRoot = makeTempDir('mikapital-asar-');
    fs.mkdirSync(path.join(fakeAsarRoot, 'electron'), { recursive: true });
    for (const file of ['main.cjs', 'preload.cjs', 'updater-core.cjs']) {
      const content = fs.readFileSync(path.join(repoRoot, 'electron', file), 'utf8');
      // Simulate Windows CRLF checkout inside packaged app
      fs.writeFileSync(path.join(fakeAsarRoot, 'electron', file), content.replace(/\n/g, '\r\n'));
    }
    // Simulate electron-builder stripping build & devDependencies from package.json
    fs.writeFileSync(
      path.join(fakeAsarRoot, 'package.json'),
      JSON.stringify({ name: 'mi-kapital', version: '1.0.99' }),
    );

    const buildTimeHash = updater.computeShellHash(repoRoot);
    const runtimeAsarHash = updater.computeShellHash(fakeAsarRoot);
    expect(runtimeAsarHash).toBe(buildTimeHash);

    // Modifying Electron main process must change shellHash so native NSIS differential updater is used
    fs.appendFileSync(path.join(fakeAsarRoot, 'electron', 'main.cjs'), '\n// shell change\n');
    expect(updater.computeShellHash(fakeAsarRoot)).not.toBe(buildTimeHash);
  });

  it('packs, verifies SHA-256, unpacks atomically, and resolves live-bundle over built-in dist', () => {
    const srcDist = makeTempDir('mikapital-dist-');
    fs.mkdirSync(path.join(srcDist, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(srcDist, 'index.html'), '<!doctype html><html><body>v1.0.15</body></html>');
    fs.writeFileSync(path.join(srcDist, 'assets', 'app.js'), 'console.log("updated bundle");');

    const packed = updater.packDistBundle(srcDist, {
      version: '1.0.15',
      shellHash: 'shell-abc123',
    });

    expect(packed.fileCount).toBe(2);
    expect(packed.size).toBeLessThan(1024 * 10);

    const userData = makeTempDir('mikapital-userdata-');
    const liveRoot = path.join(userData, 'live-bundle');
    const manifest = updater.unpackDistBundle(packed.buffer, packed.sha256, liveRoot, {
      expectedShellHash: 'shell-abc123',
    });

    expect(manifest.version).toBe('1.0.15');
    expect(fs.readFileSync(path.join(liveRoot, 'dist', 'index.html'), 'utf8')).toContain('v1.0.15');

    // Live bundle wins when newer than built-in 1.0.12
    const active = updater.resolveActiveDist({
      builtInDistDir: '/builtin/dist',
      builtInVersion: '1.0.12',
      builtInShellHash: 'shell-abc123',
      userDataDir: userData,
    });
    expect(active.mode).toBe('live-bundle');
    expect(active.version).toBe('1.0.15');

    // Quarantine falls back cleanly to built-in dist
    updater.quarantineLiveBundle(userData);
    const fallback = updater.resolveActiveDist({
      builtInDistDir: '/builtin/dist',
      builtInVersion: '1.0.12',
      builtInShellHash: 'shell-abc123',
      userDataDir: userData,
    });
    expect(fallback.mode).toBe('builtin');
    expect(fallback.version).toBe('1.0.12');
  });

  it('rejects tampered bundles and unsafe paths', () => {
    const srcDist = makeTempDir('mikapital-tamper-');
    fs.writeFileSync(path.join(srcDist, 'index.html'), '<html></html>');
    const packed = updater.packDistBundle(srcDist, {
      version: '1.0.20',
      shellHash: 'shell-1',
    });

    const tampered = Buffer.from(packed.buffer);
    tampered[tampered.length - 1] ^= 0xff;

    const target = path.join(makeTempDir('mikapital-out-'), 'live-bundle');
    expect(() => updater.unpackDistBundle(tampered, packed.sha256, target)).toThrow();
    expect(() => updater.validateRelativeBundlePath('../outside.js')).toThrow();
    expect(() => updater.validateRelativeBundlePath('/etc/passwd')).toThrow();
    expect(() => updater.validateRelativeBundlePath('C:\\Windows\\win.ini')).toThrow();
  });

  it('follows HTTP redirects and streams byte progress like GitHub Releases', async () => {
    const payload = Buffer.from('differential-bundle-payload-'.repeat(200), 'utf8');
    const progressEvents: number[] = [];

    const server = http.createServer((req, res) => {
      if (req.url?.startsWith('/releases/latest')) {
        res.writeHead(302, { Location: '/cdn/app-bundle.pak.gz' });
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(payload.length),
      });
      res.end(payload);
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const downloaded = await updater.httpsDownloadBuffer(
        `http://127.0.0.1:${port}/releases/latest`,
        {
          allowCustomHost: true,
          onProgress: ({ percent }: { percent: number }) => progressEvents.push(percent),
        },
      );
      expect(downloaded.equals(payload)).toBe(true);
      expect(progressEvents.at(-1)).toBe(100);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
