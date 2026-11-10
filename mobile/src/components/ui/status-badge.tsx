import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

import { StatusVariantStyles, type StatusVariant } from '@/constants/theme';

import { Text } from './text';

export interface StatusBadgeProps extends ViewProps {
  variant?: StatusVariant;
  children: ReactNode;
}

export function StatusBadge({ variant = 'neutral', children, className, ...rest }: StatusBadgeProps) {
  const style = StatusVariantStyles[variant] ?? StatusVariantStyles.neutral;
  return (
    <View
      style={{ backgroundColor: style.bg, borderColor: style.border }}
      className={`self-start rounded-md border px-2 py-0.5 ${className ?? ''}`}
      {...rest}
    >
      <Text className="font-sans-md text-[11px]" style={{ color: style.fg }}>
        {children}
      </Text>
    </View>
  );
}
