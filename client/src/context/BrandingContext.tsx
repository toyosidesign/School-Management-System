import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { applyBrand } from '../lib/palette';

export type Branding = {
  name: string; short_name: string; tagline?: string;
  logo_url?: string | null; monogram: string; favicon_emoji: string; favicon_url?: string | null;
  brand_primary: string; brand_accent: string; heading_font: string;
  established_year?: string; address?: string; phone?: string; email?: string;
  office_hours?: string; map_embed_url?: string;
  facebook_url?: string; instagram_url?: string; x_url?: string; linkedin_url?: string;
  academic_year: string; currency: string; section_labels?: string | null;
  admissions_open: number; tours_open: number;
  whatsapp_number?: string; whatsapp_message?: string;
  campaign_enabled: number; campaign_label?: string;
  campaign_slug?: string; campaign_target_date?: string;
};

type Value = {
  branding: Branding;
  pages: Record<string, Record<string, any>>;
  stats: Record<string, number>;
  sections: any[];
  loading: boolean;
  reload: () => Promise<void>;
  /** Live preview without saving, used by the branding editor. */
  preview: (patch: Partial<Branding> | null) => void;
};

const FALLBACK: Branding = {
  name: 'Your School', short_name: 'School', monogram: 'S', favicon_emoji: '\u{1F393}',
  brand_primary: '#2563eb', brand_accent: '#7c3aed', heading_font: 'Inter',
  academic_year: '2026/2027', currency: 'USD', admissions_open: 1, tours_open: 1,
  campaign_enabled: 0, campaign_slug: 'campaign',
};

const Ctx = createContext<Value>(null!);
export const useBranding = () => useContext(Ctx);

/**
 * Loads the school's identity once, before anything renders, and applies it to
 * the document: colour palette, heading font, page title and favicon.
 */
export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<Branding>(FALLBACK);
  const [pages, setPages] = useState<Record<string, any>>({});
  const [stats, setStats] = useState<Record<string, number>>({});
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [override, setOverride] = useState<Partial<Branding> | null>(null);

  const reload = useCallback(async () => {
    try {
      const site = await api.get('/public/site');
      setBranding({ ...FALLBACK, ...site.settings });
      setPages(site.pages ?? {});
      setStats(site.stats ?? {});
      setSections(site.sections ?? []);
    } catch {
      // A brand-new deployment with no settings row still renders with the fallback.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const active = { ...branding, ...(override ?? {}) };

  useEffect(() => {
    applyBrand(active.brand_primary, active.brand_accent);
    document.documentElement.style.setProperty('--heading-font', `'${active.heading_font}'`);
    document.title = `${active.name}`;
    setFavicon(active.favicon_emoji, active.favicon_url);
    loadHeadingFont(active.heading_font);
  }, [active.brand_primary, active.brand_accent, active.heading_font, active.name,
      active.favicon_emoji, active.favicon_url]);

  return (
    <Ctx.Provider value={{ branding: active, pages, stats, sections, loading, reload, preview: setOverride }}>
      {children}
    </Ctx.Provider>
  );
}

/**
 * An uploaded icon wins; otherwise the chosen emoji is drawn into an SVG, so a
 * school that has no icon file still gets a tab icon of its own.
 */
function setFavicon(emoji: string, url?: string | null) {
  if (!emoji && !url) return;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text y="52" font-size="52">${emoji}</text></svg>`;
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = url ? '' : 'image/svg+xml';
  link.href = url || `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const FONT_URLS: Record<string, string> = {
  Inter: '', Lexend: '',
  Poppins: 'Poppins:wght@400;500;600;700',
  'Playfair Display': 'Playfair+Display:wght@500;600;700',
  Merriweather: 'Merriweather:wght@400;700',
  'Source Serif 4': 'Source+Serif+4:wght@400;600;700',
  Nunito: 'Nunito:wght@400;600;700',
  'DM Serif Display': 'DM+Serif+Display',
};

/** Pulls the chosen display face from Google Fonts, once. */
function loadHeadingFont(font: string) {
  const spec = FONT_URLS[font];
  if (!spec) return; // Inter and Lexend already ship in index.html
  const id = `font-${font.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  document.head.appendChild(link);
}

export const HEADING_FONTS = Object.keys(FONT_URLS);
