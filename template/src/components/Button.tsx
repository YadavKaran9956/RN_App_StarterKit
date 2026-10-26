import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  type TouchableOpacityProps,
} from 'react-native';

import { borderRadius, spacing, theme, themeColors } from '@/theme/config';

export interface ButtonProps extends Omit<TouchableOpacityProps, 'children'> {
  title: string;
  loading?: boolean;
  loadingTitle?: string;
}

export function Button({
  title,
  loading = false,
  loadingTitle,
  disabled = false,
  onPress,
  style,
  ...props
}: ButtonProps) {
  const mode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = theme[mode];
  const isDisabled = disabled || loading;
  const text = loading ? loadingTitle ?? title : title;

  return (
    <TouchableOpacity
      {...props}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? text}
      accessibilityState={{ ...props.accessibilityState, disabled: isDisabled, busy: loading }}
      activeOpacity={0.8}
      disabled={isDisabled}
      onPress={(event) => { if (!isDisabled) onPress?.(event); }}
      style={[styles.button, colors.button, style, isDisabled && styles.disabled]}
    >
      {loading && <ActivityIndicator color={themeColors[mode].onPrimary} accessibilityLabel={text} />}
      <Text style={[styles.text, colors.buttonText]}>{text}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  text: { fontSize: 16, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.5 },
});
