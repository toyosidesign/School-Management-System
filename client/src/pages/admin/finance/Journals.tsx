import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../../lib/api';
import { useFetch } from '../../../lib/useFetch';
import { useToast } from '../../../context/ToastContext';
import { useBranding } from '../../../context/BrandingContext';
import { dateLong, money } from '../../../lib/format';
import Icon from '../../../components/Icon';
import DatePicker from '../../../components/DatePicker';
import Select from '../../../components/Select';
import { Badge, ChipRail, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader } from '../../../components/ui';

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Journal', invoice: 'Fees billed', payment: 'Fees received',
  expense: 'Expenditure', payroll: 'Payroll', opening: 'Opening balance', reversal: 'Reversal',
};
const STATUS_TONE: Record<string, string> = { posted: 'green', draft: 'amber', void: 'slate' };

const emptyLine = () => ({ account_id: '', debit: '', credit: '', memo: '' });

/**
 * The day book. Entries the software posts for fees and expenditure appear
 * here beside hand-written ones, and nothing posted is ever edited: a mistake
 * is reversed, leaving both entries on the record.
 */
export default function FinanceJournals() {
  const { toast } = useToast();
  const { branding } = useBranding();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useFetch<any[]>(`/finance/journals${status ? `?status=${status}` : ''}`, [status]);
  const accounts = useFetch<any[]>('/finance/accounts');

  const openId = params.get('entry');
  const detail = useFetch<any>(openId ? `/finance/journals/${openId}` : null, [openId]);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reversing, setReversing] = useState('');
  const [form, setForm] = useState<any>({
    entry_date: new Date().toISOString().slice(0, 10), memo: '', lines: [emptyLine(), emptyLine()],
  });

  const cur = branding.currency ?? 'USD';
  const num = (v: any) => Math.round((Number(v) || 0) * 100) / 100;
  const debits = form.lines.reduce((s: number, l: any) => s + num(l.debit), 0);
  const credits = form.lines.reduce((s: number, l: any) => s + num(l.credit), 0);
  const difference = Math.round((debits - credits) * 100) / 100;
  const canPost = debits > 0 && difference === 0 && form.lines.filter((l: any) => l.account_id).length >= 2;

  const setLine = (i: number, patch: any) =>
    setForm({ ...form, lines: form.lines.map((l: any, n: number) => (n === i ? { ...l, ...patch } : l)) });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const made = await api.post('/finance/journals', {
        entry_date: form.entry_date,
        memo: form.memo,
        lines: form.lines
          .filter((l: any) => l.account_id && (num(l.debit) || num(l.credit)))
          .map((l: any) => ({
            account_id: Number(l.account_id), debit: num(l.debit), credit: num(l.credit), memo: l.memo || null,
          })),
      });
      toast(`${made.reference} posted.`);
      setOpen(false);
      setForm({ entry_date: new Date().toISOString().slice(0, 10), memo: '', lines: [emptyLine(), emptyLine()] });
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const reverse = async () => {
    setBusy(true);
    try {
      const out = await api.post(`/finance/journals/${openId}/reverse`, { reason: reversing });
      toast(`Reversed by ${out.reversal.reference}.`);
      setReversing('');
      setParams({}, { replace: true });
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const rows = data ?? [];

  return (
    <>
      <PageHeader
        icon="file" title="Journal entries"
        subtitle="Every posting in date order. Correcting a posted entry means reversing it, so the books keep both."
        actions={
          <>
            <Link to="/admin/finance" className="btn-ghost">Back to finance</Link>
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Icon name="plus" className="h-4 w-4" /> New entry
            </button>
          </>
        }
      />

      <div className="mb-5">
        <ChipRail
          ariaLabel="Filter entries" value={status} onChange={setStatus}
          options={[
            { value: '', label: 'All' },
            { value: 'posted', label: 'Posted' },
            { value: 'draft', label: 'Drafts' },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="file" title="Nothing posted yet" body="Fees, payments and expenditure all appear here as they happen." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                <th className="px-4 py-2.5 font-semibold">Reference</th>
                <th className="px-4 py-2.5 font-semibold">Date</th>
                <th className="px-4 py-2.5 font-semibold">Detail</th>
                <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((j) => (
                <tr key={j.id} className="cursor-pointer hover:bg-[color:var(--surface-sunken)]"
                    onClick={() => setParams({ entry: String(j.id) })}>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-ink-soft">{j.reference}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft">{dateLong(j.entry_date)}</td>
                  <td className="px-4 py-2.5">
                    <span className="block truncate text-ink">{j.memo}</span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      <Badge tone={STATUS_TONE[j.status]}>{j.status}</Badge>
                      <Badge tone="slate">{SOURCE_LABEL[j.source] ?? j.source}</Badge>
                      {j.reversed_by_reference && <Badge tone="red">Reversed by {j.reversed_by_reference}</Badge>}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold tabular-nums text-ink">{money(j.total, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── One entry, in full ── */}
      <Modal
        open={!!openId} onClose={() => { setParams({}, { replace: true }); setReversing(''); }}
        title={detail.data?.reference ?? 'Entry'} wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => { setParams({}, { replace: true }); setReversing(''); }}>Close</button>
            {detail.data?.status === 'posted' && !detail.data?.reversed_by && (
              <button className="btn-danger" disabled={busy} onClick={() => (reversing ? reverse() : setReversing(' '))}>
                {busy ? 'Reversing...' : reversing ? 'Confirm reversal' : 'Reverse this entry'}
              </button>
            )}
          </>
        }
      >
        {detail.loading && <Loading rows={2} />}
        {detail.data && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[detail.data.status]}>{detail.data.status}</Badge>
              {detail.data.reversed_by_reference && (
                <Badge tone="red">Reversed by {detail.data.reversed_by_reference}</Badge>
              )}
              {detail.data.reverses_reference && (
                <Badge tone="violet">Reverses {detail.data.reverses_reference}</Badge>
              )}
              <Badge tone="slate">{SOURCE_LABEL[detail.data.source] ?? detail.data.source}</Badge>
              <span className="text-sm text-ink-soft">{dateLong(detail.data.entry_date)}</span>
              {detail.data.posted_by_name && (
                <span className="text-sm text-ink-faint">· posted by {detail.data.posted_by_name}</span>
              )}
            </div>
            <p className="text-sm text-ink">{detail.data.memo}</p>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th className="py-2 font-semibold">Account</th>
                  <th className="py-2 text-right font-semibold">Debit</th>
                  <th className="py-2 text-right font-semibold">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {detail.data.lines.map((l: any) => (
                  <tr key={l.id}>
                    <td className="py-2">
                      <span className="font-mono text-xs text-ink-faint">{l.code}</span>{' '}
                      <span className="text-ink">{l.account}</span>
                      {(l.student_name || l.supplier_name) && (
                        <span className="block text-xs text-ink-faint">{l.student_name ?? l.supplier_name}</span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums text-ink">{l.debit ? money(l.debit, cur) : ''}</td>
                    <td className="py-2 text-right tabular-nums text-ink">{l.credit ? money(l.credit, cur) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line font-bold text-ink">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right tabular-nums">{money(detail.data.total, cur)}</td>
                  <td className="py-2 text-right tabular-nums">{money(detail.data.total, cur)}</td>
                </tr>
              </tfoot>
            </table>

            {detail.data.void_reason && (
              <p className="rounded-xl panel-red px-3 py-2.5 text-sm text-red-800">
                Reversed: {detail.data.void_reason}
              </p>
            )}

            {reversing && detail.data.status === 'posted' && !detail.data.reversed_by && (
              <Field label="Why is it being reversed?" hint="Kept on both entries.">
                <input className="input" autoFocus value={reversing.trim()}
                       onChange={(e) => setReversing(e.target.value || ' ')} placeholder="Posted to the wrong account" />
              </Field>
            )}
          </div>
        )}
      </Modal>

      {/* ── A hand-written entry ── */}
      <Modal
        open={open} onClose={() => setOpen(false)} title="New journal entry" wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="journal-form" disabled={busy || !canPost}>
              {busy ? 'Posting...' : 'Post entry'}
            </button>
          </>
        }
      >
        <form id="journal-form" onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date" required>
              <DatePicker
                value={form.entry_date}
                onChange={(v) => setForm({ ...form, entry_date: v })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Narration" required hint="What this entry is for.">
                <input className="input" required value={form.memo} placeholder="Bank charges for March"
                       onChange={(e) => setForm({ ...form, memo: e.target.value })} />
              </Field>
            </div>
          </div>

          <div className="space-y-2">
            <span className="label">Lines</span>
            {form.lines.map((line: any, i: number) => (
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_7rem_7rem_2.5rem]">
                <Select
                  value={line.account_id}
                  onChange={(v) => setLine(i, { account_id: v })}
                  options={[{ value: "", label: `Choose an account` }, ...(accounts.data ?? []).map((a: any) => ({ value: String(a.id), label: `${a.code} ${a.name}` }))]}
                />
                <input className="input text-right" inputMode="decimal" placeholder="Debit" value={line.debit}
                       aria-label={`Debit for line ${i + 1}`}
                       onChange={(e) => setLine(i, { debit: e.target.value, credit: '' })} />
                <input className="input text-right" inputMode="decimal" placeholder="Credit" value={line.credit}
                       aria-label={`Credit for line ${i + 1}`}
                       onChange={(e) => setLine(i, { credit: e.target.value, debit: '' })} />
                <button type="button" className="btn-subtle !px-2" aria-label={`Remove line ${i + 1}`}
                        disabled={form.lines.length <= 2}
                        onClick={() => setForm({ ...form, lines: form.lines.filter((_: any, n: number) => n !== i) })}>
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button type="button" className="btn-ghost btn-sm"
                    onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })}>
              <Icon name="plus" className="h-3.5 w-3.5" /> Add a line
            </button>
          </div>

          <div className={`rounded-xl p-3 text-sm ${difference === 0 && debits > 0 ? 'panel-green' : 'panel-amber'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-ink-soft">Debits {money(debits, cur)} · Credits {money(credits, cur)}</span>
              <b className="text-ink">
                {debits === 0 ? 'Nothing entered yet'
                  : difference === 0 ? 'Balanced'
                  : `Out by ${money(Math.abs(difference), cur)}`}
              </b>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
