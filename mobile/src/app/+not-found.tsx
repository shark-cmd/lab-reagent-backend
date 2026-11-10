import { Link, Stack } from 'expo-router';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View className="flex-1 items-center justify-center gap-3 bg-page px-6">
        <Text variant="h2">This screen doesn’t exist.</Text>
        <Link href="/" className="text-primary">
          <Text className="text-primary">Go to home</Text>
        </Link>
      </View>
    </>
  );
}
