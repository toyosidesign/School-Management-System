import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../context/ToastContext';
import { DAY_NAMES } from '../../lib/format';
import { useBranding } from '../../context/BrandingContext';
import { useSections } from '../../lib/useSections';
import Icon from '../../components/Icon';
import SyncMenu from '../../components/SyncMenu';
import ClassImport from '../../components/ClassImport';
import Select from '../../components/Select';
import { Avatar, Badge, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader, SenBadges, Toggle } from '../../components/ui';
import { Link } from 'react-router-dom';

export default function AdminClasses() {
  const { toast } = useToast();
  const { branding } = useBranding();
  const { sections, nameOf, reload: reloadSections } = useSections();
  const classes = useFetch<any[]>('/classes');
  const staff = useFetch<any[]>('/staff');
  const [selected, setSelected] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({ section: '', rooms: '', homeroom_teacher_id: '' });

  useEffect(() => {
    const list = classes.data;
    if (!list) return;
    // A class that has been removed cannot stay open below the grid.
    if (selected && !list.some((c: any) => c.id === selected.id)) setSelected(null);
  }, [classes.data, selected]);

  const roster = useFetch<any[]>(selected ? `/classes/${selected.id}/roster` : null, [selected?.id]);
  const timetable = useFetch<any[]>(selected ? `/timetable?classId=${selected.id}` : null, [selected?.id]);
  const taught = useFetch<any[]>(selected ? `/classes/${selected.id}/subjects` : null, [selected?.id]);
  const subjects = useFetch<any[]>('/subjects');

  const [addSubject, setAddSubject] = useState(false);
  const [subjectForm, setSubjectForm] = useState<any>({ subject_id: '', teacher_id: '' });

  // What this class's section teaches but the class itself does not.
  const offered = !selected ? 0 : (subjects.data ?? []).filter((sub: any) =>
    (sub.sections ?? [sub.section]).includes(selected.section)
    && !(taught.data ?? []).some((row: any) => row.subject_id === sub.id)).length;

  /** Joins the two in one go, rather than a subject at a time. */
  const fillFromSection = async () => {
    setBusy(true);
    try {
      const out = await api.post(`/classes/${selected.id}/subjects/from-section`, {});
      toast(out.added
        ? `${out.added} subject${out.added === 1 ? '' : 's'} added. Give each one a teacher.`
        : 'Nothing to add: this class already teaches them all.');
      taught.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const teachers = (staff.data ?? []).filter((s: any) => s.role === 'teacher' || s.role === 'admin');

  const teachSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/classes/${selected.id}/subjects`, {
        subject_id: Number(subjectForm.subject_id),
        teacher_id: subjectForm.teacher_id ? Number(subjectForm.teacher_id) : null,
      });
      toast('Added to this class.');
      setAddSubject(false);
      setSubjectForm({ subject_id: '', teacher_id: '' });
      taught.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const setTeacher = async (classSubjectId: number, teacherId: string) => {
    try {
      await api.patch(`/class-subjects/${classSubjectId}`, { teacher_id: teacherId ? Number(teacherId) : null });
      taught.reload();
      timetable.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const dropSubject = async (row: any) => {
    try {
      await api.delete(`/class-subjects/${row.id}`);
      toast(`${row.name} removed from ${selected.name}.`);
      taught.reload();
      timetable.reload();
    } catch (err: any) {
      // The server refuses while there is work against it, and says what.
      toast(err.message, 'error');
    }
  };



  // "Room 1, Room 2" or one per line: however the office writes it down.
  const streamNames = (raw: string) =>
    [...new Set(raw.split(/[,\n]/).map((x) => x.trim()).filter(Boolean))];

  // Sections arrive after the first render. Falling back to the first one here
  // keeps what the picker shows and what the form sends in step: a select whose
  // value matches no option displays the first anyway, which is how a class
  // could be submitted with no section at all.
  const chosenSection = form.section || sections[0]?.key || '';

  const planned = streamNames(form.rooms);

  const sectionName = sections.find((sec) => sec.key === chosenSection)?.name ?? '';

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const made = await api.post('/classes', {
        section: chosenSection,
        rooms: planned,
        homeroom_teacher_id: planned.length ? null : form.homeroom_teacher_id || null,
      });
      const n = Array.isArray(made) ? made.length : 1;
      toast(n === 1 ? 'Class created.' : `${n} classes created.`);
      setOpen(false);
      setForm({ section: form.section, rooms: '', homeroom_teacher_id: '' });
      classes.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const [removing, setRemoving] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [copying, setCopying] = useState<any>(null);
  const [copyingYear, setCopyingYear] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [placing, setPlacing] = useState<any>(null);
  const allStudents = useFetch<any[]>('/students');

  /** Moves the chosen pupils into the open class. */
  const placePupils = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const out = await api.post(`/classes/${placing.klass.id}/students`, { student_ids: placing.ids });
      toast(out.moved.length
        ? `${out.added} added. ${out.moved.length} moved from another class.`
        : `${out.added} pupil${out.added === 1 ? '' : 's'} added.`);
      setPlacing(null);
      roster.reload();
      classes.reload();
      allStudents.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const takeOut = async (klass: any, student: any) => {
    try {
      await api.delete(`/classes/${klass.id}/students/${student.id}`);
      toast(`${student.first_name} ${student.last_name} taken out of ${klass.name}.`);
      roster.reload();
      classes.reload();
      allStudents.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  /** A year only goes once it is empty; the server says what is holding it. */
  const removeYear = async (group: any) => {
    const section = sections.find((sec) => sec.key === group.key);
    if (!section) return;
    try {
      await api.delete(`/sections/${section.id}`);
      toast(`${section.name} removed.`);
      reloadSections();
      classes.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  /**
   * Copies a whole year: its classes, what they are taught and when. A school
   * that runs Grade 4 with three classrooms usually runs Grade 5 the same way.
   */
  const duplicateYear = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const made = await api.post(`/sections/${copyingYear.section.id}/duplicate`, {
        name: copyingYear.name.trim(),
        with_classes: copyingYear.with_classes,
        with_subjects: copyingYear.with_classes && copyingYear.with_subjects,
        with_timetable: copyingYear.with_classes && copyingYear.with_subjects && copyingYear.with_timetable,
      });
      toast(`${made.name} created with ${made.copied.classes} class${made.copied.classes === 1 ? '' : 'es'}.`);
      setCopyingYear(null);
      classes.reload();
      reloadSections();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  /**
   * A new class alongside an existing one. What a class is made of, its
   * subjects, their teachers and when they meet, comes across; its pupils do
   * not, because the point of the copy is somewhere to put different ones.
   */
  const duplicate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const made = await api.post(`/classes/${copying.source.id}/duplicate`, {
        section: copying.section,
        name: copying.name.trim() || undefined,
        room: copying.room?.trim() || null,
        with_subjects: copying.with_subjects,
        with_timetable: copying.with_timetable,
      });
      const bits = [
        `${made.copied.subjects} subject${made.copied.subjects === 1 ? '' : 's'}`,
        `${made.copied.lessons} lesson${made.copied.lessons === 1 ? '' : 's'}`,
      ];
      toast(made.needs_teacher.length
        ? `${made.name} created with ${bits.join(' and ')}. ${made.needs_teacher.join(', ')} need${made.needs_teacher.length === 1 ? 's' : ''} a teacher, since the original's is already teaching then.`
        : `${made.name} created with ${bits.join(' and ')}.`);
      setCopying(null);
      setSelected(made);
      classes.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const next = await api.patch(`/classes/${editing.id}`, {
        name: editing.name.trim(),
        room: editing.room?.trim() || null,
      });
      toast(`${next.name} updated.`);
      setSelected(next);
      setEditing(null);
      classes.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // The server answers a first attempt with what would go, so the warning names
  // real numbers rather than a generic "this cannot be undone".
  const remove = async (klass: any, confirmed = false) => {
    setBusy(true);
    try {
      await api.delete(`/classes/${klass.id}${confirmed ? '?confirm=1' : ''}`);
      toast(`${klass.name} removed.`);
      setRemoving(null);
      if (selected?.id === klass.id) setSelected(null);
      classes.reload();
    } catch (err: any) {
      if (err.body?.attached) setRemoving({ klass, ...err.body });
      else toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const setHomeroom = async (klass: any, teacherId: string) => {
    try {
      const next = await api.patch(`/classes/${klass.id}`, { homeroom_teacher_id: teacherId ? Number(teacherId) : null });
      setSelected({ ...klass, ...next });
      classes.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  if (classes.loading) return <Loading rows={3} />;
  if (classes.error) return <ErrorNote error={classes.error} onRetry={classes.reload} />;

  // Every year the school has, in its own order, whether or not a class has
  // been put in it yet: an empty year still needs somewhere to add one.
  const held = (classes.data ?? []).reduce((acc: Record<string, any[]>, c: any) => {
    (acc[c.section] ??= []).push(c);
    return acc;
  }, {} as Record<string, any[]>);

  const yearGroups = [
    ...sections.map((sec) => ({
      key: sec.key, section: sec.key, title: sec.name, classes: held[sec.key] ?? [],
    })),
    // Anything left pointing at a section the school has since removed.
    ...Object.keys(held)
      .filter((key) => !sections.some((sec) => sec.key === key))
      .map((key) => ({ key, section: key, title: nameOf(key), classes: held[key] })),
  ];

  const byDay = (timetable.data ?? []).reduce((acc: any, slot: any) => {
    (acc[slot.day_of_week] ??= []).push(slot);
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        icon="book" title="Classes" subtitle="Years and their classrooms, who is in each one, and what they are taught."
        actions={
          <>
            <SyncMenu onDone={() => { classes.reload(); if (selected) taught.reload(); }} />
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Icon name="plus" className="h-4 w-4" /> New classes
            </button>
          </>
        }
      />

      {classes.data!.length === 0 && (
        <EmptyState
          icon="book" title="No classes yet"
          body="Add a class for each teaching group. Once a class exists you can say what it is taught, by whom, and when."
        />
      )}

      <div className="mb-6 space-y-5">
        {yearGroups.map((group) => {
          const holdsSelected = group.classes.some((c: any) => c.id === selected?.id);

          return (
          <section key={group.key}>
            <div className="group/year mb-2 flex items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="font-display text-base font-bold text-ink">{group.title}</h2>
                <span className="text-xs text-ink-faint">
                  {group.classes.length} class{group.classes.length === 1 ? '' : 'es'}
                  {' · '}{group.classes.reduce((n: number, c: any) => n + c.student_count, 0)} pupils
                </span>
              </div>

              <button
                className="btn-ghost btn-sm shrink-0"
                onClick={() => {
                  const section = sections.find((sec) => sec.key === group.key);
                  if (!section) return;
                  setCopyingYear({
                    section, name: `${section.name} (copy)`,
                    with_classes: true, with_subjects: true, with_timetable: true,
                  });
                }}
              >
                <Icon name="copy" className="h-3.5 w-3.5" /> Duplicate year
              </button>

              <button
                className="btn-subtle !px-2 shrink-0"
                onClick={() => removeYear(group)}
                aria-label={`Remove ${group.title}`} title="Remove this year"
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>

            {/* The classrooms of a year, side by side: a grade is A, B and C,
                not three rows repeating the grade's name. */}
            <div className="flex flex-wrap gap-2">
              {group.classes.map((c: any) => {
                const open = selected?.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelected(open ? null : c)}
                    aria-pressed={open}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${
                      open ? 'border-brand-500 bg-brand-50 text-brand-900'
                        : 'border-line text-ink hover:border-brand-300'
                    }`}
                  >
                    <span className={`grid h-7 min-w-7 place-items-center rounded-lg px-1.5 text-xs font-bold ${
                      open ? 'bg-brand-600 text-white' : 'bg-[color:var(--surface-sunken)] text-ink-soft'
                    }`}>
                      {c.room ?? c.name}
                    </span>
                    <span className="text-xs text-ink-soft">
                      {c.student_count} pupil{c.student_count === 1 ? '' : 's'}
                    </span>
                    <Icon name="chevronDown"
                          className={`h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                );
              })}

              {/* Adding to a year happens where the year is, not from the top
                  of the page with the section picked again by hand. */}
              <button
                onClick={() => {
                  setForm({ ...form, section: group.key, rooms: '' });
                  setOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-line px-3 py-2 text-sm font-semibold text-ink-soft transition hover:border-brand-400 hover:text-brand-700"
              >
                <Icon name="plus" className="h-3.5 w-3.5" /> Add a classroom
              </button>
            </div>

            {group.classes.length > 0 && !holdsSelected && (
              <p className="mt-1.5 text-xs text-ink-faint">
                Open a classroom to add its pupils, its subjects and their teachers.
              </p>
            )}

            {/* The roster, timetable and subjects open under their own year. */}
            {holdsSelected && (
              <div className="mt-4">

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-ink">
            {selected.name}{selected.room ? ` · ${selected.room}` : ''}
          </h2>
          <span className="flex shrink-0 gap-1">
            <button className="btn-subtle !px-2"
                    onClick={() => setCopying({
                      source: selected, section: selected.section, room: '', name: selected.name,
                      with_subjects: true, with_timetable: true,
                    })}
                    aria-label={`Duplicate ${selected.name}`} title="Duplicate this class">
              <Icon name="copy" className="h-4 w-4" />
            </button>
            <button className="btn-subtle !px-2" onClick={() => setEditing({ ...selected })}
                    aria-label={`Edit ${selected.name}`} title="Rename or move it">
              <Icon name="pencil" className="h-4 w-4" />
            </button>
            <button className="btn-subtle !px-2" onClick={() => remove(selected)}
                    aria-label={`Remove ${selected.name}`} title="Remove this class">
              <Icon name="trash" className="h-4 w-4" />
            </button>
          </span>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card p-4 lg:col-span-2">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">
                What {selected.name} is taught
              </h2>
              <button className="btn-ghost btn-sm" onClick={() => setAddSubject(true)}>
                <Icon name="plus" className="h-3.5 w-3.5" /> Add a subject
              </button>
            </div>

            {(taught.data ?? []).length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line px-4 py-3">
                <p className="text-sm text-ink-faint">
                  No subjects yet.{' '}
                  {(subjects.data ?? []).length === 0
                    ? <>Build the curriculum on the <Link to="/admin/subjects" className="font-semibold underline">Subjects</Link> page first.</>
                    : 'Lessons, registers and assignments all follow from a subject and its teacher.'}
                </p>
                {/* The curriculum is decided by section and kept by class, so a
                    school with both is one action away from joining them. */}
                {offered > 0 && (
                  <button className="btn-ghost btn-sm shrink-0" disabled={busy} onClick={fillFromSection}>
                    <Icon name="sparkle" className="h-3.5 w-3.5" />
                    Add the {offered} {nameOf(selected.section)} subject{offered === 1 ? '' : 's'}
                  </button>
                )}
              </div>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {taught.data!.map((row: any) => (
                  <li key={row.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white" style={{ background: row.colour }}>
                      <Icon name={row.icon ?? 'book'} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">{row.name}</p>
                      <Select className="mt-1 !min-h-0 !py-1 !text-xs"
                        value={row.teacher_id ?? ''}
                        onChange={(v) => setTeacher(row.id, v)}
                        options={[{ value: "", label: `No teacher assigned` }, ...teachers.map((t: any) => ({ value: String(t.user_id), label: `${t.first_name} ${t.last_name}` }))]}
                      />
                    </div>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      <Badge tone={row.lessons_per_week ? 'slate' : 'amber'}>
                        {row.lessons_per_week} / week
                      </Badge>
                      <button className="btn-subtle !px-2 !py-1" onClick={() => dropSubject(row)}
                              aria-label={`Remove ${row.name} from ${selected.name}`}>
                        <Icon name="trash" className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">
                Pupils <span className="font-semibold text-ink-faint">{(roster.data ?? []).length}</span>
              </h2>

              <span className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setPlacing({ klass: selected, ids: [], q: '' })}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-800"
              >
                <Icon name="plus" className="h-4 w-4" /> Assign pupils
              </button>

              <label className="flex items-center gap-2 text-xs text-ink-soft">
                Homeroom
                <Select className="!min-h-0 !w-auto !py-1 !text-xs"
                  value={selected.homeroom_teacher_id ?? ''}
                  onChange={(v) => setHomeroom(selected, v)}
                  options={[
                    { value: '', label: 'Unassigned' },
                    ...(staff.data ?? []).filter((t: any) => t.role === 'teacher')
                      .map((t: any) => ({ value: String(t.user_id), label: `${t.first_name} ${t.last_name}` })),
                  ]}
                />
              </label>
              </span>
            </div>

            {roster.loading && <Loading rows={2} />}
            {!roster.loading && (roster.data ?? []).length === 0 && (
              <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-ink-faint">
                Nobody in this class yet. Assign pupils already enrolled, or move them from another class.
              </p>
            )}
            <ul className="space-y-2">
              {(roster.data ?? []).map((s: any) => (
                <li key={s.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                  <Avatar first={s.first_name} last={s.last_name} colour={s.avatar_colour} src={s.avatar_url} emoji={s.avatar_emoji} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{s.first_name} {s.last_name}</span>
                    <span className="block truncate text-xs text-ink-faint">{s.student_code}</span>
                  </span>
                  <SenBadges needs={s.needs} multiplier={s.time_multiplier} compact />
                  <button className="btn-subtle !min-h-0 shrink-0 !px-1.5 !py-1"
                          onClick={() => takeOut(selected, s)}
                          aria-label={`Take ${s.first_name} out of ${selected.name}`} title="Take out of this class">
                    <Icon name="x" className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Weekly timetable</h2>
              <Link to={`/admin/timetable?class=${selected.id}`}
                    className="inline-flex items-center gap-1.5 px-1 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-800">
                Open the timetable <Icon name="chevronRight" className="h-3.5 w-3.5" />
              </Link>
            </div>
            {timetable.loading && <Loading rows={2} />}
            {!timetable.loading && (timetable.data ?? []).length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-ink-faint">
                No lessons yet. Lay out the week on the timetable page.
              </p>
            ) : (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((day) => (
                  <div key={day}>
                    <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint">{DAY_NAMES[day]}</h3>
                    {(byDay[day] ?? []).length === 0 ? (
                      <p className="text-xs text-ink-faint">No lessons.</p>
                    ) : (
                      <ol className="flex flex-wrap gap-1.5">
                        {byDay[day].sort((a: any, b: any) => a.period - b.period).map((slot: any) => (
                          <li key={slot.id}
                              className="rounded-lg px-2 py-1 text-[11px] font-semibold text-white"
                              style={{ background: slot.colour }}
                              title={`${slot.subject} · ${slot.start_time} to ${slot.end_time}`}>
                            P{slot.period} {slot.subject}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>
              </div>
            )}
          </section>
          );
        })}
      </div>

      <Modal
        open={open} onClose={() => setOpen(false)} title="Create a class"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="class-form" disabled={busy || !planned.length}>
              {busy ? 'Creating...' : planned.length > 1 ? `Create ${planned.length} classes` : 'Create class'}
            </button>
          </>
        }
      >
        <form id="class-form" onSubmit={create} className="space-y-4">
          <Field label="Section" required hint="Which part of the school it belongs to.">
            <Select
              value={chosenSection}
              onChange={(v) => setForm({ ...form, section: v })}
              options={sections.map((sec) => ({ value: sec.key, label: sec.name }))}
            />
          </Field>

          <Field
            label="Classrooms" required
            hint={sectionName
              ? `One per class, separated by commas. Each becomes a class of ${sectionName} in that classroom.`
              : 'One per class, separated by commas.'}
          >
            <textarea className="input min-h-[4.5rem] resize-y" required value={form.rooms}
                      placeholder="A, B, C"
                      onChange={(e) => setForm({ ...form, rooms: e.target.value })} />
          </Field>

          {planned.length > 0 ? (
            <div className="rounded-xl panel-brand p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                Creates {planned.length} class{planned.length === 1 ? '' : 'es'}
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {planned.map((room: string) => (
                  <li key={room}><Badge tone="brand">{sectionName || room} · Classroom {room}</Badge></li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-faint">
                Give each its homeroom teacher, subjects and timetable once they are created.
              </p>
            </div>
          ) : (
            <Field label="Homeroom teacher">
              <Select
                value={form.homeroom_teacher_id}
                onChange={(v) => setForm({ ...form, homeroom_teacher_id: v })}
                options={[{ value: "", label: `Unassigned` }, ...(staff.data ?? []).filter((s: any) => s.role === 'teacher').map((s: any) => ({ value: String(s.user_id), label: `${s.first_name} ${s.last_name}` }))]}
              />
            </Field>
          )}
        </form>
      </Modal>

      <Modal
        open={!!copying} onClose={() => setCopying(null)}
        title={copying ? `Duplicate ${copying.source.name}` : 'Duplicate class'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setCopying(null)}>Cancel</button>
            <button className="btn-primary" form="copy-class-form"
                    disabled={busy || !copying?.room.trim()}>
              {busy ? 'Copying...' : 'Create the copy'}
            </button>
          </>
        }
      >
        {copying && (
          <form id="copy-class-form" onSubmit={duplicate} className="space-y-4">
            <Field label="Section" required hint="Which part of the school the copy joins.">
              <Select
                value={copying.section}
                onChange={(v) => setCopying({ ...copying, section: v })}
                options={sections.map((sec) => ({ value: sec.key, label: sec.name }))}
              />
            </Field>

            <Field label="Classroom" required hint="What tells this copy apart from the class it came from.">
              <input className="input" required autoFocus value={copying.room} placeholder="e.g. B"
                     onChange={(e) => setCopying({ ...copying, room: e.target.value })} />
            </Field>

            {copying.room.trim() && (
              <p className="rounded-xl panel-brand px-3 py-2.5 text-sm text-ink">
                Creates <b>{copying.name}</b> in classroom <b>{copying.room.trim()}</b>
              </p>
            )}

            <div className="space-y-3 rounded-xl border border-line p-3">
              <Toggle
                checked={copying.with_subjects}
                onChange={(v) => setCopying({ ...copying, with_subjects: v, with_timetable: v && copying.with_timetable })}
                label="Bring its subjects and teachers"
                hint="The same subjects, taught by the same people"
              />
              <Toggle
                checked={copying.with_timetable && copying.with_subjects}
                onChange={(v) => setCopying({ ...copying, with_timetable: v })}
                label="Bring its timetable"
                hint="Same days and periods. A subject whose teacher is already busy then arrives without one"
              />
            </div>

            <p className="text-xs text-ink-faint">
              Pupils are not copied. The new class starts empty, ready to be filled.
            </p>
          </form>
        )}
      </Modal>

      <Modal
        open={!!placing} onClose={() => setPlacing(null)} wide
        title={placing ? `Assign pupils to ${placing.klass.name}` : 'Assign pupils'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setPlacing(null)}>Cancel</button>
            <button className="btn-primary" form="place-form" disabled={busy || !placing?.ids.length}>
              {busy ? 'Assigning...' : `Assign ${placing?.ids.length || ''} pupil${placing?.ids.length === 1 ? '' : 's'}`}
            </button>
          </>
        }
      >
        {placing && (() => {
          const pupils = (allStudents.data ?? []).filter((p: any) => p.class_id !== placing.klass.id);
          const needle = placing.q.trim().toLowerCase();
          const shown = needle
            ? pupils.filter((p: any) => `${p.first_name} ${p.last_name} ${p.student_code}`.toLowerCase().includes(needle))
            : pupils;
          const unplaced = shown.filter((p: any) => !p.class_id);
          const elsewhere = shown.filter((p: any) => p.class_id);

          const toggle = (id: number) => setPlacing({
            ...placing,
            ids: placing.ids.includes(id) ? placing.ids.filter((x: number) => x !== id) : [...placing.ids, id],
          });

          const Row = ({ p }: any) => (
            <li>
              <button
                type="button" onClick={() => toggle(p.id)} aria-pressed={placing.ids.includes(p.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                  placing.ids.includes(p.id) ? 'border-brand-500 bg-brand-50' : 'border-line hover:border-brand-300'
                }`}
              >
                <Avatar first={p.first_name} last={p.last_name} colour={p.avatar_colour}
                        src={p.avatar_url} emoji={p.avatar_emoji} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{p.first_name} {p.last_name}</span>
                  <span className="block truncate text-xs text-ink-faint">
                    {p.student_code}{p.class_name ? ` · currently in ${p.class_name}` : ''}
                  </span>
                </span>
                {placing.ids.includes(p.id) && <Icon name="check" className="h-4 w-4 shrink-0 text-brand-600" />}
              </button>
            </li>
          );

          return (
            <form id="place-form" onSubmit={placePupils} className="space-y-4">
              <Field label="Search" hint="By name or pupil number.">
                <input className="input" value={placing.q} placeholder="Start typing a name"
                       onChange={(e) => setPlacing({ ...placing, q: e.target.value })} />
              </Field>

              {shown.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-faint">
                  {pupils.length ? 'Nobody matches that.' : 'Every pupil is already in this class.'}
                </p>
              ) : (
                <div className="max-h-72 space-y-4 overflow-auto pr-1">
                  {unplaced.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint">
                        Not in a class yet
                      </p>
                      <ul className="space-y-1.5">{unplaced.map((p: any) => <Row key={p.id} p={p} />)}</ul>
                    </div>
                  )}
                  {elsewhere.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint">
                        In another class
                      </p>
                      <ul className="space-y-1.5">{elsewhere.map((p: any) => <Row key={p.id} p={p} />)}</ul>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-ink-faint">
                A pupil belongs to one class, so anybody chosen from another class moves here.
              </p>
            </form>
          );
        })()}
      </Modal>

      <Modal
        open={!!copyingYear} onClose={() => setCopyingYear(null)} wide
        title={copyingYear ? `Duplicate ${copyingYear.section.name}` : 'Duplicate year'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setCopyingYear(null)}>Cancel</button>
            <button className="btn-primary" form="copy-year-form" disabled={busy || !copyingYear?.name.trim()}>
              {busy ? 'Copying...' : 'Create the copy'}
            </button>
          </>
        }
      >
        {copyingYear && (
          <form id="copy-year-form" onSubmit={duplicateYear} className="space-y-4">
            <Field label="Name the new year" required hint="Grade 4 copied as Grade 5, and so on.">
              <input className="input" required autoFocus value={copyingYear.name}
                     onChange={(e) => setCopyingYear({ ...copyingYear, name: e.target.value })} />
            </Field>

            <div className="space-y-3 rounded-xl border border-line p-3">
              <Toggle
                checked={copyingYear.with_classes}
                onChange={(v) => setCopyingYear({ ...copyingYear, with_classes: v })}
                label={`Bring its ${copyingYear.section.class_count} class${copyingYear.section.class_count === 1 ? '' : 'es'}`}
                hint="The same classrooms, named for the new year"
              />
              <Toggle
                checked={copyingYear.with_classes && copyingYear.with_subjects}
                onChange={(v) => setCopyingYear({ ...copyingYear, with_subjects: v })}
                label="Bring what they are taught"
                hint="The same subjects, taught by the same people"
              />
              <Toggle
                checked={copyingYear.with_classes && copyingYear.with_subjects && copyingYear.with_timetable}
                onChange={(v) => setCopyingYear({ ...copyingYear, with_timetable: v })}
                label="Bring their timetable"
                hint="Same days and periods. A subject whose teacher is already busy then arrives without one"
              />
            </div>

            <p className="text-xs text-ink-faint">
              Pupils are not copied. The new classes start empty, ready to be filled.
            </p>
          </form>
        )}
      </Modal>

      <Modal
        open={!!editing} onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : 'Edit class'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn-primary" form="edit-class-form" disabled={busy || !editing?.name?.trim()}>
              {busy ? 'Saving...' : 'Save changes'}
            </button>
          </>
        }
      >
        {editing && (
          <form id="edit-class-form" onSubmit={saveClass} className="space-y-4">
            <Field label="Class name" required hint="What appears on registers and reports.">
              <input className="input" required value={editing.name}
                     onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Classroom">
              <input className="input" value={editing.room ?? ''}
                     onChange={(e) => setEditing({ ...editing, room: e.target.value })} />
            </Field>
            <p className="text-xs text-ink-faint">
              Pupils, subjects and the timetable stay with the class.
            </p>
          </form>
        )}
      </Modal>

      <Modal
        open={!!removing} onClose={() => setRemoving(null)}
        title={removing ? `Remove ${removing.klass.name}?` : 'Remove class'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setRemoving(null)}>Keep it</button>
            <button className="btn-danger" disabled={busy} onClick={() => remove(removing.klass, true)}>
              {busy ? 'Removing...' : 'Remove the class'}
            </button>
          </>
        }
      >
        {removing && (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">
              The class has no pupils left, but its teaching records go with it and cannot be brought back.
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
        open={addSubject} onClose={() => setAddSubject(false)}
        title={selected ? `Add a subject to ${selected.name}` : 'Add a subject'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setAddSubject(false)}>Cancel</button>
            <button className="btn-primary" form="teach-form" disabled={busy || !subjectForm.subject_id}>
              {busy ? 'Adding...' : 'Add subject'}
            </button>
          </>
        }
      >
        <form id="teach-form" onSubmit={teachSubject} className="space-y-4">
          <Field label="Subject" required hint="Subjects are listed for this class's section.">
            <Select
              value={subjectForm.subject_id}
              onChange={(v) => setSubjectForm({ ...subjectForm, subject_id: v })}
              options={[{ value: "", label: `Choose a subject` }, ...(subjects.data ?? [])
                .filter((sub: any) => !selected || sub.section === selected.section)
                .filter((sub: any) => !(taught.data ?? []).some((t: any) => t.subject_id === sub.id)).map((sub: any) => ({ value: String(sub.id), label: `${sub.name}` }))]}
            />
          </Field>
          <Field label="Taught by" hint="Can be left until you have invited your staff.">
            <Select
              value={subjectForm.teacher_id}
              onChange={(v) => setSubjectForm({ ...subjectForm, teacher_id: v })}
              options={[{ value: "", label: `Decide later` }, ...teachers.map((t: any) => ({ value: String(t.user_id), label: `${t.first_name} ${t.last_name}` }))]}
            />
          </Field>
        </form>
      </Modal>

      <ClassImport
        open={importing} onClose={() => setImporting(false)}
        onDone={() => { classes.reload(); reloadSections(); }}
      />

    </>
  );
}
