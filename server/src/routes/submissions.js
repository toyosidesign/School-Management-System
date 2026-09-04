import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, audit, notify } from '../db/index.js';
import { authenticate, requireRole, canAccessStudent, teachesClassSubject } from '../lib/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '../../uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const ACCEPTED = {
  TEXT: [],
  AUDIO: ['.mp3', '.m4a', '.wav', '.ogg', '.webm'],
  VIDEO: ['.mp4', '.webm', '.mov'],
  DIAGRAM_PDF: ['.pdf', '.png', '.jpg', '.jpeg', '.webp'],
};

/**
 * Magic-number check. An extension allowlist alone is not enough: a file named
 * diagram.png whose bytes are markup would still be stored and served.
 */
const SIGNATURES = {
  '.pdf':  [[0x25, 0x50, 0x44, 0x46]],                          // %PDF
  '.png':  [[0x89, 0x50, 0x4e, 0x47]],
  '.jpg':  [[0xff, 0xd8, 0xff]],
  '.jpeg': [[0xff, 0xd8, 0xff]],
  '.webp': [[0x52, 0x49, 0x46, 0x46]],                          // RIFF....WEBP
  '.mp3':  [[0x49, 0x44, 0x33], [0xff, 0xfb], [0xff, 0xf3], [0xff, 0xf2]],
  '.wav':  [[0x52, 0x49, 0x46, 0x46]],
  '.ogg':  [[0x4f, 0x67, 0x67, 0x53]],
  '.m4a':  [[0x66, 0x74, 0x79, 0x70]],                          // at offset 4
  '.mp4':  [[0x66, 0x74, 0x79, 0x70]],                          // at offset 4
  '.mov':  [[0x66, 0x74, 0x79, 0x70]],
  '.webm': [[0x1a, 0x45, 0xdf, 0xa3]],
};

