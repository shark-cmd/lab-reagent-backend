import {
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { FlaskConical, LogOut } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { NAV } from '@/constants/nav';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/cn';

/** Custom drawer content — the mobile analog of the web sidebar. */
export function AppDrawer(props: DrawerContentComponentProps) {
  const { user, logout } = useAuth();
  const current = props.state.routeNames[props.state.index];
  const items = NAV.filter((n) => !n.adminOnly || user?.role === 'admin');
  const initials = (user?.name || 'U')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View className="flex-1 bg-surface">
      <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 8 }}>
        <View className="px-3">
          <View className="flex-row items-center gap-2.5 px-1">
            <View className="h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <FlaskConical size={20} color="#fff" />
            </View>
            <View>
              <Text className="font-heading text-[17px] text-ink">LabStock</Text>
              <Text variant="small">Reagent &amp; QC inventory</Text>
            </View>
          </View>

          <View className="mt-6 gap-1">
            {items.map((n) => {
              const active = current === n.name;
              const Icon = n.icon;
              return (
                <Pressable
                  key={n.name}
                  onPress={() => props.navigation.navigate(n.name)}
                  className={cn(
                    'flex-row items-center gap-3 rounded-lg px-3 py-2.5',
                    active ? 'bg-primary-soft' : 'active:bg-surface2'
                  )}
                >
                  <Icon size={18} color={active ? '#0E7490' : '#475569'} />
                  <Text className={cn('font-sans-md text-sm', active ? 'text-primary' : 'text-ink')}>
                    {n.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </DrawerContentScrollView>

      <View className="border-t border-line px-4 py-4">
        <View className="mb-3 flex-row items-center gap-3 px-1">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary-soft">
            <Text className="font-sans-bold text-xs text-primary">{initials}</Text>
          </View>
          <View className="flex-1">
            <Text className="font-sans-bold text-sm text-ink" numberOfLines={1}>{user?.name}</Text>
            <Text variant="small" className="capitalize">{user?.role}</Text>
          </View>
        </View>
        <Pressable
          onPress={() => void logout()}
          className="h-10 flex-row items-center justify-center gap-2 rounded-md border border-line active:bg-surface2"
        >
          <LogOut size={16} color="#0B1220" />
          <Text className="font-sans-md text-sm text-ink">Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}
