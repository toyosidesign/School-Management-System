import { useState } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../context/ToastContext';
import { dateLong, relative, statusText } from '../../lib/format';
import Icon from '../../components/Icon';
import { Badge, ChipRail, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader } from '../../components/ui';

export default function AdminLeave() {
  const { toast } = useToast();
  const { data, loading, error, reload } = useFetch<any[]>('/leave');
  const [filter, setFilter] = useState('pending');
  const [decision, setDecision] = useState<any>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = (data ?? []).filter((l) => (filter === 'all' ? true : l.status === filter));
  const counts = (status: string) => (data ?? []).filter((l) => l.status === status).length;

  const decide = async (status: string) => {
    setBusy(true);
    try {
      const res = await api.post(`/leave/${decision.leave.id}/decision`, { status, review_note: note });
      toast(
        status === 'approved'
          ? `Approved. ${res.excused_periods} period${res.excused_periods === 1 ? '' : 's'} tagged as Excused Leave, with Catch-Up entries created.`
          : 'Request declined. The family has been notified.'
      );
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

  return (
    <>
      <PageHeader
        icon="leave" title="Leave approvals"
        subtitle="Approving a request marks the register and opens Catch-Up Hub entries for every lesson missed. Only school leadership can make this decision."
      />

      <div className="mb-5">
        <ChipRail
          ariaLabel="Filter leave requests" value={filter} onChange={setFilter}
          options={[
            { value: 'pending', label: 'Awaiting review', count: counts('pending') },
            { value: 'approved', label: 'Approved', count: counts('approved') },
            { value: 'rejected', label: 'Declined', count: counts('rejected') },
            { value: 'all', label: 'All', count: (data ?? []).length },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="check" title="Nothing to review" body="Requests from students and parents land here." />
      ) : (
        <ul className="space-y-3">
          {rows.map((l) => {
            const tone = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'slate' }[l.status];
            return (
              <li key={l.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Badge tone={tone}>{statusText(l.status)}</Badge>
                      <Badge tone="slate">{l.category}</Badge>
                      <span className="text-xs text-ink-faint">{l.class_name}</span>
                    </div>
                    <p className="font-bold text-ink">{l.student_first_name} {l.student_last_name}</p>
                    <p className="mt-0.5 text-sm font-medium text-ink-soft">
                      {dateLong(l.start_date)}{l.end_date !== l.start_date && <> → {dateLong(l.end_date)}</>}
                    </p>
                    <p className="mt-1.5 text-sm text-ink-soft">{l.reason}</p>
                    <p className="mt-1.5 text-xs text-ink-faint">
                      Requested by {l.requested_by_name} ({l.requested_by_role}) · {relative(l.created_at)}
                    </p>
                    {l.review_note && (
                      <p className="mt-2 rounded-lg bg-[color:var(--surface-sunken)] px-3 py-2 text-sm text-ink-soft">{l.review_note}</p>
                    )}
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
        title={decision?.action === 'approved' ? 'Approve leave request' : 'Decline leave request'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setDecision(null)}>Cancel</button>
            <button
              className={decision?.action === 'approved' ? 'btn-primary' : 'btn-danger'}
              onClick={() => decide(decision.action)} disabled={busy}
            >
              {busy ? 'Saving…' : decision?.action === 'approved' ? 'Approve' : 'Decline'}
            </button>
          </>
        }
      >
        {decision && (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">
              <b className="text-ink">{decision.leave.student_first_name} {decision.leave.student_last_name}</b>{' '}
              · {dateLong(decision.leave.start_date)}
              {decision.leave.end_date !== decision.leave.start_date && <> to {dateLong(decision.leave.end_date)}</>}.
            </p>
            {decision.action === 'approved' && (
              <p className="flex items-start gap-2 rounded-xl bg-brand-600/8 px-3 py-2.5 text-sm text-ink">
                <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                Every school period in this range will be tagged as <b>Excused Leave</b>, and a Catch-Up Hub entry
                will be created for each missed lesson.
              </p>
            )}
            <Field label="Note for the family" hint="Optional. They will see this in their portal.">
              <textarea className="input min-h-[5rem] resize-y" value={note} onChange={(e) => setNote(e.target.value)}
                        placeholder={decision.action === 'approved' ? 'Approved. Please catch up via the hub.' : 'Please discuss with the school office first.'} />
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
