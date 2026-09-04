import { useBranding } from '../../context/BrandingContext';
import Icon from '../../components/Icon';
import PageHero from './PageHero';
import EnquiryForm from './EnquiryForm';

export default function Contact() {
  const { branding, pages } = useBranding();
  const page = pages.contact ?? {};

  const details = [
    ['home', 'Address', branding.address],
    ['message', 'Phone', branding.phone, `tel:${branding.phone}`],
    ['file', 'Email', branding.email, `mailto:${branding.email}`],
    ['clock', 'Office hours', branding.office_hours],
  ].filter(([, , value]) => !!value) as [string, string, string, string?][];

  return (
    <>
      <PageHero heading={page.hero?.heading ?? 'Contact us'} body={page.hero?.body} />

      <div className="mx-auto max-w-site px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold text-ink">School office</h2>
            <dl className="mt-6 space-y-5">
              {details.map(([icon, label, value, href]) => (
                <div key={label} className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600/10 text-brand-600">
                    <Icon name={icon} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs font-bold uppercase tracking-wide text-ink-soft">{label}</dt>
                    <dd className="mt-0.5 text-ink">
                      {href ? <a className="hover:text-brand-600 hover:underline" href={href}>{value}</a> : value}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>

            {branding.map_embed_url ? (
              <div className="mt-8 overflow-hidden rounded-2xl border border-line">
                <iframe
                  src={branding.map_embed_url} title={`Map showing ${branding.name}`}
                  className="h-72 w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            ) : (
              <div className="mt-8 grid h-48 place-items-center rounded-2xl border border-dashed border-line text-center">
                <p className="px-6 text-sm text-ink-faint">
                  A map appears here once an embed URL is added in the website settings.
                </p>
              </div>
            )}

            <div className="card mt-8 p-5">
              <h3 className="font-display font-bold text-ink">Already part of the school?</h3>
              <p className="mt-1.5 text-sm text-ink-soft">
                For anything about a child already with us, the parent portal is faster than email. You can message
                teachers directly, report an absence and see progress in one place.
              </p>
              <a href="/login" className="btn-ghost mt-3">
                <Icon name="users" className="h-4 w-4" /> Go to the portal
              </a>
            </div>
          </div>

          <div className="min-w-0">
            <EnquiryForm kind="enquiry" sourcePage="/contact" />
          </div>
        </div>
      </div>
    </>
  );
}
