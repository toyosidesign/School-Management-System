import { Link } from 'react-router-dom';
import { api } from '../../../lib/api';
import { useFetch } from '../../../lib/useFetch';
import { useToast } from '../../../context/ToastContext';
import { useBranding } from '../../../context/BrandingContext';
import { dateLong, money, relative } from '../../../lib/format';
import Icon from '../../../components/Icon';
import { Badge, EmptyState, ErrorNote, Loading, PageHeader, StatCard } from '../../../components/ui';

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Journal', invoice: 'Fees billed', payment: 'Fees received',
  expense: 'Expenditure', payroll: 'Payroll', opening: 'Opening balance', reversal: 'Reversal',
};

/** Where the school's money stands, and what is waiting on the bursar. */
export default function FinanceOverview() {
  const { toast } = useToast();
  const { branding } = useBranding();
  const { data, loading, error, reload } = useFetch<any>('/finance/overview');

  const setUp = async () => {
    try {
      const made = await api.post('/finance/setup', {});
      toast(`${made.accounts} accounts opened for ${made.year}.`);
      reload();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const cur = branding.currency ?? 'USD';

  if (!data.ready) {
    return (
      <>
        <PageHeader icon="money" title="Finance" subtitle="The school's books: ledger, expenditure and reporting." />
        <EmptyState
          icon="money" title="The books are not open yet"
          body="Start from a standard school chart of accounts, then rename, add or retire accounts to match how you keep your books."
          action={<button className="btn-primary" onClick={setUp}>Open the books</button>}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        icon="money" title="Finance"
        subtitle={data.year
          ? `Financial year ${data.year.name} · ${dateLong(data.year.starts_on)} to ${dateLong(data.year.ends_on)}`
          : 'No financial year is open.'}
        actions={
          <>
            <Link to="/admin/finance/reports" className="btn-ghost"><Icon name="chart" className="h-4 w-4" /> Reports</Link>
            <Link to="/admin/finance/journals" className="btn-primary"><Icon name="plus" className="h-4 w-4" /> New entry</Link>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Cash and bank" value={money(data.cash, cur)} icon="money"
                  tone={data.cash >= 0 ? 'green' : 'red'} />
        <StatCard label="Owed by families" value={money(data.receivable, cur)} icon="slip"
                  tone={data.receivable ? 'amber' : 'green'} hint="Invoiced and not yet paid" />
        <StatCard label="Income this year" value={money(data.income, cur)} icon="chart" tone="brand" />
        <StatCard label="Surplus" value={money(data.surplus, cur)} icon={data.surplus >= 0 ? 'check' : 'warning'}
                  tone={data.surplus >= 0 ? 'green' : 'red'}
                  hint={`After ${money(data.expense, cur)} of expenditure`} />
      </div>

      {(data.awaiting_approval > 0 || data.unpaid_bills > 0 || data.unposted > 0) && (
        <section className="card panel-amber mb-5 p-4">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <Icon name="clock" className="h-4 w-4 shrink-0 text-amber-600" /> Waiting on you
          </h2>
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-ink">
            {data.awaiting_approval > 0 && (
              <li><Link to="/admin/finance/expenses" className="font-semibold text-brand-600 hover:text-brand-800">
                {data.awaiting_approval} expense{data.awaiting_approval === 1 ? '' : 's'} to approve</Link></li>
            )}
            {data.unpaid_bills > 0 && (
              <li><Link to="/admin/finance/expenses" className="font-semibold text-brand-600 hover:text-brand-800">
                {data.unpaid_bills} approved bill{data.unpaid_bills === 1 ? '' : 's'} to pay</Link></li>
            )}
            {data.unposted > 0 && (
              <li><Link to="/admin/finance/journals" className="font-semibold text-brand-600 hover:text-brand-800">
                {data.unposted} draft entr{data.unposted === 1 ? 'y' : 'ies'} to post</Link></li>
            )}
          </ul>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-ink">Latest entries</h2>
            <Link to="/admin/finance/journals" className="text-sm font-semibold text-brand-600 hover:text-brand-800">
              All entries
            </Link>
          </div>
          {data.recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">Nothing posted yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.recent.map((j: any) => (
                <li key={j.id}>
                  <Link to={`/admin/finance/journals?entry=${j.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                    <span className="w-24 shrink-0 font-mono text-xs text-ink-faint">{j.reference}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{j.memo}</span>
                      <span className="block text-xs text-ink-faint">
                        {SOURCE_LABEL[j.source] ?? j.source} · {relative(j.entry_date)}
                      </span>
                    </span>
                    <b className="shrink-0 text-sm tabular-nums text-ink">{money(j.total, cur)}</b>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 font-display text-lg font-bold text-ink">The books</h2>
          <ul className="space-y-2">
            {[
              ['/admin/finance/accounts', 'book', 'Chart of accounts', 'Every account, its balance, and where fees post to'],
              ['/admin/finance/journals', 'file', 'Journal entries', 'Hand-written entries, and everything posted automatically'],
              ['/admin/finance/expenses', 'money', 'Expenditure and suppliers', 'Record a bill, approve it, pay it'],
              ['/admin/finance/reports', 'chart', 'Reports', 'Trial balance, income and expenditure, balance sheet, budget'],
            ].map(([to, icon, title, body]) => (
              <li key={to}>
                <Link to={to} className="flex items-center gap-3 rounded-xl border border-line p-3 transition hover:border-brand-300">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl chip-brand">
                    <Icon name={icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink">{title}</span>
                    <span className="block truncate text-xs text-ink-soft">{body}</span>
                  </span>
                  <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-ink-faint" />
                </Link>
              </li>
            ))}
          </ul>
          {data.payable !== 0 && (
            <p className="mt-3 rounded-xl bg-[color:var(--surface-sunken)] p-3 text-xs text-ink-soft">
              <Icon name="info" className="mr-1.5 inline h-3.5 w-3.5" />
              {money(data.payable, cur)} owed to suppliers.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
