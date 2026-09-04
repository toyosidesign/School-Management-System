import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { useBranding } from '../context/BrandingContext';
import { contrastOn } from '../lib/palette';
import { api } from '../lib/api';
import { relative } from '../lib/format';
import Icon from './Icon';
import { Avatar } from './ui';
import AccessibilityToolbar from './AccessibilityToolbar';

type NavItem = { to: string; label: string; icon: string; short?: string; group?: 'setup' | 'support' };

const NAV: Record<string, NavItem[]> = {
  // Ordered the way a school is actually built and then run: the structure
  // first, because classes cannot exist without sections and subjects, then
  // the work of a term, then the things consulted rather than done.
  admin: [
    { to: '/admin', label: 'Dashboard', icon: 'dashboard', short: 'Home' },

    { to: '/admin/sections', label: 'Sections', icon: 'home', short: 'Sections', group: 'setup' },
    { to: '/admin/subjects', label: 'Subjects', icon: 'book', short: 'Subjects', group: 'setup' },
    { to: '/admin/classes', label: 'Classes', icon: 'book', short: 'Classes', group: 'setup' },
    { to: '/admin/timetable', label: 'Timetable', icon: 'calendar', short: 'Timetable', group: 'setup' },
    { to: '/admin/staff', label: 'Staff', icon: 'users', group: 'setup' },
    { to: '/admin/students', label: 'Students', icon: 'users', group: 'setup' },
    { to: '/admin/invitations', label: 'Invitations', icon: 'mail', short: 'Invites', group: 'setup' },

    // Pupil absence and staff leave are answered on Requests, which gathers
    // both. Their own pages are still there, reached from the row they belong
    // to, rather than sitting in the sidebar asking to be checked separately.
    { to: '/admin/requests', label: 'Requests', icon: 'slip', short: 'Requests' },
    { to: '/admin/admissions', label: 'Admissions inbox', icon: 'slip', short: 'Enquiries' },
    { to: '/admin/sen', label: 'SEN register', icon: 'accessibility', short: 'SEN' },
    { to: '/messages', label: 'Messages', icon: 'message' },
    { to: '/calendar', label: 'Calendar', icon: 'calendar' },
    { to: '/admin/fees', label: 'Fees & billing', icon: 'money', short: 'Fees' },
    { to: '/admin/finance', label: 'Finance', icon: 'chart', short: 'Finance' },

    { to: '/admin/website', label: 'Website & branding', icon: 'globe', short: 'Website', group: 'support' },
    { to: '/settings', label: 'Settings', icon: 'settings', group: 'support' },
    { to: '/admin/audit', label: 'Audit log', icon: 'shield', short: 'Audit', group: 'support' },
  ],
  teacher: [
    { to: '/teacher', label: 'Dashboard', icon: 'dashboard', short: 'Home' },
    { to: '/teacher/attendance', label: 'Attendance', icon: 'attendance' },
    { to: '/teacher/assignments', label: 'Assignments', icon: 'assignment', short: 'Work' },
    { to: '/teacher/materials', label: 'Lesson recaps', icon: 'video', short: 'Recaps' },
    { to: '/teacher/students', label: 'My students', icon: 'users', short: 'Students' },
    { to: '/teacher/leave', label: 'Leave requests', icon: 'leave', short: 'Leave' },
    { to: '/teacher/my-leave', label: 'My leave', icon: 'calendar', short: 'My leave' },
    { to: '/teacher/nursery', label: 'Daily log', icon: 'baby', short: 'Log' },
    { to: '/messages', label: 'Messages', icon: 'message', group: 'support' },
    { to: '/calendar', label: 'Calendar', icon: 'calendar', group: 'support' },
    { to: '/teacher/feedback', label: 'My feedback', icon: 'star', short: 'Feedback', group: 'support' },
    { to: '/settings', label: 'Settings', icon: 'settings', group: 'support' },
  ],
  student: [
    { to: '/student', label: 'Dashboard', icon: 'dashboard', short: 'Home' },
    { to: '/student/catch-up', label: 'Catch-Up Hub', icon: 'catchup', short: 'Catch-up' },
    { to: '/student/assignments', label: 'Assignments', icon: 'assignment', short: 'Work' },
    { to: '/student/subjects', label: 'Subjects', icon: 'book', short: 'Subjects' },
    { to: '/student/library', label: 'Library', icon: 'book', short: 'Library' },
    { to: '/calendar', label: 'Calendar', icon: 'calendar', group: 'support' },
    { to: '/messages', label: 'Messages', icon: 'message', group: 'support' },
    { to: '/settings', label: 'Settings', icon: 'settings', group: 'support' },
  ],
  parent: [
    { to: '/parent', label: 'Dashboard', icon: 'dashboard', short: 'Home' },
    { to: '/parent/progress', label: 'Progress', icon: 'chart' },
    { to: '/parent/timeline', label: 'Daily timeline', icon: 'baby', short: 'Timeline' },
    { to: '/parent/catch-up', label: 'Catch-Up Hub', icon: 'catchup', short: 'Catch-up' },
    { to: '/parent/fees', label: 'Fees', icon: 'money' },
    { to: '/messages', label: 'Messages', icon: 'message', group: 'support' },
    { to: '/parent/slips', label: 'Permission slips', icon: 'slip', short: 'Slips', group: 'support' },
    { to: '/parent/leave', label: 'Leave requests', icon: 'leave', short: 'Leave', group: 'support' },
    { to: '/parent/feedback', label: 'Rate teachers', icon: 'star', short: 'Rate', group: 'support' },
    { to: '/calendar', label: 'Calendar', icon: 'calendar', group: 'support' },
  ],
};

