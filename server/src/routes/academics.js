import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, audit, notify } from '../db/index.js';
import { authenticate, requireRole, canAccessStudent, teachesClassSubject } from '../lib/auth.js';
import { syncCatchupForAttendance, backfillCatchupMaterial } from '../lib/catchup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lessonDir = path.join(__dirname, '../../uploads/lessons');
fs.mkdirSync(lessonDir, { recursive: true });

const LESSON_FILE_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.mp3', '.m4a', '.wav', '.ogg'];

const lessonUpload = multer({
  storage: multer.diskStorage({
    destination: lessonDir,
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${file.originalname.replace(/[^\w.\-]/g, '_')}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // No SVG and no HTML: these are served from the app's own origin.
    const ok = LESSON_FILE_EXTS.includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error(`Attachment must be one of: ${LESSON_FILE_EXTS.join(', ')}`), ok);
  },
});

const r = Router();
r.use(authenticate);

/* ── Attendance ───────────────────────────────────────────────────────────── */
r.get('/attendance', (req, res) => {
  const { classSubjectId, date, studentId } = req.query;
  if (studentId) {
    if (!canAccessStudent(req, studentId)) return res.status(403).json({ error: 'Not permitted' });
    return res.json(db.prepare(
      `SELECT a.*, sub.name AS subject FROM attendance a
       JOIN class_subjects cs ON cs.id = a.class_subject_id JOIN subjects sub ON sub.id = cs.subject_id
       WHERE a.student_id = ? ORDER BY a.date DESC, a.period DESC LIMIT 200`
    ).all(studentId));
  }
  if (!classSubjectId || !date) return res.status(400).json({ error: 'classSubjectId and date are required' });
  if (req.user.role === 'teacher' && !teachesClassSubject(req.user.id, classSubjectId)) {
    return res.status(403).json({ error: 'You do not teach this class' });
  }
  res.json(db.prepare(
    `SELECT s.id AS student_id, s.student_code, u.first_name, u.last_name, u.avatar_colour, u.avatar_url, u.avatar_emoji,
            a.id AS attendance_id, a.status, a.period, a.note,
            iep.needs, iep.time_multiplier
     FROM class_subjects cs
     JOIN students s ON s.class_id = cs.class_id AND s.status = 'active'
     JOIN users u ON u.id = s.user_id
     LEFT JOIN iep_profiles iep ON iep.student_id = s.id
     LEFT JOIN attendance a ON a.student_id = s.id AND a.class_subject_id = cs.id AND a.date = ?
     WHERE cs.id = ? ORDER BY u.first_name`
  ).all(date, classSubjectId).map((x) => ({ ...x, needs: JSON.parse(x.needs || '[]') })));
});

/** PRD Story 1: marking attendance is what triggers Catch-Up Hub creation. */
r.post('/attendance', requireRole('teacher', 'admin'), (req, res) => {
  const { class_subject_id, date, period = 1, records } = req.body ?? {};
  if (!class_subject_id || !date || !Array.isArray(records)) {
    return res.status(400).json({ error: 'class_subject_id, date and records[] are required' });
  }
  if (req.user.role === 'teacher' && !teachesClassSubject(req.user.id, class_subject_id)) {
    return res.status(403).json({ error: 'You do not teach this class' });
  }

  const upsert = db.prepare(
    `INSERT INTO attendance (student_id, class_subject_id, date, period, status, note, marked_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (student_id, class_subject_id, date, period)
     DO UPDATE SET status = excluded.status, note = excluded.note, marked_by = excluded.marked_by`
  );
  const read = db.prepare(
    'SELECT * FROM attendance WHERE student_id = ? AND class_subject_id = ? AND date = ? AND period = ?'
  );

  const catchups = [];
  db.transaction(() => {
    for (const rec of records) {
      const before = read.get(rec.student_id, class_subject_id, date, period);
      upsert.run(rec.student_id, class_subject_id, date, period, rec.status, rec.note ?? null, req.user.id);
      const after = read.get(rec.student_id, class_subject_id, date, period);
      const entry = syncCatchupForAttendance(after);
      if (entry) catchups.push(entry);
      if (!before || before.status !== after.status) {
        audit({ user: req.user, action: 'attendance_mark', entity: 'attendance', entityId: after.id,
                prev: before ? { status: before.status } : null, next: { status: after.status }, ip: req.ip });
      }
    }
  })();

  res.status(201).json({ saved: records.length, catchup_entries_created: catchups.length });
});

