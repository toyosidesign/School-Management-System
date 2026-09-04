import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useBranding } from '../context/BrandingContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { contrastOn } from '../lib/palette';
import Icon from './Icon';
import AccessibilityToolbar from './AccessibilityToolbar';

type SiteNavChild = { to: string; label: string; desc?: string };
type SiteNavItem = { to?: string; label: string; end?: boolean; children?: SiteNavChild[] };

/**
 * Order follows the parent journey: discover, trust, differentiate, then convert.
 *
 * The three "who we are" pages sit under one menu. That keeps the bar to five
 * items and gives Safeguarding and FAQs a home in the header, rather than being
 * reachable only from the footer, which is the wrong place for either.
 */
const BASE_NAV: SiteNavItem[] = [
  {
    label: 'Our school',
    children: [
      { to: '/about', label: 'About us', desc: 'Our story, values and leadership' },
      { to: '/why', label: 'Why families choose us', desc: 'What makes the experience different' },
      { to: '/community', label: 'Community and people', desc: 'Teachers, parents and alumni' },
      { to: '/safeguarding', label: 'Safeguarding', desc: 'Who to contact and how we keep children safe' },
      { to: '/faqs', label: 'FAQs', desc: 'The questions families actually ask' },
    ],
  },
  { to: '/learning', label: 'Learning' },
  { to: '/admissions', label: 'Admissions' },
  { to: '/news', label: 'News' },
  { to: '/contact', label: 'Contact' },
];

/** Footer groups, so statutory pages are always one click away. */
const FOOTER_GROUPS = [
  { title: 'School', links: [['/about', 'About'], ['/learning', 'Learning'], ['/why', 'Why us'], ['/community', 'Community']] },
  { title: 'Admissions', links: [['/admissions#apply', 'Apply'], ['/admissions#tour', 'Book a tour'], ['/faqs', 'FAQs'], ['/contact', 'Contact']] },
  { title: 'Information', links: [['/safeguarding', 'Safeguarding'], ['/privacy', 'Privacy'], ['/terms', 'Terms'], ['/login', 'Family portal']] },
];

/** Builds a wa.me link from the school's number and prefilled message. */
export function whatsappHref(branding: any) {
  if (!branding?.whatsapp_number) return null;
  const digits = String(branding.whatsapp_number).replace(/[^0-9]/g, '');
  if (!digits) return null;
  const text = branding.whatsapp_message ? `?text=${encodeURIComponent(branding.whatsapp_message)}` : '';
  return `https://wa.me/${digits}${text}`;
}

