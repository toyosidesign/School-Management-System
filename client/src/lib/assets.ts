/**
 * Image asset registry for the public site.
 *
 * Drop a file into `src/assets/images/<folder>/` and it becomes available here
 * by its filename, with no import to write. Vite fingerprints and optimises
 * anything referenced this way, which a file in `public/` would not get.
 *
 * Resolution order wherever an image is shown:
 *   1. `media_url`  an administrator uploaded it at runtime, per school
 *   2. this registry a designer shipped it with the build
 *   3. a built-in illustration, so nothing ever renders empty
 *
 * That order matters for white-labelling: a school's own upload always wins
 * over whatever artwork ships in the box.
 */

const FILES = import.meta.glob<string>(
  '../assets/images/**/*.{png,jpg,jpeg,webp,avif,svg}',
  { eager: true, import: 'default', query: '?url' }
);

/**
 * filename without extension -> the formats supplied for that slot.
 *
 * A slot may be supplied more than once, e.g. hero-home.avif alongside
 * hero-home.jpg. Modern formats are offered first and the browser picks what it
 * can decode, so a small AVIF serves most visitors without stranding the rest.
 */
export type ImageSources = { avif?: string; webp?: string; fallback?: string };

const MODERN: Record<string, keyof ImageSources> = { avif: 'avif', webp: 'webp' };

const registry: Record<string, ImageSources> = {};
for (const [filePath, url] of Object.entries(FILES)) {
  const file = filePath.split('/').pop()!;
  const ext = file.split('.').pop()!.toLowerCase();
  const key = file.replace(/\.[^.]+$/, '');
  const entry = (registry[key] ??= {});
  const slot = MODERN[ext];
  if (slot) entry[slot] = url as string;
  else entry.fallback ??= url as string;
}

/** Every slot the site knows how to fill, and what belongs in it. */
export type ImageSlot = {
  key: string;
  folder: string;
  where: string;
  ratio: string;
  size: string;
  note?: string;
};

export const IMAGE_SLOTS: ImageSlot[] = [
  { key: 'hero-home', folder: 'hero', where: 'Homepage hero', ratio: '4:3.6', size: '1200x1080',
    note: 'Cropped to an organic blob shape, so keep the subject centred.' },
  { key: 'hero-about', folder: 'hero', where: 'About page banner', ratio: '16:9', size: '1600x900' },
  { key: 'hero-admissions', folder: 'hero', where: 'Admissions banner', ratio: '16:9', size: '1600x900' },

  { key: 'about-story', folder: 'about', where: 'About, alongside the values', ratio: '4:3', size: '1000x750' },

  { key: 'learning-nursery', folder: 'learning', where: 'Learning, Early Years card', ratio: '3:2', size: '900x600' },
  { key: 'learning-primary', folder: 'learning', where: 'Learning, Primary card', ratio: '3:2', size: '900x600' },
  { key: 'learning-secondary', folder: 'learning', where: 'Learning, Secondary card', ratio: '3:2', size: '900x600' },

  { key: 'community-teachers', folder: 'community', where: 'Community, teachers section', ratio: '3:2', size: '1200x800' },
  { key: 'community-parents', folder: 'community', where: 'Community, parent voices', ratio: '3:2', size: '1200x800' },

  { key: 'news-default', folder: 'news', where: 'Fallback cover for an article with no image', ratio: '16:9', size: '1200x675' },
];

/** Every format supplied for a slot, or undefined if nothing has been added. */
export function siteImage(key: string): ImageSources | undefined {
  return registry[key];
}

/** Everything currently bundled, used by the admin screen to report coverage. */
export function bundledImages(): string[] {
  return Object.keys(registry).sort();
}

/**
 * What to actually render for a slot, honouring the resolution order above.
 * Returns null when neither source has an image, so callers fall back to an
 * illustration rather than a broken frame.
 */
export function resolveImage(mediaUrl?: string | null, key?: string): ImageSources | null {
  // An administrator's upload is a single file and always wins.
  if (mediaUrl) return { fallback: mediaUrl };
  const bundled = key ? registry[key] : undefined;
  if (!bundled) return null;
  // A modern format on its own is still usable: browsers that cannot decode it
  // trigger onError and the caller drops back to the illustration.
  return bundled.fallback || bundled.avif || bundled.webp ? bundled : null;
}
