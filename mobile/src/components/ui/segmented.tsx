import type { ComponentType } from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';

import { Text } from './text';

export interface SegmentOption {
  key: string;
  label: string;
  icon?: ComponentType<{ size?: number; color?: string }>;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  columns = options.length,
}: {
  options: SegmentOption[];
  value: string;
  onChange: (key: string) => void;
  columns?: number;
}) {
  const wrap = columns < options.length;
  return (
    <View className={cn('flex-row gap-2', wrap && 'flex-wrap')}>
      {options.map((o) => {
        const active = o.key === value;
        const Icon = o.icon;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            className={cn(
              'items-center justify-center gap-1 rounded-xl border py-2.5',
              wrap ? 'basis-[48%] grow' : 'flex-1',
              active ? 'border-primary bg-primary-soft' : 'border-line bg-surface active:bg-surface2'
            )}
          >
            {Icon ? <Icon size={20} color={active ? '#0E7490' : '#4B5563'} /> : null}
            <Text className={cn('font-sans-md text-[13px]', active ? 'text-primary' : 'text-ink')}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
