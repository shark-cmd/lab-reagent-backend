import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Haptic feedback helper (no-op on web) — mirrors the web app's `navigator.vibrate`. */
export async function buzz(kind: 'ok' | 'err' | 'tap' = 'tap') {
  if (Platform.OS === 'web') return;
  try {
    if (kind === 'ok') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else if (kind === 'err') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      await Haptics.selectionAsync();
    }
  } catch {
    /* ignore */
  }
}
