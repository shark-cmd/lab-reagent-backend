import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { cn } from '@/lib/cn';

type Variant =
  | 'h1'
  | 'h2'
  | 'title'
  | 'body'
  | 'small'
  | 'label'
  | 'mono'
  | 'monoSm'
  | 'kpi';

const VARIANTS: Record<Variant, string> = {
  h1: 'font-heading text-2xl text-ink',
  h2: 'font-heading-md text-lg text-ink',
  title: 'font-heading-md text-base text-ink',
  body: 'font-sans text-sm text-ink',
  small: 'font-sans text-xs text-muted',
  label: 'font-sans-md text-[13px] text-ink',
  mono: 'font-mono text-sm text-ink',
  monoSm: 'font-mono text-[11px] text-muted',
  kpi: 'font-heading text-3xl text-ink',
};

export interface TextProps extends RNTextProps {
  variant?: Variant;
}

export function Text({ variant = 'body', className, ...rest }: TextProps) {
  return <RNText className={cn(VARIANTS[variant], className)} {...rest} />;
}
