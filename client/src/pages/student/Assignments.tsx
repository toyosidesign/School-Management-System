import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../../lib/useFetch';
import { relative, dateLong } from '../../lib/format';
import Icon from '../../components/Icon';
import { Badge, ChipRail, EmptyState, ErrorNote, Loading, PageHeader } from '../../components/ui';

export default function StudentAssignments() {
  const { data, loading, error, reload } = useFetch<any[]>('/assignments');
  const [filter, setFilter] = useState('open');

  const groups = useMemo(() => {
    const all = data ?? [];
    return {
      open: all.filter((a) => !a.submission_status && new Date(a.due_at) >= new Date()),
      overdue: all.filter((a) => !a.submission_status && new Date(a.due_at) < new Date()),
      submitted: all.filter((a) => a.submission_status && a.grade == null),
      graded: all.filter((a) => a.grade != null),
      all,
    };
  }, [data]);

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const shown = groups[filter as keyof typeof groups] ?? groups.all;

  return (
    <>
      <PageHeader
        icon="assignment" title="My assignments"
        subtitle="Written, audio, video or a diagram: submit in whichever format works for you."
      />

      <div className="mb-5">
        <ChipRail
          ariaLabel="Filter assignments" value={filter} onChange={setFilter}
          options={[
            { value: 'open', label: 'To do', count: groups.open.length },
            { value: 'overdue', label: 'Overdue', count: groups.overdue.length },
            { value: 'submitted', label: 'Submitted', count: groups.submitted.length },
            { value: 'graded', label: 'Graded', count: groups.graded.length },
            { value: 'all', label: 'All', count: groups.all.length },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon="check" title="Nothing here"
          body={filter === 'overdue' ? 'No overdue work. Nicely done.' : 'Check another tab to see the rest of your work.'}
        />
      ) : (
        <ul className="space-y-3">
          {shown.map((a: any) => {
            const overdue = !a.submission_status && new Date(a.due_at) < new Date();
            return (
              <li key={a.id}>
                <Link
                  to={`/student/assignments/${a.id}`}
                  className="card flex flex-col gap-3 p-4 transition hover:border-brand-300 hover:shadow-md sm:flex-row sm:items-center"
                >
                  <span className="hidden h-14 w-1.5 shrink-0 rounded-full sm:block" style={{ background: a.colour }} />
                  <span className="min-w-0 flex-1">
                    <span className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: a.colour }}>{a.subject}</span>
                      {a.base_duration_minutes && <Badge tone="amber" icon="clock">Timed · {a.base_duration_minutes} min</Badge>}
                      {!!a.allow_multi_format && <Badge tone="green" icon="mic">Audio / video accepted</Badge>}
                    </span>
                    <span className="block font-semibold text-ink">{a.title}</span>
                    <span className="mt-0.5 block text-xs text-ink-soft">
                      Due {dateLong(a.due_at)} · {relative(a.due_at)}
                      {a.teacher_name && ` · ${a.teacher_name}`}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    {a.grade != null ? (
                      <span className="text-right">
                        <span className="block text-lg font-bold tabular-nums text-emerald-600">{a.grade}<span className="text-sm text-ink-faint">/{a.max_score}</span></span>
                        <span className="block text-[11px] text-ink-faint">Graded</span>
                      </span>
                    ) : a.submission_status ? (
                      <Badge tone="brand" icon="check">
                        Submitted{a.submission_type !== 'TEXT' ? ` · ${a.submission_type.toLowerCase()}` : ''}
                      </Badge>
                    ) : (
                      <Badge tone={overdue ? 'red' : 'amber'}>{overdue ? 'Overdue' : 'To do'}</Badge>
                    )}
                    <Icon name="chevronRight" className="h-5 w-5 text-ink-faint" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
