import { Router } from 'express';
import { db, audit, notify } from '../db/index.js';
import { authenticate, requireRole, canAccessStudent, teachesStudent, teachesClass } from '../lib/auth.js';
import { requirePermission } from '../lib/permissions.js';
import { translate, languages } from '../lib/translate.js';
import { applyExcusedLeave } from '../lib/catchup.js';

const r = Router();
r.use(authenticate);

/* ── Messaging with inline translation (PRD §4.2) ─────────────────────────── */
r.get('/languages', (_req, res) => res.json(languages));

r.get('/threads', (req, res) => {
  res.json(db.prepare(
    `SELECT t.*, su.first_name || ' ' || su.last_name AS student_name, st.student_code,
            (SELECT body FROM messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_at,
            (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id
               AND m.sender_id != ? AND (tp.last_read_at IS NULL OR m.created_at > tp.last_read_at)) AS unread,
            (SELECT group_concat(u2.first_name || ' ' || u2.last_name, ', ')
               FROM thread_participants p2 JOIN users u2 ON u2.id = p2.user_id
               WHERE p2.thread_id = t.id AND p2.user_id != ?) AS participants
     FROM threads t
     JOIN thread_participants tp ON tp.thread_id = t.id AND tp.user_id = ?
     LEFT JOIN students st ON st.id = t.student_id
     LEFT JOIN users su ON su.id = st.user_id
     ORDER BY COALESCE(last_at, t.created_at) DESC`
  ).all(req.user.id, req.user.id, req.user.id));
});

r.post('/threads', (req, res) => {
  const { subject, student_id, participant_ids = [], body } = req.body ?? {};
  if (!subject || !participant_ids.length) {
    return res.status(400).json({ error: 'A subject and at least one recipient are required' });
  }
  const id = db.transaction(() => {
    const t = db.prepare('INSERT INTO threads (subject, student_id, created_by) VALUES (?, ?, ?)')
      .run(subject, student_id ?? null, req.user.id);
    const add = db.prepare('INSERT OR IGNORE INTO thread_participants (thread_id, user_id) VALUES (?, ?)');
    add.run(t.lastInsertRowid, req.user.id);
    for (const p of participant_ids) add.run(t.lastInsertRowid, p);
    return t.lastInsertRowid;
  })();

  if (body) {
    db.prepare('INSERT INTO messages (thread_id, sender_id, body) VALUES (?, ?, ?)').run(id, req.user.id, body);
  }
  for (const p of participant_ids) {
    notify(p, { title: `New message from ${req.user.first_name} ${req.user.last_name}`, body: subject, kind: 'message', link: '/messages' });
  }
  res.status(201).json(db.prepare('SELECT * FROM threads WHERE id = ?').get(id));
});

r.get('/threads/:id/messages', async (req, res) => {
  const member = db.prepare('SELECT 1 FROM thread_participants WHERE thread_id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a participant in this conversation' });

  const target = req.query.lang || req.user.locale || 'en';
  const rows = db.prepare(
    `SELECT m.*, u.first_name, u.last_name, u.role, u.avatar_colour, u.avatar_url, u.avatar_emoji
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.thread_id = ? ORDER BY m.created_at`
  ).all(req.params.id);

  // Translate on read and cache the result back onto the row.
  const out = [];
  for (const m of rows) {
    const cache = safeJson(m.translations, {});
    if (target !== 'en' && target !== m.source_lang && !cache[target]) {
      cache[target] = await translate(m.body, target);
      db.prepare('UPDATE messages SET translations = ? WHERE id = ?').run(JSON.stringify(cache), m.id);
    }
    out.push({ ...m, translations: cache, translated: cache[target] ?? null, mine: m.sender_id === req.user.id });
  }

  db.prepare("UPDATE thread_participants SET last_read_at = datetime('now') WHERE thread_id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  res.json(out);
});

