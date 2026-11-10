import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { cn } from '@/lib/cn';

import { Text } from './text';

export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return <View className={cn('flex-1 bg-page', className)}>{children}</View>;
}

/** Scrollable page body with the web app's page padding. */
export function PageScroll({
  children,
  className,
  refreshControl,
}: {
  children: ReactNode;
  className?: string;
  refreshControl?: ReactNode;
}) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName={cn('px-4 py-4 gap-4 pb-16', className)}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl as never}
    >
      {children}
    </ScrollView>
  );
}

export function ScreenHeader({
  icon,
  title,
  subtitle,
  right,
  className,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <View className={cn('flex-row items-start justify-between gap-3', className)}>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          {icon}
          <Text variant="h1">{title}</Text>
        </View>
        {subtitle ? <Text variant="small" className="mt-0.5">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function EmptyState({ icon, message }: { icon?: ReactNode; message: string }) {
  return (
    <View className="items-center justify-center py-10">
      {icon}
      <Text variant="small" className="mt-2 text-center">{message}</Text>
    </View>
  );
}
