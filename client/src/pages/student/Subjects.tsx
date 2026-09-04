import { Link } from 'react-router-dom';
import { useFetch } from '../../lib/useFetch';
import { DAY_NAMES } from '../../lib/format';
import Icon from '../../components/Icon';
import { Badge, ErrorNote, Loading, PageHeader, Section } from '../../components/ui';

export default function StudentSubjects() {
  const subjects = useFetch<any[]>('/my/subjects');
  const timetable = useFetch<any[]>('/timetable');

  if (subjects.loading || timetable.loading) return <Loading rows={3} />;
  if (subjects.error) return <ErrorNote error={subjects.error} onRetry={subjects.reload} />;

  const byDay = (timetable.data ?? []).reduce((acc: any, slot: any) => {
    (acc[slot.day_of_week] ??= []).push(slot);
    return acc;
  }, {});
  const today = new Date().getDay() || 7;

  return (
    <>
      <PageHeader icon="book" title="My subjects" subtitle="Everything you are studying this year, and when each lesson runs." />

      <Section title="Subjects" className="mb-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(subjects.data ?? []).map((s: any) => (
            <article key={s.class_subject_id} className="card p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: s.colour }}>
                  <Icon name={s.icon ?? 'book'} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-bold text-ink">{s.name}</h3>
                  <p className="truncate text-xs text-ink-soft">{s.teacher_name ?? 'Teacher to be assigned'}</p>
                  <p className="mt-0.5 text-[11px] text-ink-faint">{s.code}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {s.open_assignments > 0
                  ? <Badge tone="amber" icon="assignment">{s.open_assignments} open</Badge>
                  : <Badge tone="green" icon="check">Nothing due</Badge>}
                <Link to="/messages" className="ml-auto text-xs font-semibold text-brand-600 hover:underline">
                  Message teacher
                </Link>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section title="My timetable">
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((day) => (
            <div key={day} className={`card overflow-hidden ${day === today ? 'border-brand-400' : ''}`}>
              <h3 className={`flex items-center justify-between px-4 py-2.5 text-sm font-bold ${
                day === today ? 'bg-brand-600 text-white' : 'bg-[color:var(--surface-sunken)] text-ink'
              }`}>
                {DAY_NAMES[day]}
                {day === today && <span className="text-xs font-semibold uppercase tracking-wide">Today</span>}
              </h3>
              {(byDay[day] ?? []).length === 0 ? (
                <p className="px-4 py-4 text-sm text-ink-faint">No lessons.</p>
              ) : (
                <ol className="divide-y divide-line">
                  {byDay[day].map((slot: any) => (
                    <li key={slot.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-14 shrink-0 font-mono text-xs font-bold tabular-nums text-ink-soft">{slot.start_time}</span>
                      <span className="h-7 w-1 shrink-0 rounded-full" style={{ background: slot.colour }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{slot.subject}</span>
                        <span className="block truncate text-xs text-ink-faint">{slot.teacher_name} · {slot.room}</span>
                      </span>
                      <Badge tone="slate">P{slot.period}</Badge>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
