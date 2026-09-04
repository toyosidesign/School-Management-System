import { useState } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../context/ToastContext';
import { dateLong, relative, statusText } from '../../lib/format';
import Icon from '../../components/Icon';
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';
import { Badge, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader, ProgressBar, StatCard, Toggle } from '../../components/ui';

export const LEAVE_TYPES = [
  { value: 'annual', label: 'Annual leave', hint: 'Comes out of your entitlement' },
  { value: 'sick', label: 'Sick leave', hint: 'Recorded, not deducted' },
  { value: 'compassionate', label: 'Compassionate', hint: 'Recorded, not deducted' },
  { value: 'training', label: 'Training or CPD', hint: 'Recorded, not deducted' },
  { value: 'parental', label: 'Parental', hint: 'Recorded, not deducted' },
  { value: 'unpaid', label: 'Unpaid', hint: 'Recorded, not deducted' },
];

/** Working days between two dates, matching how the server counts them. */
function workingDays(start: string, end: string) {
  if (!start || !end || end < start) return 0;
  let days = 0;
  for (const d = new Date(`${start}T00:00:00`); d <= new Date(`${end}T00:00:00`); d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days += 1;
  }
  return days;
}

/**
 * A member of staff's own leave: what they are entitled to, what they have
 * used, and what is still to be decided.
 */
