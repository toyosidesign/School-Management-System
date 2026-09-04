import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../context/ToastContext';
import { dateLong, money, statusText } from '../../lib/format';
import Icon from '../../components/Icon';
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';
import { Badge, ChipRail, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader, StatCard } from '../../components/ui';

export default function AdminFees() {
  const { toast } = useToast();
  const { data, loading, error, reload } = useFetch<any[]>('/invoices');
  const students = useFetch<any[]>('/students');
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({ student_id: '', term: 'Term 2 2026/27', description: 'Tuition, materials and lunch', amount: '', due_date: '' });

  const invoices = useMemo(() => {
    const rows = data ?? [];
    if (!filter) return rows;
    if (filter === 'overdue') return rows.filter((i) => i.status !== 'paid' && new Date(i.due_date) < new Date());
    return rows.filter((i) => i.status === filter);
  }, [data, filter]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/invoices', { ...form, student_id: Number(form.student_id), amount: Number(form.amount) });
      toast('Invoice issued and the guardians have been notified.');
      setOpen(false);
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const all = data ?? [];
  const billed = all.reduce((s, i) => s + i.amount, 0);
  const collected = all.reduce((s, i) => s + i.paid, 0);
  const overdue = all.filter((i) => i.status !== 'paid' && new Date(i.due_date) < new Date());

  return (
    <>
      <PageHeader
        icon="money" title="Fees &amp; billing" subtitle="Invoicing, payment tracking and receipts across the whole school."
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Icon name="plus" className="h-4 w-4" /> Issue invoice</button>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Billed" value={money(billed)} icon="file" />
        <StatCard label="Collected" value={money(collected)} icon="check" tone="green" />
        <StatCard label="Outstanding" value={money(billed - collected)} icon="warning" tone={billed - collected > 0 ? 'amber' : 'green'} />
        <StatCard label="Overdue invoices" value={overdue.length} icon="clock" tone={overdue.length ? 'red' : 'green'} />
      </div>

      <div className="mb-5">
        <ChipRail
          ariaLabel="Filter invoices" value={filter} onChange={setFilter}
          options={[
            { value: '', label: 'All', count: all.length },
            { value: 'unpaid', label: 'Unpaid', count: all.filter((i) => i.status === 'unpaid').length },
            { value: 'partial', label: 'Part paid', count: all.filter((i) => i.status === 'partial').length },
            { value: 'paid', label: 'Paid', count: all.filter((i) => i.status === 'paid').length },
            { value: 'overdue', label: 'Overdue', count: overdue.length },
          ]}
        />
      </div>

      {invoices.length === 0 ? (
        <EmptyState icon="money" title="No invoices match" body="Change the filter or issue a new invoice." />
      ) : (
        <>
          <div className="card hidden overflow-hidden lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-[color:var(--surface-sunken)] text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-bold">Invoice</th>
                  <th className="px-4 py-3 font-bold">Student</th>
                  <th className="px-4 py-3 font-bold">Term</th>
                  <th className="px-4 py-3 font-bold">Due</th>
                  <th className="px-4 py-3 text-right font-bold">Amount</th>
                  <th className="px-4 py-3 text-right font-bold">Paid</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoices.map((i) => {
                  const isOverdue = i.status !== 'paid' && new Date(i.due_date) < new Date();
                  return (
                    <tr key={i.id} className="hover:bg-[color:var(--surface-sunken)]">
                      <td className="px-4 py-3 font-mono text-xs text-ink">{i.invoice_no}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">{i.student_first_name} {i.student_last_name}</p>
                        <p className="text-xs text-ink-faint">{i.class_name}</p>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">{i.term}</td>
                      <td className="px-4 py-3 text-ink-soft">{dateLong(i.due_date)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-ink">{money(i.amount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{money(i.paid)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={i.status === 'paid' ? 'green' : isOverdue ? 'red' : i.status === 'partial' ? 'amber' : 'slate'}>
                          {isOverdue && i.status !== 'paid' ? 'Overdue' : statusText(i.status)}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 lg:hidden">
            {invoices.map((i) => {
              const isOverdue = i.status !== 'paid' && new Date(i.due_date) < new Date();
              return (
                <li key={i.id} className="card p-4">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-ink-faint">{i.invoice_no}</span>
                    <Badge tone={i.status === 'paid' ? 'green' : isOverdue ? 'red' : i.status === 'partial' ? 'amber' : 'slate'}>
                      {isOverdue && i.status !== 'paid' ? 'Overdue' : statusText(i.status)}
                    </Badge>
                  </div>
                  <p className="font-bold text-ink">{i.student_first_name} {i.student_last_name}</p>
                  <p className="text-xs text-ink-soft">{i.class_name} · {i.term}</p>
                  <div className="mt-2 flex items-end justify-between">
                    <span className="text-xs text-ink-faint">Due {dateLong(i.due_date)}</span>
                    <span className="text-right">
                      <span className="block text-lg font-bold tabular-nums text-ink">{money(i.amount)}</span>
                      {i.paid > 0 && <span className="block text-xs tabular-nums text-emerald-600">{money(i.paid)} paid</span>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Modal
        open={open} onClose={() => setOpen(false)} title="Issue an invoice"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="inv-form" disabled={busy || !form.student_id || !form.amount || !form.due_date}>
              {busy ? 'Issuing…' : 'Issue invoice'}
            </button>
          </>
        }
      >
        <form id="inv-form" onSubmit={create} className="space-y-4">
          <Field label="Student" required>
            <Select
              value={form.student_id}
              onChange={(v) => setForm({ ...form, student_id: v })}
              options={[{ value: "", label: `Choose a student…` }, ...(students.data ?? []).map((s: any) => ({ value: String(s.id), label: `${s.first_name} ${s.last_name} · ${s.class_name}` }))]}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Term" required>
              <input className="input" required value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} />
            </Field>
            <Field label="Due date" required>
              <DatePicker
                value={form.due_date}
                onChange={(v) => setForm({ ...form, due_date: v })}
              />
            </Field>
          </div>
          <Field label="Description">
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Amount" required>
            <input type="number" className="input tabular-nums" min="0.01" step="0.01" required value={form.amount}
                   onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
        </form>
      </Modal>
    </>
  );
}
