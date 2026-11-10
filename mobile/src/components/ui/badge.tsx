import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

import { cn } from '@/lib/cn';

import { Text } from './text';

export interface BadgeProps extends ViewProps {
  children: ReactNode;
  tone?: 'primary' | 'neutral' | 'warning';
}

const TONES = {
  primary: 'bg-primary-soft border-primary-soft',
  neutral: 'bg-neutralsoft border-neutral-line',
  warning: 'bg-warning-soft border-warning-line',
};

const TEXT_TONES = {
  primary: 'text-primary',
  neutral: 'text-neutral-fg',
  warning: 'text-warning',
};

export function Badge({ children, tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <View className={cn('self-start rounded-md border px-2 py-0.5', TONES[tone], className)} {...rest}>
      <Text className={cn('font-sans-md text-[11px]', TEXT_TONES[tone])}>{children}</Text>
    </View>
  );
}
