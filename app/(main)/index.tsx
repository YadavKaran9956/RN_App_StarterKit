import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from '@/store/authStore';
import { theme } from '@/theme/config';

export default function DashboardScreen() {
  const colors = theme[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const user = useAuthStore((state) => state.user);
  const name = user?.name?.trim() || 'there';

  return (
    <SafeAreaView style={[styles.screen, colors.screen]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={[styles.title, colors.title]}>Dashboard</Text>
        <Text style={[styles.welcome, colors.title]}>Welcome, {name}.</Text>
        <Text style={[styles.description, colors.muted]}>You’re signed in and ready to go.</Text>

        <View style={[styles.card, colors.surface]}>
          <Text style={[styles.label, colors.title]}>Account</Text>
          <Text selectable style={[styles.description, colors.muted]}>
            {user?.email || 'No email address available.'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: { flexGrow: 1, padding: 24, gap: 12 },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 16,
  },
  welcome: { fontSize: 22, lineHeight: 30, fontWeight: '600' },
  description: { fontSize: 16, lineHeight: 24 },
  card: { marginTop: 16, padding: 20, borderRadius: 16, gap: 8 },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
});
