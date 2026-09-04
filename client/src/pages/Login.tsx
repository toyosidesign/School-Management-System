import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { useBranding } from '../context/BrandingContext';
import { contrastOn } from '../lib/palette';
import PasswordInput from '../components/PasswordInput';
import Icon from '../components/Icon';
import AccessibilityToolbar from '../components/AccessibilityToolbar';
import { Link } from 'react-router-dom';

/**
 * Demo accounts, ordered so the SEN and non-SEN pupil sit next to each other:
 * the contrast between them is the clearest way to see what the accessibility
 * engine actually changes.
 */
const DEMO = [
  { role: 'Admin · Head of School', email: 'admin@school.demo', icon: 'shield', note: 'Full institutional view, fees, audit log' },
  { role: 'SENCO', email: 'senco@school.demo', icon: 'accessibility', note: 'SEN register and support plans' },
  { role: 'Teacher · History', email: 'e.rossi@school.demo', icon: 'users', note: 'Grade 9, has an audio submission to grade' },
  { role: 'Teacher · Nursery', email: 'm.lin@school.demo', icon: 'baby', note: 'Daily activity log for early years' },
  { role: 'Parent · Michael Jordan', email: 'm.jordan@family.demo', icon: 'message', note: "Alex's father, French locale, translated messages" },
  { role: 'Parent · Yuki Nakamura', email: 'y.nakamura@family.demo', icon: 'users', note: 'Two children across two sections' },
];

