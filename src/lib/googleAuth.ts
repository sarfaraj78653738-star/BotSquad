import * as SecureStore from 'expo-secure-store';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Google login WITHOUT our own server (user order 2026-10-29: server
// comes later, only when users pay; login now via Google Console).
//
// NATIVE sign-in via Google Play Services (switched 2026-10-31):
// the app shows Google's own account picker IN the app — no browser,
// no redirect, no Custom Tab. Play Services resolves the app's
// OAuth client from its package + signing certificate, so NO client
// ID is passed at runtime and no google-services.json is needed
// (the library's Expo plugin is Firebase-only and is NOT used;
// autolinking includes the native module).
//
// Console registration (PUBLIC identifiers, safe to record):
//   Android OAuth client, created 2026-10-31
//   package: com.botsquad.app
//   SHA-1: B8:24:49:51:32:71:66:65:28:50:85:B2:93:E8:E8:C6:5B:6A:89:A5
//   client ID: 882528237595-uppqaeumchghusblf8akl6pu2oo4htjp.apps.googleusercontent.com
// The old Desktop client + browser/PKCE/redirect flow was ABANDONED
// 2026-10-31 after four builds failed to return from the browser to
// the app (redirect_uri_mismatch, then silent dismiss/restart loss);
// the Desktop client may stay in the console, unused.
//
// Honest scope today: login only identifies the user in this app.
// Sync, premium, and server features arrive later, with the server
// phase. Tokens live only in this phone's SecureStore.

export type GoogleUser = { name: string; email: string; picture?: string; sub: string };

const USER_KEY = 'botsquad_google_user';
const TOKENS_KEY = 'botsquad_google_tokens';
// Legacy key from the abandoned browser flow (a pasted Desktop client
// ID). Kept only so Delete account can still clear it.
const LEGACY_CLIENT_ID_KEY = 'botsquad_google_client_id';

export async function clearGoogleClientId(): Promise<void> {
  await SecureStore.deleteItemAsync(LEGACY_CLIENT_ID_KEY).catch(() => {});
}

export async function getGoogleUser(): Promise<GoogleUser | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as GoogleUser; } catch { return null; }
}

async function saveGoogleSession(user: GoogleUser, idToken?: string): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify({ idToken: idToken ?? null }));
}

export async function signOutGoogle(): Promise<void> {
  try { await GoogleSignin.signOut(); } catch { /* wipe anyway */ }
  await SecureStore.deleteItemAsync(USER_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(TOKENS_KEY).catch(() => {});
}

// Native Google sign-in. Returns the user, or null when the user
// backs out of the account picker. Throws a plain message on failure
// — the login screen shows it.
export async function nativeSignIn(): Promise<GoogleUser | null> {
  GoogleSignin.configure({ scopes: ['openid', 'email', 'profile'] });
  const playOk = await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  if (!playOk) throw new Error('Google Play Services is needed for sign-in.');
  const res = await GoogleSignin.signIn();
  if (res.type === 'cancelled') return null;
  const u = res.data.user;
  if (!u.email) throw new Error('Google signed in, but no email came back.');
  const user: GoogleUser = {
    name: u.name ?? u.email,
    email: u.email,
    picture: u.photo ?? undefined,
    sub: u.id,
  };
  await saveGoogleSession(user, res.data.idToken ?? undefined);
  return user;
}
