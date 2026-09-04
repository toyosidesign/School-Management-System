import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { contrastOn } from '../lib/palette';
import PasswordInput from '../components/PasswordInput';
import Icon from '../components/Icon';
import { Field } from '../components/ui';

const ROLE_WORD: Record<string, string> = {
  parent: 'parent or guardian', admin: 'school administrator', teacher: 'teacher',
};

const HOME: Record<string, string> = {
  admin: '/admin', teacher: '/teacher', parent: '/parent', student: '/student',
};

/** Strength is about length here, because length is what actually helps. */
function strengthOf(password: string) {
  if (password.length < 8) return { score: 0, label: 'Too short', tone: 'bg-slate-300' };
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (password.length >= 14 || variety >= 3) return { score: 3, label: 'Strong', tone: 'bg-green-500' };
  if (password.length >= 10 || variety >= 2) return { score: 2, label: 'Reasonable', tone: 'bg-amber-500' };
  return { score: 1, label: 'Weak', tone: 'bg-red-500' };
}

/**
 * Where an invited person becomes an account holder. Until they submit this
 * form, nobody, including the school, knows a password that works.
 */
export default function Activate() {
  const { token = '' } = useParams();
  const { adopt } = useAuth();
  const { branding } = useBranding();
  const nav = useNavigate();

  const [invite, setInvite] = useState<any>(null);
  const [dead, setDead] = useState('');
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/invites/token/${token}`)
      .then((i) => {
        setInvite(i);
        setForm((f) => ({ ...f, first_name: i.first_name, last_name: i.last_name }));
      })
      .catch((e) => setDead(e.message ?? 'This link is no longer valid.'));
  }, [token]);

  // A reset only changes the password. The other two shapes are setting up.
  const setup = invite && invite.kind !== 'password_reset';
  const strength = strengthOf(form.password);
  const mismatch = !!form.confirm && form.confirm !== form.password;
  const ready = form.password.length >= 8 && !mismatch && !!form.first_name.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.post(`/invites/token/${token}/accept`, {
        password: form.password,
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone || undefined,
      });
      adopt(res.token, res.user);
      nav(HOME[res.user.role] ?? '/', { replace: true });
    } catch (err: any) {
      setError(err.message ?? 'We could not set your password. Please try again.');
      setBusy(false);
    }
  };

  const monogram = (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl font-black"
          style={{ background: branding.brand_primary, color: contrastOn(branding.brand_primary) }}>
      {branding.monogram}
    </span>
  );

  return (
    <div className="min-h-screen bg-[color:var(--page)] px-5 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-8 flex items-center gap-3">
          <Link to="/" className="inline-flex min-w-0 items-center gap-2.5">
            {branding.logo_url
              ? <img src={branding.logo_url} alt="" className="h-11 w-auto max-w-[10rem] object-contain" />
              : monogram}
            <span className="truncate font-display text-base font-bold text-ink">{branding.name}</span>
          </Link>
        </div>

        {dead ? (
          <div className="card p-6 text-center">
            <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl chip-amber">
              <Icon name="clock" className="h-5 w-5" />
            </span>
            <h1 className="font-display text-xl font-bold text-ink">This link has expired</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">{dead}</p>
            <p className="mt-4 text-sm text-ink-soft">
              Ask the school office to send a new invitation, then open it within seven days.
            </p>
            <Link to="/login" className="btn-ghost mt-5 inline-flex">Go to sign in</Link>
          </div>
        ) : !invite ? (
          <div className="card p-6">
            <div className="h-4 w-40 animate-pulse rounded bg-[color:var(--surface-sunken)]" />
            <div className="mt-4 h-10 animate-pulse rounded-xl bg-[color:var(--surface-sunken)]" />
            <div className="mt-3 h-10 animate-pulse rounded-xl bg-[color:var(--surface-sunken)]" />
          </div>
        ) : (
          <div className="card p-6 sm:p-8">
            <h1 className="font-display text-2xl font-bold text-ink">
              {invite.kind === 'password_reset'
                ? `Welcome back, ${invite.first_name}`
                : `Welcome, ${invite.first_name}`}
            </h1>
            <p className="mt-2 text-sm text-ink-soft">
              {invite.kind === 'password_reset'
                ? `Set a new password for your ${invite.school} account.`
                : invite.kind === 'first_sign_in'
                ? `Your ${invite.school} account is ready. Choose a password and check your details.`
                : `${invite.school} has invited you to set up an account as a ${ROLE_WORD[invite.role] ?? 'member of the school'}.`}
            </p>

            {invite.child && (
              <p className="mt-4 flex items-center gap-2 rounded-xl panel-brand px-3 py-2.5 text-sm text-ink">
                <Icon name="users" className="h-4 w-4 shrink-0 text-brand-600" />
                Linked to <b>{invite.child.name}</b>{invite.child.class_name && `, ${invite.child.class_name}`}
              </p>
            )}
            {invite.message && (
              <blockquote className="mt-4 rounded-xl border-l-4 border-brand-400 bg-[color:var(--surface-sunken)] px-3 py-2.5 text-sm italic text-ink-soft">
                {invite.message}
              </blockquote>
            )}

            <form onSubmit={submit} className="mt-6 space-y-4">
              <Field label="Email">
                <input className="input" value={invite.email} disabled readOnly />
              </Field>

              {setup && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="First name" required>
                      <input className="input" required value={form.first_name}
                             onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                    </Field>
                    <Field label="Last name" required>
                      <input className="input" required value={form.last_name}
                             onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                    </Field>
                  </div>
                  <Field label="Phone" hint="Optional. The school uses it only if they cannot reach you by email.">
                    <input className="input" type="tel" value={form.phone}
                           onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </Field>
                </>
              )}

              <Field label="Choose a password" required hint="At least 8 characters. Longer beats complicated.">
                <PasswordInput
                  required minLength={8} autoComplete="new-password" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </Field>

              {form.password && (
                <div className="flex items-center gap-3" aria-live="polite">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--surface-sunken)]">
                    <span className={`block h-full rounded-full transition-all ${strength.tone}`}
                          style={{ width: `${(strength.score / 3) * 100}%` }} />
                  </span>
                  <span className="w-24 shrink-0 text-xs font-semibold text-ink-soft">{strength.label}</span>
                </div>
              )}

              <Field label="Confirm password" required error={mismatch ? 'The two passwords do not match' : undefined}>
                <PasswordInput required autoComplete="new-password"
                               value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
              </Field>

              {error && (
                <p role="alert" className="rounded-xl panel-red px-3 py-2.5 text-sm text-red-800">{error}</p>
              )}

              <button className="btn-primary w-full" disabled={busy || !ready}>
                {busy ? 'Setting up...'
                  : invite.kind === 'password_reset' ? 'Set new password'
                  : invite.kind === 'first_sign_in' ? 'Set my password' : 'Create my account'}
              </button>
              <p className="text-center text-xs text-ink-faint">
                By continuing you agree to the <Link to="/terms" className="underline">terms of use</Link> and{' '}
                <Link to="/privacy" className="underline">privacy notice</Link>.
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
