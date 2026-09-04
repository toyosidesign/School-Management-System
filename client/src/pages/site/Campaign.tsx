import { Link, Navigate } from 'react-router-dom';
import { useBranding } from '../../context/BrandingContext';
import { dateLong } from '../../lib/format';
import Icon from '../../components/Icon';
import PageHero from './PageHero';

/**
 * A time-bound campaign page: an anniversary, an appeal, a capital project.
 * Deliberately generic, and hidden entirely unless a school switches it on.
 */
export default function Campaign() {
  const { branding, pages } = useBranding();
  const page = pages.campaign ?? {};
  const timeline = page.timeline?.extra ?? [];

  // A stale link should not surface a campaign the school has turned off.
  if (!branding.campaign_enabled) return <Navigate to="/" replace />;

  const target = branding.campaign_target_date ? new Date(branding.campaign_target_date) : null;
  const daysToGo = target ? Math.ceil((target.getTime() - Date.now()) / 86_400_000) : null;

  return (
    <>
      <PageHero
        heading={page.hero?.heading ?? branding.campaign_label ?? 'Our campaign'}
        body={page.hero?.body}
        eyebrow={page.hero?.extra?.eyebrow}
      />

      {target && daysToGo !== null && daysToGo > 0 && (
        <div className="mx-auto -mt-6 max-w-4xl px-4 sm:px-6">
          <p className="inline-flex items-center gap-2 rounded-2xl border border-line bg-[color:var(--surface-raised)] px-4 py-3 text-sm shadow-lg">
            <Icon name="calendar" className="h-4 w-4 text-brand-600" />
            <span className="text-ink"><b>{daysToGo}</b> days until {dateLong(target)}</span>
          </p>
        </div>
      )}

      <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        {timeline.length === 0 && (
          <div className="card p-8 text-center">
            <p className="font-semibold text-ink">No campaign content yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
              Add a hero and a timeline under Website and branding, then Page content, and they will appear here.
            </p>
          </div>
        )}

        {timeline.length > 0 && (
          <>
            <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
              {page.timeline?.heading ?? 'The year ahead'}
            </h2>
            <ol className="relative mt-8 space-y-6 border-l-2 border-line pl-6">
              {timeline.map((t: any, i: number) => (
                <li key={i} className="relative">
                  <span
                    className="absolute -left-[2.1rem] top-1 grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white leading-none"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-600">{t.period}</p>
                  <h3 className="mt-1 font-display text-lg font-bold text-ink">{t.theme}</h3>
                  {t.body && <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{t.body}</p>}
                </li>
              ))}
            </ol>
          </>
        )}

        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Link to="/admissions#tour" className="btn-primary !py-3">Book a tour</Link>
          <Link to="/news" className="btn-ghost !py-3">Read the latest news</Link>
        </div>
      </div>
    </>
  );
}