export default function MyLeave() {
  const { toast } = useToast();
  const balance = useFetch<any>('/staff-leave/balance');
  const requests = useFetch<any[]>('/staff-leave');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    leave_type: 'annual', start_date: '', end_date: '', reason: '', cover_notes: '', half_day: false,
  });

  const requested = form.half_day && form.start_date === form.end_date
    ? 0.5 : workingDays(form.start_date, form.end_date);
  const wouldExceed = form.leave_type === 'annual' && balance.data && requested > balance.data.remaining;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/staff-leave', form);
      toast('Sent to the head of school for approval.');
      setOpen(false);
      setForm({ leave_type: 'annual', start_date: '', end_date: '', reason: '', cover_notes: '', half_day: false });
      balance.reload();
      requests.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: number) => {
    try {
      await api.post(`/staff-leave/${id}/cancel`, {});
      toast('Request withdrawn.');
      balance.reload();
      requests.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  if (balance.loading || requests.loading) return <Loading rows={3} />;
  if (balance.error) return <ErrorNote error={balance.error} onRetry={balance.reload} />;

  const b = balance.data;
  const rows = requests.data ?? [];

  return (
    <>
      <PageHeader
        icon="leave" title="My leave"
        subtitle={`Leave year ${b.leave_year}. Requests go to the head of school for approval.`}
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Icon name="plus" className="h-4 w-4" /> Request leave
          </button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Days remaining" value={b.remaining} hint={`of ${b.entitlement} entitlement`}
                  icon="leave" tone={b.remaining > 5 ? 'green' : b.remaining > 0 ? 'amber' : 'red'} />
        <StatCard label="Taken" value={b.taken} hint="approved annual leave" icon="check" />
        <StatCard label="Awaiting approval" value={b.booked} hint="annual leave requested" icon="clock"
                  tone={b.booked ? 'amber' : 'green'} />
        <StatCard label="Sick days" value={b.sick_days} hint="recorded, not deducted" icon="heart" tone="violet" />
      </div>

      <div className="card mb-5 p-4">
        <ProgressBar
          value={b.taken + b.booked} max={b.entitlement}
          label={`${b.taken} taken, ${b.booked} pending, ${b.remaining} left`}
          tone={b.remaining > 5 ? 'green' : b.remaining > 0 ? 'amber' : 'red'}
        />
        {b.other_days > 0 && (
          <p className="mt-3 text-xs text-ink-soft">
            Plus {b.other_days} day{b.other_days === 1 ? '' : 's'} of training, compassionate or parental leave,
            which does not come out of your entitlement.
          </p>
        )}
      </div>

      <h2 className="mb-3 font-display text-lg font-bold text-ink">Your requests</h2>

      {rows.length === 0 ? (
        <EmptyState icon="leave" title="No leave booked yet"
                    body="Request time off and it goes to the head of school for approval."
                    action={<button className="btn-primary" onClick={() => setOpen(true)}>Request leave</button>} />
      ) : (
        <ul className="space-y-3">
          {rows.map((l) => {
            const tone = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'slate' }[l.status];
            const type = LEAVE_TYPES.find((t) => t.value === l.leave_type);
            return (
              <li key={l.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Badge tone={tone}>{statusText(l.status)}</Badge>
                      <Badge tone="slate">{type?.label ?? l.leave_type}</Badge>
                      <Badge tone="brand">{l.working_days} day{l.working_days === 1 ? '' : 's'}</Badge>
                    </div>
                    <p className="font-semibold text-ink">
                      {dateLong(l.start_date)}
                      {l.end_date !== l.start_date && <> to {dateLong(l.end_date)}</>}
                    </p>
                    {l.reason && <p className="mt-1 text-sm text-ink-soft">{l.reason}</p>}
                    {l.cover_notes && <p className="mt-1 text-xs text-ink-faint">Cover: {l.cover_notes}</p>}
                    {l.review_note && (
                      <p className="mt-2 rounded-lg bg-[color:var(--surface-sunken)] px-3 py-2 text-sm text-ink-soft">
                        <b className="text-ink">{l.reviewer ?? 'Head of school'}:</b> {l.review_note}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-xs text-ink-faint">Requested {relative(l.created_at)}</span>
                    {l.status === 'pending' && (
                      <button className="btn-ghost !py-1.5 !text-xs" onClick={() => cancel(l.id)}>
                        Withdraw
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={open} onClose={() => setOpen(false)} title="Request leave"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="leave-form" disabled={busy || !form.start_date || !requested}>
              {busy ? 'Sending...' : `Request ${requested} day${requested === 1 ? '' : 's'}`}
            </button>
          </>
        }
      >
        <form id="leave-form" onSubmit={submit} className="space-y-4">
          <Field label="Type of leave">
            <Select
              value={form.leave_type}
              onChange={(v) => setForm({ ...form, leave_type: v })}
              options={LEAVE_TYPES.map((t: any) => ({ value: String(t.value), label: `${t.label}` }))}
            />
            <span className="mt-1 block text-xs text-ink-faint">
              {LEAVE_TYPES.find((t) => t.value === form.leave_type)?.hint}
            </span>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First day" required>
              <DatePicker
                value={form.start_date}
                onChange={(v) => setForm({ ...form, start_date: v, end_date: form.end_date || v })}
              />
            </Field>
            <Field label="Last day" required>
              <DatePicker min={form.start_date}
                value={form.end_date}
                onChange={(v) => setForm({ ...form, end_date: v })}
              />
            </Field>
          </div>

          {form.start_date && form.start_date === form.end_date && (
            <Toggle checked={form.half_day} onChange={(v) => setForm({ ...form, half_day: v })}
                    label="Half day only" hint="Counts as 0.5 against your entitlement" />
          )}

          {requested > 0 && (
            <p className={`rounded-xl px-3 py-2.5 text-sm ${
              wouldExceed ? 'bg-amber-50 text-amber-900' : 'bg-brand-600/8 text-ink'
            }`}>
              {wouldExceed ? (
                <>
                  <Icon name="warning" className="mr-1.5 inline h-4 w-4" />
                  That is {requested} days against {b.remaining} remaining. You can still ask, but the head of
                  school will need to agree to go over.
                </>
              ) : (
                <>
                  <Icon name="info" className="mr-1.5 inline h-4 w-4 text-brand-600" />
                  {requested} working day{requested === 1 ? '' : 's'}
                  {form.leave_type === 'annual' && <>, leaving {Math.round((b.remaining - requested) * 10) / 10}</>}
                </>
              )}
            </p>
          )}

          <Field label="Reason" hint="Optional for annual leave.">
            <textarea className="input min-h-[5rem] resize-y" value={form.reason}
                      onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Field>

          <Field label="Cover arrangements" hint="Who is taking your classes, if you have arranged it already.">
            <input className="input" value={form.cover_notes}
                   onChange={(e) => setForm({ ...form, cover_notes: e.target.value })}
                   placeholder="e.g. Ms Whitfield is covering Tuesday and Wednesday" />
          </Field>
        </form>
      </Modal>
    </>
  );
}
