import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { computeShellHash, packDistBundle } = require('../electron/updater-core.cjs');

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = String(pkg.version).trim();
const tag = process.env.RELEASE_TAG || `v${version}`;
const distDir = path.join(rootDir, 'dist');
const outDir = path.join(rootDir, 'release');

fs.mkdirSync(outDir, { recursive: true });

const shellHash = computeShellHash(rootDir);
const bundleFile = `app-bundle-${version}.pak.gz`;
const bundlePath = path.join(outDir, bundleFile);
const manifestPath = path.join(outDir, 'app-update-manifest.json');

const packed = packDistBundle(distDir, {
  version,
  shellHash,
});

fs.writeFileSync(bundlePath, packed.buffer);

const manifest = {
  version,
  tag,
  shellHash,
  bundleFile,
  bundleSize: packed.size,
  bundleSha256: packed.sha256,
  fileCount: packed.fileCount,
  installerFile: `Mi-Kapital-Setup-${version}.exe`,
  publishedAt: new Date().toISOString(),
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `[update-bundle] Created ${bundleFile} (${(packed.size / 1024).toFixed(1)} KB, ${packed.fileCount} files, shell=${shellHash})`,
);
