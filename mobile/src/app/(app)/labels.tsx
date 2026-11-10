import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Check, Printer, Search, Tag } from 'lucide-react-native';
import * as Print from 'expo-print';
import { toast } from 'sonner-native';

import { Barcode } from '@/components/barcode';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageScroll, Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { ApiError, inventory } from '@/lib/api';
import { code128Svg } from '@/lib/code128';
import type { Item } from '@/types/api';

interface LabelDef {
  code: string;
  title: string;
  subtitle?: string;
}

function buildLabelHtml(labels: LabelDef[]): string {
  const cells = labels
    .map(
      (l) => `
      <div class="label">
        <div class="name">${escapeHtml(l.title)}</div>
        ${code128Svg(l.code, 220, 56)}
        <div class="code">${escapeHtml(l.subtitle ?? l.code)}</div>
      </div>`
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
    <style>
      @page { margin: 10mm; }
      body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; }
      .grid { display: flex; flex-wrap: wrap; gap: 8px; }
      .label { width: 240px; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 8px; page-break-inside: avoid; }
      .name { font-size: 11px; font-weight: 600; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; text-align: center; margin-top: 2px; letter-spacing: 1px; }
    </style></head><body><div class="grid">${cells}</div></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function LabelsScreen() {
  const [tab, setTab] = useState<'items' | 'locations'>('items');
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [locationsText, setLocationsText] = useState('Cold Room\nFridge 1\nFridge 2\nMain Store');
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    inventory.items().then(setItems).catch(() => {});
  }, []);

  const filtered = query.trim()
    ? items.filter(
        (it) =>
          it.name.toLowerCase().includes(query.toLowerCase()) ||
          it.barcode.toLowerCase().includes(query.toLowerCase())
      )
    : items;

  const itemLabels: LabelDef[] = useMemo(
    () =>
      selected
        .map((bc) => items.find((it) => it.barcode === bc))
        .filter((it): it is Item => !!it)
        .map((it) => ({ code: it.barcode, title: it.name, subtitle: it.barcode })),
    [selected, items]
  );

  const locationLabels: LabelDef[] = useMemo(
    () =>
      locationsText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((name) => ({ code: `LOC:${name.replace(/\s+/g, '_')}`, title: name, subtitle: `LOC:${name.replace(/\s+/g, '_')}` })),
    [locationsText]
  );

  const labels = tab === 'items' ? itemLabels : locationLabels;

  const printLabels = async () => {
    if (labels.length === 0) {
      toast.error('Select at least one label');
      return;
    }
    setPrinting(true);
    try {
      await Print.printAsync({ html: buildLabelHtml(labels) });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Printing failed');
    } finally {
      setPrinting(false);
    }
  };

  const toggle = (barcode: string) =>
    setSelected((prev) => (prev.includes(barcode) ? prev.filter((b) => b !== barcode) : [...prev, barcode]));

  return (
    <Screen>
      <PageScroll>
        <View className="flex-row gap-2">
          {(
            [
              ['items', 'Item labels'],
              ['locations', 'Location labels'],
            ] as const
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

        {tab === 'items' ? (
          <>
            <View className="relative">
              <Input
                value={query}
                onChangeText={setQuery}
                placeholder="Search items…"
                className="h-10 pl-9"
              />
              <View className="absolute left-3 top-3">
                <Search size={16} color="#94a3b8" />
              </View>
            </View>
            <Card padded={false} className="overflow-hidden">
              {filtered.slice(0, 80).map((it) => {
                const checked = selected.includes(it.barcode);
                return (
                  <Pressable
                    key={it.id}
                    onPress={() => toggle(it.barcode)}
                    className="flex-row items-center gap-3 border-b border-line px-4 py-3 active:bg-surface2"
                  >
                    <View
                      className={
                        checked
                          ? 'h-5 w-5 items-center justify-center rounded border border-primary bg-primary'
                          : 'h-5 w-5 items-center justify-center rounded border border-line'
                      }
                    >
                      {checked ? <Check size={14} color="#fff" /> : null}
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="font-sans-md text-sm text-ink" numberOfLines={1}>{it.name}</Text>
                      <Text variant="monoSm">{it.barcode}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </Card>
          </>
        ) : (
          <Card className="gap-1.5">
            <Label>Locations (one per line)</Label>
            <Input
              value={locationsText}
              onChangeText={setLocationsText}
              multiline
              numberOfLines={5}
              className="h-32"
              textAlignVertical="top"
            />
            <Text variant="small">Each line becomes a <Text variant="monoSm">LOC:</Text> shelf label.</Text>
          </Card>
        )}

        {/* Preview */}
        <Card className="gap-3">
          <View className="flex-row items-center gap-2">
            <Tag size={16} color="#0E7490" />
            <Text variant="title">Preview ({labels.length})</Text>
          </View>
          {labels.length === 0 ? (
            <Text variant="small">
              {tab === 'items' ? 'Select items above to preview their labels.' : 'Enter locations to preview labels.'}
            </Text>
          ) : (
            labels.slice(0, 12).map((l, i) => (
              <View key={`${l.code}-${i}`} className="items-center rounded-lg border border-line bg-surface2 p-3">
                <Text className="mb-2 self-start font-sans-md text-xs text-ink" numberOfLines={1}>
                  {l.title}
                </Text>
                <Barcode value={l.code} />
                <Text variant="monoSm" className="mt-1">{l.subtitle ?? l.code}</Text>
              </View>
            ))
          )}
        </Card>

        <Button
          size="lg"
          loading={printing}
          label="Print / share labels"
          icon={<Printer size={18} color="#fff" />}
          onPress={printLabels}
        />
      </PageScroll>
    </Screen>
  );
}
