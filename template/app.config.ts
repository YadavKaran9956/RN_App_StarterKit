import type { ConfigContext, ExpoConfig } from 'expo/config';

// Keep replacement tokens in source, but supply native tooling a valid color.
const primaryColor = '___PRIMARY_COLOR___';
const appName = '___APP_NAME___';
const bundleId = '___BUNDLE_ID___';
const backgroundColor = primaryColor.startsWith('___') ? '#2563EB' : primaryColor;

interface AppConfig extends ExpoConfig {
  splash: {
    image: string;
    resizeMode: 'contain';
    backgroundColor: string;
  };
}

export default ({ config }: ConfigContext): AppConfig => {
  const splash = {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor,
  } as const;

  return {
    // Preserve app.json's name, scheme, router plugin and Android package.
    ...config,
    name: appName.startsWith('___') ? config.name ?? 'Skyestone' : appName,
    slug: config.slug ?? 'skyestone-app-starter',
    backgroundColor,
    icon: './assets/icon.png',
    splash,
    plugins: [
      ...(config.plugins ?? []),
      'expo-system-ui',
      ['expo-splash-screen', { ...splash, ios: splash }],
    ],
    android: {
      ...config.android,
      backgroundColor,
      package: bundleId.startsWith('___') ? config.android?.package : bundleId,
      adaptiveIcon: {
        ...config.android?.adaptiveIcon,
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor,
      },
    },
    ios: {
      ...config.ios,
      // The generator replaces this token for both native targets. The fallback
      // also allows prebuilding the untouched template without an iOS-ID prompt.
      bundleIdentifier: bundleId.startsWith('___')
        ? config.ios?.bundleIdentifier ?? config.android?.package ?? 'com.skyestone.app'
        : bundleId,
      supportsTablet: true,
      backgroundColor,
    },
  };
};
