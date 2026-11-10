import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Mail, Save, Send, TrendingUp } from 'lucide-react-native';
import { toast } from 'sonner-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState, PageScroll, Screen } from '@/components/ui/screen';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { ApiError, reports } from '@/lib/api';
import { money, riskVariant } from '@/lib/format';
import type { Digest, ExpiryForecast, Settings, UsageTrends } from '@/types/api';

type TabKey = 'trends' | 'forecast' | 'digest';

export default function ReportsScreen() {
  const [tab, setTab] = useState<TabKey>('trends');

  const [days, setDays] = useState(30);
  const [trends, setTrends] = useState<UsageTrends | null>(null);
  const [forecast, setForecast] = useState<ExpiryForecast | null>(null);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const loadTrends = useCallback(async (d: number) => {
    try {
      setTrends(await reports.usageTrends(d));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Failed to load usage trends');
    }
  }, []);

  useEffect(() => {
    void loadTrends(days);
  }, [days, loadTrends]);

  useEffect(() => {
    reports.expiryForecast().then(setForecast).catch(() => {});
    reports.digest().then(setDigest).catch(() => {});
    reports.settings().then(setSettings).catch(() => {});
  }, []);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await reports.updateSettings({
        digest_recipient: settings.digest_recipient,
        digest_time: settings.digest_time,
        digest_timezone: settings.digest_timezone,
      });
      setSettings(updated);
      toast.success('Digest settings saved');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const sendDigest = async () => {
    setSending(true);
    try {
      const res = await reports.sendDigest();
      toast.success(res.provider_configured ? 'Digest sent' : 'Digest prepared (no email provider configured)');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const maxDaily = Math.max(1, ...(trends?.daily || []).map((d) => d.qty));
  const maxItem = Math.max(1, ...(trends?.by_item || []).map((d) => d.qty));

  return (
    <Screen>
      <PageScroll>
        <View className="flex-row gap-2">
          {(
            [
              ['trends', 'Usage trends'],
              ['forecast', 'Expiry forecast'],
              ['digest', 'Email digest'],
            ] as [TabKey, string][]
          ).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              className={
                tab === key
                  ? 'flex-1 items-center rounded-lg border border-primary bg-primary-soft py-2'
                  : 'flex-1 items-center rounded-lg border border-line bg-surface py-2 active:bg-surface2'
              }
            >
              <Text className={tab === key ? 'font-sans-md text-xs text-primary' : 'font-sans-md text-xs text-muted'}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'trends' ? (
          <>
            <View className="flex-row gap-2">
              {[7, 30, 90].map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setDays(d)}
                  className={
                    days === d
                      ? 'rounded-lg border border-primary bg-primary px-4 py-1.5'
                      : 'rounded-lg border border-line bg-surface px-4 py-1.5 active:bg-surface2'
                  }
                >
                  <Text className={days === d ? 'font-sans-md text-xs text-white' : 'font-sans-md text-xs text-muted'}>
                    {d}d
                  </Text>
                </Pressable>
              ))}
            </View>

            <Card className="gap-3">
              <View className="flex-row items-center gap-2">
                <TrendingUp size={18} color="#0E7490" />
                <Text variant="title">Daily consumption</Text>
              </View>
              <View className="flex-row gap-4">
                <Text variant="small">Total used: {trends?.total_used ?? 0}</Text>
                <Text variant="small">Active reagents: {trends?.active_reagents ?? 0}</Text>
              </View>
              {(trends?.daily || []).length === 0 ? (
                <EmptyState message="No usage in this period." />
              ) : (
                <View>
                  <View className="h-40 flex-row items-end">
                    {(trends?.daily || []).map((d, i) => (
                      <View key={i} className="flex-1 justify-end">
                        <View
                          className="w-full rounded-t bg-primary"
                          style={{ height: `${Math.max(2, (d.qty / maxDaily) * 100)}%` }}
                        />
                      </View>
                    ))}
                  </View>
                  <View className="mt-1 flex-row justify-between">
                    <Text variant="small">{trends?.daily?.[0]?.date}</Text>
                    <Text variant="small">{trends?.daily?.[trends.daily.length - 1]?.date}</Text>
                  </View>
                </View>
              )}
            </Card>

            <Card className="gap-3">
              <Text variant="title">Top consumed</Text>
              {(trends?.by_item || []).length === 0 ? (
                <EmptyState message="Nothing consumed yet." />
              ) : (
                (trends?.by_item || []).map((it) => (
                  <View key={it.item_id} className="gap-1">
                    <View className="flex-row justify-between gap-2">
                      <Text variant="small" className="flex-1" numberOfLines={1}>{it.name}</Text>
                      <Text variant="small">{it.qty} {it.unit}</Text>
                    </View>
                    <View className="h-2 rounded bg-surface2">
                      <View className="h-2 rounded bg-primary" style={{ width: `${(it.qty / maxItem) * 100}%` }} />
                    </View>
                  </View>
                ))
              )}
            </Card>
          </>
        ) : null}

        {tab === 'forecast' ? (
          <>
            <View className="flex-row gap-3">
              <Card className="flex-1">
                <Text variant="small">At-risk lots</Text>
                <Text variant="kpi" className="text-2xl">{forecast?.summary.at_risk_lots ?? 0}</Text>
              </Card>
              <Card className="flex-1">
                <Text variant="small">Waste value</Text>
                <Text variant="kpi" className="text-2xl">{money(forecast?.summary.total_waste_value)}</Text>
              </Card>
            </View>
            <Card padded={false} className="overflow-hidden">
              {(forecast?.rows || []).length === 0 ? (
                <EmptyState message="No expiry risk detected." />
              ) : (
                (forecast?.rows || []).map((r, i) => (
                  <View key={`${r.barcode}-${r.lot}-${i}`} className="border-b border-line px-4 py-3">
                    <View className="flex-row items-start justify-between gap-2">
                      <View className="min-w-0 flex-1">
                        <Text className="font-sans-md text-sm text-ink" numberOfLines={1}>{r.name}</Text>
                        <Text variant="monoSm">{r.lot || '-'} · exp {r.expiry}</Text>
                      </View>
                      <StatusBadge variant={riskVariant(r.risk)}>{r.risk}</StatusBadge>
                    </View>
                    <View className="mt-1.5 flex-row flex-wrap gap-x-4 gap-y-1">
                      <Text variant="small">Qty: {r.qty} {r.unit}</Text>
                      <Text variant="small">Days to expiry: {r.days_to_expiry}</Text>
                      <Text variant="small">Projected waste: {r.projected_waste}</Text>
                      <Text variant="small">Value: {money(r.waste_value)}</Text>
                    </View>
                  </View>
                ))
              )}
            </Card>
          </>
        ) : null}

        {tab === 'digest' ? (
          <>
            <Card className="gap-3">
              <View className="flex-row items-center gap-2">
                <Mail size={18} color="#0E7490" />
                <Text variant="title">Digest settings</Text>
              </View>
              <View className="gap-1.5">
                <Label>Recipient</Label>
                <Input
                  value={settings?.digest_recipient ?? ''}
                  onChangeText={(v) => settings && setSettings({ ...settings, digest_recipient: v })}
                  placeholder="supervisor@lab.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
              <View className="gap-1.5">
                <Label>Send time</Label>
                <Input
                  value={settings?.digest_time ?? ''}
                  onChangeText={(v) => settings && setSettings({ ...settings, digest_time: v })}
                  placeholder="09:00"
                  className="font-mono"
                />
              </View>
              <View className="flex-row gap-2">
                <Button label="Save" loading={saving} icon={<Save size={16} color="#fff" />} onPress={saveSettings} />
                <Button
                  variant="outline"
                  label="Send now"
                  loading={sending}
                  icon={<Send size={16} color="#0B1220" />}
                  onPress={sendDigest}
                />
              </View>
            </Card>

            <Card className="gap-2">
              <Text variant="title">Low stock preview ({digest?.summary.low_stock_count ?? 0})</Text>
              {(digest?.low_stock || []).length === 0 ? (
                <Text variant="small">All stock levels healthy.</Text>
              ) : (
                (digest?.low_stock || []).map((r) => (
                  <View key={r.id} className="flex-row justify-between gap-2">
                    <Text variant="small" className="flex-1" numberOfLines={1}>{r.name}</Text>
                    <Text variant="small">{r.total}/{r.min_stock}</Text>
                  </View>
                ))
              )}
            </Card>

            <Card className="gap-2">
              <Text variant="title">Expiring preview ({digest?.summary.expiring_count ?? 0})</Text>
              {(digest?.expiring || []).length === 0 ? (
                <Text variant="small">Nothing expiring soon.</Text>
              ) : (
                (digest?.expiring || []).map((e, i) => (
                  <View key={`${e.barcode}-${i}`} className="flex-row justify-between gap-2">
                    <Text variant="small" className="flex-1" numberOfLines={1}>{e.name}</Text>
                    <Text variant="small">{e.expiry} ({e.days_left}d)</Text>
                  </View>
                ))
              )}
            </Card>
          </>
        ) : null}
      </PageScroll>
    </Screen>
  );
}
