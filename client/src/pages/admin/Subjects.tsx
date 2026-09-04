import { useState } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../context/ToastContext';
import { useSections } from '../../lib/useSections';
import Icon from '../../components/Icon';
import SyncMenu from '../../components/SyncMenu';
import Select from '../../components/Select';
import TeacherPicker from '../../components/TeacherPicker';
import { Badge, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader } from '../../components/ui';

/**
 * One mark per thing a school teaches, named for the subject rather than for
 * the drawing, so picking one is a matter of recognising your own timetable.
 */
const ICONS: [string, string][] = [
  ['text', 'English, literacy'],
  ['book', 'Reading, literature'],
  ['pencil', 'Writing, handwriting'],
  ['calculator', 'Mathematics, numeracy'],
  ['flask', 'Science, chemistry'],
  ['atom', 'Physics'],
  ['leaf', 'Biology, nature'],
  ['globe', 'Geography, world studies'],
  ['compass', 'Exploration, orienteering'],
  ['scroll', 'History'],
  ['temple', 'Religious education'],
  ['translate', 'Modern languages'],
  ['code', 'Computing, ICT'],
  ['palette', 'Art and design'],
  ['drama', 'Drama, theatre'],
  ['music', 'Music'],
  ['camera', 'Media, photography'],
  ['ball', 'Physical education, sport'],
  ['ruler', 'Design and technology'],
  ['chef', 'Food technology, cooking'],
  ['heart', 'PSHE, wellbeing'],
  ['money', 'Business, economics'],
  ['chart', 'Statistics, data'],
  ['bulb', 'General studies, thinking'],
  ['puzzle', 'Support, intervention'],
  ['baby', 'Early years'],
  ['accessibility', 'SEN, inclusion'],
  ['sparkle', 'Enrichment, clubs'],
];

const PALETTE = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c',
                 '#ca8a04', '#16a34a', '#0d9488', '#0891b2', '#475569'];

const blank = { name: '', category: '', sections: [] as string[], colour: '#2563eb', icon: 'book', code: '' };

/**
 * What the school teaches. Everything academic hangs off these: a class takes
 * subjects, a subject in a class has a teacher, and lessons, registers and
 * assignments all attach to that pairing.
 */
