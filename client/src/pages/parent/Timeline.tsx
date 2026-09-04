import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../lib/useFetch';
import { qs } from '../../lib/api';
import { dateLong, time, relative } from '../../lib/format';
import Icon from '../../components/Icon';
import { Badge, EmptyState, ErrorNote, Loading, PageHeader } from '../../components/ui';

const TYPE_META: Record<string, { icon: string; label: string; tone: string }> = {
  meal: { icon: 'heart', label: 'Meal', tone: 'amber' },
  nap: { icon: 'clock', label: 'Nap', tone: 'violet' },
  mood: { icon: 'star', label: 'Mood', tone: 'brand' },
  toilet: { icon: 'check', label: 'Toileting', tone: 'slate' },
  behaviour: { icon: 'users', label: 'Behaviour', tone: 'green' },
  milestone: { icon: 'sparkle', label: 'Milestone', tone: 'violet' },
  note: { icon: 'text', label: 'Note', tone: 'slate' },
};

export default function ParentTimeline() {
  const { activeChild } = useAuth();
  const { data, loading, error, reload } = useFetch<any[]>(
    activeChild ? `/activity${qs({ studentId: activeChild.id })}` : null, [activeChild?.id]
  );

  if (!activeChild) return <EmptyState icon="users" title="No child linked to your account" />;
  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  // Group entries by calendar day.
  const days: Record<string, any[]> = (data ?? []).reduce((acc: Record<string, any[]>, entry: any) => {
    const key = entry.occurred_at.slice(0, 10);
    (acc[key] ??= []).push(entry);
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        icon="baby" title={`${activeChild.first_name}'s daily timeline`}
        subtitle="Meals, naps, moods and milestones, logged by the class team as the day goes along."
      />

      {Object.keys(days).length === 0 ? (
        <EmptyState
          icon="baby" title="Nothing logged yet"
          body="Entries appear here as your child's teacher records them through the day."
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(days).map(([day, entries]) => (
            <section key={day}>
              <h2 className="sticky top-16 z-10 mb-3 inline-block rounded-full bg-[color:var(--surface-raised)] px-3 py-1 text-sm font-bold text-ink shadow-sm ring-1 ring-line">
                {isToday(day) ? 'Today' : dateLong(day)}
              </h2>
              <ol className="relative space-y-3 border-l-2 border-line pl-5">
                {entries.map((a: any) => {
                  const meta = TYPE_META[a.entry_type] ?? TYPE_META.note;
                  return (
                    <li key={a.id} className="relative">
                      <span
                        className="absolute -left-[1.85rem] top-2 grid h-7 w-7 place-items-center rounded-full bg-[color:var(--surface-raised)] ring-2 ring-line"
                        aria-hidden="true"
                      >
                        <Icon name={meta.icon} className="h-3.5 w-3.5 text-brand-600" />
                      </span>
                      <div className="card p-3.5">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          {a.rating && <Badge tone="green">{a.rating}</Badge>}
                          <span className="ml-auto text-xs font-semibold tabular-nums text-ink-faint">{time(a.occurred_at)}</span>
                        </div>
                        <p className="text-sm text-ink">{a.detail}</p>
                        <p className="mt-1 text-[11px] text-ink-faint">{a.logged_by_name}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

const isToday = (day: string) => day === new Date().toISOString().slice(0, 10);
