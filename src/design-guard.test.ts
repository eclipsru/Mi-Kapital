import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('single dark design-system & release configuration guards', () => {
  it('enforces dark Arenda-Nvk palette and forbids any legacy light/green theme remnants', () => {
    const css = read('src/styles.css');
    const html = read('index.html');
    const electronMain = read('electron/main.cjs');
    const androidStyles = read('android/app/src/main/res/values/styles.xml');
    const androidColors = read('android/app/src/main/res/values/colors.xml');

    // Required dark/orange tokens matching the screenshot
    expect(css).toContain('--or: #FF8F1F');
    expect(css).toContain('--bg: #101217');
    expect(css).toContain('--bg-2: #0B0D11');
    expect(css).toContain('--card: #1A1D24');
    expect(css).toContain('--field: #171A21');
    expect(css).toContain('--line: #262B35');
    expect(css).toContain('color-scheme: dark');

    // Required 3-column screenshot layout classes
    for (const cls of ['.head', '.st-layout', '.st-pcard', '.tabs', '.kpis', '.order-card']) {
      expect(css).toContain(cls);
    }

    // Electron & HTML & Android must force dark surfaces from first paint
    expect(html).toContain('content="#101217"');
    expect(html).toContain('#0B0D11');
    expect(electronMain).toContain("nativeTheme.themeSource = 'dark'");
    expect(electronMain).toContain("backgroundColor: '#0B0D11'");
    expect(androidColors).toContain('#101217');
    expect(androidStyles).not.toContain('Theme.AppCompat.Light');
    expect(androidStyles).not.toContain('DayNight');

    // Forbidden legacy white/green palette and external font imports
    const combined = [css, html, electronMain, read('src/App.tsx'), read('src/EntryModal.tsx')].join('\n');
    for (const forbidden of [
      '#f4f7f6',
      '#268d72',
      '#193a33',
      '#258367',
      "themeSource = 'light'",
      'fonts.googleapis.com',
    ]) {
      expect(combined.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('enforces ASCII installer artifactName so GitHub Releases never mangles filenames', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.build.win.artifactName).toBe('Mi-Kapital-Setup-${version}.${ext}');
    expect(pkg.build.nsis.differentialPackage).toBe(true);
    expect(pkg.build.publish[0].releaseType).toBe('release');
  });
});
