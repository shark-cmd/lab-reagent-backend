/** Formatting + date helpers shared across screens (ported from the web app). */

export const money = (n: number | null | undefined) =>
  `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const num = (n: unknown, fallback = '0') =>
  n === null || n === undefined || n === '' ? fallback : String(n);

export const formatDate = (iso?: string | null) => {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '-';
  }
};

export const formatDateTime = (ts?: string | null) => {
  if (!ts) return '-';
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString();
  } catch {
    return ts ?? '-';
  }
};

/** yyyy-mm-dd for a date offset by `days` from today. */
export const isoDateOffset = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

/** yyyyMMdd for lot-number generation. */
export const todayStamp = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate(),
  ).padStart(2, '0')}`;
};

export const expiryLabel = (days: number) => {
  if (days < 0) return 'Expired';
  if (days <= 30) return '≤30d';
  if (days <= 60) return '≤60d';
  return '≤90d';
};

/** Risk variant → StatusBadge variant for the expiry-forecast table. */
export const riskVariant = (risk: string) => {
  switch (risk) {
    case 'expired':
      return 'expired';
    case 'high':
      return 'expiring30';
    case 'medium':
      return 'expiring60';
    case 'low':
      return 'expiring90';
    case 'no_usage':
      return 'low';
    default:
      return 'ok';
  }
};