function looksLikeItsExtension(filePath, ext) {
  const expected = SIGNATURES[ext];
  if (!expected) return true;
  let head;
  try {
    const fd = fs.openSync(filePath, 'r');
    head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
  } catch {
    return false;
  }
  // The ISO base-media formats carry their signature four bytes in.
  const offsets = ['.m4a', '.mp4', '.mov'].includes(ext) ? [4] : [0];
  return expected.some((sig) =>
    offsets.some((o) => sig.every((byte, i) => head[o + i] === byte)));
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${file.originalname.replace(/[^\w.\-]/g, '_')}`),
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const r = Router();
r.use(authenticate);

/**
 * PRD Story 2 / OpenAPI §7: multi-format SEN submissions.
 * A non-TEXT submission requires an active IEP with multi_format_approved,
 * unless the teacher opened the assignment to all formats.
 */
r.post('/assignments/:id/submissions', requireRole('student'), upload.single('file'), (req, res) => {
  const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

  const type = (req.body.submission_type || 'TEXT').toUpperCase();
  const questions = safeJson(assignment.questions, []);

  /* ── A quiz is answered, not written. Marked here so the answer key never
        has to reach the pupil, and so the grade cannot be edited in transit. ── */
  if (type === 'QUIZ' || (questions.length && type === 'TEXT' && Array.isArray(req.body.answers))) {
    if (!questions.length) return res.status(400).json({ error: 'This assignment is not a quiz' });

    const answers = Array.isArray(req.body.answers)
      ? req.body.answers
      : safeJson(req.body.answers, null);
    if (!Array.isArray(answers) || answers.length !== questions.length) {
      return res.status(400).json({ error: `Answer all ${questions.length} questions before submitting` });
    }

    const marked = questions.map((question, i) => ({
      q: question.q,
      chosen: answers[i],
      answer: question.answer,
      correct: answers[i] === question.answer,
      explain: question.explain ?? null,
    }));
    const correct = marked.filter((m) => m.correct).length;
    const grade = Math.round((correct / questions.length) * assignment.max_score * 100) / 100;
    const late = new Date() > new Date(assignment.due_at);

    db.prepare(
      `INSERT INTO submissions (assignment_id, student_id, submission_type, body, status, submitted_at,
                                grade, feedback_type, feedback_text, graded_at)
       VALUES (?, ?, 'QUIZ', ?, ?, datetime('now'), ?, 'text', ?, datetime('now'))
       ON CONFLICT (assignment_id, student_id) DO UPDATE SET
         submission_type = 'QUIZ', body = excluded.body, status = excluded.status,
         submitted_at = datetime('now'), grade = excluded.grade,
         feedback_text = excluded.feedback_text, graded_at = datetime('now')`
    ).run(assignment.id, req.student.id, JSON.stringify(answers), late ? 'late' : 'graded',
          grade, `Marked automatically: ${correct} of ${questions.length} correct.`);

    db.prepare("UPDATE exam_sessions SET submitted_at = datetime('now') WHERE assignment_id = ? AND student_id = ?")
      .run(assignment.id, req.student.id);

    audit({ user: req.user, action: 'quiz_submit', entity: 'submissions', entityId: assignment.id,
            next: { correct, of: questions.length, grade }, ip: req.ip });

    return res.status(201).json({
      ...db.prepare('SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?')
        .get(assignment.id, req.student.id),
      marked,
      score: correct,
      total: questions.length,
    });
  }

  if (!(type in ACCEPTED)) return res.status(400).json({ error: `Unsupported submission_type "${type}"` });

  const iep = db.prepare('SELECT * FROM iep_profiles WHERE student_id = ?').get(req.student.id);
  if (type !== 'TEXT' && !assignment.allow_multi_format && !iep?.multi_format_approved) {
    return res.status(403).json({
      error: 'Multi-format submission is not approved for this student on this assignment',
    });
  }

  if (type === 'TEXT') {
    if (!req.body.body?.trim()) return res.status(400).json({ error: 'Written response cannot be empty' });
  } else {
    if (!req.file) return res.status(400).json({ error: 'A file is required for this submission type' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!ACCEPTED[type].includes(ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: `Invalid format "${ext}". Accepted: ${ACCEPTED[type].join(', ')}` });
    }
    if (!looksLikeItsExtension(req.file.path, ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: `That file does not appear to be a real ${ext.slice(1).toUpperCase()} file.` });
    }
  }

  const late = new Date() > new Date(assignment.due_at);
  const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;

  db.prepare(
    `INSERT INTO submissions (assignment_id, student_id, submission_type, body, file_name, file_url, file_duration, status, submitted_at, transcript)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT (assignment_id, student_id) DO UPDATE SET
       submission_type = excluded.submission_type, body = excluded.body,
       file_name = excluded.file_name, file_url = excluded.file_url,
       file_duration = excluded.file_duration, status = excluded.status,
       submitted_at = datetime('now'), transcript = excluded.transcript`
  ).run(assignment.id, req.student.id, type, req.body.body ?? null,
        req.file?.originalname ?? null, fileUrl, req.body.duration ?? null,
        late ? 'late' : 'submitted',
        type === 'AUDIO' || type === 'VIDEO' ? 'Transcription queued…' : null);

  const submission = db.prepare('SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?')
    .get(assignment.id, req.student.id);

  // Background speech-to-text for audio/video (PRD Story 2). Stubbed with a
  // timer; swap in Whisper / AssemblyAI / Deepgram behind the same call.
  if (type === 'AUDIO' || type === 'VIDEO') queueTranscription(submission.id, req.file?.originalname);

  db.prepare("UPDATE exam_sessions SET submitted_at = datetime('now') WHERE assignment_id = ? AND student_id = ?")
    .run(assignment.id, req.student.id);

  const teacher = db.prepare(
    'SELECT teacher_id FROM class_subjects WHERE id = ?'
  ).get(assignment.class_subject_id);
  if (teacher?.teacher_id) {
    notify(teacher.teacher_id, {
      title: `New ${type.toLowerCase()} submission`,
      body: `${req.user.first_name} ${req.user.last_name} submitted "${assignment.title}"`,
      kind: 'submission', link: `/teacher/assignments/${assignment.id}`,
    });
  }
  audit({ user: req.user, action: 'submit', entity: 'submissions', entityId: submission.id,
          next: { type, status: submission.status }, ip: req.ip });

  res.status(201).json(submission);
});

r.get('/submissions/:id', (req, res) => {
  const s = db.prepare(
    `SELECT s.*, a.title, a.max_score, a.due_at, sub.name AS subject,
            u.first_name, u.last_name, st.student_code,
            iep.needs, iep.time_multiplier, iep.multi_format_approved
     FROM submissions s JOIN assignments a ON a.id = s.assignment_id
     JOIN class_subjects cs ON cs.id = a.class_subject_id JOIN subjects sub ON sub.id = cs.subject_id
     JOIN students st ON st.id = s.student_id JOIN users u ON u.id = st.user_id
     LEFT JOIN iep_profiles iep ON iep.student_id = st.id WHERE s.id = ?`
  ).get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Submission not found' });
  if (!canAccessStudent(req, s.student_id)) return res.status(403).json({ error: 'Not permitted' });
  res.json({ ...s, needs: JSON.parse(s.needs || '[]') });
});

/** Grade + notify parent (PRD §8.4 "SUBMIT GRADE & NOTIFY PARENT"). */
r.post('/submissions/:id/grade', requireRole('teacher', 'admin'), (req, res) => {
  const prev = db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Submission not found' });

  const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(prev.assignment_id);
  if (req.user.role === 'teacher' && !teachesClassSubject(req.user.id, assignment.class_subject_id)) {
    return res.status(403).json({ error: 'You do not teach this class' });
  }

  const grade = Number(req.body?.grade);
  if (Number.isNaN(grade) || grade < 0 || grade > assignment.max_score) {
    return res.status(400).json({ error: `Grade must be between 0 and ${assignment.max_score}` });
  }

  db.prepare(
    `UPDATE submissions SET grade = ?, feedback_type = ?, feedback_text = ?, feedback_audio_url = ?,
            status = 'graded', graded_by = ?, graded_at = datetime('now') WHERE id = ?`
  ).run(grade, req.body.feedback_type ?? 'text', req.body.feedback_text ?? null,
        req.body.feedback_audio_url ?? null, req.user.id, prev.id);

  audit({ user: req.user, action: 'grade_update', entity: 'submissions', entityId: prev.id,
          prev: { grade: prev.grade }, next: { grade }, ip: req.ip });

  const student = db.prepare(
    'SELECT s.id, s.user_id, u.first_name FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = ?'
  ).get(prev.student_id);
  notify(student.user_id, {
    title: `Grade posted: ${assignment.title}`,
    body: `${grade}/${assignment.max_score}`, kind: 'grade', link: '/student/assignments',
  });

  if (req.body?.notify_parent !== false) {
    const guardians = db.prepare('SELECT parent_user_id FROM guardianships WHERE student_id = ?').all(prev.student_id);
    for (const g of guardians) {
      notify(g.parent_user_id, {
        title: `${student.first_name}'s grade for "${assignment.title}"`,
        body: `${grade}/${assignment.max_score}. ${req.body.feedback_text ?? 'See feedback in the portal'}`,
        kind: 'grade', link: '/parent/progress',
      });
    }
  }
  res.json(db.prepare('SELECT * FROM submissions WHERE id = ?').get(prev.id));
});

function queueTranscription(submissionId, filename) {
  setTimeout(() => {
    try {
      db.prepare('UPDATE submissions SET transcript = ? WHERE id = ? AND transcript = ?').run(
        `Auto-generated transcript (SEN accommodation) for ${filename ?? 'the recording'}: ` +
        '"In this response, I am explaining how the events described shaped the outcome, ' +
        'referring to the three sources we studied in class and setting out my own conclusion."',
        submissionId, 'Transcription queued…'
      );
    } catch { /* the row may have been replaced by a resubmission */ }
  }, 3000);
}

export default r;

function safeJson(v, fallback) {
  try { return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
