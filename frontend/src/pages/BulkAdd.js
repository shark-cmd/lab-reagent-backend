import { useState, useRef } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { HelpHint, InfoBanner } from "@/components/HelpHint";
import {
  Rows3, Plus, Trash2, Copy, ClipboardPaste, Eraser, CheckCircle2, Loader2, PackagePlus,
} from "lucide-react";
import { toast } from "sonner";

const COLS = [
  { key: "barcode", label: "Barcode", w: "150px", hint: "The code your scanner reads. Required — it uniquely identifies the product.", req: true, mono: true },
  { key: "name", label: "Name", w: "180px", hint: "Human-friendly reagent/QC name, e.g. 'Glucose Reagent'. Required for new items.", req: true },
  { key: "qty", label: "Qty", w: "80px", hint: "How many units you are adding to stock right now.", type: "number" },
  { key: "unit", label: "Unit", w: "80px", hint: "Unit of measure, e.g. mL, tests, box, vial." },
  { key: "lot", label: "Lot", w: "110px", hint: "Manufacturer lot/batch number. Leave blank if not tracked.", mono: true },
  { key: "expiry", label: "Expiry", w: "150px", hint: "Expiry date (YYYY-MM-DD). Drives FEFO and expiry alerts. Blank = never expires.", type: "date" },
  { key: "min_stock", label: "Min stock", w: "100px", hint: "Reorder threshold. If total on-hand drops below this, it shows in reorder alerts.", type: "number" },
  { key: "location", label: "Location", w: "150px", hint: "Where it lives, e.g. 'Cold Room / Fridge 1'." },
  { key: "storage", label: "Storage", w: "110px", hint: "Storage condition, e.g. Ambient, 2-8°C, -20°C." },
  { key: "cost", label: "Unit cost", w: "90px", hint: "Cost per unit — used to compute inventory value.", type: "number" },
];

const blankRow = () => ({ barcode: "", name: "", qty: "", unit: "unit", lot: "", expiry: "", min_stock: "", location: "", storage: "Ambient", cost: "" });