export default function AdminSubjects() {
  const { toast } = useToast();
  const classes = useFetch<any[]>('/classes');
  const staff = useFetch<any[]>('/staff');
  const [teaching, setTeaching] = useState<any>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const { sections, nameOf } = useSections();
  const { data, loading, error, reload } = useFetch<any[]>('/subjects');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [staffing, setStaffing] = useState<any>(null);
  const [form, setForm] = useState<any>(blank);

  // Sections load after the first render, so a new subject starts in the first
  // one rather than in none at all.
  const chosenSections: string[] = form.sections?.length
    ? form.sections
    : (sections[0] ? [sections[0].key] : []);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        await api.patch(`/subjects/${editing.id}`, { ...form, sections: chosenSections });
        toast(`${form.name} updated.`);
      } else {
        await api.post('/subjects', { ...form, sections: chosenSections });
        toast(`${form.name} added to the curriculum.`);
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

  const remove = async (subject: any) => {
    try {
      await api.delete(`/subjects/${subject.id}`);
      toast(`${subject.name} removed.`);
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  /** Same colour, same icon, a new name: how a second stream of a subject starts. */
  const duplicate = (subject: any) => {
    setEditing(null);
    setAddingCategory(false);
    setForm({
      name: `${subject.name} (copy)`, category: subject.category ?? '',
      sections: subject.sections ?? [subject.section],
      colour: subject.colour ?? '#2563eb', icon: subject.icon ?? 'book', code: '',
    });
    setOpen(true);
  };

  /** Which classes take this subject, set as one list rather than one at a time. */
  const openClasses = async (subject: any) => {
    try {
      const taking = await api.get(`/subjects/${subject.id}/classes`);
      setTeaching({
        subject,
        class_ids: taking.map((t: any) => t.class_id),
        teacher_id: '',
        current: taking,
      });
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const saveClasses = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const out = await api.put(`/subjects/${teaching.subject.id}/classes`, {
        class_ids: teaching.class_ids,
        teacher_id: teaching.teacher_id || null,
      });
      const said = [
        out.added.length && `added to ${out.added.length} class${out.added.length === 1 ? '' : 'es'}`,
        out.removed.length && `removed from ${out.removed.length}`,
      ].filter(Boolean).join(', ');
      toast(out.kept_because_of_work.length
        ? `${said || 'Saved'}. ${out.kept_because_of_work.join(', ')} kept it: there is work recorded against it.`
        : `${teaching.subject.name}: ${said || 'nothing changed'}.`);
      setTeaching(null);
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const edit = (subject: any) => {
    setEditing(subject);
    setAddingCategory(false);
    setForm({
      name: subject.name,
      category: subject.category ?? '',
      sections: subject.sections ?? [subject.section],
      colour: subject.colour ?? '#2563eb',
      icon: subject.icon ?? 'book',
    });
    setOpen(true);
  };

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const subjects = data ?? [];
  // Grouped in the school's own order, and only where something is taught.
  const inSection = (subject: any, key: string) =>
    (subject.sections ?? [subject.section]).includes(key);

  // A school thinks of its offer by category first: Languages, Sciences,
  // Humanities. Which classes take a subject comes after that.
  const categories = [...new Set(subjects.map((s) => s.category || ''))]
    .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  const known = categories.filter(Boolean);

  return (
    <>
      <PageHeader
        icon="book" title="Subjects"
        subtitle="What the school teaches, grouped as your curriculum is. Classes take their subjects from this list."
        actions={
          <>
            <SyncMenu onDone={reload} />
            <button className="btn-primary" onClick={() => { setEditing(null); setForm(blank); setOpen(true); }}>
              <Icon name="plus" className="h-4 w-4" /> New subject
            </button>
          </>
        }
      />

      {subjects.length === 0 ? (
        <EmptyState
          icon="book" title="No subjects yet"
          body="Add what you teach, one subject per section. Nothing else in the platform can be set up until this list exists."
        />
      ) : (
        <div className="space-y-6">
          {categories.map((category) => {
            const inGroup = subjects.filter((s) => (s.category || '') === category);
            return (
              <section key={category || 'uncategorised'}>
                <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3">
                  <h2 className="font-display text-base font-bold text-ink">
                    {category || 'Not in a category'}
                  </h2>
                  <span className="text-xs text-ink-faint">
                    {inGroup.length} subject{inGroup.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {inGroup.map((s) => (
                    <article key={s.id} className="card group relative flex flex-col p-4">
                      <div className="flex items-center gap-3 pr-20">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white"
                              style={{ background: s.colour }}>
                          <Icon name={s.icon ?? 'book'} className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-bold leading-tight text-ink">{s.name}</p>
                          <p className="mt-0.5 truncate text-xs text-ink-soft">
                            {(s.sections ?? [s.section]).map(nameOf).join(' · ')}
                          </p>
                        </div>
                      </div>

                      {/* The controls keep to the corner until they are wanted. */}
                      <span className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <button className="btn-subtle !min-h-0 !px-1.5 !py-1" onClick={() => edit(s)}
                                aria-label={`Edit ${s.name}`} title="Edit">
                          <Icon name="pencil" className="h-3.5 w-3.5" />
                        </button>
                        <button className="btn-subtle !min-h-0 !px-1.5 !py-1" onClick={() => duplicate(s)}
                                aria-label={`Duplicate ${s.name}`} title="Duplicate">
                          <Icon name="copy" className="h-3.5 w-3.5" />
                        </button>
                        <button className="btn-subtle !min-h-0 !px-1.5 !py-1" onClick={() => remove(s)}
                                aria-label={`Delete ${s.name}`} title="Remove">
                          <Icon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      </span>

                      {/* Who teaches it, before any class is involved. */}
                      <button
                        onClick={() => setStaffing({ kind: 'subject', id: s.id, name: s.name, teachers: s.teachers })}
                        className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3 text-left text-sm transition-colors hover:text-brand-700"
                      >
                        <span className="min-w-0 truncate text-ink-soft">
                          {s.teachers?.length
                            ? s.teachers.map((t: any) => t.name).join(', ')
                            : 'Nobody named as teaching it'}
                        </span>
                        <Icon name="users" className="h-4 w-4 shrink-0 text-ink-faint" />
                      </button>

                      <button
                        onClick={() => openClasses(s)}
                        className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-3 text-left text-sm transition-colors hover:text-brand-700"
                      >
                        <span className="text-ink-soft">
                          {s.class_count
                            ? `Taken by ${s.class_count} class${s.class_count === 1 ? '' : 'es'}`
                            : 'No class takes it yet'}
                        </span>
                        <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-ink-faint" />
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <TeacherPicker target={staffing} onClose={() => setStaffing(null)} onSaved={reload} />

      <Modal
        open={!!teaching} onClose={() => setTeaching(null)} wide
        title={teaching ? `Classes taking ${teaching.subject.name}` : 'Classes'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setTeaching(null)}>Cancel</button>
            <button className="btn-primary" form="teaching-form" disabled={busy}>
              {busy ? 'Saving...' : 'Save'}
            </button>
          </>
        }
      >
        {teaching && (
          <form id="teaching-form" onSubmit={saveClasses} className="space-y-4">
            <p className="text-sm text-ink-soft">
              Tick every class that takes it. A class already teaching it keeps its teacher and its lessons.
            </p>

            {(() => {
              const taughtIn = teaching.subject.sections ?? [teaching.subject.section];
              const eligible = (classes.data ?? []).filter((c: any) => taughtIn.includes(c.section));
              if (!eligible.length) {
                return <p className="py-6 text-center text-sm text-ink-faint">
                  No classes in this section yet.
                </p>;
              }

              const years = [...new Set(eligible.map((c: any) => nameOf(c.section)))];
              const toggle = (id: number) => setTeaching({
                ...teaching,
                class_ids: teaching.class_ids.includes(id)
                  ? teaching.class_ids.filter((x: number) => x !== id)
                  : [...teaching.class_ids, id],
              });

              return (
                <div className="space-y-3">
                  {years.map((year) => {
                    const inYear = eligible.filter((c: any) => nameOf(c.section) === year);
                    const allOn = inYear.every((c: any) => teaching.class_ids.includes(c.id));
                    return (
                      <div key={year} className="rounded-xl border border-line p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-ink">{year}</span>
                          <button
                            type="button" className="btn-ghost btn-sm"
                            onClick={() => setTeaching({
                              ...teaching,
                              class_ids: allOn
                                ? teaching.class_ids.filter((id: number) => !inYear.some((c: any) => c.id === id))
                                : [...new Set([...teaching.class_ids, ...inYear.map((c: any) => c.id)])],
                            })}
                          >
                            {allOn ? 'None' : 'All of them'}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {inYear.map((c: any) => {
                            const on = teaching.class_ids.includes(c.id);
                            const taught = teaching.current.find((t: any) => t.class_id === c.id);
                            return (
                              <button
                                key={c.id} type="button" onClick={() => toggle(c.id)} aria-pressed={on}
                                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                                  on ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-line text-ink-soft hover:text-ink'
                                }`}
                              >
                                <span className="block font-semibold">{c.stream || c.name}</span>
                                <span className="block text-[11px] text-ink-faint">
                                  {taught?.teacher_name ?? (on ? 'No teacher yet' : 'Not taking it')}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <Field label="Teacher for the classes being added" hint="Optional. Classes already teaching it keep theirs.">
              <Select
                value={teaching.teacher_id}
                onChange={(v) => setTeaching({ ...teaching, teacher_id: v })}
                options={[{ value: "", label: `Decide later` }, ...(staff.data ?? []).filter((s: any) => s.role === 'teacher' || s.role === 'admin').map((s: any) => ({ value: String(s.user_id), label: `${s.first_name} ${s.last_name}` }))]}
              />
            </Field>
          </form>
        )}
      </Modal>

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New subject'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="subject-form" disabled={busy || !form.name.trim()}>
              {busy ? 'Saving...' : editing ? 'Save changes' : 'Add subject'}
            </button>
          </>
        }
      >
        <form id="subject-form" onSubmit={save} className="space-y-4">
          <Field label="Subject name" required>
            <input className="input" required value={form.name} placeholder="e.g. Mathematics"
                   onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>

          <Field label="Category" hint="How the school groups its offer: Languages, Sciences, Humanities.">
            <Select
              value={addingCategory ? '__new__' : (form.category ?? '')}
              onChange={(v) => {
                setAddingCategory(v === '__new__');
                setForm({ ...form, category: v === '__new__' ? '' : v });
              }}
              placeholder="Not in a category"
              options={[
                { value: '', label: 'Not in a category' },
                ...known.map((c) => ({ value: c, label: c })),
                { value: '__new__', label: 'A new category...' },
              ]}
            />
          </Field>

          {addingCategory && (
            <Field label="Name the category" required>
              <input className="input" required autoFocus value={form.category ?? ''} placeholder="e.g. Creative arts"
                     onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>
          )}

          <Field label="Taught in" required hint="Every part of the school that teaches it. Mathematics usually runs through all of them.">
            <div className="flex flex-wrap gap-2">
              {sections.map((sec) => {
                const on = chosenSections.includes(sec.key);
                return (
                  <button
                    key={sec.key} type="button" aria-pressed={on}
                    onClick={() => setForm({
                      ...form,
                      sections: on
                        ? chosenSections.filter((k: string) => k !== sec.key)
                        : [...chosenSections, sec.key],
                    })}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      on ? 'border-brand-500 bg-brand-50 text-brand-800'
                        : 'border-line text-ink-soft hover:border-brand-300 hover:text-ink'
                    }`}
                  >
                    {sec.name}
                  </button>
                );
              })}
            </div>
          </Field>

          {!editing && (
            <Field label="Code" hint="Optional. Left blank, one is made from the name.">
              <input className="input font-mono uppercase" value={form.code} placeholder="MATH"
                     onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </Field>
          )}

          <Field label="Colour" hint="Used on timetables, registers and the pupil's subject cards.">
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c} type="button" onClick={() => setForm({ ...form, colour: c })}
                  aria-label={c} aria-pressed={form.colour === c}
                  className={`h-9 w-9 rounded-xl transition ${
                    form.colour === c ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-[color:var(--surface)]' : ''
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Field>

          <Field label="Icon" hint="Shown on timetables, registers and the pupil's subject cards.">
            <div className="grid grid-cols-7 gap-2 sm:grid-cols-10">
              {ICONS.map(([name, label]) => (
                <button
                  key={name} type="button" onClick={() => setForm({ ...form, icon: name })}
                  aria-label={label} title={label} aria-pressed={form.icon === name}
                  className={`grid h-10 w-full place-items-center rounded-xl border transition ${
                    form.icon === name
                      ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/20'
                      : 'border-line text-ink-soft hover:border-brand-300 hover:text-ink'
                  }`}
                >
                  <Icon name={name} className="h-5 w-5" />
                </button>
              ))}
            </div>
          </Field>

          <div className="flex items-center gap-3 rounded-xl bg-[color:var(--surface-sunken)] p-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: form.colour }}>
              <Icon name={form.icon} className="h-5 w-5" />
            </span>
            <span className="text-sm font-bold text-ink">{form.name || 'Subject name'}</span>
          </div>
        </form>
      </Modal>
    </>
  );
}
