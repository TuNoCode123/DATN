/**
 * Cognito auth helpers — ALB-based authentication (Phase 2).
 *
 * Login/signup work by redirecting to an ALB-protected endpoint.
 * ALB intercepts unauthenticated requests, initiates the OIDC flow
 * with Cognito, handles the /oauth2/idpresponse callback internally,
 * sets session cookies, and forwards to the backend.
 *
 * The backend login endpoint then redirects the user back to the frontend.
 */

const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN!;
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

/**
 * Redirect to ALB-protected login endpoint.
 *
 * The ALB authenticate-cognito action will redirect unauthenticated
 * users to the Cognito Hosted UI. After auth, ALB handles the token
 * exchange at /oauth2/idpresponse, sets session cookies, and forwards
 * to the backend. The backend then redirects back to the frontend.
 */
export function loginWithCognito(_provider?: 'Google' | 'Facebook') {
  const redirect = window.location.pathname !== '/login' ? window.location.pathname : '/dashboard';
  window.location.href = `${API_BASE_URL}/auth/cognito/login?redirect=${encodeURIComponent(redirect)}`;
}

/**
 * Redirect to Cognito Hosted UI for signup.
 * Uses the same ALB flow — Cognito Hosted UI has a sign-up link.
 */
export function signupWithCognito(_provider?: 'Google' | 'Facebook') {
  loginWithCognito();
}

/**
 * Redirect to Cognito Hosted UI's Forgot Password page.
 */
export function forgotPasswordWithCognito() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: `${API_BASE_URL}/auth/cognito/login`,
  });
  window.location.href = `https://${COGNITO_DOMAIN}/forgotPassword?${params}`;
}

/**
 * Redirect to Cognito for logout.
 * This clears both the ALB session cookie and the Cognito session.
 */
export function logoutFromCognito() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    logout_uri: `${window.location.origin}/login`,
  });
  window.location.href = `https://${COGNITO_DOMAIN}/logout?${params}`;
}
