import { useState, useRef, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import CameraScanner from "@/components/CameraScanner";
import { HelpHint, InfoBanner } from "@/components/HelpHint";
import {
  MinusCircle,
  PackagePlus,
  ClipboardCheck,
  MoveRight,
  Camera,
  MapPin,
  Trash2,
  CheckCircle2,
  ScanLine,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

const MODES = [
  { key: "use", label: "Use", icon: MinusCircle, testid: "scan-mode-use-toggle", hint: "Consume stock (FEFO)" },
  { key: "receive", label: "Receive", icon: PackagePlus, testid: "scan-mode-receive-toggle", hint: "Add incoming stock" },
  { key: "count", label: "Count", icon: ClipboardCheck, testid: "scan-mode-count-toggle", hint: "Stocktake / cycle count" },
  { key: "move", label: "Move", icon: MoveRight, testid: "scan-mode-move-toggle", hint: "Change storage location" },
];

const vibrate = (ms) => {
  try {
    if (navigator?.vibrate) navigator.vibrate(ms);
  } catch {}
};

export default function ScanPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState("use");
  const [barcode, setBarcode] = useState("");
  const [qty, setQty] = useState("1");
  const [lot, setLot] = useState("");
  const [expiry, setExpiry] = useState("");
  const [activeLocation, setActiveLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [scans, setScans] = useState([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [queue, setQueue] = useState([]);

  // register dialog
  const [regOpen, setRegOpen] = useState(false);
  const [regData, setRegData] = useState(null);

  const inputRef = useRef(null);

  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    focusInput();
  }, [mode, focusInput]);

  const pushScan = (entry) => {
    setScans((prev) => [{ ...entry, ts: Date.now() }, ...prev].slice(0, 12));
  };

  const resetAfter = () => {
    setBarcode("");
    if (mode !== "receive") {
      // keep lot/expiry for repeated receiving
      setLot("");
      setExpiry("");
    }
    focusInput();
  };

  const handleUnknown = (code) => {
    setRegData({
      barcode: code,
      name: "",
      unit: "unit",
      min_stock: "0",
      cost: "0",
      location: activeLocation || "",
      storage: "Ambient",
      qty: qty || "0",
      lot: lot || "",
      expiry: expiry || "",
    });
    setRegOpen(true);
    vibrate(60);
  };

  const doUse = async (code) => {
    const n = parseFloat(qty);
    if (!n || n <= 0) {
      toast.error("Enter a quantity greater than 0");
      return;
    }
    const { data } = await api.post("/use", { barcode: code, qty: n });
    if (!data.ok) {
      toast.warning(`Short by ${data.shortfall} — only ${data.total} left`, {
        description: data.item_name,
      });
    } else {
      toast.success(`Used ${n} — ${data.item_name}`, {
        description: `Remaining: ${data.total}`,
      });
    }
    pushScan({
      mode: "use",
      name: data.item_name,
      barcode: code,
      detail: data.ok ? `-${n} → ${data.total} left` : `Short ${data.shortfall}`,
      ok: data.ok,
    });
    vibrate(20);
  };

  const doReceiveToQueue = async (code) => {
    const n = parseFloat(qty);
    if (!n || n <= 0) {
      toast.error("Enter a quantity greater than 0");
      return;
    }
    // resolve name for display
    let name = code;
    try {
      const { data } = await api.post("/resolve", { barcode: code });
      if (data.type === "item" && data.found) name = data.item.name;
    } catch {}
    const entry = {
      id: `${code}-${Date.now()}`,
      barcode: code,
      qty: n,
      lot,
      expiry,
      location: activeLocation || "",
      name,
    };
    setQueue((prev) => [entry, ...prev]);
    toast.success(`Queued ${n} × ${name}`);
    pushScan({ mode: "receive", name, barcode: code, detail: `queued +${n}`, ok: true });
    vibrate(20);
  };

  const doCount = async (code) => {
    const n = parseFloat(qty);
    if (isNaN(n) || n < 0) {
      toast.error("Enter counted quantity");
      return;
    }
    const { data } = await api.post("/stocktake", {
      barcode: code,
      counted: n,
      location: activeLocation || null,
    });
    const sign = data.adjustment > 0 ? `+${data.adjustment}` : `${data.adjustment}`;
    toast.success(`Counted ${data.item_name}: ${data.counted}`, {
      description: `Was ${data.previous} (adj ${sign})`,
    });
    pushScan({
      mode: "count",
      name: data.item_name,
      barcode: code,
      detail: `count ${data.counted} (adj ${sign})`,
      ok: true,
    });
    vibrate(20);
  };

  const doMove = async (code) => {
    if (!activeLocation) {
      toast.error("Set a location first (scan a LOC: label or type one)");
      return;
    }
    const { data } = await api.post("/move", { barcode: code, location: activeLocation });
    toast.success(`Moved ${data.item_name} → ${data.location}`);
    pushScan({ mode: "move", name: data.item_name, barcode: code, detail: `→ ${data.location}`, ok: true });
    vibrate(20);
  };

  const processBarcode = async (raw) => {
    const code = (raw || "").trim();
    if (!code) return;
    setBusy(true);
    try {
      // Location label handling
      if (code.toUpperCase().startsWith("LOC:")) {
        const loc = code.slice(4).replace(/_/g, " ").trim();
        setActiveLocation(loc);
        toast.info(`Active location set: ${loc}`);
        pushScan({ mode: "loc", name: loc, barcode: code, detail: "location set", ok: true });
        resetAfter();
        return;
      }

      // Resolve to check existence for modes that need registration
      const { data } = await api.post("/resolve", { barcode: code });
      if (data.type === "item" && !data.found) {
        handleUnknown(code);
        return;
      }

      if (mode === "use") await doUse(code);
      else if (mode === "receive") await doReceiveToQueue(code);
      else if (mode === "count") await doCount(code);
      else if (mode === "move") await doMove(code);

      resetAfter();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Action failed");
      vibrate(60);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    processBarcode(barcode);
  };

  const submitRegister = async () => {
    if (!regData?.name?.trim()) {
      toast.error("Item name is required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        barcode: regData.barcode,
        qty: parseFloat(regData.qty) || 0,
        lot: regData.lot || "",
        expiry: regData.expiry || "",
        name: regData.name.trim(),
        unit: regData.unit || "unit",
        min_stock: parseFloat(regData.min_stock) || 0,
        location: regData.location || "",
        storage: regData.storage || "Ambient",
        cost: parseFloat(regData.cost) || 0,
      };
      const { data } = await api.post("/stock-in", payload);
      toast.success(`Registered ${payload.name}`, {
        description: payload.qty > 0 ? `Added ${payload.qty} to stock` : "New item created",
      });
      pushScan({
        mode: "register",
        name: payload.name,
        barcode: payload.barcode,
        detail: payload.qty > 0 ? `registered +${payload.qty}` : "registered",
        ok: true,
      });
      setRegOpen(false);
      setRegData(null);
      resetAfter();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  const commitQueue = async () => {
    if (queue.length === 0) return;
    setBusy(true);
    try {
      const items = queue.map((q) => ({
        barcode: q.barcode,
        qty: q.qty,
        lot: q.lot,
        expiry: q.expiry,
        location: q.location,
      }));
      const { data } = await api.post("/receive-commit", { items });
      toast.success(`Received ${data.count} line(s) into stock`);
      setQueue([]);
      focusInput();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Commit failed");
    } finally {
      setBusy(false);
    }
  };

  const currentMode = MODES.find((m) => m.key === mode);
  const showQty = mode !== "move";
  const showLotExpiry = mode === "receive";

  return (
    <div className="space-y-5">
      <InfoBanner id="scan" title="How scanning works:" testid="scan-info-banner">
        Pick a mode, then scan or type a barcode and press Enter. <b>Use</b> removes stock (oldest-expiry first),
        <b> Receive</b> adds incoming stock to a queue you commit together, <b>Count</b> sets a physical stocktake number,
        and <b>Move</b> changes an item's location. Scanning a <span className="font-mono">LOC:</span> shelf label sets the active location.
        Unknown barcodes pop up a quick registration form.
      </InfoBanner>

      {/* Header */}
      <div className="rounded-2xl scan-accent border border-[color:var(--ls-border)] bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-heading text-2xl font-bold text-slate-900 flex items-center gap-2">
              <ScanLine className="h-6 w-6 text-[color:var(--ls-primary)]" /> Scan
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Signed in as <span className="font-medium text-slate-700">{user?.name}</span> · {currentMode?.hint}
            </p>
          </div>
          {activeLocation ? (
            <div
              className="flex items-center gap-2 rounded-lg bg-[color:var(--ls-primary-soft)] text-[color:var(--ls-primary)] px-3 py-1.5 text-sm font-medium"
              data-testid="active-location-banner"
            >
              <MapPin className="h-4 w-4" /> {activeLocation}
              <button
                className="ml-1 text-[color:var(--ls-primary)]/70 hover:text-[color:var(--ls-primary)]"
                onClick={() => setActiveLocation("")}
                data-testid="clear-location-button"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
        </div>

        {/* Mode toggle */}
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v)}
          className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2"
        >
          {MODES.map((m) => (
            <ToggleGroupItem
              key={m.key}
              value={m.key}
              data-testid={m.testid}
              className="h-14 rounded-xl border border-[color:var(--ls-border)] bg-white data-[state=on]:bg-[color:var(--ls-primary-soft)] data-[state=on]:text-[color:var(--ls-primary)] data-[state=on]:border-[color:var(--ls-primary)] flex-col gap-1 hover:shadow-sm transition-colors"
            >
              <m.icon className="h-5 w-5" />
              <span className="text-[13px] font-semibold">{m.label}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Scan form */}
        <Card className="lg:col-span-2 p-5 border-[color:var(--ls-border)]">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="barcode">Barcode</Label>
              <div className="flex gap-2">
                <Input
                  id="barcode"
                  ref={inputRef}
                  data-testid="scan-barcode-input"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Scan or type barcode, then Enter…"
                  className="h-12 text-base font-mono"
                  autoComplete="off"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 px-3 shrink-0"
                  onClick={() => setCameraOpen(true)}
                  data-testid="scan-camera-open-button"
                  title="Scan with camera"
                >
                  <Camera className="h-5 w-5" />
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Tip: scan a <span className="font-mono">LOC:Cold_Room_Fridge1</span> label to set the active location.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              {showQty && (
                <div className="space-y-1.5">
                  <Label htmlFor="qty" className="flex items-center gap-1">
                    {mode === "count" ? "Counted qty" : "Quantity"}
                    <HelpHint text={mode === "count" ? "The physical amount you counted on the shelf. LabStock adjusts stock to match this number." : mode === "use" ? "How many units you're taking out now." : "How many units you're adding."} />
                  </Label>
                  <Input
                    id="qty"
                    data-testid="scan-qty-input"
                    type="number"
                    step="any"
                    min="0"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="h-11 tabnum"
                  />
                </div>
              )}
              {showLotExpiry && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="lot">Lot</Label>
                    <Input
                      id="lot"
                      data-testid="scan-lot-input"
                      value={lot}
                      onChange={(e) => setLot(e.target.value)}
                      placeholder="Lot #"
                      className="h-11 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="expiry" className="flex items-center gap-1">
                      Expiry <HelpHint text="Expiry date of this lot. LabStock consumes soonest-to-expire stock first (FEFO) and warns you before it expires." />
                    </Label>
                    <Input
                      id="expiry"
                      data-testid="scan-expiry-input"
                      type="date"
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      className="h-11"
                    />
                  </div>
                </>
              )}
              {mode === "move" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="loc">Location</Label>
                  <Input
                    id="loc"
                    data-testid="scan-location-input"
                    value={activeLocation}
                    onChange={(e) => setActiveLocation(e.target.value)}
                    placeholder="e.g. Cold Room / Fridge 1 / Shelf B"
                    className="h-11"
                  />
                </div>
              )}
            </div>

            <Button type="submit" className="w-full h-12 text-base" disabled={busy} data-testid="scan-submit-button">
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <currentMode.icon className="h-5 w-5 mr-2" />}
              {mode === "use" && "Record usage"}
              {mode === "receive" && "Add to receive queue"}
              {mode === "count" && "Record count"}
              {mode === "move" && "Move item"}
            </Button>
          </form>

          {/* Receive queue */}
          {mode === "receive" && (
            <div className="mt-5 border-t border-[color:var(--ls-border)] pt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-heading font-semibold text-slate-800">
                  Receive queue <span className="text-slate-400">({queue.length})</span>
                </h3>
                <Button
                  size="sm"
                  onClick={commitQueue}
                  disabled={queue.length === 0 || busy}
                  data-testid="receive-commit-button"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Commit queue
                </Button>
              </div>
              {queue.length === 0 ? (
                <p className="text-sm text-slate-400 py-3">Scan items to build the receive queue, then commit.</p>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-auto thin-scroll">
                  {queue.map((q) => (
                    <div
                      key={q.id}
                      className="flex items-center justify-between rounded-lg border border-[color:var(--ls-border)] bg-[color:var(--ls-surface-2)] px-3 py-2"
                      data-testid="receive-queue-row"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{q.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono truncate">
                          {q.barcode} · lot {q.lot || "—"} · exp {q.expiry || "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold tabnum text-[color:var(--ls-primary)]">+{q.qty}</span>
                        <button
                          onClick={() => setQueue((prev) => prev.filter((x) => x.id !== q.id))}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Recent scans */}
        <Card className="p-5 border-[color:var(--ls-border)]">
          <h3 className="font-heading font-semibold text-slate-800 mb-3">Recent activity</h3>
          {scans.length === 0 ? (
            <div className="text-sm text-slate-400 py-8 text-center">
              <ScanLine className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              Scan an item to begin
            </div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-auto thin-scroll">
              {scans.map((s, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-2 rounded-lg border border-[color:var(--ls-border)] px-3 py-2"
                  data-testid="recent-scan-row"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{s.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{s.detail}</div>
                  </div>
                  <StatusBadge variant={s.ok ? "ok" : "expiring30"}>{s.mode}</StatusBadge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <CameraScanner
        open={cameraOpen}
        onClose={() => {
          setCameraOpen(false);
          focusInput();
        }}
        onDetected={(text) => {
          setCameraOpen(false);
          setBarcode(text);
          processBarcode(text);
        }}
      />

      {/* Unknown barcode register dialog */}
      <Dialog open={regOpen} onOpenChange={(o) => !o && (setRegOpen(false), setRegData(null), focusInput())}>
        <DialogContent className="max-w-lg" data-testid="unknown-barcode-dialog">
          <DialogHeader>
            <DialogTitle>Register new item</DialogTitle>
            <DialogDescription>
              Barcode <span className="font-mono text-slate-700">{regData?.barcode}</span> isn't registered yet.
              Enter its details once.
            </DialogDescription>
          </DialogHeader>
          {regData && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Item name *</Label>
                <Input
                  data-testid="register-name-input"
                  value={regData.name}
                  onChange={(e) => setRegData({ ...regData, name: e.target.value })}
                  placeholder="e.g. Glucose Reagent"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input value={regData.unit} onChange={(e) => setRegData({ ...regData, unit: e.target.value })} placeholder="mL, tests, box" />
              </div>
              <div className="space-y-1.5">
                <Label>Min stock</Label>
                <Input type="number" step="any" value={regData.min_stock} onChange={(e) => setRegData({ ...regData, min_stock: e.target.value })} className="tabnum" />
              </div>
              <div className="space-y-1.5">
                <Label>Initial qty</Label>
                <Input data-testid="register-qty-input" type="number" step="any" value={regData.qty} onChange={(e) => setRegData({ ...regData, qty: e.target.value })} className="tabnum" />
              </div>
              <div className="space-y-1.5">
                <Label>Unit cost</Label>
                <Input type="number" step="any" value={regData.cost} onChange={(e) => setRegData({ ...regData, cost: e.target.value })} className="tabnum" />
              </div>
              <div className="space-y-1.5">
                <Label>Lot</Label>
                <Input value={regData.lot} onChange={(e) => setRegData({ ...regData, lot: e.target.value })} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry</Label>
                <Input type="date" value={regData.expiry} onChange={(e) => setRegData({ ...regData, expiry: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input value={regData.location} onChange={(e) => setRegData({ ...regData, location: e.target.value })} placeholder="Cold Room / Fridge 1" />
              </div>
              <div className="space-y-1.5">
                <Label>Storage</Label>
                <Input value={regData.storage} onChange={(e) => setRegData({ ...regData, storage: e.target.value })} placeholder="Ambient / 2-8°C / -20°C" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRegOpen(false); setRegData(null); focusInput(); }}>
              Cancel
            </Button>
            <Button onClick={submitRegister} disabled={busy} data-testid="unknown-barcode-register-submit">
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Register &amp; save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
