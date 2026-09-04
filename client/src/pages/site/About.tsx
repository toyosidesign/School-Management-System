import { useBranding } from '../../context/BrandingContext';
import Icon from '../../components/Icon';
import { Readable } from '../../components/Readable';
import { Avatar } from '../../components/ui';
import PageHero from './PageHero';

export default function About() {
  const { pages, stats } = useBranding();
  const about = pages.about ?? {};
  const values = about.values?.extra ?? [];
  const leaders = about.leadership?.extra ?? [];
  const keyMessages = about.key_messages?.extra ?? [];
  const accreditations = about.accreditations?.extra ?? [];

  return (
    <>
      <PageHero assetKey="hero-about" mediaUrl={about.hero?.media_url} heading={about.hero?.heading ?? 'About our school'} body={about.hero?.body} />

      {keyMessages.length > 0 && (
        <section className="border-b border-line bg-[color:var(--surface-raised)]">
          <div className="mx-auto max-w-site px-4 py-10 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {keyMessages.map((k: any) => (
                <div key={k.title} className="flex gap-3">
                  <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" strokeWidth={2.5} />
                  <div>
                    <h3 className="font-semibold text-ink">{k.title}</h3>
                    <p className="mt-1 text-sm text-ink-soft">{k.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {values.length > 0 && (
        <section className="mx-auto max-w-site px-4 py-14 sm:px-6">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            {about.values?.heading ?? 'What we stand for'}
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {values.map((v: any) => (
              <article key={v.title} className="card p-6">
                <h3 className="font-display text-lg font-bold text-ink">{v.title}</h3>
                <Readable text={v.body} className="mt-2 text-sm leading-relaxed text-ink-soft" />
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="border-y border-line bg-[color:var(--surface-sunken)]">
        <div className="mx-auto grid max-w-site grid-cols-2 gap-6 px-4 py-12 sm:px-6 lg:grid-cols-4">
          {[
            ['Pupils on roll', stats.students],
            ['Teaching & support staff', stats.staff],
            ['Classes', stats.classes],
            ['Subjects taught', stats.subjects],
          ].map(([label, value]) => (
            <div key={label as string} className="text-center">
              <p className="font-display text-3xl font-bold text-brand-600">{value ?? '-'}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">{label as string}</p>
            </div>
          ))}
        </div>
      </section>

      {leaders.length > 0 && (
        <section className="mx-auto max-w-site px-4 py-14 sm:px-6">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            {about.leadership?.heading ?? 'Leadership team'}
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {leaders.map((p: any) => {
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
        </section>
      )}

      {accreditations.length > 0 && (
        <section className="mx-auto max-w-site px-4 pb-4 sm:px-6">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            {about.accreditations?.heading ?? 'Accreditation and membership'}
          </h2>
          {about.accreditations?.body && <p className="mt-2 max-w-3xl text-ink-soft">{about.accreditations.body}</p>}
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {accreditations.map((a: any) => (
              <article key={a.name} className="card p-5">
                <span className="inline-flex rounded-lg bg-brand-600/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-brand-700">
                  {a.short}
                </span>
                <h3 className="mt-3 font-bold text-ink">{a.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{a.body}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-site px-4 py-16 sm:px-6">
        <div className="card panel-brand p-6 sm:p-8">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-white">
            <Icon name="accessibility" className="h-6 w-6" />
          </span>
          <h2 className="mt-4 font-display text-xl font-bold text-ink sm:text-2xl">
            Accessibility is not a separate programme here
          </h2>
          <p className="mt-3 max-w-3xl text-ink-soft">
            Every pupil can set the font, colour tint, text size and reading support that works for them, and those
            settings follow them onto any device. Pupils with an agreed support plan get extra time applied
            automatically in assessments, and can answer in audio, video or diagrams where writing is the barrier
            rather than the subject. This site itself carries the same controls, in the toolbar at the top of the page.
          </p>
        </div>
      </section>
    </>
  );
}