const SEARCH_PLACEHOLDER: Record<string, string> = {
  admin: 'Search students, staff, invoices',
  teacher: 'Search students, assignments',
  student: 'Search subjects, assignments, books',
  parent: 'Search messages, fees, slips',
};

/** Sends a global search to the page that can actually answer it for this role. */
const searchTarget = (role: string, q: string) => ({
  admin: `/admin/students?q=${encodeURIComponent(q)}`,
  teacher: `/teacher/students?q=${encodeURIComponent(q)}`,
  student: `/student/library?q=${encodeURIComponent(q)}`,
  parent: `/messages?q=${encodeURIComponent(q)}`,
}[role] ?? '/');

const ROLE_SECTION: Record<string, string> = {
  admin: 'Administration', teacher: 'Teaching', student: 'Learning', parent: 'My children',
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administration', teacher: 'Teaching staff', student: 'Student', parent: 'Parent / Guardian',
};

export default function Shell() {
  const { user, logout, activeChild, setActiveChildId } = useAuth();
  const { prefs, set, setOpen } = useAccessibility();
  const { branding } = useBranding();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [bell, setBell] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  const items = NAV[user.role] ?? [];
  const primary = items.filter((i) => !i.group).slice(0, 5);
  const setupNav = items.filter((i) => i.group === 'setup');
  const mainNav = items.filter((i) => !i.group);
  const supportNav = items.filter((i) => i.group === 'support');

  const NavGroups = () => (
    <>
      {setupNav.length > 0 ? (
        <>
          {mainNav.slice(0, 1).map((item) => <SideLink key={item.to} item={item} />)}
          <p className="nav-heading">Set up the school</p>
          {setupNav.map((item) => <SideLink key={item.to} item={item} />)}
          <div className="mx-3 mt-4 border-t border-line" />
          <p className="nav-heading">Running the school</p>
          {mainNav.slice(1).map((item) => <SideLink key={item.to} item={item} />)}
        </>
      ) : (
        <>
          <p className="nav-heading">{ROLE_SECTION[user.role] ?? 'Main'}</p>
          {mainNav.map((item) => <SideLink key={item.to} item={item} />)}
        </>
      )}
      {supportNav.length > 0 && (
        <>
          <div className="mx-3 mt-4 border-t border-line" />
          <p className="nav-heading">Support</p>
          {supportNav.map((item) => <SideLink key={item.to} item={item} />)}
        </>
      )}
    </>
  );

  useEffect(() => { setDrawer(false); setBell(false); }, [location.pathname]);

  useEffect(() => {
    const load = () => api.get('/notifications').then(setNotifications).catch(() => {});
    load();
    const t = setInterval(load, 45_000);
    return () => clearInterval(t);
  }, []);

  const unread = notifications.filter((n) => !n.read_at).length;

  const markRead = async () => {
    await api.post('/notifications/read', {});
    setNotifications((v) => v.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  };

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only-focusable">Skip to main content</a>

      {/* ── Desktop sidebar ── */}
      <nav
        className="hidden w-[17rem] shrink-0 flex-col border-r border-line bg-[color:var(--surface-raised)] lg:sticky lg:top-0 lg:flex lg:h-screen"
        aria-label="Main navigation"
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          {branding.logo_url ? (
            <img src={branding.logo_url} alt="" className="h-9 w-auto max-w-[9rem] object-contain" />
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl font-black"
                  style={{ background: branding.brand_primary, color: contrastOn(branding.brand_primary) }}>
              {branding.monogram}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-display text-sm font-bold leading-tight text-ink">{branding.name}</span>
            <span className="block text-[11px] text-ink-faint">{ROLE_LABEL[user.role]}</span>
          </span>
        </div>

        <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          <NavGroups />
        </div>

        <div className="border-t border-line p-3">
          <a href="/" className="btn-ghost w-full justify-start" title="Open the public website">
            <Icon name="globe" className="h-4 w-4" />
            View public site
          </a>
        </div>
      </nav>

      {/* ── Mobile / tablet top bar ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-1.5 border-b border-line surface-bar px-2.5 py-2.5 lg:hidden">
          <button className="btn-subtle !px-2.5" onClick={() => setDrawer(true)} aria-label="Open navigation menu">
            <Icon name="menu" />
          </button>
          <span className="min-w-0 flex-1 truncate font-display text-sm font-bold text-ink">{branding.name}</span>
          <HeaderActions
            unread={unread} onBell={() => setBell((v) => !v)}
            focus={!!prefs.focus_mode} onFocus={() => set({ focus_mode: prefs.focus_mode ? 0 : 1 })}
            onAccess={() => setOpen(true)}
            user={user} onLogout={logout}
          />
        </header>

        {/* ── Desktop top bar ── */}
        <header className="sticky top-0 z-40 hidden items-center gap-4 border-b border-line surface-bar px-8 py-3.5 lg:flex">
          <form
            className="relative w-full max-w-md"
            onSubmit={(e) => { e.preventDefault(); const q = (e.currentTarget.elements.namedItem('q') as HTMLInputElement)?.value.trim(); if (q) navigate(searchTarget(user.role, q)); }}
          >
            <label className="sr-only" htmlFor="global-search">Search</label>
            <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input id="global-search" name="q" type="search" className="input !py-2.5 !pl-10"
                   placeholder={SEARCH_PLACEHOLDER[user.role] ?? 'Search'} />
          </form>
          {user.role === 'parent' && user.children?.length > 1 && (
            <ChildSwitcher children_={user.children} active={activeChild} onPick={setActiveChildId} />
          )}
          {user.role === 'parent' && user.children?.length === 1 && (
            <span className="text-sm text-ink-soft">
              Viewing <b className="text-ink">{activeChild?.first_name} {activeChild?.last_name}</b> · {activeChild?.class_name}
            </span>
          )}
          <div className="flex-1" />
          <HeaderActions
            unread={unread} onBell={() => setBell((v) => !v)}
            focus={!!prefs.focus_mode} onFocus={() => set({ focus_mode: prefs.focus_mode ? 0 : 1 })}
            onAccess={() => setOpen(true)}
            user={user} onLogout={logout} showName
          />
        </header>

        {/* Mobile child switcher sits under the top bar */}
        {user.role === 'parent' && user.children?.length > 1 && (
          <div className="border-b border-line bg-[color:var(--surface-raised)] px-3 py-2 lg:hidden">
            <ChildSwitcher children_={user.children} active={activeChild} onPick={setActiveChildId} />
          </div>
        )}

        <main id="main" className="flex-1 px-3 pb-28 pt-5 sm:px-8 sm:pb-12 sm:pt-8 lg:pb-14">
          <div className="mx-auto w-full max-w-[78rem]">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ── Mobile bottom nav (persistent, 48px targets) ── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line surface-bar px-1 pt-1 pb-safe lg:hidden"
        aria-label="Primary navigation"
      >
        {primary.map((item) => (
          <NavLink
            key={item.to} to={item.to} end={item.to.split('/').length <= 2}
            className={({ isActive }) =>
              `flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-semibold leading-tight ${
                isActive ? 'text-brand-600' : 'text-ink-faint'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={item.icon} className="h-5 w-5" strokeWidth={isActive ? 2.2 : 1.8} />
                <span className="truncate">{item.short ?? item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Mobile drawer with the full menu ── */}
      {drawer && (
        <div className="fixed inset-0 z-[70] flex bg-slate-900/50 backdrop-blur-sm lg:hidden"
             onMouseDown={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <nav className="flex h-full w-[86%] max-w-xs flex-col border-r border-line bg-[color:var(--surface-raised)] shadow-2xl"
               aria-label="All sections">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3.5">
              <span className="min-w-0 truncate font-display text-sm font-bold text-ink">{branding.name}</span>
              <button className="btn-subtle !px-2.5" onClick={() => setDrawer(false)} aria-label="Close menu" autoFocus>
                <Icon name="x" />
              </button>
            </div>
            <div className="flex-1 space-y-0.5 overflow-y-auto p-3">
              <NavGroups />
            </div>
            <div className="border-t border-line p-3">
              <a href="/" className="btn-ghost w-full justify-start">
                <Icon name="globe" className="h-4 w-4" /> View public site
              </a>
            </div>
          </nav>
        </div>
      )}

      {/* ── Notification panel ── */}
      {bell && (
        <div className="fixed inset-0 z-[75]" onMouseDown={() => setBell(false)}>
          <div
            className="absolute right-2 top-14 max-h-[70vh] w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-line bg-[color:var(--surface-raised)] shadow-2xl lg:right-6"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog" aria-label="Notifications"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-bold text-ink">Notifications</h2>
              {unread > 0 && <button className="text-xs font-semibold text-brand-600 hover:underline" onClick={markRead}>Mark all read</button>}
            </div>
            <div className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {notifications.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-faint">Nothing new right now.</p>}
              {notifications.map((n) => (
                <NavLink
                  key={n.id} to={n.link ?? '#'} onClick={() => setBell(false)}
                  className={`block px-4 py-3 hover:bg-[color:var(--surface-sunken)] ${!n.read_at ? 'bg-brand-600/5' : ''}`}
                >
                  <span className="flex items-start gap-2">
                    {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{n.title}</span>
                      {n.body && <span className="mt-0.5 block text-xs text-ink-soft">{n.body}</span>}
                      <span className="mt-1 block text-[11px] text-ink-faint">{relative(n.created_at)}</span>
                    </span>
                  </span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      <AccessibilityToolbar />
    </div>
  );
}

function SideLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to} end={item.to.split('/').length <= 2}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors ${
          isActive
            ? 'bg-brand-600/10 font-semibold text-brand-700'
            : 'font-medium text-ink-soft hover:bg-[color:var(--surface-sunken)] hover:text-ink'
        }`
      }
      data-tap
    >
      <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}

/**
 * Header controls, grouped by what they are for.
 *
 *   focus  accessibility  language  |  notifications  |  account
 *
 * Each control sits on its own tinted key, so it reads as a button before it
 * is hovered: an icon alone on a bar is a guess. The first three all change
 * how the interface looks and reads for this person, so they sit together;
 * alerts and identity each get their own space.
 */
function HeaderActions({ unread, onBell, focus, onFocus, onAccess, user, onLogout, showName }: any) {
  const iconBtn =
    'grid h-9 min-w-9 place-items-center rounded-xl border border-line px-2 text-ink-soft ' +
    'bg-[color:var(--surface-sunken)] transition-colors ' +
    'hover:border-brand-300 hover:bg-[color:var(--surface)] hover:text-ink';

  return (
    <div className="flex items-center gap-1.5">
      {/* Display and reading preferences */}
      <button
        onClick={onFocus}
        aria-pressed={focus}
        aria-label="Focus mode"
        title={`Focus mode ${focus ? 'on' : 'off'} (Alt+F)`}
        className={focus ? `${iconBtn} !border-brand-300 !bg-brand-100 !text-brand-800` : iconBtn}
        data-tap
      >
        <Icon name="focus" className="h-[18px] w-[18px]" />
      </button>
      <button
        onClick={onAccess}
        aria-label="Accessibility settings"
        title="Accessibility settings (Alt+A)"
        className={iconBtn}
        data-tap
      >
        <Icon name="accessibility" className="h-[18px] w-[18px]" />
      </button>
      <LanguageMenu user={user} className={iconBtn} />

      <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />

      {/* Alerts */}
      <button
        onClick={onBell}
        className={`${iconBtn} relative`}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <Icon name="bell" className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 grid h-4 min-w-[1rem] place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />

      {/* Identity */}
      <ProfileMenu user={user} onLogout={onLogout} onAccess={onAccess} showName={showName} />
    </div>
  );
}

/**
 * Language for this person's account. It is what messages from the school are
 * translated into as they arrive, so it belongs beside the other reading
 * preferences rather than buried in settings.
 */
function LanguageMenu({ user, className }: any) {
  const { refresh } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [languages, setLanguages] = useState<Record<string, string>>({ en: 'English' });
  const [busy, setBusy] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const current = user.locale ?? 'en';

  useEffect(() => {
    api.get('/languages').then(setLanguages).catch(() => {});
  }, []);

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
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open]);

  const pick = async (code: string) => {
    if (code === current) { setOpen(false); return; }
    setBusy(code);
    try {
      await api.patch('/auth/profile', { locale: code });
      await refresh();
      toast(`Language set to ${languages[code] ?? code}.`);
      setOpen(false);
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`${className} !flex w-auto items-center gap-1.5 !px-2.5`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Language, currently ${languages[current] ?? current}`}
        title="Language"
        data-tap
      >
        <Icon name="globe" className="h-[18px] w-[18px]" />
        <span className="text-[11px] font-bold uppercase tracking-wide">{current}</span>
      </button>

      {open && (
        <div
          role="menu" aria-label="Language"
          className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-line bg-[color:var(--surface-raised)] shadow-xl"
        >
          <p className="border-b border-line px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            Language
          </p>
          <ul className="py-1">
            {Object.entries(languages).map(([code, name]) => (
              <li key={code}>
                <button
                  role="menuitemradio" aria-checked={code === current}
                  onClick={() => pick(code)} disabled={!!busy}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors ${
                    code === current ? 'font-bold text-brand-700' : 'text-ink hover:bg-[color:var(--surface-sunken)]'
                  }`}
                >
                  <span className="w-7 shrink-0 text-[11px] font-bold uppercase tracking-wide text-ink-faint">{code}</span>
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  {busy === code
                    ? <span className="text-xs text-ink-faint">...</span>
                    : code === current && <Icon name="check" className="h-4 w-4 shrink-0" />}
                </button>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-3.5 py-2.5 text-[11px] leading-relaxed text-ink-faint">
            Messages from the school are translated into this language as they arrive.
          </p>
        </div>
      )}
    </div>
  );
}

const ROLE_TITLE: Record<string, string> = {
  admin: 'Administrator', teacher: 'Teacher', student: 'Student', parent: 'Parent / Guardian',
};

/**
 * Account menu in the top bar. Holds identity, the accessibility shortcut and
 * sign out, so the sidebar can stay purely navigational.
 */
function ProfileMenu({ user, onLogout, onAccess, showName }: any) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        aria-haspopup="menu"
        aria-label={`Account menu for ${user.first_name} ${user.last_name}`}
        className={`flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition-colors ${
          open ? 'bg-[color:var(--surface-sunken)]' : 'hover:bg-[color:var(--surface-sunken)]'
        }`}
        data-tap
      >
        <Avatar first={user.first_name} last={user.last_name} colour={user.avatar_colour} emoji={user.avatar_emoji} src={user.avatar_url} size="sm" />
        {showName && (
          <span className="hidden min-w-0 text-left xl:block">
            <span className="block max-w-[9rem] truncate text-[13px] font-semibold leading-tight text-ink">
              {user.preferred_name || user.first_name} {user.last_name}
            </span>
            <span className="block text-[11px] leading-tight text-ink-faint">{ROLE_TITLE[user.role]}</span>
          </span>
        )}
        <Icon name="chevronDown" className={`h-4 w-4 shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-[75] w-[17.5rem] overflow-hidden rounded-2xl border border-line bg-[color:var(--surface-raised)] shadow-lg animate-fade-up"
        >
          <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
            <Avatar first={user.first_name} last={user.last_name} colour={user.avatar_colour} emoji={user.avatar_emoji} src={user.avatar_url} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-ink">{user.first_name} {user.last_name}</span>
              <span className="block truncate text-xs text-ink-soft">{ROLE_TITLE[user.role]}</span>
              <span className="block truncate text-[11px] text-ink-faint">{user.email}</span>
            </span>
          </div>

          <div className="p-1.5">
            <button
              role="menuitem"
              onClick={() => { setOpen(false); onAccess(); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink-soft hover:bg-[color:var(--surface-sunken)] hover:text-ink"
              data-tap
            >
              <Icon name="accessibility" className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Accessibility settings</span>
              <kbd className="shrink-0 rounded border border-line px-1.5 text-[10px] text-ink-faint">Alt A</kbd>
            </button>

            <NavLink
              role="menuitem" to="/settings"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink-soft hover:bg-[color:var(--surface-sunken)] hover:text-ink"
              data-tap
            >
              <Icon name="settings" className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">My settings</span>
            </NavLink>

            <a
              role="menuitem" href="/"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink-soft hover:bg-[color:var(--surface-sunken)] hover:text-ink"
              data-tap
            >
              <Icon name="globe" className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">View public site</span>
            </a>
          </div>

          <div className="border-t border-line p-1.5">
            <button
              role="menuitem" onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
              data-tap
            >
              <Icon name="logout" className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChildSwitcher({ children_, active, onPick }: any) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto" role="tablist" aria-label="Choose a child">
      {children_.map((c: any) => (
        <button
          key={c.id} role="tab" aria-selected={active?.id === c.id} onClick={() => onPick(c.id)}
          className={`flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1.5 text-sm font-semibold transition ${
            active?.id === c.id ? 'border-brand-600 bg-brand-600/10 text-brand-700' : 'border-line text-ink-soft hover:text-ink'
          }`}
          data-tap
        >
          <Avatar first={c.first_name} last={c.last_name} colour={c.avatar_colour} src={c.avatar_url} emoji={c.avatar_emoji} size="sm" />
          <span className="whitespace-nowrap">{c.first_name}</span>
          <span className="hidden whitespace-nowrap text-xs font-normal text-ink-faint sm:inline">{c.class_name}</span>
        </button>
      ))}
    </div>
  );
}
