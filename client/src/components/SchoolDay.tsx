import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useToast } from '../context/ToastContext';
import Icon from './Icon';
import Select from './Select';
import { Field, Loading } from './ui';

/**
 * When the school stops, set once for the whole school.
 *
 * Break is the same hour in every class's week, so timing it per lesson is the
 * same fact typed thirty times — and thirty chances to have one year at lunch
 * while another is still in a lesson. Changing it here moves every break
 * already on a timetable with it.
 */
export default function SchoolDay({ owner }: { owner: boolean }) {
  const { toast } = useToast();
  const { data, loading, reload } = useFetch<any>('/school/day');
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (data) setForm(data); }, [data]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const out = await api.put('/school/day', form);
      const said = [
        out.placed && `${out.placed} break${out.placed === 1 ? '' : 's'} put on the timetables`,
        out.moved && `${out.moved} lesson${out.moved === 1 ? '' : 's'} moved to the new hours`,
        out.blocked && `${out.blocked} period${out.blocked === 1 ? '' : 's'} left alone, already teaching`,
      ].filter(Boolean);
      toast(said.length ? `Saved. ${said.join(', ')}.` : 'Saved.');
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !form) return <section className="card p-5"><Loading rows={2} /></section>;

  const dirty = data && (
    ['short_break_start', 'short_break_end', 'long_break_start', 'long_break_end',
     'short_break_period', 'long_break_period'].some((k) => form[k] !== data[k])
    || JSON.stringify(form.periods) !== JSON.stringify(data.periods));

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
        <Icon name="clock" className="h-5 w-5 shrink-0 text-brand-600" /> The school day
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        {owner
          ? 'When each period runs, and when the school stops. A timetable never asks for a time: a lesson takes the hour of the period it is put in. Changing these moves every lesson and break already timetabled.'
          : 'When each period runs, and when the school stops. Only a super administrator can change it, since it moves for every class at once.'}
      </p>

      <form onSubmit={save} className="mt-4 max-w-2xl space-y-5">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">The periods</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {(form.periods ?? []).map((p: any, i: number) => (
              <li key={p.period} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                <span className="w-16 shrink-0 text-sm font-semibold text-ink">Period {p.period}</span>
                <input className="input !py-1 !text-xs" type="time" disabled={!owner} value={p.start}
                       onChange={(e) => setForm({
                         ...form,
                         periods: form.periods.map((x: any, n: number) =>
                           (n === i ? { ...x, start: e.target.value } : x)),
                       })} />
                <span className="text-xs text-ink-faint">to</span>
                <input className="input !py-1 !text-xs" type="time" disabled={!owner} value={p.end}
                       onChange={(e) => setForm({
                         ...form,
                         periods: form.periods.map((x: any, n: number) =>
                           (n === i ? { ...x, end: e.target.value } : x)),
                       })} />
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Short break is period"
                 hint="Every class gets it, on all five days.">
            <Select
              disabled={!owner}
              value={form.short_break_period ? String(form.short_break_period) : ''}
              onChange={(v) => setForm({ ...form, short_break_period: v ? Number(v) : null })}
              options={[{ value: '', label: 'Not on the timetable' },
                        ...(form.periods ?? []).map((p: any) => ({
                          value: String(p.period), label: `Period ${p.period}`,
                        }))]}
            />
          </Field>
          <Field label="Long break is period" hint="The same, for lunch.">
            <Select
              disabled={!owner}
              value={form.long_break_period ? String(form.long_break_period) : ''}
              onChange={(v) => setForm({ ...form, long_break_period: v ? Number(v) : null })}
              options={[{ value: '', label: 'Not on the timetable' },
                        ...(form.periods ?? []).map((p: any) => ({
                          value: String(p.period), label: `Period ${p.period}`,
                        }))]}
            />
          </Field>

        <Field label="Short break starts">
          <input className="input" type="time" disabled={!owner} value={form.short_break_start}
                 onChange={(e) => setForm({ ...form, short_break_start: e.target.value })} />
        </Field>
        <Field label="and ends">
          <input className="input" type="time" disabled={!owner} value={form.short_break_end}
                 onChange={(e) => setForm({ ...form, short_break_end: e.target.value })} />
        </Field>
        <Field label="Long break starts">
          <input className="input" type="time" disabled={!owner} value={form.long_break_start}
                 onChange={(e) => setForm({ ...form, long_break_start: e.target.value })} />
        </Field>
        <Field label="and ends">
          <input className="input" type="time" disabled={!owner} value={form.long_break_end}
                 onChange={(e) => setForm({ ...form, long_break_end: e.target.value })} />
        </Field>

        </div>

        {owner && (
          <div>
            {/* Saving unchanged times is not a no-op: it puts every break
                already on a week back onto the school's hour. */}
            <button className="btn-primary" disabled={busy}>
              {busy ? 'Saving...' : dirty ? 'Save the times' : 'Apply these times everywhere'}
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
