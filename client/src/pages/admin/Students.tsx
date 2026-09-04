import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../context/ToastContext';
import { dateShort } from '../../lib/format';
import { useBranding } from '../../context/BrandingContext';
import { useSections } from '../../lib/useSections';
import Icon from '../../components/Icon';
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';
import StudentImport from '../../components/StudentImport';
import SupportPlanDialog from '../../components/SupportPlanDialog';
import { Avatar, Badge, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader, Pagination, SenBadges } from '../../components/ui';

export default function AdminStudents() {
  const navigate = useNavigate();
  const { branding } = useBranding();
  const { sections, nameOf } = useSections();
  const { toast } = useToast();
  const classes = useFetch<any[]>('/classes');
  const [section, setSection] = useState('');
  const [q, setQ] = useState('');
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState<any>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [bulk, setBulk] = useState<null | 'remove' | 'class'>(null);
  const [bulkClass, setBulkClass] = useState('');
  const [supportFilter, setSupportFilter] = useState('');
  const [planFor, setPlanFor] = useState<any>(null);

  /** The plan editor, opened on whichever pupil's row was pressed. */
  const openPlan = (s: any) => setPlanFor({
    student_id: s.id, name: `${s.first_name} ${s.last_name}`, iep: s.iep,
  });

  const chosen = () => (students.data ?? []).filter((p: any) => picked.includes(p.id));

  /** Everything chosen goes into one class, in one action. */
  const assignChosen = async () => {
    setBusy(true);
    try {
      const out = await api.post(`/classes/${bulkClass}/students`, { student_ids: picked });
      toast(out.moved.length
        ? `${out.added} assigned. ${out.moved.length} moved from another class.`
        : `${out.added} pupil${out.added === 1 ? '' : 's'} assigned.`);
      setBulk(null);
      setPicked([]);
      students.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Removing several is still one decision per pupil on the server. */
  const removeChosen = async () => {
    setBusy(true);
    let gone = 0;
    try {
      for (const pupil of chosen()) {
        try {
          await api.delete(`/students/${pupil.id}?confirm=1`);
          gone += 1;
        } catch {
          /* counted below rather than stopping the rest */
        }
      }
      toast(gone === picked.length
        ? `${gone} pupil${gone === 1 ? '' : 's'} removed.`
        : `${gone} of ${picked.length} removed. The rest could not be.`, gone ? undefined : 'error');
      setBulk(null);
      setPicked([]);
      students.reload();
    } finally {
      setBusy(false);
    }
  };

  /**
   * Taking a pupil off the roll. The server answers a first attempt with what
   * would go, so the warning names real records rather than "cannot be undone".
   */
  const remove = async (pupil: any, confirmed = false) => {
    setBusy(true);
    try {
      await api.delete(`/students/${pupil.id}${confirmed ? '?confirm=1' : ''}`);
      toast(`${pupil.first_name} ${pupil.last_name} removed.`);
      setRemoving(null);
      students.reload();
    } catch (err: any) {
      if (err.body?.attached) setRemoving({ pupil, ...err.body });
      else toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const query = new URLSearchParams({
    ...(section ? { section } : {}),
    ...(supportFilter ? { [supportFilter]: 'true' } : {}),
  }).toString();
  const students = useFetch<any[]>(`/students${query ? `?${query}` : ''}`, [section, supportFilter]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({
    first_name: '', last_name: '', email: '', date_of_birth: '', gender: '',
    emergency_contact_name: '', emergency_contact_phone: '', medical_notes: '',
  });

  const filtered = useMemo(() => {
    const rows = students.data ?? [];
    if (!q.trim()) return rows;
    const needle = q.toLowerCase();
    return rows.filter((s: any) => `${s.first_name} ${s.last_name} ${s.student_code} ${s.email}`.toLowerCase().includes(needle));
  }, [students.data, q]);

  // A register runs to hundreds; a screenful at a time is what gets read.
  const PAGE_SIZE = 15;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);

  // Searching or switching section starts again from the first page.
  useEffect(() => { setPage(1); }, [q, section, supportFilter]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      // A new pupil is enrolled here and placed in a class on Classes & timetable,
      // so there is one place a register is decided rather than two.
      await api.post('/students', { ...form, class_id: null });
      toast('Enrolled. Put them in a class from Classes and timetable.');
      setOpen(false);
      setForm({ first_name: '', last_name: '', email: '', date_of_birth: '', gender: '',
                emergency_contact_name: '', emergency_contact_phone: '', medical_notes: '' });
      students.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        icon="users" title="Students"
        subtitle="The school roll. Enrol pupils one at a time or as a list, keep who they are and who to call, and record the support any of them needs. Classes are set on Classes & timetable."
        actions={
          <>
            <button className="btn-ghost" onClick={() => setImporting(true)}>
              <Icon name="upload" className="h-4 w-4" /> Import a list
            </button>
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Icon name="plus" className="h-4 w-4" /> Enrol student
            </button>
          </>
        }
      />

      <div className="mb-5 space-y-3">
        <label className="relative block">
          <span className="sr-only">Search students</span>
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input className="input !pl-10" type="search" value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Search by name, code or email…" />
        </label>
        <div className="grid gap-3 sm:max-w-lg sm:grid-cols-2">
          <Select
            ariaLabel="Filter by section" value={section} onChange={setSection}
            options={[{ value: '', label: 'All sections' },
                      ...sections.map((sec) => ({ value: sec.key, label: sec.name }))]}
          />
          <Select
            ariaLabel="Filter by support" value={supportFilter} onChange={setSupportFilter}
            options={[{ value: '', label: 'Everyone' },
                      { value: 'support', label: 'With support recorded' },
                      { value: 'sen', label: 'On the SEN register' }]}
          />
        </div>
      </div>

      {students.loading && <Loading rows={4} />}
      {students.error && <ErrorNote error={students.error} onRetry={students.reload} />}

      {!students.loading && filtered.length === 0 && (
        // An empty school and an empty search are different problems, and
        // "try a different search" is no help to somebody with no pupils yet.
        (!q && !section && !supportFilter ? (
          <EmptyState
            icon="users" title="No pupils enrolled yet"
            body="Enrol one, or import a list. Once pupils are on the roll, the Support column is where a plan is written for any of them."
            action={<button className="btn-primary" onClick={() => setImporting(true)}>
              <Icon name="upload" className="h-4 w-4" /> Import a list
            </button>}
          />
        ) : (
          <EmptyState
            icon={supportFilter ? 'accessibility' : 'search'}
            title={supportFilter === 'sen' ? 'Nobody is on the SEN register yet'
                   : supportFilter ? 'No support recorded yet' : 'No students found'}
            body={supportFilter
              ? 'Add support from a pupil\u2019s row, or import a list of plans from the SEN register.'
              : 'Try a different search or section.'}
          />
        ))
      )}

      {picked.length > 0 && (
        <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
          <span className="text-sm font-semibold text-ink">
            {picked.length} selected
          </span>
          <button className="btn-ghost btn-sm" onClick={() => setBulk('class')}>
            <Icon name="users" className="h-3.5 w-3.5" /> Assign to a class
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setBulk('remove')}>
            <Icon name="trash" className="h-3.5 w-3.5" /> Remove
          </button>
          <button className="btn-subtle btn-sm ml-auto" onClick={() => setPicked([])}>Clear</button>
        </div>
      )}

      {filtered.length > 0 && (
        <>
          {/* Table on desktop, cards on mobile, same data either way. */}
          <div className="card hidden overflow-hidden lg:block">
            {/* Fixed layout so the four data columns take an equal share of the
                width, rather than the widest cell deciding for the rest. */}
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-12" />
                <col className="w-[23%]" />
                <col className="w-[23%]" />
                <col className="w-[23%]" />
                <col className="w-[23%]" />
                <col className="w-14" />
              </colgroup>
              <thead className="border-b border-line bg-[color:var(--surface-sunken)] text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select every pupil on this page"
                      checked={shown.length > 0 && shown.every((p: any) => picked.includes(p.id))}
                      onChange={(e) => setPicked(e.target.checked
                        ? [...new Set([...picked, ...shown.map((p: any) => p.id)])]
                        : picked.filter((id) => !shown.some((p: any) => p.id === id)))}
                    />
                  </th>
                  <th className="px-4 py-3 font-bold">Student</th>
                  <th className="px-4 py-3 font-bold">Class</th>
                  <th className="px-4 py-3 font-bold">Date of birth</th>
                  <th className="px-4 py-3 font-bold">Support</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((s: any) => (
                  // The whole row opens the pupil, so nothing has to be aimed at.
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/admin/students/${s.id}`)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/admin/students/${s.id}`); }
                    }}
                    className="group cursor-pointer transition-colors hover:bg-[color:var(--surface-sunken)] focus:bg-[color:var(--surface-sunken)] focus:outline-none">
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${s.first_name} ${s.last_name}`}
                        checked={picked.includes(s.id)}
                        onChange={() => setPicked(picked.includes(s.id)
                          ? picked.filter((id) => id !== s.id)
                          : [...picked, s.id])}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar first={s.first_name} last={s.last_name} colour={s.avatar_colour} src={s.avatar_url} emoji={s.avatar_emoji} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{s.first_name} {s.last_name}</p>
                          <p className="truncate text-xs text-ink-faint">{s.student_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="truncate px-4 py-3 text-ink-soft">{s.class_name ?? '-'}</td>
                    <td className="px-4 py-3 tabular-nums text-ink-soft">{s.date_of_birth ? dateShort(s.date_of_birth) : '-'}</td>
                    {/* Support is set from the roll as well as the register, so a
                        pupil can be given a plan where their name already is. */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="-mx-1.5 flex w-full items-start gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-brand-50"
                        onClick={() => openPlan(s)}
                        title={s.iep?.notes || (s.iep ? 'Edit the support plan' : 'Add a support plan')}
                      >
                        {s.iep
                          ? (s.is_sen
                              ? <SenBadges needs={s.needs} multiplier={s.time_multiplier} multiFormat={s.multi_format_approved} />
                              // Written out rather than badged: the note is the
                              // whole content, and a word of it is worth more
                              // than a label saying a note exists.
                              : <span className="line-clamp-2 text-xs leading-snug text-ink-soft">{s.iep.notes}</span>)
                          : (
                            // Visible without hovering: a column that looks empty
                            // reads as a column that does nothing.
                            <span className="flex items-center gap-1 text-xs font-semibold text-ink-faint transition-colors group-hover:text-brand-700">
                              <Icon name="plus" className="h-3.5 w-3.5" /> Add support
                            </span>
                          )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="btn-subtle !min-h-0 !px-1.5 !py-1 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); remove(s); }}
                        aria-label={`Remove ${s.first_name} ${s.last_name}`} title="Remove from the roll"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
            {shown.map((s: any) => (
              <Link key={s.id} to={`/admin/students/${s.id}`} className="card p-4 transition hover:border-brand-300">
                <div className="flex items-start gap-3">
                  <Avatar first={s.first_name} last={s.last_name} colour={s.avatar_colour} src={s.avatar_url} emoji={s.avatar_emoji} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{s.first_name} {s.last_name}</p>
                    <p className="truncate text-xs text-ink-soft">{s.class_name}</p>
                    <p className="text-[11px] text-ink-faint">{s.student_code}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <button
                    className="btn-subtle btn-sm"
                    onClick={(e) => { e.preventDefault(); openPlan(s); }}
                  >
                    {!s.iep
                      ? <><Icon name="plus" className="h-3.5 w-3.5" /> Add support</>
                      : s.is_sen
                        ? <SenBadges needs={s.needs} multiplier={s.time_multiplier} />
                        : <span className="line-clamp-2 text-left text-xs font-normal leading-snug text-ink-soft">{s.iep.notes}</span>}
                  </button>
                </div>
              </Link>
            ))}
          </div>

          <Pagination page={Math.min(page, pageCount)} pageSize={PAGE_SIZE} total={filtered.length}
                      onPage={setPage} noun="pupils" />
        </>
      )}

      <Modal
        open={open} onClose={() => setOpen(false)} title="Enrol a new student" wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="stu-form" disabled={busy || !form.first_name || !form.last_name || !form.email}>
              {busy ? 'Enrolling…' : 'Enrol student'}
            </button>
          </>
        }
      >
        <form id="stu-form" onSubmit={create} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" required>
              <input className="input" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </Field>
            <Field label="Last name" required>
              <input className="input" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </Field>
          </div>
          <Field label="Email address" required hint="Their identifier on the roll. Pupils sign in with a code, not this.">
            <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date of birth">
              <DatePicker
                value={form.date_of_birth}
                onChange={(v) => setForm({ ...form, date_of_birth: v })}
              />
            </Field>
            <Field label="Gender">
              <input className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} placeholder="Optional" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Emergency contact name">
              <input className="input" value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} />
            </Field>
            <Field label="Emergency contact phone">
              <input className="input" type="tel" value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} />
            </Field>
          </div>
          <Field label="Medical notes" hint="Allergies, medication, anything staff must know.">
            <textarea className="input min-h-[5rem] resize-y" value={form.medical_notes} onChange={(e) => setForm({ ...form, medical_notes: e.target.value })} />
          </Field>
        </form>
      </Modal>
      <StudentImport open={importing} onClose={() => setImporting(false)} onDone={() => students.reload()} />

      {/* Saving here writes the same plan the SEN register reads, so a pupil
          given support on the roll is on the register straight away. */}
      <SupportPlanDialog subject={planFor} onClose={() => setPlanFor(null)} onSaved={() => students.reload()} />

      <Modal
        open={!!removing} onClose={() => setRemoving(null)}
        title={removing ? `Remove ${removing.pupil.first_name} ${removing.pupil.last_name}?` : 'Remove pupil'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setRemoving(null)}>Keep them</button>
            <button className="btn-danger" disabled={busy} onClick={() => remove(removing.pupil, true)}>
              {busy ? 'Removing...' : 'Remove and delete the records'}
            </button>
          </>
        }
      >
        {removing && (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">
              Their record goes with them, and it cannot be brought back. A pupil who has left is usually marked
              inactive instead, which keeps their marks and attendance on file.
            </p>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {Object.entries(removing.attached)
                .filter(([, n]) => (n as number) > 0)
                .map(([what, n]) => (
                  <li key={what} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="capitalize text-ink">{what}</span>
                    <b className="tabular-nums text-ink">{n as number}</b>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </Modal>

      <Modal
        open={bulk === 'class'} onClose={() => setBulk(null)}
        title={`Assign ${picked.length} pupil${picked.length === 1 ? '' : 's'} to a class`}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setBulk(null)}>Cancel</button>
            <button className="btn-primary" disabled={busy || !bulkClass} onClick={assignChosen}>
              {busy ? 'Assigning...' : 'Assign them'}
            </button>
          </>
        }
      >
        <Field label="Class" required hint="Anyone already in another class moves here.">
          <Select
            value={bulkClass} onChange={setBulkClass} placeholder="Choose a class"
            options={(classes.data ?? []).map((c: any) => ({
              value: String(c.id),
              label: c.room ? `${c.name} · ${c.room}` : c.name,
              group: nameOf(c.section),
            }))}
          />
        </Field>
      </Modal>

      <Modal
        open={bulk === 'remove'} onClose={() => setBulk(null)}
        title={`Remove ${picked.length} pupil${picked.length === 1 ? '' : 's'}?`}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setBulk(null)}>Keep them</button>
            <button className="btn-danger" disabled={busy} onClick={removeChosen}>
              {busy ? 'Removing...' : 'Remove them and their records'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">
            Their attendance, marks, invoices and guardian links go with them, and cannot be brought back.
            Pupils who have left are usually marked inactive instead.
          </p>
          <ul className="max-h-48 divide-y divide-line overflow-auto rounded-xl border border-line">
            {chosen().map((p: any) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="text-ink">{p.first_name} {p.last_name}</span>
                <span className="text-xs text-ink-faint">{p.class_name ?? 'No class'}</span>
              </li>
            ))}
          </ul>
        </div>
      </Modal>

    </>
  );
}
