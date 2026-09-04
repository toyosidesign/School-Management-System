import { Link } from 'react-router-dom';
import { useBranding } from '../../context/BrandingContext';
import Icon from '../../components/Icon';
import PageHero from './PageHero';

const ICONS: Record<string, string> = { nursery: 'baby', primary: 'book', secondary: 'flask' };

export default function Learning() {
  const { pages, sections } = useBranding();
  const page = pages.learning ?? {};
  const blocks = page.stages?.extra ?? [];
  const beyond = page.beyond?.extra ?? [];

  return (
    <>
      <PageHero heading={page.hero?.heading ?? 'Learning'} body={page.hero?.body} />

      <div className="mx-auto max-w-site space-y-8 px-4 py-14 sm:px-6">
        {blocks.map((s: any, i: number) => {
          const live = sections.find((x: any) => x.section === s.key);
          return (
            <article key={s.key ?? i} className="card overflow-hidden lg:flex">
              <div className="flex items-center gap-4 bg-brand-600/8 p-6 lg:w-72 lg:flex-col lg:items-start lg:justify-center">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-600 text-white">
                  <Icon name={ICONS[s.key] ?? 'book'} className="h-7 w-7" />
                </span>
                <div>
                  <h2 className="font-display text-xl font-bold text-ink">{s.title}</h2>
                  <p className="text-sm font-semibold text-brand-700">{s.ages}</p>
                  {live && (
                    <p className="mt-1 text-xs text-ink-soft">
                      {live.students} pupils, {live.classes} {live.classes === 1 ? 'class' : 'classes'}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex-1 p-6">
                <p className="leading-relaxed text-ink-soft">{s.body}</p>
                {s.points?.length > 0 && (
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {s.points.map((p: string) => (
                      <li key={p} className="flex items-start gap-2 text-sm text-ink">
                        <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={2.5} />
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          );
        })}

        {beyond.length > 0 && (
          <section className="card p-6 sm:p-8">
            <h2 className="font-display text-xl font-bold text-ink sm:text-2xl">
              {page.beyond?.heading ?? 'Beyond the classroom'}
            </h2>
            {page.beyond?.body && <p className="mt-3 max-w-3xl text-ink-soft">{page.beyond.body}</p>}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {beyond.map((b: any) => (
                <div key={b.title} className="rounded-xl border border-line p-4">
                  <h3 className="font-bold text-ink">{b.title}</h3>
                  <p className="mt-1.5 text-sm text-ink-soft">{b.body}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="card p-6 sm:p-8">
          <h2 className="font-display text-xl font-bold text-ink sm:text-2xl">
            {page.support?.heading ?? 'Support for different learners'}
          </h2>
          <p className="mt-3 max-w-3xl text-ink-soft">
            {page.support?.body ?? 'Around one in five of our pupils has an agreed support plan.'}
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Dyslexia', 'Specialist fonts, colour overlays, text-to-speech and reader arrangements in exams.'],
              ['ADHD', 'Tasks broken into steps, distraction-free working, and clear visual progress.'],
              ['Autism', 'Predictable routines, low-sensory spaces and advance notice of any change.'],
              ['Dyscalculia', 'Visual and concrete number work, colour-coded methods and visual timers.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-xl border border-line p-4">
                <h3 className="font-bold text-ink">{title}</h3>
                <p className="mt-1.5 text-sm text-ink-soft">{body}</p>
              </div>
            ))}
          </div>
          <Link to="/admissions" className="btn-primary mt-6">
            Talk to us about your child <Icon name="chevronRight" className="h-4 w-4" />
          </Link>
        </section>
      </div>
    </>
  );
}
