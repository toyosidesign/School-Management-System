export const money = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n ?? 0);

export const dateLong = (v: string | Date) =>
  new Date(v).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export const dateShort = (v: string | Date) =>
  new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export const time = (v: string | Date) =>
  new Date(v).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export const dateTime = (v: string | Date) => `${dateShort(v)}, ${time(v)}`;

/** "in 3 days" / "2 hours ago", used all over the dashboards. */
export function relative(v: string | Date) {
  const then = new Date(typeof v === 'string' && !v.includes('T') ? v.replace(' ', 'T') + 'Z' : v).getTime();
  const diff = then - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536e6], ['month', 2592e6], ['week', 6048e5],
    ['day', 864e5], ['hour', 36e5], ['minute', 6e4],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return 'just now';
}

/**
 * Turns a stored status like `offer_made` into `Offer made`.
 * Badges read as labels, not shouting: all caps is harder to scan and reads as
 * emphasis the status does not always deserve.
 */
export const statusText = (s?: string) =>
  (s ?? '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export const initials = (first = '', last = '') => `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Countdown "01:30:00" from a number of minutes or seconds remaining. */
export function hms(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((x) => String(x).padStart(2, '0')).join(':');
}

/**
 * What the three phases are called when a school has not renamed them. Schools
 * divide the same years very differently, so these are only the fallback: the
 * school's own names come from its settings, through `sectionNames` below.
 */
export const SECTION_LABEL: Record<string, string> = {
  nursery: 'Nursery', primary: 'Primary', secondary: 'Secondary',
};

/** The school's own names for its phases, falling back per phase. */
export function sectionNames(stored?: string | null): Record<string, string> {
  try {
    const custom = stored ? JSON.parse(stored) : null;
    return { ...SECTION_LABEL, ...(custom && typeof custom === 'object' ? custom : {}) };
  } catch {
    return { ...SECTION_LABEL };
  }
}

export const NEED_LABEL: Record<string, string> = {
  dyslexia: 'Dyslexia / Visual stress',
  adhd: 'ADHD / Executive function',
  asc: 'Autism Spectrum (ASC)',
  dyscalculia: 'Dyscalculia',
  motor: 'Motor / Fine control',
};

export const NEED_SHORT: Record<string, string> = {
  dyslexia: 'Dyslexia', adhd: 'ADHD', asc: 'ASC', dyscalculia: 'Dyscalculia', motor: 'Motor',
};
