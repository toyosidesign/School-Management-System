import { Link } from 'react-router-dom';
import QuickActions from '../../components/QuickActions';
import { useFetch } from '../../lib/useFetch';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import { money, relative, time } from '../../lib/format';
import Icon from '../../components/Icon';
import { Avatar, Badge, ErrorNote, Loading, PageHeader, ProgressBar, StatCard } from '../../components/ui';

export default function ParentDashboard() {
  const { user, activeChild } = useAuth();
  const { branding } = useBranding();
  const { data, loading, error, reload } = useFetch<any>('/dashboard');

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const children = data.children ?? [];

  return (
    <>
      <PageHeader
        title={`Hello, ${user.preferred_name || user.first_name}`}
        subtitle={`You are following ${children.length} ${children.length === 1 ? 'child' : 'children'} at ${branding.name}.`}
      />

      <QuickActions actions={[
    { to: '/messages', icon: 'message', label: 'Message a teacher' },
    { to: '/parent/fees', icon: 'money', label: 'Pay fees' },
    { to: '/parent/leave', icon: 'leave', label: 'Request leave' },
    { to: '/parent/slips', icon: 'slip', label: 'Sign a slip' },
    { to: '/parent/feedback', icon: 'star', label: 'Rate teachers' },
      ]} />

      {(data.unread_messages > 0 || data.pending_slips > 0) && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          {data.unread_messages > 0 && (
            <Link to="/messages" className="card flex items-center gap-3 panel-brand p-4 transition hover:shadow-md">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white"><Icon name="message" className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-ink">{data.unread_messages} unread message{data.unread_messages === 1 ? '' : 's'}</span>
                <span className="block text-sm text-ink-soft">From your child's teachers</span>
              </span>
              <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-brand-600" />
            </Link>
          )}
          {data.pending_slips > 0 && (
            <Link to="/parent/slips" className="card flex items-center gap-3 panel-amber p-4 transition hover:shadow-md">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-white"><Icon name="slip" className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-ink">{data.pending_slips} permission slip{data.pending_slips === 1 ? '' : 's'} to sign</span>
                <span className="block text-sm text-ink-soft">Sign digitally in a few seconds</span>
              </span>
              <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-amber-700" />
            </Link>
          )}
        </div>
      )}

      <div className="space-y-5">
        {children.map((c: any) => (
          <article key={c.id} className="card overflow-hidden">
            <header className="flex flex-wrap items-center gap-3 border-b border-line p-4">
              <Avatar first={c.first_name} last={c.last_name} colour={c.avatar_colour} src={c.avatar_url} emoji={c.avatar_emoji} size="lg" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold text-ink">{c.first_name} {c.last_name}</h2>
                <p className="truncate text-sm text-ink-soft">{c.class_name} · {c.student_code}</p>
              </div>
              <Link to="/parent/progress" className="btn-ghost shrink-0">
                Full progress <Icon name="chevronRight" className="h-4 w-4" />
              </Link>
            </header>

            <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
              <StatCard label="Attendance" value={`${c.attendance_rate}%`} icon="attendance"
                        tone={c.attendance_rate >= 90 ? 'green' : 'amber'} />
              <StatCard label="Average grade" value={c.average_grade ?? '-'} icon="star" tone="violet" />
              <StatCard label="To catch up" value={c.open_catchup} icon="catchup"
                        tone={c.open_catchup ? 'amber' : 'green'} />
              <StatCard label="Fees due" value={money(c.outstanding_fees)} icon="money"
                        tone={c.outstanding_fees > 0 ? 'red' : 'green'} />
            </div>

            {c.recent_activity?.length > 0 && (
              <div className="border-t border-line p-4">
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Today so far</h3>
                  <Link to="/parent/timeline" className="text-xs font-semibold text-brand-600 hover:underline">Full timeline</Link>
                </div>
                <ul className="space-y-2">
                  {c.recent_activity.map((a: any) => (
                    <li key={a.id} className="flex items-start gap-2.5 rounded-lg bg-[color:var(--surface-sunken)] px-3 py-2">
                      <span className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-600">{a.entry_type}</span>
                      <span className="min-w-0 flex-1 text-sm text-ink">{a.detail}</span>
                      {a.rating && <Badge tone="green">{a.rating}</Badge>}
                      <span className="shrink-0 text-xs tabular-nums text-ink-faint">{time(a.occurred_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ))}
      </div>

    </>
  );
}
