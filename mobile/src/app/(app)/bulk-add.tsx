import { useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ClipboardPaste, Copy, Plus, Rows3, Trash2, Upload } from 'lucide-react-native';
import { toast } from 'sonner-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageScroll, Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { ApiError, inventory } from '@/lib/api';

interface Row {
  key: string;
  barcode: string;
  name: string;
  qty: string;
  lot: string;
  expiry: string;
  unit: string;
  min_stock: string;
  location: string;
  storage: string;
  cost: string;
}

let seq = 0;
const newRow = (): Row => ({
  key: `r${Date.now()}-${seq++}`,
  barcode: '',
  name: '',
  qty: '1',
  lot: '',
  expiry: '',
  unit: 'unit',
  min_stock: '0',
  location: '',
  storage: 'Ambient',
  cost: '0',
});

const DEFAULT_HEADERS = [
  'barcode',
  'name',
  'qty',
  'lot',
  'expiry',
  'min_stock',
  'location',
  'storage',
  'cost',
  'unit',
];

function parsePasted(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const split = (l: string) =>
    l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));

  let headers = split(lines[0]).map((h) => h.toLowerCase());
  let start = 1;
  if (!headers.includes('barcode')) {
    headers = DEFAULT_HEADERS;
    start = 0;
  }
  const idx = (name: string) => headers.indexOf(name);
  const get = (cells: string[], name: string) => {
    const i = idx(name);
    return i >= 0 ? (cells[i] ?? '') : '';
  };

  return lines
    .slice(start)
    .map((line) => {
      const cells = split(line);
      return {
        key: newRow().key,
        barcode: get(cells, 'barcode'),
        name: get(cells, 'name'),
        qty: get(cells, 'qty') || '1',
        lot: get(cells, 'lot'),
        expiry: get(cells, 'expiry'),
        unit: get(cells, 'unit') || 'unit',
        min_stock: get(cells, 'min_stock') || '0',
        location: get(cells, 'location'),
        storage: get(cells, 'storage') || 'Ambient',
        cost: get(cells, 'cost') || '0',
      };
    })
    .filter((r) => r.barcode);
}

export default function BulkAddScreen() {
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 3 }, newRow));
  const [busy, setBusy] = useState(false);

  const update = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const pasteFromClipboard = async () => {
    const text = await Clipboard.getStringAsync();
    if (!text?.trim()) {
      toast.error('Clipboard is empty');
      return;
    }
    const parsed = parsePasted(text);
    if (!parsed.length) {
      toast.error('No rows with a barcode found');
      return;
    }
    setRows(parsed);
    toast.success(`Pasted ${parsed.length} row(s)`);
  };

  const submit = async () => {
    const items = rows
      .filter((r) => r.barcode.trim())
      .map((r) => ({
        barcode: r.barcode.trim(),
        qty: parseFloat(r.qty) || 0,
        lot: r.lot,
        expiry: r.expiry,
        name: r.name || undefined,
        unit: r.unit || 'unit',
        min_stock: parseFloat(r.min_stock) || 0,
        location: r.location,
        storage: r.storage || 'Ambient',
        cost: parseFloat(r.cost) || 0,
      }));

    if (items.length === 0) {
      toast.error('Add at least one row with a barcode');
      return;
    }
    setBusy(true);
    try {
      const res = await inventory.receiveCommit(items);
      toast.success(`Received ${res.count} line(s)`, {
        description: `${res.registered} registered · ${res.errors.length} error(s)`,
      });
      setRows(Array.from({ length: 3 }, newRow));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Submit failed');
    } finally {
      setBusy(false);
    }
  };

  const filled = rows.filter((r) => r.barcode.trim()).length;

  return (
    <Screen>
      <PageScroll>
        <Text variant="small">Add many reagents at once — paste from Excel or fill rows below</Text>

        <View className="flex-row flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            label="Paste from Excel"
            icon={<ClipboardPaste size={16} color="#0B1220" />}
            onPress={pasteFromClipboard}
          />
          <Button
            variant="outline"
            size="sm"
            label="+5 rows"
            icon={<Rows3 size={16} color="#0B1220" />}
            onPress={() => setRows((prev) => [...prev, ...Array.from({ length: 5 }, newRow)])}
          />
          <Button
            variant="outline"
            size="sm"
            label="Add row"
            icon={<Plus size={16} color="#0B1220" />}
            onPress={() => setRows((prev) => [...prev, newRow()])}
          />
          <Button
            variant="outline"
            size="sm"
            label="Clear"
            icon={<Trash2 size={16} color="#0B1220" />}
            onPress={() => setRows(Array.from({ length: 3 }, newRow))}
          />
        </View>

        {rows.map((row, i) => (
          <Card key={row.key} className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="font-sans-md text-xs text-muted">Row {i + 1}</Text>
              <View className="flex-row gap-1">
                <Pressable
                  hitSlop={6}
                  onPress={() => setRows((prev) => [...prev.slice(0, i + 1), { ...row, key: newRow().key }, ...prev.slice(i + 1)])}
                >
                  <Copy size={16} color="#94a3b8" />
                </Pressable>
                <Pressable hitSlop={6} onPress={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}>
                  <Trash2 size={16} color="#94a3b8" />
                </Pressable>
              </View>
            </View>

            <View className="gap-1.5">
              <Label>Barcode *</Label>
              <Input
                value={row.barcode}
                onChangeText={(v) => update(row.key, { barcode: v })}
                className="font-mono"
                autoCapitalize="none"
                placeholder="e.g. I0000727"
              />
            </View>
            <View className="gap-1.5">
              <Label>Name</Label>
              <Input value={row.name} onChangeText={(v) => update(row.key, { name: v })} placeholder="Item name" />
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1 gap-1.5">
                <Label>Qty</Label>
                <Input value={row.qty} onChangeText={(v) => update(row.key, { qty: v })} keyboardType="numeric" />
              </View>
              <View className="flex-1 gap-1.5">
                <Label>Unit</Label>
                <Input value={row.unit} onChangeText={(v) => update(row.key, { unit: v })} />
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1 gap-1.5">
                <Label>Lot</Label>
                <Input value={row.lot} onChangeText={(v) => update(row.key, { lot: v })} className="font-mono" />
              </View>
              <View className="flex-1 gap-1.5">
                <Label>Expiry</Label>
                <Input
                  value={row.expiry}
                  onChangeText={(v) => update(row.key, { expiry: v })}
                  placeholder="YYYY-MM-DD"
                  className="font-mono"
                  autoCapitalize="none"
                />
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1 gap-1.5">
                <Label>Min stock</Label>
                <Input
                  value={row.min_stock}
                  onChangeText={(v) => update(row.key, { min_stock: v })}
                  keyboardType="numeric"
                />
              </View>
              <View className="flex-1 gap-1.5">
                <Label>Cost</Label>
                <Input value={row.cost} onChangeText={(v) => update(row.key, { cost: v })} keyboardType="numeric" />
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1 gap-1.5">
                <Label>Location</Label>
                <Input value={row.location} onChangeText={(v) => update(row.key, { location: v })} />
              </View>
              <View className="flex-1 gap-1.5">
                <Label>Storage</Label>
                <Input value={row.storage} onChangeText={(v) => update(row.key, { storage: v })} />
              </View>
            </View>
          </Card>
        ))}

        <Button
          size="lg"
          loading={busy}
          label={`Receive ${filled} item(s)`}
          icon={<Upload size={18} color="#fff" />}
          onPress={submit}
        />
      </PageScroll>
    </Screen>
  );
}
