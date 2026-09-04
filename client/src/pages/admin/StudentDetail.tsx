import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../lib/useFetch';
import { useAuth } from '../../context/AuthContext';
import { dateLong, money } from '../../lib/format';
import Icon from '../../components/Icon';
import Select from '../../components/Select';
import DatePicker from '../../components/DatePicker';
import SupportPlanDialog, { countsAsSen } from '../../components/SupportPlanDialog';
import { Avatar, Badge, ErrorNote, Field, Loading, Modal, PageHeader, ProgressBar, SenBadges, StatCard } from '../../components/ui';

export default function StudentDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: s, loading, error, reload } = useFetch<any>(`/students/${id}`);
  const classes = useFetch<any[]>(user.role === 'admin' ? '/classes' : null);

  const [editing, setEditing] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);

  const [busy, setBusy] = useState(false);

  /** The record as the office keeps it: who they are, and what staff must know. */
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/students/${id}`, editing);
      toast('Record updated.');
      setEditing(null);
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const back = user.role === 'admin' ? '/admin/students' : '/teacher/students';
  const att = s.attendance_summary;

  return (
    <>
      <Link to={back} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <Icon name="chevronLeft" className="h-4 w-4" /> All students
      </Link>

      <div className="card mb-5 flex flex-wrap items-center gap-4 p-5">
        <Avatar first={s.first_name} last={s.last_name} colour={s.avatar_colour} src={s.avatar_url} emoji={s.avatar_emoji} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-ink sm:text-2xl">{s.first_name} {s.last_name}</h1>
          <p className="text-sm text-ink-soft">
            {s.class_name
              ? <Link to="/admin/classes" className="font-semibold text-brand-600 hover:text-brand-800">{s.class_name}</Link>
              : <Link to="/admin/classes" className="font-semibold text-brand-600 hover:text-brand-800">Not in a class</Link>}
            {' · '}{s.student_code}
          </p>
          <p className="text-xs text-ink-faint">{s.email}</p>
          <div className="mt-2">
            <SenBadges needs={s.iep?.needs} multiplier={s.iep?.time_multiplier} multiFormat={s.iep?.multi_format_approved} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={s.status === 'active' ? 'green' : 'slate'}>{s.status}</Badge>
          {user.role === 'admin' && (
            <button
              className="inline-flex items-center gap-1.5 px-1 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-800"
              onClick={() => setEditing({
                first_name: s.first_name, last_name: s.last_name, email: s.email ?? '', phone: s.phone ?? '',
                date_of_birth: s.date_of_birth ?? '',
                gender: s.gender ?? '', address: s.address ?? '', medical_notes: s.medical_notes ?? '',
                emergency_contact_name: s.emergency_contact_name ?? '',
                emergency_contact_phone: s.emergency_contact_phone ?? '',
                status: s.status,
              })}
            >
              <Icon name="pencil" className="h-3.5 w-3.5" /> Edit record
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Attendance" value={`${att.rate}%`} hint={`${att.total} periods`} icon="attendance" tone={att.rate >= 90 ? 'green' : 'amber'} />
        <StatCard label="Average grade" value={s.grade_average ?? '-'} icon="star" tone="violet" />
        <StatCard label="Absences" value={att.absent ?? 0} icon="x" tone={att.absent ? 'red' : 'green'} />
        <StatCard label="Excused" value={att.excused ?? 0} icon="leave" tone="brand" />
      </div>

      <AccessCodePanel studentId={s.id} firstName={s.first_name} />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-soft">Personal details</h2>
          <dl className="space-y-2.5 text-sm">
            {[
              ['Date of birth', s.date_of_birth ? dateLong(s.date_of_birth) : '-'],
              ['Gender', s.gender ?? '-'],
              ['Enrolled', dateLong(s.enrolled_on)],
              ['Address', s.address ?? '-'],
              ['Emergency contact', s.emergency_contact_name ? `${s.emergency_contact_name} · ${s.emergency_contact_phone ?? ''}` : '-'],
              ['Medical notes', s.medical_notes ?? 'None recorded'],
              ['Room', s.room ?? '-'],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-4 border-b border-line pb-2 last:border-0">
                <dt className="shrink-0 text-ink-soft">{k}</dt>
                <dd className="text-right font-medium text-ink">{v as string}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Guardians</h2>
            {user.role === 'admin' && (
              <Link to={`/admin/invitations?role=parent&student=${s.id}`} className="btn-ghost btn-sm">
                <Icon name="mail" className="h-3.5 w-3.5" /> Invite a guardian
              </Link>
            )}
          </div>
          {(s.guardians ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">No guardians linked.</p>
          ) : (
            <ul className="space-y-2">
              {s.guardians.map((g: any) => (
                <li key={g.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                  <Avatar first={g.first_name} last={g.last_name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{g.first_name} {g.last_name}</span>
                    <span className="block truncate text-xs text-ink-soft">{g.email}{g.phone ? ` · ${g.phone}` : ''}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone="slate">{g.relationship}</Badge>
                    {!!g.is_primary && <Badge tone="brand">Primary</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-soft">Subjects &amp; teachers</h2>
          <ul className="space-y-2">
            {(s.subjects ?? []).map((sub: any) => (
              <li key={sub.class_subject_id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: sub.colour }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{sub.name}</span>
                  <span className="block truncate text-xs text-ink-soft">{sub.teacher_name ?? 'To be assigned'}</span>
                </span>
                <Badge tone="slate">{sub.code}</Badge>
              </li>
            ))}
          </ul>
        </section>

        <section className="card panel-violet p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-violet-800 dark:text-violet-300">
              <Icon name="accessibility" className="h-4 w-4 shrink-0" /> Support
              {s.iep && (
                <Badge tone={countsAsSen(s.iep) ? 'violet' : 'slate'}>
                  {countsAsSen(s.iep) ? 'On the SEN register' : 'Classroom support'}
                </Badge>
              )}
            </h2>
            {user.role === 'admin' && (
              <button
                className="inline-flex items-center gap-1.5 px-1 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-800"
                onClick={() => setPlan({
                  student_id: Number(id), name: `${s.first_name} ${s.last_name}`, iep: s.iep,
                })}
              >
                <Icon name={s.iep ? 'pencil' : 'plus'} className="h-3.5 w-3.5" />
                {s.iep ? 'Edit support' : 'Add support'}
              </button>
            )}
          </div>

          {!s.iep ? (
            <p className="py-6 text-center text-sm text-ink-soft">
              Nothing recorded. Support can be written for any pupil — notes for the staff who teach them
              stay between classrooms, while naming a need or granting an entitlement (extra time, answering
              in audio or video, a scribe, rest breaks) makes it a SEN plan and puts them on the register.
            </p>
          ) : (
            <>
              {s.iep.notes && <p className="mb-3 text-sm text-ink-soft">{s.iep.notes}</p>}
              <dl className="space-y-2 text-sm">
                {[
                  ['Extra time', s.iep.time_multiplier > 1 ? `${Math.round((s.iep.time_multiplier - 1) * 100)}% (x${s.iep.time_multiplier})` : 'Standard'],
                  ['Multi-format submissions', s.iep.multi_format_approved ? 'Approved' : 'Not approved'],
                  ['Scribe / dictation', s.iep.scribe_allowed ? 'Allowed' : 'Not required'],
                  ['Rest breaks', s.iep.rest_breaks ? 'Allowed' : 'Not required'],
                  ['Next review', s.iep.review_date ? dateLong(s.iep.review_date) : 'Not scheduled'],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-4 border-b border-violet-200/60 pb-2 last:border-0">
                    <dt className="text-ink-soft">{k}</dt>
                    <dd className="text-right font-medium text-ink">{v as string}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </section>
      </div>
      <Modal
        open={!!editing} onClose={() => setEditing(null)} wide
        title={`Edit ${s.first_name} ${s.last_name}`}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn-primary" form="student-form"
                    disabled={busy || !editing?.first_name?.trim() || !editing?.last_name?.trim()}>
              {busy ? 'Saving...' : 'Save changes'}
            </button>
          </>
        }
      >
        {editing && (
          <form id="student-form" onSubmit={save} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" required>
                <input className="input" required value={editing.first_name}
                       onChange={(e) => setEditing({ ...editing, first_name: e.target.value })} />
              </Field>
              <Field label="Last name" required>
                <input className="input" required value={editing.last_name}
                       onChange={(e) => setEditing({ ...editing, last_name: e.target.value })} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email" hint="Their identifier. Pupils sign in with a code, not this.">
                <input className="input" type="email" value={editing.email}
                       onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </Field>
              <Field label="Phone">
                <input className="input" type="tel" value={editing.phone}
                       onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date of birth">
                <DatePicker value={editing.date_of_birth} max={new Date().toISOString().slice(0, 10)}
                            onChange={(v) => setEditing({ ...editing, date_of_birth: v })} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Gender">
                <input className="input" value={editing.gender}
                       onChange={(e) => setEditing({ ...editing, gender: e.target.value })} />
              </Field>
              <Field label="Status" hint="A leaver keeps their record and their history.">
                <Select
                  value={editing.status}
                  onChange={(v) => setEditing({ ...editing, status: v })}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                    { value: 'graduated', label: 'Graduated' },
                  ]}
                />
              </Field>
            </div>

            <Field label="Address">
              <input className="input" value={editing.address}
                     onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Emergency contact">
                <input className="input" value={editing.emergency_contact_name}
                       onChange={(e) => setEditing({ ...editing, emergency_contact_name: e.target.value })} />
              </Field>
              <Field label="Emergency phone">
                <input className="input" type="tel" value={editing.emergency_contact_phone}
                       onChange={(e) => setEditing({ ...editing, emergency_contact_phone: e.target.value })} />
              </Field>
            </div>

            <Field label="Medical notes" hint="Read by staff on trips, in the clinic and at lunch.">
              <textarea className="input min-h-[5rem] resize-y" value={editing.medical_notes}
                        onChange={(e) => setEditing({ ...editing, medical_notes: e.target.value })} />
            </Field>
          </form>
        )}
      </Modal>

      {/* The same editor the roll and the SEN register use, so a plan means
          the same thing wherever it was written. */}
      <SupportPlanDialog subject={plan} onClose={() => setPlan(null)} onSaved={reload} />

    </>
  );
}

/**
 * Pupil sign-in codes. Shown in full exactly once, at the moment of issue:
 * only a hash is stored, so it cannot be recovered afterwards, and reissuing
 * immediately revokes whatever the pupil had before.
 */
function AccessCodePanel({ studentId, firstName }: { studentId: number; firstName: string }) {
  const { toast } = useToast();
  const existing = useFetch<any>(`/students/${studentId}/access-code`, [studentId]);
  const [issued, setIssued] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const issue = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/students/${studentId}/access-code`, { hours: 24 * 90 });
      setIssued(res);
      existing.reload();
      toast('Code issued. Write it down now: it cannot be shown again.');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card panel-brand mb-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
            <Icon name="shield" className="shrink-0 h-5 w-5 text-brand-600" /> Sign-in code
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            {firstName} signs in with a code rather than a password, so there is nothing for them to forget
            or reset. Issue a new one any time; it replaces the old one straight away.
          </p>
          {existing.data && !issued && (
            <p className="mt-2 text-xs text-ink-faint">
              A code ending <b className="font-mono text-ink">{existing.data.code_hint}</b> is active until{' '}
              {dateLong(existing.data.expires_at)}
              {existing.data.last_used_at ? `, last used ${dateLong(existing.data.last_used_at)}` : ', not used yet'}.
            </p>
          )}
          {!existing.data && !issued && !existing.loading && (
            <p className="mt-2 text-xs text-ink-faint">No active code. {firstName} cannot sign in until you issue one.</p>
          )}
        </div>
        <button className="btn-primary shrink-0" onClick={issue} disabled={busy}>
          <Icon name="plus" className="h-4 w-4" /> {busy ? 'Issuing...' : existing.data ? 'Issue a new code' : 'Issue a code'}
        </button>
      </div>

      {issued && (
        <div className="mt-4 rounded-xl border-2 border-dashed border-brand-400 bg-[color:var(--surface-raised)] p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Give this to {firstName}</p>
          <p className="mt-2 select-all font-mono text-3xl font-bold tracking-[0.2em] text-ink">{issued.code}</p>
          <p className="mt-2 text-xs text-ink-faint">
            Valid until {dateLong(issued.expires_at)}. This is the only time it will be shown.
          </p>
          <button
            className="btn-ghost mt-3"
            onClick={() => { navigator.clipboard?.writeText(issued.code); toast('Copied.'); }}
          >
            <Icon name="file" className="h-4 w-4" /> Copy code
          </button>
        </div>
      )}
    </section>
  );
}
