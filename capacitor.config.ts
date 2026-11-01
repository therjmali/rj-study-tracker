import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Local-first Android build: the whole app is bundled inside the APK (webDir) and
 * served from the device — it never loads the website, so it works fully offline.
 */
const config: CapacitorConfig = {
  appId: 'app.rjtracker.pro',
  appName: 'RJ Tracker Pro',
  webDir: 'dist',
  backgroundColor: '#ecdfc8',
  server: { androidScheme: 'https' },
  plugins: {
    SystemBars: { insetsHandling: 'disable' }, // insets are handled natively in MainActivity
    LocalNotifications: { smallIcon: 'ic_stat_rj', iconColor: '#B4452B' },
  },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
};

export default config;
