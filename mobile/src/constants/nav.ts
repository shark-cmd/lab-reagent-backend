import type { ComponentType } from 'react';
import {
  History,
  LayoutDashboard,
  Rows3,
  ScanLine,
  ShoppingCart,
  Tags,
  TrendingUp,
  Users,
} from 'lucide-react-native';

export interface NavItem {
  name: string;
  label: string;
  icon: ComponentType<{ size?: number; color?: string }>;
  adminOnly?: boolean;
}

/** Mirrors the web app's sidebar `NAV` (frontend/src/components/AppLayout.js). */
export const NAV: NavItem[] = [
  { name: 'scan', label: 'Scan', icon: ScanLine },
  { name: 'bulk-add', label: 'Bulk Add', icon: Rows3 },
  { name: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { name: 'purchase-orders', label: 'Purchase Orders', icon: ShoppingCart },
  { name: 'labels', label: 'Labels', icon: Tags },
  { name: 'reports', label: 'Reports', icon: TrendingUp },
  { name: 'history', label: 'Audit Log', icon: History },
  { name: 'users', label: 'Users', icon: Users, adminOnly: true },
];
