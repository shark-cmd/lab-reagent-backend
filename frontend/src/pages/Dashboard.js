import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge, expiryVariant } from "@/components/StatusBadge";
import { HelpHint, InfoBanner } from "@/components/HelpHint";
import {
  Wallet,
  AlertTriangle,
  CalendarClock,
  Boxes,
  Download,
  Upload,
  Pencil,
  Trash2,
  RefreshCw,
  Save,
  DatabaseBackup,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "sonner";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (iso) => {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "-";
  }
};

const KpiCard = ({ icon: Icon, label, value, sub, tint, testid }) => (
  <Card className="p-4 sm:p-5 border-[color:var(--ls-border)]" data-testid={testid}>
    <div className="flex items-start justify-between">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-1.5 font-heading text-2xl sm:text-3xl font-bold text-slate-900 tabnum">{value}</div>
        {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
      </div>
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tint}`}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </Card>
);

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("reorder");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/dashboard");
      setData(data);
    } catch (e) {
      toast.error("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-select most urgent tab based on data
  useEffect(() => {
    if (!data) return;
    const k = data.kpis;
    if (k?.low_stock_count > 0) setActiveTab("reorder");
    else if (k?.expiring_count > 0) setActiveTab("expiring");
    else setActiveTab("items");
  }, [data]);

  const download = async (path, filename) => {
    try {
      const res = await api.get(path, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded ${filename}`);
    } catch (e) {
      toast.error("Download failed");
    }
  };

  const runImport = async () => {
    if (!importText.trim()) {
      toast.error("Paste CSV data first");
      return;
    }
    setImporting(true);
    try {
      const { data } = await api.post("/import", { text: importText });
      toast.success(`Imported ${data.imported} row(s)`, {
        description: data.errors.length ? `${data.errors.length} row(s) skipped` : undefined,
      });
      if (data.errors.length) console.warn("Import errors:", data.errors);
      setImportOpen(false);
      setImportText("");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImportText(ev.target.result);
    reader.readAsText(file);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await api.post("/item-update", {
        id: editItem.id,
        name: editItem.name,
        unit: editItem.unit,
        min_stock: parseFloat(editItem.min_stock) || 0,
        location: editItem.location,
        storage: editItem.storage,
        cost: parseFloat(editItem.cost) || 0,
      });
      toast.success("Item updated");
      setEditItem(null);
      load();
    } catch (e) {
      toast.error("Update failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? This removes all its lots.`)) return;
    try {
      await api.delete(`/items/${item.id}`);
      toast.success("Item deleted");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed (admin only)");
    }
  };

  const k = data?.kpis;
  const items = (data?.items || []).filter((it) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      it.name.toLowerCase().includes(q) ||
      it.barcode.toLowerCase().includes(q) ||
      (it.location || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <InfoBanner id="dashboard" title="Reading this dashboard:" testid="dashboard-info-banner">
        The cards summarise your whole store. <b>Reorder</b> lists items that dropped below their minimum stock,
        <b> Expiring</b> shows lots within 90 days of expiry (colour-coded 30/60/90), and <b>All items</b> lets you
        search and fine-tune each item (click the pencil to edit min-stock, cost, location). Use <b>Import CSV</b> or the
        <b> Bulk Add</b> page to load your existing register.
      </InfoBanner>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Inventory overview, alerts &amp; data tools</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setImportOpen(true)} data-testid="import-open-button">
            <Upload className="h-4 w-4 mr-1.5" /> Import CSV
          </Button>
          <div className="h-8 w-px bg-slate-200 hidden sm:block" role="separator" />
          <Button variant="outline" size="sm" onClick={load} data-testid="dashboard-refresh-button">
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => download("/export/items.csv", "labstock_items.csv")} data-testid="export-items-button">
            <Download className="h-4 w-4 mr-1.5" /> Items CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => download("/export/history.csv", "labstock_history.csv")} data-testid="export-history-button">
            <Download className="h-4 w-4 mr-1.5" /> History CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => download("/backup", "labstock_backup.json")} data-testid="backup-button">
            <DatabaseBackup className="h-4 w-4 mr-1.5" /> Backup
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          icon={Wallet}
          label="Inventory value"
          value={loading ? "-" : money(k?.total_value)}
          sub={`${k?.total_items || 0} items`}
          tint="bg-[#E6F6FA] text-[#0E7490]"
          testid="kpi-total-inventory-value"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Low stock"
          value={loading ? "-" : k?.low_stock_count ?? 0}
          sub="Needs reorder"
          tint="bg-[#FFF4E6] text-[#B45309]"
          testid="kpi-low-stock-count"
        />
        <KpiCard
          icon={CalendarClock}
          label="Expiring ≤90d"
          value={loading ? "-" : k?.expiring_count ?? 0}
          sub={`30d ${k?.expiring_buckets?.d30 || 0} · 60d ${k?.expiring_buckets?.d60 || 0} · 90d ${k?.expiring_buckets?.d90 || 0}`}
          tint="bg-[#E8F2FF] text-[#0B5CAD]"
          testid="kpi-expiring-count"
        />
        <KpiCard
          icon={Boxes}
          label="Total items"
          value={loading ? "-" : k?.total_items ?? 0}
          sub="Registered SKUs"
          tint="bg-[#EAF7F0] text-[#1F7A4D]"
          testid="kpi-total-items"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full sm:w-auto sm:inline-grid grid-cols-3">
          <TabsTrigger value="reorder" data-testid="tab-reorder" className="relative">
            Reorder ({k?.low_stock_count || 0})
            {k?.low_stock_count > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
            )}
          </TabsTrigger>
          <TabsTrigger value="expiring" data-testid="tab-expiring" className="relative">
            Expiring ({k?.expiring_count || 0})
            {k?.expiring_count > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500" />
            )}
          </TabsTrigger>
          <TabsTrigger value="items" data-testid="tab-items">
            All items ({k?.total_items || 0})
          </TabsTrigger>
        </TabsList>

        {/* Reorder */}
        <TabsContent value="reorder">
          <Card className="border-[color:var(--ls-border)] overflow-hidden">
            <div className="overflow-auto thin-scroll">
              <Table data-testid="reorder-alerts-table">
                <TableHeader>
                  <TableRow className="bg-[color:var(--ls-surface-2)]">
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Min</TableHead>
                    <TableHead className="text-right">Shortfall</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Days left</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.reorder || []).map((r) => (
                    <TableRow key={r.id} data-testid="reorder-row">
                      <TableCell>
                        <div className="font-medium text-slate-800">{r.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{r.barcode}</div>
                      </TableCell>
                      <TableCell className="text-right tabnum">{r.total} {r.unit}</TableCell>
                      <TableCell className="text-right tabnum">{r.min_stock}</TableCell>
                      <TableCell className="text-right tabnum text-[#B45309] font-medium">{r.shortfall}</TableCell>
                      <TableCell>{r.location || "-"}</TableCell>
                      <TableCell className="text-right tabnum">{r.days_left ?? "-"}</TableCell>
                      <TableCell><StatusBadge variant="low">Low</StatusBadge></TableCell>
                    </TableRow>
                  ))}
                  {(!loading && (data?.reorder || []).length === 0) && (
                    <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">No reorder alerts, stock levels are healthy.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Expiring */}
        <TabsContent value="expiring">
          <Card className="border-[color:var(--ls-border)] overflow-hidden">
            <div className="overflow-auto thin-scroll">
              <Table data-testid="expiring-soon-table">
                <TableHeader>
                  <TableRow className="bg-[color:var(--ls-surface-2)]">
                    <TableHead>Item</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">Days left</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.expiring || []).map((e, i) => (
                    <TableRow key={i} data-testid="expiring-row">
                      <TableCell>
                        <div className="font-medium text-slate-800">{e.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{e.barcode}</div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{e.lot || "-"}</TableCell>
                      <TableCell className="font-mono text-sm">{e.expiry}</TableCell>
                      <TableCell className="text-right tabnum">{e.days_left}</TableCell>
                      <TableCell className="text-right tabnum">{e.qty} {e.unit}</TableCell>
                      <TableCell>{e.location || "-"}</TableCell>
                      <TableCell>
                        <StatusBadge variant={expiryVariant(e.days_left)}>
                          {e.days_left < 0 ? "Expired" : `≤${e.days_left <= 30 ? 30 : e.days_left <= 60 ? 60 : 90}d`}
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!loading && (data?.expiring || []).length === 0) && (
                    <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">Nothing expiring within 90 days.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* All items */}
        <TabsContent value="items">
          <Card className="border-[color:var(--ls-border)] overflow-hidden">
            <div className="p-3 border-b border-[color:var(--ls-border)]">
              <div className="relative max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  data-testid="items-search-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search items, barcode, location…"
                  className="pl-8 h-9"
                />
              </div>
            </div>
            <div className="overflow-auto thin-scroll max-h-[560px]">
              <Table data-testid="all-items-table">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="bg-[color:var(--ls-surface-2)]">
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Lots</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Min</TableHead>
                    <TableHead className="text-right">Days in inv.</TableHead>
                    <TableHead className="text-right">Last added</TableHead>
                    <TableHead className="text-right">Last used</TableHead>
                    <TableHead className="text-right">Used today</TableHead>
                    <TableHead className="text-right">30d used</TableHead>
                    <TableHead className="text-right">Total used</TableHead>
                    <TableHead className="text-right">Turnover</TableHead>
                    <TableHead className="text-right">Expiring lot</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Edit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id} data-testid="all-items-row">
                      <TableCell>
                        <div className="font-medium text-slate-800">{it.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{it.barcode}</div>
                      </TableCell>
                      <TableCell className="text-right tabnum">{it.total} {it.unit}</TableCell>
                      <TableCell className="text-right tabnum">{it.lot_count}</TableCell>
                      <TableCell>{it.location || "-"}</TableCell>
                      <TableCell className="text-right tabnum">{it.min_stock}</TableCell>
                      <TableCell className="text-right tabnum">{it.days_in_inventory != null ? `${it.days_in_inventory}d` : "-"}</TableCell>
                      <TableCell className="text-right tabnum text-xs">{formatDate(it.last_added_on)}</TableCell>
                      <TableCell className="text-right tabnum text-xs">{formatDate(it.last_used_on)}</TableCell>
                      <TableCell className="text-right tabnum">{it.used_today > 0 ? it.used_today : "-"}</TableCell>
                      <TableCell className="text-right tabnum">{it.used_30d > 0 ? it.used_30d : "-"}</TableCell>
                      <TableCell className="text-right tabnum">{it.total_consumed > 0 ? it.total_consumed : "-"}</TableCell>
                      <TableCell className="text-right tabnum">{it.turnover != null ? `${it.turnover}%` : "-"}</TableCell>
                      <TableCell className="text-right tabnum text-xs">
                        {it.nearest_expiry_lot ? (
                          <span className={it.nearest_expiry_days <= 30 ? "text-red-600 font-medium" : it.nearest_expiry_days <= 60 ? "text-amber-600" : ""}>
                            {it.nearest_expiry_lot} ({it.nearest_expiry_days}d)
                          </span>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-right tabnum">{money(it.cost)}</TableCell>
                      <TableCell>
                        {it.low_stock ? <StatusBadge variant="low">Low</StatusBadge> : <StatusBadge variant="ok">OK</StatusBadge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditItem({ ...it })} data-testid={`edit-item-button-${it.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {user?.role === "admin" && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => deleteItem(it)} data-testid={`delete-item-button-${it.id}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!loading && items.length === 0) && (
                    <TableRow><TableCell colSpan={16} className="text-center text-slate-400 py-8">No items yet. Use the Scan page to receive stock or import a CSV.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl" data-testid="import-dialog">
          <DialogHeader>
            <DialogTitle>Import stock (CSV)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Columns: <span className="font-mono text-xs">barcode, name, qty, lot, expiry, min_stock, location, storage, cost, unit</span>.
              Unknown barcodes are auto-registered.
            </p>
            <div>
              <Label className="text-xs">Upload file</Label>
              <Input type="file" accept=".csv,text/csv" onChange={onFile} data-testid="import-file-input" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">…or paste CSV</Label>
              <Textarea
                data-testid="import-textarea"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={"barcode,name,qty,lot,expiry,min_stock,location,storage,cost,unit\n5901234,Glucose Reagent,20,L23,2026-03-01,10,Fridge 1,2-8C,3.50,mL"}
                className="mt-1 font-mono text-xs h-40"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={runImport} disabled={importing} data-testid="import-submit-button">
              {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit item dialog */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="max-w-lg" data-testid="edit-item-dialog">
          <DialogHeader>
            <DialogTitle>Edit item</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Name</Label>
                <Input data-testid="edit-name-input" value={editItem.name} onChange={(e) => setEditItem({ ...editItem, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input value={editItem.unit} onChange={(e) => setEditItem({ ...editItem, unit: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Min stock</Label>
                <Input data-testid="edit-minstock-input" type="number" step="any" value={editItem.min_stock} onChange={(e) => setEditItem({ ...editItem, min_stock: e.target.value })} className="tabnum" />
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input value={editItem.location} onChange={(e) => setEditItem({ ...editItem, location: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Storage</Label>
                <Input value={editItem.storage} onChange={(e) => setEditItem({ ...editItem, storage: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Unit cost</Label>
                <Input type="number" step="any" value={editItem.cost} onChange={(e) => setEditItem({ ...editItem, cost: e.target.value })} className="tabnum" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving} data-testid="edit-save-button">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
