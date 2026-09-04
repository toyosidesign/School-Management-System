import { useEffect, useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';
import { initials } from '../lib/format';

/* ── Page scaffolding ─────────────────────────────────────────────────────── */
export function PageHeader({
  title, subtitle, actions, icon,
}: { title: string; subtitle?: ReactNode; actions?: ReactNode; icon?: string }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 font-display text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
          {icon && (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-600/10 text-brand-600">
              <Icon name={icon} />
            </span>
          )}
          <span className="truncate">{title}</span>
        </h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, action, children, className = '' }:
  { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ icon = 'sparkle', title, body, action }:
  { icon?: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card grid place-items-center px-6 py-12 text-center">
      <span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[color:var(--surface-sunken)] text-ink-faint">
        <Icon name={icon} className="h-7 w-7" />
      </span>
      <p className="font-semibold text-ink">{title}</p>
      {body && <p className="mt-1.5 max-w-sm text-sm text-ink-soft">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton h-24 w-full" />)}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col gap-3 border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between dark:border-red-900">
      <span className="flex items-start gap-2"><Icon name="warning" className="mt-0.5 h-5 w-5 shrink-0" />{error}</span>
      {onRetry && <button className="btn-ghost shrink-0" onClick={onRetry}>Try again</button>}
    </div>
  );
}

/**
 * Turns a saturated hex into a pastel ground with matching deep text.
 *
 * The stored colour stays the person's choice; this softens it for display, so
 * an avatar reads as friendly rather than a solid block, and the initials keep
 * proper contrast instead of white on a mid tone.
 */
function pastel(hex: string): { background: string; text: string } {
  const clean = (hex || '').replace('#', '');
  if (clean.length !== 6) return { background: '#dbeafe', text: '#1e3a8a' };

  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return {
    background: `hsl(${h} ${Math.round(Math.min(1, s * 0.85) * 100)}% 88%)`,
    // 24% keeps every colour in the picker above 4.5:1 against its pastel.
    text: `hsl(${h} ${Math.round(Math.min(1, s) * 100)}% 24%)`,
  };
}

/* ── Data display ─────────────────────────────────────────────────────────── */
export function StatCard({ label, value, hint, icon, tone = 'brand', onClick }:
  { label: string; value: ReactNode; hint?: string; icon?: string; tone?: string; onClick?: () => void }) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-100 text-brand-700',
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    violet: 'bg-violet-100 text-violet-700',
  };
  const Tag: any = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`stat-tile text-left ${onClick ? 'transition hover:border-brand-300' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="stat-label">{label}</p>
        {icon && <span className={`grid h-8 w-8 place-items-center rounded-lg ${tones[tone]}`}><Icon name={icon} className="h-4 w-4" /></span>}
      </div>
      <p className="stat-value tabular-nums">{value}</p>
      {hint && <p className="stat-caption">{hint}</p>}
    </Tag>
  );
}

export function Avatar({ first, last, colour = '#2563eb', size = 'md', emoji, src }:
  { first?: string; last?: string; colour?: string; size?: 'sm' | 'md' | 'lg';
    emoji?: string | null; src?: string | null }) {
  const dims = { sm: 'h-8 w-8 text-[11px]', md: 'h-10 w-10 text-xs', lg: 'h-14 w-14 text-base' }[size];
  const emojiSize = { sm: 'text-sm', md: 'text-lg', lg: 'text-2xl' }[size];
  const { background, text } = pastel(colour);
  const [broken, setBroken] = useState(false);

  // A deleted or unreachable picture falls back rather than leaving a torn frame.
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={`shrink-0 rounded-full object-cover ${dims}`}
        style={{ background }}
      />
    );
  }

  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-bold leading-none ${dims} ${emoji ? emojiSize : ''}`}
      style={{ background, color: text }}
      aria-hidden="true"
    >
      {emoji || initials(first, last)}
    </span>
  );
}

