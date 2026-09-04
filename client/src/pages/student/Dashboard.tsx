import { Link } from 'react-router-dom';
import QuickActions from '../../components/QuickActions';
import { useFetch } from '../../lib/useFetch';
import { useAuth } from '../../context/AuthContext';
import { dateShort, relative, NEED_SHORT } from '../../lib/format';
import Icon from '../../components/Icon';
import { Badge, EmptyState, ErrorNote, Loading, PageHeader, SenBadges, StatCard } from '../../components/ui';

export default function StudentDashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch<any>('/dashboard');
  const isPrimary = user.student?.section !== 'secondary';

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const due = data.due_soon;

  return (
    <>
      <header className="mb-7">
        <p className="text-sm text-ink-soft">
          {today} · {user.student?.class_name}
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {greeting}, {user.preferred_name || user.first_name}
        </h1>
        <p className="mt-2 text-ink-soft">
          {due === 0 && data.catchup_open === 0
            ? 'Nothing outstanding. Good place to be.'
            : [due > 0 && `${due} ${due === 1 ? 'task' : 'tasks'} due soon`,
               data.catchup_open > 0 && `${data.catchup_open} ${data.catchup_open === 1 ? 'lesson' : 'lessons'} to catch up on`]
                .filter(Boolean).join(', ') + '.'}
        </p>
        {user.iep && (
          <div className="mt-3">
            <SenBadges needs={user.iep.needs} multiplier={user.iep.time_multiplier} multiFormat={user.iep.multi_format_approved} />
          </div>
        )}
      </header>

      <QuickActions actions={[
    { to: '/student/library', icon: 'book', label: 'Read a textbook' },
    { to: '/student/catch-up', icon: 'catchup', label: 'Catch up on lessons' },
    { to: '/settings', icon: 'settings', label: 'My settings' },
    { to: '/messages', icon: 'message', label: 'Message a teacher' },
      ]} />

      {/* Catch-up nudge takes priority: it is the thing most likely to be missed. */}
      {data.catchup_open > 0 && (
        <Link
          to="/student/catch-up"
          className="card mb-5 flex items-center gap-4 panel-brand p-4 transition hover:border-brand-500 hover:shadow-md"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
            <Icon name="catchup" className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-ink">
              {data.catchup_open} lesson{data.catchup_open === 1 ? '' : 's'} waiting in your Catch-Up Hub
            </span>
            <span className="block text-sm text-ink-soft">
              {isPrimary ? 'Watch the video and read the notes to catch up.' : 'Recordings, teacher notes and summaries are ready.'}
            </span>
          </span>
          <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-brand-600" />
        </Link>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="To catch up" value={data.catchup_open} icon="catchup" tone={data.catchup_open ? 'amber' : 'green'} />
        <StatCard label="Due soon" value={data.due_soon} icon="assignment" tone={data.due_soon ? 'brand' : 'green'} />
        <StatCard label="Attendance" value={`${data.attendance_rate}%`} icon="attendance" tone={data.attendance_rate >= 90 ? 'green' : 'amber'} />
        <StatCard label="Average grade" value={data.average_grade != null ? data.average_grade : '-'} icon="star" tone="violet" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* ── Today's timetable ── */}
        <section className="card p-5">
          <h2 className="mb-4 font-display text-lg font-bold text-ink">Today’s lessons</h2>
          {data.today?.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">No lessons scheduled today. Enjoy the break.</p>
          ) : (
            <ol className="space-y-2">
              {data.today.map((slot: any) => (
                <li key={slot.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                  <span className="w-14 shrink-0 text-center">
                    <span className="block font-mono text-xs font-bold tabular-nums text-ink">{slot.start_time}</span>
                    <span className="block text-[10px] text-ink-faint">{slot.end_time}</span>
                  </span>
                  <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: slot.colour }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{slot.subject}</span>
                    <span className="block truncate text-xs text-ink-soft">{slot.teacher_name} · {slot.room ?? 'Room TBC'}</span>
                  </span>
                  <Badge tone="slate">P{slot.period}</Badge>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* ── Upcoming work ── */}
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-ink">Work coming up</h2>
            <Link to="/student/assignments" className="text-sm font-semibold text-brand-600 hover:underline">See all</Link>
          </div>
          {data.upcoming?.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">Nothing due. Take a breath.</p>
          ) : (
            <ol className="space-y-2">
              {data.upcoming.map((a: any) => {
                const overdue = new Date(a.due_at) < new Date() && !a.submission_status;
                return (
                  <li key={a.id}>
                    <Link
                      to={`/student/assignments/${a.id}`}
                      className="flex items-center gap-3 rounded-xl border border-line p-3 transition hover:border-brand-300"
                    >
                      <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: a.colour }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{a.title}</span>
                        <span className="block truncate text-xs text-ink-soft">{a.subject} · due {relative(a.due_at)}</span>
                      </span>
                      {a.submission_status
                        ? <Badge tone="green" icon="check">Submitted</Badge>
                        : <Badge tone={overdue ? 'red' : 'amber'}>{overdue ? 'Overdue' : dateShort(a.due_at)}</Badge>}
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
