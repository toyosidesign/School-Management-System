import { useBranding } from '../../context/BrandingContext';
import { money } from '../../lib/format';
import Icon from '../../components/Icon';
import PageHero from './PageHero';
import EnquiryForm from './EnquiryForm';

export default function Admissions() {
  const { pages, branding } = useBranding();
  const page = pages.admissions ?? {};
  const steps = page.steps?.extra ?? [];
  const fees = page.fees?.extra ?? [];
  const journey = page.journey?.extra ?? [];

  return (
    <>
      <PageHero assetKey="hero-admissions" mediaUrl={page.hero?.media_url} heading={page.hero?.heading ?? 'Admissions'} body={page.hero?.body} />

      <div className="mx-auto max-w-site px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className="min-w-0 space-y-12">
            {journey.length > 0 && (
              <section>
                <h2 className="font-display text-2xl font-bold text-ink">
                  {page.journey?.heading ?? 'How families usually get here'}
                </h2>
                <ol className="mt-6 grid gap-3 sm:grid-cols-2">
                  {journey.map((j: any, i: number) => (
                    <li key={j.step} className="flex gap-3 rounded-xl border border-line p-4">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600/10 text-xs font-bold text-brand-700 leading-none">
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-ink">{j.step}</span>
                        <span className="mt-0.5 block text-sm text-ink-soft">{j.body}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {steps.length > 0 && (
              <section>
                <h2 className="font-display text-2xl font-bold text-ink">{page.steps?.heading ?? 'How it works'}</h2>
                <ol className="mt-6 space-y-5">
                  {steps.map((s: any) => (
                    <li key={s.step} className="flex gap-4">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-600 font-display text-base font-bold text-white leading-none">
                        {s.step}
                      </span>
                      <div className="min-w-0 pt-1">
                        <h3 className="font-display font-bold text-ink">{s.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{s.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {fees.length > 0 && (
              <section>
                <h2 className="font-display text-2xl font-bold text-ink">{page.fees?.heading ?? 'Fees'}</h2>
                <div className="mt-5 overflow-x-auto rounded-2xl border border-line">
                  <table className="w-full min-w-[18rem] text-left text-sm">
                    <thead className="bg-[color:var(--surface-sunken)] text-xs uppercase tracking-wide text-ink-soft">
                      <tr>
                        <th className="px-4 py-3 font-bold">Section</th>
                        <th className="px-4 py-3 font-bold">Per term</th>
                        <th className="hidden px-4 py-3 font-bold sm:table-cell">Included</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line bg-[color:var(--surface-raised)]">
                      {fees.map((f: any) => (
                        <tr key={f.section}>
                          <td className="px-4 py-3 font-semibold text-ink">{f.section}</td>
                          <td className="px-4 py-3 tabular-nums text-ink">{f.term}</td>
                          <td className="hidden px-4 py-3 text-ink-soft sm:table-cell">{f.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-sm text-ink-soft">
                  Fees are billed once a term through the parent portal, and can be paid in instalments.
                  Means-tested bursaries are available. Ask us.
                </p>
              </section>
            )}

            <section className="card panel-brand p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-white">
                <Icon name="accessibility" className="h-5 w-5" />
              </span>
              <h2 className="mt-4 font-display text-lg font-bold text-ink">
                Applying with a support plan or diagnosis
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Tell us. It genuinely does not count against an application. Knowing early means we can have a
                proper conversation about what has and has not worked before, and have arrangements in place from
                the first day rather than three months in.
              </p>
            </section>
          </div>

          <aside className="min-w-0">
            <div className="space-y-6 lg:sticky lg:top-24">
              <div id="tour" className="scroll-mt-24">
                <EnquiryForm kind="tour" sourcePage="/admissions" />
              </div>

              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-line" />
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">or</span>
                <span className="h-px flex-1 bg-line" />
              </div>

              <div id="apply" className="scroll-mt-24">
                <EnquiryForm kind="application" sourcePage="/admissions" />
              </div>

              {branding.phone && (
                <p className="text-center text-sm text-ink-soft">
                  Prefer to talk? Call{' '}
                  <a className="font-semibold text-brand-600 hover:underline" href={`tel:${branding.phone}`}>
                    {branding.phone}
                  </a>
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
