import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useSections } from '../../lib/useSections';
import { useToast } from '../../context/ToastContext';
import { DAY_NAMES } from '../../lib/format';
import Icon from '../../components/Icon';
import Select from '../../components/Select';
import SyncMenu from '../../components/SyncMenu';
import TimetableImport from '../../components/TimetableImport';
import { Badge, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader } from '../../components/ui';

const DAYS = [1, 2, 3, 4, 5];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

/** A sensible hour for each period, until the school sets its own. */
const DEFAULT_TIMES: Record<number, [string, string]> = {
  1: ['08:30', '09:15'], 2: ['09:15', '10:00'], 3: ['10:20', '11:05'], 4: ['11:05', '11:50'],
  5: ['12:40', '13:25'], 6: ['13:25', '14:10'], 7: ['14:20', '15:05'], 8: ['15:05', '15:50'],
};

/**
 * Building the week for one class.
 *
 * Timetabling is its own job, done once a term by one person with the whole
 * week in front of them, so it gets its own page rather than a card beneath a
 * roster. The grid is the document: an empty period is a place to put a
 * lesson, a filled one says who is teaching it.
 */
export default function AdminTimetable() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const { nameOf } = useSections();

  const classes = useFetch<any[]>('/classes');
  const [classId, setClassId] = useState(params.get('class') ?? '');

  const taught = useFetch<any[]>(classId ? `/classes/${classId}/subjects` : null, [classId]);
  const curriculum = useFetch<any[]>('/subjects');
  const slots = useFetch<any[]>(classId ? `/timetable?classId=${classId}` : null, [classId]);

  const [adding, setAdding] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState<any>(null);
  const [over, setOver] = useState('');

  /**
   * Dragging a lesson to another period.
   *
   * The times follow the period it lands in, unless the school has written its
   * own times for this lesson: a 09:00 lesson dropped into period 4 should read
   * as period 4, but a deliberate 11:15 start is not the grid's to overwrite.
   */
  /**
   * The same lesson again, in another period.
   *
   * A subject that meets at the same hour every day is one card typed five
   * times, so it is copied instead: holding Alt while dragging leaves the
   * original where it is, and the copy takes the hour of wherever it lands.
   */
  const copyTo = async (slot: any, day: number, period: number) => {
    const standard = DEFAULT_TIMES[period];
    try {
      await api.post('/timetable', {
        class_subject_id: slot.class_subject_id,
        day_of_week: day,
        period,
        start_time: standard?.[0] ?? slot.start_time,
        end_time: standard?.[1] ?? slot.end_time,
        room: slot.room || null,
      });
      toast(`${slot.subject} also on ${DAY_NAMES[day]}, period ${period}.`);
      slots.reload();
      taught.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  /** The same lesson in the first free period of that day, then the week. */
  const duplicate = async (slot: any) => {
    const taken = new Set((slots.data ?? []).map((s: any) => `${s.day_of_week}-${s.period}`));
    const free = [...PERIODS.map((pd) => [slot.day_of_week ?? slot.day, pd] as [number, number]),
                  ...DAYS.flatMap((d) => PERIODS.map((pd) => [d, pd] as [number, number]))]
      .find(([d, pd]) => !taken.has(`${d}-${pd}`));
    if (!free) {
      toast('The week is full: there is nowhere to put a copy.', 'error');
      return;
    }
    await copyTo(slot, free[0], free[1]);
  };

  /** Two lessons change places: what dropping one onto another means. */
  const swap = async (a: any, b: any) => {
    if (a.id === b.id) return;
    try {
      await api.post('/timetable/swap', { a: a.id, b: b.id });
      toast(`${a.subject} and ${b.subject} swapped.`);
      slots.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const move = async (slot: any, day: number, period: number) => {
    if (slot.day_of_week === day && slot.period === period) return;
    const standard = DEFAULT_TIMES[slot.period];
    const custom = !standard || slot.start_time !== standard[0] || slot.end_time !== standard[1];
    const times = custom || !DEFAULT_TIMES[period]
      ? { start_time: slot.start_time, end_time: slot.end_time }
      : { start_time: DEFAULT_TIMES[period][0], end_time: DEFAULT_TIMES[period][1] };

    try {
      await api.patch(`/timetable/${slot.id}`, { day_of_week: day, period, ...times });
      toast(`${slot.subject} moved to ${DAY_NAMES[day]}, period ${period}.`);
      slots.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  // The first class stands in until one is chosen, so the page is never blank.
  useEffect(() => {
    if (!classId && classes.data?.length) setClassId(String(classes.data[0].id));
  }, [classes.data, classId]);

  useEffect(() => {
    if (classId) setParams({ class: classId }, { replace: true });
  }, [classId, setParams]);

  const klass = (classes.data ?? []).find((c: any) => String(c.id) === classId);

  // Subjects this part of the school teaches that this class has not taken up.
  // Writing one on the week is the school saying the class takes it, so the
  // picker offers them rather than sending anybody to another page first.
  const offered = (curriculum.data ?? []).filter((sub: any) =>
    (sub.sections ?? [sub.section]).includes(klass?.section)
    && !(taught.data ?? []).some((row: any) => row.subject_id === sub.id));

  const grid = useMemo(() => {
    const map: Record<string, any> = {};
    for (const slot of slots.data ?? []) map[`${slot.day_of_week}-${slot.period}`] = slot;
    return map;
  }, [slots.data]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      // A break takes a period like anything else; the server pairs it with
      // this class rather than the picker holding a subject that is not taught.
      const chosen = String(adding.class_subject_id);
      const body: any = {
        day_of_week: Number(adding.day),
        period: Number(adding.period),
        start_time: adding.start_time,
        end_time: adding.end_time,
        room: adding.room || null,
        ...(chosen.startsWith('break:')
          ? { break_kind: chosen.slice(6), class_id: Number(classId) }
          : chosen.startsWith('subject:')
            ? { subject_id: Number(chosen.slice(8)), class_id: Number(classId) }
            : { class_subject_id: Number(chosen) }),
      };
      // Editing moves the lesson that is already there rather than replacing
      // it, so whatever has been recorded against it stays attached.
      if (adding.id) await api.patch(`/timetable/${adding.id}`, body);
      else await api.post('/timetable', body);
      toast(adding.id ? 'Timetable updated.'
            : chosen.startsWith('break:') ? 'Break added.'
            : chosen.startsWith('subject:') ? 'Lesson added, and the class now takes that subject.'
            : 'Lesson added.');
      setAdding(null);
      slots.reload();
      taught.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const drop = async (slot: any) => {
    try {
      await api.delete(`/timetable/${slot.id}`);
      toast(`${slot.subject} removed from ${DAY_NAMES[slot.day_of_week]} period ${slot.period}.`);
      slots.reload();
      taught.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  if (classes.loading) return <Loading rows={3} />;
  if (classes.error) return <ErrorNote error={classes.error} onRetry={classes.reload} />;

  const lessonCount = (slots.data ?? []).length;

  return (
    <>
      <PageHeader
        icon="calendar" title="Timetable"
        subtitle="The week for one class. Drag a lesson to move it, hold Alt to copy it, drop it on another lesson to swap the two, or click it to change the details."
        actions={
          <>
            <SyncMenu onDone={() => { taught.reload(); slots.reload(); }} />
            <button className="btn-ghost" onClick={() => setImporting(true)}>
              <Icon name="upload" className="h-4 w-4" /> Import a timetable
            </button>
            <Link to="/admin/classes" className="btn-ghost">Classes</Link>
          </>
        }
      />

      {(classes.data ?? []).length === 0 ? (
        <EmptyState
          icon="book" title="No classes yet"
          body="A timetable belongs to a class. Create one first and its week appears here."
          action={<Link to="/admin/classes" className="btn-primary">Go to classes</Link>}
        />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-80">
              <Field label="Class">
                <Select
                  value={classId}
                  onChange={setClassId}
                  options={(classes.data ?? []).map((c: any) => ({
                    value: String(c.id),
                    label: c.room ? `${c.name} · ${c.room}` : c.name,
                    group: nameOf(c.section),
                  }))}
                />
              </Field>
            </div>
            {klass && (
              <p className="pb-2 text-sm text-ink-soft">
                {lessonCount} lesson{lessonCount === 1 ? '' : 's'} a week ·{' '}
                {(taught.data ?? []).length} subject{(taught.data ?? []).length === 1 ? '' : 's'}
              </p>
            )}
          </div>

          {(taught.data ?? []).length === 0 ? (
            <EmptyState
              icon="book" title="Nothing to timetable yet"
              body="A lesson is a subject taught to this class. Give the class its subjects first, then lay out the week."
              action={<Link to="/admin/classes" className="btn-primary">Add its subjects</Link>}
            />
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full min-w-[44rem] border-collapse">
                <thead>
                  <tr>
                    <th className="w-16 border-b border-line px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                      Period
                    </th>
                    {DAYS.map((day) => (
                      <th key={day}
                          className="border-b border-l border-line px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                        {DAY_NAMES[day]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERIODS.map((period) => (
                    <tr key={period}>
                      <th className="border-b border-line px-2 py-1.5 text-left align-top">
                        <span className="block text-sm font-bold tabular-nums text-ink">{period}</span>
                        <span className="block font-mono text-[10px] text-ink-faint">
                          {DEFAULT_TIMES[period]?.[0]}
                        </span>
                      </th>

                      {DAYS.map((day) => {
                        const slot = grid[`${day}-${period}`];
                        if (slot) {
                          return (
                            <td
                              key={day}
                              onDragOver={(e) => {
                                if (dragging && dragging.id !== slot.id) {
                                  e.preventDefault();
                                  setOver(`${day}-${period}`);
                                }
                              }}
                              onDragLeave={() => setOver((k) => (k === `${day}-${period}` ? '' : k))}
                              onDrop={(e) => {
                                e.preventDefault();
                                setOver('');
                                if (dragging) swap(dragging, slot);
                                setDragging(null);
                              }}
                              className={`border-b border-l border-line p-1 align-top transition-colors ${
                                over === `${day}-${period}` ? 'bg-brand-50' : ''}`}
                            >
                              <div
                                draggable
                                onDragStart={(e) => {
                                  setDragging(slot);
                                  e.dataTransfer.effectAllowed = 'copyMove';
                                }}
                                onDragEnd={() => { setDragging(null); setOver(''); }}
                                className={`group relative cursor-grab rounded-lg p-2 active:cursor-grabbing ${
                                  dragging?.id === slot.id ? 'opacity-40' : ''}`}
                                style={{ background: `${slot.colour ?? '#64748b'}1a` }}
                                title="Drag to another period, or click to edit"
                              >
                                <button
                                  className="w-full text-left"
                                  onClick={() => setAdding({
                                    id: slot.id, day: slot.day_of_week, period: slot.period,
                                    // carried so removing from the form can name what went
                                    subject: slot.subject, day_of_week: slot.day_of_week,
                                    // a break is picked as a break, not as the pairing behind it
                                    class_subject_id: slot.is_break
                                      ? (slot.subject === 'Long break' ? 'break:long' : 'break:short')
                                      : String(slot.class_subject_id),
                                    start_time: slot.start_time, end_time: slot.end_time,
                                    room: slot.room ?? '',
                                  })}
                                  title={`Edit ${slot.subject} on ${DAY_NAMES[day]}, period ${period}`}
                                >
                                <span className="flex items-start gap-1.5">
                                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full"
                                        style={{ background: slot.colour ?? '#64748b' }} />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs font-bold text-ink">{slot.subject}</span>
                                    <span className="block truncate text-[11px] text-ink-soft">
                                      {slot.is_break ? 'Break' : slot.teacher_name ?? 'No teacher'}
                                    </span>
                                    <span className="block font-mono text-[10px] text-ink-faint">
                                      {slot.start_time}-{slot.end_time}{slot.room ? ` · ${slot.room}` : ''}
                                    </span>
                                  </span>
                                </span>
                                </button>
                                <button
                                  onClick={() => drop(slot)}
                                  aria-label={`Remove ${slot.subject} from ${DAY_NAMES[day]} period ${period}`}
                                  className="absolute right-1 top-1 rounded-md bg-[color:var(--surface-raised)] p-1 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                                >
                                  <Icon name="x" className="h-3 w-3 text-ink-soft" />
                                </button>
                              </div>
                            </td>
                          );
                        }

                        return (
                          <td
                            key={day}
                            onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(`${day}-${period}`); } }}
                            onDragLeave={() => setOver((k) => (k === `${day}-${period}` ? '' : k))}
                            onDrop={(e) => {
                              e.preventDefault();
                              setOver('');
                              // Alt copies, as it does everywhere else a thing
                              // is dragged; without it the lesson moves.
                              if (dragging) (e.altKey ? copyTo : move)(dragging, day, period);
                              setDragging(null);
                            }}
                            className={`border-b border-l border-line p-1 align-top transition-colors ${
                              over === `${day}-${period}` ? 'bg-brand-50' : ''}`}
                          >
                            <button
                              onClick={() => setAdding({
                                day, period,
                                class_subject_id: String(taught.data?.[0]?.id ?? ''),
                                start_time: DEFAULT_TIMES[period]?.[0] ?? '09:00',
                                end_time: DEFAULT_TIMES[period]?.[1] ?? '09:45',
                                room: klass?.room ?? '',
                              })}
                              aria-label={`Add a lesson on ${DAY_NAMES[day]}, period ${period}`}
                              className="flex h-full min-h-[3.75rem] w-full items-center justify-center rounded-lg text-ink-faint opacity-0 transition hover:bg-[color:var(--surface-sunken)] hover:text-brand-600 focus:opacity-100 group-hover:opacity-100 sm:opacity-100"
                            >
                              <Icon name="plus" className="h-4 w-4" />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(taught.data ?? []).length > 0 && (
            <section className="mt-5 card p-4">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
                Lessons a week
              </h2>
              <ul className="flex flex-wrap gap-2">
                {(taught.data ?? []).map((row: any) => (
                  <li key={row.id}>
                    <Badge tone={row.lessons_per_week ? 'brand' : 'amber'}>
                      {row.name}: {row.lessons_per_week}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-faint">
                A subject with none is taught to this class but never meets.
              </p>
            </section>
          )}
        </>
      )}

      <TimetableImport open={importing} onClose={() => setImporting(false)}
                       onDone={() => { slots.reload(); taught.reload(); }} />

      <Modal
        open={!!adding} onClose={() => setAdding(null)}
        title={adding?.id ? 'Edit this lesson' : adding ? `${DAY_NAMES[adding.day]}, period ${adding.period}` : 'Add a lesson'}
        footer={
          <>
            {adding?.id && (
              <span className="mr-auto flex gap-1">
                <button className="btn-subtle" disabled={busy}
                        onClick={() => { duplicate(adding); setAdding(null); }}
                        title="The same lesson again, in the next free period">
                  <Icon name="copy" className="h-4 w-4" /> Duplicate
                </button>
                <button className="btn-subtle" disabled={busy}
                        onClick={() => { drop(adding); setAdding(null); }}>
                  <Icon name="trash" className="h-4 w-4" /> Remove
                </button>
              </span>
            )}
            <button className="btn-ghost" onClick={() => setAdding(null)}>Cancel</button>
            <button className="btn-primary" form="lesson-form" disabled={busy || !adding?.class_subject_id}>
              {busy ? 'Saving...' : adding?.id ? 'Save lesson' : 'Add lesson'}
            </button>
          </>
        }
      >
        {adding && (
          <form id="lesson-form" onSubmit={save} className="space-y-4">
            <Field label="Subject" required hint="Taught by whoever holds it for this class, or a break in the day.">
              <Select
                value={adding.class_subject_id}
                onChange={(v) => setAdding({ ...adding, class_subject_id: v })}
                options={[
                  ...(taught.data ?? []).map((row: any) => ({
                    value: String(row.id),
                    label: row.name,
                    hint: row.teacher_name ?? 'No teacher yet',
                  })),
                  ...offered.map((sub: any) => ({
                    value: `subject:${sub.id}`,
                    label: sub.name,
                    hint: 'Adds it to this class',
                  })),
                  { value: 'break:short', label: 'Short break', hint: 'Not taught, not marked' },
                  { value: 'break:long', label: 'Long break', hint: 'Lunch, or the long one' },
                ]}
              />
            </Field>

            {adding.id && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Day" required hint="Moving it here keeps the lesson itself.">
                  <Select
                    value={String(adding.day)} onChange={(v) => setAdding({ ...adding, day: Number(v) })}
                    options={[1, 2, 3, 4, 5].map((d) => ({ value: String(d), label: DAY_NAMES[d] }))}
                  />
                </Field>
                <Field label="Period" required>
                  <Select
                    value={String(adding.period)} onChange={(v) => setAdding({ ...adding, period: Number(v) })}
                    options={PERIODS.map((n) => ({ value: String(n), label: `Period ${n}` }))}
                  />
                </Field>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Starts" required>
                <input className="input" type="time" required value={adding.start_time}
                       onChange={(e) => setAdding({ ...adding, start_time: e.target.value })} />
              </Field>
              <Field label="Ends" required>
                <input className="input" type="time" required value={adding.end_time}
                       onChange={(e) => setAdding({ ...adding, end_time: e.target.value })} />
              </Field>
            </div>

            <Field label="Classroom" hint="Where this lesson meets, if not the class's own room.">
              <input className="input" value={adding.room}
                     onChange={(e) => setAdding({ ...adding, room: e.target.value })} />
            </Field>

            <p className="text-xs text-ink-faint">
              A teacher already teaching elsewhere at this time is refused, so nobody is booked twice.
              The same holds when a lesson is moved into a period that is already taken.
            </p>
          </form>
        )}
      </Modal>
    </>
  );
}
