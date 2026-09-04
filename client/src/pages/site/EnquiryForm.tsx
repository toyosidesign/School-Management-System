import { useState } from 'react';
import { api } from '../../lib/api';
import { useBranding } from '../../context/BrandingContext';
import Icon from '../../components/Icon';
import DatePicker from '../../components/DatePicker';
import { Field } from '../../components/ui';

/**
 * The single conversion point of the public site. Used in two modes:
 * a full application on /admissions, a short enquiry on /contact.
 * Both land in the same admin inbox.
 */
export default function EnquiryForm({ kind = 'enquiry', sourcePage }:
  { kind?: 'enquiry' | 'application' | 'tour'; sourcePage: string }) {
  const { branding } = useBranding();
  const isApplication = kind === 'application';
  const isTour = kind === 'tour';
  const wantsChild = isApplication || isTour;

  const [form, setForm] = useState({
    parent_name: '', email: '', phone: '', child_name: '', child_dob: '',
    section: '', entry_year: branding.academic_year, message: '', sen_notes: '',
    preferred_date: '', preferred_time: '', how_heard: '',
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [error, setError] = useState('');

  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.post('/public/enquiries', { ...form, kind, source_page: sourcePage });
      setDone(res);
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again or call the school office.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="card panel-green p-6 text-center" role="status">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-600">
          <Icon name="check" className="h-7 w-7" strokeWidth={3} />
        </span>
        <h3 className="mt-4 font-display text-lg font-bold text-ink">Thank you</h3>
        <p className="mt-2 text-sm text-ink-soft">{done.message}</p>
        <p className="mt-3 text-xs text-ink-faint">
          Your reference is <span className="font-mono font-bold text-ink">{done.reference}</span>.
          Quote it if you call the office.
        </p>
      </div>
    );
  }

  if (isTour && !branding.tours_open) {
    return (
      <div className="card p-6">
        <h3 className="font-display text-lg font-bold text-ink">Tour bookings are paused</h3>
        <p className="mt-2 text-sm text-ink-soft">
          We are not booking tours at the moment. Send us an enquiry from the contact page and we will let you
          know as soon as dates open again.
        </p>
      </div>
    );
  }

  if (isApplication && !branding.admissions_open) {
    return (
      <div className="card p-6">
        <h3 className="font-display text-lg font-bold text-ink">Applications are currently closed</h3>
        <p className="mt-2 text-sm text-ink-soft">
          We are not accepting new applications at the moment. Please send us an enquiry through the contact page
          and we will let you know as soon as places open again.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-6" noValidate>
      <h3 className="font-display text-lg font-bold text-ink">
        {isTour ? 'Book a tour' : isApplication ? 'Apply for a place' : 'Send us a message'}
      </h3>
      <p className="mt-1 text-sm text-ink-soft">
        {isTour
          ? 'We show families round during a normal school day, not a staged open evening. Bring your child.'
          : isApplication
          ? 'Tell us a little about your child and we will be in touch within two working days.'
          : 'We reply to every message, usually the same day.'}
      </p>

      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <Icon name="warning" className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      <div className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" required>
            <input className="input" required value={form.parent_name} onChange={set('parent_name')} autoComplete="name" />
          </Field>
          <Field label="Email address" required>
            <input className="input" type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
          </Field>
        </div>

        <Field label="Phone number" hint="Optional, but it is usually the quickest way to reach you.">
          <input className="input" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
        </Field>

        {isTour && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Preferred date" hint="We run tours on school days.">
              <DatePicker value={form.preferred_date} onChange={(v) => setForm({ ...form, preferred_date: v })}
                          min={new Date().toISOString().slice(0, 10)} placeholder="Pick a day" />
            </Field>
            <Field label="Preferred time">
              <select className="input" value={form.preferred_time} onChange={set('preferred_time')}>
                <option value="">Any time</option>
                <option value="morning">Morning, around 09:30</option>
                <option value="midday">Late morning, around 11:00</option>
                <option value="afternoon">Afternoon, around 14:00</option>
              </select>
            </Field>
          </div>
        )}

        {wantsChild && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Child's name" required={isApplication}>
                <input className="input" required={isApplication} value={form.child_name} onChange={set('child_name')} />
              </Field>
              <Field label="Child's date of birth">
                <DatePicker value={form.child_dob} onChange={(v) => setForm({ ...form, child_dob: v })}
                            max={new Date().toISOString().slice(0, 10)} placeholder="Date of birth" />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Which section?">
                <select className="input" value={form.section} onChange={set('section')}>
                  <option value="">Not sure yet</option>
                  <option value="nursery">Nursery (ages 2 to 4)</option>
                  <option value="primary">Primary (ages 5 to 11)</option>
                  <option value="secondary">Secondary (ages 11 to 16)</option>
                </select>
              </Field>
              <Field label="Preferred start">
                <input className="input" value={form.entry_year} onChange={set('entry_year')} placeholder="e.g. September 2026" />
              </Field>
            </div>

            <Field
              label="Does your child have any support needs?"
              hint="Optional. Nothing here counts against an application. It only helps us have the right conversation with you."
            >
              <textarea className="input min-h-[5rem] resize-y" value={form.sen_notes} onChange={set('sen_notes')}
                        placeholder="For example: a diagnosis, an existing support plan, or something that has not worked at a previous school." />
            </Field>

            <Field label="How did you hear about us?" hint="Optional, but it genuinely helps us.">
              <select className="input" value={form.how_heard} onChange={set('how_heard')}>
                <option value="">Prefer not to say</option>
                <option value="word_of_mouth">Another family</option>
                <option value="search">Online search</option>
                <option value="social">Social media</option>
                <option value="event">An event or open day</option>
                <option value="alumni">An former pupil</option>
                <option value="other">Something else</option>
              </select>
            </Field>
          </>
        )}

        <Field label={wantsChild ? 'Anything else we should know?' : 'Your message'} required={!wantsChild}>
          <textarea
            className="input min-h-[6rem] resize-y" value={form.message} onChange={set('message')}
            required={!wantsChild}
            placeholder={wantsChild ? 'Questions, timings, anything at all.' : 'How can we help?'}
          />
        </Field>
      </div>

      <button className="btn-primary mt-6 w-full !py-3 sm:w-auto" disabled={busy}>
        {busy ? 'Sending...' : isTour ? 'Request a tour' : isApplication ? 'Submit application' : 'Send message'}
        {!busy && <Icon name="chevronRight" className="h-4 w-4" />}
      </button>

      <p className="mt-3 flex items-start gap-2 text-xs text-ink-faint">
        <Icon name="shield" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        We use your details only to respond to this {isTour ? 'tour request' : isApplication ? 'application' : 'enquiry'}. They are never sold
        or shared, and you can ask us to delete them at any time.
      </p>
    </form>
  );
}
