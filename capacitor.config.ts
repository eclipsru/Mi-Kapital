import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.eclipsru.mikapital',
  appName: 'Мой капитал',
  webDir: 'dist',
  android: { allowMixedContent: false },
};

export default config;
