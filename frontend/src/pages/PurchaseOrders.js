import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { InfoBanner } from "@/components/HelpHint";
import {
  ShoppingCart, Plus, Printer, Trash2, PackageCheck, Send, RefreshCw, Loader2, FileText, FileDown, Mail,
} from "lucide-react";
import { toast } from "sonner";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUS_VARIANT = { draft: "neutral", ordered: "expiring90", received: "ok", cancelled: "expired" };
const fmt = (ts) => (ts ? new Date(ts).toLocaleDateString() : "—");

export default function PurchaseOrders() {
  const { user } = useAuth();
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([]);
  const [viewPo, setViewPo] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/purchase-orders");
      setPos(data.purchase_orders || []);
    } catch {
      toast.error("Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = async () => {
    try {
      const { data } = await api.get("/dashboard");
      const suggested = (data.reorder || []).map((r) => ({
        item_id: r.id, barcode: r.barcode, name: r.name, unit: r.unit,
        on_hand: r.total, min_stock: r.min_stock,
        order_qty: Math.max(Math.ceil(r.shortfall), 1),
        cost: (data.items.find((i) => i.id === r.id)?.cost) || 0,
      }));
      setLines(suggested);
      setSupplier("");
      setSupplierEmail("");
      setNotes("");
      setCreateOpen(true);
      if (suggested.length === 0) toast.info("No reorder alerts — you can still add lines manually below.");
    } catch {
      toast.error("Failed to load reorder suggestions");
    }
  };

  const updateLine = (idx, field, value) => {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };
  const removeLine = (idx) => setLines((ls) => ls.filter((_, i) => i !== idx));
  const addBlankLine = () =>
    setLines((ls) => [...ls, { item_id: "", barcode: "", name: "", unit: "unit", on_hand: 0, min_stock: 0, order_qty: 1, cost: 0 }]);

  const poTotal = lines.reduce((s, l) => s + (parseFloat(l.order_qty) || 0) * (parseFloat(l.cost) || 0), 0);

  const createPO = async () => {
    const valid = lines.filter((l) => l.name.trim());
    if (valid.length === 0) {
      toast.error("Add at least one line with a name");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        supplier,
        supplier_email: supplierEmail,
        notes,
        lines: valid.map((l) => ({
          item_id: l.item_id || "", barcode: l.barcode || "", name: l.name,
          unit: l.unit || "unit", on_hand: parseFloat(l.on_hand) || 0,
          min_stock: parseFloat(l.min_stock) || 0, order_qty: parseFloat(l.order_qty) || 0,
          cost: parseFloat(l.cost) || 0,
        })),
      };
      await api.post("/purchase-orders", payload);
      toast.success("Purchase order created (draft)");
      setCreateOpen(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (po, status) => {
    try {
      const { data } = await api.put(`/purchase-orders/${po.id}`, { status });
      toast.success(`Marked ${status}`);
      setViewPo(data);
      load();
    } catch (e) {
      toast.error("Update failed");
    }
  };

  const receivePO = async (po) => {
    if (!window.confirm("Receive this PO and add ordered quantities into stock?")) return;
    try {
      const { data } = await api.post(`/purchase-orders/${po.id}/receive`);
      toast.success("PO received — stock updated");
      setViewPo(data);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Receive failed");
    }
  };

  const deletePO = async (po) => {
    if (!window.confirm(`Delete ${po.po_number}?`)) return;
    try {
      await api.delete(`/purchase-orders/${po.id}`);
      toast.success("Deleted");
      setViewPo(null);
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  const printPO = () => {
    window.print();
  };

  const downloadPDF = async (po) => {
    try {
      const token = localStorage.getItem("ls_token");
      const res = await api.get(`/purchase-orders/${po.id}/pdf`, { params: { token }, responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${po.po_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("PDF downloaded");
    } catch {
      toast.error("PDF download failed");
    }
  };

  const emailSupplier = async (po) => {
    try {
      const { data } = await api.post(`/purchase-orders/${po.id}/email`);
      if (data.provider_configured) {
        toast.success(`PO emailed to ${data.recipient}`);
      } else {
        toast.info(data.message, { duration: 6000 });
      }
    } catch (e) {
      toast.error("Email failed");
    }
  };

  return (
    <div className="space-y-5">
      <InfoBanner id="po" title="Purchase orders in 3 steps:" testid="po-info-banner">
        Click <b>New PO from reorder</b> to auto-fill a draft from items that need restocking (edit quantities, cost and supplier as needed).
        <b> Mark ordered</b> once you've sent it to the supplier, then <b>Receive into stock</b> when the delivery arrives — that adds the quantities back into inventory.
        You can also download a <b>PDF</b> or email it to the supplier.
      </InfoBanner>
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <div>
          <h1 className="font-heading text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-[color:var(--ls-primary)]" /> Purchase Orders
          </h1>
          <p className="text-sm text-slate-500">Turn reorder alerts into purchase orders and track ordering</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} data-testid="po-refresh-button">
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
          <Button size="sm" onClick={openCreate} data-testid="po-create-open-button">
            <Plus className="h-4 w-4 mr-1.5" /> New PO from reorder
          </Button>
        </div>
      </div>

      <Card className="border-[color:var(--ls-border)] overflow-hidden no-print">
        <div className="overflow-auto thin-scroll">
          <Table data-testid="po-table">
            <TableHeader>
              <TableRow className="bg-[color:var(--ls-surface-2)]">
                <TableHead>PO #</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pos.map((po) => (
                <TableRow key={po.id} data-testid="po-row">
                  <TableCell className="font-mono text-sm font-medium">{po.po_number}</TableCell>
                  <TableCell>{po.supplier || "—"}</TableCell>
                  <TableCell className="text-right tabnum">{po.lines?.length || 0}</TableCell>
                  <TableCell className="text-right tabnum">{money(po.total_cost)}</TableCell>
                  <TableCell>{fmt(po.created_at)}</TableCell>
                  <TableCell><StatusBadge variant={STATUS_VARIANT[po.status] || "neutral"}>{po.status}</StatusBadge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setViewPo(po)} data-testid={`po-open-button-${po.id}`}>
                      <FileText className="h-4 w-4 mr-1" /> View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(!loading && pos.length === 0) && (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">No purchase orders yet. Create one from your reorder alerts.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl" data-testid="po-create-dialog">
          <DialogHeader>
            <DialogTitle>New purchase order</DialogTitle>
          </DialogHeader>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Acme Diagnostics" data-testid="po-supplier-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Supplier email</Label>
              <Input type="email" value={supplierEmail} onChange={(e) => setSupplierEmail(e.target.value)} placeholder="sales@supplier.com" data-testid="po-supplier-email-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="border border-[color:var(--ls-border)] rounded-lg overflow-hidden mt-2">
            <div className="overflow-auto thin-scroll max-h-[320px]">
              <Table>
                <TableHeader className="sticky top-0">
                  <TableRow className="bg-[color:var(--ls-surface-2)]">
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Order qty</TableHead>
                    <TableHead className="text-right">Unit cost</TableHead>
                    <TableHead className="text-right">Line total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l, idx) => (
                    <TableRow key={idx} data-testid="po-line-row">
                      <TableCell>
                        <Input value={l.name} onChange={(e) => updateLine(idx, "name", e.target.value)} className="h-8 min-w-[160px]" placeholder="Item name" />
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{l.barcode || "no barcode"}</div>
                      </TableCell>
                      <TableCell className="text-right tabnum text-slate-500">{l.on_hand} {l.unit}</TableCell>
                      <TableCell className="text-right">
                        <Input type="number" step="any" value={l.order_qty} onChange={(e) => updateLine(idx, "order_qty", e.target.value)} className="h-8 w-20 text-right tabnum ml-auto" data-testid="po-line-qty-input" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" step="any" value={l.cost} onChange={(e) => updateLine(idx, "cost", e.target.value)} className="h-8 w-20 text-right tabnum ml-auto" />
                      </TableCell>
                      <TableCell className="text-right tabnum">{money((parseFloat(l.order_qty) || 0) * (parseFloat(l.cost) || 0))}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeLine(idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {lines.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-6">No lines. Add one manually.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="flex items-center justify-between no-print">
            <Button variant="outline" size="sm" onClick={addBlankLine}><Plus className="h-4 w-4 mr-1" /> Add line</Button>
            <div className="text-sm font-semibold">Total: <span className="tabnum">{money(poTotal)}</span></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createPO} disabled={saving} data-testid="po-create-submit">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Create PO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View / print dialog */}
      <Dialog open={!!viewPo} onOpenChange={(o) => !o && setViewPo(null)}>
        <DialogContent className="max-w-3xl" data-testid="po-view-dialog">
          {viewPo && (
            <>
              <DialogHeader className="no-print">
                <DialogTitle className="flex items-center gap-2">
                  {viewPo.po_number}
                  <StatusBadge variant={STATUS_VARIANT[viewPo.status] || "neutral"}>{viewPo.status}</StatusBadge>
                </DialogTitle>
              </DialogHeader>

              <div className="printable">
                <div className="hidden print:block mb-4">
                  <div className="text-2xl font-bold">Purchase Order {viewPo.po_number}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div><span className="text-slate-500">Supplier:</span> <span className="font-medium">{viewPo.supplier || "—"}</span></div>
                  <div><span className="text-slate-500">Email:</span> {viewPo.supplier_email || "—"}</div>
                  <div><span className="text-slate-500">Created:</span> {fmt(viewPo.created_at)} by {viewPo.created_by}</div>
                  <div><span className="text-slate-500">Ordered:</span> {fmt(viewPo.ordered_at)}</div>
                  <div><span className="text-slate-500">Received:</span> {fmt(viewPo.received_at)}</div>
                </div>
                {viewPo.notes && <div className="text-sm text-slate-600 mb-2">Notes: {viewPo.notes}</div>}
                <div className="border border-slate-300 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="text-left p-2">Item</th>
                        <th className="text-left p-2">Barcode</th>
                        <th className="text-right p-2">Order qty</th>
                        <th className="text-right p-2">Unit cost</th>
                        <th className="text-right p-2">Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewPo.lines?.map((l, i) => (
                        <tr key={i} className="border-t border-slate-200">
                          <td className="p-2 font-medium">{l.name}</td>
                          <td className="p-2 font-mono text-xs">{l.barcode || "—"}</td>
                          <td className="p-2 text-right tabnum">{l.order_qty} {l.unit}</td>
                          <td className="p-2 text-right tabnum">{money(l.cost)}</td>
                          <td className="p-2 text-right tabnum">{money((l.order_qty || 0) * (l.cost || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-300 font-semibold">
                        <td className="p-2" colSpan={4}>Total</td>
                        <td className="p-2 text-right tabnum">{money(viewPo.total_cost)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <DialogFooter className="no-print flex-wrap gap-2">
                <Button variant="outline" onClick={() => deletePO(viewPo)} className="text-red-600 mr-auto" data-testid="po-delete-button">
                  <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                </Button>
                <Button variant="outline" onClick={printPO} data-testid="po-print-button">
                  <Printer className="h-4 w-4 mr-1.5" /> Print
                </Button>
                <Button variant="outline" onClick={() => downloadPDF(viewPo)} data-testid="po-pdf-button">
                  <FileDown className="h-4 w-4 mr-1.5" /> PDF
                </Button>
                <Button variant="outline" onClick={() => emailSupplier(viewPo)} data-testid="po-email-button">
                  <Mail className="h-4 w-4 mr-1.5" /> Email supplier
                </Button>
                {viewPo.status === "draft" && (
                  <Button variant="outline" onClick={() => setStatus(viewPo, "ordered")} data-testid="po-mark-ordered-button">
                    <Send className="h-4 w-4 mr-1.5" /> Mark ordered
                  </Button>
                )}
                {viewPo.status !== "received" && viewPo.status !== "cancelled" && (
                  <Button onClick={() => receivePO(viewPo)} data-testid="po-receive-button">
                    <PackageCheck className="h-4 w-4 mr-1.5" /> Receive into stock
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
