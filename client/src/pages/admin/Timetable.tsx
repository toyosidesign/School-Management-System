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
  // Break is the school's hour, not this week's: shown on the card so nobody
  // wonders what time they are dropping.
  const schoolDay = useFetch<any>('/school/day');
  const slots = useFetch<any[]>(classId ? `/timetable?classId=${classId}` : null, [classId]);

  const [adding, setAdding] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState<any>(null);
  const [dropping, setDropping] = useState<any>(null);
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
  const copyTo = async (slot: any, weekday: number, period: number) => {
    try {
      // No times: the period it lands in decides them, school-wide.
      await api.post('/timetable', {
        class_subject_id: slot.class_subject_id,
        day_of_week: weekday,
        period,
        room: slot.room || null,
      });
      toast(`${slot.subject} also on ${DAY_NAMES[weekday]}, period ${period}.`);
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

  /**
   * A subject dropped onto an empty period.
   *
   * The week is laid out by picking a subject up and putting it where it meets,
   * which is how it is done on paper: the alternative is opening a dialog for
   * every one of thirty lessons and choosing the same subject from a list.
   */
  const place = async (item: any, weekday: number, period: number) => {
    try {
      const out = await api.post('/timetable', {
        day_of_week: weekday,
        period,
        room: klass?.room ?? null,
        ...(item.break_kind
          ? { break_kind: item.break_kind, class_id: Number(classId) }
          : item.class_subject_id
            ? { class_subject_id: item.class_subject_id }
            : { subject_id: item.subject_id, class_id: Number(classId) }),
      });
      // A break lands on the whole week at once, so say what actually happened.
      toast(out?.also_placed
        ? `${item.name} placed on ${out.also_placed + 1} days in period ${period}.`
        : `${item.name} on ${DAY_NAMES[weekday]}, period ${period}.`);
      slots.reload();
      taught.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    }
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
    const ladder: any[] = schoolDay.data?.periods ?? [];
    const was = ladder.find((p) => p.period === slot.period);
    const lands = ladder.find((p) => p.period === period);
    // A lesson keeps an hour somebody set by hand; otherwise it takes the hour
    // of the period it lands in.
    const custom = !was || slot.start_time !== was.start || slot.end_time !== was.end;
    const times = custom || !lands
      ? { start_time: slot.start_time, end_time: slot.end_time }
      : { start_time: lands.start, end_time: lands.end };

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

  /**
   * The hour each row runs at, taken from the week itself.
   *
   * A period is whatever the lessons in it say it is: a row holding the long
   * break reads 12:00–12:45 because that is when the school stops, not because
   * a ladder written in this file happens to agree. Only an empty row falls
   * back to the standard hour, and only to suggest one.
   */
  /**
   * The hour each row runs at, which is the school's, not this page's.
   *
   * A period is an hour of the school day — the same one in every class's week
   * — so it is read from the school day rather than from a ladder written here.
   * A break in the row still speaks for itself: it is the one thing that does
   * not run for the length of a period.
   */
  const rowTimes = useMemo(() => {
    const found: Record<number, string> = {};
    for (const p of schoolDay.data?.periods ?? []) found[p.period] = `${p.start}–${p.end}`;
    for (const slot of slots.data ?? []) {
      if (slot.is_break) found[slot.period] = `${slot.start_time}–${slot.end_time}`;
    }
    return found;
  }, [slots.data, schoolDay.data]);

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
      const saved = adding.id
        ? await api.patch(`/timetable/${adding.id}`, body)
        : await api.post('/timetable', body);
      toast(adding.id ? 'Timetable updated.'
            : chosen.startsWith('break:')
              ? saved?.also_placed
                ? `Break placed on ${saved.also_placed + 1} days.`
                : 'Break added.'
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
        subtitle="The week for one class. Drag a subject from below into a free period, drag a lesson to move it, hold Alt to copy it, drop it on another lesson to swap the two, or click one to change its details."
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
          <>
          <section className="mb-4 card p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">
              Subjects to place
            </h2>
            <p className="mt-1 text-xs text-ink-faint">
              Drag one into the week. The number is how many times it already meets; a subject showing
              none is taught to this class but never meets.
            </p>

            <ul className="mt-3 flex flex-wrap gap-2">
              {(taught.data ?? []).map((row: any) => (
                <li key={row.id}>
                  <span
                    draggable
                    onDragStart={() => setDropping({
                      class_subject_id: row.id, name: row.name, colour: row.colour, icon: row.icon,
                    })}
                    onDragEnd={() => { setDropping(null); setOver(''); }}
                    className={`flex cursor-grab items-center gap-2 rounded-xl border border-line px-3 py-2 transition active:cursor-grabbing hover:border-brand-300 ${
                      dropping?.class_subject_id === row.id ? 'opacity-40' : ''}`}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.colour }} />
                    <span className="text-sm font-semibold text-ink">{row.name}</span>
                    <span className={`text-xs ${row.lessons_per_week ? 'text-ink-faint' : 'text-amber-700'}`}>
                      {row.lessons_per_week}/week
                    </span>
                  </span>
                </li>
              ))}

              {/* Subjects the year takes that this class has not, and the two
                  breaks: everything that can go on a week, in one tray. */}
              {offered.map((sub: any) => (
                <li key={`offer-${sub.id}`}>
                  <span
                    draggable
                    onDragStart={() => setDropping({ subject_id: sub.id, name: sub.name })}
                    onDragEnd={() => { setDropping(null); setOver(''); }}
                    className="flex cursor-grab items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2 text-ink-soft transition active:cursor-grabbing hover:border-brand-300 hover:text-ink"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: sub.colour }} />
                    <span className="text-sm font-semibold">{sub.name}</span>
                    <span className="text-xs text-ink-faint">adds it to the class</span>
                  </span>
                </li>
              ))}

              {[
                { break_kind: 'short', name: 'Short break',
                  when: schoolDay.data && `${schoolDay.data.short_break_start}–${schoolDay.data.short_break_end}` },
                { break_kind: 'long', name: 'Long break',
                  when: schoolDay.data && `${schoolDay.data.long_break_start}–${schoolDay.data.long_break_end}` },
              ].map((item) => (
                <li key={item.break_kind}>
                  <span
                    draggable
                    onDragStart={() => setDropping(item)}
                    onDragEnd={() => { setDropping(null); setOver(''); }}
                    className="flex cursor-grab items-center gap-2 rounded-xl border border-line bg-[color:var(--surface-sunken)] px-3 py-2 transition active:cursor-grabbing hover:border-brand-300"
                  >
                    <Icon name="clock" className="h-3.5 w-3.5 text-ink-faint" />
                    <span className="text-sm font-semibold text-ink-soft">{item.name}</span>
                    {item.when && <span className="font-mono text-[11px] text-ink-faint">{item.when}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
            <div className="card overflow-x-auto p-0">
              <table className="w-full min-w-[44rem] border-collapse">
                <thead>
                  <tr>
                    <th className="w-24 border-b border-line px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-ink-faint">
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
                        <span className="block whitespace-nowrap font-mono text-[10px] text-ink-faint">
                          {rowTimes[period] ?? '—'}
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
                            onDragOver={(e) => { if (dragging || dropping) { e.preventDefault(); setOver(`${day}-${period}`); } }}
                            onDragLeave={() => setOver((k) => (k === `${day}-${period}` ? '' : k))}
                            onDrop={(e) => {
                              e.preventDefault();
                              setOver('');
                              // Alt copies, as it does everywhere else a thing
                              // is dragged; without it the lesson moves.
                              if (dragging) (e.altKey ? copyTo : move)(dragging, day, period);
                              else if (dropping) place(dropping, day, period);
                              setDragging(null);
                              setDropping(null);
                            }}
                            className={`h-full border-b border-l border-line align-top transition-colors ${
                              over === `${day}-${period}` ? 'bg-brand-50' : ''}`}
                          >
                            <button
                              onClick={() => setAdding({
                                day, period,
                                class_subject_id: String(taught.data?.[0]?.id ?? ''),
                                start_time: (schoolDay.data?.periods ?? []).find((p: any) => p.period === period)?.start ?? '09:00',
                                end_time: (schoolDay.data?.periods ?? []).find((p: any) => p.period === period)?.end ?? '09:45',
                                room: klass?.room ?? '',
                              })}
                              aria-label={`Add a lesson on ${DAY_NAMES[day]}, period ${period}`}
                              className="flex h-full min-h-[4.75rem] w-full items-center justify-center text-ink-faint opacity-0 transition-colors hover:bg-[color:var(--surface-sunken)] hover:text-brand-600 focus:opacity-100 group-hover:opacity-100 sm:opacity-100"
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
          </>
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

            {String(adding.class_subject_id).startsWith('break:') && schoolDay.data && (
              <p className="rounded-xl border border-line bg-[color:var(--surface-sunken)] px-3 py-2.5 text-sm text-ink-soft">
                Break runs {String(adding.class_subject_id) === 'break:long'
                  ? `${schoolDay.data.long_break_start} to ${schoolDay.data.long_break_end}`
                  : `${schoolDay.data.short_break_start} to ${schoolDay.data.short_break_end}`} for the whole school.
                It is set once in Settings, not here.
              </p>
            )}

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