export function Badge({ children, tone = 'slate', icon }:
  { children: ReactNode; tone?: string; icon?: string }) {
  const tones: Record<string, string> = {
    slate: 'chip-slate', brand: 'chip-brand', green: 'chip-green',
    amber: 'chip-amber', red: 'chip-red', violet: 'chip-violet',
  };
  return (
    <span className={`chip ${tones[tone] ?? tones.slate}`}>
      {icon && <Icon name={icon} className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

/** SEN accommodation badges shown next to a student's name (PRD §2 teacher needs). */
export function SenBadges({ needs = [], multiplier, multiFormat, compact = false }:
  { needs?: string[]; multiplier?: number; multiFormat?: number | boolean; compact?: boolean }) {
  const labels: Record<string, [string, string]> = {
    dyslexia: ['Dyslexia', 'violet'], adhd: ['ADHD', 'amber'],
    asc: ['ASC', 'brand'], dyscalculia: ['Dyscalculia', 'green'], motor: ['Motor', 'slate'],
  };
  if (!needs.length && !multiplier && !multiFormat) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {needs.map((n) => {
        const [label, tone] = labels[n] ?? [n, 'slate'];
        return <Badge key={n} tone={tone}>{label}</Badge>;
      })}
      {multiplier > 1 && <Badge tone="amber" icon="clock">+{Math.round((multiplier - 1) * 100)}% time</Badge>}
      {!!multiFormat && !compact && <Badge tone="green" icon="mic">Multi-format</Badge>}
    </span>
  );
}

export function ProgressBar({ value, max = 100, tone = 'brand', label }:
  { value: number; max?: number; tone?: string; label?: string }) {
  const pct = Math.min(100, Math.round(((value ?? 0) / (max || 1)) * 100));
  const tones: Record<string, string> = {
    brand: 'bg-brand-600', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500',
  };
  return (
    <div>
      {label && (
        <div className="mb-1.5 flex justify-between text-xs font-medium text-ink-soft">
          <span>{label}</span><span className="tabular-nums">{pct}%</span>
        </div>
      )}
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-[color:var(--surface-sunken)]"
        role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        <div className={`h-full rounded-full transition-all duration-500 ${tones[tone]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Pie-chart countdown for dyscalculia support with time tracking (PRD §3.1). */
export function PieTimer({ remaining, total, size = 68 }:
  { remaining: number; total: number; size?: number }) {
  const frac = Math.max(0, Math.min(1, remaining / (total || 1)));
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const tone = frac > 0.5 ? '#059669' : frac > 0.2 ? '#d97706' : '#dc2626';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth="7" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - frac)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 1s linear' }}
      />
    </svg>
  );
}

/* ── Overlays ─────────────────────────────────────────────────────────────── */
/**
 * Reference counted so nested or overlapping dialogs cannot leave the page
 * permanently unscrollable when only one of them closes.
 */
let scrollLocks = 0;
function lockScroll() {
  if (scrollLocks++ === 0) document.body.style.overflow = 'hidden';
}
function releaseScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = '';
}

export function Modal({ open, onClose, title, children, footer, wide = false }:
  { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  // Deliberately keyed on `open` alone: callers pass an inline onClose, so
  // including it would re-run this lock on every render.
  useEffect(() => {
    if (!open) return;
    lockScroll();
    return releaseScroll;
  }, [open]);

  // Callers pass an inline onClose, so its identity changes on every render.
  // Held in a ref, the effect below can key on `open` alone: keyed on onClose it
  // re-ran after every keystroke and threw focus back to the top of the dialog,
  // which made typing in a form impossible.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);

    // Move focus into the dialog for keyboard and screen-reader users, landing
    // on the first thing to fill in rather than on the close button.
    const t = setTimeout(() => {
      const field = ref.current?.querySelector<HTMLElement>('[autofocus], input:not([type=hidden]), select, textarea');
      (field ?? ref.current?.querySelector<HTMLElement>('button'))?.focus();
    }, 30);

    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
         onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-[color:var(--surface-raised)] shadow-2xl animate-fade-up sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <button className="btn-subtle !px-2.5" onClick={onClose} aria-label="Close dialog">
            <Icon name="x" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Paging for a long list.
 *
 * Says where you are in words rather than only in page numbers, because
 * "1 to 15 of 214" is the question a school office is actually asking.
 */
export function Pagination({ page, pageSize, total, onPage, noun = 'rows' }:
  { page: number; pageSize: number; total: number; onPage: (p: number) => void; noun?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // A window around the current page, with the ends always reachable.
  const numbers: (number | '...')[] = [];
  for (let n = 1; n <= pages; n += 1) {
    if (n === 1 || n === pages || Math.abs(n - page) <= 1) numbers.push(n);
    else if (numbers[numbers.length - 1] !== '...') numbers.push('...');
  }

  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label={`${noun} pages`}>
      <p className="text-sm text-ink-soft">
        <b className="text-ink tabular-nums">{from} to {to}</b> of {total} {noun}
      </p>
      <div className="flex items-center gap-1">
        <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <Icon name="chevronLeft" className="h-3.5 w-3.5" /> Back
        </button>
        {numbers.map((n, i) => (n === '...' ? (
          <span key={`gap-${i}`} className="px-1 text-sm text-ink-faint">...</span>
        ) : (
          <button
            key={n} onClick={() => onPage(n)}
            aria-current={n === page ? 'page' : undefined}
            className={`min-w-9 rounded-xl px-2.5 py-1.5 text-sm font-semibold tabular-nums transition ${
              n === page ? 'bg-brand-600 text-white' : 'text-ink-soft hover:bg-[color:var(--surface-sunken)] hover:text-ink'
            }`}
          >
            {n}
          </button>
        )))}
        <button className="btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <Icon name="chevronRight" className="h-3.5 w-3.5" />
        </button>
      </div>
    </nav>
  );
}

/* ── Form primitives ──────────────────────────────────────────────────────── */
export function Field({ label, hint, error, children, required }:
  { label: string; hint?: string; error?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="label">
        {label}{required && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled, ariaLabel }:
  { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
    disabled?: boolean; ariaLabel?: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      disabled={disabled} aria-label={ariaLabel || undefined}
      className={`flex w-full items-center justify-between gap-3 rounded-xl px-1 py-2 text-left ${
        disabled ? 'cursor-wait opacity-60' : ''}`}
      data-tap
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-soft">{hint}</span>}
      </span>
      {/* Off is a hollow of the page itself rather than a solid grey: a filled
          track reads as a second "on" colour, and a row of them looks half set. */}
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked
          ? 'bg-brand-600'
          : 'bg-[color:var(--surface-sunken)] ring-1 ring-inset ring-[color:var(--line)]'
      }`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full transition-transform ${
          checked
            ? 'translate-x-[22px] bg-white shadow'
            : 'translate-x-0.5 bg-[color:var(--surface-raised)] shadow-sm ring-1 ring-inset ring-[color:var(--line)]'
        }`} />
      </span>
    </button>
  );
}

/** Horizontally scrollable filter rail that works on a phone without a dropdown. */
export function ChipRail({ options, value, onChange, ariaLabel }:
  { options: { value: string; label: string; count?: number }[]; value: string; onChange: (v: string) => void; ariaLabel: string }) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${
            value === o.value
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-line bg-[color:var(--surface)] text-ink-soft hover:text-ink'
          }`}
          data-tap
        >
          {o.label}
          {o.count != null && <span className="ml-1.5 tabular-nums opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
