import { Link } from 'react-router-dom';
import { useBranding } from '../../context/BrandingContext';
import { useFetch } from '../../lib/useFetch';
import { dateLong } from '../../lib/format';
import Icon from '../../components/Icon';
import Hero from './Hero';
import { Readable } from '../../components/Readable';

export default function Home() {
  const { branding, pages, sections } = useBranding();
  const news = useFetch<any[]>('/public/news?limit=3');
  const home = pages.home ?? {};

  const hero = home.hero ?? {};
  const pillars = home.pillars?.extra ?? [];
  const quote = home.quote;

  return (
    <>
      <Hero />

      {/* Pillars */}
      {pillars.length > 0 && (
        <section className="mx-auto max-w-site px-4 py-16 sm:px-6">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            {home.pillars?.heading ?? 'What makes us different'}
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {pillars.map((p: any) => (
              <article key={p.title} className="card p-6">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-600/10 text-brand-600">
                  <Icon name={p.icon ?? 'star'} className="h-6 w-6" />
                </span>
                <h3 className="mt-4 font-display text-lg font-bold text-ink">{p.title}</h3>
                <Readable text={p.body} className="mt-2 text-sm leading-relaxed text-ink-soft" />
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Sections of the school, counted live from the roster */}
      <section className="border-y border-line bg-[color:var(--surface-sunken)]">
        <div className="mx-auto max-w-site px-4 py-16 sm:px-6">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">One school, three stages</h2>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Children can join us at any point and stay through to the end of secondary, without ever having to start again somewhere new.
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              { key: 'nursery', title: 'Nursery', ages: 'Ages 2 to 4', icon: 'baby' },
              { key: 'primary', title: 'Primary', ages: 'Ages 5 to 11', icon: 'book' },
              { key: 'secondary', title: 'Secondary', ages: 'Ages 11 to 16', icon: 'flask' },
            ].map((s) => {
              const live = sections.find((x: any) => x.section === s.key);
              return (
                <Link key={s.key} to="/learning" className="card p-6 transition hover:border-brand-300 hover:shadow-md">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-600/10 text-brand-600">
                    <Icon name={s.icon} className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-bold text-ink">{s.title}</h3>
                  <p className="text-sm text-ink-soft">{s.ages}</p>
                  {live && (
                    <p className="mt-3 text-xs font-semibold text-ink-faint">
                      {live.students} pupils across {live.classes} {live.classes === 1 ? 'class' : 'classes'}
                    </p>
                  )}
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                    Read more <Icon name="chevronRight" className="h-4 w-4" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Quote */}
      {quote?.heading && (
        <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <Icon name="message" className="mx-auto h-8 w-8 text-brand-600/40" />
          <blockquote className="mt-4 font-display text-xl font-medium leading-relaxed text-ink sm:text-2xl">
            &ldquo;{quote.heading}&rdquo;
          </blockquote>
          {quote.extra?.author && (
            <p className="mt-4 text-sm font-semibold text-ink-soft">{quote.extra.author}</p>
          )}
        </section>
      )}

      {/* Latest news */}
      {(news.data ?? []).length > 0 && (
        <section className="mx-auto max-w-site px-4 pb-16 sm:px-6">
          <div className="mb-6 flex items-end justify-between gap-3">
            <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">Latest news</h2>
            <Link to="/news" className="text-sm font-semibold text-brand-600 hover:underline">All news and events</Link>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {news.data!.map((p) => (
              <Link key={p.id} to={`/news/${p.slug}`} className="card overflow-hidden transition hover:border-brand-300 hover:shadow-md">
                <span className="block h-2" style={{ background: p.cover_colour }} />
                <span className="block p-5">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-brand-600">{p.category}</span>
                  <span className="mt-1 block font-display font-bold leading-snug text-ink">{p.title}</span>
                  {p.excerpt && <span className="mt-2 block text-sm text-ink-soft">{p.excerpt}</span>}
                  <span className="mt-3 block text-xs text-ink-faint">{dateLong(p.published_at)}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Closing call to action */}
      <section className="border-t border-line bg-[color:var(--surface-raised)]">
        <div className="mx-auto max-w-4xl px-4 py-14 text-center sm:px-6">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">Come and see the school for yourself</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-soft">
            We show families round during a normal school day, not a staged open evening. Bring your child with you.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/admissions" className="btn-primary !py-3">Start an application</Link>
            <Link to="/contact" className="btn-ghost !py-3">Ask us a question</Link>
          </div>
        </div>
      </section>
    </>
  );
}
