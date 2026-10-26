import { StyleSheet } from 'react-native';

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const borderRadius = { sm: 6, md: 10, lg: 16, full: 9999 } as const;

export const APP_CONFIG = {
  appName: '___APP_NAME___',
  bundleId: '___BUNDLE_ID___',
  spacing,
  borderRadius,
  colors: {
    primary: '___PRIMARY_COLOR___',
    background: '#F9FAFB',
    card: '#FFFFFF',
    textPrimary: '#111827',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    error: '#DC2626',
  },
} as const;

// Render a valid color until the template's primary-color token is replaced.
const primary = APP_CONFIG.colors.primary.startsWith('___') ? '#2563EB' : APP_CONFIG.colors.primary;

export const themeColors = {
  light: { ...APP_CONFIG.colors, primary, onPrimary: '#FFFFFF' },
  dark: {
    ...APP_CONFIG.colors,
    primary,
    background: '#0B1120',
    card: '#111827',
    textPrimary: '#F9FAFB',
    textSecondary: '#9CA3AF',
    border: '#374151',
    error: '#FCA5A5',
    onPrimary: '#FFFFFF',
  },
} as const;

function createThemeStyles(colors: typeof themeColors.light | typeof themeColors.dark) {
  return StyleSheet.create({
    screen: { backgroundColor: colors.background },
    surface: { backgroundColor: colors.card },
    card: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      shadowColor: '#111827',
    },
    title: { color: colors.textPrimary },
    muted: { color: colors.textSecondary },
    input: {
      color: colors.textPrimary,
      backgroundColor: colors.card,
      borderColor: colors.border,
    },
    inputFocused: { borderColor: colors.primary },
    inputError: { borderColor: colors.error },
    error: { color: colors.error },
    button: { backgroundColor: colors.primary },
    buttonText: { color: colors.onPrimary },
  });
}

export const theme = {
  light: createThemeStyles(themeColors.light),
  dark: createThemeStyles(themeColors.dark),
};
