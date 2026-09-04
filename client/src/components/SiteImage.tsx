import { useState, type ReactNode } from 'react';
import { resolveImage } from '../lib/assets';

/**
 * Renders the right image for a slot, or falls back to artwork.
 *
 * Order: an administrator's upload, then a bundled asset, then the fallback.
 * A file that 404s or fails to decode also falls back, so a broken or deleted
 * upload degrades to the illustration rather than a torn frame.
 */
export default function SiteImage({
  mediaUrl, assetKey, alt, className = '', fallback, eager = false,
}: {
  mediaUrl?: string | null;
  assetKey?: string;
  alt: string;
  className?: string;
  fallback: ReactNode;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const sources = resolveImage(mediaUrl, assetKey);

  if (!sources || failed) return <>{fallback}</>;

  // The <img> carries the widest-support file; the sources offer better ones.
  const src = sources.fallback ?? sources.webp ?? sources.avif!;

  return (
    // display:contents so the wrapper creates no box of its own: the <img>
    // keeps behaving exactly as it did before, including h-full and absolute.
    <picture className="contents">
      {sources.avif && <source srcSet={sources.avif} type="image/avif" />}
      {sources.webp && <source srcSet={sources.webp} type="image/webp" />}
      <img
        src={src}
        alt={alt}
        className={className}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </picture>
  );
}
