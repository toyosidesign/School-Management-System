import { useState } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../context/ToastContext';
import { dateLong, money, relative, statusText } from '../../lib/format';
import Icon from '../../components/Icon';
import { Badge, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader, ProgressBar, StatCard } from '../../components/ui';

const METHODS = [
  { value: 'card', label: 'Card', icon: 'money' },
  { value: 'transfer', label: 'Bank transfer', icon: 'upload' },
  { value: 'wallet', label: 'Mobile wallet', icon: 'shield' },
];

export default function ParentFees() {
  const { toast } = useToast();
  const { data, loading, error, reload } = useFetch<any[]>('/invoices');
  const [paying, setPaying] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [method, setMethod] = useState('card');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);

  const open = async (invoice: any) => {
    setPaying(invoice);
    setAmount(String((invoice.amount - invoice.paid).toFixed(2)));
    setDetail(null);
    try { setDetail(await api.get(`/invoices/${invoice.id}`)); } catch { /* summary is enough */ }
  };

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post(`/invoices/${paying.id}/pay`, { amount: Number(amount), method });
      setReceipt(res);
      setPaying(null);
      toast(`Payment received. Receipt ${res.receipt_no}.`);
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const invoices = data ?? [];
  const outstanding = invoices.reduce((sum, i) => sum + (i.status === 'paid' || i.status === 'void' ? 0 : i.amount - i.paid), 0);
  const paidTotal = invoices.reduce((sum, i) => sum + i.paid, 0);

  return (
    <>
      <PageHeader icon="money" title="Fees &amp; payments" subtitle="Invoices, balances and receipts for every child on your account." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Outstanding" value={money(outstanding)} icon="warning" tone={outstanding > 0 ? 'red' : 'green'} />
        <StatCard label="Paid this year" value={money(paidTotal)} icon="check" tone="green" />
        <StatCard label="Invoices" value={invoices.length} icon="file" />
      </div>

      {invoices.length === 0 ? (
        <EmptyState icon="money" title="No invoices yet" body="Invoices from the school office will appear here." />
      ) : (
        <ul className="space-y-3">
          {invoices.map((i) => {
            const balance = i.amount - i.paid;
            const overdue = balance > 0 && new Date(i.due_date) < new Date();
            const tone = i.status === 'paid' ? 'green' : overdue ? 'red' : i.status === 'partial' ? 'amber' : 'slate';
            return (
              <li key={i.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Badge tone={tone}>{overdue && i.status !== 'paid' ? 'Overdue' : statusText(i.status)}</Badge>
                      <span className="font-mono text-xs text-ink-faint">{i.invoice_no}</span>
                    </div>
                    <p className="font-bold text-ink">{i.term}</p>
                    <p className="text-sm text-ink-soft">
                      {i.student_first_name} {i.student_last_name} · {i.description}
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">Due {dateLong(i.due_date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold tabular-nums text-ink">{money(i.amount, i.currency)}</p>
                    {i.paid > 0 && i.paid < i.amount && (
                      <p className="text-xs text-ink-soft">{money(i.paid)} paid · {money(balance)} left</p>
                    )}
                  </div>
                </div>

                {i.paid > 0 && i.paid < i.amount && (
                  <div className="mt-3"><ProgressBar value={i.paid} max={i.amount} tone="amber" /></div>
                )}

                {balance > 0 && (
                  <button className="btn-primary mt-3 w-full sm:w-auto" onClick={() => open(i)}>
                    <Icon name="money" className="h-4 w-4" /> Pay {money(balance, i.currency)}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Checkout ── */}
      <Modal
        open={!!paying} onClose={() => setPaying(null)} title="Pay school fees"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setPaying(null)}>Cancel</button>
            <button className="btn-primary" form="pay-form" disabled={busy || !Number(amount)}>
              {busy ? 'Processing…' : `Pay ${money(Number(amount) || 0)}`}
            </button>
          </>
        }
      >
        {paying && (
          <form id="pay-form" onSubmit={pay} className="space-y-4">
            <div className="rounded-xl bg-[color:var(--surface-sunken)] p-4">
              <p className="font-mono text-xs text-ink-faint">{paying.invoice_no}</p>
              <p className="font-bold text-ink">{paying.term}</p>
              <p className="text-sm text-ink-soft">{paying.student_first_name} {paying.student_last_name}</p>
              {detail?.items?.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-line pt-3">
                  {detail.items.map((it: any) => (
                    <li key={it.id} className="flex justify-between text-sm text-ink-soft">
                      <span>{it.label}</span><span className="tabular-nums">{money(it.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex justify-between border-t border-line pt-3 font-bold text-ink">
                <span>Balance due</span>
                <span className="tabular-nums">{money(paying.amount - paying.paid)}</span>
              </div>
            </div>

            <fieldset>
              <legend className="label">Payment method</legend>
              <div className="grid grid-cols-3 gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m.value} type="button" role="radio" aria-checked={method === m.value}
                    onClick={() => setMethod(m.value)}
                    className={`rounded-xl border-2 p-3 text-center transition ${
                      method === m.value ? 'border-brand-600 bg-brand-600/8' : 'border-line hover:border-brand-300'
                    }`}
                    data-tap
                  >
                    <Icon name={m.icon} className="mx-auto h-4 w-4 text-brand-600" />
                    <span className="mt-1 block text-[11px] font-semibold leading-tight text-ink">{m.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <Field label="Amount to pay" hint="Pay in full or make a part payment.">
              <input
                type="number" className="input tabular-nums" step="0.01" min="0.01"
                max={paying.amount - paying.paid} value={amount} onChange={(e) => setAmount(e.target.value)}
              />
            </Field>

            <p className="flex items-start gap-2 text-xs text-ink-faint">
              <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0" />
              This demo uses a simulated gateway. Card details are never collected or stored.
            </p>
          </form>
        )}
      </Modal>

      {/* ── Receipt ── */}
      <Modal
        open={!!receipt} onClose={() => setReceipt(null)} title="Payment receipt"
        footer={<button className="btn-primary" onClick={() => setReceipt(null)}>Done</button>}
      >
        {receipt && (
          <div className="text-center">
            <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-600">
              <Icon name="check" className="h-7 w-7" strokeWidth={3} />
            </span>
            <p className="text-lg font-bold text-ink">{money(receipt.amount)} paid</p>
            <p className="text-sm text-ink-soft">Thank you. The school office has been notified.</p>
            <dl className="mt-5 space-y-2 rounded-xl bg-[color:var(--surface-sunken)] p-4 text-left text-sm">
              {[
                ['Receipt number', receipt.receipt_no],
                ['Gateway reference', receipt.reference],
                ['Method', receipt.method],
                ['Invoice', receipt.invoice.invoice_no],
                ['Remaining balance', money(receipt.balance)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-ink-soft">{k}</dt>
                  <dd className="font-mono text-xs font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Modal>
    </>
  );
}
