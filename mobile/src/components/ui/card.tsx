import { View, type ViewProps } from 'react-native';

import { cn } from '@/lib/cn';

export interface CardProps extends ViewProps {
  padded?: boolean;
}

export function Card({ padded = true, className, children, ...rest }: CardProps) {
  return (
    <View
      className={cn('rounded-xl border border-line bg-surface', padded && 'p-4', className)}
      {...rest}
    >
      {children}
    </View>
  );
}
