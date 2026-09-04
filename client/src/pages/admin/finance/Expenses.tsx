import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../lib/api';
import { useFetch } from '../../../lib/useFetch';
import { useToast } from '../../../context/ToastContext';
import { useBranding } from '../../../context/BrandingContext';
import { dateLong, money, statusText } from '../../../lib/format';
import Icon from '../../../components/Icon';
import DatePicker from '../../../components/DatePicker';
import Select from '../../../components/Select';
import { Badge, ChipRail, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader, StatCard } from '../../../components/ui';

const STATUS_TONE: Record<string, string> = { draft: 'amber', approved: 'brand', paid: 'green', rejected: 'slate' };

/** What the school spends, from a bill arriving to the money leaving the bank. */
export default function FinanceExpenses() {
  const { toast } = useToast();
  const { branding } = useBranding();
  const { data, loading, error, reload } = useFetch<any[]>('/finance/expenses');
  const accounts = useFetch<any[]>('/finance/accounts');
  const suppliers = useFetch<any[]>('/finance/suppliers');

  const [filter, setFilter] = useState('draft');
  const [open, setOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({
    description: '', amount: '', account_id: '', supplier_id: '', spent_on: new Date().toISOString().slice(0, 10), note: '',
  });
  const [supplier, setSupplier] = useState<any>({ name: '', contact: '', email: '', phone: '' });

  const cur = branding.currency ?? 'USD';
  const rows = (data ?? []).filter((e) => (filter === 'all' ? true : e.status === filter));
  const count = (status: string) => (data ?? []).filter((e) => e.status === status).length;
  const total = (status: string) =>
    (data ?? []).filter((e) => e.status === status).reduce((s, e) => s + e.amount, 0);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/finance/expenses', {
        ...form,
        amount: Number(form.amount),
        account_id: Number(form.account_id),
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
      });
      toast('Recorded, and waiting for approval.');
      setOpen(false);
      setForm({ ...form, description: '', amount: '', note: '' });
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (expense: any, status: string) => {
    try {
      await api.post(`/finance/expenses/${expense.id}/decision`, { status });
      toast(status === 'rejected' ? 'Rejected.' : 'Approved, ready to pay.');
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const pay = async (expense: any) => {
    try {
      const out = await api.post(`/finance/expenses/${expense.id}/pay`, {});
      toast(`Paid, and posted as ${out.journal.reference}.`);
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const addSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const made = await api.post('/finance/suppliers', supplier);
      toast(`${made.name} added.`);
      setSupplierOpen(false);
      setSupplier({ name: '', contact: '', email: '', phone: '' });
      suppliers.reload();
      setForm({ ...form, supplier_id: String(made.id) });
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        icon="money" title="Expenditure"
        subtitle="Bills and running costs. Paying one posts it to the ledger against the account it belongs to."
        actions={
          <>
            <Link to="/admin/finance" className="btn-ghost">Back to finance</Link>
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Icon name="plus" className="h-4 w-4" /> Record an expense
            </button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Awaiting approval" value={count('draft')} icon="clock"
                  tone={count('draft') ? 'amber' : 'green'} hint={money(total('draft'), cur)}
                  onClick={() => setFilter('draft')} />
        <StatCard label="Approved, unpaid" value={count('approved')} icon="slip"
                  tone={count('approved') ? 'brand' : 'slate'} hint={money(total('approved'), cur)}
                  onClick={() => setFilter('approved')} />
        <StatCard label="Paid" value={count('paid')} icon="check" tone="green"
                  hint={money(total('paid'), cur)} onClick={() => setFilter('paid')} />
        <StatCard label="Suppliers" value={(suppliers.data ?? []).length} icon="users" tone="violet"
                  onClick={() => setSupplierOpen(true)} />
      </div>

      <div className="mb-5">
        <ChipRail
          ariaLabel="Filter expenditure" value={filter} onChange={setFilter}
          options={[
            { value: 'draft', label: 'To approve', count: count('draft') },
            { value: 'approved', label: 'To pay', count: count('approved') },
            { value: 'paid', label: 'Paid', count: count('paid') },
            { value: 'all', label: 'All', count: (data ?? []).length },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="money" title="Nothing here" body="Record a bill and it appears for approval." />
      ) : (
        <ul className="space-y-3">
          {rows.map((e) => (
            <li key={e.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-ink">{e.description}</p>
                  <p className="text-xs text-ink-soft">
                    <span className="font-mono">{e.reference}</span> · {dateLong(e.spent_on)}
                    {e.supplier && ` · ${e.supplier}`}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[e.status]}>{statusText(e.status)}</Badge>
                    <Badge tone="slate">{e.account_code} {e.account}</Badge>
                    {e.journal_reference && <Badge tone="violet">{e.journal_reference}</Badge>}
                  </div>
                  {e.note && <p className="mt-2 text-xs text-ink-faint">{e.note}</p>}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <b className="text-lg tabular-nums text-ink">{money(e.amount, cur)}</b>
                  {e.status === 'draft' && (
                    <span className="flex gap-2">
                      <button className="btn-ghost btn-sm" onClick={() => decide(e, 'rejected')}>Reject</button>
                      <button className="btn-primary btn-sm" onClick={() => decide(e, 'approved')}>Approve</button>
                    </span>
                  )}
                  {e.status === 'approved' && (
                    <button className="btn-primary btn-sm" onClick={() => pay(e)}>
                      <Icon name="money" className="h-3.5 w-3.5" /> Pay
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open} onClose={() => setOpen(false)} title="Record an expense" wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="expense-form"
                    disabled={busy || !form.description || !form.amount || !form.account_id}>
              {busy ? 'Saving...' : 'Record it'}
            </button>
          </>
        }
      >
        <form id="expense-form" onSubmit={create} className="space-y-4">
          <Field label="What was it for" required>
            <input className="input" required value={form.description} placeholder="Electricity, second term"
                   onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Amount" required>
              <input className="input text-right" required inputMode="decimal" value={form.amount}
                     onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Date" required>
              <DatePicker
                value={form.spent_on}
                onChange={(v) => setForm({ ...form, spent_on: v })}
              />
            </Field>
            <Field label="Supplier">
              <Select
                value={form.supplier_id}
                onChange={(v) => setForm({ ...form, supplier_id: v })}
                options={[{ value: "", label: `None` }, ...(suppliers.data ?? []).filter((s: any) => s.is_active).map((s: any) => ({ value: String(s.id), label: `${s.name}` }))]}
              />
            </Field>
          </div>
          <Field label="Expense account" required hint="Which line of the accounts this belongs to.">
            <Select
              value={form.account_id}
              onChange={(v) => setForm({ ...form, account_id: v })}
              options={[{ value: "", label: `Choose an account` }, ...(accounts.data ?? []).filter((a: any) => a.type === 'expense').map((a: any) => ({ value: String(a.id), label: `${a.code} ${a.name}` }))]}
            />
          </Field>
          <Field label="Note">
            <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
          <p className="text-xs text-ink-faint">
            Nothing reaches the ledger until it is approved and paid.
          </p>
        </form>
      </Modal>

      <Modal
        open={supplierOpen} onClose={() => setSupplierOpen(false)} title="Suppliers" wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setSupplierOpen(false)}>Close</button>
            <button className="btn-primary" form="supplier-form" disabled={busy || !supplier.name}>
              {busy ? 'Adding...' : 'Add supplier'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {(suppliers.data ?? []).length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {suppliers.data!.map((s: any) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{s.name}</span>
                    <span className="block truncate text-xs text-ink-faint">{s.email ?? s.phone ?? s.contact ?? ''}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-soft">
                    {s.bill_count} bill{s.bill_count === 1 ? '' : 's'} · {money(s.paid_total, cur)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form id="supplier-form" onSubmit={addSupplier} className="space-y-3 border-t border-line pt-4">
            <Field label="Name" required>
              <input className="input" required value={supplier.name}
                     onChange={(e) => setSupplier({ ...supplier, name: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Contact">
                <input className="input" value={supplier.contact}
                       onChange={(e) => setSupplier({ ...supplier, contact: e.target.value })} />
              </Field>
              <Field label="Email">
                <input className="input" type="email" value={supplier.email}
                       onChange={(e) => setSupplier({ ...supplier, email: e.target.value })} />
              </Field>
              <Field label="Phone">
                <input className="input" type="tel" value={supplier.phone}
                       onChange={(e) => setSupplier({ ...supplier, phone: e.target.value })} />
              </Field>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
