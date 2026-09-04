import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useSections } from '../../lib/useSections';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { dateLong } from '../../lib/format';
import Icon from '../../components/Icon';
import MultiSelect from '../../components/MultiSelect';
import Select from '../../components/Select';
import StaffImport from '../../components/StaffImport';
import { Avatar, Badge, ErrorNote, Field, Loading, Modal, PageHeader, Toggle } from '../../components/ui';

export default function AdminStaff() {
  const { toast } = useToast();
  const { user } = useAuth();
  // Only somebody who holds the school may hand that out, so only they are
  // shown the choice: an option that always fails is worse than no option.
  const owner = user.role === 'admin' && !!user.is_super_admin;
  const { data, loading, error, reload } = useFetch<any[]>('/staff');
  const subjects = useFetch<any[]>('/subjects');
  const { sections } = useSections();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Shown once, after adding somebody: the link they use to set a password.
  const [invite, setInvite] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [importing, setImporting] = useState(false);
  const blank = {
    first_name: '', last_name: '', email: '', phone: '',
    qualifications: '', role: 'teacher', is_senco: false, is_super_admin: false,
    subject_ids: [] as number[], section_keys: [] as string[],
  };
  const [form, setForm] = useState<any>(blank);
  const [editing, setEditing] = useState<any>(null);

  const edit = (person: any) => {
    setEditing(person);
    setForm({
      first_name: person.first_name ?? '', last_name: person.last_name ?? '', email: person.email ?? '',
      phone: person.phone ?? '',
      qualifications: person.qualifications ?? '', staff_code: person.staff_code ?? '',
      role: person.role, is_senco: !!person.is_senco, is_super_admin: !!person.is_super_admin,
      subject_ids: (person.subjects ?? []).map((sub: any) => sub.id),
      section_keys: (person.sections ?? []).map((sec: any) => sec.key),
    });
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        const out = await api.patch(`/staff/${editing.id}`, form);
        toast(out.assigned
          ? `Saved. ${out.assigned} class${out.assigned === 1 ? '' : 'es'} now has them as its teacher.`
          : `${form.first_name} ${form.last_name} updated.`);
      } else {
        const created = await api.post('/staff', form);
        setInvite({ ...created, name: `${form.first_name} ${form.last_name}`, email: form.email });
        toast('Added. Send them the link so they can set their own password.');
      }
      setOpen(false);
      setEditing(null);
      setForm(blank);
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        icon="users" title="Staff" subtitle="Teaching and administrative staff, their departments and teaching load."
        actions={
          <>
            <Link to="/admin/invitations" className="btn-ghost">
              <Icon name="mail" className="h-4 w-4" /> Invitations
            </Link>
            <button className="btn-ghost" onClick={() => setImporting(true)}>
              <Icon name="upload" className="h-4 w-4" /> Import a list
            </button>
            <button className="btn-primary" onClick={() => { setEditing(null); setForm(blank); setOpen(true); }}>
              <Icon name="plus" className="h-4 w-4" /> Add staff
            </button>
          </>
        }
      />

      {invite && (
        <section className="card panel-green mb-5 p-4">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <Icon name="check" className="h-4 w-4 shrink-0 text-green-600" /> Send {invite.name} their sign-in link
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            No password has been set for them. They choose their own when they open this link, which expires
            {' '}{dateLong(invite.activation_expires_at)}. We keep no copy of it, so send it before leaving this page.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input className="input flex-1 font-mono text-xs" readOnly value={invite.activation_link}
                   onFocus={(e) => e.currentTarget.select()} />
            <button
              className="btn-primary shrink-0"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(invite.activation_link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  toast('Copy the link from the box above', 'error');
                }
              }}
            >
              <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" /> {copied ? 'Copied' : 'Copy link'}
            </button>
            <a className="btn-ghost shrink-0"
               href={`mailto:${invite.email}?subject=${encodeURIComponent('Your school account')}&body=${encodeURIComponent(`Hello ${invite.name},\n\nOpen this link to set your password and sign in:\n${invite.activation_link}`)}`}>
              <Icon name="mail" className="h-4 w-4" /> Open in email
            </a>
            <button className="btn-subtle shrink-0" onClick={() => setInvite(null)}>Done</button>
          </div>
        </section>
      )}

      {/* A staff list is read down a column: who, what they do, how to reach
          them. Cards spread twenty people over three screens. */}
      <div className="card hidden overflow-hidden lg:block">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[26%]" />
            <col className="w-[22%]" />
            <col className="w-[22%]" />
            <col className="w-[18%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="border-b border-line bg-[color:var(--surface-sunken)] text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-bold">Name</th>
              <th className="px-4 py-3 font-bold">Teaches</th>
              <th className="px-4 py-3 font-bold">Contact</th>
              <th className="px-4 py-3 font-bold">Year groups</th>
              <th className="px-4 py-3 font-bold">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(data ?? []).map((s) => (
              <tr key={s.id} onClick={() => edit(s)} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); edit(s); } }}
                  className="cursor-pointer transition-colors hover:bg-[color:var(--surface-sunken)] focus:bg-[color:var(--surface-sunken)] focus:outline-none">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar first={s.first_name} last={s.last_name} colour={s.avatar_colour}
                            src={s.avatar_url} emoji={s.avatar_emoji} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{s.first_name} {s.last_name}</p>
                      <p className="truncate text-xs text-ink-faint">{s.staff_code}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="truncate text-ink">
                    {s.subjects?.length
                      ? s.subjects.map((sub: any) => sub.name).join(', ')
                      : s.title ?? (s.role === 'admin' ? 'Administrator' : 'Nothing named yet')}
                  </p>
                  <span className="mt-1 flex flex-wrap gap-1">
                    <Badge tone={s.role === 'admin' ? 'violet' : 'brand'}>
                      {s.is_super_admin ? 'super admin' : s.role}
                    </Badge>
                    {!!s.is_senco && <Badge tone="green" icon="accessibility">SENCO</Badge>}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <p className="truncate text-ink-soft">{s.email}</p>
                  <p className="truncate text-xs text-ink-faint">{s.phone ?? 'No phone'}</p>
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  <span className="block truncate">
                    {s.sections?.length
                      ? s.sections.map((sec: any) => sec.name).join(', ')
                      : s.department ?? 'No year group'}
                  </span>
                  <span className="block text-xs text-ink-faint">
                    {s.class_count > 0 ? `${s.class_count} class${s.class_count === 1 ? '' : 'es'}` : 'No classes yet'}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-soft">{dateLong(s.hired_on)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
        {(data ?? []).map((s) => (
          <button key={s.id} onClick={() => edit(s)} className="card p-4 text-left transition hover:border-brand-300">
            <div className="flex items-start gap-3">
              <Avatar first={s.first_name} last={s.last_name} colour={s.avatar_colour} src={s.avatar_url} emoji={s.avatar_emoji} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{s.first_name} {s.last_name}</p>
                <p className="truncate text-xs text-ink-soft">
                  {s.subjects?.length ? s.subjects.map((sub: any) => sub.name).join(', ') : s.title ?? 'Staff'}
                </p>
                <p className="truncate text-[11px] text-ink-faint">{s.email}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone={s.role === 'admin' ? 'violet' : 'brand'}>
                {s.is_super_admin ? 'super admin' : s.role}
              </Badge>
              {!!s.is_senco && <Badge tone="green" icon="accessibility">SENCO</Badge>}
              {(s.sections ?? []).map((sec: any) => <Badge key={sec.key} tone="slate">{sec.name}</Badge>)}
              {!s.sections?.length && s.department && <Badge tone="slate">{s.department}</Badge>}
              {s.class_count > 0 && <Badge tone="amber">{s.class_count} class{s.class_count === 1 ? '' : 'es'}</Badge>}
            </div>
          </button>
        ))}
      </div>

      <Modal
        open={open} onClose={() => { setOpen(false); setEditing(null); }} wide
        title={editing ? `${editing.first_name} ${editing.last_name}` : 'Add a staff member'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => { setOpen(false); setEditing(null); }}>Cancel</button>
            <button className="btn-primary" form="staff-form" disabled={busy || !form.first_name || !form.email}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Add staff member'}
            </button>
          </>
        }
      >
        <form id="staff-form" onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" required>
              <input className="input" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </Field>
            <Field label="Last name" required>
              <input className="input" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email" required>
              <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
          {/* Two to a row, and every control the same shape: chips of wildly
              different heights beside a single input is what made this read as
              a jumble. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Role" hint={form.role === 'super' ? 'Appoints administrators and closes the accounts.' : undefined}>
              <Select
                value={form.is_super_admin ? 'super' : form.role}
                onChange={(v) => setForm({
                  ...form,
                  role: v === 'teacher' ? 'teacher' : 'admin',
                  is_super_admin: v === 'super',
                })}
                options={[
                  { value: 'teacher', label: 'Teacher' },
                  { value: 'admin', label: 'Administrator', hint: 'The office: pupils, classes, fees, timetable' },
                  ...(owner
                    ? [{ value: 'super', label: 'Super administrator',
                         hint: 'Also appoints administrators and closes a financial year' }]
                    : []),
                ]}
              />
            </Field>
            <Field label="Year groups taught" hint="Most teachers cover more than one.">
              <MultiSelect
                value={form.section_keys}
                onChange={(v) => setForm({ ...form, section_keys: v })}
                options={sections.map((sec) => ({ value: sec.key, label: sec.name }))}
                placeholder="None yet"
                empty="No sections yet. Add them on the Sections page first."
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Subjects taught" hint="Puts them in front of the classes taking these.">
              <MultiSelect
                value={form.subject_ids.map(String)}
                onChange={(v) => setForm({ ...form, subject_ids: v.map(Number) })}
                options={(subjects.data ?? []).map((sub: any) => ({ value: String(sub.id), label: sub.name }))}
                placeholder="None yet"
                empty="No subjects yet. Add them on the Subjects page first."
              />
            </Field>
            <Field label="Qualifications">
              <input className="input" value={form.qualifications} placeholder="e.g. BSc Mathematics, PGCE"
                     onChange={(e) => setForm({ ...form, qualifications: e.target.value })} />
            </Field>
          </div>

          <div className="grid items-start gap-3 sm:grid-cols-2">
            {editing && (
              <Field label="Staff number" hint="What registers and reports print.">
                <input className="input font-mono uppercase" value={form.staff_code ?? ''}
                       onChange={(e) => setForm({ ...form, staff_code: e.target.value })} />
              </Field>
            )}
            {/* Sits in the column beside it rather than alone across the foot of
                the form, where a lone switch reads as an afterthought. */}
            <div className="rounded-xl border border-line px-3 py-2.5 sm:col-start-2">
              <Toggle
                checked={form.is_senco} onChange={(v) => setForm({ ...form, is_senco: v })}
                label="SEN Co-ordinator"
                hint="Grants the SEN register and plan editing"
              />
            </div>
          </div>
        </form>
      </Modal>
      <StaffImport open={importing} onClose={() => setImporting(false)} onDone={reload} />

    </>
  );
}
