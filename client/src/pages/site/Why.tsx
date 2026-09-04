import { Link } from 'react-router-dom';
import { useBranding } from '../../context/BrandingContext';
import Icon from '../../components/Icon';
import PageHero from './PageHero';

/** The differentiators page: what actually sets the school apart. */
export default function Why() {
  const { pages } = useBranding();
  const page = pages.why ?? {};
  const reasons = page.reasons?.extra ?? [];

  return (
    <>
      <PageHero heading={page.hero?.heading ?? 'Why families choose us'} body={page.hero?.body} />

      <div className="mx-auto max-w-site px-4 py-14 sm:px-6">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {reasons.map((r: any) => (
            <article key={r.title} className="card p-6">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-600/10 text-brand-600">
                <Icon name={r.icon ?? 'star'} className="h-6 w-6" />
              </span>
              <h2 className="mt-4 font-display text-lg font-bold text-ink">{r.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{r.body}</p>
            </article>
          ))}
        </div>

        {page.safeguarding_summary && (
          <section className="card mt-8 panel-brand p-6 sm:p-8">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-white">
              <Icon name="shield" className="h-6 w-6" />
            </span>
            <h2 className="mt-4 font-display text-xl font-bold text-ink">
              {page.safeguarding_summary.heading}
            </h2>
            <p className="mt-3 max-w-3xl text-ink-soft">{page.safeguarding_summary.body}</p>
            <Link to="/safeguarding" className="btn-ghost mt-5">
              Read our safeguarding page <Icon name="chevronRight" className="h-4 w-4" />
            </Link>
          </section>
        )}

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/admissions#tour" className="btn-primary !py-3">Book a tour</Link>
          <Link to="/community" className="btn-ghost !py-3">Hear from our parents</Link>
        </div>
      </div>
    </>
  );
}
