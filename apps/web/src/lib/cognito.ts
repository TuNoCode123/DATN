/**
 * Cognito auth helpers — ALB-based authentication (Phase 2).
 *
 * With ALB handling the OIDC flow, login/signup work by redirecting to
 * an ALB-protected endpoint. ALB intercepts unauthenticated requests
 * and redirects to the Cognito Hosted UI automatically.
 *
 * After authentication, ALB redirects back to the original URL with
 * session cookies set. No PKCE, no callback page, no token exchange.
 */

const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN!;
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

/**
 * Redirect to Cognito Hosted UI for login via ALB.
 *
 * Hitting an ALB-protected API endpoint triggers the OIDC flow.
 * After auth, ALB redirects back here with session cookies set.
 *
 * For direct provider selection (e.g., Google), we redirect to
 * Cognito's authorize endpoint with identity_provider set — ALB
 * will recognize the resulting session.
 */
export function loginWithCognito(provider?: 'Google' | 'Facebook') {
  if (provider) {
    // Direct to specific social provider via Cognito Hosted UI
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: `${API_BASE_URL.replace('/api', '')}/oauth2/idpresponse`,
      identity_provider: provider,
    });
    window.location.href = `https://${COGNITO_DOMAIN}/oauth2/authorize?${params}`;
  } else {
    // Redirect to Cognito Hosted UI (shows login form with all providers)
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: `${API_BASE_URL.replace('/api', '')}/oauth2/idpresponse`,
    });
    window.location.href = `https://${COGNITO_DOMAIN}/oauth2/authorize?${params}`;
  }
}

/**
 * Redirect to Cognito Hosted UI for signup.
 */
export function signupWithCognito(provider?: 'Google' | 'Facebook') {
  if (provider) {
    loginWithCognito(provider);
    return;
  }
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: `${API_BASE_URL.replace('/api', '')}/oauth2/idpresponse`,
    screen_hint: 'signup',
  });
  window.location.href = `https://${COGNITO_DOMAIN}/oauth2/authorize?${params}`;
}

/**
 * Redirect to Cognito Hosted UI's Forgot Password page.
 */
export function forgotPasswordWithCognito() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: `${API_BASE_URL.replace('/api', '')}/oauth2/idpresponse`,
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
