import { Redirect } from 'expo-router';

import { useAuthStore } from '@/store/authStore';

export default function IndexScreen() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return <Redirect href={isAuthenticated ? '/(main)' : '/(auth)/login'} />;
}
