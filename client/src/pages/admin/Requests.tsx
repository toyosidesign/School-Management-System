import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../context/ToastContext';
import { dateLong } from '../../lib/format';
import Icon from '../../components/Icon';
import Select from '../../components/Select';
import { Badge, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader } from '../../components/ui';

/** How many of a kind are still unanswered, said rather than counted in a badge. */
const waitingHint = (n?: number) => (n ? `${n} waiting` : 'None waiting');

const TONE: Record<string, any> = {
  pupil_leave: 'brand', staff_leave: 'violet', admission: 'green',
};

/**
 * Everything waiting on a decision, in one place.
 *
 * A school's answers are asked for through different doors — a parent reports
 * an absence, a teacher books leave, a family applies — and each has had its
 * own page, so "what is waiting on me?" was three pages and a memory. Deciding
 * still goes through the route that owns each kind: this is one queue, not a
 * second way to approve things.
 */
export default function AdminRequests() {
  const { toast } = useToast();
  const [status, setStatus] = useState('pending');
  const { data, loading, error, reload } = useFetch<any>(`/requests?status=${status}`, [status]);
  const [kind, setKind] = useState('');
  const [open, setOpen] = useState<any>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const all = data?.requests ?? [];
    return kind ? all.filter((r: any) => r.kind === kind) : all;
  }, [data, kind]);

  const counts = data?.counts ?? {};

  /** Yes or no, sent to whichever route owns this kind of request. */
  const decide = async (request: any, approved: boolean) => {
    setBusy(true);
    try {
      await api.post(request.decide_path.replace('/api', ''), {
        status: approved ? 'approved' : 'rejected',
        review_note: note || null,
      });
      toast(`${request.who}: ${approved ? 'approved' : 'refused'}.`);
      setOpen(null);
      setNote('');
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        icon="slip" title="Requests"
        subtitle="Everything waiting on an answer: pupils out of school, leave booked by staff, and families getting in touch. Answering one here is the same as answering it on its own page."
      />

      <div className="mb-5 grid gap-3 sm:max-w-xl sm:grid-cols-2">
        <Select
          ariaLabel="Filter by kind" value={kind} onChange={setKind}
          options={[
            { value: '', label: 'Every kind', hint: `${(data?.requests ?? []).length} in view` },
            { value: 'pupil_leave', label: 'Pupil absence', hint: waitingHint(counts.pupil_leave) },
            { value: 'staff_leave', label: 'Staff leave', hint: waitingHint(counts.staff_leave) },
            { value: 'admission', label: 'Admissions', hint: waitingHint(counts.admission) },
          ]}
        />
        <Select
          ariaLabel="Filter by status" value={status} onChange={setStatus}
          options={[
            { value: 'pending', label: 'Waiting on us' },
            { value: 'all', label: 'Everything, decided or not' },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="check" title="Nothing is waiting"
          body={status === 'pending'
            ? 'Every request has been answered. New ones arrive here as they are made.'
            : 'Nothing has been requested yet.'}
        />
      ) : (
        <>
          {/* A queue is read down a column: what kind, who, when, why. Cards put
              each row's answer in a different place on the page. */}
          <div className="card hidden overflow-hidden lg:block">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[13%]" />
                <col className="w-[22%]" />
                <col className="w-[17%]" />
                <col className="w-[26%]" />
                <col className="w-[22%]" />
              </colgroup>
              <thead className="border-b border-line bg-[color:var(--surface-sunken)] text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-bold">Kind</th>
                  <th className="px-4 py-3 font-bold">Who</th>
                  <th className="px-4 py-3 font-bold">When</th>
                  <th className="px-4 py-3 font-bold">Why</th>
                  <th className="px-4 py-3 text-right font-bold">Answer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((request: any) => (
                  <tr key={`${request.kind}-${request.id}`} className="align-top">
                    <td className="px-4 py-3">
                      <Badge tone={TONE[request.kind] ?? 'slate'}>{request.kind_label}</Badge>
                      {request.status !== 'pending' && (
                        <span className="mt-1 block">
                          <Badge tone={request.status === 'approved' ? 'green' : 'red'}>{request.status}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block truncate font-semibold text-ink">{request.who}</span>
                      {request.who_detail && (
                        <span className="block truncate text-xs text-ink-faint">{request.who_detail}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {request.starts_on ? (
                        <>
                          <span className="block">{dateLong(request.starts_on)}</span>
                          {request.ends_on && request.ends_on !== request.starts_on && (
                            <span className="block text-xs text-ink-faint">to {dateLong(request.ends_on)}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-ink-faint">{dateLong(request.asked_at)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block text-ink-soft">{request.summary ?? '—'}</span>
                      <span className="block text-xs text-ink-faint">
                        {request.category}
                        {request.asked_by && ` · asked by ${request.asked_by}`}
                        {request.reviewer && ` · answered by ${request.reviewer}`}
                      </span>
                      {request.review_note && (
                        <span className="block text-xs text-ink-soft">“{request.review_note}”</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap items-center justify-end gap-1.5">
                        {request.decide_path && request.status === 'pending' && (
                          <>
                            {/* Plain text: a filled button in every row of a
                                queue reads as eleven things demanding to be
                                pressed at once. */}
                            <button
                              className="inline-flex items-center gap-1 px-1 text-sm font-semibold text-ink-soft transition-colors hover:text-red-700 disabled:opacity-50"
                              disabled={busy}
                              onClick={() => { setNote(''); setOpen({ request, approved: false }); }}>
                              <Icon name="x" className="h-3.5 w-3.5" /> Refuse
                            </button>
                            <button
                              className="inline-flex items-center gap-1 px-1 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-800 disabled:opacity-50"
                              disabled={busy}
                              onClick={() => { setNote(''); setOpen({ request, approved: true }); }}>
                              <Icon name="check" className="h-3.5 w-3.5" /> Approve
                            </button>
                          </>
                        )}
                        {request.link && (
                          <Link to={request.link}
                                className="inline-flex items-center px-1 text-ink-faint transition-colors hover:text-ink"
                                title="Open the page this came from" aria-label={`View ${request.who} in full`}>
                            <Icon name="chevronRight" className="h-4 w-4" />
                          </Link>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 lg:hidden">
            {rows.map((request: any) => (
              <li key={`${request.kind}-${request.id}`} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TONE[request.kind] ?? 'slate'}>{request.kind_label}</Badge>
                  {request.status !== 'pending' && (
                    <Badge tone={request.status === 'approved' ? 'green' : 'red'}>{request.status}</Badge>
                  )}
                </div>
                <p className="mt-1.5 font-bold text-ink">{request.who}</p>
                {request.who_detail && <p className="text-xs text-ink-soft">{request.who_detail}</p>}
                {request.starts_on && (
                  <p className="mt-1 text-sm text-ink-soft">
                    {dateLong(request.starts_on)}
                    {request.ends_on && request.ends_on !== request.starts_on && ` to ${dateLong(request.ends_on)}`}
                  </p>
                )}
                {request.summary && <p className="mt-1.5 text-sm text-ink-soft">{request.summary}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {request.decide_path && request.status === 'pending' && (
                    <>
                      <button
                        className="inline-flex items-center gap-1 px-1 text-sm font-semibold text-ink-soft transition-colors hover:text-red-700"
                        disabled={busy}
                        onClick={() => { setNote(''); setOpen({ request, approved: false }); }}>
                        <Icon name="x" className="h-3.5 w-3.5" /> Refuse
                      </button>
                      <button
                        className="inline-flex items-center gap-1 px-1 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-800"
                        disabled={busy}
                        onClick={() => { setNote(''); setOpen({ request, approved: true }); }}>
                        <Icon name="check" className="h-3.5 w-3.5" /> Approve
                      </button>
                    </>
                  )}
                  {request.link && (
                    <Link to={request.link}
                          className="ml-auto inline-flex items-center gap-1 px-1 text-sm font-semibold text-ink-soft transition-colors hover:text-ink">
                      View in full <Icon name="chevronRight" className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal
        open={!!open} onClose={() => setOpen(null)}
        title={open ? `${open.approved ? 'Approve' : 'Refuse'}: ${open.request.who}` : ''}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(null)}>Cancel</button>
            <button className="btn-primary" disabled={busy}
                    onClick={() => decide(open.request, open.approved)}>
              {busy ? 'Saving...' : open?.approved ? 'Approve it' : 'Refuse it'}
            </button>
          </>
        }
      >
        {open && (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">
              {open.request.kind === 'pupil_leave'
                ? 'Approving marks every affected period as excused leave and opens a catch-up entry for each missed lesson.'
                : 'Approving draws the days down from their allowance for the leave year.'}
            </p>
            <Field label="A note, if it helps" hint="Kept with the decision, and seen by whoever asked.">
              <textarea className="input min-h-[5rem] resize-y" value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={open.approved ? 'Approved.' : 'Why this was refused.'} />
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
