import { Drawer } from 'expo-router/drawer';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';

import { AppDrawer } from '@/components/app-drawer';
import { NAV } from '@/constants/nav';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

export const unstable_settings = { initialRouteName: 'scan' };

export default function AppLayout() {
  const { ready, isAuthed } = useAuth();

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-page">
        <ActivityIndicator color="#0E7490" />
      </View>
    );
  }

  if (!isAuthed) return <Redirect href="/login" />;

  return (
    <Drawer
      drawerContent={(props) => (
        <AppDrawer {...(props as unknown as DrawerContentComponentProps)} />
      )}
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.ink,
        headerTitleStyle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 18 },
        headerShadowVisible: false,
        drawerType: 'front',
      }}
    >
      {NAV.map((n) => (
        <Drawer.Screen key={n.name} name={n.name} options={{ title: n.label }} />
      ))}
    </Drawer>
  );
}
