import AsyncStorage from '@react-native-async-storage/async-storage';

/** Non-secret key/value persistence (recent scans, receive queue, dismissed tips). */
export const kv = {
  async get(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
  async getJSON<T>(key: string, fallback: T): Promise<T> {
    const raw = await kv.get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  async setJSON(key: string, value: unknown): Promise<void> {
    await kv.set(key, JSON.stringify(value));
  },
};

export const KV_KEYS = {
  recentScans: 'labstock_recent_scans',
  receiveQueue: 'labstock_receive_queue',
  tip: (id: string) => `ls_tip_${id}`,
} as const;