r.post('/threads/:id/messages', (req, res) => {
  const member = db.prepare('SELECT 1 FROM thread_participants WHERE thread_id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a participant in this conversation' });
  if (!req.body?.body?.trim()) return res.status(400).json({ error: 'Message cannot be empty' });

  const m = db.prepare('INSERT INTO messages (thread_id, sender_id, body, source_lang) VALUES (?, ?, ?, ?)')
    .run(req.params.id, req.user.id, req.body.body.trim(), req.body.source_lang ?? 'en');
  db.prepare("UPDATE threads SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);

  const others = db.prepare('SELECT user_id FROM thread_participants WHERE thread_id = ? AND user_id != ?')
    .all(req.params.id, req.user.id);
  const thread = db.prepare('SELECT subject FROM threads WHERE id = ?').get(req.params.id);
  for (const o of others) {
    notify(o.user_id, { title: `${req.user.first_name} ${req.user.last_name}`, body: thread.subject, kind: 'message', link: '/messages' });
  }
  res.status(201).json(db.prepare('SELECT * FROM messages WHERE id = ?').get(m.lastInsertRowid));
});

/** Who this user is allowed to start a conversation with. */
r.get('/contacts', (req, res) => {
  if (req.user.role === 'parent') {
    return res.json(db.prepare(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.role, u.avatar_colour, u.avatar_url, u.avatar_emoji, sub.name AS context
       FROM guardianships g JOIN students s ON s.id = g.student_id
       JOIN class_subjects cs ON cs.class_id = s.class_id
       JOIN subjects sub ON sub.id = cs.subject_id JOIN users u ON u.id = cs.teacher_id
       WHERE g.parent_user_id = ?`
    ).all(req.user.id));
  }
  if (req.user.role === 'teacher' || req.user.role === 'admin') {
    return res.json(db.prepare(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.role, u.avatar_colour, u.avatar_url, u.avatar_emoji,
              'Parent of ' || su.first_name AS context
       FROM class_subjects cs JOIN students s ON s.class_id = cs.class_id
       JOIN users su ON su.id = s.user_id
       JOIN guardianships g ON g.student_id = s.id JOIN users u ON u.id = g.parent_user_id
       WHERE cs.teacher_id = ? OR ? = 'admin'`
    ).all(req.user.id, req.user.role));
  }
  return res.json(db.prepare(
    `SELECT DISTINCT u.id, u.first_name, u.last_name, u.role, u.avatar_colour, u.avatar_url, u.avatar_emoji, sub.name AS context
     FROM class_subjects cs JOIN subjects sub ON sub.id = cs.subject_id
     JOIN users u ON u.id = cs.teacher_id WHERE cs.class_id = ?`
  ).all(req.student?.class_id ?? 0));
});

/* ── Leave requests ───────────────────────────────────────────────────────── */
r.get('/leave', (req, res) => {
  if (req.user.role === 'student') {
    return res.json(db.prepare(
      `SELECT l.*, ru.first_name || ' ' || ru.last_name AS reviewer
       FROM leave_requests l LEFT JOIN users ru ON ru.id = l.reviewed_by
       WHERE l.student_id = ? ORDER BY l.created_at DESC`
    ).all(req.student.id));
  }
  if (req.user.role === 'parent') {
    return res.json(db.prepare(
      `SELECT l.*, u.first_name AS student_first_name, ru.first_name || ' ' || ru.last_name AS reviewer
       FROM leave_requests l JOIN guardianships g ON g.student_id = l.student_id AND g.parent_user_id = ?
       JOIN students s ON s.id = l.student_id JOIN users u ON u.id = s.user_id
       LEFT JOIN users ru ON ru.id = l.reviewed_by ORDER BY l.created_at DESC`
    ).all(req.user.id));
  }
  // Teachers see requests for classes they are homeroom teacher of, plus anything they teach.
  return res.json(db.prepare(
    `SELECT DISTINCT l.*, u.first_name AS student_first_name, u.last_name AS student_last_name,
            s.student_code, c.name AS class_name,
            rq.first_name || ' ' || rq.last_name AS requested_by_name, rq.role AS requested_by_role
     FROM leave_requests l
     JOIN students s ON s.id = l.student_id JOIN users u ON u.id = s.user_id
     JOIN classes c ON c.id = s.class_id
     LEFT JOIN class_subjects cs ON cs.class_id = c.id
     JOIN users rq ON rq.id = l.requested_by
     WHERE c.homeroom_teacher_id = ? OR cs.teacher_id = ? OR ? = 'admin'
     ORDER BY CASE l.status WHEN 'pending' THEN 0 ELSE 1 END, l.created_at DESC`
  ).all(req.user.id, req.user.id, req.user.role));
});

