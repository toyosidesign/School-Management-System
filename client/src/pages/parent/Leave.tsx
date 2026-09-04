import { useState } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { dateLong, relative, statusText } from '../../lib/format';
import Icon from '../../components/Icon';
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';
import { Badge, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader } from '../../components/ui';

export const LEAVE_CATEGORIES = [
  { value: 'illness', label: 'Illness', icon: 'heart' },
  { value: 'medical', label: 'Medical appointment', icon: 'shield' },
  { value: 'family', label: 'Family reason', icon: 'users' },
  { value: 'religious', label: 'Religious observance', icon: 'star' },
  { value: 'other', label: 'Something else', icon: 'info' },
];

/**
 * Guardians report and request absence for their own children.
 *
 * A pupil cannot file this: excusing a child from school is a decision for the
 * adults responsible for them, and the register is a legal record.
 */
export default function ParentLeave() {
  const { user, activeChild } = useAuth();
  const { toast } = useToast();
  const { data, loading, error, reload } = useFetch<any[]>('/leave');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    student_id: activeChild?.id, start_date: '', end_date: '', reason: '', category: 'illness',
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/leave', { ...form, student_id: form.student_id ?? activeChild?.id });
      toast('Sent to the class teacher. You will get a notification when it is reviewed.');
      setOpen(false);
      setForm({ student_id: activeChild?.id, start_date: '', end_date: '', reason: '', category: 'illness' });
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!activeChild) return <EmptyState icon="users" title="No child linked to your account" />;
  if (loading) return <Loading rows={2} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const rows = data ?? [];

  return (
    <>
      <PageHeader
        icon="leave"
        title="Leave requests"
        subtitle="Tell the class teacher in advance. Approved days are tagged as Excused Leave, and the lessons missed appear in your child's Catch-Up Hub automatically."
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Icon name="plus" className="h-4 w-4" /> New request
          </button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon="leave" title="No leave requests yet"
          body="Use the button above to report an absence or ask for time off."
          action={<button className="btn-primary" onClick={() => setOpen(true)}>New request</button>}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((l: any) => {
            const tone = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'slate' }[l.status];
            return (
              <li key={l.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Badge tone={tone}>{statusText(l.status)}</Badge>
                      <Badge tone="slate">
                        {LEAVE_CATEGORIES.find((c) => c.value === l.category)?.label ?? l.category}
                      </Badge>
                      {l.student_first_name && <span className="text-xs font-semibold text-ink-soft">{l.student_first_name}</span>}
                    </div>
                    <p className="font-semibold text-ink">
                      {dateLong(l.start_date)}
                      {l.end_date !== l.start_date && <> to {dateLong(l.end_date)}</>}
                    </p>
                    <p className="mt-1 text-sm text-ink-soft">{l.reason}</p>
                    {l.review_note && (
                      <p className="mt-2 rounded-lg bg-[color:var(--surface-sunken)] px-3 py-2 text-sm text-ink-soft">
                        <b className="text-ink">{l.reviewer ?? 'Teacher'}:</b> {l.review_note}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-ink-faint">Sent {relative(l.created_at)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={open} onClose={() => setOpen(false)} title="New leave request"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="leave-form" disabled={busy || !form.start_date || !form.reason.trim()}>
              {busy ? 'Sending...' : 'Send request'}
            </button>
          </>
        }
      >
        <form id="leave-form" onSubmit={submit} className="space-y-4">
          {(user.children?.length ?? 0) > 1 && (
            <Field label="Which child?" required>
              <Select
                value={form.student_id ?? ''}
                onChange={(v) => setForm({ ...form, student_id: Number(v) })}
                options={user.children.map((c: any) => ({ value: String(c.id), label: `${c.first_name} ${c.last_name} · ${c.class_name}` }))}
              />
            </Field>
          )}

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

          <fieldset>
            <legend className="label">Reason</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {LEAVE_CATEGORIES.map((c) => (
                <button
                  key={c.value} type="button" role="radio" aria-checked={form.category === c.value}
                  onClick={() => setForm({ ...form, category: c.value })}
                  className={`rounded-xl border-2 p-2.5 text-center transition ${
                    form.category === c.value ? 'border-brand-600 bg-brand-600/8' : 'border-line hover:border-brand-300'
                  }`}
                  data-tap
                >
                  <Icon name={c.icon} className="mx-auto h-4 w-4 text-brand-600" />
                  <span className="mt-1 block text-[11px] font-semibold leading-tight text-ink">{c.label}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <Field label="Tell the teacher a bit more" required hint="A sentence is enough.">
            <textarea
              className="input min-h-[6rem] resize-y" required value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="For example: hospital appointment on the Tuesday morning."
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
