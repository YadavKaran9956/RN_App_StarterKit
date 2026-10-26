import { zodResolver } from '@hookform/resolvers/zod';
import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { Button } from '@/components/Button';
import { Input, type InputRef } from '@/components/Input';
import { useAuthStore } from '@/store/authStore';
import { APP_CONFIG, borderRadius, spacing, theme } from '@/theme/config';

const loginSchema = z.object({
  email: z.string().trim()
    .min(1, 'Email is required.')
    .max(320, 'Email must be 320 characters or fewer.')
    .pipe(z.email('Enter a valid email address.')),
  password: z.string()
    .min(6, 'Password must be at least 6 characters.')
    .max(128, 'Password must be 128 characters or fewer.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const mode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = theme[mode];
  const appName = APP_CONFIG.appName.startsWith('___') ? 'Skyestone' : APP_CONFIG.appName;
  const setAuth = useAuthStore((state) => state.setAuth);
  const passwordInput = useRef<InputRef>(null);
  const submissionLocked = useRef(false);
  const {
    control,
    handleSubmit,
    clearErrors,
    setError,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });

  function onSubmit(data: LoginFormValues) {
    Keyboard.dismiss();
    const saved = setAuth(
      { id: '1', email: data.email, name: 'Developer' },
      'mock-jwt-token',
    );
    if (!saved) {
      setError('root', {
        message: 'Unable to save your session. Please try again.',
      });
      return;
    }
    resetField('password');
    // The root layout observes the auth store and redirects to the main group.
  }

  function submit() {
    // A ref closes the same-frame gap before React renders isSubmitting=true.
    if (submissionLocked.current) return;
    submissionLocked.current = true;
    clearErrors('root');
    void handleSubmit(onSubmit)()
      .catch(() => {
        setError('root', { message: 'Unable to sign in. Please try again.' });
      })
      .finally(() => { submissionLocked.current = false; });
  }


  return (
    <SafeAreaView style={[styles.screen, colors.screen]}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.container}>
            <View style={styles.header}>
              <View accessible={false} style={[styles.brandMark, colors.button]}>
                <Text style={[styles.brandInitial, colors.buttonText]}>{appName.charAt(0).toUpperCase()}</Text>
              </View>
              <Text accessibilityRole="header" style={[styles.title, colors.title]}>Welcome back</Text>
              <Text style={[styles.subtitle, colors.muted]}>Sign in to {appName} to continue.</Text>
            </View>

            <View style={[styles.card, colors.card]}>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value, ref }, fieldState: { error } }) => (
                  <Input
                    ref={ref}
                    label="Email address"
                    testID="login-email"
                    accessibilityLabel="Email address"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={error?.message}
                    editable={!isSubmitting}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="username"
                    maxLength={320}
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => passwordInput.current?.focus()}
                  />
                )}
              />

              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value, ref }, fieldState: { error } }) => (
                  <Input
                    ref={(input) => { ref(input); passwordInput.current = input; }}
                    label="Password"
                    testID="login-password"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={error?.message}
                    helperText="At least 6 characters."
                    editable={!isSubmitting}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="current-password"
                    textContentType="password"
                    maxLength={128}
                    returnKeyType="go"
                    onSubmitEditing={submit}
                  />
                )}
              />

              {errors.root?.message && (
                <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.error, colors.error]}>
                  {errors.root.message}
                </Text>
              )}

              <Button
                testID="login-submit"
                title="Sign in"
                loadingTitle="Signing in…"
                loading={isSubmitting}
                onPress={submit}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  container: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: spacing.xl },
  header: { alignItems: 'center', gap: spacing.sm },
  brandMark: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  brandInitial: { fontSize: 24, fontWeight: '700' },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '700', textAlign: 'center', letterSpacing: -0.6 },
  subtitle: { fontSize: 15, lineHeight: 24, textAlign: 'center' },
  card: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.md,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  error: { fontSize: 13, lineHeight: 20 },
});
