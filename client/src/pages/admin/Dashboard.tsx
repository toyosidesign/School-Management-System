import { Link, useNavigate } from 'react-router-dom';
import QuickActions from '../../components/QuickActions';
import SetupChecklist from '../../components/SetupChecklist';
import { useBranding } from '../../context/BrandingContext';
import { useSections } from '../../lib/useSections';
import { useFetch } from '../../lib/useFetch';
import { money, relative } from '../../lib/format';
import Icon from '../../components/Icon';
import { Badge, ErrorNote, Loading, PageHeader, StatCard } from '../../components/ui';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { branding } = useBranding();
  const { sections, nameOf } = useSections();
  const { data, loading, error, reload } = useFetch<any>('/dashboard');

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const collectionRate = data.fees.billed ? Math.round((data.fees.collected / data.fees.billed) * 100) : 0;

  return (
    <>
      <PageHeader
        icon="dashboard" title="School overview"
        subtitle={`${branding.name}${branding.academic_year ? ` · Academic year ${branding.academic_year}` : ''}`}
      />

      <QuickActions actions={[
    { to: '/admin/admissions', icon: 'slip', label: 'Admissions inbox' },
    { to: '/admin/leave', icon: 'leave', label: 'Leave approvals' },
    { to: '/admin/students', icon: 'users', label: 'Students' },
    { to: '/admin/staff', icon: 'users', label: 'Staff' },
    { to: '/admin/fees', icon: 'money', label: 'Fees' },
    { to: '/admin/website', icon: 'globe', label: 'Website' },
      ]} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Students" value={data.students} icon="users" />
        <StatCard label="Staff" value={data.staff} icon="users" tone="violet" />
        <StatCard label="Classes" value={data.classes} icon="book" />
        <StatCard label="On SEN register" value={data.sen_students} icon="accessibility" tone="violet" />
        <StatCard label="Attendance (30d)" value={`${data.attendance_rate}%`} icon="attendance"
                  tone={data.attendance_rate >= 90 ? 'green' : 'amber'} />
        <StatCard label="Leave pending" value={data.pending_leave} icon="leave"
                  tone={data.pending_leave ? 'amber' : 'green'}
                  onClick={() => navigate('/admin/leave')} />
      </div>


      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        {/* A breakdown reads as a list of parts against the whole, not as a figure. */}
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-ink">Enrolment by section</h2>
            <Link to="/admin/students" className="text-sm font-semibold text-brand-600 hover:text-brand-800">
              All pupils
            </Link>
          </div>
          {(() => {
            // A school running a section per year has fifteen of them, which is
            // a report rather than an overview: the biggest few carry the shape
            // of the school, and the rest are summed rather than listed.
            const all = [...(data.by_section ?? [])]
              .filter((s: any) => s.n > 0)
              .sort((a: any, b: any) => b.n - a.n);
            if (!all.length) {
              return <p className="py-6 text-center text-sm text-ink-faint">No pupils enrolled yet.</p>;
            }

            const top = all.slice(0, 5);
            const rest = all.slice(5);
            const others = rest.reduce((n: number, s: any) => n + s.n, 0);
            const rows = [
              ...top.map((s: any) => ({ key: s.section, label: nameOf(s.section) ?? s.section, n: s.n })),
              ...(rest.length
                ? [{ key: '__rest__', label: `${rest.length} other section${rest.length === 1 ? '' : 's'}`, n: others }]
                : []),
            ];

            return (
              <ul className="divide-y divide-line">
                {rows.map((row) => {
                  const share = data.students ? Math.round((row.n / data.students) * 100) : 0;
                  const muted = row.key === '__rest__';
                  return (
                    <li key={row.key} className="flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm ${muted ? 'text-ink-soft' : 'font-semibold text-ink'}`}>
                          {row.label}
                        </span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-sunken)]">
                          <span className={`block h-full rounded-full ${muted ? 'bg-slate-400' : 'bg-brand-500'}`}
                                style={{ width: `${share}%` }} />
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <b className="block text-sm tabular-nums text-ink">{row.n}</b>
                        <span className="block text-xs text-ink-faint">{share}%</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </section>

        {/* Collection is one story: how much of what was billed has come in. */}
        <section className="card flex flex-col p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-ink">Fee collection</h2>
            <Link to="/admin/fees" className="text-sm font-semibold text-brand-600 hover:text-brand-800">
              Manage fees
            </Link>
          </div>

          <p className="text-sm text-ink-soft">
            <b className="text-ink">{money(data.fees.collected)}</b> collected of {money(data.fees.billed)} billed
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[color:var(--surface-sunken)]">
              <span
                className={`block h-full rounded-full ${collectionRate >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(collectionRate, 100)}%` }}
              />
            </span>
            <b className="shrink-0 text-sm tabular-nums text-ink">{collectionRate}%</b>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-sm">
            <dt className="text-ink-soft">Outstanding</dt>
            <dd className="text-right font-semibold tabular-nums text-ink">
              {money(Math.max(data.fees.billed - data.fees.collected, 0))}
            </dd>
            <dt className="text-ink-soft">Unpaid invoices</dt>
            <dd className="text-right font-semibold tabular-nums text-ink">{data.fees.outstanding_count}</dd>
          </dl>
        </section>
      </div>

      <SetupChecklist />


      <section className="card p-4" data-focus-hide>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
            <Icon name="shield" className="shrink-0 h-4 w-4" /> Latest audit activity
          </h2>
          <Link to="/admin/audit" className="text-xs font-semibold text-brand-600 hover:underline">Full log</Link>
        </div>
        <ul className="divide-y divide-line">
          {(data.recent_audit ?? []).map((a: any) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
              <Badge tone="slate">{a.action}</Badge>
              <span className="min-w-0 flex-1 truncate text-ink">{a.user_label}</span>
              <span className="truncate text-xs text-ink-faint">{a.entity} #{a.entity_id}</span>
              <span className="text-xs text-ink-faint">{relative(a.created_at)}</span>
            </li>
          ))}
        </ul>
      </section>

    </>
  );
}
