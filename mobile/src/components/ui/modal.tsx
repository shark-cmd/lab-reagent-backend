import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { X } from 'lucide-react-native';

import { Text } from './text';

export function SheetModal({
  visible,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end"
      >
        <Pressable className="flex-1 bg-black/40" onPress={onClose} />
        <View className="max-h-[90%] rounded-t-2xl bg-surface">
          <View className="flex-row items-start justify-between gap-3 border-b border-line px-5 py-4">
            <View className="flex-1">
              <Text variant="h2">{title}</Text>
              {description ? <Text variant="small" className="mt-0.5">{description}</Text> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={8} className="p-1">
              <X size={20} color="#4B5563" />
            </Pressable>
          </View>
          <ScrollView
            className="px-5"
            contentContainerClassName="py-4 gap-3"
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? <View className="flex-row justify-end gap-2 border-t border-line px-5 py-3">{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
