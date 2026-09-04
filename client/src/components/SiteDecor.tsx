/**
 * Decorative furniture for the public site: organic blobs, dot grids and the
 * curved dividers that stop every section meeting in a hard straight line.
 *
 * All of it is brand-derived rather than hardcoded, purely presentational, and
 * hidden from assistive technology. The low-sensory accessibility mode strips
 * the animation via the global rule in index.css.
 */

/** Soft organic shape used behind and around imagery. */
export function Blob({ className = '', tone = 'brand', opacity = 0.14 }:
  { className?: string; tone?: 'brand' | 'accent'; opacity?: number }) {
  const fill = tone === 'accent' ? 'rgb(var(--accent-500))' : 'rgb(var(--brand-500))';
  return (
    <svg viewBox="0 0 200 200" className={`pointer-events-none absolute ${className}`} aria-hidden="true">
      <path
        fill={fill} fillOpacity={opacity}
        d="M46.2,-58.5C58.9,-49.1,68,-34.4,72.2,-18.2C76.4,-2,75.7,15.7,68.5,30.2C61.3,44.7,47.6,56,32.3,63.4C17,70.8,0.1,74.3,-16.9,71.6C-33.9,68.9,-51,60,-61.8,46C-72.6,32,-77.1,12.9,-74.6,-4.9C-72.1,-22.7,-62.6,-39.2,-49.3,-49C-36,-58.8,-18,-61.9,-0.7,-61C16.6,-60.1,33.3,-67.9,46.2,-58.5Z"
        transform="translate(100 100)"
      />
    </svg>
  );
}

/** The scattered dot grid that appears in most modern school sites. */
export function DotGrid({ className = '', rows = 5, cols = 8 }:
  { className?: string; rows?: number; cols?: number }) {
  return (
    <svg
      className={`pointer-events-none absolute ${className}`}
      width={cols * 14} height={rows * 14} aria-hidden="true"
    >
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <circle key={`${r}-${c}`} cx={c * 14 + 3} cy={r * 14 + 3} r="3"
                  fill="rgb(var(--brand-400))" fillOpacity="0.45" />
        ))
      )}
    </svg>
  );
}

/** Curved divider so sections flow into each other rather than butting up. */
export function WaveDivider({ flip = false, className = '', fill = 'var(--page)' }:
  { flip?: boolean; className?: string; fill?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-x-0 ${flip ? 'top-0' : 'bottom-0'} ${className}`} aria-hidden="true">
      <svg
        viewBox="0 0 1440 80" preserveAspectRatio="none"
        className={`h-10 w-full sm:h-16 ${flip ? 'rotate-180' : ''}`}
      >
        <path fill={fill} d="M0,40 C240,90 480,0 720,25 C960,50 1200,85 1440,45 L1440,80 L0,80 Z" />
      </svg>
    </div>
  );
}

/** A friendly shape composition, used when a school has not uploaded a photo. */
export function HeroIllustration() {
  return (
    <svg viewBox="0 0 420 380" className="h-full w-full" role="img" aria-label="Illustration of a classroom">
      <defs>
        <linearGradient id="hero-g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgb(var(--brand-400))" />
          <stop offset="100%" stopColor="rgb(var(--brand-600))" />
        </linearGradient>
        <linearGradient id="hero-g2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgb(var(--accent-400))" />
          <stop offset="100%" stopColor="rgb(var(--accent-600))" />
        </linearGradient>
      </defs>

      {/* Desk and figures, abstracted into simple shapes */}
      <circle cx="210" cy="180" r="140" fill="rgb(var(--brand-100))" />
      <circle cx="150" cy="150" r="34" fill="url(#hero-g1)" />
      <rect x="112" y="192" width="76" height="72" rx="30" fill="url(#hero-g1)" />
      <circle cx="258" cy="160" r="28" fill="url(#hero-g2)" />
      <rect x="228" y="196" width="62" height="60" rx="26" fill="url(#hero-g2)" />

      {/* Open book */}
      <path d="M126 272 h72 v40 h-72 z" fill="rgb(var(--surface-raised))" opacity="0.95" />
      <path d="M198 272 h72 v40 h-72 z" fill="rgb(var(--surface-raised))" opacity="0.8" />
      <path d="M198 272 v40" stroke="rgb(var(--brand-300))" strokeWidth="3" />
      <rect x="112" y="308" width="196" height="12" rx="6" fill="rgb(var(--brand-300))" />

      {/* Floating bits of colour */}
      <circle cx="340" cy="90" r="14" fill="rgb(var(--accent-500))" fillOpacity="0.7" />
      <circle cx="72" cy="110" r="9" fill="rgb(var(--brand-500))" fillOpacity="0.6" />
      <rect x="330" y="250" width="22" height="22" rx="7" fill="rgb(var(--brand-500))" fillOpacity="0.5"
            transform="rotate(20 341 261)" />
      <path d="M64 250 l10 18 l-20 0 z" fill="rgb(var(--accent-500))" fillOpacity="0.55" />
    </svg>
  );
}

/** Overlapping initials, standing in for the families a school serves. */
export function AvatarStack({ names }: { names: string[] }) {
  const tones = ['var(--brand-500)', 'var(--accent-500)', 'var(--brand-700)', 'var(--accent-600)'];
  return (
    <div className="flex -space-x-2.5" aria-hidden="true">
      {names.slice(0, 4).map((n, i) => (
        <span
          key={n}
          className="grid h-9 w-9 place-items-center rounded-full text-[11px] font-bold text-white ring-2 ring-[color:var(--surface-raised)] leading-none"
          style={{ background: `rgb(${tones[i % tones.length]})` }}
        >
          {n}
        </span>
      ))}
    </div>
  );
}

export function Stars({ rating = 5 }: { rating?: number }) {
  return (
    <span className="flex gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 24 24" className="h-4 w-4"
             fill={n <= Math.round(rating) ? '#f59e0b' : 'rgb(var(--brand-200))'}>
          <path d="m12 2 3 6.6 7 .9-5.2 4.8 1.4 7L12 17.8 5.8 21.3l1.4-7L2 9.5l7-.9L12 2Z" />
        </svg>
      ))}
    </span>
  );
}
