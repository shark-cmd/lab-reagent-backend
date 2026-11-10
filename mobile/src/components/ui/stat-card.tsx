import type { ComponentType } from 'react';
import { View } from 'react-native';

import { Text } from './text';

export interface StatCardProps {
  icon: ComponentType<{ size?: number; color?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  iconBg: string;
  iconColor: string;
}

export function StatCard({ icon: Icon, label, value, sub, iconBg, iconColor }: StatCardProps) {
  return (
    <View className="flex-1 rounded-xl border border-line bg-surface p-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-[11px] font-sans-md uppercase tracking-wide text-muted">{label}</Text>
          <Text variant="kpi" className="mt-1 text-2xl">{value}</Text>
          {sub ? <Text variant="small" className="mt-1">{sub}</Text> : null}
        </View>
        <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: iconBg }}>
          <Icon size={20} color={iconColor} />
        </View>
      </View>
    </View>
  );
}
