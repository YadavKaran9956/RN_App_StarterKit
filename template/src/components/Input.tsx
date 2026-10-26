import { useId, useState, type ComponentRef, type Ref } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { borderRadius, spacing, theme, themeColors } from '@/theme/config';

export type InputRef = ComponentRef<typeof TextInput>;

export interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  helperText?: string;
  containerStyle?: StyleProp<ViewStyle>;
  ref?: Ref<InputRef>;
}

export function Input({
  label,
  error,
  helperText,
  containerStyle,
  style,
  onFocus,
  onBlur,
  editable = true,
  value,
  ref,
  ...props
}: InputProps) {
  const mode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = theme[mode];
  const labelId = useId();
  const [focused, setFocused] = useState(false);
  const errorMessage = typeof error === 'string' ? error : undefined;

  return (
    <View style={[styles.container, containerStyle]}>
      <Text nativeID={labelId} style={[styles.label, colors.title]}>{label}</Text>
      <TextInput
        {...props}
        ref={ref}
        accessibilityLabel={props.accessibilityLabel ?? label}
        accessibilityLabelledBy={props.accessibilityLabelledBy ?? labelId}
        editable={editable}
        value={value === undefined ? undefined : typeof value === 'string' ? value : ''}
        selectionColor={themeColors[mode].primary}
        placeholderTextColor={themeColors[mode].textSecondary}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        style={[
          styles.input,
          colors.input,
          style,
          focused && colors.inputFocused,
          errorMessage && colors.inputError,
          !editable && styles.disabled,
        ]}
      />
      <View style={styles.helperArea}>
        {errorMessage ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.helper, colors.error]}>
            {errorMessage}
          </Text>
        ) : helperText ? (
          <Text style={[styles.helper, colors.muted]}>{helperText}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    lineHeight: 22,
  },
  helperArea: { minHeight: 20 },
  helper: { fontSize: 13, lineHeight: 20 },
  disabled: { opacity: 0.55 },
});
