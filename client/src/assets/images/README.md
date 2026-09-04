# Site images

Drop files in here and they appear on the site. No import to write, no code to
change: `src/lib/assets.ts` picks up anything in these folders automatically and
Vite fingerprints and optimises it as part of the build.

## Naming

The **filename without its extension** is the slot key. `hero/hero-home.jpg`
fills the `hero-home` slot. Anything not matching a known key is bundled but
unused, which is harmless.

| Slot key | Folder | Appears | Ratio | Suggested size |
|---|---|---|---|---|
| `hero-home` | `hero/` | Homepage hero | 4:3.6 | 1200x1080 |
| `hero-about` | `hero/` | About banner | 16:9 | 1600x900 |
| `hero-admissions` | `hero/` | Admissions banner | 16:9 | 1600x900 |
| `about-story` | `about/` | About, beside the values | 4:3 | 1000x750 |
| `learning-nursery` | `learning/` | Early Years card | 3:2 | 900x600 |
| `learning-primary` | `learning/` | Primary card | 3:2 | 900x600 |
| `learning-secondary` | `learning/` | Secondary card | 3:2 | 900x600 |
| `community-teachers` | `community/` | Community, teachers | 3:2 | 1200x800 |
| `community-parents` | `community/` | Community, parent voices | 3:2 | 1200x800 |
| `news-default` | `news/` | Article cover fallback | 16:9 | 1200x675 |

The homepage hero is cropped to an organic blob, so keep the subject centred and
allow room around the edges.

## Formats

`.webp` or `.avif` first for photographs, `.jpg` as a fallback, `.png` only for
artwork that needs transparency. Aim under 300 KB per image; these are the
largest thing a prospective parent downloads, often on mobile data.

## How this differs from an administrator upload

Files here **ship with the build** and are the same for every deployment: use
them for artwork that belongs to the product.

A school's own photography is uploaded at runtime through
**Website & branding -> Page content**, stored in `server/uploads/site/`, and
**always takes precedence** over anything bundled here. That is what makes the
platform white-label: the school's pictures win over ours.

## Licensing

Only commit images the school owns or has a licence for, and only where
photographic consent covers web use. Photographs of identifiable children need
consent on file. When in doubt, leave the slot empty: every one of them falls
back to a brand-coloured illustration rather than breaking.
