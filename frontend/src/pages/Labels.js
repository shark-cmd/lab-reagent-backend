import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Barcode from "@/components/Barcode";
import { Printer, Tags, MapPin, Search, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";

export default function Labels() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState({});
  const [search, setSearch] = useState("");
  const [locText, setLocText] = useState("Cold Room / Fridge 1\nCold Room / Fridge 2\nAmbient Store / Shelf A");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/dashboard");
      setItems(data.items || []);
    } catch {
      toast.error("Failed to load items");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = items.filter((it) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return it.name.toLowerCase().includes(q) || it.barcode.toLowerCase().includes(q);
  });

  const toggle = (id) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const allSelected = filtered.length > 0 && filtered.every((it) => selected[it.id]);
  const toggleAll = () => {
    const next = { ...selected };
    const target = !allSelected;
    filtered.forEach((it) => (next[it.id] = target));
    setSelected(next);
  };

  const selectedItems = items.filter((it) => selected[it.id]);

  const locLabels = locText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name, code: "LOC:" + name.replace(/\s*\/\s*/g, "_").replace(/\s+/g, "_") }));

  const printArea = (id) => {
    document.body.classList.add("printing");
    window.print();
    setTimeout(() => document.body.classList.remove("printing"), 300);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <div>
          <h1 className="font-heading text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Tags className="h-6 w-6 text-[color:var(--ls-primary)]" /> Labels
          </h1>
          <p className="text-sm text-slate-500">Generate barcoded item &amp; shelf-location labels, ready to print and stick</p>
        </div>
      </div>

      <Tabs defaultValue="items" className="w-full">
        <TabsList className="no-print">
          <TabsTrigger value="items" data-testid="labels-tab-items">Item labels</TabsTrigger>
          <TabsTrigger value="locations" data-testid="labels-tab-locations">Location labels</TabsTrigger>
        </TabsList>

        {/* Item labels */}
        <TabsContent value="items">
          <div className="grid lg:grid-cols-3 gap-5">
            <Card className="p-4 border-[color:var(--ls-border)] no-print lg:col-span-1">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading font-semibold text-slate-800">Select items</h3>
                <Button variant="ghost" size="sm" onClick={toggleAll} data-testid="labels-select-all">
                  {allSelected ? <CheckSquare className="h-4 w-4 mr-1" /> : <Square className="h-4 w-4 mr-1" />}
                  {allSelected ? "None" : "All"}
                </Button>
              </div>
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-8 h-9" data-testid="labels-search-input" />
              </div>
              <div className="space-y-1.5 max-h-[420px] overflow-auto thin-scroll">
                {filtered.map((it) => (
                  <label key={it.id} className="flex items-center gap-2 rounded-lg border border-[color:var(--ls-border)] px-2.5 py-2 cursor-pointer hover:bg-[color:var(--ls-surface-2)]">
                    <Checkbox checked={!!selected[it.id]} onCheckedChange={() => toggle(it.id)} data-testid={`label-item-checkbox-${it.id}`} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{it.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono truncate">{it.barcode}</div>
                    </div>
                  </label>
                ))}
                {filtered.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">No items.</p>}
              </div>
            </Card>

            <Card className="p-4 border-[color:var(--ls-border)] lg:col-span-2">
              <div className="flex items-center justify-between mb-3 no-print">
                <h3 className="font-heading font-semibold text-slate-800">Preview ({selectedItems.length})</h3>
                <Button onClick={printArea} disabled={selectedItems.length === 0} data-testid="print-item-labels-button">
                  <Printer className="h-4 w-4 mr-1.5" /> Print
                </Button>
              </div>
              {selectedItems.length === 0 ? (
                <p className="text-sm text-slate-400 py-10 text-center no-print">Select items on the left to preview labels.</p>
              ) : (
                <div className="printable grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {selectedItems.map((it) => (
                    <div key={it.id} className="border border-slate-300 rounded-lg p-2 flex flex-col items-center text-center bg-white break-inside-avoid" data-testid="item-label-card">
                      <div className="text-[12px] font-semibold text-slate-800 leading-tight mb-1 line-clamp-2">{it.name}</div>
                      <Barcode value={it.barcode} height={42} />
                      <div className="text-[10px] text-slate-500 mt-1">{it.location || it.storage || ""}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* Location labels */}
        <TabsContent value="locations">
          <div className="grid lg:grid-cols-3 gap-5">
            <Card className="p-4 border-[color:var(--ls-border)] no-print lg:col-span-1">
              <h3 className="font-heading font-semibold text-slate-800 mb-2 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[color:var(--ls-primary)]" /> Locations
              </h3>
              <p className="text-xs text-slate-500 mb-2">One location per line. Scanning a printed label sets the active location (encoded as <span className="font-mono">LOC:</span>).</p>
              <Textarea value={locText} onChange={(e) => setLocText(e.target.value)} className="h-64 font-mono text-xs" data-testid="location-labels-input" />
            </Card>

            <Card className="p-4 border-[color:var(--ls-border)] lg:col-span-2">
              <div className="flex items-center justify-between mb-3 no-print">
                <h3 className="font-heading font-semibold text-slate-800">Preview ({locLabels.length})</h3>
                <Button onClick={printArea} disabled={locLabels.length === 0} data-testid="print-location-labels-button">
                  <Printer className="h-4 w-4 mr-1.5" /> Print
                </Button>
              </div>
              {locLabels.length === 0 ? (
                <p className="text-sm text-slate-400 py-10 text-center no-print">Enter location names to preview labels.</p>
              ) : (
                <div className="printable grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {locLabels.map((l, i) => (
                    <div key={i} className="border border-slate-300 rounded-lg p-2 flex flex-col items-center text-center bg-white break-inside-avoid" data-testid="location-label-card">
                      <div className="text-[12px] font-semibold text-slate-800 leading-tight mb-1 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {l.name}
                      </div>
                      <Barcode value={l.code} height={42} fontSize={10} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