export default function BulkAdd() {
  const [rows, setRows] = useState([blankRow(), blankRow(), blankRow()]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (i, key, value) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  const addRow = () => setRows((rs) => [...rs, blankRow()]);
  const addRows = (n) => setRows((rs) => [...rs, ...Array.from({ length: n }, blankRow)]);
  const removeRow = (i) => setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : [blankRow()]));
  const dupRow = (i) => setRows((rs) => [...rs.slice(0, i + 1), { ...rs[i] }, ...rs.slice(i + 1)]);
  const clearAll = () => setRows([blankRow(), blankRow(), blankRow()]);

  const filledCount = rows.filter((r) => r.barcode.trim()).length;

  const parsePaste = () => {
    const text = pasteText.trim();
    if (!text) {
      toast.error("Nothing to paste");
      return;
    }
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const parsed = [];
    lines.forEach((line, idx) => {
      const cells = line.includes("\t") ? line.split("\t") : line.split(",");
      // skip a header row
      if (idx === 0 && cells[0].trim().toLowerCase() === "barcode") return;
      const r = blankRow();
      const order = ["barcode", "name", "qty", "unit", "lot", "expiry", "min_stock", "location", "storage", "cost"];
      order.forEach((k, ci) => {
        if (cells[ci] !== undefined) r[k] = cells[ci].trim();
      });
      if (!r.unit) r.unit = "unit";
      if (!r.storage) r.storage = "Ambient";
      if (r.barcode) parsed.push(r);
    });
    if (parsed.length === 0) {
      toast.error("Could not parse any rows. Ensure Barcode is the first column.");
      return;
    }
    setRows((rs) => {
      const existing = rs.filter((r) => r.barcode.trim());
      return [...existing, ...parsed, blankRow()];
    });
    setPasteOpen(false);
    setPasteText("");
    toast.success(`Added ${parsed.length} row(s) from paste`);
  };

  const submit = async () => {
    const valid = rows.filter((r) => r.barcode.trim());
    if (valid.length === 0) {
      toast.error("Add at least one row with a barcode");
      return;
    }
    const missingName = valid.filter((r) => !r.name.trim());
    if (missingName.length > 0) {
      toast.warning(`${missingName.length} row(s) have no name — they'll be saved with a generated name.`);
    }
    setBusy(true);
    try {
      const items = valid.map((r) => ({
        barcode: r.barcode.trim(),
        name: r.name.trim() || null,
        qty: parseFloat(r.qty) || 0,
        unit: r.unit.trim() || "unit",
        lot: r.lot.trim(),
        expiry: r.expiry.trim(),
        min_stock: parseFloat(r.min_stock) || 0,
        location: r.location.trim(),
        storage: r.storage.trim() || "Ambient",
        cost: parseFloat(r.cost) || 0,
      }));
      const { data } = await api.post("/receive-commit", { items });
      toast.success(`Added ${data.imported} item line(s) to inventory`, {
        description: `${data.registered} new item(s) registered${data.errors?.length ? ` · ${data.errors.length} skipped` : ""}`,
        duration: 5000,
      });
      if (data.errors?.length) console.warn("Bulk add errors:", data.errors);
      clearAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Bulk add failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Rows3 className="h-6 w-6 text-[color:var(--ls-primary)]" /> Bulk Add
          </h1>
          <p className="text-sm text-slate-500">Add many reagents at once in one editable sheet</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setPasteOpen(true)} data-testid="bulk-paste-open-button">
            <ClipboardPaste className="h-4 w-4 mr-1.5" /> Paste from Excel
          </Button>
          <Button variant="outline" size="sm" onClick={clearAll} data-testid="bulk-clear-button">
            <Eraser className="h-4 w-4 mr-1.5" /> Clear
          </Button>
        </div>
      </div>

      <InfoBanner id="bulkadd" title="How Bulk Add works:" testid="bulk-info-banner">
        Fill one row per product. Only <b>Barcode</b> and <b>Name</b> are needed to create an item — everything else is optional.
        If a barcode already exists, its stock is topped up (a new lot is created for the lot/expiry you enter). Hover the <b>?</b> on any
        column for tips, or click <b>Paste from Excel</b> to drop in a whole spreadsheet at once. Nothing is saved until you press
        <b> Add all to inventory</b>.
      </InfoBanner>

      <Card className="border-[color:var(--ls-border)] overflow-hidden">
        <div className="overflow-auto thin-scroll">
          <table className="w-full text-sm" data-testid="bulk-add-table">
            <thead>
              <tr className="bg-[color:var(--ls-surface-2)] border-b border-[color:var(--ls-border)]">
                <th className="w-10 p-2 text-left text-xs font-semibold text-slate-500">#</th>
                {COLS.map((c) => (
                  <th key={c.key} className="p-2 text-left text-xs font-semibold text-slate-600 whitespace-nowrap" style={{ minWidth: c.w }}>
                    <span className="inline-flex items-center gap-1">
                      {c.label}{c.req && <span className="text-red-500">*</span>}
                      <HelpHint text={c.hint} />
                    </span>
                  </th>
                ))}
                <th className="w-20 p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-[color:var(--ls-border)] hover:bg-[color:var(--ls-surface-2)]/50" data-testid="bulk-add-row">
                  <td className="p-1.5 text-center text-xs text-slate-400 tabnum">{i + 1}</td>
                  {COLS.map((c) => (
                    <td key={c.key} className="p-1">
                      <Input
                        value={r[c.key]}
                        onChange={(e) => update(i, c.key, e.target.value)}
                        type={c.type || "text"}
                        step={c.type === "number" ? "any" : undefined}
                        placeholder={c.req ? "required" : ""}
                        data-testid={`bulk-cell-${c.key}-${i}`}
                        className={`h-9 ${c.mono ? "font-mono" : ""} ${c.type === "number" ? "text-right tabnum" : ""}`}
                      />
                    </td>
                  ))}
                  <td className="p-1">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400" onClick={() => dupRow(i)} title="Duplicate row" data-testid={`bulk-dup-${i}`}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => removeRow(i)} title="Remove row" data-testid={`bulk-remove-${i}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between p-3 border-t border-[color:var(--ls-border)] bg-white">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addRow} data-testid="bulk-add-row-button">
              <Plus className="h-4 w-4 mr-1" /> Add row
            </Button>
            <Button variant="ghost" size="sm" onClick={() => addRows(5)} data-testid="bulk-add-5-button">+5 rows</Button>
          </div>
          <div className="text-sm text-slate-500">
            <span className="font-semibold text-slate-700 tabnum">{filledCount}</span> row(s) ready
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={submit} disabled={busy || filledCount === 0} data-testid="bulk-submit-button">
          {busy ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
          Add all to inventory
        </Button>
      </div>

      {/* Paste dialog */}
      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-w-2xl" data-testid="bulk-paste-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ClipboardPaste className="h-5 w-5 text-[color:var(--ls-primary)]" /> Paste from spreadsheet</DialogTitle>
            <DialogDescription>
              Copy cells straight from Excel / Google Sheets and paste below. Column order:
              <span className="font-mono text-xs"> barcode · name · qty · unit · lot · expiry · min_stock · location · storage · cost</span>.
              A header row is auto-detected and skipped.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"5901234\tGlucose Reagent\t20\tmL\tL23\t2026-03-01\t10\tFridge 1\t2-8C\t3.50"}
            className="h-48 font-mono text-xs"
            data-testid="bulk-paste-textarea"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasteOpen(false)}>Cancel</Button>
            <Button onClick={parsePaste} data-testid="bulk-paste-parse-button">
              <PackagePlus className="h-4 w-4 mr-1.5" /> Add rows
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
