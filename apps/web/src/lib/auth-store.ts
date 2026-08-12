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
  setUser: (user: User | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  logout: () => {
    set({ user: null, isAuthenticated: false });
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