export default function Login() {
  const { login, loginWithCode, devLoginPupil } = useAuth();
  const { setOpen } = useAccessibility();
  const { branding } = useBranding();
  const [mode, setMode] = useState<'staff' | 'pupil'>('staff');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Passw0rd!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  // A school that has never been set up has nobody who could invite anybody, so
  // the way in has to be offered here rather than found in a terminal.
  const [needsSetup, setNeedsSetup] = useState(false);
  // A deployment that takes new schools offers that here; one that holds a
  // single school offers to set it up. Both are the same question — is there a
  // way in for somebody nobody has invited yet — asked of different shapes.
  const [tenancy, setTenancy] = useState<any>(null);
  useEffect(() => {
    api.get('/public/setup-state').then((res) => setNeedsSetup(!!res.needs_setup)).catch(() => {});
    api.get('/public/tenancy').then(setTenancy).catch(() => {});
  }, []);
  // Only populated when the development sign-in is available; empty in production.
  const [devPupils, setDevPupils] = useState<any[]>([]);

  useEffect(() => {
    api.get('/auth/dev-pupils').then(setDevPupils).catch(() => setDevPupils([]));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'pupil') await loginWithCode(code);
      else await login(email.trim(), password);
    } catch (err: any) {
      setError(err.message ?? 'Sign in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const useDemo = (demoEmail: string) => {
    setMode('staff');
    setEmail(demoEmail);
    setPassword('Passw0rd!');
    setShowDemo(false);
    setError('');
  };

  return (
    <div className="min-h-screen bg-[color:var(--page)] lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* ── Brand panel (desktop only) ── */}
      <aside className="decorative-gradient relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-accent-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-2.5">
            {branding.logo_url ? (
              <img src={branding.logo_url} alt="" className="h-11 w-auto max-w-[12rem] object-contain" />
            ) : (
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 text-xl font-black backdrop-blur">
                {branding.monogram}
              </span>
            )}
            <span className="font-display text-lg font-bold">{branding.name}</span>
          </Link>
          <Link to="/" className="shrink-0 text-sm font-semibold text-white/70 hover:text-white hover:underline">
            Back to website
          </Link>
        </div>

        <div className="max-w-md">
          <h1 className="text-4xl font-bold leading-tight">
            One platform for nursery, primary and secondary.
          </h1>
          <p className="mt-4 text-white/80">
            Attendance that fills the Catch-Up Hub on its own. Assignments that accept audio, video or
            diagrams. Messages that translate as they arrive. Accessibility built into every screen,
            not bolted on afterwards.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            {[
              ['catchup', 'Missed a lesson? The recap is already waiting.'],
              ['accessibility', 'Dyslexia, ADHD, ASC and dyscalculia support as standard.'],
              ['message', 'Parents and teachers talking in their own language.'],
              ['shield', 'WCAG 2.1 AA · GDPR · COPPA · immutable audit trail.'],
            ].map(([icon, text]) => (
              <li key={text} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/15">
                  <Icon name={icon} className="h-4 w-4" />
                </span>
                <span className="text-white/85">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/50">Academic year {branding.academic_year}</p>
      </aside>

      {/* ── Form panel ── */}
      <main className="flex min-h-screen flex-col justify-center px-5 py-10 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Link to="/" className="inline-flex min-w-0 items-center gap-2.5">
              {branding.logo_url ? (
                <img src={branding.logo_url} alt="" className="h-10 w-auto max-w-[9rem] object-contain" />
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg font-black"
                      style={{ background: branding.brand_primary, color: contrastOn(branding.brand_primary) }}>
                  {branding.monogram}
                </span>
              )}
              <span className="truncate font-display text-base font-bold text-ink">{branding.name}</span>
            </Link>
            <button className="btn-subtle !px-2.5" onClick={() => setOpen(true)} aria-label="Accessibility settings">
              <Icon name="accessibility" className="h-4 w-4" />
            </button>
          </div>

          <h2 className="font-display text-2xl font-bold text-ink">Sign in</h2>
          <p className="mt-1.5 text-sm text-ink-soft">
            Pupils, parents and staff all sign in here. You will land on the right portal automatically.
          </p>

          {/* Pupils have a code, adults have a password. Separating them keeps
              both forms simple rather than one form that does two jobs. */}
          <div className="mt-6 flex gap-1 rounded-xl bg-[color:var(--surface-sunken)] p-1" role="tablist" aria-label="Who is signing in">
            {([['staff', 'Staff or parent'], ['pupil', 'I am a pupil']] as const).map(([value, label]) => (
              <button
                key={value} role="tab" aria-selected={mode === value}
                onClick={() => { setMode(value); setError(''); }}
                className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                  mode === value ? 'bg-[color:var(--surface-raised)] text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
                }`}
                data-tap
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <Icon name="warning" className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {mode === 'pupil' ? (
              <>
                <label className="block">
                  <span className="label">Your sign-in code</span>
                  <input
                    className="input text-center font-mono text-xl tracking-[0.25em]"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="ABCD-EFGH"
                    autoComplete="one-time-code"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={9}
                    required
                    autoFocus
                  />
                </label>
                <p className="flex items-start gap-2 text-xs text-ink-soft">
                  <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Your school gives you this code. There is no password to remember. If it stops working,
                  ask your teacher for a new one.
                </p>
                <button className="btn-primary w-full !py-3" type="submit" disabled={busy || code.length < 8}>
                  {busy ? 'Signing in...' : 'Sign in'}
                </button>
              </>
            ) : (
              <>
                <label className="block">
                  <span className="label">Email address</span>
                  <input
                    className="input" type="email" value={email} autoComplete="username" required autoFocus
                    onChange={(e) => setEmail(e.target.value)} placeholder="you@school.demo"
                  />
                </label>

                <label className="block">
                  <span className="label">Password</span>
                  <PasswordInput
                    value={password} autoComplete="current-password" required
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>

                <button className="btn-primary w-full !py-3" type="submit" disabled={busy || !email}>
                  {busy ? 'Signing in...' : 'Sign in'}
                </button>
              </>
            )}
          </form>

          {/* An unclaimed installation leads with it, because there is nothing
              else anybody can do here yet. A claimed one still says where the
              door is, quietly, rather than pretending there is none. */}
          {needsSetup ? (
            <Link
              to="/set-up"
              className="mt-6 flex w-full items-center justify-between rounded-xl border border-brand-300 bg-brand-50 px-4 py-3 text-left text-sm font-semibold text-brand-800 transition-colors hover:bg-brand-100"
            >
              <span className="flex items-center gap-2">
                <Icon name="sparkle" className="h-4 w-4" />
                Set up your school
              </span>
              <Icon name="chevronRight" className="h-4 w-4" />
            </Link>
          ) : tenancy?.accepting && !tenancy?.school ? (
            <Link
              to="/sign-up"
              className="mt-6 flex w-full items-center justify-between rounded-xl border border-brand-300 bg-brand-50 px-4 py-3 text-left text-sm font-semibold text-brand-800 transition-colors hover:bg-brand-100"
            >
              <span className="flex items-center gap-2">
                <Icon name="sparkle" className="h-4 w-4" />
                New here? Set up a school account
              </span>
              <Icon name="chevronRight" className="h-4 w-4" />
            </Link>
          ) : (
            <p className="mt-6 text-center text-sm text-ink-soft">
              No account yet? Your school invites you, and the link they send is what lets you in.
              {tenancy?.accepting && (
                <>
                  {' '}
                  <Link to="/sign-up" className="font-semibold text-brand-600 hover:underline">
                    New here? Set up a school account
                  </Link>
                </>
              )}
            </p>
          )}

          <div className="mt-6">
            <button
              className="flex w-full items-center justify-between rounded-xl border border-line bg-[color:var(--surface)] px-4 py-3 text-left text-sm font-semibold text-ink hover:bg-[color:var(--surface-sunken)]"
              onClick={() => setShowDemo((v) => !v)} aria-expanded={showDemo}
            >
              <span className="flex items-center gap-2">
                <Icon name="sparkle" className="h-4 w-4 text-brand-600" />
                Use a demo account
              </span>
              <Icon name={showDemo ? 'chevronDown' : 'chevronRight'} className="h-4 w-4 text-ink-faint" />
            </button>

            {showDemo && (
              <div className="mt-2 space-y-1.5 rounded-xl border border-line bg-[color:var(--surface)] p-2 animate-fade-up">
                {DEMO.map((d) => (
                  <button
                    key={d.email} onClick={() => useDemo(d.email)}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[color:var(--surface-sunken)]"
                  >
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-600/10 text-brand-600">
                      <Icon name={d.icon} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{d.role}</span>
                      <span className="block truncate text-xs text-ink-soft">{d.note}</span>
                    </span>
                  </button>
                ))}
                {devPupils.length > 0 && (
                  <>
                    <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                      Pupils
                    </p>
                    {devPupils.slice(0, 6).map((p) => (
                      <button
                        key={p.student_code}
                        onClick={async () => {
                          setError('');
                          setBusy(true);
                          try {
                            await devLoginPupil(p.student_code);
                          } catch (err: any) {
                            setError(err.message ?? 'Could not sign in');
                            setBusy(false);
                          }
                        }}
                        className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[color:var(--surface-sunken)]"
                      >
                        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-700">
                          <Icon name={p.needs?.length ? 'accessibility' : 'book'} className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink">
                            {p.first_name} {p.last_name}
                          </span>
                          <span className="block truncate text-xs text-ink-soft">
                            {p.class_name}
                            {p.needs?.length
                              ? ` · ${p.needs.join(', ')}${p.time_multiplier > 1 ? `, ${Math.round((p.time_multiplier - 1) * 100)}% extra time` : ''}`
                              : ' · no support plan'}
                          </span>
                        </span>
                      </button>
                    ))}
                  </>
                )}

                <p className="px-3 py-2 text-xs text-ink-faint">
                  Every staff and parent account uses the password{' '}
                  <code className="rounded bg-[color:var(--surface-sunken)] px-1 font-semibold">Passw0rd!</code>
                  <br />
                  {devPupils.length > 0
                    ? 'Pupils sign in one click here in development. In production they need a code issued from their record in the staff portal.'
                    : 'Pupil codes are issued from a pupil\'s record in the staff portal.'}
                </p>
              </div>
            )}
          </div>

          <button
            className="mt-6 hidden w-full items-center justify-center gap-2 text-sm font-medium text-ink-soft hover:text-ink lg:flex"
            onClick={() => setOpen(true)}
          >
            <Icon name="accessibility" className="h-4 w-4" />
            Adjust font, colour and reading settings
          </button>
        </div>
      </main>

      <AccessibilityToolbar />
    </div>
  );
}
