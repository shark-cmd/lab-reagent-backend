import { forwardRef, type ComponentRef } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

import { cn } from '@/lib/cn';

export type InputProps = TextInputProps;
export type InputRef = ComponentRef<typeof TextInput>;

export const Input = forwardRef<InputRef, InputProps>(({ className, ...rest }, ref) => (
  <TextInput
    ref={ref}
    className={cn(
      'h-11 rounded-md border border-line bg-surface px-3 font-sans text-sm text-ink',
      className
    )}
    placeholderTextColor="#94a3b8"
    {...rest}
  />
));

Input.displayName = 'Input';
