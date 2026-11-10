import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, View } from 'react-native';
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  DatabaseBackup,
  Download,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react-native';
import { toast } from 'sonner-native';

import { InfoBanner } from '@/components/info-banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SheetModal } from '@/components/ui/modal';
import { EmptyState, PageScroll, Screen } from '@/components/ui/screen';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/AuthContext';
import { ApiError, inventory } from '@/lib/api';
import { downloadAndShare } from '@/lib/download';
import { expiryLabel, formatDate, money } from '@/lib/format';
import { expiryVariant } from '@/constants/theme';
import type { DashboardData, DashboardItem } from '@/types/api';

type TabKey = 'reorder' | 'expiring' | 'items';

export default function DashboardScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('reorder');
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [editItem, setEditItem] = useState<DashboardItem | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await inventory.dashboard());
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const k = data.kpis;
    if (k?.low_stock_count > 0) setTab('reorder');
    else if (k?.expiring_count > 0) setTab('expiring');
    else setTab('items');
  }, [data]);

  const doDownload = async (path: string, filename: string) => {
    try {
      await downloadAndShare(path, filename);
      toast.success(`Downloaded ${filename}`);
    } catch {
      toast.error('Download failed');
    }
  };

  const runImport = async () => {
    if (!importText.trim()) {
      toast.error('Paste CSV data first');
      return;
    }
    setImporting(true);
    try {
      const res = await inventory.importCsv(importText);
      toast.success(`Imported ${res.imported} row(s)`, {
        description: res.errors.length ? `${res.errors.length} row(s) skipped` : undefined,
      });
      setImportOpen(false);
      setImportText('');
      void load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const saveEdit = async () => {
    if (!editItem) return;
    setSaving(true);
    try {
      await inventory.itemUpdate({
        id: editItem.id,
        name: editItem.name,
        unit: editItem.unit,
        min_stock: parseFloat(String(editItem.min_stock)) || 0,
        location: editItem.location,
        storage: editItem.storage,
        cost: parseFloat(String(editItem.cost)) || 0,
      });
      toast.success('Item updated');
      setEditItem(null);
      void load();
    } catch {
      toast.error('Update failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = (item: DashboardItem) => {
    Alert.alert('Delete item', `Delete "${item.name}"? This removes all its lots.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await inventory.deleteItem(item.id);
            toast.success('Item deleted');
            void load();
          } catch (e) {
            toast.error(e instanceof ApiError ? e.detail : 'Delete failed (admin only)');
          }
        },
      },
    ]);
  };

  const k = data?.kpis;
  const items = (data?.items || []).filter((it) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      it.name.toLowerCase().includes(q) ||
      it.barcode.toLowerCase().includes(q) ||
      (it.location || '').toLowerCase().includes(q)
    );
  });

  return (
    <Screen>
      <PageScroll
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor="#0E7490" />
        }
      >
        <InfoBanner id="dashboard">
          The cards summarise your whole store. <Text className="font-sans-bold">Reorder</Text> lists items below
          their minimum stock, <Text className="font-sans-bold">Expiring</Text> shows lots within 90 days, and{' '}
          <Text className="font-sans-bold">All items</Text> lets you search and fine-tune each item. Use Import CSV or
          the Bulk Add screen to load your register.
        </InfoBanner>

        <Text variant="small">Inventory overview, alerts &amp; data tools</Text>

        {/* Actions */}
        <View className="flex-row flex-wrap gap-2">
          {isAdmin ? (
            <Button size="sm" label="Import CSV" icon={<Upload size={16} color="#fff" />} onPress={() => setImportOpen(true)} />
          ) : null}
          <Button
            variant="outline"
            size="sm"
            label="Refresh"
            icon={<RefreshCw size={16} color="#0B1220" />}
            onPress={load}
          />
          <Button
            variant="outline"
            size="sm"
            label="Items CSV"
            icon={<Download size={16} color="#0B1220" />}
            onPress={() => doDownload('/export/items.csv', 'labstock_items.csv')}
          />
          <Button
            variant="outline"
            size="sm"
            label="History CSV"
            icon={<Download size={16} color="#0B1220" />}
            onPress={() => doDownload('/export/history.csv', 'labstock_history.csv')}
          />
          <Button
            variant="outline"
            size="sm"
            label="Backup"
            icon={<DatabaseBackup size={16} color="#0B1220" />}
            onPress={() => doDownload('/backup', 'labstock_backup.json')}
          />
        </View>

        {/* KPIs */}
        <View className="gap-3">
          <View className="flex-row gap-3">
            <StatCard
              icon={Wallet}
              label="Inventory value"
              value={loading ? '-' : money(k?.total_value)}
              sub={`${k?.total_items || 0} items`}
              iconBg="#E6F6FA"
              iconColor="#0E7490"
            />
            <StatCard
              icon={AlertTriangle}
              label="Low stock"
              value={loading ? '-' : (k?.low_stock_count ?? 0)}
              sub="Needs reorder"
              iconBg="#FFF4E6"
              iconColor="#B45309"
            />
          </View>
          <View className="flex-row gap-3">
            <StatCard
              icon={CalendarClock}
              label="Expiring ≤90d"
              value={loading ? '-' : (k?.expiring_count ?? 0)}
              sub={`30d ${k?.expiring_buckets?.d30 || 0} · 60d ${k?.expiring_buckets?.d60 || 0} · 90d ${k?.expiring_buckets?.d90 || 0}`}
              iconBg="#E8F2FF"
              iconColor="#0B5CAD"
            />
            <StatCard
              icon={Boxes}
              label="Total items"
              value={loading ? '-' : (k?.total_items ?? 0)}
              sub="Registered SKUs"
              iconBg="#EAF7F0"
              iconColor="#1F7A4D"
            />
          </View>
        </View>

        {/* Tabs */}
        <View className="flex-row gap-2">
          {(
            [
              ['reorder', `Reorder (${k?.low_stock_count || 0})`],
              ['expiring', `Expiring (${k?.expiring_count || 0})`],
              ['items', `All items (${k?.total_items || 0})`],
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

        {/* Reorder */}
        {tab === 'reorder' ? (
          <Card padded={false} className="overflow-hidden">
            {(data?.reorder || []).length === 0 && !loading ? (
              <EmptyState message="No reorder alerts, stock levels are healthy." />
            ) : (
              (data?.reorder || []).map((r) => (
                <View key={r.id} className="border-b border-line px-4 py-3">
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="min-w-0 flex-1">
                      <Text className="font-sans-md text-sm text-ink" numberOfLines={1}>{r.name}</Text>
                      <Text variant="monoSm">{r.barcode}</Text>
                    </View>
                    <StatusBadge variant="low">Low</StatusBadge>
                  </View>
                  <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
                    <Text variant="small">On hand: {r.total} {r.unit}</Text>
                    <Text variant="small">Min: {r.min_stock}</Text>
                    <Text className="text-xs text-warning">Shortfall: {r.shortfall}</Text>
                    <Text variant="small">Loc: {r.location || '-'}</Text>
                    <Text variant="small">Days left: {r.days_left ?? '-'}</Text>
                  </View>
                </View>
              ))
            )}
          </Card>
        ) : null}

        {/* Expiring */}
        {tab === 'expiring' ? (
          <Card padded={false} className="overflow-hidden">
            {(data?.expiring || []).length === 0 && !loading ? (
              <EmptyState message="Nothing expiring within 90 days." />
            ) : (
              (data?.expiring || []).map((e, i) => (
                <View key={`${e.barcode}-${e.lot}-${i}`} className="border-b border-line px-4 py-3">
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="min-w-0 flex-1">
                      <Text className="font-sans-md text-sm text-ink" numberOfLines={1}>{e.name}</Text>
                      <Text variant="monoSm">
                        {e.lot || '-'} · exp {e.expiry}
                      </Text>
                    </View>
                    <StatusBadge variant={expiryVariant(e.days_left)}>{expiryLabel(e.days_left)}</StatusBadge>
                  </View>
                  <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
                    <Text variant="small">Qty: {e.qty} {e.unit}</Text>
                    <Text variant="small">Days left: {e.days_left}</Text>
                    <Text variant="small">Loc: {e.location || '-'}</Text>
                  </View>
                </View>
              ))
            )}
          </Card>
        ) : null}

        {/* All items */}
        {tab === 'items' ? (
          <>
            <View className="relative">
              <Input
                value={search}
                onChangeText={setSearch}
                placeholder="Search items, barcode, location…"
                className="h-10 pl-9"
              />
              <View className="absolute left-3 top-3">
                <Search size={16} color="#94a3b8" />
              </View>
            </View>
            <Card padded={false} className="overflow-hidden">
              {items.length === 0 && !loading ? (
                <EmptyState message="No items yet. Use the Scan screen to receive stock or import a CSV." />
              ) : (
                items.map((it) => (
                  <View key={it.id} className="border-b border-line px-4 py-3">
                    <View className="flex-row items-start justify-between gap-2">
                      <View className="min-w-0 flex-1">
                        <Text className="font-sans-md text-sm text-ink" numberOfLines={1}>{it.name}</Text>
                        <Text variant="monoSm">{it.barcode}</Text>
                      </View>
                      {it.low_stock ? <StatusBadge variant="low">Low</StatusBadge> : <StatusBadge variant="ok">OK</StatusBadge>}
                    </View>
                    <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
                      <Text variant="small">On hand: {it.total} {it.unit}</Text>
                      <Text variant="small">Lots: {it.lot_count}</Text>
                      <Text variant="small">Min: {it.min_stock}</Text>
                      <Text variant="small">Loc: {it.location || '-'}</Text>
                      <Text variant="small">Last used: {formatDate(it.last_used_on)}</Text>
                      {it.nearest_expiry_lot ? (
                        <Text
                          variant="small"
                          className={
                            (it.nearest_expiry_days ?? 999) <= 30
                              ? 'text-danger'
                              : (it.nearest_expiry_days ?? 999) <= 60
                                ? 'text-warning'
                                : ''
                          }
                        >
                          Expiring: {it.nearest_expiry_lot} ({it.nearest_expiry_days}d)
                        </Text>
                      ) : null}
                      <Text variant="small">Cost: {money(it.cost)}</Text>
                    </View>
                    {isAdmin ? (
                      <View className="mt-2 flex-row gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          label="Edit"
                          icon={<Pencil size={14} color="#0B1220" />}
                          onPress={() => setEditItem({ ...it, min_stock: it.min_stock, cost: it.cost })}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          label="Delete"
                          className="border-danger-line"
                          textClassName="text-danger"
                          icon={<Trash2 size={14} color="#B42318" />}
                          onPress={() => deleteItem(it)}
                        />
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </Card>
          </>
        ) : null}
      </PageScroll>

      {/* Import CSV */}
      <SheetModal
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import stock (CSV)"
        description="Columns: barcode, name, qty, lot, expiry, min_stock, location, storage, cost, unit. Unknown barcodes are auto-registered."
        footer={
          <>
            <Button variant="outline" label="Cancel" onPress={() => setImportOpen(false)} />
            <Button label="Import" loading={importing} onPress={runImport} />
          </>
        }
      >
        <View className="gap-1.5">
          <Label>Paste CSV</Label>
          <Input
            value={importText}
            onChangeText={setImportText}
            placeholder={'barcode,name,qty,lot,expiry,min_stock,location,storage,cost,unit\n5901234,Glucose Reagent,20,L23,2026-03-01,10,Fridge 1,2-8C,3.50,mL'}
            multiline
            numberOfLines={8}
            className="h-40 font-mono text-xs"
            textAlignVertical="top"
            autoCapitalize="none"
          />
        </View>
      </SheetModal>

      {/* Edit item */}
      <SheetModal
        visible={!!editItem}
        onClose={() => setEditItem(null)}
        title="Edit item"
        footer={
          <>
            <Button variant="outline" label="Cancel" onPress={() => setEditItem(null)} />
            <Button label="Save" loading={saving} icon={<Save size={16} color="#fff" />} onPress={saveEdit} />
          </>
        }
      >
        {editItem ? (
          <>
            <View className="gap-1.5">
              <Label>Name</Label>
              <Input value={editItem.name} onChangeText={(v) => setEditItem({ ...editItem, name: v })} />
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1 gap-1.5">
                <Label>Unit</Label>
                <Input value={editItem.unit} onChangeText={(v) => setEditItem({ ...editItem, unit: v })} />
              </View>
              <View className="flex-1 gap-1.5">
                <Label>Min stock</Label>
                <Input
                  value={String(editItem.min_stock)}
                  onChangeText={(v) => setEditItem({ ...editItem, min_stock: v as never })}
                  keyboardType="numeric"
                />
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1 gap-1.5">
                <Label>Location</Label>
                <Input value={editItem.location} onChangeText={(v) => setEditItem({ ...editItem, location: v })} />
              </View>
              <View className="flex-1 gap-1.5">
                <Label>Storage</Label>
                <Input value={editItem.storage} onChangeText={(v) => setEditItem({ ...editItem, storage: v })} />
              </View>
            </View>
            <View className="gap-1.5">
              <Label>Unit cost</Label>
              <Input
                value={String(editItem.cost)}
                onChangeText={(v) => setEditItem({ ...editItem, cost: v as never })}
                keyboardType="numeric"
              />
            </View>
          </>
        ) : null}
      </SheetModal>
    </Screen>
  );
}
