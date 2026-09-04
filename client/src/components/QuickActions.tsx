import { Link } from 'react-router-dom';
import Icon from './Icon';

export type QuickAction = { to: string; icon: string; label: string };

/**
 * The handful of things a person signs in to do, sitting directly under the
 * greeting rather than below the fold.
 *
 * A single scrollable row rather than a grid of cards: at the top of a page the
 * vertical cost matters, and these have to stay above the stats without pushing
 * everything else down a screen.
 */
export default function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (!actions.length) return null;

  return (
    <nav aria-label="Quick actions" className="mb-6" data-focus-hide>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {actions.map((a) => (
          <Link
            key={a.to + a.label}
            to={a.to}
            className="flex shrink-0 items-center gap-2.5 rounded-xl border border-line bg-[color:var(--surface-raised)] py-2.5 pl-2.5 pr-4 text-sm font-semibold text-ink transition-colors hover:border-brand-400 hover:bg-brand-600/5"
            data-tap
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-700">
              <Icon name={a.icon} className="h-4 w-4" />
            </span>
            <span className="whitespace-nowrap">{a.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
