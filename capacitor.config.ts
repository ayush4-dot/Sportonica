import type { CapacitorConfig } from '@capacitor/cli';

// This app can't be statically bundled onto the device — it's a full
// Next.js SSR app (Server Components hitting Supabase live, Server
// Actions, cookie-based auth middleware on every request). `webDir`
// above is required by the CLI but unused: the native shell loads the
// live production URL instead of local files.
const config: CapacitorConfig = {
  appId: 'com.sportonica.app',
  appName: 'Sportonica',
  webDir: 'public',
  server: {
    url: 'https://www.sportonica.com',
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      // Held manually — CapacitorBridge.tsx calls SplashScreen.hide()
      // once the remote page has actually mounted, instead of a fixed
      // timer that could either flash away too early on a slow
      // connection or hang around too long on a fast one.
      launchAutoHide: false,
      backgroundColor: '#0B0D11',
      androidScaleType: 'CENTER_INSIDE',
    },
  },
};

export default config;