/**
 * Absence is a decision for the adults responsible for the child, so a pupil
 * cannot excuse themselves. Guardians file for their own children; staff file
 * for pupils they teach.
 */
r.post('/leave', requireRole('parent', 'teacher', 'admin'), (req, res) => {
  const b = req.body ?? {};
  const studentId = Number(b.student_id);
  if (!studentId) return res.status(400).json({ error: 'student_id is required' });
  if (!canAccessStudent(req, studentId)) return res.status(403).json({ error: 'Not permitted' });
  if (!b.start_date || !b.end_date || !b.reason) {
    return res.status(400).json({ error: 'Start date, end date and reason are required' });
  }
  if (b.end_date < b.start_date) return res.status(400).json({ error: 'End date cannot be before the start date' });

  const out = db.prepare(
    'INSERT INTO leave_requests (student_id, requested_by, start_date, end_date, reason, category) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(studentId, req.user.id, b.start_date, b.end_date, b.reason, b.category ?? 'other');

  const child = db.prepare(
    'SELECT u.first_name, u.last_name, c.homeroom_teacher_id FROM students s JOIN users u ON u.id = s.user_id LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?'
  ).get(studentId);

  // Leadership decides, so they are the ones told there is something waiting.
  for (const approver of db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1").all()) {
    notify(approver.id, {
      title: 'Leave request awaiting a decision',
      body: `${child?.first_name ?? 'A pupil'}: ${b.start_date} to ${b.end_date}`,
      kind: 'leave', link: '/admin/leave',
    });
  }

  // The class teacher is told for awareness, not for action.
  if (child?.homeroom_teacher_id && child.homeroom_teacher_id !== req.user.id) {
    notify(child.homeroom_teacher_id, {
      title: 'Leave requested for one of your pupils',
      body: `${child.first_name}: ${b.start_date} to ${b.end_date}`,
      kind: 'leave', link: '/teacher/leave',
    });
  }
  audit({ user: req.user, action: 'create', entity: 'leave_requests', entityId: out.lastInsertRowid, next: b, ip: req.ip });
  res.status(201).json(db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(out.lastInsertRowid));
});

/**
 * Approving leave marks the register, which is a legal record, so the decision
 * sits with school leadership rather than the classroom teacher, who is often
 * the person reporting the absence in the first place. Approval tags the days
 * as Excused Leave and opens the Catch-Up entries.
 */
r.post('/leave/:id/decision', requirePermission('pupil_leave.decide'), (req, res) => {
  const leave = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(req.params.id);
  if (!leave) return res.status(404).json({ error: 'Leave request not found' });
  const status = req.body?.status;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be "approved" or "rejected"' });
  }

  db.prepare("UPDATE leave_requests SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_note = ? WHERE id = ?")
    .run(status, req.user.id, req.body.review_note ?? null, leave.id);

  let tagged = 0;
  if (status === 'approved') tagged = applyExcusedLeave(leave, req.user.id);

  const student = db.prepare('SELECT user_id FROM students WHERE id = ?').get(leave.student_id);
  notify(student.user_id, {
    title: `Leave request ${status}`,
    body: `${leave.start_date} → ${leave.end_date}${tagged ? ` · ${tagged} periods tagged as Excused Leave` : ''}`,
    kind: 'leave', link: '/student/leave',
  });
  for (const g of db.prepare('SELECT parent_user_id FROM guardianships WHERE student_id = ?').all(leave.student_id)) {
    notify(g.parent_user_id, { title: `Leave request ${status}`, body: `${leave.start_date} → ${leave.end_date}`, kind: 'leave', link: '/parent/leave' });
  }
  audit({ user: req.user, action: 'leave_decision', entity: 'leave_requests', entityId: leave.id,
          prev: { status: leave.status }, next: { status, excused_periods: tagged }, ip: req.ip });

  res.json({ ...db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(leave.id), excused_periods: tagged });
});

/* ── Nursery / primary daily activity timeline ────────────────────────────── */
r.get('/activity', (req, res) => {
  const studentId = req.user.role === 'student' ? req.student.id : Number(req.query.studentId);
  if (!canAccessStudent(req, studentId)) return res.status(403).json({ error: 'Not permitted' });
  res.json(db.prepare(
    `SELECT a.*, u.first_name || ' ' || u.last_name AS logged_by_name
     FROM activity_logs a LEFT JOIN users u ON u.id = a.logged_by
     WHERE a.student_id = ? ORDER BY a.occurred_at DESC LIMIT 100`
  ).all(studentId));
});

