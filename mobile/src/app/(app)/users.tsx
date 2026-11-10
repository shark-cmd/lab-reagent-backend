import { useCallback, useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { KeyRound, Trash2, UserPlus } from 'lucide-react-native';
import { toast } from 'sonner-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SheetModal } from '@/components/ui/modal';
import { EmptyState, PageScroll, Screen } from '@/components/ui/screen';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/AuthContext';
import { ApiError, users as usersApi } from '@/lib/api';
import type { User } from '@/types/api';

export default function UsersScreen() {
  const { user } = useAuth();
  const [list, setList] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ username: '', name: '', password: '', pin: '', role: 'technician' });
  const [pinFor, setPinFor] = useState<User | null>(null);
  const [newPin, setNewPin] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await usersApi.list());
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Failed to load users (admin only)');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') void load();
    else setLoading(false);
  }, [load, user?.role]);

  const createUser = async () => {
    if (!form.username || !form.name || !form.password) {
      toast.error('Username, name and password are required');
      return;
    }
    setSaving(true);
    try {
      await usersApi.create(form);
      toast.success('User created');
      setOpen(false);
      setForm({ username: '', name: '', password: '', pin: '', role: 'technician' });
      void load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: User) => {
    try {
      await usersApi.update(u.id, { active: !u.active });
      void load();
    } catch {
      toast.error('Update failed');
    }
  };

  const removeUser = (u: User) => {
    Alert.alert('Delete user', `Delete user ${u.username}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await usersApi.remove(u.id);
            toast.success('User deleted');
            void load();
          } catch (e) {
            toast.error(e instanceof ApiError ? e.detail : 'Delete failed');
          }
        },
      },
    ]);
  };

  const savePin = async () => {
    if (!pinFor || !newPin) return;
    try {
      await usersApi.update(pinFor.id, { pin: newPin });
      toast.success('PIN updated');
      setPinFor(null);
      setNewPin('');
    } catch {
      toast.error('Update failed');
    }
  };

  if (user?.role !== 'admin') {
    return (
      <Screen>
        <PageScroll>
          <Card>
            <Text className="text-center text-muted">You need admin privileges to manage users.</Text>
          </Card>
        </PageScroll>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageScroll>
        <View className="flex-row items-center justify-between gap-3">
          <Text variant="small" className="flex-1">Manage technicians &amp; admins for accountability</Text>
          <Button label="Add user" icon={<UserPlus size={16} color="#fff" />} onPress={() => setOpen(true)} />
        </View>

        <Card padded={false} className="overflow-hidden">
          {list.length === 0 && !loading ? (
            <EmptyState message="No users." />
          ) : (
            list.map((u) => (
              <View key={u.id} className="flex-row items-center gap-3 border-b border-line px-4 py-3">
                <View className="min-w-0 flex-1">
                  <Text className="font-sans-md text-sm text-ink" numberOfLines={1}>{u.name}</Text>
                  <Text variant="monoSm">{u.username}</Text>
                  <View className="mt-1">
                    <StatusBadge variant={u.role === 'admin' ? 'expiring90' : 'ok'}>{u.role}</StatusBadge>
                  </View>
                </View>
                <Switch
                  value={u.active}
                  onValueChange={() => toggleActive(u)}
                  disabled={u.id === user.id}
                  trackColor={{ true: '#0E7490', false: '#D7E2EC' }}
                  thumbColor="#fff"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  icon={<KeyRound size={16} color="#0B1220" />}
                  onPress={() => {
                    setPinFor(u);
                    setNewPin('');
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={u.id === user.id}
                  icon={<Trash2 size={16} color="#B42318" />}
                  onPress={() => removeUser(u)}
                />
              </View>
            ))
          )}
        </Card>
      </PageScroll>

      <SheetModal
        visible={open}
        onClose={() => setOpen(false)}
        title="Add user"
        footer={
          <>
            <Button variant="outline" label="Cancel" onPress={() => setOpen(false)} />
            <Button label="Create user" loading={saving} onPress={createUser} />
          </>
        }
      >
        <View className="gap-1.5">
          <Label>Full name</Label>
          <Input value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="e.g. John Doe" />
        </View>
        <View className="gap-1.5">
          <Label>Username</Label>
          <Input
            value={form.username}
            onChangeText={(v) => setForm({ ...form, username: v })}
            placeholder="lowercase, no spaces"
            autoCapitalize="none"
          />
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1 gap-1.5">
            <Label>Password</Label>
            <Input
              value={form.password}
              onChangeText={(v) => setForm({ ...form, password: v })}
              secureTextEntry
            />
          </View>
          <View className="flex-1 gap-1.5">
            <Label>PIN (4 digits)</Label>
            <Input
              value={form.pin}
              onChangeText={(v) => setForm({ ...form, pin: v.replace(/\D/g, '').slice(0, 4) })}
              maxLength={4}
              keyboardType="number-pad"
              className="font-mono"
            />
          </View>
        </View>
        <View className="gap-1.5">
          <Label>Role</Label>
          <Select
            value={form.role}
            onChange={(v) => setForm({ ...form, role: v })}
            title="Role"
            options={[
              { value: 'technician', label: 'Technician' },
              { value: 'admin', label: 'Admin' },
            ]}
          />
        </View>
      </SheetModal>

      <SheetModal
        visible={!!pinFor}
        onClose={() => setPinFor(null)}
        title="Reset PIN"
        description={pinFor ? `New 4-digit PIN for ${pinFor.username}` : undefined}
        footer={
          <>
            <Button variant="outline" label="Cancel" onPress={() => setPinFor(null)} />
            <Button label="Save PIN" onPress={savePin} />
          </>
        }
      >
        <View className="gap-1.5">
          <Label>New PIN</Label>
          <Input
            value={newPin}
            onChangeText={(v) => setNewPin(v.replace(/\D/g, '').slice(0, 4))}
            maxLength={4}
            keyboardType="number-pad"
            className="font-mono"
          />
        </View>
      </SheetModal>
    </Screen>
  );
}
