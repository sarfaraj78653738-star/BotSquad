import * as SecureStore from 'expo-secure-store';
import { ProviderId } from './types';

// API keys live ONLY here (Android Keystore / iOS Keychain via expo-secure-store).
// They are never written to SQLite, never logged, and never sent anywhere
// except to the provider the user chose, in a direct HTTPS call from the device.
export async function getApiKey(provider: ProviderId): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(`botsquad_key_${provider}`);
  } catch {
    return null;
  }
}

export async function setApiKey(provider: ProviderId, key: string): Promise<void> {
  if (!key.trim()) {
    await SecureStore.deleteItemAsync(`botsquad_key_${provider}`);
    return;
  }
  await SecureStore.setItemAsync(`botsquad_key_${provider}`, key.trim());
}

export async function hasApiKey(provider: ProviderId): Promise<boolean> {
  const key = await getApiKey(provider);
  return !!key;
}
