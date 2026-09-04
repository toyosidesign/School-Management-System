import { useEffect, useState } from 'react';
import { api, qs } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../context/ToastContext';
import { time, relative } from '../../lib/format';
import Icon from '../../components/Icon';
import Select from '../../components/Select';
import { Avatar, Badge, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader } from '../../components/ui';

const ENTRY_TYPES = [
  { value: 'meal', label: 'Meal', icon: 'heart', ratings: ['Ate all', 'Ate most', 'Ate a little', 'Refused'] },
  { value: 'nap', label: 'Nap', icon: 'clock', ratings: ['Slept well', 'Slept 45 minutes', 'Rested, did not sleep'] },
  { value: 'mood', label: 'Mood', icon: 'star', ratings: ['Happy', 'Settled', 'Unsettled', 'Tearful'] },
  { value: 'toilet', label: 'Toileting', icon: 'check', ratings: ['Dry', 'Changed', 'Used the toilet'] },
  { value: 'behaviour', label: 'Behaviour', icon: 'users', ratings: ['Positive', 'Needed support'] },
  { value: 'milestone', label: 'Milestone', icon: 'sparkle', ratings: [] },
  { value: 'note', label: 'General note', icon: 'text', ratings: [] },
];

export default function NurseryLog() {
  const { toast } = useToast();
  const classes = useFetch<any[]>('/classes');
  const [classId, setClassId] = useState('');
  const roster = useFetch<any[]>(classId ? `/classes/${classId}/roster` : null, [classId]);
  const [student, setStudent] = useState<any>(null);
  const [form, setForm] = useState({ entry_type: 'meal', detail: '', rating: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!classId && classes.data?.length) {
      const early = classes.data.find((c: any) => c.section !== 'secondary') ?? classes.data[0];
      setClassId(String(early.id));
    }
  }, [classes.data, classId]);

  const timeline = useFetch<any[]>(student ? `/activity${qs({ studentId: student.id })}` : null, [student?.id]);

  const log = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/activity', { student_id: student.id, ...form });
      toast(`Logged for ${student.first_name}. Their guardians have been notified.`);
      setForm({ entry_type: form.entry_type, detail: '', rating: '' });
      timeline.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const activeType = ENTRY_TYPES.find((t) => t.value === form.entry_type)!;

  return (
    <>
      <PageHeader
        icon="baby" title="Daily activity log"
        subtitle="Meals, naps, moods and milestones. Each entry appears in the parent's timeline straight away."
      />

      <div className="card mb-5 p-4">
        <label className="block">
          <span className="label">Class</span>
          <Select
            value={classId}
            onChange={(v) => { setClassId(v); setStudent(null); }}
            options={[...(classes.data ?? []).map((c: any) => ({ value: String(c.id), label: `${c.name}` }))]}
          />
        </label>
      </div>

      {roster.loading && <Loading rows={2} />}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(roster.data ?? []).map((s: any) => (
          <button
            key={s.id} onClick={() => setStudent(s)}
            className={`card flex items-center gap-3 p-3 text-left transition hover:shadow-md ${
              student?.id === s.id ? 'border-brand-500 ring-2 ring-brand-500/30' : 'hover:border-brand-300'
            }`}
          >
            <Avatar first={s.first_name} last={s.last_name} colour={s.avatar_colour} src={s.avatar_url} emoji={s.avatar_emoji} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink">{s.first_name} {s.last_name}</span>
              <span className="block truncate text-xs text-ink-faint">{s.student_code}</span>
            </span>
          </button>
        ))}
      </div>

      {!student ? (
        <EmptyState icon="baby" title="Choose a child" body="Pick a child above to log an entry and see today's timeline." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <form onSubmit={log} className="card h-fit p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-soft">
              Log an entry for {student.first_name}
            </h2>

            <fieldset className="mb-4">
              <legend className="label">Type</legend>
              <div className="grid grid-cols-4 gap-2">
                {ENTRY_TYPES.map((t) => (
                  <button
                    key={t.value} type="button" role="radio" aria-checked={form.entry_type === t.value}
                    onClick={() => setForm({ ...form, entry_type: t.value, rating: '' })}
                    className={`rounded-xl border-2 p-2 text-center transition ${
                      form.entry_type === t.value ? 'border-brand-600 bg-brand-600/8' : 'border-line hover:border-brand-300'
                    }`}
                    data-tap
                  >
                    <Icon name={t.icon} className="mx-auto h-4 w-4 text-brand-600" />
                    <span className="mt-1 block text-[10px] font-semibold leading-tight text-ink">{t.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {activeType.ratings.length > 0 && (
              <Field label="How did it go?">
                <Select
                  value={form.rating}
                  onChange={(v) => setForm({ ...form, rating: v })}
                  options={[{ value: "", label: `Not recorded` }, ...activeType.ratings.map((r: any) => ({ value: String(r), label: `${r}` }))]}
                />
              </Field>
            )}

            <div className="mt-3">
              <Field label="Details" required hint="Write it as you would say it to the parent at pick-up.">
                <textarea
                  className="input min-h-[5rem] resize-y" value={form.detail} required
                  onChange={(e) => setForm({ ...form, detail: e.target.value })}
                  placeholder="e.g. Lunch: rice, chicken and green beans"
                />
              </Field>
            </div>

            <button className="btn-primary mt-4 w-full" disabled={busy || !form.detail.trim()}>
              <Icon name="plus" className="h-4 w-4" /> {busy ? 'Saving…' : 'Add to timeline'}
            </button>
          </form>

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-soft">
              {student.first_name}'s timeline
            </h2>
            {timeline.loading && <Loading rows={2} />}
            {(timeline.data ?? []).length === 0 && !timeline.loading && (
              <p className="py-6 text-center text-sm text-ink-faint">Nothing logged yet today.</p>
            )}
            <ol className="space-y-3">
              {(timeline.data ?? []).map((a: any) => {
                const type = ENTRY_TYPES.find((t) => t.value === a.entry_type);
                return (
                  <li key={a.id} className="flex gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-600/10 text-brand-600">
                      <Icon name={type?.icon ?? 'text'} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1 border-b border-line pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-ink-soft">{type?.label ?? a.entry_type}</span>
                        {a.rating && <Badge tone="green">{a.rating}</Badge>}
                        <span className="ml-auto text-xs tabular-nums text-ink-faint">{time(a.occurred_at)}</span>
                      </div>
                      <p className="mt-1 text-sm text-ink">{a.detail}</p>
                      <p className="mt-0.5 text-[11px] text-ink-faint">{a.logged_by_name} · {relative(a.occurred_at)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      )}
    </>
  );
}
