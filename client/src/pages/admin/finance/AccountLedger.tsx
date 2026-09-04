import { Link, useParams } from 'react-router-dom';
import { useFetch } from '../../../lib/useFetch';
import { useBranding } from '../../../context/BrandingContext';
import { dateLong, money } from '../../../lib/format';
import Icon from '../../../components/Icon';
import { Badge, EmptyState, ErrorNote, Loading, PageHeader } from '../../../components/ui';

/** One account's statement: every posting against it, with a running balance. */
export default function AccountLedger() {
  const { id } = useParams();
  const { branding } = useBranding();
  const { data, loading, error, reload } = useFetch<any>(`/finance/accounts/${id}/ledger`, [id]);

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const cur = branding.currency ?? 'USD';
  const { account, entries, balance } = data;

  return (
    <>
      <PageHeader
        icon="file" title={`${account.code} ${account.name}`}
        subtitle={`${account.type[0].toUpperCase()}${account.type.slice(1)} account · balance ${money(balance, cur)}`}
        actions={<Link to="/admin/finance/accounts" className="btn-ghost">All accounts</Link>}
      />

      {entries.length === 0 ? (
        <EmptyState icon="file" title="Nothing posted here yet"
                    body="Entries against this account appear as they are posted." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                <th className="px-4 py-2.5 font-semibold">Date</th>
                <th className="px-4 py-2.5 font-semibold">Reference</th>
                <th className="px-4 py-2.5 font-semibold">Detail</th>
                <th className="px-4 py-2.5 text-right font-semibold">Debit</th>
                <th className="px-4 py-2.5 text-right font-semibold">Credit</th>
                <th className="px-4 py-2.5 text-right font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.map((e: any, i: number) => (
                <tr key={`${e.journal_id}-${i}`} className="hover:bg-[color:var(--surface-sunken)]">
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft">{dateLong(e.entry_date)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-soft">{e.reference}</td>
                  <td className="px-4 py-2.5">
                    <span className="block text-ink">{e.line_memo ?? e.memo}</span>
                    {(e.student_name || e.supplier_name) && (
                      <Badge tone="slate">{e.student_name ?? e.supplier_name}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink">{e.debit ? money(e.debit, cur) : ''}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink">{e.credit ? money(e.credit, cur) : ''}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink">{money(e.balance, cur)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line bg-[color:var(--surface-sunken)]">
                <td className="px-4 py-3 font-bold text-ink" colSpan={5}>
                  <Icon name="check" className="mr-1.5 inline h-4 w-4" /> Balance
                </td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-ink">{money(balance, cur)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
