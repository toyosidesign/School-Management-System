import { Link } from 'react-router-dom';
import { useBranding } from '../../context/BrandingContext';
import Icon from '../../components/Icon';
import { AvatarStack, Blob, DotGrid, HeroIllustration, Stars, WaveDivider } from '../../components/SiteDecor';
import SiteImage from '../../components/SiteImage';

/**
 * Homepage hero: a split layout with the message on one side and imagery on the
 * other, plus the social proof families actually look for.
 *
 * Light rather than a saturated colour block, so photography reads properly and
 * the headline keeps full contrast. Everything decorative is brand-derived, so a
 * school changing its colour restyles the whole thing.
 */
export default function Hero() {
  const { branding, pages } = useBranding();
  const hero = pages.home?.hero ?? {};
  const proof = hero.extra?.proof;

  // Split the headline so the closing phrase can carry the brand colour.
  const heading: string = hero.heading ?? branding.name;
  const words = heading.trim().split(' ');
  const tailCount = words.length > 6 ? 3 : words.length > 3 ? 2 : 1;
  const head = words.slice(0, words.length - tailCount).join(' ');
  const tail = words.slice(words.length - tailCount).join(' ');

  return (
    <section className="relative overflow-hidden bg-[color:var(--surface)]">
      {/* Decoration sits behind everything and is hidden from screen readers. */}
      <Blob className="-left-24 -top-32 h-[26rem] w-[26rem]" tone="brand" />
      <DotGrid className="right-6 top-8 hidden lg:block" rows={4} cols={7} />

      <div className="relative mx-auto grid max-w-site gap-10 px-4 pb-20 pt-12 sm:px-6 sm:pb-28 sm:pt-16 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-14">
        {/* ── Message ── */}
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-600/10 px-3.5 py-1.5 text-xs font-bold text-brand-700 sm:text-[13px]">
            <Icon name="star" className="h-3.5 w-3.5" filled />
            {hero.extra?.eyebrow ??
              (branding.admissions_open
                ? `Admissions open for ${branding.academic_year}`
                : `Academic year ${branding.academic_year}`)}
          </span>

          <h1 className="mt-5 font-display text-[2.1rem] font-bold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]">
            {head} <span className="text-brand-600">{tail}</span>
          </h1>

          {hero.body && (
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-soft sm:text-lg">{hero.body}</p>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/admissions#tour" className="btn-primary !px-6 !py-3.5 !text-[15px]">
              {hero.extra?.primary_cta ?? 'Book a tour'}
              <Icon name="chevronRight" className="h-4 w-4" />
            </Link>
            <Link to="/admissions#apply" className="btn !border-2 !border-brand-600 !px-6 !py-3.5 !text-[15px] !text-brand-700 hover:!bg-brand-600/8">
              {hero.extra?.secondary_cta ?? 'Apply now'}
            </Link>
          </div>

          {/* ── Social proof ── */}
          {proof && (
            <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
              <AvatarStack names={proof.initials ?? ['AO', 'MJ', 'YN', 'HB']} />
              <div>
                <p className="text-sm font-semibold text-ink">{proof.label}</p>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <Stars rating={Number(proof.rating) || 5} />
                  <span className="text-xs font-semibold text-ink-soft">
                    {proof.rating}/5{proof.source ? ` · ${proof.source}` : ''}
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Imagery ── */}
        <div className="relative min-w-0">
          <div className="relative mx-auto aspect-[4/3.6] w-full max-w-md sm:max-w-lg lg:max-w-none">
            {/* Organic mask: a photograph if the school has uploaded one,
                otherwise a shape composition so it never looks unfinished. */}
            <div
              className="h-full w-full overflow-hidden bg-brand-50 shadow-xl shadow-brand-900/5"
              style={{ borderRadius: '58% 42% 47% 53% / 48% 44% 56% 52%' }}
            >
              <SiteImage
                mediaUrl={hero.media_url}
                assetKey="hero-home"
                alt={`Pupils at ${branding.name}`}
                className="h-full w-full object-cover"
                fallback={<HeroIllustration />}
                eager
              />
            </div>
          </div>
        </div>
      </div>

      <WaveDivider />
    </section>
  );
}
