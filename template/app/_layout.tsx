import { Slot, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useAuthStore } from '@/store/authStore';

export default function RootLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const group = segments[0];

  useEffect(() => {
    // The entry route owns the initial redirect; wait for Slot to mount first.
    if (!navigationState?.key || !group || group === 'index') return;

    if (!isAuthenticated && group !== '(auth)') {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && group === '(auth)') {
      router.replace('/(main)');
    }
  }, [group, isAuthenticated, navigationState?.key, router]);

  return (
    <>
      <StatusBar style="auto" />
      <Slot />
    </>
  );
}
