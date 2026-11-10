import { useEffect, useState, type ReactNode } from 'react';
import { Info, X } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { KV_KEYS, kv } from '@/services/storage/kv';

import { Text } from './ui/text';

/** Dismissible page tip, persisted per id (mirrors the web `InfoBanner`). */
export function InfoBanner({ id, children }: { id: string; children: ReactNode }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    kv.get(KV_KEYS.tip(id)).then((v) => {
      if (!cancelled && v === '1') setDismissed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (dismissed) return null;

  return (
    <View className="flex-row gap-2 rounded-xl border border-info-line bg-info-soft p-3">
      <Info size={16} color="#0B5CAD" style={{ marginTop: 1 }} />
      <Text className="flex-1 text-xs leading-5 text-info">{children}</Text>
      <Pressable
        hitSlop={8}
        onPress={() => {
          setDismissed(true);
          void kv.set(KV_KEYS.tip(id), '1');
        }}
      >
        <X size={16} color="#0B5CAD" />
      </Pressable>
    </View>
  );
}
