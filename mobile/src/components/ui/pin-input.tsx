import { forwardRef, useRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { cn } from '@/lib/cn';

import { Text } from './text';

type TextInputRef = ComponentRef<typeof TextInput>;

/**
 * 4-box PIN entry driven by a single hidden input (RN-safe; `TextInput` only
 * accepts `Text` children so the boxes are siblings, not children).
 */
export const PinInput = forwardRef<TextInputRef, { value: string; onChange: (v: string) => void }>(
  ({ value, onChange }, ref) => {
    const innerRef = useRef<TextInputRef>(null);
    const inputRef = (ref as React.RefObject<TextInputRef>) ?? innerRef;

    return (
      <Pressable className="flex-row items-center gap-2" onPress={() => inputRef.current?.focus()}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            className={cn(
              'h-12 w-11 items-center justify-center rounded-md border bg-surface',
              i === value.length ? 'border-primary' : 'border-line'
            )}
          >
            <Text variant="title">{value[i] ?? ''}</Text>
          </View>
        ))}
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          maxLength={4}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
        />
      </Pressable>
    );
  }
);

PinInput.displayName = 'PinInput';

export function usePinState(initial = '') {
  const [pin, setPin] = useState(initial);
  return { pin, setPin };
}
