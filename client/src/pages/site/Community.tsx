import { Link } from 'react-router-dom';
import { useBranding } from '../../context/BrandingContext';
import Icon from '../../components/Icon';
import { Avatar, Badge } from '../../components/ui';
import PageHero from './PageHero';

/** Teachers, parent voices and alumni: the people behind the school. */
export default function Community() {
  const { pages, stats } = useBranding();
  const page = pages.community ?? {};
  const testimonials = page.testimonials?.extra ?? [];
  const alumni = page.alumni?.extra ?? [];
  const leadership = pages.about?.leadership?.extra ?? [];

  return (
    <>
      <PageHero heading={page.hero?.heading ?? 'Community and people'} body={page.hero?.body} />

      <div className="mx-auto max-w-site px-4 py-14 sm:px-6">
        {/* Teachers */}
        <section>
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            {page.teachers?.heading ?? 'Meet our teachers'}
          </h2>
          {page.teachers?.body && <p className="mt-3 max-w-3xl text-ink-soft">{page.teachers.body}</p>}

          <div className="mt-7 grid gap-5 md:grid-cols-3">
            {leadership.map((p: any) => {
              const [first, ...rest] = String(p.name).split(' ');
              return (
                <article key={p.name} className="card p-6">
                  <Avatar first={first} last={rest.join(' ')} size="lg" />
                  <h3 className="mt-4 font-display text-lg font-bold text-ink">{p.name}</h3>
                  <p className="text-sm font-semibold text-brand-600">{p.role}</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{p.bio}</p>
                </article>
              );
            })}
          </div>

          <p className="mt-5 text-sm text-ink-soft">
            {stats.staff} teaching and support staff across {stats.classes} classes.
          </p>
        </section>

        {/* Parent voice */}
        {testimonials.length > 0 && (
          <section className="mt-14">
            <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
              {page.testimonials?.heading ?? 'Hear from our parents'}
            </h2>
            <div className="mt-7 grid gap-5 md:grid-cols-3">
              {testimonials.map((t: any, i: number) => (
                <figure key={i} className="card flex flex-col p-6">
                  <Icon name="message" className="h-7 w-7 text-brand-600/40" />
                  <blockquote className="mt-3 flex-1 text-[15px] leading-relaxed text-ink">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <figcaption className="mt-4 border-t border-line pt-3">
                    <span className="block text-sm font-semibold text-ink">{t.author}</span>
                    {t.since && <span className="block text-xs text-ink-faint">{t.since}</span>}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {/* Alumni */}
        {alumni.length > 0 && (
          <section className="mt-14">
            <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
              {page.alumni?.heading ?? 'Where are they now?'}
            </h2>
            {page.alumni?.body && <p className="mt-3 max-w-3xl text-ink-soft">{page.alumni.body}</p>}

            <div className="mt-7 grid gap-5 md:grid-cols-3">
              {alumni.map((a: any) => {
                const [first, ...rest] = String(a.name).split(' ');
                return (
                  <article key={a.name} className="card p-6">
                    <div className="flex items-center gap-3">
                      <Avatar first={first} last={rest.join(' ')} />
                      <div className="min-w-0">
                        <h3 className="truncate font-bold text-ink">{a.name}</h3>
                        <p className="truncate text-xs text-ink-faint">{a.left}</p>
                      </div>
                    </div>
                    <Badge tone="brand">{a.now}</Badge>
                    <p className="mt-3 text-sm leading-relaxed text-ink-soft">&ldquo;{a.quote}&rdquo;</p>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Link to="/admissions#tour" className="btn-primary !py-3">Book a tour</Link>
          <Link to="/contact" className="btn-ghost !py-3">Ask us a question</Link>
        </div>
      </div>
    </>
  );
}
