import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import QuickActions from '../../components/QuickActions';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { relative } from '../../lib/format';
import Icon from '../../components/Icon';
import { Badge, ChipRail, ErrorNote, Loading, PageHeader, StatCard } from '../../components/ui';

const KIND_ICON: Record<string, string> = {
  register: 'attendance', grading: 'assignment', recap: 'video',
  draft: 'video', message: 'message', leave: 'leave',
};

/** One piece of work waiting on the teacher, actioned in place where it can be. */
function ActionRow({ item, onDone }: { item: any; onDone: () => void }) {
  const nav = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!item.action) return nav(item.link);
    setBusy(true);
    try {
      await api.patch(item.action.path, item.action.body);
      toast('Published. Pupils waiting on it have been told.');
      onDone();
    } catch (e: any) {
      toast(e.message, 'error');
      setBusy(false);
    }
  };

  return (
    <li className={`rounded-xl border p-3 ${item.urgent ? 'panel-red' : 'border-line'}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl chip-${item.tone ?? 'slate'}`}>
          <Icon name={KIND_ICON[item.kind] ?? 'bell'} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">{item.title}</p>
          <p className="truncate text-xs text-ink-soft">{item.detail}</p>
        </div>
        {item.urgent && <Badge tone="red">Overdue</Badge>}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-12">
        <button className="btn-primary btn-sm" onClick={run} disabled={busy}>
          {busy ? 'Working...' : item.cta}
          {!item.action && <Icon name="chevronRight" className="h-3.5 w-3.5" />}
        </button>
        {item.action && (
          <Link to={item.link} className="btn-ghost btn-sm">Open</Link>
        )}
      </div>
    </li>
  );
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch<any>('/dashboard');
  const announcements = useFetch<any[]>('/announcements');
  const actions = useFetch<any>('/dashboard/actions');
  const [board, setBoard] = useState('actions');

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const todo: any[] = actions.data?.items ?? [];
  const notices: any[] = announcements.data ?? [];

  return (
    <>
      <PageHeader
        title={`Good day, ${user.staff?.title ? '' : ''}${user.first_name} ${user.last_name}`}
        subtitle={`${user.staff?.title ?? 'Teacher'} · ${user.staff?.department ?? 'Teaching staff'}`}
      />

      <QuickActions actions={[
    { to: '/teacher/attendance', icon: 'attendance', label: 'Take attendance' },
    { to: '/teacher/materials', icon: 'video', label: 'Publish a recap' },
    { to: '/teacher/assignments', icon: 'assignment', label: 'Set an assignment' },
    { to: '/messages', icon: 'message', label: 'Message a parent' },
      ]} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Classes" value={data.classes} icon="book" />
        <StatCard label="Students" value={data.students} icon="users" />
        <StatCard label="To grade" value={data.ungraded} icon="assignment" tone={data.ungraded ? 'amber' : 'green'} />
        <StatCard label="Leave to review" value={data.pending_leave} icon="leave" tone={data.pending_leave ? 'amber' : 'green'} />
        <StatCard label="SEN students" value={data.sen_in_classes} icon="accessibility" tone="violet" />
        <StatCard label="Recaps missing" value={data.missing_recaps} icon="video" tone={data.missing_recaps ? 'red' : 'green'} />
      </div>

      {data.missing_recaps > 0 && (
        <Link to="/teacher/materials" className="card mb-5 flex items-center gap-4 panel-amber p-4 transition hover:shadow-md">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500 text-white">
            <Icon name="video" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-ink">
              {data.missing_recaps} absent student{data.missing_recaps === 1 ? ' is' : 's are'} waiting on a lesson recap
            </span>
            <span className="block text-sm text-ink-soft">Publish notes and a summary so they can catch up without you.</span>
          </span>
          <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-amber-700" />
        </Link>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-ink">
            <Icon name="clock" className="shrink-0 h-4 w-4" /> Your lessons today
          </h2>
          {data.today?.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">No lessons scheduled today.</p>
          ) : (
            <ol className="space-y-2">
              {data.today.map((slot: any) => (
                <li key={slot.id}>
                  <Link
                    to={`/teacher/attendance?cs=${slot.class_subject_id}&period=${slot.period}`}
                    className="flex items-center gap-3 rounded-xl border border-line p-3 transition hover:border-brand-300"
                  >
                    <span className="w-14 shrink-0 text-center">
                      <span className="block font-mono text-xs font-bold tabular-nums text-ink">{slot.start_time}</span>
                      <span className="block text-[10px] text-ink-faint">{slot.end_time}</span>
                    </span>
                    <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: slot.colour }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{slot.subject}</span>
                      <span className="block truncate text-xs text-ink-soft">{slot.class_name} · {slot.room}</span>
                    </span>
                    <Badge tone="brand">Take register</Badge>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card p-4" data-focus-hide>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
              <Icon name="bell" className="h-4 w-4 shrink-0" /> Notice board
            </h2>
            <ChipRail
              ariaLabel="Notice board view" value={board} onChange={setBoard}
              options={[
                { value: 'actions', label: 'Needs you', count: todo.length },
                { value: 'notices', label: 'Notices', count: notices.length },
              ]}
            />
          </div>

          {board === 'actions' ? (
            todo.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-faint">
                Nothing waiting on you. Registers, marking and recaps are all up to date.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {todo.map((item: any) => (
                  <ActionRow key={item.id} item={item} onDone={() => { actions.reload(); reload(); }} />
                ))}
              </ul>
            )
          ) : notices.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">Nothing posted.</p>
          ) : (
            <ul className="space-y-3">
              {notices.slice(0, 4).map((a: any) => (
                <li key={a.id} className="rounded-xl border border-line p-3">
                  <div className="mb-1 flex items-center gap-2">
                    {!!a.pinned && <Badge tone="amber">Pinned</Badge>}
                    <h3 className="min-w-0 truncate text-sm font-bold text-ink">{a.title}</h3>
                  </div>
                  <p className="text-xs leading-relaxed text-ink-soft">{a.body}</p>
                  <p className="mt-1.5 text-[11px] text-ink-faint">{a.author} · {relative(a.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

    </>
  );
}
