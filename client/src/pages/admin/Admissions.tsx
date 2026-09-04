import { useState } from 'react';
import { api, qs } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../context/ToastContext';
import { dateLong, relative } from '../../lib/format';
import Icon from '../../components/Icon';
import Select from '../../components/Select';
import { Badge, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader } from '../../components/ui';

const PIPELINE = [
  { value: 'new', label: 'New', tone: 'amber' },
  { value: 'contacted', label: 'Contacted', tone: 'brand' },
  { value: 'offer_made', label: 'Offer made', tone: 'violet' },
  { value: 'enrolled', label: 'Enrolled', tone: 'green' },
  { value: 'closed', label: 'Closed', tone: 'slate' },
];

/** Everything submitted from the public website, in one reviewable pipeline. */
export default function AdminAdmissions() {
  const { toast } = useToast();
  const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useFetch<any[]>(`/website/admissions${qs({ status })}`, [status]);
  const all = useFetch<any[]>('/website/admissions');
  const [open, setOpen] = useState<any>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const count = (s: string) => (all.data ?? []).filter((e) => e.status === s).length;

  const update = async (id: number, patch: any) => {
    setBusy(true);
    try {
      await api.patch(`/website/admissions/${id}`, patch);
      await Promise.all([reload(), all.reload()]);
      setOpen(null);
      toast('Enquiry updated.');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Opening one is what marks it read. Not the stage it sits at: an enquiry can
   * be read the morning it lands and still be at the new stage that afternoon.
   */
  const openEnquiry = async (enquiry: any) => {
    setOpen(enquiry);
    setNote(enquiry.internal_note ?? '');
    if (enquiry.read_at) return;
    try {
      await api.post(`/website/admissions/${enquiry.id}/read`, {});
      reload();
      all.reload();
    } catch {
      /* Reading is not a decision: if it does not stick, nothing is lost. */
    }
  };

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const rows = data ?? [];

  return (
    <>
      <PageHeader
        icon="slip" title="Admissions inbox"
        subtitle="Applications and enquiries submitted through your public website."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="w-full sm:w-64">
          <Select
            ariaLabel="Filter by stage" value={status} onChange={setStatus}
            options={[
              { value: '', label: 'Everything', hint: `${(all.data ?? []).length} in the inbox` },
              ...PIPELINE.map((p) => ({ value: p.value, label: p.label, hint: `${count(p.value)} here` })),
            ]}
          />
        </span>
        <span className="text-xs text-ink-faint">
          {(all.data ?? []).filter((e: any) => !e.read_at).length} unread · {rows.length} shown
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="slip" title="Nothing here yet"
          body="Applications and enquiries from your website land in this inbox, and every administrator gets a notification."
        />
      ) : (
        /* An inbox, read the way an inbox is read: one line each, the unopened
           ones in bold, the whole thing opened by clicking the line. */
        <div className="card divide-y divide-line overflow-hidden">
          {rows.map((e) => {
            const stage = PIPELINE.find((p) => p.value === e.status);
            const unread = !e.read_at;
            return (
              <button
                key={e.id}
                onClick={() => openEnquiry(e)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[color:var(--surface-sunken)] ${
                  unread ? '' : 'text-ink-soft'
                }`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-brand-600' : 'bg-transparent'}`}
                      aria-hidden />

                <span className={`w-44 shrink-0 truncate text-sm ${unread ? 'font-bold text-ink' : 'text-ink-soft'}`}>
                  {e.parent_name}
                </span>

                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className={unread ? 'font-semibold text-ink' : 'text-ink'}>
                    {e.kind === 'application' ? 'Application' : e.kind === 'tour' ? 'Tour request' : 'Enquiry'}
                    {e.child_name ? ` · ${e.child_name}` : ''}
                  </span>
                  {e.message && <span className="text-ink-faint"> — {e.message}</span>}
                </span>

                <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                  {e.sen_notes && <Badge tone="amber" icon="accessibility">Support</Badge>}
                  {e.section && <Badge tone="slate">{e.section}</Badge>}
                  {/* "New" is what the dot and the bold already say, so it is
                      not repeated as a tag — and once read, an enquiry that has
                      not moved along the pipeline is simply not tagged at all. */}
                  {e.status !== 'new' && (
                    <Badge tone={stage?.tone ?? 'slate'}>{stage?.label ?? e.status}</Badge>
                  )}
                </span>

                <span className="w-24 shrink-0 text-right text-xs text-ink-faint">{relative(e.created_at)}</span>
              </button>
            );
          })}
        </div>
      )}

      <Modal
        open={!!open} onClose={() => setOpen(null)} wide title={open?.parent_name ?? ''}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(null)}>Cancel</button>
            {/* The stage is not touched from here: reading an enquiry and
                moving it along the pipeline are different acts. */}
            <button className="btn-primary" disabled={busy} onClick={() => update(open.id, { internal_note: note })}>
              {busy ? 'Saving...' : 'Save'}
            </button>
          </>
        }
      >
        {open && (
          <div className="space-y-4">
            <div className="rounded-xl border border-line p-3.5">
              <p className="text-sm text-ink-soft">
                <a className="font-semibold text-ink hover:underline" href={`mailto:${open.email}`}>{open.email}</a>
                {open.phone && <> · <a className="hover:underline" href={`tel:${open.phone}`}>{open.phone}</a></>}
              </p>
              {open.child_name && (
                <p className="mt-1 text-sm text-ink-soft">
                  About {open.child_name}{open.child_dob ? `, born ${dateLong(open.child_dob)}` : ''}
                  {open.entry_year ? ` · entry ${open.entry_year}` : ''}
                </p>
              )}
              {open.message && <p className="mt-2 whitespace-pre-line text-sm text-ink">{open.message}</p>}
              {open.sen_notes && (
                <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-ink">
                  <b>Support needs:</b> {open.sen_notes}
                </p>
              )}
              <p className="mt-2 text-xs text-ink-faint">
                {relative(open.created_at)} · from {open.source_page ?? 'the website'}
                {open.how_heard ? ` · heard via ${open.how_heard}` : ''}
              </p>
            </div>

            <Field label="Internal note" hint="Only staff see this. The family never does.">
              <textarea className="input min-h-[6rem] resize-y" value={note} onChange={(e) => setNote(e.target.value)}
                        placeholder="e.g. Visited 12 Sept, offer to follow once the SENCO has reviewed." />
            </Field>

            <a className="btn-ghost w-full" href={`mailto:${open.email}?subject=${encodeURIComponent('Your enquiry')}`}>
              <Icon name="message" className="h-4 w-4" /> Reply by email
            </a>
          </div>
        )}
      </Modal>
    </>
  );
}
