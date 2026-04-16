import { create } from 'zustand';
import { logoutFromCognito } from './cognito';

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
    // Redirect to Cognito logout — clears ALB session cookie + Cognito session,
    // then redirects back to /login
    logoutFromCognito();
  },
}));
