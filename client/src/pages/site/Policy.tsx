import { useBranding } from '../../context/BrandingContext';
import { Readable } from '../../components/Readable';
import PageHero from './PageHero';

/** Renders a simple prose policy page (privacy, terms) from editable content. */
export default function Policy({ page: key }: { page: 'privacy' | 'terms' }) {
  const { pages, branding } = useBranding();
  const page = pages[key] ?? {};
  const paragraphs = String(page.body?.body ?? '').split('\n\n').filter(Boolean);

  return (
    <>
      <PageHero heading={page.hero?.heading ?? key} body={page.hero?.body} />
      <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <div className="space-y-4 text-[15px] leading-relaxed text-ink">
          {paragraphs.map((p, i) => <Readable key={i} text={p} />)}
        </div>
        <p className="mt-10 border-t border-line pt-5 text-sm text-ink-faint">
          Questions about this page? Contact {branding.email ?? 'the school office'}.
        </p>
      </article>
    </>
  );
}
