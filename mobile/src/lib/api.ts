import type {
  DashboardData,
  Digest,
  ExpiryForecast,
  Item,
  LogEntry,
  MoveResult,
  PurchaseOrder,
  ReceiveCommitResult,
  RecentScan,
  ResolveResult,
  Settings,
  StockInResult,
  StocktakeResult,
  UsageTrends,
  UseResult,
  User,
} from '@/types/api';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8003';

/** Full API root, e.g. `http://host:8003/api`. */
export const API_ROOT = `${BASE_URL}/api`;

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  /** Best-effort human message from FastAPI's `{ detail }` or a string body. */
  get detail(): string {
    const b = this.body as { detail?: unknown } | null;
    if (b && typeof b === 'object' && 'detail' in b) {
      const d = b.detail;
      if (typeof d === 'string') return d;
      if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
    }
    if (typeof this.body === 'string' && this.body) return this.body;
    return this.message;
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

export function setOnUnauthorized(handler: (() => void) | null) {
  onUnauthorized = handler;
}

type Options = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

async function request<T>(path: string, { method = 'GET', body, query }: Options = {}): Promise<T> {
  let url = `${API_ROOT}${path}`;
  if (query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
    });
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    // Include the attempted URL so connectivity problems are self-diagnosing.
    throw new ApiError(
      `Network request failed: ${method} ${url} — ${(e as Error).message}`,
      0,
      null
    );
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    const detail =
      parsed && typeof parsed === 'object' && 'detail' in (parsed as object)
        ? (parsed as { detail: unknown }).detail
        : undefined;
    const message =
      typeof detail === 'string' ? detail : `HTTP ${res.status} from ${method} ${url}`;
    throw new ApiError(message, res.status, parsed);
  }

  return parsed as T;
}

export const api = {
  get: <T>(path: string, query?: Options['query']) => request<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** Raw text (CSV exports). */
  getText: async (path: string) => {
    const url = `${API_ROOT}${path}`;
    const res = await fetch(url, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });
    if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status, null);
    return res.text();
  },
};

/* ---------------------------------- endpoints ---------------------------------- */

export const auth = {
  login: (username: string, password: string, pin: string) =>
    api.post<{ token: string; user: User }>('/auth/login', { username, password, pin }),
  me: () => api.get<User>('/auth/me'),
};

export const inventory = {
  dashboard: () => api.get<DashboardData>('/dashboard'),
  items: () => api.get<Item[]>('/items'),
  resolve: (barcode: string) => api.post<ResolveResult>('/resolve', { barcode }),
  use: (barcode: string, qty: number) => api.post<UseResult>('/use', { barcode, qty }),
  stockIn: (payload: Record<string, unknown>) => api.post<StockInResult>('/stock-in', payload),
  stocktake: (barcode: string, counted: number, location?: string | null) =>
    api.post<StocktakeResult>('/stocktake', { barcode, counted, location: location ?? null }),
  move: (barcode: string, location: string) => api.post<MoveResult>('/move', { barcode, location }),
  receiveCommit: (items: Record<string, unknown>[]) =>
    api.post<ReceiveCommitResult>('/receive-commit', { items }),
  itemUpdate: (payload: Record<string, unknown>) => api.post<{ ok: boolean }>('/item-update', payload),
  deleteItem: (id: string) => api.del<{ ok: boolean }>(`/items/${id}`),
  importCsv: (text: string) => api.post<{ ok: boolean; imported: number; errors: string[] }>('/import', { text }),
};

export const audit = {
  history: (query?: { action?: string; technician?: string; limit?: number }) =>
    api.get<{ logs: LogEntry[]; count: number }>('/history', { limit: query?.limit ?? 500, action: query?.action, technician: query?.technician }),
  recentScans: (limit = 12) => api.get<{ scans: RecentScan[] }>('/recent-scans', { limit }),
  technicians: () => api.get<{ technicians: string[] }>('/technicians'),
  locations: () => api.get<{ locations: string[] }>('/locations'),
};

export const purchaseOrders = {
  list: () => api.get<{ purchase_orders: PurchaseOrder[] }>('/purchase-orders'),
  get: (id: string) => api.get<PurchaseOrder>(`/purchase-orders/${id}`),
  create: (payload: Record<string, unknown>) => api.post<PurchaseOrder>('/purchase-orders', payload),
  update: (id: string, payload: Record<string, unknown>) =>
    api.put<PurchaseOrder>(`/purchase-orders/${id}`, payload),
  remove: (id: string) => api.del<{ ok: boolean }>(`/purchase-orders/${id}`),
  receive: (id: string) => api.post<PurchaseOrder>(`/purchase-orders/${id}/receive`),
  email: (id: string, payload: Record<string, unknown> = {}) =>
    api.post<{ ok: boolean; provider_configured: boolean; recipient?: string; message?: string }>(
      `/purchase-orders/${id}/email`,
      payload
    ),
};

export const reports = {
  usageTrends: (days = 30) => api.get<UsageTrends>('/usage-trends', { days }),
  expiryForecast: () => api.get<ExpiryForecast>('/expiry-forecast'),
  digest: () => api.get<Digest>('/digest'),
  settings: () => api.get<Settings>('/settings'),
  updateSettings: (payload: Record<string, unknown>) => api.put<Settings>('/settings', payload),
  sendDigest: () => api.post<{ ok: boolean; provider_configured: boolean; recipient: string }>('/digest/send'),
};

export const users = {
  list: () => api.get<User[]>('/users'),
  create: (payload: Record<string, unknown>) => api.post<User>('/users', payload),
  update: (id: string, payload: Record<string, unknown>) => api.put<{ ok: boolean }>(`/users/${id}`, payload),
  remove: (id: string) => api.del<{ ok: boolean }>(`/users/${id}`),
};

export const admin = {
  seed: () => api.post<{ ok: boolean; message: string; item_count: number }>('/admin/seed'),
};
