'use client';

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';

// Public by design — not a secret. See infra-gcp/modules/identity-platform's
// note on why the API key is safe to ship in client-side JS; access control
// is enforced by Identity Platform, not by hiding this value.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

/**
 * Mirrors the backend's dev-mode fallback (no GCP_PROJECT_ID → dev-account
 * cookie bypass, see FirebaseAuthService.isDev). Local development normally
 * uses /dev-login and never needs a real Firebase project configured — so
 * everything below tolerates missing env vars instead of throwing at import
 * time, since this module is imported by api.ts/socket-auth.ts globally,
 * not just from the auth pages.
 */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey);

let app: FirebaseApp | null = null;
export let auth: Auth | null = null;

if (isFirebaseConfigured) {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
}

function requireAuth(): Auth {
  if (!auth) {
    throw new Error(
      'Firebase is not configured (NEXT_PUBLIC_FIREBASE_API_KEY unset) — use /dev-login in local development instead.',
    );
  }
  return auth;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(requireAuth(), email, password);
  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }
  return credential.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(requireAuth(), email, password);
  return credential.user;
}

export async function signOutUser(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(requireAuth(), email);
}

/** Current user's ID token, or null if signed out (or Firebase isn't
 * configured — local dev without a project set up). Firebase caches this
 * and only makes a network call when the cached token is near expiry. */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth?.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

/** No-ops (never calls back) when Firebase isn't configured. */
export function onAuthChange(callback: (user: User | null) => void) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
}

/** Maps Firebase Auth error codes to short, user-facing messages. */
export function firebaseAuthErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
