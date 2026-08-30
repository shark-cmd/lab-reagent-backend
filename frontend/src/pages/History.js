import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const ACTION_META = {
  in: { label: "Stock in", variant: "ok" },
  use: { label: "Use", variant: "expiring90" },
  register: { label: "Register", variant: "neutral" },
  adjust: { label: "Adjust", variant: "low" },
  adjust_out: { label: "Adjust out", variant: "low" },
  move: { label: "Move", variant: "neutral" },
  edit: { label: "Edit", variant: "neutral" },
  delete: { label: "Delete", variant: "expired" },
  import: { label: "Import", variant: "ok" },
};

const ACTIONS = ["in", "use", "register", "adjust", "move", "edit", "delete"];

const fmtTs = (ts) => {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
};

export default function History() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("all");
  const [technician, setTechnician] = useState("all");
  const [techs, setTechs] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 500 };
      if (action !== "all") params.action = action;
      if (technician !== "all") params.technician = technician;
      const { data } = await api.get("/history", { params });
      setLogs(data.logs);
    } catch (e) {
      toast.error("Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [action, technician]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get("/technicians").then(({ data }) => setTechs(data.technicians)).catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-[color:var(--ls-primary)]" /> Audit Log
          </h1>
          <p className="text-sm text-slate-500">Append-only record of every transaction (NABL / ISO 15189)</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-[150px] h-9" data-testid="history-action-filter">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>{ACTION_META[a]?.label || a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={technician} onValueChange={setTechnician}>
            <SelectTrigger className="w-[170px] h-9" data-testid="history-technician-filter">
              <SelectValue placeholder="Technician" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All technicians</SelectItem>
              {techs.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} data-testid="history-refresh-button">
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      <Card className="border-[color:var(--ls-border)] overflow-hidden">
        <div className="overflow-auto thin-scroll max-h-[calc(100vh-220px)]">
          <Table data-testid="audit-log-table">
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="bg-[color:var(--ls-surface-2)]">
                <TableHead className="w-[180px]">Timestamp</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Technician</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => {
                const meta = ACTION_META[l.action] || { label: l.action, variant: "neutral" };
                return (
                  <TableRow key={l.id} data-testid="audit-log-row">
                    <TableCell className="font-mono text-xs text-slate-600">{fmtTs(l.ts)}</TableCell>
                    <TableCell><StatusBadge variant={meta.variant}>{meta.label}</StatusBadge></TableCell>
                    <TableCell className="font-medium text-slate-800">{l.item_name}</TableCell>
                    <TableCell className="font-mono text-sm">{l.lot || "-"}</TableCell>
                    <TableCell className="text-right tabnum">{l.qty || 0}</TableCell>
                    <TableCell>{l.technician || "-"}</TableCell>
                    <TableCell className="text-xs text-slate-500 max-w-[280px] truncate">{l.detail}</TableCell>
                  </TableRow>
                );
              })}
              {(!loading && logs.length === 0) && (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">No log entries yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
