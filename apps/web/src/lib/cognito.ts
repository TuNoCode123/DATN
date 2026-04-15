const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN!;
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;

function getRedirectUri() {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/auth/callback`;
}

/** Generate PKCE code verifier + challenge pair */
async function generatePKCE() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = Array.from(array, (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  sessionStorage.setItem('pkce_code_verifier', verifier);
  return challenge;
}

/** Build Cognito authorize URL with PKCE */
function buildAuthorizeUrl(
  challenge: string,
  provider?: 'Google' | 'Facebook',
) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: getRedirectUri(),
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  if (provider) {
    params.set('identity_provider', provider);
  }

  return `https://${COGNITO_DOMAIN}/oauth2/authorize?${params}`;
}

/**
 * Redirect to Cognito Hosted UI for login.
 * Without a provider, shows the Cognito login form (email/password + social).
 * With a provider, goes directly to that social login.
 */
export async function loginWithCognito(provider?: 'Google' | 'Facebook') {
  const challenge = await generatePKCE();
  window.location.href = buildAuthorizeUrl(challenge, provider);
}

/**
 * Redirect to Cognito Hosted UI for signup.
 * Appends screen_hint=signup so Cognito shows the registration form.
 */
export async function signupWithCognito(provider?: 'Google' | 'Facebook') {
  const challenge = await generatePKCE();
  const url = buildAuthorizeUrl(challenge, provider);
  // Cognito Hosted UI supports screen_hint to show signup tab
  window.location.href = provider ? url : `${url}&screen_hint=signup`;
}

/**
 * Redirect to Cognito Hosted UI's Forgot Password page.
 * After the user sets a new password, Cognito redirects back to the
 * callback URL with an authorization code — same flow as normal login,
 * so PKCE is generated here too.
 */
export async function forgotPasswordWithCognito() {
  const challenge = await generatePKCE();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: getRedirectUri(),
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  window.location.href = `https://${COGNITO_DOMAIN}/forgotPassword?${params}`;
}

/**
 * Redirect to Cognito for logout, then back to /login.
 */
export function logoutFromCognito() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    logout_uri: `${window.location.origin}/login`,
  });
  window.location.href = `https://${COGNITO_DOMAIN}/logout?${params}`;
}

/**
 * Get the stored PKCE code verifier (used by the callback page).
 */
export function getCodeVerifier(): string | null {
  return sessionStorage.getItem('pkce_code_verifier');
}

/**
 * Clear the stored PKCE code verifier after successful exchange.
 */
export function clearCodeVerifier() {
  sessionStorage.removeItem('pkce_code_verifier');
}
