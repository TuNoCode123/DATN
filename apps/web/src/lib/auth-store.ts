import { create } from 'zustand';
import { logoutFromCognito } from './cognito';
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
    if (process.env.NODE_ENV !== 'production') {
      // Try to clear dev cookie; if endpoint is disabled (403), fall through to Cognito.
      api
        .post('/auth/dev/logout')
        .then(() => {
          window.location.href = '/login';
        })
        .catch(() => logoutFromCognito());
      return;
    }
    logoutFromCognito();
  },
}));
