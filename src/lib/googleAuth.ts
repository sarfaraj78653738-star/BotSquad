import * as SecureStore from 'expo-secure-store';

// Google login WITHOUT our own server (user order 2026-10-29: server
// comes later, only when users pay; login now via Google Console).
// Flow: the app opens Google's own login page in the system browser
// (PKCE, no client secret — this is the Desktop-type OAuth client
// from Google Cloud Console, which needs no server and no SHA-1).
// Google redirects back to teambots://oauth, the app exchanges the
// code directly with Google, and the tokens live only in this phone's
// SecureStore. Google's server is always in the middle — "no server"
// means no server of OURS.
// Honest scope today: login only identifies the user in this app.
// Sync, premium, and server features arrive later, with the server
// phase. To add the Gmail connector later, extend SCOPES with
// 'https://www.googleapis.com/auth/gmail.readonly' — the same flow
// then returns a Gmail-usable access token.
export const GOOGLE_REDIRECT_URI = 'teambots://oauth';

export const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

export const GOOGLE_SCOPES = ['openid', 'email', 'profile'];

export type GoogleUser = { name: string; email: string; picture?: string; sub: string };
type GoogleTokens = { accessToken: string; refreshToken?: string; idToken?: string; expiresAt: number };

const CLIENT_ID_KEY = 'teambots_google_client_id';
const USER_KEY = 'teambots_google_user';
const TOKENS_KEY = 'teambots_google_tokens';

export async function getGoogleClientId(): Promise<string | null> {
  return SecureStore.getItemAsync(CLIENT_ID_KEY);
}

export async function setGoogleClientId(clientId: string): Promise<void> {
  await SecureStore.setItemAsync(CLIENT_ID_KEY, clientId.trim());
}

export async function getGoogleUser(): Promise<GoogleUser | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as GoogleUser; } catch { return null; }
}

async function saveGoogleSession(user: GoogleUser, tokens: GoogleTokens): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(tokens));
}

export async function signOutGoogle(): Promise<void> {
  // Best-effort revoke, then wipe local state either way.
  try {
    const raw = await SecureStore.getItemAsync(TOKENS_KEY);
    const tokens = raw ? (JSON.parse(raw) as GoogleTokens) : null;
    if (tokens?.accessToken) {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `token=${encodeURIComponent(tokens.accessToken)}`,
      }).catch(() => {});
    }
  } catch { /* wipe anyway */ }
  await SecureStore.deleteItemAsync(USER_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(TOKENS_KEY).catch(() => {});
}

// Exchange the authorization code for tokens, then fetch the profile.
// Throws a plain message on failure — the login screen shows it.
export async function completeGoogleSignIn(code: string, codeVerifier: string, clientId: string): Promise<GoogleUser> {
  const tokenRes = await fetch(GOOGLE_DISCOVERY.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}&client_id=${encodeURIComponent(clientId)}&code_verifier=${encodeURIComponent(codeVerifier)}`,
  });
  const tokenJson = await tokenRes.json().catch(() => null) as { access_token?: unknown; refresh_token?: unknown; id_token?: unknown; expires_in?: unknown; error_description?: unknown } | null;
  if (!tokenRes.ok || !tokenJson || typeof tokenJson.access_token !== 'string') {
    throw new Error(typeof tokenJson?.error_description === 'string' ? tokenJson.error_description : 'Google sign-in failed. Check the Client ID and try again.');
  }
  const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const userJson = await userRes.json().catch(() => null) as { name?: unknown; email?: unknown; picture?: unknown; sub?: unknown } | null;
  if (!userRes.ok || !userJson || typeof userJson.email !== 'string') throw new Error('Google signed in, but the profile could not be read.');
  const user: GoogleUser = {
    name: typeof userJson.name === 'string' ? userJson.name : userJson.email,
    email: userJson.email,
    picture: typeof userJson.picture === 'string' ? userJson.picture : undefined,
    sub: typeof userJson.sub === 'string' ? userJson.sub : '',
  };
  await saveGoogleSession(user, {
    accessToken: tokenJson.access_token,
    refreshToken: typeof tokenJson.refresh_token === 'string' ? tokenJson.refresh_token : undefined,
    idToken: typeof tokenJson.id_token === 'string' ? tokenJson.id_token : undefined,
    expiresAt: Date.now() + (typeof tokenJson.expires_in === 'number' ? tokenJson.expires_in : 3600) * 1000,
  });
  return user;
}