r.post('/activity', requireRole('teacher', 'admin'), (req, res) => {
  const b = req.body ?? {};
  if (!b.student_id || !b.entry_type || !b.detail) {
    return res.status(400).json({ error: 'student_id, entry_type and detail are required' });
  }
  if (req.user.role === 'teacher' && !teachesStudent(req.user.id, b.student_id)) {
    return res.status(403).json({ error: 'You do not teach this student' });
  }
  const out = db.prepare(
    'INSERT INTO activity_logs (student_id, entry_type, detail, rating, occurred_at, logged_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(b.student_id, b.entry_type, b.detail, b.rating ?? null,
        b.occurred_at ?? new Date().toISOString(), req.user.id);

  for (const g of db.prepare('SELECT parent_user_id FROM guardianships WHERE student_id = ?').all(b.student_id)) {
    notify(g.parent_user_id, { title: `Daily update: ${b.entry_type}`, body: b.detail, kind: 'activity', link: '/parent/timeline' });
  }
  res.status(201).json(db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(out.lastInsertRowid));
});

/* ── Permission slips & digital signature ─────────────────────────────────── */
r.get('/slips', (req, res) => {
  if (req.user.role === 'parent') {
    return res.json(db.prepare(
      `SELECT ps.*, s.id AS student_id, u.first_name AS student_first_name,
              sr.decision, sr.signed_at, sr.signature
       FROM permission_slips ps
       JOIN students s ON s.class_id = ps.class_id
       JOIN guardianships g ON g.student_id = s.id AND g.parent_user_id = ?
       JOIN users u ON u.id = s.user_id
       LEFT JOIN slip_responses sr ON sr.slip_id = ps.id AND sr.student_id = s.id
       ORDER BY ps.respond_by`
    ).all(req.user.id));
  }
  res.json(db.prepare(
    `SELECT ps.*, c.name AS class_name,
            (SELECT COUNT(*) FROM students s WHERE s.class_id = ps.class_id AND s.status='active') AS expected,
            (SELECT COUNT(*) FROM slip_responses sr WHERE sr.slip_id = ps.id AND sr.decision='approved') AS approved,
            (SELECT COUNT(*) FROM slip_responses sr WHERE sr.slip_id = ps.id AND sr.decision='declined') AS declined
     FROM permission_slips ps LEFT JOIN classes c ON c.id = ps.class_id ORDER BY ps.respond_by DESC`
  ).all());
});

