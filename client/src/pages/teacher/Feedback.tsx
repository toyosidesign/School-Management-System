import { useFetch } from '../../lib/useFetch';
import { relative } from '../../lib/format';
import Icon from '../../components/Icon';
import { Badge, EmptyState, ErrorNote, Loading, PageHeader, ProgressBar, StatCard } from '../../components/ui';

export default function TeacherFeedback() {
  const { data, loading, error, reload } = useFetch<any>('/feedback');

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const { summary, items } = data;

  return (
    <>
      <PageHeader
        icon="star" title="Feedback from my students"
        subtitle="Most of this is anonymous by design: students say more when their name is not attached."
      />

      {summary.n === 0 ? (
        <EmptyState icon="star" title="No feedback yet" body="Your students can rate lessons from their portal at any time." />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Overall" value={summary.rating ?? '-'} hint="out of 5" icon="star" tone="amber" />
            <StatCard label="Clarity" value={summary.clarity ?? '-'} hint="out of 5" icon="eye" tone="brand" />
            <StatCard label="Support" value={summary.support ?? '-'} hint="out of 5" icon="heart" tone="violet" />
            <StatCard label="Responses" value={summary.n} icon="users" tone="green" />
          </div>

          <div className="card mb-6 space-y-4 p-4">
            <ProgressBar value={summary.rating ?? 0} max={5} label="Overall rating" tone={summary.rating >= 4 ? 'green' : 'amber'} />
            <ProgressBar value={summary.clarity ?? 0} max={5} label="Clarity of explanation" tone={summary.clarity >= 4 ? 'green' : 'amber'} />
            <ProgressBar value={summary.support ?? 0} max={5} label="Feeling supported" tone={summary.support >= 4 ? 'green' : 'amber'} />
          </div>

          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-soft">What students said</h2>
          <ul className="space-y-3">
            {items.map((f: any) => (
              <li key={f.id} className="card p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="flex" aria-label={`${f.rating} out of 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Icon key={n} name="star" filled={n <= f.rating}
                            className={`h-4 w-4 ${n <= f.rating ? 'text-amber-500' : 'text-slate-300'}`} />
                    ))}
                  </span>
                  {f.subject && <Badge tone="brand">{f.subject}</Badge>}
                  <Badge tone="slate" icon={f.student_name ? 'users' : 'eye'}>{f.student_name ?? 'Anonymous'}</Badge>
                  <span className="ml-auto text-xs text-ink-faint">{relative(f.created_at)}</span>
                </div>
                {f.comment && <p className="text-sm text-ink">{f.comment}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
