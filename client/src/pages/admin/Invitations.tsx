import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../context/ToastContext';
import { dateLong, relative } from '../../lib/format';
import Icon from '../../components/Icon';
import Select from '../../components/Select';
import { Badge, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader } from '../../components/ui';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator', teacher: 'Teacher', parent: 'Parent or guardian',
};
const STATUS_TONE: Record<string, string> = {
  pending: 'amber', accepted: 'green', expired: 'slate', revoked: 'red',
};

const blank = {
  role: 'teacher', first_name: '', last_name: '', email: '', phone: '',
  title: '', department: '', student_id: '', relationship: 'Parent', message: '',
};

/**
 * Invitations are how anybody gets an account. The link is shown once, here,
 * for the office to send on: it is stored only as a hash, so it cannot be
 * recovered afterwards, only replaced.
 */
export default function AdminInvitations() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const { data, loading, error, reload } = useFetch<any[]>('/invites');
  const pupils = useFetch<any[]>('/students');
  const [filter, setFilter] = useState('pending');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(blank);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Deep links from the staff and pupil pages: /admin/invitations?role=parent&student=4
  useEffect(() => {
    const role = params.get('role');
    const student = params.get('student');
    if (!role && !student) return;
    setForm({ ...blank, role: role ?? (student ? 'parent' : 'teacher'), student_id: student ?? '' });
    setOpen(true);
    setParams({}, { replace: true });
  }, [params, setParams]);

  const invites = data ?? [];
  const rows = invites.filter((i) => (filter === 'all' ? true : i.status === filter));
  const count = (status: string) => invites.filter((i) => i.status === status).length;

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Copy the link from the box above', 'error');
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/invites', {
        ...form,
        student_id: form.role === 'parent' && form.student_id ? Number(form.student_id) : undefined,
      });
      setIssued(res);
      setOpen(false);
      setForm(blank);
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const resend = async (invite: any) => {
    try {
      const res = await api.post(`/invites/${invite.id}/resend`, {});
      setIssued({ ...invite, ...res });
      toast('A fresh link has been created. The old one no longer works.');
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const revoke = async (invite: any) => {
    try {
      await api.post(`/invites/${invite.id}/revoke`, {});
      toast('Invitation cancelled.');
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        icon="mail" title="Invitations"
        subtitle="Staff and guardians set their own password through a one-time link. Pupils sign in with an access code instead, issued from their record."
        actions={
          <button className="btn-primary" onClick={() => { setForm(blank); setOpen(true); }}>
            <Icon name="plus" className="h-4 w-4" /> Invite someone
          </button>
        }
      />

      {issued && (
        <section className="card panel-green mb-5 p-4">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <Icon name="check" className="h-4 w-4 shrink-0 text-green-600" /> Send this link to {issued.first_name}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            It works once, and expires {dateLong(issued.expires_at)}. We do not keep a copy, so send it before you
            close this page. If it goes astray, use Resend for a new one.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input className="input flex-1 font-mono text-xs" readOnly value={issued.link}
                   onFocus={(e) => e.currentTarget.select()} />
            <button className="btn-primary shrink-0" onClick={() => copy(issued.link)}>
              <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" /> {copied ? 'Copied' : 'Copy link'}
            </button>
            <a className="btn-ghost shrink-0"
               href={`mailto:${issued.email}?subject=${encodeURIComponent('Your school account')}&body=${encodeURIComponent(`Hello ${issued.first_name},\n\nOpen this link to set your password and sign in:\n${issued.link}\n\nThe link expires on ${dateLong(issued.expires_at)}.`)}`}>
              <Icon name="mail" className="h-4 w-4" /> Open in email
            </a>
            <button className="btn-subtle shrink-0" onClick={() => setIssued(null)}>Done</button>
          </div>
        </section>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="w-full sm:w-64">
          <Select
            ariaLabel="Filter invitations" value={filter} onChange={setFilter}
            options={[
              { value: 'pending', label: 'Waiting to be opened', hint: `${count('pending')} outstanding` },
              { value: 'accepted', label: 'Account created', hint: `${count('accepted')} signed up` },
              { value: 'expired', label: 'Expired', hint: `${count('expired')} lapsed` },
              { value: 'revoked', label: 'Cancelled', hint: `${count('revoked')} withdrawn` },
              { value: 'all', label: 'Everything', hint: `${invites.length} in all` },
            ]}
          />
        </span>
        <span className="text-xs text-ink-faint">{rows.length} shown</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="mail" title="No invitations here"
                    body="Invite a colleague or a guardian and their link appears in this list." />
      ) : (
        <>
          <div className="card hidden overflow-hidden lg:block">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[18%]" />
                <col className="w-[22%]" />
                <col className="w-[18%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead className="border-b border-line bg-[color:var(--surface-sunken)] text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-bold">Who</th>
                  <th className="px-4 py-3 font-bold">For</th>
                  <th className="px-4 py-3 font-bold">Where it stands</th>
                  <th className="px-4 py-3 font-bold">Sent</th>
                  <th className="px-4 py-3 text-right font-bold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((i) => (
                  <tr key={i.id} className="align-top">
                    <td className="px-4 py-3">
                      <span className="block truncate font-semibold text-ink">{i.first_name} {i.last_name}</span>
                      <span className="block truncate text-xs text-ink-faint">{i.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="brand">{ROLE_LABEL[i.role] ?? i.role}</Badge>
                      {i.child_name && (
                        <span className="mt-1 block truncate text-xs text-ink-faint">for {i.child_name}</span>
                      )}
                      {i.user_id && <span className="block text-xs text-ink-faint">Password reset</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[i.status]}>
                        {i.status === 'pending' ? 'Waiting to be opened'
                          : i.status === 'accepted' ? 'Account created'
                          : i.status === 'expired' ? 'Expired' : 'Cancelled'}
                      </Badge>
                      <span className="mt-1 block text-xs text-ink-faint">
                        {i.status === 'pending' && `Expires ${dateLong(i.expires_at)}`}
                        {i.status === 'accepted' && `Accepted ${relative(i.accepted_at)}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      <span className="block">{relative(i.created_at)}</span>
                      <span className="block truncate text-xs text-ink-faint">
                        by {i.invited_by_name ?? 'the school'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {!i.accepted_at && (
                        <span className="flex flex-wrap items-center justify-end gap-2">
                          {i.status !== 'revoked' && (
                            <button
                              className="inline-flex items-center gap-1 px-1 text-sm font-semibold text-ink-soft transition-colors hover:text-red-700"
                              onClick={() => revoke(i)}>
                              Cancel
                            </button>
                          )}
                          <button
                            className="inline-flex items-center gap-1 px-1 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-800"
                            onClick={() => resend(i)}>
                            <Icon name="refresh" className="h-3.5 w-3.5" /> Resend
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 lg:hidden">
            {rows.map((i) => (
              <li key={i.id} className="card p-4">
                <p className="font-bold text-ink">{i.first_name} {i.last_name}</p>
                <p className="truncate text-xs text-ink-soft">{i.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONE[i.status]}>
                    {i.status === 'pending' ? 'Waiting to be opened'
                      : i.status === 'accepted' ? 'Account created'
                      : i.status === 'expired' ? 'Expired' : 'Cancelled'}
                  </Badge>
                  <Badge tone="brand">{ROLE_LABEL[i.role] ?? i.role}</Badge>
                  {i.child_name && <Badge tone="violet" icon="users">{i.child_name}</Badge>}
                </div>
                <p className="mt-2 text-xs text-ink-faint">
                  Invited by {i.invited_by_name ?? 'the school'} {relative(i.created_at)}
                  {i.status === 'pending' && ` · expires ${dateLong(i.expires_at)}`}
                </p>
                {!i.accepted_at && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {i.status !== 'revoked' && (
                      <button
                        className="inline-flex items-center gap-1 px-1 text-sm font-semibold text-ink-soft transition-colors hover:text-red-700"
                        onClick={() => revoke(i)}>
                        Cancel
                      </button>
                    )}
                    <button
                      className="inline-flex items-center gap-1 px-1 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-800"
                      onClick={() => resend(i)}>
                      <Icon name="refresh" className="h-3.5 w-3.5" /> Resend
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal
        open={open} onClose={() => setOpen(false)} title="Invite someone to create an account" wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="invite-form"
                    disabled={busy || !form.first_name || !form.last_name || !form.email}>
              {busy ? 'Creating link...' : 'Create invitation'}
            </button>
          </>
        }
      >
        <form id="invite-form" onSubmit={send} className="space-y-4">
          <Field label="They will join as" required>
            <Select
                value={form.role}
                onChange={(v) => setForm({ ...form, role: v })}
                options={[{ value: "teacher", label: "Teacher" }, { value: "admin", label: "Administrator" }, { value: "parent", label: "Parent or guardian" }]}
              />
          </Field>

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

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email" required hint="The invitation link is addressed to this person.">
              <input className="input" type="email" required value={form.email}
                     onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className="input" type="tel" value={form.phone}
                     onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>

          {form.role === 'parent' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Child" hint="Linked as soon as they accept. Only the school can set this.">
                <Select
                  value={form.student_id}
                  onChange={(v) => setForm({ ...form, student_id: v })}
                  options={[{ value: "", label: `Link later` }, ...(pupils.data ?? []).map((p: any) => ({ value: String(p.id), label: `${p.first_name} ${p.last_name}${p.class_name ? ` · ${p.class_name}` : ''}` }))]}
                />
              </Field>
              <Field label="Relationship">
                <Select
                  value={form.relationship}
                  onChange={(v) => setForm({ ...form, relationship: v })}
                  options={[...['Mother', 'Father', 'Parent', 'Guardian', 'Grandparent', 'Carer'].map((rel: any) => ({ value: String(rel), label: `${rel}` }))]}
                />
              </Field>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Job title">
                <input className="input" value={form.title} placeholder="e.g. Mathematics Teacher"
                       onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>
              <Field label="Department">
                <input className="input" value={form.department} placeholder="e.g. Secondary"
                       onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </Field>
            </div>
          )}

          <Field label="Note" hint="Shown on the page where they set their password. Optional.">
            <textarea className="input min-h-[4.5rem] resize-y" value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      placeholder="e.g. Welcome to the team, Ada. Any trouble, call the office on 555 0100." />
          </Field>

          <p className="rounded-xl panel-brand px-3 py-2.5 text-xs text-ink-soft">
            <Icon name="shield" className="mr-1.5 inline h-3.5 w-3.5" />
            No password is set for them. The account is created only when they open the link and choose one,
            so nobody at the school ever knows it.
          </p>
        </form>
      </Modal>
    </>
  );
}
