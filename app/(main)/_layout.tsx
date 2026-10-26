import { Stack } from 'expo-router';

import { useAuthStore } from '@/store/authStore';

export default function MainLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Keep protected screens unmounted while the root layout redirects.
  return isAuthenticated ? <Stack screenOptions={{ headerShown: false }} /> : null;
}
