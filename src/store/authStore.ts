import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { User } from '@/features/auth/types';

import { zustandStorage } from './mmkv';

const authSchema = z.object({
  user: z.object({
    id: z.string().trim().min(1).max(256),
    name: z.string().max(256).optional(),
    email: z.email().max(320).optional(),
  }),
  token: z.string().min(1).max(16384).regex(/^\S+$/),
});

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  // Invalid payloads leave the current session unchanged; callers can show an error.
  setAuth: (user: User, token: string) => boolean;
  // False indicates a storage failure; the in-memory session is still cleared.
  logout: () => boolean;
}

const loggedOutState = {
  user: null,
  token: null,
  isAuthenticated: false,
} as const;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...loggedOutState,
      setAuth: (user, token) => {
        const result = authSchema.safeParse({ user, token });
        if (!result.success) return false;

        try {
          set({ ...result.data, isAuthenticated: true });
          return true;
        } catch {
          get().logout();
          return false;
        }
      },
      logout: () => {
        try {
          // Zustand updates memory before its persistence middleware writes.
          set(loggedOutState);
          return true;
        } catch {
          try {
            zustandStorage.removeItem('auth-storage');
            return true;
          } catch {
            return false;
          }
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => zustandStorage),
      // Persist data only. Derive authentication from a validated user and token.
      partialize: ({ user, token }) => ({ user, token }),
      merge: (persistedState, currentState) => {
        const result = authSchema.safeParse(persistedState);
        return {
          ...currentState,
          ...(result.success
            ? { ...result.data, isAuthenticated: true }
            : loggedOutState),
        };
      },
      onRehydrateStorage: (state) => (_rehydratedState, error) => {
        if (error) state.logout();
      },
    },
  ),
);
