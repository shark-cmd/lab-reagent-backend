import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/context/AuthContext';

/** Auth gate — the expo-router equivalent of the web app's `Protected` wrapper. */
export default function Index() {
  const { ready, isAuthed } = useAuth();

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-page">
        <ActivityIndicator color="#0E7490" />
      </View>
    );
  }

  return <Redirect href={isAuthed ? '/(app)/scan' : '/login'} />;
}
