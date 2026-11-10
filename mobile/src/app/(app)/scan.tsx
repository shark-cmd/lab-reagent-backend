import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  MapPin,
  MinusCircle,
  MoveRight,
  PackagePlus,
  ScanLine,
  Trash2,
} from 'lucide-react-native';
import { toast } from 'sonner-native';

import { CameraScanner } from '@/components/camera-scanner';
import { InfoBanner } from '@/components/info-banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, type InputRef } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SheetModal } from '@/components/ui/modal';
import { Screen, PageScroll } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/AuthContext';
import { ApiError, audit, inventory } from '@/lib/api';
import { isoDateOffset, todayStamp } from '@/lib/format';
import { buzz } from '@/lib/haptics';
import { KV_KEYS, kv } from '@/services/storage/kv';
import type { Item, RecentScan } from '@/types/api';

type Mode = 'use' | 'receive' | 'count' | 'move';

const MODES = [
  { key: 'use', label: 'Use', icon: MinusCircle },
  { key: 'receive', label: 'Receive', icon: PackagePlus },
  { key: 'count', label: 'Count', icon: ClipboardCheck },
  { key: 'move', label: 'Move', icon: MoveRight },
];

const MODE_DESCRIPTIONS: Record<Mode, { title: string; desc: string }> = {
  use: {
    title: 'Use Mode',
    desc: 'Remove existing stock from inventory. Items are consumed FEFO (First Expired, First Out). Only registered items with stock can be used.',
  },
  receive: {
    title: 'Receive Mode',
    desc: 'Add incoming stock to a queue. Fill in lot and expiry, scan items, then commit the batch. New barcodes are auto-registered.',
  },
  count: {
    title: 'Count Mode',
    desc: 'Perform a stocktake. Enter the physical count on the shelf and LabStock adjusts inventory to match. Registered items only.',
  },
  move: {
    title: 'Move Mode',
    desc: 'Change an item’s storage location. Set the destination first (scan a LOC: label or type it), then scan items. Registered items only.',
  },
};

const QTY_PRESETS: Record<Mode, number[]> = {
  use: [1, 2, 5, 10],
  receive: [1, 5, 10, 25, 50, 100],
  count: [],
  move: [],
};

const EXPIRY_PRESETS = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '6mo', days: 182 },
  { label: '1yr', days: 365 },
  { label: '2yr', days: 730 },
];

interface QueueEntry {
  id: string;
  barcode: string;
  qty: number;
  lot: string;
  expiry: string;
  location: string;
  name: string;
}

