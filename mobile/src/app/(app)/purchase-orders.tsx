import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { FileText, Mail, PackageCheck, Plus, ShoppingCart, Trash2 } from 'lucide-react-native';
import { toast } from 'sonner-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SheetModal } from '@/components/ui/modal';
import { EmptyState, PageScroll, Screen } from '@/components/ui/screen';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/AuthContext';
import { ApiError, inventory, purchaseOrders } from '@/lib/api';
import { downloadAndShare } from '@/lib/download';
import { money } from '@/lib/format';
import type { StatusVariant } from '@/constants/theme';
import type { PurchaseOrder, PurchaseOrderLine } from '@/types/api';

const STATUS_VARIANT: Record<string, StatusVariant> = {
  draft: 'neutral',
  ordered: 'expiring90',
  received: 'ok',
  cancelled: 'expired',
};

interface DraftLine extends PurchaseOrderLine {
  order_qty: number;
}

export default function PurchaseOrdersScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);

  // New PO
  const [newOpen, setNewOpen] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await purchaseOrders.list();
      setOrders(res.purchase_orders);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openNewFromReorder = async () => {
    try {
      const dash = await inventory.dashboard();
      const draftLines: DraftLine[] = (dash.reorder || []).map((r) => ({
        item_id: r.id,
        barcode: r.barcode,
        name: r.name,
        unit: r.unit,
        on_hand: r.total,
        min_stock: r.min_stock,
        order_qty: Math.max(1, Math.ceil(r.shortfall || 1)),
        cost: 0,
      }));
      if (draftLines.length === 0) {
        toast.info('No reorder items — nothing to order.');
        return;
      }
      setLines(draftLines);
      setSupplier('');
      setSupplierEmail('');
      setNotes('');
      setNewOpen(true);
    } catch {
      toast.error('Failed to load reorder list');
    }
  };

  const total = lines.reduce((sum, l) => sum + (l.order_qty || 0) * (l.cost || 0), 0);

  const createPo = async () => {
    const payloadLines = lines
      .filter((l) => l.order_qty > 0)
      .map(({ order_qty, ...rest }) => ({ ...rest, order_qty }));
    if (payloadLines.length === 0) {
      toast.error('Add at least one line with a quantity');
      return;
    }
    setCreating(true);
    try {
      await purchaseOrders.create({ supplier, supplier_email: supplierEmail, notes, lines: payloadLines });
      toast.success('Purchase order created');
      setNewOpen(false);
      void load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const updateStatus = async (po: PurchaseOrder, status: string) => {
    setBusy(true);
    try {
      const updated = await purchaseOrders.update(po.id, { status });
      setSelected(updated);
      void load();
      toast.success(`Marked ${status}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const receivePo = async (po: PurchaseOrder) => {
    setBusy(true);
    try {
      const updated = await purchaseOrders.receive(po.id);
      setSelected(updated);
      void load();
      toast.success('Received into stock');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Receive failed');
    } finally {
      setBusy(false);
    }
  };

  const emailPo = async (po: PurchaseOrder) => {
    setBusy(true);
    try {
      const res = await purchaseOrders.email(po.id);
      toast.success(res.provider_configured ? 'Email sent' : 'Email prepared (no provider configured)');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Email failed');
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = async (po: PurchaseOrder) => {
    try {
      await downloadAndShare(`/purchase-orders/${po.id}/pdf`, `${po.po_number}.pdf`);
    } catch {
      toast.error('PDF download failed');
    }
  };

  const removePo = (po: PurchaseOrder) => {
    Alert.alert('Delete purchase order', `Delete ${po.po_number}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await purchaseOrders.remove(po.id);
            setSelected(null);
            void load();
            toast.success('Deleted');
          } catch (e) {
            toast.error(e instanceof ApiError ? e.detail : 'Delete failed');
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <PageScroll>
        <View className="flex-row items-center justify-between gap-3">
          <Text variant="small" className="flex-1">Create and track supplier orders</Text>
          <Button label="New PO" icon={<Plus size={16} color="#fff" />} onPress={openNewFromReorder} />
        </View>

        <Card padded={false} className="overflow-hidden">
          {orders.length === 0 && !loading ? (
            <EmptyState icon={<ShoppingCart size={28} color="#cbd5e1" />} message="No purchase orders yet." />
          ) : (
            orders.map((po) => (
              <Pressable
                key={po.id}
                onPress={() => setSelected(po)}
                className="border-b border-line px-4 py-3 active:bg-surface2"
              >
                <View className="flex-row items-start justify-between gap-2">
                  <View className="min-w-0 flex-1">
                    <Text className="font-sans-md text-sm text-ink">{po.po_number}</Text>
                    <Text variant="small" numberOfLines={1}>
                      {po.supplier || 'No supplier'} · {po.lines.length} line(s)
                    </Text>
                  </View>
                  <View className="items-end gap-1">
                    <StatusBadge variant={STATUS_VARIANT[po.status] || 'neutral'}>{po.status}</StatusBadge>
                    <Text variant="small">{money(po.total_cost)}</Text>
                  </View>
                </View>
              </Pressable>
            ))
          )}
        </Card>
      </PageScroll>

      {/* New PO */}
      <SheetModal
        visible={newOpen}
        onClose={() => setNewOpen(false)}
        title="New purchase order"
        description="Auto-filled from reorder alerts. Adjust quantities, then create."
        footer={
          <>
            <Button variant="outline" label="Cancel" onPress={() => setNewOpen(false)} />
            <Button label="Create PO" loading={creating} onPress={createPo} />
          </>
        }
      >
        <View className="gap-1.5">
          <Label>Supplier</Label>
          <Input value={supplier} onChangeText={setSupplier} placeholder="Supplier name" />
        </View>
        <View className="gap-1.5">
          <Label>Supplier email</Label>
          <Input
            value={supplierEmail}
            onChangeText={setSupplierEmail}
            placeholder="orders@supplier.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>
        <View className="gap-1.5">
          <Label>Notes</Label>
          <Input value={notes} onChangeText={setNotes} placeholder="Optional notes" />
        </View>

        <Text variant="title" className="mt-2">Lines ({lines.length})</Text>
        {lines.map((l, idx) => (
          <View key={`${l.barcode}-${idx}`} className="flex-row items-center gap-2 rounded-lg border border-line px-3 py-2">
            <View className="min-w-0 flex-1">
              <Text className="font-sans-md text-xs text-ink" numberOfLines={1}>{l.name}</Text>
              <Text variant="monoSm">{l.barcode}</Text>
            </View>
            <Input
              value={String(l.order_qty)}
              onChangeText={(v) =>
                setLines((prev) =>
                  prev.map((x, i) => (i === idx ? { ...x, order_qty: parseFloat(v) || 0 } : x))
                )
              }
              keyboardType="numeric"
              className="h-9 w-16 text-center"
            />
            <Pressable onPress={() => setLines((prev) => prev.filter((_, i) => i !== idx))}>
              <Trash2 size={16} color="#94a3b8" />
            </Pressable>
          </View>
        ))}
        <Text variant="small" className="mt-1 text-right">Total: {money(total)}</Text>
      </SheetModal>

      {/* View PO */}
      <SheetModal
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.po_number ?? 'Purchase order'}
        description={selected ? `${selected.supplier || 'No supplier'} · ${selected.status}` : undefined}
        footer={
          selected ? (
            <>
              {selected.status !== 'received' && selected.status !== 'cancelled' ? (
                <Button
                  variant="outline"
                  label="Mark ordered"
                  disabled={busy}
                  onPress={() => updateStatus(selected, 'ordered')}
                />
              ) : null}
              {selected.status !== 'received' ? (
                <Button label="Receive" loading={busy} onPress={() => receivePo(selected)} />
              ) : null}
            </>
          ) : null
        }
      >
        {selected ? (
          <>
            <View className="flex-row flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                label="PDF"
                icon={<FileText size={14} color="#0B1220" />}
                onPress={() => downloadPdf(selected)}
              />
              <Button
                variant="outline"
                size="sm"
                label="Email"
                icon={<Mail size={14} color="#0B1220" />}
                onPress={() => emailPo(selected)}
              />
              {selected.status !== 'received' && selected.status !== 'cancelled' ? (
                <Button
                  variant="outline"
                  size="sm"
                  label="Cancel PO"
                  onPress={() => updateStatus(selected, 'cancelled')}
                />
              ) : null}
              {isAdmin ? (
                <Button
                  variant="outline"
                  size="sm"
                  label="Delete"
                  className="border-danger-line"
                  textClassName="text-danger"
                  onPress={() => removePo(selected)}
                />
              ) : null}
            </View>

            <View className="mt-2 gap-2">
              {selected.lines.map((l, i) => (
                <View key={`${l.barcode}-${i}`} className="rounded-lg border border-line px-3 py-2">
                  <Text className="font-sans-md text-sm text-ink" numberOfLines={1}>{l.name}</Text>
                  <Text variant="monoSm">{l.barcode}</Text>
                  <View className="mt-1 flex-row flex-wrap gap-x-4">
                    <Text variant="small">Order: {l.order_qty} {l.unit}</Text>
                    <Text variant="small">On hand: {l.on_hand}</Text>
                    <Text variant="small">Min: {l.min_stock}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View className="mt-2 flex-row items-center justify-between">
              <Text variant="title">Total</Text>
              <Text variant="title">{money(selected.total_cost)}</Text>
            </View>
            {selected.status === 'received' ? (
              <View className="flex-row items-center gap-2">
                <PackageCheck size={16} color="#1F7A4D" />
                <Text variant="small">Received into stock</Text>
              </View>
            ) : null}
          </>
        ) : null}
      </SheetModal>
    </Screen>
  );
}