/* ── Lesson materials (what the Catch-Up Hub serves) ──────────────────────── */
r.get('/materials', (req, res) => {
  const { classSubjectId, state } = req.query;
  const published = state === 'published' ? 1 : state === 'draft' ? 0 : null;
  const rows = classSubjectId
    ? db.prepare(
        `SELECT m.*, u.first_name || ' ' || u.last_name AS author
         FROM lesson_materials m LEFT JOIN users u ON u.id = m.created_by
         WHERE m.class_subject_id = ?
           ${published === null ? '' : 'AND m.is_published = ' + published}
         ORDER BY m.lesson_date DESC`
      ).all(classSubjectId)
    : db.prepare(
        `SELECT m.*, sub.name AS subject, c.name AS class_name
         FROM lesson_materials m JOIN class_subjects cs ON cs.id = m.class_subject_id
         JOIN subjects sub ON sub.id = cs.subject_id JOIN classes c ON c.id = cs.class_id
         WHERE cs.teacher_id = ?
           ${published === null ? '' : 'AND m.is_published = ' + published}
         ORDER BY m.lesson_date DESC LIMIT 50`
      ).all(req.user.id);
  res.json(rows.map(hydrateMaterial));
});

r.post('/materials', requireRole('teacher', 'admin'), (req, res) => {
  const b = req.body ?? {};
  if (!b.class_subject_id || !b.lesson_date || !b.topic) {
    return res.status(400).json({ error: 'class_subject_id, lesson_date and topic are required' });
  }
  if (req.user.role === 'teacher' && !teachesClassSubject(req.user.id, b.class_subject_id)) {
    return res.status(403).json({ error: 'You do not teach this class' });
  }
  db.prepare(
    `INSERT INTO lesson_materials
       (class_subject_id, lesson_date, period, topic, summary, teacher_notes, video_url, video_duration, transcript, attachments, check_questions, is_published, published_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (class_subject_id, lesson_date, period) DO UPDATE SET
       topic = excluded.topic, summary = excluded.summary, teacher_notes = excluded.teacher_notes,
       video_url = excluded.video_url, video_duration = excluded.video_duration,
       transcript = excluded.transcript, attachments = excluded.attachments,
       check_questions = excluded.check_questions, is_published = excluded.is_published,
       published_at = excluded.published_at`
  ).run(b.class_subject_id, b.lesson_date, b.period ?? 1, b.topic, b.summary ?? null, b.teacher_notes ?? null,
        b.video_url ?? null, b.video_duration ?? null,
        JSON.stringify(b.transcript ?? []), JSON.stringify(b.attachments ?? []),
        JSON.stringify(b.check_questions ?? []),
        b.is_published === false ? 0 : 1,
        b.is_published === false ? null : new Date().toISOString(),
        req.user.id);

  const material = db.prepare(
    'SELECT * FROM lesson_materials WHERE class_subject_id = ? AND lesson_date = ? AND period = ?'
  ).get(b.class_subject_id, b.lesson_date, b.period ?? 1);
  const backfilled = backfillCatchupMaterial(material);
  audit({ user: req.user, action: 'publish_material', entity: 'lesson_materials', entityId: material.id, next: { topic: b.topic }, ip: req.ip });
  res.status(201).json({ ...hydrateMaterial(material), backfilled_catchup_entries: backfilled });
});

