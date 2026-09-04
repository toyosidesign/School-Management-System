import { Link } from 'react-router-dom';
import { useFetch } from '../lib/useFetch';
import Icon from './Icon';
import { ProgressBar } from './ui';

/**
 * The first thing an administrator sees on a new deployment, and the last time
 * they see it is the day it is finished: once every step is done it stops
 * rendering entirely rather than sitting there as a permanent tick list.
 */
export default function SetupChecklist() {
  const { data } = useFetch<any>('/setup');
  if (!data || data.complete) return null;

  const next = data.steps.find((s: any) => !s.done);

  return (
    <section className="card mb-6 overflow-hidden">
      <div className="border-b border-line bg-[color:var(--surface-sunken)] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">Set up your school</h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              {data.done === 0
                ? 'Nothing here yet. Work down the list and the rest of the platform comes to life as you go.'
                : `${data.done} of ${data.total} done. Next up: ${next?.title.toLowerCase()}.`}
            </p>
          </div>
          <span className="shrink-0 font-display text-2xl font-black tabular-nums text-brand-600">
            {Math.round((data.done / data.total) * 100)}%
          </span>
        </div>
        <div className="mt-3"><ProgressBar value={data.done} max={data.total} /></div>
      </div>

      <ol className="divide-y divide-line">
        {data.steps.map((step: any) => (
          <li key={step.key} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                step.done ? 'bg-green-500 text-white' : 'border-2 border-line text-transparent'
              }`}
              aria-hidden="true"
            >
              <Icon name="check" className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm font-bold ${step.done ? 'text-ink-faint line-through' : 'text-ink'}`}>
                {step.title}
                {step.done && step.count > 0 && (
                  <span className="ml-2 font-semibold text-ink-faint no-underline">{step.count}</span>
                )}
              </span>
              {!step.done && <span className="block text-xs text-ink-soft">{step.body}</span>}
            </span>
            {!step.done && (
              <Link
                to={step.link} data-tap
                className="inline-flex shrink-0 items-center gap-1 px-1 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-800"
              >
                {step.cta} <Icon name="chevronRight" className="h-3.5 w-3.5" />
              </Link>
            )}
          </li>
        ))}
      </ol>

      {data.pending_invites > 0 && (
        <p className="border-t border-line px-5 py-3 text-xs text-ink-soft">
          <Icon name="mail" className="mr-1.5 inline h-3.5 w-3.5" />
          {data.pending_invites} invitation{data.pending_invites === 1 ? '' : 's'} sent and not opened yet.{' '}
          <Link to="/admin/invitations" className="font-semibold text-brand-600 transition-colors hover:text-brand-800">Review them</Link>
        </p>
      )}
    </section>
  );
}
