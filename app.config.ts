import type { ConfigContext, ExpoConfig } from 'expo/config';

// Keep replacement tokens in source, but supply native tooling a valid color.
const primaryColor = '___PRIMARY_COLOR___';
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
    name: config.name ?? 'Skyestone',
    slug: config.slug ?? 'skyestone-app-starter',
    icon: './assets/icon.png',
    splash,
    plugins: [
      ...(config.plugins ?? []),
      ['expo-splash-screen', splash],
    ],
    android: {
      ...config.android,
      adaptiveIcon: {
        ...config.android?.adaptiveIcon,
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor,
      },
    },
  };
};
