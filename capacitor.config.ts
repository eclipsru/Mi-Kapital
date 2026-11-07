import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.eclipsru.mikapital',
  appName: 'Мой капитал',
  webDir: 'dist',
  backgroundColor: '#0B0D11',
  android: { allowMixedContent: false, backgroundColor: '#0B0D11' },
};

export default config;
