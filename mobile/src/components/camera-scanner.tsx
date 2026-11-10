import { useEffect, useRef } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { X } from 'lucide-react-native';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';

const BARCODE_TYPES = [
  'code128',
  'code39',
  'code93',
  'codabar',
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'itf14',
  'qr',
] as const;

/** Full-screen barcode scanner (replaces the web app's html5-qrcode overlay). */
export function CameraScanner({
  visible,
  onClose,
  onDetected,
}: {
  visible: boolean;
  onClose: () => void;
  onDetected: (text: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const handled = useRef(false);

  useEffect(() => {
    if (visible) {
      handled.current = false;
      if (!permission?.granted) void requestPermission();
    }
  }, [visible, permission?.granted, requestPermission]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
            onBarcodeScanned={({ data }) => {
              if (handled.current) return;
              handled.current = true;
              onDetected(data);
            }}
          >
            <View className="flex-1 items-center justify-center">
              <View className="h-40 w-72 rounded-xl border-2 border-white/80" />
              <Text className="mt-4 text-white">Point the camera at a barcode</Text>
            </View>
          </CameraView>
        ) : (
          <View className="flex-1 items-center justify-center gap-3 px-8">
            <Text className="text-center text-white">
              Camera permission is required to scan barcodes.
            </Text>
            <Pressable
              onPress={requestPermission}
              className="rounded-md bg-primary px-4 py-2.5 active:bg-primary-hover"
            >
              <Text className="font-sans-md text-white">Grant permission</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          onPress={onClose}
          style={{ top: insets.top + 12 }}
          className="absolute right-4 h-10 w-10 items-center justify-center rounded-full bg-black/60"
        >
          <X size={20} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}
