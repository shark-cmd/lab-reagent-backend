/**
 * LabStock design tokens — ported from the web app (design_guidelines.md,
 * frontend/src/index.css, frontend/src/components/StatusBadge.js).
 */

export const Colors = {
  ink: '#0B1220',
  muted: '#4B5563',
  page: '#F7FAFC',
  surface: '#FFFFFF',
  surface2: '#F1F6FA',
  line: '#D7E2EC',

  primary: '#0E7490',
  primaryHover: '#155E75',
  primarySoft: '#E6F6FA',

  accent: '#2563EB',
  accentSoft: '#EAF2FF',

  success: '#1F7A4D',
  successSoft: '#EAF7F0',
  successLine: '#BFE6D0',

  warning: '#B45309',
  warningSoft: '#FFF4E6',
  warningLine: '#FFD7A8',

  danger: '#B42318',
  dangerSoft: '#FFE9E7',
  dangerLine: '#FFC2BC',
  dangerDeep: '#7A1B14',

  info: '#0B5CAD',
  infoSoft: '#E8F2FF',
  infoLine: '#BBD7FF',

  neutralSoft: '#EEF2F7',
  neutralFg: '#334155',
} as const;

/** Status badge variants — exact bg / fg / border hex pairs from the web app. */
export type StatusVariant =
  | 'ok'
  | 'low'
  | 'expiring90'
  | 'expiring60'
  | 'expiring30'
  | 'expired'
  | 'neutral';

export const StatusVariantStyles: Record<
  StatusVariant,
  { bg: string; fg: string; border: string }
> = {
  ok: { bg: '#EAF7F0', fg: '#1F7A4D', border: '#BFE6D0' },
  low: { bg: '#FFF4E6', fg: '#B45309', border: '#FFD7A8' },
  expiring90: { bg: '#E8F2FF', fg: '#0B5CAD', border: '#BBD7FF' },
  expiring60: { bg: '#FFF4E6', fg: '#B45309', border: '#FFD7A8' },
  expiring30: { bg: '#FFE9E7', fg: '#B42318', border: '#FFC2BC' },
  expired: { bg: '#FFE1DE', fg: '#7A1B14', border: '#FFC2BC' },
  neutral: { bg: '#EEF2F7', fg: '#334155', border: '#D7E2EC' },
};

/** Mirrors frontend/src/components/StatusBadge.js `expiryVariant`. */
export const expiryVariant = (days: number | null | undefined): StatusVariant => {
  if (days === null || days === undefined) return 'neutral';
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring30';
  if (days <= 60) return 'expiring60';
  if (days <= 90) return 'expiring90';
  return 'ok';
};

export const Fonts = {
  heading: 'SpaceGrotesk_700Bold',
  headingMd: 'SpaceGrotesk_600SemiBold',
  headingSm: 'SpaceGrotesk_500Medium',
  sans: 'IBMPlexSans_400Regular',
  sansMd: 'IBMPlexSans_500Medium',
  sansBold: 'IBMPlexSans_600SemiBold',
  mono: 'IBMPlexMono_400Regular',
  monoMd: 'IBMPlexMono_500Medium',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 20,
  six: 24,
  seven: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  full: 999,
} as const;

/** Crisp, low-blur shadows (RN New Architecture `boxShadow`). */
export const Shadows = {
  sm: '0px 1px 2px rgba(16, 24, 40, 0.06)',
  md: '0px 8px 24px rgba(16, 24, 40, 0.10)',
} as const;
