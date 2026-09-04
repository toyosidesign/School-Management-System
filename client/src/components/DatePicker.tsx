import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

/** Local YYYY-MM-DD. Building it from the parts avoids a timezone shifting the day. */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parse = (value?: string) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * A calendar for choosing a date.
 *
 * A native date field is drawn by the operating system, so it arrives in the
 * wrong typeface, ignores the app's theme and text size, and looks different on
 * every machine. This draws the month itself: today carries a dot, the chosen
 * day a filled circle, and days either side of the month stay visible but
 * quiet, so the week a date falls in is still readable at its edges.
 */
export default function DatePicker({
  value, onChange, min, max, placeholder = 'Choose a date', disabled, id, ariaLabel, className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const chosen = parse(value);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => chosen ?? new Date());
  const [box, setBox] = useState<{ top: number; left: number; drop: 'down' | 'up' } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (chosen) setCursor(chosen); }, [value]);

  // Drawn over the page, so a dialog's own scrolling cannot clip it.
  const place = () => {
    const trigger = ref.current?.getBoundingClientRect();
    if (!trigger) return;
    const below = window.innerHeight - trigger.bottom;
    const drop = below < 380 && trigger.top > below ? 'up' : 'down';
    setBox({
      left: Math.min(trigger.left, window.innerWidth - 336),
      top: drop === 'down' ? trigger.bottom + 8 : trigger.top - 8,
      drop,
    });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    const onAway = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };

    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    document.addEventListener('mousedown', onAway);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      document.removeEventListener('mousedown', onAway);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const today = iso(new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  // Six weeks from the Monday on or before the first, so the grid never jumps
  // height between months and the neighbouring days stay in view.
  const start = new Date(year, month, 1);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  const blocked = (d: string) => (min && d < min) || (max && d > max);

  const pick = (d: Date) => {
    const next = iso(d);
    if (blocked(next)) return;
    onChange(next);
    setOpen(false);
    ref.current?.querySelector('button')?.focus();
  };

  const label = chosen
    ? chosen.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : placeholder;

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button" id={id} disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel}
        className={`input flex w-full items-center justify-between gap-2 text-left ${
          open ? 'border-brand-500 ring-2 ring-brand-500/25' : ''
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
        data-tap
      >
        <span className={`min-w-0 truncate ${chosen ? 'text-ink' : 'text-ink-faint'}`}>{label}</span>
        <Icon name="calendar" className="h-4 w-4 shrink-0 text-ink-faint" />
      </button>

      {open && box && createPortal(
        <div
          ref={popRef} role="dialog" aria-label="Choose a date"
          style={{
            position: 'fixed', left: box.left, width: 320,
            ...(box.drop === 'down' ? { top: box.top } : { bottom: window.innerHeight - box.top }),
          }}
          className="z-[120] rounded-2xl border border-line bg-[color:var(--surface-raised)] p-4 shadow-xl animate-fade-up"
        >
          <div className="mb-3 flex items-center justify-between">
            <button type="button" className="btn-subtle !min-h-0 !px-2 !py-1.5"
                    onClick={() => setCursor(new Date(year, month - 1, 1))}
                    aria-label={`${MONTHS[(month + 11) % 12]}`}>
              <Icon name="chevronLeft" className="h-4 w-4" />
            </button>
            <span className="font-display text-sm font-bold text-ink" aria-live="polite">
              {MONTHS[month]} {year}
            </span>
            <button type="button" className="btn-subtle !min-h-0 !px-2 !py-1.5"
                    onClick={() => setCursor(new Date(year, month + 1, 1))}
                    aria-label={`${MONTHS[(month + 1) % 12]}`}>
              <Icon name="chevronRight" className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {WEEKDAYS.map((d) => (
              <span key={d} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                {d.slice(0, 3)}
              </span>
            ))}

            {days.map((d) => {
              const key = iso(d);
              const outside = d.getMonth() !== month;
              const isToday = key === today;
              const selected = key === value;
              const off = blocked(key);

              return (
                <button
                  key={key} type="button" disabled={off}
                  onClick={() => pick(d)}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={selected}
                  className={`relative mx-auto grid h-9 w-9 place-items-center rounded-full text-sm tabular-nums transition-colors ${
                    selected ? 'bg-brand-600 font-bold text-white'
                      : off ? 'cursor-not-allowed text-ink-faint/40'
                      : outside ? 'text-ink-faint hover:bg-[color:var(--surface-sunken)]'
                      : 'text-ink hover:bg-[color:var(--surface-sunken)]'
                  }`}
                >
                  {d.getDate()}
                  {isToday && !selected && (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-brand-600" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
            <button type="button" className="btn-ghost btn-sm" onClick={() => pick(new Date())}
                    disabled={blocked(today)}>
              Today
            </button>
            {value && (
              <button type="button" className="btn-subtle btn-sm"
                      onClick={() => { onChange(''); setOpen(false); }}>
                Clear
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
