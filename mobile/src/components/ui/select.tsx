import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { cn } from '@/lib/cn';

import { SheetModal } from './modal';
import { Text } from './text';

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  value,
  options,
  onChange,
  placeholder = 'Select',
  title,
  className,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  title?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className={cn(
          'h-10 flex-row items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 active:bg-surface2',
          className
        )}
      >
        <Text className="flex-1 text-sm text-ink" numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <ChevronDown size={16} color="#94a3b8" />
      </Pressable>

      <SheetModal visible={open} onClose={() => setOpen(false)} title={title ?? placeholder}>
        {options.map((o) => (
          <Pressable
            key={o.value}
            onPress={() => {
              onChange(o.value);
              setOpen(false);
            }}
            className="flex-row items-center justify-between rounded-lg border border-line px-3 py-3 active:bg-surface2"
          >
            <Text className="text-sm text-ink">{o.label}</Text>
            {o.value === value ? <Check size={16} color="#0E7490" /> : null}
          </Pressable>
        ))}
      </SheetModal>
    </>
  );
}
