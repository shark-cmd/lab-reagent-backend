import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Secret persistence for the session. `expo-secure-store` has no web implementation,
 * so we fall back to `localStorage` on web (mirrors the web app's keys).
 */
export const SECURE_KEYS = {
  token: 'ls_token',
  user: 'ls_user',
} as const;

const isWeb = Platform.OS === 'web';

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (isWeb) return globalThis.localStorage?.getItem(key) ?? null;
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (isWeb) {
        globalThis.localStorage?.setItem(key, value);
        return;
      }
      await SecureStore.setItemAsync(key, value);
    } catch {
      /* ignore */
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (isWeb) {
        globalThis.localStorage?.removeItem(key);
        return;
      }
      await SecureStore.deleteItemAsync(key);
    } catch {
      /* ignore */
    }
  },
};
