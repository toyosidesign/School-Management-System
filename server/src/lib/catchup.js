import { db, notify } from '../db/index.js';

/**
 * PRD Story 1: marking a student absent automatically creates a Catch-Up Hub
 * entry and links whatever lesson material exists for that class/date/period.
 * Idempotent: re-marking the same period updates rather than duplicating.
 */
export function syncCatchupForAttendance(attendanceRow) {
  const { id, student_id, class_subject_id, date, period, status } = attendanceRow;

  if (status === 'present' || status === 'late') {
    db.prepare(
      `DELETE FROM catchup_entries
       WHERE attendance_id = ? AND status = 'new'`
    ).run(id);
    return null;
  }

  const material = db
    .prepare(
      `SELECT * FROM lesson_materials
       WHERE class_subject_id = ? AND lesson_date = ? AND period = ?`
    )
    .get(class_subject_id, date, period);

  db.prepare(
    `INSERT INTO catchup_entries
       (student_id, class_subject_id, lesson_material_id, attendance_id, lesson_date, period, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (student_id, class_subject_id, lesson_date, period)
     DO UPDATE SET lesson_material_id = excluded.lesson_material_id,
                   attendance_id      = excluded.attendance_id,
                   reason             = excluded.reason`
  ).run(
    student_id,
    class_subject_id,
    material?.id ?? null,
    id,
    date,
    period,
    status === 'excused' ? 'excused leave' : 'absent'
  );

  const student = db
    .prepare('SELECT s.user_id, sub.name AS subject FROM students s JOIN class_subjects cs ON cs.id = ? JOIN subjects sub ON sub.id = cs.subject_id WHERE s.id = ?')
    .get(class_subject_id, student_id);

  if (student) {
    notify(student.user_id, {
      title: 'New Catch-Up Hub entry',
      body: `You missed ${student.subject} on ${date}. Materials are ready.`,
      kind: 'catchup',
      link: '/student/catch-up',
    });
  }
  return db
    .prepare('SELECT * FROM catchup_entries WHERE student_id = ? AND class_subject_id = ? AND lesson_date = ? AND period = ?')
    .get(student_id, class_subject_id, date, period);
}

/**
 * When a teacher publishes lesson material after the fact, back-fill it into
 * catch-up entries that were created before the recap existed.
 */
export function backfillCatchupMaterial(material) {
  const res = db
    .prepare(
      `UPDATE catchup_entries SET lesson_material_id = ?
       WHERE class_subject_id = ? AND lesson_date = ? AND period = ? AND lesson_material_id IS NULL`
    )
    .run(material.id, material.class_subject_id, material.lesson_date, material.period);
  return res.changes;
}

/** Approved leave tags every school day in range as "Excused Leave" (PRD §4.1). */
export function applyExcusedLeave(leave, reviewerId) {
  const rows = db
    .prepare(
      `SELECT cs.id AS class_subject_id, ts.period
       FROM students st
       JOIN class_subjects cs ON cs.class_id = st.class_id
       JOIN timetable_slots ts ON ts.class_subject_id = cs.id
       WHERE st.id = ?`
    )
    .all(leave.student_id);

  const insert = db.prepare(
    `INSERT INTO attendance (student_id, class_subject_id, date, period, status, note, marked_by)
     VALUES (?, ?, ?, ?, 'excused', ?, ?)
     ON CONFLICT (student_id, class_subject_id, date, period)
     DO UPDATE SET status = 'excused', note = excluded.note`
  );

  let created = 0;
  for (const day of eachDate(leave.start_date, leave.end_date)) {
    const dow = new Date(`${day}T00:00:00`).getDay() || 7; // 1..7, Sun = 7
    if (dow > 5) continue; // school week only
    for (const slot of rows) {
      const timetableDow = db
        .prepare('SELECT day_of_week FROM timetable_slots WHERE class_subject_id = ? AND period = ?')
        .get(slot.class_subject_id, slot.period);
      if (!timetableDow || timetableDow.day_of_week !== dow) continue;
      insert.run(leave.student_id, slot.class_subject_id, day, slot.period, `Excused Leave #${leave.id}`, reviewerId);
      const row = db
        .prepare('SELECT * FROM attendance WHERE student_id = ? AND class_subject_id = ? AND date = ? AND period = ?')
        .get(leave.student_id, slot.class_subject_id, day, slot.period);
      syncCatchupForAttendance(row);
      created++;
    }
  }
  return created;
}

export function eachDate(start, end) {
  const out = [];
  const d = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
