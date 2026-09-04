import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../lib/useFetch';
import { dateLong, relative } from '../../lib/format';
import Icon from '../../components/Icon';
import { Readable } from '../../components/Readable';
import { Badge, EmptyState, ErrorNote, Loading, PageHeader, ProgressBar, SenBadges, StatCard } from '../../components/ui';

export default function ParentProgress() {
  const { activeChild } = useAuth();
  const detail = useFetch<any>(activeChild ? `/students/${activeChild.id}` : null, [activeChild?.id]);
  const assignments = useFetch<any[]>(activeChild ? `/assignments?studentId=${activeChild.id}` : null, [activeChild?.id]);

  if (!activeChild) return <EmptyState icon="users" title="No child linked to your account" body="Contact the school office to be linked to your child's record." />;
  if (detail.loading) return <Loading rows={4} />;
  if (detail.error) return <ErrorNote error={detail.error} onRetry={detail.reload} />;

  const s = detail.data;
  const graded = (assignments.data ?? []).filter((a) => a.grade != null);
  const att = s.attendance_summary;

  return (
    <>
      <PageHeader
        icon="chart" title={`${s.first_name}'s progress`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{s.class_name} · {s.student_code}</span>
            {s.iep && <SenBadges needs={s.iep.needs} multiplier={s.iep.time_multiplier} multiFormat={s.iep.multi_format_approved} />}
          </span>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Attendance" value={`${att.rate}%`} hint={`${att.total} periods recorded`} icon="attendance" tone={att.rate >= 90 ? 'green' : 'amber'} />
        <StatCard label="Average grade" value={s.grade_average ?? '-'} icon="star" tone="violet" />
        <StatCard label="Absences" value={att.absent ?? 0} icon="x" tone={att.absent ? 'red' : 'green'} />
        <StatCard label="Excused" value={att.excused ?? 0} icon="leave" tone="brand" />
      </div>

      {s.iep && (
        <section className="card mb-6 panel-violet p-4">
          <h2 className="mb-2 flex items-center gap-2 font-bold text-violet-900 dark:text-violet-300">
            <Icon name="accessibility" className="shrink-0 h-5 w-5" /> Support plan
          </h2>
          <p className="text-sm text-ink-soft">{s.iep.notes}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {s.iep.time_multiplier > 1 && (
              <p className="flex items-center gap-2 text-sm text-ink"><Icon name="clock" className="h-4 w-4 text-violet-600" />
                {Math.round((s.iep.time_multiplier - 1) * 100)}% extra time in timed assessments</p>
            )}
            {!!s.iep.multi_format_approved && (
              <p className="flex items-center gap-2 text-sm text-ink"><Icon name="mic" className="h-4 w-4 text-violet-600" />
                May submit audio, video or diagrams</p>
            )}
            {!!s.iep.rest_breaks && (
              <p className="flex items-center gap-2 text-sm text-ink"><Icon name="heart" className="h-4 w-4 text-violet-600" /> Rest breaks allowed</p>
            )}
            {s.iep.review_date && (
              <p className="flex items-center gap-2 text-sm text-ink"><Icon name="calendar" className="h-4 w-4 text-violet-600" />
                Next review {dateLong(s.iep.review_date)}</p>
            )}
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-soft">Subjects &amp; teachers</h2>
          <ul className="space-y-2">
            {(s.subjects ?? []).map((sub: any) => (
              <li key={sub.class_subject_id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: sub.colour }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{sub.name}</span>
                  <span className="block truncate text-xs text-ink-soft">{sub.teacher_name ?? 'To be assigned'}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-soft">Recent grades</h2>
          {graded.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">No graded work yet this term.</p>
          ) : (
            <ul className="space-y-3">
              {graded.slice(0, 8).map((a: any) => (
                <li key={a.id} className="rounded-xl border border-line p-3">
                  <div className="mb-1.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{a.title}</p>
                      <p className="truncate text-xs text-ink-soft">{a.subject}</p>
                    </div>
                    <span className="shrink-0 text-lg font-bold tabular-nums text-emerald-600">
                      {a.grade}<span className="text-sm text-ink-faint">/{a.max_score}</span>
                    </span>
                  </div>
                  <ProgressBar value={a.grade} max={a.max_score} tone={a.grade / a.max_score >= 0.7 ? 'green' : 'amber'} />
                  {a.feedback_text && (
                    <div className="mt-2 rounded-lg bg-[color:var(--surface-sunken)] px-3 py-2">
                      <Readable text={a.feedback_text} className="text-xs text-ink-soft" />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