r.post('/slips', requireRole('teacher', 'admin'), (req, res) => {
  const b = req.body ?? {};
  if (!b.title || !b.class_id || !b.respond_by) {
    return res.status(400).json({ error: 'title, class_id and respond_by are required' });
  }
  if (req.user.role === 'teacher' && !teachesClass(req.user.id, b.class_id)) {
    return res.status(403).json({ error: 'You do not teach this class' });
  }
  const out = db.prepare(
    'INSERT INTO permission_slips (title, description, event_date, cost, class_id, respond_by, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(b.title, b.description ?? null, b.event_date ?? null, b.cost ?? 0, b.class_id, b.respond_by, req.user.id);

  for (const g of db.prepare(
    `SELECT DISTINCT g.parent_user_id FROM guardianships g JOIN students s ON s.id = g.student_id WHERE s.class_id = ?`
  ).all(b.class_id)) {
    notify(g.parent_user_id, { title: `Permission slip: ${b.title}`, body: `Respond by ${b.respond_by}`, kind: 'slip', link: '/parent/slips' });
  }
  res.status(201).json(db.prepare('SELECT * FROM permission_slips WHERE id = ?').get(out.lastInsertRowid));
});

r.post('/slips/:id/sign', requireRole('parent'), (req, res) => {
  const { student_id, decision, signature } = req.body ?? {};
  if (!canAccessStudent(req, student_id)) return res.status(403).json({ error: 'Not permitted' });
  if (!['approved', 'declined'].includes(decision)) return res.status(400).json({ error: 'decision must be "approved" or "declined"' });
  if (!signature?.trim()) return res.status(400).json({ error: 'A typed signature is required' });

  db.prepare(
    `INSERT INTO slip_responses (slip_id, student_id, parent_id, decision, signature, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (slip_id, student_id) DO UPDATE SET
       decision = excluded.decision, signature = excluded.signature,
       signed_at = datetime('now'), ip_address = excluded.ip_address`
  ).run(req.params.id, student_id, req.user.id, decision, signature.trim(), req.ip);

  audit({ user: req.user, action: 'sign_slip', entity: 'permission_slips', entityId: req.params.id,
          next: { student_id, decision, signature: signature.trim() }, ip: req.ip });
  res.status(201).json(db.prepare('SELECT * FROM slip_responses WHERE slip_id = ? AND student_id = ?')
    .get(req.params.id, student_id));
});

/* ── Student feedback on teaching ─────────────────────────────────────────── */
r.get('/feedback', (req, res) => {
  if (req.user.role === 'parent') {
    return res.json(db.prepare(
      `SELECT f.*, u.first_name || ' ' || u.last_name AS teacher_name, sub.name AS subject,
              su.first_name AS student_first_name
       FROM teacher_feedback f
       JOIN guardianships g ON g.student_id = f.student_id AND g.parent_user_id = ?
       JOIN users u ON u.id = f.teacher_id
       JOIN students st ON st.id = f.student_id JOIN users su ON su.id = st.user_id
       LEFT JOIN class_subjects cs ON cs.id = f.class_subject_id
       LEFT JOIN subjects sub ON sub.id = cs.subject_id
       ORDER BY f.created_at DESC`
    ).all(req.user.id));
  }
  if (req.user.role === 'student') return res.status(403).json({ error: 'Not permitted' });
  const teacherId = req.query.teacherId ?? req.user.id;
  const rows = db.prepare(
    `SELECT f.id, f.rating, f.clarity, f.support, f.comment, f.created_at, f.is_anonymous,
            sub.name AS subject,
            CASE WHEN f.is_anonymous = 1 THEN NULL ELSE u.first_name || ' ' || u.last_name END AS student_name
     FROM teacher_feedback f
     LEFT JOIN class_subjects cs ON cs.id = f.class_subject_id
     LEFT JOIN subjects sub ON sub.id = cs.subject_id
     LEFT JOIN students s ON s.id = f.student_id LEFT JOIN users u ON u.id = s.user_id
     WHERE f.teacher_id = ? ORDER BY f.created_at DESC`
  ).all(teacherId);
  const avg = db.prepare(
    'SELECT ROUND(AVG(rating),2) rating, ROUND(AVG(clarity),2) clarity, ROUND(AVG(support),2) support, COUNT(*) n FROM teacher_feedback WHERE teacher_id = ?'
  ).get(teacherId);
  res.json({ summary: avg, items: rows });
});

/**
 * Feedback on teaching comes from guardians, not pupils. A child rating the
 * adult who marks their work is an uncomfortable power dynamic, and the ratings
 * are not reliable enough to justify it.
 */
r.post('/feedback', requireRole('parent'), (req, res) => {
  const b = req.body ?? {};
  const studentId = Number(b.student_id);
  if (!b.teacher_id || !b.rating) return res.status(400).json({ error: 'teacher_id and rating are required' });
  if (!canAccessStudent(req, studentId)) return res.status(403).json({ error: 'Not permitted' });

  const teaches = db.prepare(
    `SELECT 1 FROM class_subjects cs JOIN students s ON s.class_id = cs.class_id
     WHERE cs.teacher_id = ? AND s.id = ?`
  ).get(b.teacher_id, studentId);
  if (!teaches) return res.status(403).json({ error: 'That teacher does not teach your child' });

  const out = db.prepare(
    'INSERT INTO teacher_feedback (teacher_id, student_id, class_subject_id, rating, clarity, support, comment, is_anonymous) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(b.teacher_id, studentId, b.class_subject_id ?? null, b.rating, b.clarity ?? null,
        b.support ?? null, b.comment ?? null, b.is_anonymous === false ? 0 : 1);
  res.status(201).json(db.prepare('SELECT * FROM teacher_feedback WHERE id = ?').get(out.lastInsertRowid));
});

function safeJson(v, fallback) {
  try { return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

export default r;
