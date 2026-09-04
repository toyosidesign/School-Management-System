import { useBranding } from '../../context/BrandingContext';
import Icon from '../../components/Icon';
import PageHero from './PageHero';

/** Statutory information, deliberately easy to find and written plainly. */
export default function Safeguarding() {
  const { branding, pages } = useBranding();
  const page = pages.safeguarding ?? {};
  const contacts = page.contacts?.extra ?? [];
  const commitments = page.commitments?.extra ?? [];

  return (
    <>
      <PageHero heading={page.hero?.heading ?? 'Safeguarding'} body={page.hero?.body} />

      <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        {page.raise && (
          <section className="card panel-brand p-6 sm:p-8">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-white">
              <Icon name="shield" className="h-6 w-6" />
            </span>
            <h2 className="mt-4 font-display text-xl font-bold text-ink">{page.raise.heading}</h2>
            <p className="mt-3 leading-relaxed text-ink-soft">{page.raise.body}</p>
            {branding.phone && (
              <a href={`tel:${branding.phone}`} className="btn-primary mt-5">
                <Icon name="message" className="h-4 w-4" /> Call the school office
              </a>
            )}
          </section>
        )}

        {contacts.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-2xl font-bold text-ink">{page.contacts?.heading ?? 'Who to contact'}</h2>
            <ul className="mt-5 space-y-3">
              {contacts.map((c: any) => (
                <li key={c.role} className="card flex flex-wrap items-start gap-4 p-5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600/10 text-brand-600">
                    <Icon name="users" className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-ink">{c.role}</h3>
                    <p className="text-sm font-medium text-brand-700">{c.name}</p>
                    <p className="mt-1 text-sm text-ink-soft">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {commitments.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-2xl font-bold text-ink">{page.commitments?.heading ?? 'What we do'}</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {commitments.map((c: any) => (
                <div key={c.title} className="card p-5">
                  <h3 className="flex items-start gap-2 font-bold text-ink">
                    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={2.5} />
                    {c.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{c.body}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
