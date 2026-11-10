/** API domain types — mirror the FastAPI response shapes (backend/server.py). */

export type Role = 'admin' | 'technician';

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  created_at?: string;
}

export interface Item {
  id: string;
  barcode: string;
  name: string;
  unit: string;
  min_stock: number;
  location: string;
  storage: string;
  cost: number;
  created_at?: string;
  total?: number;
}

export interface Lot {
  id: string;
  item_id: string;
  lot: string;
  expiry: string;
  qty: number;
}

export interface LogEntry {
  id: string;
  ts: string;
  action: string;
  item_id: string;
  lot: string;
  qty: number;
  technician: string;
  detail: string;
  item_name?: string;
  item_barcode?: string;
}

export interface RecentScan {
  mode: string;
  name: string;
  barcode: string;
  detail: string;
  ok: boolean;
  ts: number | string;
}

export interface DashboardItem extends Item {
  total: number;
  value: number;
  usage_rate: number;
  days_left: number | null;
  low_stock: boolean;
  days_in_inventory: number | null;
  last_used_on: string | null;
  used_today: number;
  last_added_on: string | null;
  nearest_expiry_lot: string | null;
  nearest_expiry_days: number | null;
  lot_count: number;
  used_30d: number;
  total_consumed: number;
  turnover: number | null;
}

export interface ReorderRow {
  id: string;
  barcode: string;
  name: string;
  total: number;
  min_stock: number;
  unit: string;
  location: string;
  days_left: number | null;
  shortfall: number;
}

export interface ExpiringRow {
  item_id: string;
  name: string;
  barcode: string;
  lot: string;
  expiry: string;
  days_left: number;
  qty: number;
  location: string;
  unit: string;
  bucket: string;
}

export interface DashboardData {
  kpis: {
    total_value: number;
    total_items: number;
    low_stock_count: number;
    expiring_count: number;
    expiring_buckets: { d30: number; d60: number; d90: number };
  };
  reorder: ReorderRow[];
  expiring: ExpiringRow[];
  items: DashboardItem[];
}

export interface ResolveResult {
  type: 'item' | 'location';
  found?: boolean;
  barcode?: string;
  location?: string;
  raw?: string;
  item?: Item;
  lots?: Lot[];
  total?: number;
}

export interface UseResult {
  ok: boolean;
  consumed: { lot: string; expiry: string; taken: number }[];
  shortfall: number;
  total: number;
  item_name: string;
}

export interface StockInResult {
  ok: boolean;
  item_id: string;
  registered: boolean;
  total: number;
  item_name: string;
}

export interface StocktakeResult {
  ok: boolean;
  counted: number;
  previous: number;
  adjustment: number;
  total: number;
  item_name: string;
}

export interface MoveResult {
  ok: boolean;
  location: string;
  item_name: string;
}

export interface ReceiveCommitResult {
  ok: boolean;
  imported: number;
  registered: number;
  count: number;
  errors: string[];
}

export interface PurchaseOrderLine {
  item_id: string;
  barcode: string;
  name: string;
  unit: string;
  on_hand: number;
  min_stock: number;
  order_qty: number;
  cost: number;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier: string;
  supplier_email: string;
  notes: string;
  status: 'draft' | 'ordered' | 'received' | 'cancelled';
  lines: PurchaseOrderLine[];
  total_cost: number;
  created_by: string;
  created_at: string;
  ordered_at: string;
  received_at: string;
}

export interface UsageTrends {
  days: number;
  daily: { date: string; qty: number }[];
  by_item: { item_id: string; name: string; unit: string; qty: number }[];
  total_used: number;
  active_reagents: number;
}

export interface ForecastRow {
  item_id: string;
  name: string;
  barcode: string;
  unit: string;
  lot: string;
  expiry: string;
  days_to_expiry: number;
  qty: number;
  usage_rate: number;
  days_to_finish_stock: number | null;
  projected_waste: number;
  waste_value: number;
  risk: string;
  location: string;
}

export interface ExpiryForecast {
  rows: ForecastRow[];
  summary: { at_risk_lots: number; total_waste_value: number; high_or_expired: number };
}

export interface Digest {
  generated_at: string;
  recipient: string;
  schedule: string;
  low_stock: ReorderRow[];
  expiring: ExpiringRow[];
  summary: { low_stock_count: number; expiring_count: number; expired_count: number };
}

export interface Settings {
  id: string;
  digest_recipient: string;
  digest_time: string;
  digest_timezone: string;
  email_provider: string;
}
