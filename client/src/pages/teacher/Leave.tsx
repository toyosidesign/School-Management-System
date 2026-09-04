import { useState } from 'react';
import { api } from '../../lib/api';
import { LEAVE_CATEGORIES } from '../parent/Leave';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../context/ToastContext';
import { dateLong, relative, statusText } from '../../lib/format';
import Icon from '../../components/Icon';
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';
import { Badge, ChipRail, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader } from '../../components/ui';

export default function TeacherLeave() {
  const { toast } = useToast();
  const { data, loading, error, reload } = useFetch<any[]>('/leave');
  const [filter, setFilter] = useState('pending');
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const students = useFetch<any[]>('/students');
  const [form, setForm] = useState({
    student_id: '', start_date: '', end_date: '', reason: '', category: 'illness',
  });

  const report = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/leave', { ...form, student_id: Number(form.student_id) });
      toast('Sent to the head of school for a decision.');
      setReporting(false);
      setForm({ student_id: '', start_date: '', end_date: '', reason: '', category: 'illness' });
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const rows = (data ?? []).filter((l) => (filter === 'all' ? true : l.status === filter));
  const counts = (status: string) => (data ?? []).filter((l) => l.status === status).length;


  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        icon="leave" title="Leave requests"
        subtitle="Leave requested for pupils you teach. The head of school decides on each one; you will see the outcome here."
        actions={
          <button className="btn-primary" onClick={() => setReporting(true)}>
            <Icon name="plus" className="h-4 w-4" /> New leave request
          </button>
        }
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
                    <Badge tone="amber" icon="clock">With the head of school</Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={reporting} onClose={() => setReporting(false)} title="New leave request"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setReporting(false)}>Cancel</button>
            <button className="btn-primary" form="report-form" disabled={busy || !form.student_id || !form.start_date || !form.reason.trim()}>
              {busy ? 'Sending...' : 'Send for approval'}
            </button>
          </>
        }
      >
        <form id="report-form" onSubmit={report} className="space-y-4">
          <p className="rounded-xl bg-brand-600/8 px-3 py-2.5 text-sm text-ink">
            This goes to the head of school for a decision. Nothing is marked on the register until they approve it.
          </p>

          <Field label="Pupil" required>
            <Select
              value={form.student_id}
              onChange={(v) => setForm({ ...form, student_id: v })}
              options={[{ value: "", label: `Choose a pupil...` }, ...(students.data ?? []).map((s: any) => ({ value: String(s.id), label: `${s.first_name} ${s.last_name} · ${s.class_name}` }))]}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First day away" required>
              <DatePicker
                value={form.start_date}
                onChange={(v) => setForm({ ...form, start_date: v, end_date: form.end_date || v })}
              />
            </Field>
            <Field label="Last day away" required>
              <DatePicker min={form.start_date}
                value={form.end_date}
                onChange={(v) => setForm({ ...form, end_date: v })}
              />
            </Field>
          </div>

          <Field label="Reason type">
            <Select
              value={form.category}
              onChange={(v) => setForm({ ...form, category: v })}
              options={LEAVE_CATEGORIES.map((c: any) => ({ value: String(c.value), label: `${c.label}` }))}
            />
          </Field>

          <Field label="What were you told?" required hint="Whatever the family passed on is enough.">
            <textarea className="input min-h-[6rem] resize-y" required value={form.reason}
                      onChange={(e) => setForm({ ...form, reason: e.target.value })}
                      placeholder="For example: mother called to say he has a hospital appointment on Tuesday." />
          </Field>
        </form>
      </Modal>
    </>
  );
}
