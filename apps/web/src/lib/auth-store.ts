import { create } from 'zustand';
import { signOutUser } from './firebase';
import { api } from './api';

interface User {
  id: string;
  email: string;
  displayName?: string;
  role: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  // Flips to true once the initial session restore (Firebase auth state,
  // or the dev-account cookie bypass) has resolved at least once. Guards
  // that redirect on "no user" — e.g. the (admin) layout — must wait for
  // this instead of racing Firebase's async session restore.
  isReady: boolean;
  setUser: (user: User | null) => void;
  setReady: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isReady: false,
  setUser: (user) => set({ user, isAuthenticated: !!user, isReady: true }),
  setReady: () => set({ isReady: true }),
  logout: () => {
    set({ user: null, isAuthenticated: false, isReady: true });
    (async () => {
      if (process.env.NODE_ENV !== 'production') {
        // Clear the dev-account cookie too, in case dev auth is active.
        await api.post('/auth/dev/logout').catch(() => {});
      }
      await signOutUser().catch(() => {});
      window.location.href = '/login';
    })();
  },
}));
