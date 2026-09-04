import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../context/ToastContext';
import Icon from '../../components/Icon';
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';
import { Avatar, Badge, ErrorNote, Loading, PageHeader, SenBadges } from '../../components/ui';

const STATUSES = [
  { value: 'present', label: 'Present', tone: 'bg-emerald-600', icon: 'check' },
  { value: 'late', label: 'Late', tone: 'bg-amber-500', icon: 'clock' },
  { value: 'absent', label: 'Absent', tone: 'bg-red-600', icon: 'x' },
  { value: 'excused', label: 'Excused', tone: 'bg-violet-600', icon: 'leave' },
];

export default function TeacherAttendance() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const subjects = useFetch<any[]>('/my/subjects');

  const [cs, setCs] = useState(params.get('cs') ?? '');
  const [period, setPeriod] = useState(Number(params.get('period')) || 1);
  const [date, setDate] = useState(params.get('date') ?? new Date().toISOString().slice(0, 10));
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!cs && subjects.data?.length) setCs(String(subjects.data[0].class_subject_id));
  }, [subjects.data, cs]);

  const roster = useFetch<any[]>(cs ? `/attendance${qs({ classSubjectId: cs, date })}` : null, [cs, date]);

  useEffect(() => {
    if (!roster.data) return;
    setMarks(Object.fromEntries(roster.data.map((r: any) => [r.student_id, r.status ?? 'present'])));
    setResult(null);
  }, [roster.data]);

  useEffect(() => {
    setParams({ cs, period: String(period), date }, { replace: true });
  }, [cs, period, date, setParams]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await api.post('/attendance', {
        class_subject_id: Number(cs), date, period,
        records: Object.entries(marks).map(([student_id, status]) => ({ student_id: Number(student_id), status })),
      });
      setResult(res);
      toast(
        res.catchup_entries_created
          ? `Register saved. ${res.catchup_entries_created} Catch-Up Hub ${res.catchup_entries_created === 1 ? 'entry' : 'entries'} created automatically.`
          : 'Register saved.'
      );
      roster.reload();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const setAll = (status: string) =>
    setMarks(Object.fromEntries((roster.data ?? []).map((r: any) => [r.student_id, status])));

  const counts = STATUSES.map((s) => ({
    ...s, n: Object.values(marks).filter((v) => v === s.value).length,
  }));

  if (subjects.loading) return <Loading rows={3} />;

  return (
    <>
      <PageHeader
        icon="attendance" title="Attendance register"
        subtitle="Marking a student absent creates their Catch-Up Hub entry automatically, with no extra step."
      />

      <div className="card mb-5 grid gap-3 p-4 sm:grid-cols-3">
        <label className="block">
          <span className="label">Class &amp; subject</span>
          <Select
            value={cs}
            onChange={(v) => setCs(v)}
            options={[...(subjects.data ?? []).map((s: any) => ({ value: String(s.class_subject_id), label: `${s.class_name} · ${s.name}` }))]}
          />
        </label>
        <label className="block">
          <span className="label">Date</span>
          <DatePicker max={new Date().toISOString().slice(0, 10)}
            value={date}
            onChange={(v) => setDate(v)}
          />
        </label>
        <label className="block">
          <span className="label">Period</span>
          <Select
            value={String(period)}
            onChange={(v) => setPeriod(Number(v))}
            options={[...[1, 2, 3, 4, 5].map((p: any) => ({ value: String(p), label: `Period ${p}` }))]}
          />
        </label>
      </div>

      {roster.loading && <Loading rows={3} />}
      {roster.error && <ErrorNote error={roster.error} onRetry={roster.reload} />}

      {roster.data && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2" data-focus-hide>
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Mark everyone:</span>
            {STATUSES.map((s) => (
              <button key={s.value} className="btn-subtle !py-1.5 !text-xs" onClick={() => setAll(s.value)}>{s.label}</button>
            ))}
            <span className="ml-auto flex flex-wrap gap-1.5">
              {counts.filter((c) => c.n > 0).map((c) => (
                <Badge key={c.value} tone={c.value === 'present' ? 'green' : c.value === 'absent' ? 'red' : c.value === 'late' ? 'amber' : 'violet'}>
                  {c.n} {c.label.toLowerCase()}
                </Badge>
              ))}
            </span>
          </div>

          <ul className="space-y-2">
            {roster.data.map((s: any) => (
              <li key={s.student_id} className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar first={s.first_name} last={s.last_name} colour={s.avatar_colour} src={s.avatar_url} emoji={s.avatar_emoji} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{s.first_name} {s.last_name}</p>
                    <p className="truncate text-xs text-ink-faint">{s.student_code}</p>
                    <div className="mt-1"><SenBadges needs={s.needs} multiplier={s.time_multiplier} compact /></div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1.5 sm:flex" role="radiogroup" aria-label={`Attendance for ${s.first_name} ${s.last_name}`}>
                  {STATUSES.map((st) => {
                    const active = marks[s.student_id] === st.value;
                    return (
                      <button
                        key={st.value} role="radio" aria-checked={active}
                        onClick={() => setMarks({ ...marks, [s.student_id]: st.value })}
                        className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition ${
                          active ? `${st.tone} text-white shadow-sm` : 'bg-[color:var(--surface-sunken)] text-ink-soft hover:text-ink'
                        }`}
                        data-tap
                      >
                        <Icon name={st.icon} className="h-3.5 w-3.5" strokeWidth={2.5} />
                        <span className="hidden xs:inline sm:inline">{st.label}</span>
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>

          {result?.catchup_entries_created > 0 && (
            <div className="card mt-4 panel-brand p-4">
              <p className="flex items-start gap-2 text-sm text-ink">
                <Icon name="catchup" className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <span>
                  <b>{result.catchup_entries_created} Catch-Up Hub {result.catchup_entries_created === 1 ? 'entry was' : 'entries were'} created.</b>{' '}
                  Publish a lesson recap for this date and it will attach itself to every one of them.
                </span>
              </p>
            </div>
          )}

          <div className="sticky bottom-20 mt-5 lg:bottom-4">
            <button className="btn-primary w-full !py-3 shadow-lg" onClick={save} disabled={busy || !roster.data.length}>
              <Icon name="check" className="h-4 w-4" /> {busy ? 'Saving…' : 'Save register'}
            </button>
          </div>
        </>
      )}
    </>
  );
}
