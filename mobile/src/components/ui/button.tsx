import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, type PressableProps } from 'react-native';

import { cn } from '@/lib/cn';
import { Text } from './text';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary active:bg-primary-hover',
  outline: 'bg-surface border border-line active:bg-surface2',
  ghost: 'bg-transparent active:bg-surface2',
  danger: 'bg-danger active:opacity-90',
};

const TEXT_COLOR: Record<Variant, string> = {
  primary: 'text-white',
  outline: 'text-ink',
  ghost: 'text-ink',
  danger: 'text-white',
};

const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3',
  md: 'h-11 px-4',
  lg: 'h-12 px-5',
  icon: 'h-9 w-9',
};

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: Variant;
  size?: Size;
  label?: string;
  loading?: boolean;
  icon?: ReactNode;
  textClassName?: string;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  label,
  loading = false,
  icon,
  className,
  textClassName,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <Pressable
      disabled={disabled || loading}
      className={cn(
        'flex-row items-center justify-center gap-2 rounded-md',
        VARIANT[variant],
        SIZE[size],
        (disabled || loading) && 'opacity-50',
        className
      )}
      {...rest}
    >
      {loading ? <ActivityIndicator size="small" color={variant === 'primary' || variant === 'danger' ? '#fff' : '#0E7490'} /> : icon}
      {label ? (
        <Text className={cn('font-sans-md text-sm', TEXT_COLOR[variant], textClassName)}>{label}</Text>
      ) : null}
      {children}
    </Pressable>
  );
}
