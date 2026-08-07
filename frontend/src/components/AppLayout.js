import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  ScanLine,
  LayoutDashboard,
  History as HistoryIcon,
  Users as UsersIcon,
  LogOut,
  Menu,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/scan", label: "Scan", icon: ScanLine, testid: "nav-scan" },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/history", label: "Audit Log", icon: HistoryIcon, testid: "nav-history" },
  { to: "/users", label: "Users", icon: UsersIcon, testid: "nav-users", adminOnly: true },
];

const NavItems = ({ role, onNavigate }) => (
  <nav className="flex flex-col gap-1">
    {NAV.filter((n) => !n.adminOnly || role === "admin").map((n) => (
      <NavLink
        key={n.to}
        to={n.to}
        onClick={onNavigate}
        data-testid={n.testid}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            isActive
              ? "bg-[color:var(--ls-primary-soft)] text-[color:var(--ls-primary)]"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          )
        }
      >
        <n.icon className="h-[18px] w-[18px]" />
        {n.label}
      </NavLink>
    ))}
  </nav>
);

const Brand = () => (
  <div className="flex items-center gap-2.5 px-1">
    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color:var(--ls-primary)] text-white shadow-sm">
      <FlaskConical className="h-5 w-5" />
    </div>
    <div className="leading-tight">
      <div className="font-heading text-[17px] font-bold text-slate-900">LabStock</div>
      <div className="text-[11px] text-slate-500">Reagent &amp; QC inventory</div>
    </div>
  </div>
);

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const initials = (user?.name || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[#f7fafc] text-[color:var(--ls-text)]">
      {/* Sidebar - desktop */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[264px] flex-col border-r border-[color:var(--ls-border)] bg-white px-4 py-5">
        <Brand />
        <div className="mt-7 flex-1">
          <NavItems role={user?.role} />
        </div>
        <div className="border-t border-[color:var(--ls-border)] pt-4">
          <div className="flex items-center gap-3 px-1 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--ls-primary-soft)] text-[color:var(--ls-primary)] text-xs font-semibold">
              {initials}
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-slate-800" data-testid="current-user-name">{user?.name}</div>
              <div className="text-[11px] capitalize text-slate-500">{user?.role}</div>
            </div>
          </div>
          <Button variant="outline" className="w-full justify-start" onClick={handleLogout} data-testid="logout-button">
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Topbar - mobile */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between border-b border-[color:var(--ls-border)] bg-white/90 backdrop-blur px-4 py-3">
        <Brand />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" data-testid="mobile-menu-button">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[260px] p-4">
            <div className="mb-6"><Brand /></div>
            <NavItems role={user?.role} onNavigate={() => setOpen(false)} />
            <div className="absolute bottom-4 left-4 right-4">
              <Button variant="outline" className="w-full" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Content */}
      <main className="lg:pl-[264px]">
        <div className="mx-auto max-w-[1400px] px-3 sm:px-6 lg:px-8 py-5">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
