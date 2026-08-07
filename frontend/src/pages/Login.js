import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error("Enter username and password");
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password, pin);
      toast.success("Welcome back");
      navigate("/scan");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7fafc] scan-accent px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[color:var(--ls-primary)] text-white shadow-md">
            <FlaskConical className="h-7 w-7" />
          </div>
          <h1 className="mt-4 font-heading text-3xl font-bold text-slate-900">LabStock</h1>
          <p className="text-sm text-slate-500">Barcode-driven reagent &amp; QC inventory</p>
        </div>
        <Card className="p-6 shadow-[var(--ls-shadow-md)] border-[color:var(--ls-border)]">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                data-testid="login-username-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin"
                autoFocus
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                data-testid="login-password-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label>PIN <span className="text-slate-400 font-normal">(optional)</span></Label>
              <InputOTP maxLength={4} value={pin} onChange={setPin} data-testid="login-pin-input" containerClassName="justify-start">
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading} data-testid="login-submit-button">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Sign in
            </Button>
          </form>
          <div className="mt-5 rounded-lg bg-[color:var(--ls-surface-2)] p-3 text-xs text-slate-600">
            <div className="font-semibold text-slate-700 mb-1">Demo accounts</div>
            <div>Admin — <span className="font-mono">admin</span> / <span className="font-mono">admin123</span> · PIN <span className="font-mono">1234</span></div>
            <div>Technician — <span className="font-mono">tech</span> / <span className="font-mono">tech123</span> · PIN <span className="font-mono">5678</span></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
