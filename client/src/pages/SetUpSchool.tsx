import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Icon from '../components/Icon';
import PasswordInput from '../components/PasswordInput';
import { Field, Loading } from '../components/ui';

/**
 * The one account nobody invites.
 *
 * A fresh installation has nobody who can let anybody in, so the first person
 * has to be able to let themselves in: they name the school and choose their
 * own password here. The door closes the moment an administrator exists, so
 * this page redirects to the sign-in box on a school that is already running.
 */
export default function SetUpSchool() {
  const navigate = useNavigate();
  const { adopt } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState<'checking' | 'open' | 'claimed'>('checking');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    school_name: '', name: '', email: '', password: '', confirm: '',
  });

  useEffect(() => {
    api.get('/public/setup-state')
      .then((res) => setState(res.needs_setup ? 'open' : 'claimed'))
      .catch(() => setState('claimed'));
  }, []);

  const mismatch = !!form.confirm && form.password !== form.confirm;
  const ready = form.school_name.trim() && form.name.trim() && form.email.trim()
    && form.password.length >= 8 && !mismatch;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/public/setup', {
        school_name: form.school_name, name: form.name, email: form.email, password: form.password,
      });
      // Straight in: they have just chosen the password, so asking for it again
      // is a form for its own sake.
      adopt(res.token, res.user);
      toast(`${res.school.name} is ready. Academic year ${res.school.academic_year}.`);
      navigate('/admin', { replace: true });
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'checking') {
    return <div className="mx-auto max-w-md p-8"><Loading rows={3} /></div>;
  }

  // Said plainly rather than by bouncing them back to the sign-in box: somebody
  // who came here for a reason deserves to know why they cannot go on.
  if (state === 'claimed') {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10">
        <div className="card p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold text-ink">This school is already set up</h1>
          <p className="mt-2 text-sm text-ink-soft">
            An administrator holds it, and only they can let anybody else in. Ask them to invite you: the link
            they send works once, and you choose your own password on it.
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            If this was meant to be a different school, it needs its own installation — one address, one school.
          </p>
          <Link to="/login" className="btn-primary mt-5 w-full !py-3">Go to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10">
      <div className="card p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold text-ink">Set up your school</h1>
        <p className="mt-2 text-sm text-ink-soft">
          This is the first account, so it makes itself: name your school, and choose a password nobody else
          knows. Everything after this — staff, pupils, guardians — is invited by you, and each person sets
          their own password on a link that works once.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="School name" required hint="What it is called on reports, invoices and the website.">
            <input className="input" required autoFocus value={form.school_name}
                   placeholder="e.g. Northgate Academy"
                   onChange={(e) => setForm({ ...form, school_name: e.target.value })} />
          </Field>

          <Field label="Your name" required>
            <input className="input" required value={form.name} placeholder="e.g. Toyosi Adeyemi"
                   onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>

          <Field label="Your email" required hint="What you sign in with.">
            <input className="input" type="email" required value={form.email}
                   autoComplete="username" placeholder="you@school.org"
                   onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Password" required hint="At least 8 characters. Longer beats complicated.">
              <PasswordInput required minLength={8} autoComplete="new-password" value={form.password}
                             onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Repeat it" required error={mismatch ? 'The two do not match' : undefined}>
              <PasswordInput required autoComplete="new-password" value={form.confirm}
                             onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
            </Field>
          </div>

          <button className="btn-primary w-full !py-3" disabled={busy || !ready}>
            {busy ? 'Setting up...' : 'Create the school'}
          </button>
        </form>

        <p className="mt-5 text-xs text-ink-faint">
          <Icon name="info" className="mr-1.5 inline h-3.5 w-3.5" />
          The school starts empty: placeholder website copy, a chart of accounts and an open financial year.
          No pupils, staff, classes or subjects until you add them.
        </p>

        <p className="mt-3 text-sm text-ink-soft">
          Already set up? <Link to="/login" className="font-semibold text-brand-600 hover:underline">Sign in</Link>.
        </p>
      </div>
    </div>
  );
}
