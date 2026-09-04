import { useState } from 'react';
import { api } from '../../lib/api';
import { useSections } from '../../lib/useSections';
import { useToast } from '../../context/ToastContext';
import Icon from '../../components/Icon';
import SyncMenu from '../../components/SyncMenu';
import TeacherPicker from '../../components/TeacherPicker';
import { Badge, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader, Toggle } from '../../components/ui';

/** A few ways schools actually divide themselves, offered as a starting point. */
const PATTERNS = [
  { label: 'Nursery, Primary, Secondary', names: ['Nursery', 'Primary', 'Secondary'] },
  { label: 'Years 1 to 12', names: ['Whole school'] },
  { label: 'Primary, Junior and Senior Secondary',
    names: ['Nursery', 'Primary', 'Junior Secondary', 'Senior Secondary'] },
  { label: 'Early Years, Prep, Senior', names: ['Early Years', 'Prep', 'Senior'] },
];

/**
 * How the school divides itself up.
 *
 * Classes and subjects belong to a section, and a school knows its own shape:
 * one continuum of Year 1 to 12, or four phases with Junior and Senior
 * Secondary kept apart. Renaming is always safe, because everything academic
 * holds the handle underneath rather than the name on the page.
 */
export default function AdminSections() {
  const { toast } = useToast();
  const { sections, loading, error, reload } = useSections();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const [copying, setCopying] = useState<any>(null);
  const [staffing, setStaffing] = useState<any>(null);

  /**
   * Copies a section and the shape of what runs inside it: its classes, their
   * subjects and their timetable. Pupils stay where they are.
   */
  const duplicate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const made = await api.post(`/sections/${copying.source.id}/duplicate`, {
        name: copying.name.trim(),
        with_classes: copying.with_classes,
        with_subjects: copying.with_classes && copying.with_subjects,
        with_timetable: copying.with_classes && copying.with_subjects && copying.with_timetable,
      });
      const bits = [
        `${made.copied.classes} class${made.copied.classes === 1 ? '' : 'es'}`,
        `${made.copied.subjects} subject${made.copied.subjects === 1 ? '' : 's'}`,
        made.copied.lessons ? `${made.copied.lessons} lesson${made.copied.lessons === 1 ? '' : 's'}` : null,
      ].filter(Boolean).join(', ');

      toast(made.needs_teacher.length
        ? `${made.name} created with ${bits}. ${made.needs_teacher.join(', ')} need a teacher: the original's is busy then.`
        : `${made.name} created with ${bits}.`);
      setCopying(null);
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/sections', { name: name.trim() });
      toast(`${name.trim()} added.`);
      setName('');
      setOpen(false);
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const rename = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/sections/${editing.id}`, { name: editing.name.trim() });
      toast('Renamed. Classes and subjects are unaffected.');
      setEditing(null);
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  /**
   * Writes a new running order. Positions are renumbered in tens so the next
   * change has room between any two without renumbering the lot again.
   */
  const reorder = async (list: any[]) => {
    const changed = list.filter((s, i) => s.sort_order !== (i + 1) * 10);
    if (!changed.length) return;
    try {
      await Promise.all(list.map((s, i) =>
        s.sort_order === (i + 1) * 10 ? null : api.patch(`/sections/${s.id}`, { sort_order: (i + 1) * 10 })
      ).filter(Boolean));
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  /** Dragging with a mouse, arrow keys on the handle for everyone else. */
  const move = (section: any, direction: -1 | 1) => {
    const list = [...sections].sort((a, b) => a.sort_order - b.sort_order);
    const from = list.findIndex((s) => s.id === section.id);
    const to = from + direction;
    if (to < 0 || to >= list.length) return;
    list.splice(to, 0, ...list.splice(from, 1));
    reorder(list);
  };

  const drop = (targetId: number) => {
    if (dragging == null || dragging === targetId) return;
    const list = [...sections].sort((a, b) => a.sort_order - b.sort_order);
    const from = list.findIndex((s) => s.id === dragging);
    const to = list.findIndex((s) => s.id === targetId);
    list.splice(to, 0, ...list.splice(from, 1));
    setDragging(null);
    setOver(null);
    reorder(list);
  };

  const remove = async (section: any) => {
    try {
      await api.delete(`/sections/${section.id}`);
      toast(`${section.name} removed.`);
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const applyPattern = async (names: string[]) => {
    setBusy(true);
    try {
      const existing = new Set(sections.map((s) => s.name.toLowerCase()));
      const missing = names.filter((n) => !existing.has(n.toLowerCase()));
      for (const n of missing) await api.post('/sections', { name: n });
      toast(missing.length ? `Added ${missing.join(', ')}.` : 'You already have those.');
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <>
      <PageHeader
        icon="book" title="School sections"
        subtitle="How your school divides itself up. Classes and subjects belong to one of these, and reports group by them."
        actions={
          <>
          <SyncMenu onDone={reload} />
          <button className="btn-primary" onClick={() => { setName(''); setOpen(true); }}>
            <Icon name="plus" className="h-4 w-4" /> New section
          </button>
          </>
        }
      />

      {ordered.length === 0 ? (
        <EmptyState icon="book" title="No sections yet"
                    body="Add the phases your school teaches in, from the youngest upwards." />
      ) : (
        <ul className="mb-6 space-y-3">
          {ordered.map((section, i) => (
            <li
              key={section.id}
              draggable
              onDragStart={() => setDragging(section.id)}
              onDragEnd={() => { setDragging(null); setOver(null); }}
              onDragOver={(e) => { e.preventDefault(); setOver(section.id); }}
              onDrop={() => drop(section.id)}
              className={`card flex flex-wrap items-center gap-3 p-4 transition ${
                dragging === section.id ? 'opacity-50'
                  : over === section.id ? 'border-brand-400 ring-2 ring-brand-500/20' : ''
              }`}
            >
              <button
                className="btn-subtle !min-h-0 shrink-0 cursor-grab !px-1.5 !py-1 active:cursor-grabbing"
                aria-label={`Reorder ${section.name}, position ${i + 1} of ${ordered.length}`}
                title="Drag to reorder, or use the arrow keys"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') { e.preventDefault(); move(section, -1); }
                  if (e.key === 'ArrowDown') { e.preventDefault(); move(section, 1); }
                }}
              >
                <Icon name="grip" className="h-4 w-4" />
              </button>

              <span className="min-w-0 flex-1">
                <span className="block font-bold text-ink">{section.name}</span>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  <Badge tone="slate">{section.class_count} class{section.class_count === 1 ? '' : 'es'}</Badge>
                  <Badge tone="slate">{section.subject_count} subject{section.subject_count === 1 ? '' : 's'}</Badge>
                  <Badge tone="brand" icon="users">{section.student_count} pupils</Badge>
                </span>
                {/* Who works here: it is what decides which of several subject
                    teachers takes a class in this part of the school. */}
                <button
                  onClick={() => setStaffing({
                    kind: 'section', id: section.key, name: section.name, teachers: section.teachers,
                  })}
                  className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 transition-colors hover:text-brand-800"
                >
                  <Icon name="users" className="h-3.5 w-3.5" />
                  {section.teachers?.length
                    ? section.teachers.map((t: any) => t.name).join(', ')
                    : 'No staff named'}
                </button>
              </span>

              <span className="flex shrink-0 gap-1">
                <button className="btn-subtle !px-2"
                        onClick={() => setCopying({
                          source: section, name: `${section.name} (copy)`,
                          with_classes: true, with_subjects: true, with_timetable: true,
                        })}
                        aria-label={`Duplicate ${section.name}`} title="Duplicate">
                  <Icon name="copy" className="h-4 w-4" />
                </button>
                <button className="btn-subtle !px-2" onClick={() => setEditing({ ...section })}
                        aria-label={`Rename ${section.name}`} title="Rename">
                  <Icon name="pencil" className="h-4 w-4" />
                </button>
                <button className="btn-subtle !px-2" onClick={() => remove(section)}
                        aria-label={`Remove ${section.name}`} title="Remove">
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <section className="card p-4">
        <h2 className="font-display text-base font-bold text-ink">Common arrangements</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Add the ones you are missing from a familiar pattern, then rename anything that does not fit. Nothing is
          removed by choosing one.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {PATTERNS.map((pattern) => (
            <li key={pattern.label}>
              <button className="btn-ghost btn-sm" disabled={busy} onClick={() => applyPattern(pattern.names)}>
                {pattern.label}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <TeacherPicker target={staffing} onClose={() => setStaffing(null)} onSaved={reload} />

      <Modal
        open={!!copying} onClose={() => setCopying(null)} wide
        title={copying ? `Duplicate ${copying.source.name}` : 'Duplicate section'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setCopying(null)}>Cancel</button>
            <button className="btn-primary" form="copy-section-form" disabled={busy || !copying?.name.trim()}>
              {busy ? 'Copying...' : 'Create the copy'}
            </button>
          </>
        }
      >
        {copying && (
          <form id="copy-section-form" onSubmit={duplicate} className="space-y-4">
            <Field label="Name the new section" required hint="Nursery 2 copied as Nursery 3, and so on.">
              <input className="input" required autoFocus value={copying.name}
                     onChange={(e) => setCopying({ ...copying, name: e.target.value })} />
            </Field>

            <div className="space-y-3 rounded-xl border border-line p-3">
              <Toggle
                checked={copying.with_classes}
                onChange={(v) => setCopying({ ...copying, with_classes: v })}
                label={`Bring its ${copying.source.class_count} class${copying.source.class_count === 1 ? '' : 'es'}`}
                hint="The same classrooms, named for the new section"
              />
              <Toggle
                checked={copying.with_classes && copying.with_subjects}
                onChange={(v) => setCopying({ ...copying, with_subjects: v })}
                label="Bring what they are taught"
                hint="The same subjects, taught by the same people"
              />
              <Toggle
                checked={copying.with_classes && copying.with_subjects && copying.with_timetable}
                onChange={(v) => setCopying({ ...copying, with_timetable: v })}
                label="Bring their timetable"
                hint="Same days and periods. A subject whose teacher is already busy then arrives without one"
              />
            </div>

            <p className="text-xs text-ink-faint">
              Pupils are not copied. The new classes start empty, and the subjects taught here are offered there too.
            </p>
          </form>
        )}
      </Modal>

      <Modal
        open={open} onClose={() => setOpen(false)} title="New section"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="section-form" disabled={busy || !name.trim()}>
              {busy ? 'Adding...' : 'Add section'}
            </button>
          </>
        }
      >
        <form id="section-form" onSubmit={add} className="space-y-3">
          <Field label="Name" required hint="What you call this part of the school.">
            <input className="input" required autoFocus value={name} placeholder="e.g. Junior Secondary"
                   onChange={(e) => setName(e.target.value)} />
          </Field>
          <p className="text-xs text-ink-faint">
            It joins the end of the list; move it into place afterwards.
          </p>
        </form>
      </Modal>

      <Modal
        open={!!editing} onClose={() => setEditing(null)}
        title={editing ? `Rename ${editing.name}` : 'Rename section'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn-primary" form="rename-form" disabled={busy || !editing?.name?.trim()}>
              {busy ? 'Saving...' : 'Save'}
            </button>
          </>
        }
      >
        {editing && (
          <form id="rename-form" onSubmit={rename} className="space-y-3">
            <Field label="Name" required>
              <input className="input" required autoFocus value={editing.name}
                     onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <p className="text-xs text-ink-faint">
              Its {editing.class_count} class{editing.class_count === 1 ? '' : 'es'} and{' '}
              {editing.subject_count} subject{editing.subject_count === 1 ? '' : 's'} stay exactly where they are.
            </p>
          </form>
        )}
      </Modal>
    </>
  );
}
