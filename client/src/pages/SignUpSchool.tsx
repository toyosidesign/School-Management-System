import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, schoolUrl, setSchool } from '../lib/api';
import { useToast } from '../context/ToastContext';
import Icon from '../components/Icon';
import PasswordInput from '../components/PasswordInput';
import { Field, Loading } from '../components/ui';

const slugify = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/**
 * A school joining a deployment that holds many.
 *
 * The address is chosen here rather than derived silently, because it is the
 * one thing about a school that everybody types and nobody can change later
 * without breaking every link the school has given out.
 */
export default function SignUpSchool() {
  const { toast } = useToast();
  const [state, setState] = useState<'checking' | 'open' | 'closed'>('checking');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [touchedSlug, setTouchedSlug] = useState(false);
  const [form, setForm] = useState({
    school_name: '', slug: '', name: '', email: '', password: '', confirm: '',
  });

  useEffect(() => {
    api.get('/public/tenancy')
      .then((res) => setState(res.accepting ? 'open' : 'closed'))
      .catch(() => setState('closed'));
  }, []);

  const setName = (school_name: string) =>
    setForm((f) => ({ ...f, school_name, slug: touchedSlug ? f.slug : slugify(school_name) }));

  const mismatch = !!form.confirm && form.password !== form.confirm;
  const ready = form.school_name.trim() && form.slug.length >= 3 && form.name.trim()
    && form.email.trim() && form.password.length >= 8 && !mismatch;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/public/schools', {
        school_name: form.school_name, slug: form.slug, name: form.name,
        email: form.email, password: form.password,
      });
      // The token belongs to that school, and so does everything after it.
      setSchool(res.school.slug);
      setDone(res);
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'checking') return <div className="mx-auto max-w-md p-8"><Loading rows={3} /></div>;

  if (state === 'closed') {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10">
        <div className="card p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold text-ink">Not taking new schools</h1>
          <p className="mt-2 text-sm text-ink-soft">
            This deployment is closed to sign-ups. If your school is already here, sign in at its own address.
          </p>
          <Link to="/login" className="btn-primary mt-5 w-full !py-3">Go to sign in</Link>
        </div>
      </div>
    );
  }

  if (done) {
    const url = schoolUrl(done.school.slug, '/admin');
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10">
        <div className="card p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold text-ink">{done.school.name} is ready</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Academic year {done.school.academic_year}, {done.school.pages} pages of placeholder website copy and
            a chart of {done.school.accounts} accounts. No pupils, staff or classes until you add them.
          </p>
          <p className="mt-4 text-sm text-ink-soft">Your school lives here:</p>
          <p className="mt-1 break-all rounded-xl border border-line bg-[color:var(--surface-sunken)] px-3 py-2.5 font-mono text-sm text-ink">
            {url}
          </p>
          <a className="btn-primary mt-4 w-full !py-3" href={url}>Open {done.school.name}</a>
          <p className="mt-3 text-xs text-ink-faint">
            <Icon name="info" className="mr-1.5 inline h-3.5 w-3.5" />
            Everyone else joins by invitation from you, on a link that works once.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10">
      <div className="card p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold text-ink">Set up a school account</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Your school gets its own address and its own records, kept in a database of its own. You hold it, and
          everybody else — staff, pupils, guardians — joins on an invitation from you.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="School name" required>
            <input className="input" required autoFocus value={form.school_name}
                   placeholder="e.g. Northgate Academy" onChange={(e) => setName(e.target.value)} />
          </Field>

          <Field label="Address" required hint="Lowercase letters, numbers and hyphens. This is what people type, and it cannot be changed later.">
            <div className="flex items-center gap-2">
              <input
                className="input font-mono" required value={form.slug} placeholder="northgate"
                onChange={(e) => { setTouchedSlug(true); setForm({ ...form, slug: slugify(e.target.value) }); }}
              />
              <span className="shrink-0 text-sm text-ink-faint">.{location.hostname.split('.').slice(-2).join('.')}</span>
            </div>
          </Field>

          <Field label="Your name" required>
            <input className="input" required value={form.name} placeholder="e.g. Ada Bello"
                   onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>

          <Field label="Your email" required hint="What you sign in with.">
            <input className="input" type="email" required autoComplete="username" value={form.email}
                   placeholder="you@school.org" onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>

          <div className="grid gap-3">
            <Field label="Password" required hint="At least 8 characters.">
              <PasswordInput required minLength={8} autoComplete="new-password" value={form.password}
                             onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Confirm password" required error={mismatch ? 'The two do not match' : undefined}>
              <PasswordInput required autoComplete="new-password" value={form.confirm}
                             onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
            </Field>
          </div>

          <button className="btn-primary w-full !py-3" disabled={busy || !ready}>
            {busy ? 'Creating the school...' : 'Create the school'}
          </button>
        </form>

        <p className="mt-4 text-sm text-ink-soft">
          Already here? <Link to="/login" className="font-semibold text-brand-600 hover:underline">Sign in</Link>.
        </p>
      </div>
    </div>
  );
}
