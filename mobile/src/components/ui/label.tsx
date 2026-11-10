import { Text, type TextProps } from './text';

export function Label({ className, ...rest }: TextProps) {
  return <Text variant="label" className={className} {...rest} />;
}
