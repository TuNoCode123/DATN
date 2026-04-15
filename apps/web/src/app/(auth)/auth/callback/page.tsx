'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { getCodeVerifier, clearCodeVerifier } from '@/lib/cognito';

function CallbackContent() {
  const router = useRouter();
  const params = useSearchParams();
  const setUser = useAuthStore((s) => s.setUser);
  const exchanged = useRef(false);

  useEffect(() => {
    // Prevent double-exchange in StrictMode
    if (exchanged.current) return;
    exchanged.current = true;

    // Cognito redirects with ?error=... when a Lambda trigger throws
    const error = params.get('error');
    const errorDescription = params.get('error_description');
    if (error) {
      console.error('Cognito error:', error, errorDescription);
      clearCodeVerifier();
      // Check if it's a duplicate-email error from our pre-signup Lambda
      if (errorDescription?.includes('already exists')) {
        router.replace('/login?error=email_exists');
      } else {
        router.replace('/login?error=auth_failed');
      }
      return;
    }

    const code = params.get('code');
    const codeVerifier = getCodeVerifier();

    if (!code || !codeVerifier) {
      router.replace('/login');
      return;
    }

    api
      .post('/auth/cognito/session', {
        code,
        codeVerifier,
        redirectUri: `${window.location.origin}/auth/callback`,
      })
      .then(({ data }) => {
        // Cookies are set by the response — just update Zustand store
        setUser(data);
        clearCodeVerifier();

        const returnUrl = sessionStorage.getItem('auth_return_url');
        sessionStorage.removeItem('auth_return_url');

        if (data.linkedExisting) {
          router.replace('/tests?linked=1');
        } else {
          router.replace(returnUrl || '/tests');
        }
      })
      .catch((err) => {
        console.error('Auth callback failed:', err?.response?.data ?? err);
        clearCodeVerifier();
        router.replace('/login?error=auth_failed');
      });
  }, [params, router, setUser]);

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <p className="text-sm text-slate-500">Logging you in...</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-slate-500">Logging you in...</p>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
