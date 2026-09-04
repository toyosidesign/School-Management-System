import { useState } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../context/ToastContext';
import { dateLong, relative, statusText } from '../../lib/format';
import Icon from '../../components/Icon';
import { Avatar, Badge, ChipRail, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader, StatCard } from '../../components/ui';
import { LEAVE_TYPES } from '../teacher/MyLeave';

/** Staff leave awaiting a decision from school leadership. */
export default function AdminStaffLeave() {
  const { toast } = useToast();
  const { data, loading, error, reload } = useFetch<any[]>('/staff-leave');
  const [filter, setFilter] = useState('pending');
  const [decision, setDecision] = useState<any>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const all = data ?? [];
  const rows = all.filter((l) => (filter === 'all' ? true : l.status === filter));
  const count = (status: string) => all.filter((l) => l.status === status).length;

  const decide = async (status: string) => {
    setBusy(true);
    try {
      const res = await api.post(`/staff-leave/${decision.leave.id}/decision`, { status, review_note: note });
      toast(status === 'approved'
        ? `Approved. ${res.balance.remaining} days left in their entitlement.`
        : 'Declined. They have been notified.');
      setDecision(null);
      setNote('');
      reload();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  // Anyone away in the next fortnight, so cover can be planned.
  const soon = all.filter((l) => {
    if (l.status !== 'approved') return false;
    const days = (new Date(l.start_date).getTime() - Date.now()) / 86_400_000;
    return days >= -1 && days <= 14;
  });

  return (
    <>
      <PageHeader
        icon="leave" title="Staff leave"
        subtitle="Requests from teaching and support staff. Approving one draws it down from their entitlement."
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Awaiting decision" value={count('pending')} icon="clock"
                  tone={count('pending') ? 'amber' : 'green'} onClick={() => setFilter('pending')} />
        <StatCard label="Approved" value={count('approved')} icon="check" tone="green"
                  onClick={() => setFilter('approved')} />
        <StatCard label="Away in the next fortnight" value={soon.length} icon="calendar" tone="brand" />
        <StatCard label="Declined" value={count('rejected')} icon="x"
                  tone={count('rejected') ? 'red' : 'slate'} onClick={() => setFilter('rejected')} />
      </div>

      {soon.length > 0 && (
        <section className="card panel-brand mb-5 p-4">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <Icon name="calendar" className="h-4 w-4 shrink-0 text-brand-600" /> Cover needed soon
          </h2>
          <ul className="mt-2 space-y-1.5">
            {soon.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm text-ink">
                <b>{l.first_name} {l.last_name}</b>
                <span className="text-ink-soft">
                  {dateLong(l.start_date)}{l.end_date !== l.start_date && <> to {dateLong(l.end_date)}</>}
                </span>
                {l.cover_notes
                  ? <Badge tone="green" icon="check">Cover arranged</Badge>
                  : <Badge tone="amber" icon="warning">No cover noted</Badge>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-5">
        <ChipRail
          ariaLabel="Filter staff leave" value={filter} onChange={setFilter}
          options={[
            { value: 'pending', label: 'Awaiting decision', count: count('pending') },
            { value: 'approved', label: 'Approved', count: count('approved') },
            { value: 'rejected', label: 'Declined', count: count('rejected') },
            { value: 'all', label: 'All', count: all.length },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="check" title="Nothing to review" body="Staff leave requests appear here." />
      ) : (
        <ul className="space-y-3">
          {rows.map((l) => {
            const tone = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'slate' }[l.status];
            const type = LEAVE_TYPES.find((t) => t.value === l.leave_type);
            return (
              <li key={l.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <Avatar first={l.first_name} last={l.last_name} colour={l.avatar_colour}
                            src={l.avatar_url} emoji={l.avatar_emoji} />
                    <div className="min-w-0">
                      <p className="font-bold text-ink">{l.first_name} {l.last_name}</p>
                      <p className="text-xs text-ink-soft">{l.title ?? 'Staff'}{l.department ? ` · ${l.department}` : ''}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge tone={tone}>{statusText(l.status)}</Badge>
                        <Badge tone="slate">{type?.label ?? l.leave_type}</Badge>
                        <Badge tone="brand">{l.working_days} day{l.working_days === 1 ? '' : 's'}</Badge>
                      </div>
                      <p className="mt-2 font-semibold text-ink">
                        {dateLong(l.start_date)}
                        {l.end_date !== l.start_date && <> to {dateLong(l.end_date)}</>}
                      </p>
                      {l.reason && <p className="mt-1 text-sm text-ink-soft">{l.reason}</p>}
                      <p className="mt-1 text-xs text-ink-faint">
                        {l.cover_notes ? `Cover: ${l.cover_notes}` : 'No cover arrangements noted'}
                        {' · '}requested {relative(l.created_at)}
                      </p>
                    </div>
                  </div>

                  {l.status === 'pending' && (
                    <div className="flex shrink-0 gap-2">
                      <button className="btn-ghost" onClick={() => setDecision({ leave: l, action: 'rejected' })}>
                        <Icon name="x" className="h-4 w-4" /> Decline
                      </button>
                      <button className="btn-primary" onClick={() => setDecision({ leave: l, action: 'approved' })}>
                        <Icon name="check" className="h-4 w-4" /> Approve
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={!!decision} onClose={() => setDecision(null)}
        title={decision?.action === 'approved' ? 'Approve leave' : 'Decline leave'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setDecision(null)}>Cancel</button>
            <button className={decision?.action === 'approved' ? 'btn-primary' : 'btn-danger'}
                    onClick={() => decide(decision.action)} disabled={busy}>
              {busy ? 'Saving...' : decision?.action === 'approved' ? 'Approve' : 'Decline'}
            </button>
          </>
        }
      >
        {decision && (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">
              <b className="text-ink">{decision.leave.first_name} {decision.leave.last_name}</b>,{' '}
              {decision.leave.working_days} day{decision.leave.working_days === 1 ? '' : 's'} from{' '}
              {dateLong(decision.leave.start_date)}.
            </p>
            {!decision.leave.cover_notes && decision.action === 'approved' && (
              <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                <Icon name="warning" className="mr-1.5 inline h-4 w-4" />
                No cover has been noted for these classes.
              </p>
            )}
            <Field label="Note for them" hint="Optional. They will see this on their leave page.">
              <textarea className="input min-h-[5rem] resize-y" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
