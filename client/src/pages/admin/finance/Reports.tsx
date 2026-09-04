import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../../../lib/useFetch';
import { useBranding } from '../../../context/BrandingContext';
import { dateLong, money } from '../../../lib/format';
import Icon from '../../../components/Icon';
import DatePicker from '../../../components/DatePicker';
import { Badge, ChipRail, ErrorNote, Loading, PageHeader, ProgressBar } from '../../../components/ui';

const REPORTS = [
  { value: 'trial-balance', label: 'Trial balance' },
  { value: 'profit-loss', label: 'Income and expenditure' },
  { value: 'balance-sheet', label: 'Balance sheet' },
  { value: 'budget', label: 'Budget' },
];

/** The four statements a school's governors and auditors ask for. */
export default function FinanceReports() {
  const { branding } = useBranding();
  const [report, setReport] = useState('profit-loss');
  const [range, setRange] = useState({ from: '', to: '' });

  const query = new URLSearchParams(
    Object.entries(range).filter(([, v]) => v) as [string, string][]
  ).toString();
  const { data, loading, error, reload } = useFetch<any>(
    `/finance/reports/${report}${query ? `?${query}` : ''}`, [report, query]
  );

  const cur = branding.currency ?? 'USD';
  const Row = ({ label, code, value, bold = false }: any) => (
    <tr className={bold ? 'border-t-2 border-line font-bold text-ink' : ''}>
      <td className="py-2 pr-4">
        {code && <span className="mr-2 font-mono text-xs text-ink-faint">{code}</span>}
        <span className={bold ? '' : 'text-ink'}>{label}</span>
      </td>
      <td className="py-2 text-right tabular-nums">{money(value, cur)}</td>
    </tr>
  );

  return (
    <>
      <PageHeader
        icon="chart" title="Financial reports"
        subtitle="Read straight from the ledger, so they always agree with the day book."
        actions={
          <>
            <Link to="/admin/finance" className="btn-ghost">Back to finance</Link>
            <button className="btn-primary" onClick={() => window.print()}>
              <Icon name="download" className="h-4 w-4" /> Print
            </button>
          </>
        }
      />

      <div className="mb-4">
        <ChipRail ariaLabel="Report" value={report} onChange={setReport} options={REPORTS} />
      </div>

      {report !== 'budget' && (
        <div className="mb-5 flex flex-wrap items-end gap-3" data-focus-hide>
          <label className="text-xs text-ink-soft">
            <span className="mb-1 block font-semibold uppercase tracking-wide">From</span>
            <DatePicker
              value={range.from}
              onChange={(v) => setRange({ ...range, from: v })}
            />
          </label>
          <label className="text-xs text-ink-soft">
            <span className="mb-1 block font-semibold uppercase tracking-wide">
              {report === 'balance-sheet' ? 'As at' : 'To'}
            </span>
            <DatePicker
              value={range.to}
              onChange={(v) => setRange({ ...range, to: v })}
            />
          </label>
          {(range.from || range.to) && (
            <button className="btn-ghost btn-sm" onClick={() => setRange({ from: '', to: '' })}>Clear</button>
          )}
        </div>
      )}

      {loading && <Loading rows={4} />}
      {error && <ErrorNote error={error} onRetry={reload} />}

      {data && report === 'trial-balance' && (
        <section className="card overflow-x-auto p-4">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                <th className="py-2 font-semibold">Account</th>
                <th className="py-2 text-right font-semibold">Debit</th>
                <th className="py-2 text-right font-semibold">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.rows.map((a: any) => (
                <tr key={a.id}>
                  <td className="py-2">
                    <span className="mr-2 font-mono text-xs text-ink-faint">{a.code}</span>
                    <span className="text-ink">{a.name}</span>
                  </td>
                  <td className="py-2 text-right tabular-nums text-ink">{a.debits ? money(a.debits, cur) : ''}</td>
                  <td className="py-2 text-right tabular-nums text-ink">{a.credits ? money(a.credits, cur) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line font-bold text-ink">
                <td className="py-2">Totals</td>
                <td className="py-2 text-right tabular-nums">{money(data.totals.debits, cur)}</td>
                <td className="py-2 text-right tabular-nums">{money(data.totals.credits, cur)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-3 text-sm">
            {data.balanced
              ? <Badge tone="green" icon="check">Debits equal credits</Badge>
              : <Badge tone="red" icon="warning">The ledger does not balance</Badge>}
          </p>
        </section>
      )}

      {data && report === 'profit-loss' && (
        <section className="card p-4">
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-ink-soft" colSpan={2}>Income</td></tr>
              {data.income.map((a: any) => <Row key={a.id} code={a.code} label={a.name} value={a.balance} />)}
              <Row label="Total income" value={data.total_income} bold />

              <tr><td className="pb-1 pt-5 text-xs font-bold uppercase tracking-wide text-ink-soft" colSpan={2}>Expenditure</td></tr>
              {data.expense.map((a: any) => <Row key={a.id} code={a.code} label={a.name} value={a.balance} />)}
              <Row label="Total expenditure" value={data.total_expense} bold />

              <tr className="border-t-2 border-line">
                <td className="py-3 font-bold text-ink">{data.surplus >= 0 ? 'Surplus' : 'Deficit'} for the period</td>
                <td className={`py-3 text-right text-lg font-bold tabular-nums ${data.surplus >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {money(data.surplus, cur)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {data && report === 'balance-sheet' && (
        <section className="card p-4">
          <p className="mb-3 text-sm text-ink-soft">As at {dateLong(data.as_of)}</p>
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-ink-soft" colSpan={2}>Assets</td></tr>
              {data.assets.map((a: any) => <Row key={a.id} code={a.code} label={a.name} value={a.balance} />)}
              <Row label="Total assets" value={data.total_assets} bold />

              <tr><td className="pb-1 pt-5 text-xs font-bold uppercase tracking-wide text-ink-soft" colSpan={2}>Liabilities</td></tr>
              {data.liabilities.length === 0 && <tr><td className="py-2 text-ink-faint" colSpan={2}>None</td></tr>}
              {data.liabilities.map((a: any) => <Row key={a.id} code={a.code} label={a.name} value={a.balance} />)}
              <Row label="Total liabilities" value={data.total_liabilities} bold />

              <tr><td className="pb-1 pt-5 text-xs font-bold uppercase tracking-wide text-ink-soft" colSpan={2}>Funds</td></tr>
              {data.equity.map((a: any) => <Row key={a.id} code={a.code} label={a.name} value={a.balance} />)}
              <Row label="Surplus for the year" value={data.surplus} />
              <Row label="Total funds" value={data.total_equity} bold />
            </tbody>
          </table>
          <p className="mt-3 text-sm">
            {data.balanced
              ? <Badge tone="green" icon="check">Assets equal liabilities plus funds</Badge>
              : <Badge tone="red" icon="warning">The sheet does not balance</Badge>}
          </p>
        </section>
      )}

      {data && report === 'budget' && (
        data.rows.length === 0 ? (
          <section className="card p-6 text-center text-sm text-ink-faint">
            No budget has been set for {data.year?.name ?? 'this year'} yet.
          </section>
        ) : (
          <section className="card p-4">
            <p className="mb-3 text-sm text-ink-soft">{data.year.name}</p>
            <ul className="space-y-3">
              {data.rows.map((row: any) => (
                <li key={row.id}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold text-ink">
                      <span className="mr-2 font-mono text-xs text-ink-faint">{row.code}</span>{row.name}
                    </span>
                    <span className="tabular-nums text-ink-soft">
                      {money(row.actual, cur)} of {money(row.budget, cur)}
                      {row.used != null && <span className={`ml-2 font-bold ${row.used > 100 ? 'text-red-700' : 'text-ink'}`}>{row.used}%</span>}
                    </span>
                  </div>
                  <ProgressBar value={Math.min(row.used ?? 0, 100)} max={100}
                               tone={(row.used ?? 0) > 100 ? 'red' : (row.used ?? 0) > 85 ? 'amber' : 'brand'} />
                </li>
              ))}
            </ul>
          </section>
        )
      )}
    </>
  );
}
