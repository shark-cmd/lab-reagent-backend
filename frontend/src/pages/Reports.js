import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import { StatusBadge, expiryVariant } from "@/components/StatusBadge";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  TrendingUp, Mail, Send, Save, AlertTriangle, CalendarClock, Loader2, Info, Trash2, TriangleAlert,
} from "lucide-react";
import { InfoBanner } from "@/components/HelpHint";
import { toast } from "sonner";

const BAR_COLORS = ["#0E7490", "#2563EB", "#0B5CAD", "#1F7A4D", "#B45309", "#0E7490", "#2563EB", "#0B5CAD", "#1F7A4D", "#B45309"];

export default function Reports() {
  const { user } = useAuth();
  const [days, setDays] = useState("30");
  const [trends, setTrends] = useState(null);
  const [loading, setLoading] = useState(true);

  const [digest, setDigest] = useState(null);
  const [settings, setSettings] = useState(null);
  const [recipient, setRecipient] = useState("");
  const [dtime, setDtime] = useState("");
  const [sending, setSending] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [forecast, setForecast] = useState(null);

  const loadForecast = useCallback(async () => {
    try {
      const { data } = await api.get("/expiry-forecast");
      setForecast(data);
    } catch {
      toast.error("Failed to load expiry forecast");
    }
  }, []);

  const loadTrends = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/usage-trends", { params: { days: parseInt(days) } });
      setTrends(data);
    } catch {
      toast.error("Failed to load usage trends");
    } finally {
      setLoading(false);
    }
  }, [days]);

  const loadDigest = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([api.get("/digest"), api.get("/settings")]);
      setDigest(d.data);
      setSettings(s.data);
      setRecipient(s.data.digest_recipient || "");
      setDtime(s.data.digest_time || "");
    } catch {
      toast.error("Failed to load digest");
    }
  }, []);

  useEffect(() => {
    loadTrends();
  }, [loadTrends]);
  useEffect(() => {
    loadDigest();
  }, [loadDigest]);
  useEffect(() => {
    loadForecast();
  }, [loadForecast]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const { data } = await api.put("/settings", { digest_recipient: recipient, digest_time: dtime });
      setSettings(data);
      toast.success("Digest settings saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed (admin only)");
    } finally {
      setSavingSettings(false);
    }
  };

  const sendDigest = async () => {
    setSending(true);
    try {
      const { data } = await api.post("/digest/send");
      if (data.provider_configured) {
        toast.success(`Digest sent to ${data.recipient}`);
      } else {
        toast.info(data.message, { duration: 6000 });
      }
    } catch {
      toast.error("Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <InfoBanner id="reports" title="What's in Reports:" testid="reports-info-banner">
        <b>Usage trends</b> shows how fast reagents are consumed so you can predict reorders. <b>Expiry forecast</b> flags stock that will
        likely expire before it's used (so you can slow ordering or redistribute). <b>Email digest</b> is a daily summary of low-stock and
        expiring items for your supervisor.
      </InfoBanner>
      <div>
        <h1 className="font-heading text-2xl font-bold text-slate-900 flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-[color:var(--ls-primary)]" /> Reports
        </h1>
        <p className="text-sm text-slate-500">Consumption trends &amp; the daily email digest</p>
      </div>

      <Tabs defaultValue="trends" className="w-full">
        <TabsList>
          <TabsTrigger value="trends" data-testid="reports-tab-trends">Usage trends</TabsTrigger>
          <TabsTrigger value="forecast" data-testid="reports-tab-forecast">Expiry forecast</TabsTrigger>
          <TabsTrigger value="digest" data-testid="reports-tab-digest">Email digest</TabsTrigger>
        </TabsList>

        {/* Usage trends */}
        <TabsContent value="trends" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Card className="p-4 border-[color:var(--ls-border)]" data-testid="trends-total-used">
                <div className="text-xs uppercase tracking-wide text-slate-500">Total consumed</div>
                <div className="mt-1 font-heading text-2xl font-bold text-slate-900 tabnum">{loading ? "-" : trends?.total_used ?? 0}</div>
                <div className="text-xs text-slate-500">last {days} days</div>
              </Card>
              <Card className="p-4 border-[color:var(--ls-border)]">
                <div className="text-xs uppercase tracking-wide text-slate-500">Active reagents</div>
                <div className="mt-1 font-heading text-2xl font-bold text-slate-900 tabnum>{loading ? "-" : trends?.active_reagents ?? 0}</div>
                <div className="text-xs text-slate-500">with usage</div>
              </Card>
            </div>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[150px] h-9" data-testid="trends-days-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="p-4 border-[color:var(--ls-border)]">
            <h3 className="font-heading font-semibold text-slate-800 mb-3">Daily consumption</h3>
            <div className="h-[280px]" data-testid="trends-daily-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends?.daily || []} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0E7490" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0E7490" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(d) => d.slice(5)} minTickGap={20} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #d7e2ec" }} />
                  <Area type="monotone" dataKey="qty" stroke="#0E7490" strokeWidth={2} fill="url(#usageFill)" name="Consumed" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-4 border-[color:var(--ls-border)]">
            <h3 className="font-heading font-semibold text-slate-800 mb-3">Top consumed reagents</h3>
            {(trends?.by_item || []).length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">No consumption recorded in this period.</p>
            ) : (
              <div className="h-[320px]" data-testid="trends-byitem-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trends?.by_item || []} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: "#334155" }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #d7e2ec" }} />
                    <Bar dataKey="qty" radius={[0, 6, 6, 0]} name="Consumed">
                      {(trends?.by_item || []).map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Expiry forecast */}
        <TabsContent value="forecast" className="space-y-4">
          <div className="rounded-lg border border-[#FFD7A8] bg-[#FFF4E6] p-3 flex items-start gap-2 text-sm text-[#B45309]">
            <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">Waste risk forecast.</span> We project FEFO consumption against each reagent's recent usage rate to flag stock likely to <span className="font-medium">expire before it's used</span>, so you can slow ordering or redistribute it.
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card className="p-4 border-[color:var(--ls-border)]" data-testid="forecast-at-risk">
              <div className="text-xs uppercase tracking-wide text-slate-500">At-risk lots</div>
              <div className="mt-1 font-heading text-2xl font-bold text-slate-900 tabnum">{forecast?.summary?.at_risk_lots ?? 0}</div>
              <div className="text-xs text-slate-500">will expire unused</div>
            </Card>
            <Card className="p-4 border-[color:var(--ls-border)]" data-testid="forecast-waste-value">
              <div className="text-xs uppercase tracking-wide text-slate-500">Projected waste value</div>
              <div className="mt-1 font-heading text-2xl font-bold text-[#B42318] tabnum">${Number(forecast?.summary?.total_waste_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="text-xs text-slate-500">estimated</div>
            </Card>
            <Card className="p-4 border-[color:var(--ls-border)]">
              <div className="text-xs uppercase tracking-wide text-slate-500">High / expired</div>
              <div className="mt-1 font-heading text-2xl font-bold text-slate-900 tabnum">{forecast?.summary?.high_or_expired ?? 0}</div>
              <div className="text-xs text-slate-500">act soon</div>
            </Card>
          </div>

          <Card className="border-[color:var(--ls-border)] overflow-hidden">
            <div className="overflow-auto thin-scroll max-h-[480px]">
              <Table data-testid="forecast-table">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="bg-[color:var(--ls-surface-2)]">
                    <TableHead>Item</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">Days to expiry</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Usage/day</TableHead>
                    <TableHead className="text-right">Waste qty</TableHead>
                    <TableHead className="text-right">Waste $</TableHead>
                    <TableHead>Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(forecast?.rows || []).map((r, i) => {
                    const rv = r.risk === "expired" || r.risk === "high" ? "expiring30"
                      : r.risk === "medium" ? "expiring60"
                      : r.risk === "no_usage" ? "neutral" : "expiring90";
                    const rlabel = r.risk === "no_usage" ? "No usage" : r.risk.charAt(0).toUpperCase() + r.risk.slice(1);
                    return (
                      <TableRow key={i} data-testid="forecast-row">
                        <TableCell>
                          <div className="font-medium text-slate-800">{r.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{r.barcode}</div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{r.lot || "-"}</TableCell>
                        <TableCell className="font-mono text-sm">{r.expiry}</TableCell>
                        <TableCell className="text-right tabnum">{r.days_to_expiry}</TableCell>
                        <TableCell className="text-right tabnum">{r.qty} {r.unit}</TableCell>
                        <TableCell className="text-right tabnum">{r.usage_rate}</TableCell>
                        <TableCell className="text-right tabnum text-[#B42318] font-medium">{r.projected_waste}</TableCell>
                        <TableCell className="text-right tabnum">${Number(r.waste_value).toFixed(2)}</TableCell>
                        <TableCell><StatusBadge variant={rv}>{rlabel}</StatusBadge></TableCell>
                      </TableRow>
                    );
                  })}
                  {(forecast && (forecast.rows || []).length === 0) && (
                    <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">No waste risk detected, consumption keeps pace with expiries.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Email digest */}
        <TabsContent value="digest" className="space-y-4">
          <div className="rounded-lg border border-[#BBD7FF] bg-[#E8F2FF] p-3 flex items-start gap-2 text-sm text-[#0B5CAD]" data-testid="digest-provider-banner">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">Preview mode.</span> No email provider is configured yet, so “Send now” generates a preview only.
              Wire SendGrid or SMTP later to enable real delivery. Scheduled daily digest: <span className="font-medium">{settings?.digest_time} {settings?.digest_timezone}</span>.
            </div>
          </div>

          <Card className="p-4 border-[color:var(--ls-border)]">
            <div className="grid sm:grid-cols-3 gap-3 items-end">
              <div className="space-y-1.5">
                <Label>Recipient</Label>
                <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="supervisor@lab.com" data-testid="digest-recipient-input" disabled={user?.role !== "admin"} />
              </div>
              <div className="space-y-1.5">
                <Label>Daily send time</Label>
                <Input type="time" value={dtime} onChange={(e) => setDtime(e.target.value)} data-testid="digest-time-input" disabled={user?.role !== "admin"} />
              </div>
              <div className="flex gap-2">
                {user?.role === "admin" && (
                  <Button variant="outline" onClick={saveSettings} disabled={savingSettings} data-testid="digest-save-settings-button">
                    {savingSettings ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save
                  </Button>
                )}
                <Button onClick={sendDigest} disabled={sending} data-testid="digest-send-button">
                  {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Send now
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="border-[color:var(--ls-border)] overflow-hidden">
              <div className="p-3 border-b border-[color:var(--ls-border)] flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[#B45309]" />
                <h3 className="font-heading font-semibold text-slate-800">Low stock ({digest?.summary?.low_stock_count ?? 0})</h3>
              </div>
              <div className="overflow-auto thin-scroll max-h-[340px]">
                <Table data-testid="digest-lowstock-table">
                  <TableHeader>
                    <TableRow className="bg-[color:var(--ls-surface-2)]">
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">On hand</TableHead>
                      <TableHead className="text-right">Min</TableHead>
                      <TableHead className="text-right">Short</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(digest?.low_stock || []).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right tabnum">{r.on_hand} {r.unit}</TableCell>
                        <TableCell className="text-right tabnum">{r.min_stock}</TableCell>
                        <TableCell className="text-right tabnum text-[#B45309]">{r.shortfall}</TableCell>
                      </TableRow>
                    ))}
                    {(digest?.low_stock || []).length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-slate-400 py-6">All good, nothing to reorder.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>

            <Card className="border-[color:var(--ls-border)] overflow-hidden">
              <div className="p-3 border-b border-[color:var(--ls-border)] flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-[#0B5CAD]" />
                <h3 className="font-heading font-semibold text-slate-800">Expiring ≤90d ({digest?.summary?.expiring_count ?? 0})</h3>
              </div>
              <div className="overflow-auto thin-scroll max-h-[340px]">
                <Table data-testid="digest-expiring-table">
                  <TableHeader>
                    <TableRow className="bg-[color:var(--ls-surface-2)]">
                      <TableHead>Item</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead className="text-right">Days</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(digest?.expiring || []).map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{e.name}</TableCell>
                        <TableCell className="font-mono text-sm">{e.expiry}</TableCell>
                        <TableCell className="text-right">
                          <StatusBadge variant={expiryVariant(e.days_left)}>{e.days_left}</StatusBadge>
                        </TableCell>
                        <TableCell className="text-right tabnum">{e.qty} {e.unit}</TableCell>
                      </TableRow>
                    ))}
                    {(digest?.expiring || []).length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-slate-400 py-6">Nothing expiring within 90 days.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