/** Publishes or withdraws a recap. Withdrawn, pupils see the lesson as pending. */
r.patch('/materials/:id/publish', requireRole('teacher', 'admin'), (req, res) => {
  const material = db.prepare('SELECT * FROM lesson_materials WHERE id = ?').get(req.params.id);
  if (!material) return res.status(404).json({ error: 'Lesson recap not found' });
  if (req.user.role === 'teacher' && !teachesClassSubject(req.user.id, material.class_subject_id)) {
    return res.status(403).json({ error: 'You do not teach this class' });
  }

  const publish = req.body?.is_published !== false;
  db.prepare('UPDATE lesson_materials SET is_published = ?, published_at = ? WHERE id = ?')
    .run(publish ? 1 : 0, publish ? new Date().toISOString() : null, material.id);

  // Only tell pupils when it actually becomes available to them.
  if (publish && !material.is_published) {
    const waiting = db.prepare(
      `SELECT s.user_id FROM catchup_entries ce JOIN students s ON s.id = ce.student_id
       WHERE ce.lesson_material_id = ?`
    ).all(material.id);
    for (const w of waiting) {
      notify(w.user_id, {
        title: 'A lesson recap is ready',
        body: material.topic, kind: 'catchup', link: '/student/catch-up',
      });
    }
  }

  audit({ user: req.user, action: publish ? 'material_publish' : 'material_withdraw',
          entity: 'lesson_materials', entityId: material.id,
          prev: { is_published: material.is_published }, next: { is_published: publish ? 1 : 0 }, ip: req.ip });

  res.json(hydrateMaterial(db.prepare('SELECT * FROM lesson_materials WHERE id = ?').get(material.id)));
});

/** Attaches a file to a lesson recap, for anything that cannot travel as text. */
r.post('/materials/:id/attachments', requireRole('teacher', 'admin'), lessonUpload.single('file'), (req, res) => {
  const material = db.prepare('SELECT * FROM lesson_materials WHERE id = ?').get(req.params.id);
  if (!material) return res.status(404).json({ error: 'Lesson recap not found' });
  if (req.user.role === 'teacher' && !teachesClassSubject(req.user.id, material.class_subject_id)) {
    return res.status(403).json({ error: 'You do not teach this class' });
  }
  if (!req.file) return res.status(400).json({ error: 'No file was uploaded' });

  const ext = path.extname(req.file.originalname).toLowerCase();
  const type = ['.mp3', '.m4a', '.wav', '.ogg'].includes(ext) ? 'audio'
    : ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? 'image' : 'file';

  const attachments = safeJson(material.attachments, []);
  attachments.push({
    name: req.body?.name?.trim() || req.file.originalname,
    type,
    url: `/uploads/lessons/${req.file.filename}`,
  });

  db.prepare('UPDATE lesson_materials SET attachments = ? WHERE id = ?')
    .run(JSON.stringify(attachments), material.id);

  audit({ user: req.user, action: 'lesson_attachment', entity: 'lesson_materials', entityId: material.id,
          next: { name: req.file.originalname }, ip: req.ip });

  res.status(201).json(hydrateMaterial(db.prepare('SELECT * FROM lesson_materials WHERE id = ?').get(material.id)));
});

