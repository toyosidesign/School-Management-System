import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../lib/api';
import { useFetch } from '../../../lib/useFetch';
import { useToast } from '../../../context/ToastContext';
import { useBranding } from '../../../context/BrandingContext';
import { money } from '../../../lib/format';
import Icon from '../../../components/Icon';
import Select from '../../../components/Select';
import { Badge, ChipRail, ErrorNote, Field, Loading, Modal, PageHeader } from '../../../components/ui';

const TYPES = [
  { value: 'asset', label: 'Assets' },
  { value: 'liability', label: 'Liabilities' },
  { value: 'equity', label: 'Funds' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expenditure' },
];

const ROLE_LABEL: Record<string, string> = {
  receivable: 'Fees owed', bank: 'Bank', cash: 'Cash', fee_income: 'Fee income', payable: 'Suppliers owed',
};

/** The chart of accounts, with what each account currently holds. */
export default function FinanceAccounts() {
  const { toast } = useToast();
  const { branding } = useBranding();
  const { data, loading, error, reload } = useFetch<any[]>('/finance/accounts');
  const [type, setType] = useState('asset');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({ code: '', name: '', type: 'expense', parent_id: '', description: '' });

  const cur = branding.currency ?? 'USD';
  const accounts = data ?? [];
  const shown = accounts.filter((a) => a.type === type);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/finance/accounts', { ...form, parent_id: form.parent_id ? Number(form.parent_id) : null });
      toast(`${form.code} ${form.name} added.`);
      setOpen(false);
      setForm({ code: '', name: '', type: form.type, parent_id: '', description: '' });
      reload();
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
        icon="book" title="Chart of accounts"
        subtitle="Every account the school keeps. The few the software posts to itself are marked; point them elsewhere and fee posting follows."
        actions={
          <>
            <Link to="/admin/finance" className="btn-ghost">Back to finance</Link>
            <button className="btn-primary" onClick={() => { setForm({ ...form, type }); setOpen(true); }}>
              <Icon name="plus" className="h-4 w-4" /> New account
            </button>
          </>
        }
      />

      <div className="mb-5">
        <ChipRail
          ariaLabel="Account type" value={type} onChange={setType}
          options={TYPES.map((t) => ({ ...t, count: accounts.filter((a) => a.type === t.value).length }))}
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-2.5 font-semibold">Code</th>
              <th className="px-4 py-2.5 font-semibold">Account</th>
              <th className="px-4 py-2.5 text-right font-semibold">Debits</th>
              <th className="px-4 py-2.5 text-right font-semibold">Credits</th>
              <th className="px-4 py-2.5 text-right font-semibold">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((a) => (
              <tr key={a.id} className="hover:bg-[color:var(--surface-sunken)]">
                <td className="px-4 py-2.5 font-mono text-xs text-ink-soft">{a.code}</td>
                <td className="px-4 py-2.5">
                  <Link to={`/admin/finance/accounts/${a.id}`} className="font-semibold text-ink hover:text-brand-700">
                    {a.parent_id && <span className="text-ink-faint">— </span>}{a.name}
                  </Link>
                  {a.role && <Badge tone="violet" >{ROLE_LABEL[a.role] ?? a.role}</Badge>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-soft">{a.debits ? money(a.debits, cur) : '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-soft">{a.credits ? money(a.credits, cur) : '—'}</td>
                <td className="px-4 py-2.5 text-right font-bold tabular-nums text-ink">{money(a.balance, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={open} onClose={() => setOpen(false)} title="New account"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="account-form" disabled={busy || !form.code || !form.name}>
              {busy ? 'Adding...' : 'Add account'}
            </button>
          </>
        }
      >
        <form id="account-form" onSubmit={create} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Code" required hint="Sorts the reports.">
              <input className="input font-mono" required value={form.code}
                     onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="5350" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Name" required>
                <input className="input" required value={form.name}
                       onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sports and equipment" />
              </Field>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind" required hint="This cannot be changed once posted to.">
              <Select
                value={form.type}
                onChange={(v) => setForm({ ...form, type: v, parent_id: '' })}
                options={TYPES.map((t: any) => ({ value: String(t.value), label: `${t.label}` }))}
              />
            </Field>
            <Field label="Groups under" hint="Optional, for the report headings.">
              <Select
                value={form.parent_id}
                onChange={(v) => setForm({ ...form, parent_id: v })}
                options={[{ value: "", label: `Top level` }, ...accounts.filter((a) => a.type === form.type && !a.parent_id).map((a: any) => ({ value: String(a.id), label: `${a.code} ${a.name}` }))]}
              />
            </Field>
          </div>
          <Field label="Note">
            <input className="input" value={form.description}
                   onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </form>
      </Modal>
    </>
  );
}
