import { useEffect, useMemo, useRef, useState } from 'react';
import { api, qs } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { dateLong, time, DAY_NAMES } from '../lib/format';
import Icon from '../components/Icon';
import DatePicker from '../components/DatePicker';
import Select from '../components/Select';
import { Badge, ChipRail, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader, Toggle } from '../components/ui';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const TYPE_META: Record<string, { tone: string; icon: string; colour: string }> = {
  exam: { tone: 'red', icon: 'assignment', colour: '#dc2626' },
  holiday: { tone: 'green', icon: 'star', colour: '#059669' },
  excursion: { tone: 'violet', icon: 'globe', colour: '#7c3aed' },
  meeting: { tone: 'brand', icon: 'users', colour: '#2563eb' },
  sports: { tone: 'amber', icon: 'heart', colour: '#d97706' },
  deadline: { tone: 'amber', icon: 'clock', colour: '#f59e0b' },
  general: { tone: 'slate', icon: 'calendar', colour: '#64748b' },
};

export default function Calendar() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [view, setView] = useState<'month' | 'list'>(window.innerWidth < 768 ? 'list' : 'month');
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const blankEvent = {
    title: '', description: '', event_type: 'general', location: '',
    date: '', end_date: '', timed: false, start_time: '09:00', end_time: '10:00',
  };
  const [form, setForm] = useState<any>(blankEvent);

  const from = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1).toISOString().slice(0, 10);
  const to = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0).toISOString().slice(0, 10);
  const { data, loading, error, reload } = useFetch<any[]>(`/calendar${qs({ from, to })}`, [from, to]);

  const events = useMemo(
    () => (data ?? []).filter((e) => !filter || e.event_type === filter),
    [data, filter]
  );

  const byDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const e of events) (map[e.start_at.slice(0, 10)] ??= []).push(e);
    return map;
  }, [events]);

  const canCreate = user.role === 'admin' || user.role === 'teacher';
  const now = new Date();
  const isCurrentMonth =
    cursor.getFullYear() === now.getFullYear() && cursor.getMonth() === now.getMonth();

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      // A date on its own is sent as a date: the server marks it all day.
      await api.post('/calendar', {
        title: form.title,
        description: form.description || null,
        event_type: form.event_type,
        location: form.location || null,
        all_day: !form.timed,
        start_at: form.timed ? new Date(`${form.date}T${form.start_time}`).toISOString() : form.date,
        end_at: form.timed
          ? (form.end_time ? new Date(`${form.end_date || form.date}T${form.end_time}`).toISOString() : null)
          : (form.end_date || null),
      });
      toast('Event added to the school calendar.');
      setCreating(false);
      setForm(blankEvent);
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const upcoming = events.filter((e) => new Date(e.start_at) >= new Date(new Date().toDateString()));

  return (
    <>
      <PageHeader
        icon="calendar" title="School calendar"
        subtitle="Term dates, exams, trips, meetings and your own deadlines in one place."
        actions={canCreate ? <button className="btn-primary" onClick={() => setCreating(true)}><Icon name="plus" className="h-4 w-4" /> Add event</button> : undefined}
      />

      <div className="mb-5 flex flex-col gap-3">
        <ChipRail
          ariaLabel="Filter by event type" value={filter} onChange={setFilter}
          options={[{ value: '', label: 'All' }, ...Object.keys(TYPE_META).map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }))]}
        />
        <div className="flex items-center gap-2">
          <button className="btn-ghost !px-2.5" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month">
            <Icon name="chevronLeft" className="h-4 w-4" />
          </button>
          <MonthPicker cursor={cursor} onPick={setCursor} />
          <button className="btn-ghost !px-2.5" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month">
            <Icon name="chevronRight" className="h-4 w-4" />
          </button>
          {!isCurrentMonth && (
            <button className="btn-subtle !text-xs" onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }}>
              Today
            </button>
          )}
          <div className="ml-auto flex gap-1 rounded-xl bg-[color:var(--surface-sunken)] p-1">
            {(['month', 'list'] as const).map((v) => (
              <button
                key={v} onClick={() => setView(v)} aria-pressed={view === v}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${view === v ? 'bg-[color:var(--surface-raised)] text-ink shadow-sm' : 'text-ink-soft'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <Loading rows={3} />}
      {error && <ErrorNote error={error} onRetry={reload} />}

      {!loading && view === 'month' && (
        <div className={`grid gap-5 ${day ? 'lg:grid-cols-[1fr_20rem]' : ''}`}>
          <MonthGrid cursor={cursor} byDay={byDay} onPick={setDay} selected={day} />
          {day && (
            <DayPanel
              day={day} events={byDay[day] ?? []} onClose={() => setDay(null)}
              canDelete={canCreate}
              onDelete={async (e: any) => {
                try {
                  await api.delete(`/calendar/${e.id}`);
                  toast(`${e.title} removed.`);
                  reload();
                } catch (err: any) {
                  toast(err.message, 'error');
                }
              }}
            />
          )}
        </div>
      )}

      {!loading && view === 'list' && (
        upcoming.length === 0 ? (
          <EmptyState icon="calendar" title="Nothing coming up" body="Events added by the school will appear here." />
        ) : (
          <ul className="space-y-3">
            {upcoming.map((e) => {
              const meta = TYPE_META[e.event_type] ?? TYPE_META.general;
              return (
                <li key={e.id} className="card flex gap-3 p-4">
                  <span className="w-14 shrink-0 rounded-xl bg-[color:var(--surface-sunken)] py-2 text-center">
                    <span className="block text-[10px] font-bold uppercase text-ink-soft">
                      {new Date(e.start_at).toLocaleDateString(undefined, { month: 'short' })}
                    </span>
                    <span className="block text-xl font-bold tabular-nums text-ink">{new Date(e.start_at).getDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge tone={meta.tone} icon={meta.icon}>{e.event_type}</Badge>
                      {e.class_name && <Badge tone="slate">{e.class_name}</Badge>}
                    </span>
                    <span className="block font-semibold text-ink">{e.title}</span>
                    {e.description && <span className="mt-0.5 block text-sm text-ink-soft">{e.description}</span>}
                    <span className="mt-1 block text-xs text-ink-faint">
                      {e.all_day ? 'All day' : `${time(e.start_at)}${e.end_at ? ` – ${time(e.end_at)}` : ''}`}
                      {e.location && ` · ${e.location}`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )
      )}

      <Modal
        open={creating} onClose={() => setCreating(false)} title="Add a calendar event"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn-primary" form="cal-form" disabled={busy || !form.title || !form.date}>
              {busy ? 'Adding...' : 'Add event'}
            </button>
          </>
        }
      >
        <form id="cal-form" onSubmit={create} className="space-y-4">
          <Field label="Title" required>
            <input className="input" value={form.title} required autoFocus
                   onChange={(e) => setForm({ ...form, title: e.target.value })}
                   placeholder="e.g. Term starts" />
          </Field>

          <Field label="Type">
            <Select
              value={form.event_type}
              onChange={(v) => setForm({ ...form, event_type: v })}
              options={Object.keys(TYPE_META).map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }))}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date" required>
              <DatePicker
                value={form.date}
                onChange={(v) => setForm({ ...form, date: v })}
              />
            </Field>
            <Field label="Ends" hint="Leave blank for a single day.">
              <DatePicker min={form.date}
                value={form.end_date}
                onChange={(v) => setForm({ ...form, end_date: v })}
              />
            </Field>
          </div>

          {/* Most of a school year is dated, not timed, so a time is opt-in. */}
          <div className="rounded-xl border border-line p-3">
            <Toggle
              checked={form.timed}
              onChange={(v) => setForm({ ...form, timed: v })}
              label="Give it a time"
              hint="Otherwise it shows as lasting all day"
            />
            {form.timed && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="From">
                  <input type="time" className="input" value={form.start_time}
                         onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                </Field>
                <Field label="To">
                  <input type="time" className="input" value={form.end_time}
                         onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
                </Field>
              </div>
            )}
          </div>

          <Field label="Location">
            <input className="input" value={form.location} placeholder="e.g. Main Hall"
                   onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </Field>
          <Field label="Details">
            <textarea className="input min-h-[5rem] resize-y" value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </form>
      </Modal>
    </>
  );
}

/**
 * The month at a glance.
 *
 * A school month is read by scanning for the days that have something on them,
 * so the grid leans on colour and weight rather than borders: quiet days
 * recede, today is unmistakable, and a day with more than fits says how many
 * are hidden instead of silently cutting the list off.
 */
function MonthGrid({ cursor, byDay, onPick, selected }:
  { cursor: Date; byDay: Record<string, any[]>; onPick: (day: string) => void; selected: string | null }) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;   // Monday first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);

  const cells: (string | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7) cells.push(null);

  return (
    <div className="card overflow-hidden p-0">
      <div className="grid grid-cols-7 border-b border-line">
        {DAY_NAMES.slice(1).map((d) => (
          <div key={d} className="py-2.5 text-center text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            <span className="sm:hidden">{d.slice(0, 1)}</span>
            <span className="hidden sm:inline">{d.slice(0, 3)}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-line">
        {cells.map((day, i) => {
          const events = day ? byDay[day] ?? [] : [];
          const isToday = day === today;
          const isSelected = day === selected;
          const weekend = i % 7 >= 5;

          if (!day) return <div key={i} className="min-h-[6rem] bg-[color:var(--surface-sunken)]" />;

          return (
            <button
              key={day}
              onClick={() => onPick(day)}
              aria-label={`${new Date(day).toDateString()}, ${events.length} event${events.length === 1 ? '' : 's'}`}
              aria-current={isToday ? 'date' : undefined}
              className={`min-h-[6rem] p-1.5 text-left align-top transition-colors sm:min-h-[7.5rem] sm:p-2 ${
                isSelected ? 'bg-brand-50'
                  : weekend ? 'bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface)]'
                  : 'bg-[color:var(--surface)] hover:bg-[color:var(--surface-sunken)]'
              }`}
            >
              <span className="mb-1.5 flex items-center justify-between gap-1">
                <span className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-bold tabular-nums ${
                  isToday ? 'bg-brand-600 text-white' : isSelected ? 'text-brand-700' : 'text-ink-soft'
                }`}>
                  {Number(day.slice(8))}
                </span>
                {events.length > 2 && (
                  <span className="text-[10px] font-bold text-ink-faint">{events.length}</span>
                )}
              </span>

              <span className="block space-y-1">
                {events.slice(0, 2).map((e: any) => (
                  <span key={e.id}
                        className="flex items-center gap-1 rounded-md px-1.5 py-0.5"
                        style={{ background: `${e.colour ?? TYPE_META[e.event_type]?.colour ?? '#64748b'}1a` }}>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: e.colour ?? TYPE_META[e.event_type]?.colour ?? '#64748b' }} />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-tight text-ink">
                      {e.title}
                    </span>
                  </span>
                ))}
                {events.length > 2 && (
                  <span className="block px-1.5 text-[10px] font-semibold text-ink-faint">
                    {events.length - 2} more
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** What is on for one day, beside the grid. */
function DayPanel({ day, events, onClose, canDelete, onDelete }:
  { day: string; events: any[]; onClose: () => void; canDelete: boolean; onDelete: (e: any) => void }) {
  return (
    <aside className="card p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-bold text-ink">{dateLong(day)}</h2>
          <p className="text-xs text-ink-soft">
            {events.length === 0 ? 'Nothing on' : `${events.length} event${events.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button className="btn-subtle !px-2" onClick={onClose} aria-label="Close this day">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>

      {events.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-faint">A clear day.</p>
      ) : (
        <ul className="space-y-2.5">
          {events.map((e) => {
            const meta = TYPE_META[e.event_type] ?? TYPE_META.general;
            return (
              <li key={e.id} className="rounded-xl border border-line p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: e.colour ?? meta.colour }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{e.title}</p>
                    <p className="text-xs text-ink-soft">
                      {e.all_day ? 'All day' : `${time(e.start_at)}${e.end_at ? ` to ${time(e.end_at)}` : ''}`}
                      {e.location && ` · ${e.location}`}
                    </p>
                    {e.description && <p className="mt-1 text-sm text-ink-soft">{e.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone={meta.tone} icon={meta.icon}>{e.event_type}</Badge>
                      {e.class_name && <Badge tone="slate">{e.class_name}</Badge>}
                    </div>
                  </div>
                  {canDelete && (
                    <button className="btn-subtle !px-2" onClick={() => onDelete(e)}
                            aria-label={`Remove ${e.title}`} title="Remove">
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

function MonthPicker({ cursor, onPick }: { cursor: Date; onPick: (d: Date) => void }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(cursor.getFullYear());
  const ref = useRef<HTMLDivElement>(null);
  const today = new Date();

  useEffect(() => { if (open) setYear(cursor.getFullYear()); }, [open, cursor]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); }
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const choose = (month: number) => {
    onPick(new Date(year, month, 1));
    setOpen(false);
  };

  const label = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex min-w-[10rem] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-ink transition-colors hover:bg-[color:var(--surface-sunken)]"
        data-tap
      >
        {label}
        <Icon name="chevronDown" className={`h-4 w-4 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a month and year"
          className="absolute left-1/2 top-[calc(100%+0.5rem)] z-50 w-72 -translate-x-1/2 rounded-2xl border border-line bg-[color:var(--surface-raised)] p-3 shadow-lg animate-fade-up"
        >
          {/* Year */}
          <div className="mb-3 flex items-center justify-between">
            <button className="btn-subtle !px-2.5" onClick={() => setYear((y) => y - 1)} aria-label={`Go to ${year - 1}`}>
              <Icon name="chevronLeft" className="h-4 w-4" />
            </button>
            <span className="font-display text-lg font-bold tabular-nums text-ink" aria-live="polite">{year}</span>
            <button className="btn-subtle !px-2.5" onClick={() => setYear((y) => y + 1)} aria-label={`Go to ${year + 1}`}>
              <Icon name="chevronRight" className="h-4 w-4" />
            </button>
          </div>

          {/* Months */}
          <div className="grid grid-cols-3 gap-1.5">
            {MONTH_NAMES.map((name, i) => {
              const selected = year === cursor.getFullYear() && i === cursor.getMonth();
              const isThisMonth = year === today.getFullYear() && i === today.getMonth();
              return (
                <button
                  key={name}
                  onClick={() => choose(i)}
                  aria-current={selected ? 'true' : undefined}
                  className={`rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                    selected ? 'bg-brand-600 text-white'
                      : isThisMonth ? 'bg-brand-600/10 text-brand-700'
                      : 'text-ink-soft hover:bg-[color:var(--surface-sunken)] hover:text-ink'
                  }`}
                  data-tap
                >
                  {name}
                </button>
              );
            })}
          </div>

          <button
            className="btn-ghost mt-3 w-full"
            onClick={() => { const d = new Date(); d.setDate(1); onPick(d); setOpen(false); }}
          >
            <Icon name="calendar" className="h-4 w-4" /> Jump to this month
          </button>
        </div>
      )}
    </div>
  );
}
