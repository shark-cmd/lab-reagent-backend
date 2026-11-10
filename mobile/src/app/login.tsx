import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FlaskConical } from 'lucide-react-native';
import { toast } from 'sonner-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PinInput } from '@/components/ui/pin-input';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!username || !password || !pin) {
      toast.error('Enter username, password and PIN');
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password, pin);
      toast.success('Welcome back');
      router.replace('/(app)/scan');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-page"
    >
      <ScrollView contentContainerClassName="flex-grow justify-center px-5 py-10" keyboardShouldPersistTaps="handled">
        <View className="mx-auto w-full max-w-md">
          <View className="mb-6 items-center">
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary">
              <FlaskConical size={28} color="#fff" />
            </View>
            <Text variant="h1" className="mt-4">LabStock</Text>
            <Text variant="small">Barcode-driven reagent &amp; QC inventory</Text>
          </View>

          <Card className="gap-4">
            <View className="gap-1.5">
              <Label>Username</Label>
              <Input
                value={username}
                onChangeText={setUsername}
                placeholder="e.g. admin"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
            </View>
            <View className="gap-1.5">
              <Label>Password</Label>
              <Input
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                secureTextEntry
                autoCapitalize="none"
              />
            </View>
            <View className="gap-1.5">
              <Label>
                PIN <Text variant="small" className="text-muted">(required)</Text>
              </Label>
              <PinInput value={pin} onChange={setPin} />
            </View>
            <Button label="Sign in" loading={loading} onPress={submit} size="lg" />
          </Card>

          <View className="mt-5 rounded-lg bg-surface2 p-3">
            <Text className="mb-1 font-sans-bold text-xs text-ink">Demo accounts</Text>
            <Text variant="small">Admin: admin / admin123 · PIN 1234</Text>
            <Text variant="small">Technician: tech / tech123 · PIN 5678</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