/** Header, footer and mobile menu shared by every public page. */
export default function SiteChrome() {
  const { branding } = useBranding();
  // The campaign page only exists in the nav when a school switches it on.
  const NAV: SiteNavItem[] = [
    ...BASE_NAV.slice(0, 2),
    ...(branding.campaign_enabled && branding.campaign_label
      ? [{ to: '/campaign', label: branding.campaign_label }] : []),
    ...BASE_NAV.slice(2),
  ];
  const whatsapp = whatsappHref(branding);
  const { setOpen } = useAccessibility();
  const [menu, setMenu] = useState(false);
  const location = useLocation();

  useEffect(() => { setMenu(false); }, [location.pathname, location.hash]);

  /**
   * React Router changes the URL but never scrolls. Without this, /admissions#tour
   * lands at the top of the page, and clicking it while already on /admissions
   * appears to do nothing at all.
   */
  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      return;
    }
    const id = location.hash.slice(1);
    // The target may not be mounted on the first frame after a route change.
    let frames = 0;
    const find = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Move focus so keyboard and screen-reader users follow the jump too.
        el.setAttribute('tabindex', '-1');
        el.focus({ preventScroll: true });
      } else if (frames++ < 20) {
        requestAnimationFrame(find);
      }
    };
    requestAnimationFrame(find);
  }, [location.pathname, location.hash]);

  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--page)]">
      <a href="#main" className="sr-only-focusable">Skip to main content</a>

      <header className="sticky top-0 z-40 border-b border-line surface-bar">
        <div className="mx-auto flex max-w-site items-center gap-3 px-4 py-3 sm:px-6 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-4">
          <div className="min-w-0 shrink-0 lg:max-w-[15rem]">
            <SiteLogo />
          </div>

          {/*
            No overflow container on this nav: overflow-x would create a scroll
            box that clips the dropdown panel hanging below the bar.
          */}
          <nav className="hidden items-center justify-center gap-0.5 lg:flex xl:gap-1" aria-label="Main">
            {NAV.map((n) =>
              n.children ? (
                <NavDropdown key={n.label} item={n} />
              ) : (
                <NavLink
                  key={n.to} to={n.to!} end={n.end}
                  className={({ isActive }) =>
                    `whitespace-nowrap rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors xl:px-3 xl:text-sm ${
                      isActive ? 'bg-brand-600/10 text-brand-700' : 'text-ink-soft hover:bg-[color:var(--surface-sunken)] hover:text-ink'
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              )
            )}
          </nav>

          <div className="ml-auto flex min-w-0 shrink-0 items-center justify-end gap-2 lg:ml-0">
            <button className="btn-subtle !px-2.5" onClick={() => setOpen(true)} aria-label="Accessibility settings"
                    title="Accessibility settings">
              <Icon name="accessibility" className="h-4 w-4" />
            </button>

            {/* Separates the utility control from the two calls to action. */}
            <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />

            <Link to="/admissions#tour" className="btn-primary hidden whitespace-nowrap !px-3.5 !py-2 !text-[13px] sm:inline-flex xl:!px-5 xl:!text-sm">
              Book a tour
            </Link>
            <Link to="/login" className="btn-ghost whitespace-nowrap !px-3 !py-2 !text-[13px] xl:!px-4">
              <Icon name="users" className="h-4 w-4" />
              <span className="hidden xs:inline">Portal</span>
            </Link>
            <button className="btn-subtle !px-2.5 lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu">
              <Icon name="menu" className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {menu && (
        <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm lg:hidden"
             onMouseDown={(e) => e.target === e.currentTarget && setMenu(false)}>
          <nav className="ml-auto flex h-full w-[84%] max-w-xs flex-col border-l border-line bg-[color:var(--surface-raised)] shadow-2xl"
               aria-label="Site menu">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <SiteLogo />
              <button className="btn-subtle !px-2.5" onClick={() => setMenu(false)} aria-label="Close menu" autoFocus>
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-3">
              {[{ to: '/', label: 'Home', end: true } as SiteNavItem, ...NAV].map((n) =>
                n.children ? (
                  <div key={n.label} className="pt-2">
                    <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint">
                      {n.label}
                    </p>
                    {n.children.map((c) => (
                      <NavLink
                        key={c.to} to={c.to}
                        className={({ isActive }) =>
                          `block rounded-xl px-3 py-3 text-sm font-semibold ${
                            isActive ? 'bg-brand-600 text-white' : 'text-ink-soft hover:bg-[color:var(--surface-sunken)]'
                          }`
                        }
                        data-tap
                      >
                        {c.label}
                      </NavLink>
                    ))}
                    <div className="mx-3 my-2 border-t border-line" />
                  </div>
                ) : (
                  <NavLink
                    key={n.to} to={n.to!} end={n.end}
                    className={({ isActive }) =>
                      `block rounded-xl px-3 py-3 text-sm font-semibold ${
                        isActive ? 'bg-brand-600 text-white' : 'text-ink-soft hover:bg-[color:var(--surface-sunken)]'
                      }`
                    }
                    data-tap
                  >
                    {n.label}
                  </NavLink>
                )
              )}
            </div>
            <div className="space-y-2 border-t border-line p-3">
              <Link to="/admissions#tour" className="btn-primary w-full">Book a tour</Link>
              <Link to="/login" className="btn-ghost w-full">Family portal login</Link>
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noreferrer" className="btn-ghost w-full">
                  <Icon name="whatsapp" className="h-4 w-4" /> Chat with us
                </a>
              )}
            </div>
          </nav>
        </div>
      )}

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <SiteFooter />

      {whatsapp && (
        <a
          href={whatsapp} target="_blank" rel="noreferrer"
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition hover:bg-emerald-700 sm:h-auto sm:w-auto sm:gap-2 sm:px-5 sm:py-3.5"
          aria-label="Chat with us on WhatsApp"
        >
          <Icon name="whatsapp" className="h-7 w-7 sm:h-5 sm:w-5" />
          <span className="hidden text-sm font-semibold sm:inline">Chat with us</span>
        </a>
      )}

      <AccessibilityToolbar />
    </div>
  );
}

/**
 * Header dropdown. Opens on click rather than hover: hover menus are unusable
 * on touch and awkward for anyone driving the page from a keyboard.
 */
function NavDropdown({ item }: { item: SiteNavItem }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const childActive = item.children!.some((c) => location.pathname === c.to);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); }
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors xl:px-3 xl:text-sm ${
          childActive || open
            ? 'bg-brand-600/10 text-brand-700'
            : 'text-ink-soft hover:bg-[color:var(--surface-sunken)] hover:text-ink'
        }`}
      >
        {item.label}
        <Icon name="chevronDown" className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-80 overflow-hidden rounded-2xl border border-line bg-[color:var(--surface-raised)] p-1.5 shadow-lg animate-fade-up"
          role="menu"
        >
          {item.children!.map((c) => (
            <NavLink
              key={c.to} to={c.to} role="menuitem"
              className={({ isActive }) =>
                `block rounded-xl px-3 py-2.5 transition-colors ${
                  isActive ? 'bg-brand-600/10' : 'hover:bg-[color:var(--surface-sunken)]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`block text-sm font-semibold ${isActive ? 'text-brand-700' : 'text-ink'}`}>
                    {c.label}
                  </span>
                  {c.desc && <span className="mt-0.5 block text-xs leading-snug text-ink-soft">{c.desc}</span>}
                </>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function SiteLogo() {
  const { branding } = useBranding();
  return (
    <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label={`${branding.name} home`}>
      {branding.logo_url ? (
        <img src={branding.logo_url} alt="" className="h-9 w-auto max-w-[10rem] object-contain" />
      ) : (
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-base font-black"
          style={{ background: branding.brand_primary, color: contrastOn(branding.brand_primary) }}
          aria-hidden="true"
        >
          {branding.monogram}
        </span>
      )}
      {!branding.logo_url && (
        <span className="min-w-0">
          <span className="block truncate font-display text-sm font-bold leading-tight text-ink sm:text-base lg:max-w-[13rem]">
            {branding.name}
          </span>
        </span>
      )}
    </Link>
  );
}

function SiteFooter() {
  const { branding } = useBranding();
  // Each entry carries the brand mark to draw and the name screen readers announce.
  const socials = [
    { field: 'facebook_url', icon: 'facebook', label: 'Facebook' },
    { field: 'instagram_url', icon: 'instagram', label: 'Instagram' },
    { field: 'x_url', icon: 'x-twitter', label: 'X' },
    { field: 'linkedin_url', icon: 'linkedin', label: 'LinkedIn' },
  ].filter((s) => (branding as any)[s.field]);

  return (
    <footer className="mt-16 border-t border-line bg-[color:var(--surface-raised)]">
      <div className="mx-auto grid max-w-site gap-8 px-4 py-12 sm:px-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <SiteLogo />
          {branding.tagline && <p className="mt-3 max-w-sm text-sm text-ink-soft">{branding.tagline}</p>}
          {socials.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {socials.map((s) => (
                <a
                  key={s.field}
                  href={(branding as any)[s.field]}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${branding.name} on ${s.label}`}
                  title={s.label}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-line text-ink-soft transition-colors hover:border-brand-300 hover:bg-brand-600/10 hover:text-brand-600"
                  data-tap
                >
                  <Icon name={s.icon} className="h-[18px] w-[18px]" />
                </a>
              ))}
            </div>
          )}
          <p className="mt-6 text-xs leading-relaxed text-ink-faint">
            &copy; {new Date().getFullYear()} {branding.name}. Academic year {branding.academic_year}.
            <br />Accessible to WCAG 2.1 AA.
          </p>
        </div>

        {FOOTER_GROUPS.map((group) => (
          <div key={group.title} className="lg:col-span-2">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-soft">{group.title}</h2>
            <ul className="space-y-2 text-sm">
              {group.links.map(([to, label]) => (
                <li key={to}>
                  <Link to={to} className="text-ink-soft hover:text-ink hover:underline">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="lg:col-span-2">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-soft">Get in touch</h2>
          <ul className="space-y-2 text-sm text-ink-soft">
            {branding.address && <li>{branding.address}</li>}
            {branding.phone && <li><a className="hover:text-ink hover:underline" href={`tel:${branding.phone}`}>{branding.phone}</a></li>}
            {branding.email && <li className="break-words"><a className="hover:text-ink hover:underline" href={`mailto:${branding.email}`}>{branding.email}</a></li>}
            {branding.office_hours && <li className="text-ink-faint">{branding.office_hours}</li>}
          </ul>
        </div>
      </div>
    </footer>
  );
}
