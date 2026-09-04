import { Blob, DotGrid, WaveDivider } from '../../components/SiteDecor';
import SiteImage from '../../components/SiteImage';

/**
 * Banner for the inner public pages. The same visual family as the homepage
 * hero, dialled down so it frames the page rather than competing with it.
 */
export default function PageHero({ heading, body, eyebrow, mediaUrl, assetKey }:
  { heading: string; body?: string; eyebrow?: string; mediaUrl?: string | null; assetKey?: string }) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-[color:var(--surface)]">
      <Blob className="-left-20 -top-24 h-80 w-80" tone="brand" opacity={0.12} />
      <Blob className="-right-10 -bottom-28 h-72 w-72" tone="accent" opacity={0.1} />
      <DotGrid className="right-8 top-6 hidden lg:block" rows={3} cols={6} />

      {/* Optional banner artwork, sitting behind the words at low contrast. */}
      <SiteImage
        mediaUrl={mediaUrl} assetKey={assetKey} alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-[0.18]"
        fallback={null}
      />

      <div className="relative mx-auto max-w-site px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16">
        {eyebrow && (
          <span className="mb-4 inline-flex rounded-full bg-brand-600/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-brand-700">
            {eyebrow}
          </span>
        )}
        <h1 className="max-w-3xl font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-[2.75rem]">
          {heading}
        </h1>
        {body && <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft sm:text-lg">{body}</p>}
      </div>

      <WaveDivider />
    </section>
  );
}