export default function ScanScreen() {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('use');
  const [barcode, setBarcode] = useState('');
  const [qty, setQty] = useState('1');
  const [lot, setLot] = useState('');
  const [expiry, setExpiry] = useState('');
  const [activeLocation, setActiveLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [scans, setScans] = useState<RecentScan[]>([]);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);

  // unknown-barcode register
  const [regOpen, setRegOpen] = useState(false);
  const [regAdvanced, setRegAdvanced] = useState(false);
  const [regData, setRegData] = useState<Record<string, string> | null>(null);

  // use-mode item picker
  const [items, setItems] = useState<Item[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  const inputRef = useRef<InputRef>(null);

  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  const pushScan = useCallback((entry: Omit<RecentScan, 'ts'>) => {
    setScans((prev) => [{ ...entry, ts: Date.now() }, ...prev].slice(0, 12));
  }, []);

  // Load persisted scans + queue, then refresh scans from the backend.
  useEffect(() => {
    (async () => {
      setScans(await kv.getJSON<RecentScan[]>(KV_KEYS.recentScans, []));
      setQueue(await kv.getJSON<QueueEntry[]>(KV_KEYS.receiveQueue, []));
      try {
        const { scans: remote } = await audit.recentScans(12);
        if (remote?.length) setScans(remote);
      } catch {
        /* keep local cache */
      }
    })();
  }, []);

  useEffect(() => {
    void kv.setJSON(KV_KEYS.recentScans, scans);
  }, [scans]);

  useEffect(() => {
    void kv.setJSON(KV_KEYS.receiveQueue, queue);
  }, [queue]);

  // Load items for the use-mode picker.
  useEffect(() => {
    if (mode !== 'use') return;
    let cancelled = false;
    inventory
      .items()
      .then((data) => {
        if (!cancelled) setItems(data ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    focusInput();
  }, [mode, focusInput]);

  const resetAfter = () => {
    setBarcode('');
    if (mode !== 'receive') {
      setLot('');
      setExpiry('');
    }
    focusInput();
  };

  const handleUnknown = (code: string) => {
    setRegData({
      barcode: code,
      name: '',
      unit: 'unit',
      min_stock: '0',
      cost: '0',
      location: activeLocation || '',
      storage: 'Ambient',
      qty: qty || '0',
      lot: lot || '',
      expiry: expiry || '',
    });
    setRegOpen(true);
    void buzz('err');
  };

  const doUse = async (code: string) => {
    const n = parseFloat(qty);
    if (!n || n <= 0) {
      toast.error('Enter a quantity greater than 0');
      return;
    }
    const data = await inventory.use(code, n);
    if (!data.ok) {
      toast.warning(`Short by ${data.shortfall}, only ${data.total} left`);
    } else {
      toast.success(`Used ${n} · ${data.item_name}`, { description: `Remaining: ${data.total}` });
    }
    pushScan({
      mode: 'use',
      name: data.item_name,
      barcode: code,
      detail: data.ok ? `-${n} → ${data.total} left` : `Short ${data.shortfall}`,
      ok: data.ok,
    });
    void buzz('ok');
  };

  const doReceiveToQueue = async (code: string) => {
    const n = parseFloat(qty);
    if (!n || n <= 0) {
      toast.error('Enter a quantity greater than 0');
      return;
    }
    let name = code;
    try {
      const data = await inventory.resolve(code);
      if (data.type === 'item' && data.found && data.item) name = data.item.name;
    } catch {
      /* keep barcode as name */
    }
    const entry: QueueEntry = {
      id: `${code}-${Date.now()}`,
      barcode: code,
      qty: n,
      lot,
      expiry,
      location: activeLocation || '',
      name,
    };
    setQueue((prev) => [entry, ...prev]);
    toast.success(`Queued ${n} × ${name}`);
    pushScan({ mode: 'receive', name, barcode: code, detail: `queued +${n}`, ok: true });
    void buzz('ok');
  };

  const doCount = async (code: string) => {
    const n = parseFloat(qty);
    if (Number.isNaN(n) || n < 0) {
      toast.error('Enter counted quantity');
      return;
    }
    const data = await inventory.stocktake(code, n, activeLocation || null);
    const sign = data.adjustment > 0 ? `+${data.adjustment}` : `${data.adjustment}`;
    toast.success(`Counted ${data.item_name}: ${data.counted}`, {
      description: `Was ${data.previous} (adj ${sign})`,
    });
    pushScan({
      mode: 'count',
      name: data.item_name,
      barcode: code,
      detail: `count ${data.counted} (adj ${sign})`,
      ok: true,
    });
    void buzz('ok');
  };

  const doMove = async (code: string) => {
    if (!activeLocation) {
      toast.error('Set a location first (scan a LOC: label or type one)');
      return;
    }
    const data = await inventory.move(code, activeLocation);
    toast.success(`Moved ${data.item_name} → ${data.location}`);
    pushScan({ mode: 'move', name: data.item_name, barcode: code, detail: `→ ${data.location}`, ok: true });
    void buzz('ok');
  };

  const processBarcode = async (raw: string) => {
    const code = (raw || '').trim();
    if (!code) return;
    setBusy(true);
    try {
      if (code.toUpperCase().startsWith('LOC:')) {
        const loc = code.slice(4).replace(/_/g, ' ').trim();
        setActiveLocation(loc);
        toast.info(`Active location set: ${loc}`);
        pushScan({ mode: 'loc', name: loc, barcode: code, detail: 'location set', ok: true });
        resetAfter();
        return;
      }

      const resolved = await inventory.resolve(code);
      if (resolved.type === 'item' && !resolved.found) {
        if (mode === 'receive') {
          handleUnknown(code);
          return;
        }
        toast.error('Barcode not registered. Only Receive mode can register new items.');
        void buzz('err');
        return;
      }

      if (mode === 'use') await doUse(code);
      else if (mode === 'receive') await doReceiveToQueue(code);
      else if (mode === 'count') await doCount(code);
      else if (mode === 'move') await doMove(code);

      resetAfter();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Action failed');
      void buzz('err');
    } finally {
      setBusy(false);
    }
  };

  const submitRegister = async () => {
    if (!regData?.name?.trim()) {
      toast.error('Item name is required');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        barcode: regData.barcode,
        qty: parseFloat(regData.qty) || 0,
        lot: regData.lot || '',
        expiry: regData.expiry || '',
        name: regData.name.trim(),
        unit: regData.unit || 'unit',
        min_stock: parseFloat(regData.min_stock) || 0,
        location: regData.location || '',
        storage: regData.storage || 'Ambient',
        cost: parseFloat(regData.cost) || 0,
      };
      await inventory.stockIn(payload);
      toast.success(`Registered ${payload.name}`);
      pushScan({
        mode: 'register',
        name: payload.name,
        barcode: payload.barcode,
        detail: payload.qty > 0 ? `registered +${payload.qty}` : 'registered',
        ok: true,
      });
      setRegOpen(false);
      setRegData(null);
      setRegAdvanced(false);
      resetAfter();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  const commitQueue = async () => {
    if (queue.length === 0) return;
    setBusy(true);
    try {
      const payload = queue.map((q) => ({
        barcode: q.barcode,
        qty: q.qty,
        lot: q.lot,
        expiry: q.expiry,
        location: q.location,
      }));
      const data = await inventory.receiveCommit(payload);
      toast.success(`Received ${data.count} line(s) into stock`);
      setQueue([]);
      focusInput();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Commit failed');
    } finally {
      setBusy(false);
    }
  };

  const currentMode = MODES.find((m) => m.key === mode);
  const showQty = mode !== 'move';
  const showLotExpiry = mode === 'receive';
  const presets = QTY_PRESETS[mode];

  const filteredItems = pickerQuery.trim()
    ? items.filter(
        (it) =>
          it.name.toLowerCase().includes(pickerQuery.toLowerCase()) ||
          it.barcode.toLowerCase().includes(pickerQuery.toLowerCase())
      )
    : items;

  return (
    <Screen>
      <PageScroll>
        <InfoBanner id="scan">
          Pick a mode, then scan or type a barcode and submit. <Text className="font-sans-bold">Use</Text> removes
          stock (oldest-expiry first), <Text className="font-sans-bold">Receive</Text> adds incoming stock to a queue
          you commit together, <Text className="font-sans-bold">Count</Text> sets a physical stocktake number, and{' '}
          <Text className="font-sans-bold">Move</Text> changes an item’s location. Scanning a{' '}
          <Text variant="monoSm" className="text-info">LOC:</Text> shelf label sets the active location.
        </InfoBanner>

        {/* Header + modes */}
        <Card className="gap-4">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <ScanLine size={22} color="#0E7490" />
                <Text variant="h2">Scan</Text>
                {mode !== 'receive' && queue.length > 0 ? (
                  <View className="ml-1 h-6 min-w-[24px] items-center justify-center rounded-full bg-warning px-2">
                    <Text className="font-sans-bold text-xs text-white">{queue.length}</Text>
                  </View>
                ) : null}
              </View>
              <Text variant="small" className="mt-0.5">
                Signed in as <Text className="font-sans-md text-ink">{user?.name}</Text>
                {currentMode ? ` · ${currentMode.label}` : ''}
              </Text>
            </View>
            {activeLocation ? (
              <View className="flex-row items-center gap-2 rounded-lg bg-primary-soft px-3 py-1.5">
                <MapPin size={14} color="#0E7490" />
                <Text className="font-sans-md text-sm text-primary">{activeLocation}</Text>
                <Pressable hitSlop={6} onPress={() => setActiveLocation('')}>
                  <Trash2 size={14} color="#0E7490" />
                </Pressable>
              </View>
            ) : null}
          </View>

          <SegmentedControl
            options={MODES}
            value={mode}
            columns={2}
            onChange={(k) => {
              setMode(k as Mode);
              void buzz('tap');
            }}
          />

          <View className="rounded-lg border border-line bg-surface2 p-3">
            <View className="flex-row items-center gap-2">
              <View className="h-6 w-6 items-center justify-center rounded bg-primary">
                <Text className="font-sans-bold text-xs text-white">
                  {MODES.findIndex((m) => m.key === mode) + 1}
                </Text>
              </View>
              <Text className="font-sans-md text-sm text-ink">{MODE_DESCRIPTIONS[mode].title}</Text>
              {mode === 'receive' && queue.length > 0 ? (
                <View className="h-5 w-5 items-center justify-center rounded-full bg-warning">
                  <Text className="text-[11px] font-sans-bold text-white">{queue.length}</Text>
                </View>
              ) : null}
            </View>
            <Text variant="small" className="mt-1.5">{MODE_DESCRIPTIONS[mode].desc}</Text>
          </View>
        </Card>

        {/* Scan form */}
        <Card className="gap-4">
          {mode === 'use' && items.length > 0 ? (
            <View className="gap-1.5">
              <Label>Pick from inventory</Label>
              <Pressable
                onPress={() => setPickerOpen(true)}
                className="h-11 flex-row items-center justify-between rounded-md border border-line bg-surface px-3 active:bg-surface2"
              >
                <Text className="flex-1 text-sm text-muted" numberOfLines={1}>
                  {selectedItem
                    ? `${selectedItem.name} · ${selectedItem.total ?? 0} available`
                    : 'Search items by name or barcode…'}
                </Text>
                <ChevronDown size={16} color="#94a3b8" />
              </Pressable>
            </View>
          ) : null}

          <View className="gap-1.5">
            <Label>Barcode</Label>
            <View className="flex-row gap-2">
              <Input
                ref={inputRef}
                value={barcode}
                onChangeText={setBarcode}
                onSubmitEditing={() => processBarcode(barcode)}
                placeholder="Scan or type barcode…"
                className="h-12 flex-1 font-mono text-base"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                blurOnSubmit={false}
              />
              <Button
                variant="outline"
                className="h-12 w-12 px-0"
                onPress={() => setCameraOpen(true)}
                icon={<Camera size={20} color="#0B1220" />}
              />
            </View>
            <Text variant="small">
              Tip: scan a <Text variant="monoSm">LOC:Cold_Room_Fridge1</Text> label to set the active location.
            </Text>
          </View>

          {showQty ? (
            <View className="gap-1.5">
              <Label>{mode === 'count' ? 'Counted qty' : 'Quantity'}</Label>
              <Input
                value={qty}
                onChangeText={setQty}
                keyboardType="numeric"
                className="h-11"
              />
              {presets.length > 0 ? (
                <View className="mt-1 flex-row flex-wrap gap-1">
                  {presets.map((n) => (
                    <Pressable
                      key={n}
                      onPress={() => setQty(String(n))}
                      className={
                        qty === String(n)
                          ? 'rounded border border-primary bg-primary px-2 py-1'
                          : 'rounded border border-line bg-surface2 px-2 py-1 active:bg-surface'
                      }
                    >
                      <Text className={qty === String(n) ? 'text-xs text-white' : 'text-xs text-muted'}>
                        {n}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {showLotExpiry ? (
            <>
              <View className="gap-1.5">
                <Label>Lot</Label>
                <Input
                  value={lot}
                  onChangeText={setLot}
                  placeholder="Lot #"
                  className="h-11 font-mono"
                  autoCapitalize="characters"
                />
                <Pressable onPress={() => setLot(`LOT-${todayStamp()}`)}>
                  <Text className="text-xs text-primary">Generate lot # from today</Text>
                </Pressable>
              </View>
              <View className="gap-1.5">
                <Label>Expiry</Label>
                <Input
                  value={expiry}
                  onChangeText={setExpiry}
                  placeholder="YYYY-MM-DD"
                  className="h-11 font-mono"
                  autoCapitalize="none"
                />
                <View className="mt-1 flex-row flex-wrap gap-1">
                  {EXPIRY_PRESETS.map(({ label, days }) => (
                    <Pressable
                      key={label}
                      onPress={() => setExpiry(isoDateOffset(days))}
                      className="rounded border border-line bg-surface2 px-2 py-1 active:bg-surface"
                    >
                      <Text className="text-xs text-muted">{label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>
          ) : null}

          {mode === 'move' ? (
            <View className="gap-1.5">
              <Label>Location</Label>
              <Input
                value={activeLocation}
                onChangeText={setActiveLocation}
                placeholder="e.g. Cold Room / Fridge 1 / Shelf B"
                className="h-11"
              />
            </View>
          ) : null}

          <Button
            size="lg"
            loading={busy}
            onPress={() => processBarcode(barcode)}
            icon={currentMode ? <currentMode.icon size={18} color="#fff" /> : undefined}
            label={
              mode === 'use'
                ? 'Record usage'
                : mode === 'receive'
                  ? 'Add to receive queue'
                  : mode === 'count'
                    ? 'Record count'
                    : 'Move item'
            }
          />

          {mode === 'receive' ? (
            <View className="gap-2 border-t border-line pt-4">
              <View className="flex-row items-center justify-between">
                <Text variant="title">
                  Receive queue{' '}
                  <Text variant="small" className="text-muted">({queue.length})</Text>
                </Text>
                <Button
                  size="sm"
                  label="Commit queue"
                  disabled={queue.length === 0 || busy}
                  onPress={commitQueue}
                  icon={<CheckCircle2 size={16} color="#fff" />}
                />
              </View>
              {queue.length === 0 ? (
                <Text variant="small" className="py-2">
                  Scan items to build the receive queue, then commit.
                </Text>
              ) : (
                queue.map((q) => (
                  <View
                    key={q.id}
                    className="flex-row items-center justify-between rounded-lg border border-line bg-surface2 px-3 py-2"
                  >
                    <View className="min-w-0 flex-1 pr-2">
                      <Text className="font-sans-md text-sm text-ink" numberOfLines={1}>{q.name}</Text>
                      <Text variant="monoSm" numberOfLines={1}>
                        {q.barcode} · lot {q.lot || '-'} · exp {q.expiry || '-'}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-3">
                      <Text className="font-sans-md text-sm text-primary">+{q.qty}</Text>
                      <Pressable onPress={() => setQueue((prev) => prev.filter((x) => x.id !== q.id))}>
                        <Trash2 size={16} color="#94a3b8" />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </Card>

        {/* Recent activity */}
        <Card className="gap-3">
          <Text variant="title">Recent activity</Text>
          {scans.length === 0 ? (
            <View className="items-center py-6">
              <ScanLine size={28} color="#cbd5e1" />
              <Text variant="small" className="mt-2">Scan an item to begin</Text>
            </View>
          ) : (
            scans.map((s, i) => (
              <View
                key={`${s.barcode}-${i}`}
                className="flex-row items-start justify-between gap-2 rounded-lg border border-line px-3 py-2"
              >
                <View className="min-w-0 flex-1">
                  <Text className="font-sans-md text-sm text-ink" numberOfLines={1}>{s.name}</Text>
                  <Text variant="small" numberOfLines={1}>{s.detail}</Text>
                </View>
                <StatusBadge variant={s.ok ? 'ok' : 'expiring30'}>{s.mode}</StatusBadge>
              </View>
            ))
          )}
        </Card>
      </PageScroll>

      <CameraScanner
        visible={cameraOpen}
        onClose={() => {
          setCameraOpen(false);
          focusInput();
        }}
        onDetected={(text) => {
          setCameraOpen(false);
          setBarcode(text);
          void processBarcode(text);
        }}
      />

      {/* Item picker */}
      <SheetModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Pick from inventory"
        description="Tap an item to fill the barcode field."
      >
        <Input
          value={pickerQuery}
          onChangeText={setPickerQuery}
          placeholder="Search items…"
          autoCapitalize="none"
        />
        {filteredItems.slice(0, 60).map((it) => (
          <Pressable
            key={it.id}
            onPress={() => {
              setSelectedItem(it);
              setBarcode(it.barcode);
              setPickerOpen(false);
              focusInput();
            }}
            className="flex-row items-center gap-2 rounded-lg border border-line px-3 py-2.5 active:bg-surface2"
          >
            <Check size={16} color={selectedItem?.id === it.id ? '#0E7490' : 'transparent'} />
            <View className="min-w-0 flex-1">
              <Text className="font-sans-md text-sm text-ink" numberOfLines={1}>{it.name}</Text>
              <Text variant="monoSm">{it.barcode}</Text>
            </View>
            <Text variant="small">
              {it.total ?? 0} {it.unit || 'unit'}
            </Text>
          </Pressable>
        ))}
        {filteredItems.length === 0 ? (
          <Text variant="small" className="py-4 text-center">No items found.</Text>
        ) : null}
      </SheetModal>

      {/* Unknown barcode register */}
      <SheetModal
        visible={regOpen}
        onClose={() => {
          setRegOpen(false);
          setRegData(null);
          setRegAdvanced(false);
          focusInput();
        }}
        title="Register new item"
        description={
          <Text variant="small">
            Barcode <Text variant="monoSm">{regData?.barcode}</Text> isn’t registered yet. Enter its details once.
          </Text>
        }
        footer={
          <>
            <Button
              variant="outline"
              label="Cancel"
              onPress={() => {
                setRegOpen(false);
                setRegData(null);
                setRegAdvanced(false);
                focusInput();
              }}
            />
            <Button label="Register & save" loading={busy} onPress={submitRegister} />
          </>
        }
      >
        {regData ? (
          <>
            <View className="gap-1.5">
              <Label>Item name *</Label>
              <Input
                value={regData.name}
                onChangeText={(v) => setRegData({ ...regData, name: v })}
                placeholder="e.g. Glucose Reagent"
                autoFocus
              />
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1 gap-1.5">
                <Label>Qty</Label>
                <Input
                  value={regData.qty}
                  onChangeText={(v) => setRegData({ ...regData, qty: v })}
                  keyboardType="numeric"
                />
              </View>
              <View className="flex-1 gap-1.5">
                <Label>Lot</Label>
                <Input
                  value={regData.lot}
                  onChangeText={(v) => setRegData({ ...regData, lot: v })}
                  className="font-mono"
                />
              </View>
            </View>
            <View className="gap-1.5">
              <Label>Expiry</Label>
              <Input
                value={regData.expiry}
                onChangeText={(v) => setRegData({ ...regData, expiry: v })}
                placeholder="YYYY-MM-DD"
                className="font-mono"
                autoCapitalize="none"
              />
            </View>
            <Pressable onPress={() => setRegAdvanced((v) => !v)}>
              <Text className="text-xs text-primary">
                {regAdvanced ? 'Hide' : 'More options'} (unit, location, cost…)
              </Text>
            </Pressable>
            {regAdvanced ? (
              <>
                <View className="flex-row gap-3">
                  <View className="flex-1 gap-1.5">
                    <Label>Unit</Label>
                    <Input
                      value={regData.unit}
                      onChangeText={(v) => setRegData({ ...regData, unit: v })}
                      placeholder="mL, tests, box"
                    />
                  </View>
                  <View className="flex-1 gap-1.5">
                    <Label>Location</Label>
                    <Input
                      value={regData.location}
                      onChangeText={(v) => setRegData({ ...regData, location: v })}
                    />
                  </View>
                </View>
                <View className="flex-row gap-3">
                  <View className="flex-1 gap-1.5">
                    <Label>Min stock</Label>
                    <Input
                      value={regData.min_stock}
                      onChangeText={(v) => setRegData({ ...regData, min_stock: v })}
                      keyboardType="numeric"
                    />
                  </View>
                  <View className="flex-1 gap-1.5">
                    <Label>Unit cost</Label>
                    <Input
                      value={regData.cost}
                      onChangeText={(v) => setRegData({ ...regData, cost: v })}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <View className="gap-1.5">
                  <Label>Storage</Label>
                  <Input
                    value={regData.storage}
                    onChangeText={(v) => setRegData({ ...regData, storage: v })}
                    placeholder="Ambient / 2-8°C / -20°C"
                  />
                </View>
              </>
            ) : null}
          </>
        ) : null}
      </SheetModal>

      {busy ? (
        <View className="absolute inset-0 items-center justify-center bg-black/5">
          <ActivityIndicator color="#0E7490" />
        </View>
      ) : null}
    </Screen>
  );
}