/* ── Catch-Up Hub ─────────────────────────────────────────────────────────── */
r.get('/catchup', (req, res) => {
  const studentId = resolveStudentId(req);
  if (studentId == null) return res.status(400).json({ error: 'studentId is required' });
  if (!canAccessStudent(req, studentId)) return res.status(403).json({ error: 'Not permitted' });

  const { subjectId, from, to, q, status } = req.query;
  const where = ['ce.student_id = ?'];
  const args = [studentId];
  if (subjectId) { where.push('sub.id = ?'); args.push(subjectId); }
  if (from) { where.push('ce.lesson_date >= ?'); args.push(from); }
  if (to) { where.push('ce.lesson_date <= ?'); args.push(to); }
  if (status) { where.push('ce.status = ?'); args.push(status); }
  if (q) { where.push('(m.topic LIKE ? OR m.summary LIKE ? OR m.transcript LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }

  const rows = db.prepare(
    `SELECT ce.*, sub.name AS subject, sub.colour, sub.code,
            c.name AS class_name,
            m.topic, m.summary, m.teacher_notes, m.video_url, m.video_duration,
            m.transcript, m.attachments, m.captions_lang, m.check_questions,
            tu.first_name || ' ' || tu.last_name AS teacher_name
     FROM catchup_entries ce
     JOIN class_subjects cs ON cs.id = ce.class_subject_id
     JOIN subjects sub ON sub.id = cs.subject_id
     JOIN classes c ON c.id = cs.class_id
     LEFT JOIN lesson_materials m ON m.id = ce.lesson_material_id AND m.is_published = 1
     LEFT JOIN users tu ON tu.id = cs.teacher_id
     WHERE ${where.join(' AND ')}
     ORDER BY ce.lesson_date DESC, ce.period`
  ).all(...args);

  res.json(rows.map((x) => {
    const questions = safeJson(x.check_questions, []);
    return {
      ...x,
      transcript: safeJson(x.transcript, []),
      attachments: safeJson(x.attachments, []),
      steps_done: safeJson(x.steps_done, []),
      // Linked but unpublished counts as not ready: the pupil sees it waiting.
      materials_ready: !!x.lesson_material_id && !!x.topic,
      // The pupil gets the questions, never the answers: marking happens here.
      check_questions: questions.map(({ q, options }) => ({ q, options })),
      steps: lessonSteps(x, questions),
    };
  }));
});

/**
 * The parts of a catch-up lesson a pupil has to work through.
 *
 * Built from what the teacher actually published: no video means no watch step,
 * no questions means no check. Completion is then earned by finishing the steps
 * rather than declared by pressing a button.
 */
function lessonSteps(entry, questions) {
  const steps = [];
  if (entry.video_url) {
    steps.push({ key: 'watch', label: 'Watch the recap', icon: 'play' });
  }
  if (entry.summary || entry.teacher_notes) {
    steps.push({ key: 'read', label: 'Read the notes', icon: 'book' });
  }
  if (questions.length) {
    steps.push({ key: 'check', label: `Quick check (${questions.length})`, icon: 'assignment' });
  }
  return steps;
}

/**
 * Records progress through a catch-up lesson.
 *
 * Accepts a completed `step`, a set of `answers` for the comprehension check,
 * or a `video_position`. Status is derived from progress rather than set by the
 * caller, so a pupil cannot mark a lesson done without doing it.
 */
r.patch('/catchup/:id', (req, res) => {
  const entry = db.prepare('SELECT * FROM catchup_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Catch-up entry not found' });
  if (!canAccessStudent(req, entry.student_id)) return res.status(403).json({ error: 'Not permitted' });

  const material = entry.lesson_material_id
    ? db.prepare('SELECT * FROM lesson_materials WHERE id = ?').get(entry.lesson_material_id)
    : null;
  const questions = safeJson(material?.check_questions, []);
  const required = lessonSteps({ ...material, video_url: material?.video_url }, questions).map((s) => s.key);

  let done = new Set(safeJson(entry.steps_done, []));
  let score = entry.check_score;
  let total = entry.check_total;
  let attempts = entry.check_attempts;
  let marked = null;

  if (typeof req.body?.step === 'string' && required.includes(req.body.step) && req.body.step !== 'check') {
    done.add(req.body.step);
  }

  if (Array.isArray(req.body?.answers) && questions.length) {
    attempts += 1;
    marked = questions.map((question, i) => {
      const chosen = req.body.answers[i];
      const correct = chosen === question.answer;
      return { correct, chosen, answer: question.answer, explain: question.explain ?? null };
    });
    score = marked.filter((m) => m.correct).length;
    total = questions.length;
    // The check counts as done once they have seen which ones they got right;
    // getting them wrong is part of catching up, not a reason to lock them out.
    done.add('check');
  }

  const position = req.body?.video_position ?? entry.video_position;
  const stepsDone = [...done].filter((s) => required.includes(s));
  const allDone = required.length > 0 && required.every((s) => stepsDone.includes(s));
  const status = allDone ? 'completed' : stepsDone.length || position > 0 ? 'in_progress' : entry.status;

  db.prepare(
    `UPDATE catchup_entries
     SET steps_done = ?, video_position = ?, status = ?,
         check_score = ?, check_total = ?, check_attempts = ?,
         completed_at = CASE WHEN ? = 'completed' AND completed_at IS NULL THEN datetime('now') ELSE completed_at END
     WHERE id = ?`
  ).run(JSON.stringify(stepsDone), position, status, score, total, attempts, status, entry.id);

  const updated = db.prepare('SELECT * FROM catchup_entries WHERE id = ?').get(entry.id);
  res.json({ ...updated, steps_done: stepsDone, required_steps: required, marked });
});

/* ── Assignments ──────────────────────────────────────────────────────────── */
r.get('/assignments', (req, res) => {
  if (req.user.role === 'student') {
    const rows = db.prepare(
      `SELECT a.*, sub.name AS subject, sub.colour, sub.code,
              u.first_name || ' ' || u.last_name AS teacher_name,
              s.id AS submission_id, s.status AS submission_status, s.grade, s.submission_type,
              s.feedback_text, s.feedback_type, s.feedback_audio_url, s.submitted_at, s.graded_at
       FROM assignments a
       JOIN class_subjects cs ON cs.id = a.class_subject_id
       JOIN subjects sub ON sub.id = cs.subject_id
       LEFT JOIN users u ON u.id = cs.teacher_id
       LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ?
       WHERE cs.class_id = ? ORDER BY a.due_at`
    ).all(req.student?.id ?? 0, req.student?.class_id ?? 0);
    return res.json(rows.map(hydrateAssignment));
  }

  if (req.user.role === 'parent') {
    const studentId = Number(req.query.studentId);
    if (!canAccessStudent(req, studentId)) return res.status(403).json({ error: 'Not permitted' });
    const child = db.prepare('SELECT class_id FROM students WHERE id = ?').get(studentId);
    const rows = db.prepare(
      `SELECT a.*, sub.name AS subject, sub.colour,
              s.status AS submission_status, s.grade, s.submitted_at, s.feedback_text
       FROM assignments a JOIN class_subjects cs ON cs.id = a.class_subject_id
       JOIN subjects sub ON sub.id = cs.subject_id
       LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ?
       WHERE cs.class_id = ? ORDER BY a.due_at DESC`
    ).all(studentId, child?.class_id ?? 0);
    return res.json(rows.map(hydrateAssignment));
  }

  const rows = db.prepare(
    `SELECT a.*, sub.name AS subject, sub.colour, c.name AS class_name, c.id AS class_id,
            (SELECT COUNT(*) FROM students st WHERE st.class_id = c.id AND st.status='active') AS class_size,
            (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id) AS submitted_count,
            (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id AND s.grade IS NOT NULL) AS graded_count
     FROM assignments a JOIN class_subjects cs ON cs.id = a.class_subject_id
     JOIN subjects sub ON sub.id = cs.subject_id JOIN classes c ON c.id = cs.class_id
     WHERE cs.teacher_id = ? OR ? = 'admin' ORDER BY a.due_at DESC`
  ).all(req.user.id, req.user.role);
  res.json(rows.map(hydrateAssignment));
});

r.get('/assignments/:id', (req, res) => {
  const a = db.prepare(
    `SELECT a.*, sub.name AS subject, sub.colour, c.name AS class_name, c.id AS class_id
     FROM assignments a JOIN class_subjects cs ON cs.id = a.class_subject_id
     JOIN subjects sub ON sub.id = cs.subject_id JOIN classes c ON c.id = cs.class_id WHERE a.id = ?`
  ).get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Assignment not found' });
  if (req.user.role === 'teacher' && !teachesClassSubject(req.user.id, a.class_subject_id)) {
    return res.status(403).json({ error: 'You do not teach this class' });
  }

  const staff = req.user.role === 'teacher' || req.user.role === 'admin';
  const out = hydrateAssignment(a, { withAnswers: staff });
  if (staff) {
    out.submissions = db.prepare(
      `SELECT s.*, st.student_code, u.first_name, u.last_name, u.avatar_colour, u.avatar_url, u.avatar_emoji,
              iep.needs, iep.time_multiplier, iep.multi_format_approved
       FROM students st JOIN users u ON u.id = st.user_id
       LEFT JOIN submissions s ON s.assignment_id = ? AND s.student_id = st.id
       LEFT JOIN iep_profiles iep ON iep.student_id = st.id
       WHERE st.class_id = ? AND st.status = 'active' ORDER BY u.first_name`
    ).all(a.id, a.class_id).map((x) => ({ ...x, needs: JSON.parse(x.needs || '[]') }));
  } else if (req.user.role === 'student') {
    out.submission = db.prepare('SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?')
      .get(a.id, req.student?.id ?? 0) ?? null;
    out.exam_session = db.prepare('SELECT * FROM exam_sessions WHERE assignment_id = ? AND student_id = ?')
      .get(a.id, req.student?.id ?? 0) ?? null;
  }
  res.json(out);
});

r.post('/assignments', requireRole('teacher', 'admin'), (req, res) => {
  const b = req.body ?? {};
  if (!b.class_subject_id || !b.title || !b.due_at) {
    return res.status(400).json({ error: 'class_subject_id, title and due_at are required' });
  }
  if (req.user.role === 'teacher' && !teachesClassSubject(req.user.id, b.class_subject_id)) {
    return res.status(403).json({ error: 'You do not teach this class' });
  }
  const out = db.prepare(
    `INSERT INTO assignments (class_subject_id, title, description, instructions_steps, due_at, max_score, allow_multi_format, base_duration_minutes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(b.class_subject_id, b.title, b.description ?? null, JSON.stringify(b.instructions_steps ?? []),
        b.due_at, b.max_score ?? 100, b.allow_multi_format === false ? 0 : 1,
        b.base_duration_minutes ?? null, req.user.id);

  // Notify the whole class + their guardians.
  const students = db.prepare(
    `SELECT s.id, s.user_id FROM students s JOIN class_subjects cs ON cs.class_id = s.class_id
     WHERE cs.id = ? AND s.status = 'active'`
  ).all(b.class_subject_id);
  for (const s of students) {
    notify(s.user_id, { title: `New assignment: ${b.title}`, body: `Due ${b.due_at}`, kind: 'assignment', link: '/student/assignments' });
  }
  audit({ user: req.user, action: 'create', entity: 'assignments', entityId: out.lastInsertRowid, next: { title: b.title }, ip: req.ip });
  res.status(201).json(db.prepare('SELECT * FROM assignments WHERE id = ?').get(out.lastInsertRowid));
});

/* ── Exam sessions: automatic extra-time multiplier (PRD Story 2) ─────────── */
r.post('/assignments/:id/start', requireRole('student'), (req, res) => {
  const a = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Assignment not found' });
  if (!a.base_duration_minutes) return res.status(400).json({ error: 'This assignment is not timed' });

  const existing = db.prepare('SELECT * FROM exam_sessions WHERE assignment_id = ? AND student_id = ?')
    .get(a.id, req.student.id);
  if (existing) return res.json(existing);

  const iep = db.prepare('SELECT time_multiplier FROM iep_profiles WHERE student_id = ?').get(req.student.id);
  const multiplier = iep?.time_multiplier ?? 1.0;
  const allowed = Math.round(a.base_duration_minutes * multiplier);
  const expires = new Date(Date.now() + allowed * 60_000).toISOString();

  db.prepare(
    `INSERT INTO exam_sessions (assignment_id, student_id, base_minutes, time_multiplier, allowed_minutes, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(a.id, req.student.id, a.base_duration_minutes, multiplier, allowed, expires);

  audit({ user: req.user, action: 'exam_start', entity: 'exam_sessions', entityId: a.id,
          next: { base: a.base_duration_minutes, multiplier, allowed }, ip: req.ip });
  res.status(201).json(db.prepare('SELECT * FROM exam_sessions WHERE assignment_id = ? AND student_id = ?')
    .get(a.id, req.student.id));
});

function hydrateAssignment(a, { withAnswers = false } = {}) {
  const questions = safeJson(a.questions, []);
  return {
    ...a,
    instructions_steps: safeJson(a.instructions_steps, []),
    question_count: questions.length,
    is_quiz: questions.length > 0,
    questions: withAnswers ? questions : questions.map(({ q, options }) => ({ q, options })),
  };
}
function hydrateMaterial(m) {
  return {
    ...m,
    transcript: safeJson(m.transcript, []),
    attachments: safeJson(m.attachments, []),
    check_questions: safeJson(m.check_questions, []),
  };
}
function safeJson(v, fallback) {
  try { return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function resolveStudentId(req) {
  if (req.user.role === 'student') return req.student?.id ?? null;
  return req.query.studentId != null ? Number(req.query.studentId) : null;
}

export default r;
