import { create } from 'zustand';
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
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  logout: async () => {
    try {
      await api.post('/auth/cognito/logout');
    } catch {
      // Cookies may already be expired — proceed to clear client state anyway
    }
    set({ user: null, isAuthenticated: false });
  },
}));
