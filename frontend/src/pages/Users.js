import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { UserPlus, Trash2, Users as UsersIcon, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";

export default function Users() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ username: "", name: "", password: "", pin: "", role: "technician" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/users");
      setUsers(data);
    } catch (e) {
      toast.error("Failed to load users (admin only)");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createUser = async () => {
    if (!form.username || !form.name || !form.password) {
      toast.error("Username, name and password are required");
      return;
    }
    setSaving(true);
    try {
      await api.post("/users", form);
      toast.success("User created");
      setOpen(false);
      setForm({ username: "", name: "", password: "", pin: "", role: "technician" });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { active: !u.active });
      load();
    } catch (e) {
      toast.error("Update failed");
    }
  };

  const removeUser = async (u) => {
    if (!window.confirm(`Delete user ${u.username}?`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast.success("User deleted");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  const resetPin = async (u) => {
    const pin = window.prompt(`New 4-digit PIN for ${u.username}:`);
    if (!pin) return;
    try {
      await api.put(`/users/${u.id}`, { pin });
      toast.success("PIN updated");
    } catch (e) {
      toast.error("Update failed");
    }
  };

  if (user?.role !== "admin") {
    return (
      <Card className="p-8 text-center text-slate-500 border-[color:var(--ls-border)]">
        You need admin privileges to manage users.
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-slate-900 flex items-center gap-2">
            <UsersIcon className="h-6 w-6 text-[color:var(--ls-primary)]" /> Users
          </h1>
          <p className="text-sm text-slate-500">Manage technicians &amp; admins for accountability</p>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="add-user-button">
          <UserPlus className="h-4 w-4 mr-1.5" /> Add user
        </Button>
      </div>

      <Card className="border-[color:var(--ls-border)] overflow-hidden">
        <div className="overflow-auto thin-scroll">
          <Table data-testid="users-table">
            <TableHeader>
              <TableRow className="bg-[color:var(--ls-surface-2)]">
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} data-testid="user-row">
                  <TableCell className="font-medium text-slate-800">{u.name}</TableCell>
                  <TableCell className="font-mono text-sm">{u.username}</TableCell>
                  <TableCell>
                    <StatusBadge variant={u.role === "admin" ? "expiring90" : "ok"}>{u.role}</StatusBadge>
                  </TableCell>
                  <TableCell>
                    <Switch checked={u.active} onCheckedChange={() => toggleActive(u)} disabled={u.id === user.id} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => resetPin(u)} title="Reset PIN">
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeUser(u)} disabled={u.id === user.id}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!loading && users.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-8">No users.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" data-testid="add-user-dialog">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input data-testid="user-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. John Doe" />
            </div>
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input data-testid="user-username-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="lowercase, no spaces" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input data-testid="user-password-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>PIN (4 digits)</Label>
                <Input data-testid="user-pin-input" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} maxLength={4} className="font-mono" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="user-role-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="technician">Technician</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={createUser} disabled={saving} data-testid="user-create-submit">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Create user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
