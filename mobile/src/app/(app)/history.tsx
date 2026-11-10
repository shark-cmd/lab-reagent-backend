import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import { toast } from 'sonner-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, PageScroll, Screen } from '@/components/ui/screen';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { ApiError, audit } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { StatusVariant } from '@/constants/theme';
import type { LogEntry } from '@/types/api';

const ACTION_META: Record<string, { label: string; variant: StatusVariant }> = {
  in: { label: 'Stock in', variant: 'ok' },
  use: { label: 'Use', variant: 'expiring90' },
  register: { label: 'Register', variant: 'neutral' },
  adjust: { label: 'Adjust', variant: 'low' },
  adjust_out: { label: 'Adjust out', variant: 'low' },
  move: { label: 'Move', variant: 'neutral' },
  edit: { label: 'Edit', variant: 'neutral' },
  delete: { label: 'Delete', variant: 'expired' },
  import: { label: 'Import', variant: 'ok' },
};

const ACTIONS = ['in', 'use', 'register', 'adjust', 'move', 'edit', 'delete'];

export default function HistoryScreen() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('all');
  const [technician, setTechnician] = useState('all');
  const [techs, setTechs] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await audit.history({
        limit: 500,
        action: action === 'all' ? undefined : action,
        technician: technician === 'all' ? undefined : technician,
      });
      setLogs(res.logs);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [action, technician]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    audit
      .technicians()
      .then((res) => setTechs(res.technicians))
      .catch(() => {});
  }, []);

  return (
    <Screen>
      <PageScroll>
        <Text variant="small">Append-only record of every transaction (NABL / ISO 15189)</Text>

        <View className="flex-row flex-wrap gap-2">
          <Select
            className="min-w-[140px] flex-1"
            title="Action"
            value={action}
            onChange={setAction}
            options={[{ value: 'all', label: 'All actions' }, ...ACTIONS.map((a) => ({ value: a, label: ACTION_META[a]?.label || a }))]}
          />
          <Select
            className="min-w-[150px] flex-1"
            title="Technician"
            value={technician}
            onChange={setTechnician}
            options={[{ value: 'all', label: 'All technicians' }, ...techs.map((t) => ({ value: t, label: t }))]}
          />
          <Button
            variant="outline"
            label="Refresh"
            icon={<RefreshCw size={16} color="#0B1220" />}
            onPress={load}
          />
        </View>

        <Card padded={false} className="overflow-hidden">
          {logs.length === 0 && !loading ? (
            <EmptyState message="No log entries yet." />
          ) : (
            logs.map((l) => {
              const meta = ACTION_META[l.action] || { label: l.action, variant: 'neutral' as StatusVariant };
              return (
                <View key={l.id} className="border-b border-line px-4 py-3">
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="min-w-0 flex-1">
                      <Text className="font-sans-md text-sm text-ink" numberOfLines={1}>
                        {l.item_name || '-'}
                      </Text>
                      <Text variant="monoSm">{formatDateTime(l.ts)}</Text>
                    </View>
                    <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
                  </View>
                  <View className="mt-1.5 flex-row flex-wrap gap-x-4 gap-y-1">
                    <Text variant="small">Qty: {l.qty || 0}</Text>
                    {l.lot ? <Text variant="monoSm">Lot: {l.lot}</Text> : null}
                    <Text variant="small">By: {l.technician || '-'}</Text>
                  </View>
                  {l.detail ? <Text variant="small" className="mt-1">{l.detail}</Text> : null}
                </View>
              );
            })
          )}
        </Card>
      </PageScroll>
    </Screen>
  );
}
