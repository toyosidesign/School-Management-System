import { Router } from 'express';
import { db, audit } from '../db/index.js';
import { authenticate, requireRole, canAccessStudent, teacherClassIds, teachesClass } from '../lib/auth.js';
import { requirePermission } from '../lib/permissions.js';
import { isSuperAdmin } from '../lib/auth.js';
import { IS_SEN, readSupport } from '../lib/sen.js';
import { hash } from '../lib/auth.js';
import { issueCode, activeCodeFor } from '../lib/accessCode.js';
import { inviteLink, issueToken } from '../lib/invite.js';
import crypto from 'node:crypto';

/**
 * Accounts are never created with a password somebody else knows. A record can
 * exist before its owner has ever signed in, so it is given an unguessable
 * value that nothing can produce: staff then set a real password through an
 * invitation link, and pupils sign in with a code instead.
 */
const unusablePassword = () => hash(crypto.randomBytes(32).toString('base64url'));

const r = Router();
r.use(authenticate);

/* ── Students ─────────────────────────────────────────────────────────────── */
r.get('/students', requireRole('admin', 'teacher'), (req, res) => {
  const { section, classId, q, sen, support } = req.query;
  const where = ["s.status = 'active'"];
  const args = [];

  if (req.user.role === 'teacher') {
    const ids = teacherClassIds(req.user.id);
    if (!ids.length) return res.json([]);
    where.push(`s.class_id IN (${ids.map(() => '?').join(',')})`);
    args.push(...ids);
  }
  if (section) { where.push('c.section = ?'); args.push(section); }
  if (classId) { where.push('s.class_id = ?'); args.push(classId); }
  if (q) { where.push('(u.first_name LIKE ? OR u.last_name LIKE ? OR s.student_code LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (sen === 'true') where.push(IS_SEN);
  if (support === 'true') where.push('iep.id IS NOT NULL');

  const rows = db.prepare(
    `SELECT s.id, s.student_code, s.date_of_birth, s.gender, s.enrolled_on, s.class_id,
            u.first_name, u.last_name, u.email, u.avatar_colour, u.avatar_url, u.avatar_emoji,
            c.name AS class_name, c.room AS class_room, c.section, c.level,
            iep.id AS iep_id, iep.needs, iep.time_multiplier, iep.multi_format_approved,
            iep.scribe_allowed, iep.rest_breaks, iep.review_date, iep.notes AS support_notes,
            CASE WHEN iep.id IS NOT NULL AND ${IS_SEN} THEN 1 ELSE 0 END AS is_sen
     FROM students s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN iep_profiles iep ON iep.student_id = s.id
     WHERE ${where.join(' AND ')}
     ORDER BY (c.id IS NULL), c.level, c.name, u.first_name`
  ).all(...args);

  res.json(rows.map((s) => {
    const needs = JSON.parse(s.needs || '[]');
    // The roll offers the same plan editor as the register, so each pupil
    // carries their whole plan: a form opened on half of one would save the
    // other half away the moment it was used.
    const iep = s.iep_id ? {
      student_id: s.id,
      needs,
      time_multiplier: s.time_multiplier,
      multi_format_approved: s.multi_format_approved,
      scribe_allowed: s.scribe_allowed,
      rest_breaks: s.rest_breaks,
      review_date: s.review_date,
      notes: s.support_notes,
    } : null;
    return { ...s, needs, iep };
  }));
});

r.get('/students/:id', (req, res) => {
  if (!canAccessStudent(req, req.params.id)) {
    return res.status(403).json({ error: 'You do not have access to this student record' });
  }
  const s = db.prepare(
    `SELECT s.*, u.first_name, u.last_name, u.email, u.phone, u.avatar_colour, u.avatar_url, u.avatar_emoji,
            c.name AS class_name, c.section, c.level, c.room
     FROM students s JOIN users u ON u.id = s.user_id
     LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`
  ).get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Student not found' });

  s.iep = db.prepare('SELECT * FROM iep_profiles WHERE student_id = ?').get(s.id) ?? null;
  if (s.iep) s.iep.needs = JSON.parse(s.iep.needs || '[]');
  s.guardians = db.prepare(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, g.relationship, g.is_primary
     FROM guardianships g JOIN users u ON u.id = g.parent_user_id WHERE g.student_id = ?`
  ).all(s.id);
  s.subjects = db.prepare(
    `SELECT cs.id AS class_subject_id, sub.name, sub.code, sub.colour,
            tu.first_name || ' ' || tu.last_name AS teacher_name, cs.teacher_id
     FROM class_subjects cs JOIN subjects sub ON sub.id = cs.subject_id
     LEFT JOIN users tu ON tu.id = cs.teacher_id
     WHERE cs.class_id = ? ORDER BY sub.name`
  ).all(s.class_id);

  const att = db.prepare(
    `SELECT status, COUNT(*) n FROM attendance WHERE student_id = ? GROUP BY status`
  ).all(s.id);
  const total = att.reduce((a, b) => a + b.n, 0) || 1;
  s.attendance_summary = {
    ...Object.fromEntries(att.map((a) => [a.status, a.n])),
    total,
    rate: Math.round(((att.find((a) => a.status === 'present')?.n ?? 0) / total) * 100),
  };
  s.grade_average = db.prepare(
    'SELECT ROUND(AVG(grade), 1) avg FROM submissions WHERE student_id = ? AND grade IS NOT NULL'
  ).get(s.id).avg;
  res.json(s);
});

r.post('/students', requirePermission('students.manage'), (req, res) => {
  const b = req.body ?? {};
  if (!b.first_name || !b.last_name || !b.email) {
    return res.status(400).json({ error: 'First name, last name and email are required' });
  }
  try {
    const out = db.transaction(() => {
      const u = db.prepare(
        `INSERT INTO users (role, email, password_hash, first_name, last_name, phone, avatar_colour)
         VALUES ('student', ?, ?, ?, ?, ?, ?)`
      ).run(b.email, unusablePassword(), b.first_name, b.last_name, b.phone ?? null, b.avatar_colour ?? '#2563eb');

      const code = b.student_code || `STU-${1000 + u.lastInsertRowid}`;
      const s = db.prepare(
        `INSERT INTO students (user_id, student_code, class_id, date_of_birth, gender, address,
                               medical_notes, emergency_contact_name, emergency_contact_phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(u.lastInsertRowid, code, b.class_id ?? null, b.date_of_birth ?? null, b.gender ?? null,
            b.address ?? null, b.medical_notes ?? null, b.emergency_contact_name ?? null, b.emergency_contact_phone ?? null);
      return s.lastInsertRowid;
    })();
    audit({ user: req.user, action: 'create', entity: 'students', entityId: out, next: b, ip: req.ip });
    res.status(201).json(db.prepare('SELECT * FROM students WHERE id = ?').get(out));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'That email or student code already exists' });
    throw e;
  }
});

/**
 * Removes a pupil from the school entirely.
 *
 * This is not the same as a leaver: marking them inactive keeps their record,
 * their marks and their attendance, which is what a school normally wants and
 * what safeguarding usually requires. Deleting takes all of it, so what would
 * go is counted and reported before anything is touched.
 */
r.delete('/students/:id', requirePermission('students.manage'), (req, res) => {
  const student = db.prepare(
    `SELECT s.*, u.first_name, u.last_name FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = ?`
  ).get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const attached = {
    attendance: db.prepare('SELECT COUNT(*) n FROM attendance WHERE student_id = ?').get(student.id).n,
    submissions: db.prepare('SELECT COUNT(*) n FROM submissions WHERE student_id = ?').get(student.id).n,
    invoices: db.prepare('SELECT COUNT(*) n FROM invoices WHERE student_id = ?').get(student.id).n,
    catchup: db.prepare('SELECT COUNT(*) n FROM catchup_entries WHERE student_id = ?').get(student.id).n,
    guardians: db.prepare('SELECT COUNT(*) n FROM guardianships WHERE student_id = ?').get(student.id).n,
  };

  const total = Object.values(attached).reduce((a, b) => a + b, 0);
  if (total && !req.query.confirm) {
    return res.status(409).json({
      error: `${student.first_name} ${student.last_name} has records against them.`,
      attached,
      hint: 'Mark them inactive to keep the record, or repeat with ?confirm=1 to remove all of it.',
    });
  }

  // The pupil's account goes, and the record cascades from it.
  db.prepare('DELETE FROM users WHERE id = ?').run(student.user_id);
  audit({ user: req.user, action: 'delete', entity: 'students', entityId: student.id,
          prev: { ...student, attached }, ip: req.ip });
  res.json({ ok: true, removed: attached });
});

/* ── Enrolling a whole list at once ───────────────────────────────────────── */

/** The columns an import understands. Everything but the names is optional. */
export const IMPORT_COLUMNS = [
  'first_name', 'last_name', 'email', 'class', 'classroom', 'student_code', 'date_of_birth', 'gender',
  'address', 'medical_notes', 'emergency_contact_name', 'emergency_contact_phone',
  'guardian_name', 'guardian_email', 'guardian_phone', 'guardian_relationship',
];

const clean = (v) => (v == null ? '' : String(v).trim());

/**
 * Checks one row of an import against the school as it stands.
 *
 * Nothing is written here. The same pass runs for the preview and for the real
 * import, so what an administrator is shown before committing is exactly what
 * the commit will do, rather than an optimistic guess.
 */
function checkImportRow(row, line, seen) {
  const out = {
    line,
    first_name: clean(row.first_name),
    last_name: clean(row.last_name),
    email: clean(row.email).toLowerCase(),
    student_code: clean(row.student_code),
    class_name: clean(row.class),
    classroom: clean(row.classroom),
    date_of_birth: clean(row.date_of_birth),
    gender: clean(row.gender),
    address: clean(row.address),
    medical_notes: clean(row.medical_notes),
    emergency_contact_name: clean(row.emergency_contact_name),
    emergency_contact_phone: clean(row.emergency_contact_phone),
    guardian: {
      name: clean(row.guardian_name),
      email: clean(row.guardian_email).toLowerCase(),
      phone: clean(row.guardian_phone),
      relationship: clean(row.guardian_relationship) || 'Parent',
    },
    errors: [],
    warnings: [],
  };

  // Support columns are optional here, so a school that records a pupil's
  // needs as it enrols them does not have to keep a second list saying it again.
  out.support = readSupport(row);
  out.errors.push(...out.support.errors);
  out.warnings.push(...out.support.warnings);

  if (!out.first_name || !out.last_name) out.errors.push('A first and last name are needed');

  if (out.class_name) {
    // Classes of one year share a name and differ by classroom, so a name on
    // its own can point at several. Rather than picking one and putting a child
    // in the wrong register, the row says which classrooms it could mean.
    let matches = db.prepare('SELECT * FROM classes WHERE lower(name) = lower(?)').all(out.class_name);

    // "Grade 4 A" in one column is the same as "Grade 4" and "A" in two.
    if (!matches.length) {
      const cut = out.class_name.lastIndexOf(' ');
      if (cut > 0) {
        const head = out.class_name.slice(0, cut);
        const tail = out.class_name.slice(cut + 1);
        const split = db.prepare(
          'SELECT * FROM classes WHERE lower(name) = lower(?) AND lower(COALESCE(room, \'\')) = lower(?)'
        ).all(head, tail);
        if (split.length) matches = split;
      }
    }

    if (out.classroom) {
      matches = matches.filter((c) => String(c.room ?? '').toLowerCase() === out.classroom.toLowerCase());
    }

    if (!matches.length) {
      out.errors.push(out.classroom
        ? `No class "${out.class_name}" in classroom ${out.classroom}`
        : `No class called "${out.class_name}"`);
    } else if (matches.length > 1) {
      const rooms = matches.map((c) => c.room ?? '?').join(', ');
      out.errors.push(`${out.class_name} has classrooms ${rooms}. Add a classroom column to say which.`);
    } else {
      out.class_id = matches[0].id;
      out.class_label = matches[0].room ? `${matches[0].name} · ${matches[0].room}` : matches[0].name;
    }
  } else {
    out.warnings.push('No class: they will need putting in one');
  }

  if (out.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) out.errors.push('That email does not look right');
    else if (db.prepare('SELECT 1 FROM users WHERE lower(email) = lower(?)').get(out.email)) {
      out.errors.push('Somebody already has that email');
    } else if (seen.emails.has(out.email)) out.errors.push('That email appears twice in this file');
    seen.emails.add(out.email);
  }

  if (out.student_code) {
    if (db.prepare('SELECT 1 FROM students WHERE lower(student_code) = lower(?)').get(out.student_code)) {
      out.errors.push(`Pupil number ${out.student_code} is already in use`);
    } else if (seen.codes.has(out.student_code.toLowerCase())) {
      out.errors.push('That pupil number appears twice in this file');
    }
    seen.codes.add(out.student_code.toLowerCase());
  }

  if (out.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(out.date_of_birth)) {
    out.errors.push('Date of birth should be written 2018-04-23');
  }

  if (out.guardian.email) {
    const existing = db.prepare("SELECT id, role, first_name, last_name FROM users WHERE lower(email) = lower(?)")
      .get(out.guardian.email);
    if (existing && existing.role !== 'parent') {
      out.errors.push(`${out.guardian.email} belongs to a ${existing.role}, not a guardian`);
    } else if (existing) {
      out.guardian.user_id = existing.id;
      out.guardian.existing = `${existing.first_name} ${existing.last_name}`;
    } else if (!out.guardian.name) {
      out.errors.push('A guardian email needs a guardian name beside it');
    } else {
      out.guardian.is_new = true;
    }
  } else if (out.guardian.name) {
    out.warnings.push('The guardian has no email, so no account is made for them');
  }

  out.status = out.errors.length ? 'error' : 'ready';
  return out;
}

/**
 * Enrols a list of pupils in one go.
 *
 * `dry_run` checks the file and reports row by row without writing anything.
 * A real import refuses outright while any row is wrong, unless the caller
 * says to go ahead with the good ones: a half-imported register that nobody
 * noticed is worse than a rejected file.
 */
r.post('/students/import', requirePermission('students.manage'), (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows) return res.status(400).json({ error: 'Send the rows to import' });
  if (rows.length > 1000) return res.status(400).json({ error: 'Import at most 1000 pupils at a time' });

  const seen = { emails: new Set(), codes: new Set() };
  const checked = rows.map((row, i) => checkImportRow(row, i + 1, seen));
  const ready = checked.filter((r) => r.status === 'ready');
  const failed = checked.filter((r) => r.status === 'error');

  const summary = {
    total: checked.length,
    ready: ready.length,
    errors: failed.length,
    new_guardians: ready.filter((r) => r.guardian.is_new).length,
    linked_guardians: ready.filter((r) => r.guardian.user_id).length,
    with_support: ready.filter((r) => r.support.has_support).length,
    joining_register: ready.filter((r) => r.support.is_sen).length,
  };

  if (req.body?.dry_run) return res.json({ rows: checked, summary, committed: false });
  if (failed.length && !req.body?.allow_partial) {
    return res.status(400).json({
      error: `${failed.length} row${failed.length === 1 ? '' : 's'} need fixing before this can be imported.`,
      rows: checked, summary, committed: false,
    });
  }
  if (!ready.length) return res.status(400).json({ error: 'There is nothing to import', rows: checked, summary });

  const addUser = db.prepare(
    `INSERT INTO users (role, email, password_hash, first_name, last_name, phone)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const addStudent = db.prepare(
    `INSERT INTO students (user_id, student_code, class_id, date_of_birth, gender, address,
                           medical_notes, emergency_contact_name, emergency_contact_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const created = db.transaction(() => ready.map((row) => {
    const user = addUser.run('student', row.email || 'pending', unusablePassword(),
                             row.first_name, row.last_name, null);
    // Pupils sign in with a code, so an address is only an identifier here: one
    // is derived from their pupil number when the school has not supplied one.
    const code = row.student_code || `STU-${1000 + Number(user.lastInsertRowid)}`;
    if (!row.email) {
      db.prepare('UPDATE users SET email = ? WHERE id = ?')
        .run(`${code.toLowerCase()}@pupil.local`, user.lastInsertRowid);
    }

    const student = addStudent.run(user.lastInsertRowid, code, row.class_id ?? null,
                                   row.date_of_birth || null, row.gender || null, row.address || null,
                                   row.medical_notes || null, row.emergency_contact_name || null,
                                   row.emergency_contact_phone || null);

    let guardianId = row.guardian.user_id ?? null;
    if (row.guardian.is_new) {
      const [first, ...rest] = row.guardian.name.split(/\s+/);
      guardianId = db.prepare(
        `INSERT INTO users (role, email, password_hash, first_name, last_name, phone)
         VALUES ('parent', ?, ?, ?, ?, ?)`
      ).run(row.guardian.email, unusablePassword(), first, rest.join(' ') || first,
            row.guardian.phone || null).lastInsertRowid;
    }
    if (guardianId) {
      db.prepare(
        `INSERT OR IGNORE INTO guardianships (parent_user_id, student_id, relationship, is_primary, is_verified)
         VALUES (?, ?, ?, 1, 1)`
      ).run(guardianId, student.lastInsertRowid, row.guardian.relationship);
    }

    if (row.support.has_support) {
      db.prepare(
        `INSERT INTO iep_profiles (student_id, needs, time_multiplier, multi_format_approved,
                                   scribe_allowed, rest_breaks, notes, review_date, senco_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(student.lastInsertRowid, JSON.stringify(row.support.needs), row.support.time_multiplier,
            row.support.multi_format ? 1 : 0, row.support.scribe_allowed ? 1 : 0,
            row.support.rest_breaks ? 1 : 0, row.support.notes || null,
            row.support.review_date || null, req.user.id);
    }

    return { line: row.line, student_id: student.lastInsertRowid, student_code: code,
             name: `${row.first_name} ${row.last_name}`, guardian_user_id: guardianId };
  }))();

  audit({ user: req.user, action: 'import', entity: 'students', entityId: 'bulk',
          next: { ...summary, imported: created.length }, ip: req.ip });

  res.status(201).json({ rows: checked, summary: { ...summary, imported: created.length }, created, committed: true });
});

r.patch('/students/:id', requirePermission('students.manage'), (req, res) => {
  const prev = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Student not found' });
  const fields = ['class_id', 'date_of_birth', 'gender', 'address', 'medical_notes',
                  'emergency_contact_name', 'emergency_contact_phone', 'status'];
  const set = fields.filter((f) => f in (req.body ?? {}));
  if (set.length) {
    db.prepare(`UPDATE students SET ${set.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`)
      .run(...set.map((f) => req.body[f]), req.params.id);
  }
  const nameFields = ['first_name', 'last_name', 'phone', 'email'];
  const nset = nameFields.filter((f) => f in (req.body ?? {}));

  // An address is an identity here, so a clash is a refusal rather than a
  // constraint error surfacing as a server fault.
  if (nset.includes('email')) {
    const taken = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?')
      .get(String(req.body.email ?? '').trim(), prev.user_id);
    if (taken) return res.status(409).json({ error: 'Somebody already has that email' });
  }

  if (nset.length) {
    db.prepare(`UPDATE users SET ${nset.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`)
      .run(...nset.map((f) => req.body[f]), prev.user_id);
  }
  audit({ user: req.user, action: 'update', entity: 'students', entityId: prev.id, prev, next: req.body, ip: req.ip });
  res.json(db.prepare('SELECT * FROM students WHERE id = ?').get(prev.id));
});

/**
 * Issue a sign-in code for a pupil. Returned once, in full, to be printed or
 * read out; only a hash is kept, so it cannot be looked up again afterwards.
 */
r.post('/students/:id/access-code', requireRole('admin', 'teacher'), (req, res) => {
  if (!canAccessStudent(req, req.params.id)) {
    return res.status(403).json({ error: 'You do not teach this pupil' });
  }
  const student = db.prepare(
    'SELECT s.id, s.student_code, u.id AS user_id, u.first_name, u.last_name FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = ?'
  ).get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const issued = issueCode(student.user_id, req.user.id, Number(req.body?.hours) || 72);
  audit({ user: req.user, action: 'access_code_issue', entity: 'users', entityId: student.user_id,
          next: { student_code: student.student_code, expires_at: issued.expires_at }, ip: req.ip });

  res.status(201).json({
    student: `${student.first_name} ${student.last_name}`,
    student_code: student.student_code,
    ...issued,
  });
});

/** Whether a pupil already has a code outstanding, without revealing it. */
r.get('/students/:id/access-code', requireRole('admin', 'teacher'), (req, res) => {
  if (!canAccessStudent(req, req.params.id)) return res.status(403).json({ error: 'Not permitted' });
  const student = db.prepare('SELECT user_id FROM students WHERE id = ?').get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json(activeCodeFor(student.user_id));
});

/* ── Staff ────────────────────────────────────────────────────────────────── */
r.get('/staff', requireRole('admin', 'teacher'), (_req, res) => {
  res.json(db.prepare(
    `SELECT st.id, st.staff_code, st.title, st.department, st.hired_on, st.qualifications,
            u.id AS user_id, u.first_name, u.last_name, u.email, u.phone, u.avatar_colour, u.avatar_url, u.avatar_emoji, u.role, u.is_senco, u.is_super_admin,
            (SELECT COUNT(*) FROM class_subjects cs WHERE cs.teacher_id = u.id) AS class_count
     FROM staff st JOIN users u ON u.id = st.user_id ORDER BY u.first_name`
  ).all().map((person) => ({
    ...person,
    subjects: db.prepare(
      `SELECT sub.id, sub.name FROM subject_teachers t JOIN subjects sub ON sub.id = t.subject_id
       WHERE t.user_id = ? ORDER BY sub.name`
    ).all(person.user_id),
    sections: db.prepare(
      `SELECT sec.key, sec.name FROM section_teachers t JOIN sections sec ON sec.key = t.section
       WHERE t.user_id = ? ORDER BY sec.sort_order, sec.id`
    ).all(person.user_id),
  })));
});

/**
 * Changing what the school holds about a member of staff.
 *
 * Their record and their account are two tables and one person, so a single
 * form writes both. The one thing that is refused is the school losing its last
 * administrator: a demotion that leaves nobody able to grant access locks
 * everybody out of their own school, and it is a quiet mistake to make from a
 * dropdown.
 */
/**
 * What a member of staff teaches, and the part of the school they belong to.
 *
 * The same two facts the Subjects and Sections pages collect, written from the
 * person's own record because that is where a school usually knows them: this
 * is Mrs Bello, she teaches Mathematics in the Secondary. Recording them here
 * fills in the classes that have the subject but nobody against it, exactly as
 * it would from the other end.
 */
function staffTeaching(userId, { subjectIds, sectionKeys, department }) {
  let filled = { assigned: 0, ambiguous: 0 };

  if (Array.isArray(subjectIds)) {
    const wanted = [...new Set(subjectIds.map(Number).filter(Boolean))];
    db.prepare('DELETE FROM subject_teachers WHERE user_id = ?').run(userId);
    const add = db.prepare('INSERT OR IGNORE INTO subject_teachers (subject_id, user_id) VALUES (?, ?)');
    for (const id of wanted) {
      if (db.prepare('SELECT 1 FROM subjects WHERE id = ? AND is_break = 0').get(id)) add.run(id, userId);
    }
  }

  // Where they work, which is what settles a subject several people teach. A
  // teacher is rarely confined to one year: primary staff cover several, and a
  // specialist may take the same subject right up the school, so this is a list.
  if (Array.isArray(sectionKeys)) {
    db.prepare('DELETE FROM section_teachers WHERE user_id = ?').run(userId);
    const add = db.prepare('INSERT OR IGNORE INTO section_teachers (section, user_id) VALUES (?, ?)');
    for (const key of [...new Set(sectionKeys.map(String))]) {
      if (db.prepare('SELECT 1 FROM sections WHERE key = ?').get(key)) add.run(key, userId);
    }
  } else if (department) {
    // A file that names a department in the school's own words still lands.
    const section = db.prepare('SELECT key FROM sections WHERE lower(name) = lower(?)').get(department);
    if (section) {
      db.prepare('INSERT OR IGNORE INTO section_teachers (section, user_id) VALUES (?, ?)')
        .run(section.key, userId);
    }
  }

  for (const row of db.prepare('SELECT subject_id FROM subject_teachers WHERE user_id = ?').all(userId)) {
    const out = fillTeachers({ subjectId: row.subject_id });
    filled = { assigned: filled.assigned + out.assigned, ambiguous: filled.ambiguous + out.ambiguous };
  }
  return filled;
}

r.patch('/staff/:id', requirePermission('staff.manage'), (req, res) => {
  const prev = db.prepare(
    `SELECT st.*, u.id AS user_id, u.first_name, u.last_name, u.email, u.phone, u.role,
            u.is_senco, u.is_super_admin
     FROM staff st JOIN users u ON u.id = st.user_id WHERE st.id = ?`
  ).get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Staff member not found' });

  const b = req.body ?? {};
  const email = b.email?.trim().toLowerCase();
  if (email && email !== prev.email.toLowerCase()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'That email does not look right' });
    }
    if (db.prepare('SELECT 1 FROM users WHERE lower(email) = ? AND id != ?').get(email, prev.user_id)) {
      return res.status(409).json({ error: 'Somebody already has that email' });
    }
  }

  const role = b.role === 'admin' ? 'admin' : b.role === 'teacher' ? 'teacher' : prev.role;

  // Administration is granted by somebody who already holds the school, never
  // by an administrator appointing their own equals: an office account that can
  // make administrators can lock the owner out of their own school.
  const grantingAdmin = role === 'admin' && prev.role !== 'admin';
  const changingRank = 'is_super_admin' in b && !!b.is_super_admin !== !!prev.is_super_admin;
  if ((grantingAdmin || changingRank || prev.is_super_admin) && !isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Only a super administrator can change who administers the school' });
  }

  if (prev.is_super_admin && ('is_super_admin' in b ? !b.is_super_admin : false) || (prev.is_super_admin && role !== 'admin')) {
    const others = db.prepare(
      "SELECT COUNT(*) n FROM users WHERE role = 'admin' AND is_super_admin = 1 AND is_active = 1 AND id != ?"
    ).get(prev.user_id).n;
    if (!others) {
      return res.status(409).json({
        error: 'This is the only super administrator. Give somebody else that rank first.',
      });
    }
  }

  if (prev.role === 'admin' && role !== 'admin') {
    const others = db.prepare(
      "SELECT COUNT(*) n FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?"
    ).get(prev.user_id).n;
    if (!others) {
      return res.status(409).json({
        error: 'This is the only administrator. Make somebody else an administrator first.',
      });
    }
  }

  const staffCode = b.staff_code?.trim();
  if (staffCode && staffCode !== prev.staff_code
      && db.prepare('SELECT 1 FROM staff WHERE lower(staff_code) = lower(?) AND id != ?').get(staffCode, prev.id)) {
    return res.status(409).json({ error: `Staff number ${staffCode} is already in use` });
  }

  const text = (key) => (key in b ? (String(b[key]).trim() || null) : prev[key]);

  db.transaction(() => {
    db.prepare(
      `UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ?, role = ?, is_senco = ?,
              is_super_admin = ?
       WHERE id = ?`
    ).run(text('first_name') ?? prev.first_name, text('last_name') ?? prev.last_name,
          email || prev.email, text('phone'), role,
          'is_senco' in b ? (b.is_senco ? 1 : 0) : prev.is_senco,
          // The rank goes with being an administrator at all.
          role === 'admin' && ('is_super_admin' in b ? (b.is_super_admin ? 1 : 0) : prev.is_super_admin) ? 1 : 0,
          prev.user_id);

    db.prepare(
      'UPDATE staff SET staff_code = ?, title = ?, department = ?, qualifications = ?, hired_on = ? WHERE id = ?'
    ).run(staffCode || prev.staff_code, text('title'), text('department'), text('qualifications'),
          text('hired_on') ?? prev.hired_on, prev.id);
  })();

  const filled = staffTeaching(prev.user_id, {
    subjectIds: b.subject_ids,
    sectionKeys: b.section_keys,
    department: 'department' in b ? text('department') : prev.department,
  });

  audit({ user: req.user, action: 'update', entity: 'staff', entityId: prev.id, prev, next: b, ip: req.ip });

  res.json({ ...filled, ...db.prepare(
    `SELECT st.*, u.id AS user_id, u.first_name, u.last_name, u.email, u.phone, u.role,
            u.is_senco, u.is_super_admin
     FROM staff st JOIN users u ON u.id = st.user_id WHERE st.id = ?`
  ).get(prev.id) });
});

r.post('/staff', requirePermission('staff.manage'), (req, res) => {
  const b = req.body ?? {};
  if (!b.first_name || !b.last_name || !b.email) return res.status(400).json({ error: 'Name and email are required' });
  if ((b.role === 'admin' || b.is_super_admin) && !isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Only a super administrator can add an administrator' });
  }
  try {
    const id = db.transaction(() => {
      const u = db.prepare(
        `INSERT INTO users (role, email, password_hash, first_name, last_name, phone, is_senco, is_super_admin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(b.role === 'admin' ? 'admin' : 'teacher', b.email, unusablePassword(),
            b.first_name, b.last_name, b.phone ?? null, b.is_senco ? 1 : 0,
            b.role === 'admin' && b.is_super_admin ? 1 : 0);
      const s = db.prepare(
        'INSERT INTO staff (user_id, staff_code, title, department, qualifications) VALUES (?, ?, ?, ?, ?)'
      ).run(u.lastInsertRowid, b.staff_code || `STF-${100 + u.lastInsertRowid}`, b.title ?? null,
            b.department ?? null, b.qualifications ?? null);
      // Somebody added with a subject against them is teaching it from the
      // moment they arrive, so their classes are filled in with everyone else's.
      staffTeaching(u.lastInsertRowid, {
        subjectIds: b.subject_ids, sectionKeys: b.section_keys, department: b.department,
      });
      return s.lastInsertRowid;
    })();
    audit({ user: req.user, action: 'create', entity: 'staff', entityId: id, next: b, ip: req.ip });

    // They cannot sign in yet. Hand the administrator a link to send them, so
    // the person chooses their own password and nobody else ever knows it.
    const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(id);
    const invite = db.prepare(
      `INSERT INTO account_invites (user_id, email, role, first_name, last_name, token_hash, token_hint, invited_by, expires_at)
       VALUES (?, ?, ?, ?, ?, '', '', ?, datetime('now'))`
    ).run(staff.user_id, b.email, b.role === 'admin' ? 'admin' : 'teacher',
          b.first_name, b.last_name, req.user.id);
    const issued = issueToken(invite.lastInsertRowid);
    res.status(201).json({ ...staff, activation_link: inviteLink(issued.token, req), activation_expires_at: issued.expires_at });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'That email or staff code already exists' });
    throw e;
  }
});

/* ── Laying out a whole school's classes at once ──────────────────────────── */

export const CLASS_IMPORT_COLUMNS = [
  'section', 'classroom', 'name', 'homeroom_teacher_email', 'subjects',
];

/**
 * Checks one class row against the school as it stands.
 *
 * A section has to exist already: sections are the school's own shape and are
 * not invented from a spreadsheet. Subjects are matched by name and attached
 * where they are found; anything unrecognised is reported rather than created,
 * so a typo never quietly adds a subject nobody teaches.
 */
function checkClassRow(row, line, seen) {
  const value = (k) => (row[k] == null ? '' : String(row[k]).trim());
  const out = {
    line,
    section_name: value('section'),
    room: value('classroom'),
    name: value('name'),
    teacher_email: value('homeroom_teacher_email').toLowerCase(),
    subject_names: value('subjects').split(/[;,]/).map((x) => x.trim()).filter(Boolean),
    subject_ids: [],
    errors: [],
    warnings: [],
  };

  const section = out.section_name && db.prepare(
    'SELECT * FROM sections WHERE lower(name) = lower(?) OR key = ?'
  ).get(out.section_name, out.section_name);

  if (!out.section_name) out.errors.push('A section is needed');
  else if (!section) out.errors.push(`No section called "${out.section_name}"`);
  else {
    out.section = section.key;
    out.section_label = section.name;
    out.name = out.name || section.name;
  }

  if (!out.room && !out.name) out.errors.push('A classroom or a name is needed');

  if (section) {
    const clash = db.prepare(
      `SELECT 1 FROM classes WHERE section = ? AND lower(name) = lower(?)
       AND COALESCE(lower(room), '') = COALESCE(lower(?), '')`
    ).get(section.key, out.name, out.room || null);
    const key = `${section.key}|${out.name.toLowerCase()}|${out.room.toLowerCase()}`;
    if (clash) out.errors.push(`${out.name}${out.room ? ` in ${out.room}` : ''} already exists`);
    else if (seen.has(key)) out.errors.push('That class appears twice in this file');
    seen.add(key);
  }

  if (out.teacher_email) {
    const teacher = db.prepare(
      "SELECT id, first_name, last_name, role FROM users WHERE lower(email) = lower(?)"
    ).get(out.teacher_email);
    if (!teacher) out.warnings.push(`No staff account for ${out.teacher_email}, so no homeroom teacher`);
    else if (!['teacher', 'admin'].includes(teacher.role)) {
      out.warnings.push(`${out.teacher_email} is a ${teacher.role}, so no homeroom teacher`);
    } else {
      out.teacher_id = teacher.id;
      out.teacher_name = `${teacher.first_name} ${teacher.last_name}`;
    }
  }

  for (const name of out.subject_names) {
    const subject = db.prepare('SELECT id, name FROM subjects WHERE lower(name) = lower(?)').get(name);
    if (!subject) out.warnings.push(`No subject called "${name}"`);
    else out.subject_ids.push(subject.id);
  }

  out.status = out.errors.length ? 'error' : 'ready';
  return out;
}

r.post('/classes/import', requirePermission('curriculum.manage'), (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows) return res.status(400).json({ error: 'Send the rows to import' });
  if (rows.length > 500) return res.status(400).json({ error: 'Import at most 500 classes at a time' });

  const seen = new Set();
  const checked = rows.map((row, i) => checkClassRow(row, i + 1, seen));
  const ready = checked.filter((r) => r.status === 'ready');
  const failed = checked.filter((r) => r.status === 'error');

  const summary = {
    total: checked.length,
    ready: ready.length,
    errors: failed.length,
    sections: new Set(ready.map((r) => r.section)).size,
    with_teacher: ready.filter((r) => r.teacher_id).length,
    subject_links: ready.reduce((n, r) => n + r.subject_ids.length, 0),
  };

  if (req.body?.dry_run) return res.json({ rows: checked, summary, committed: false });
  if (failed.length && !req.body?.allow_partial) {
    return res.status(400).json({
      error: `${failed.length} row${failed.length === 1 ? '' : 's'} need fixing before this can be imported.`,
      rows: checked, summary, committed: false,
    });
  }
  if (!ready.length) return res.status(400).json({ error: 'There is nothing to import', rows: checked, summary });

  const year = db.prepare('SELECT academic_year FROM school_settings WHERE id = 1').get()?.academic_year;

  const created = db.transaction(() => ready.map((row) => {
    const made = db.prepare(
      `INSERT INTO classes (name, section, level, academic_year, homeroom_teacher_id, room)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(row.name, row.section, levelFor(row.section, row.name, null),
          year ?? '2026/2027', row.teacher_id ?? null, row.room || null);

    for (const subjectId of row.subject_ids) {
      db.prepare('INSERT OR IGNORE INTO class_subjects (class_id, subject_id, teacher_id) VALUES (?, ?, ?)')
        .run(made.lastInsertRowid, subjectId, row.teacher_id ?? null);
    }

    return { line: row.line, id: made.lastInsertRowid, name: row.name, room: row.room || null,
             section: row.section_label, subjects: row.subject_ids.length };
  }))();

  audit({ user: req.user, action: 'import', entity: 'classes', entityId: 'bulk',
          next: { ...summary, imported: created.length }, ip: req.ip });

  res.status(201).json({ rows: checked, summary: { ...summary, imported: created.length }, created, committed: true });
});

/* ── Taking on a whole staff list at once ─────────────────────────────────── */

export const STAFF_IMPORT_COLUMNS = [
  'first_name', 'last_name', 'email', 'phone', 'role', 'title', 'department',
  'qualifications', 'staff_code', 'is_senco',
];

const truthy = (v) => ['1', 'true', 'yes', 'y'].includes(String(v ?? '').trim().toLowerCase());

/**
 * Checks one staff row. Unlike a pupil, a member of staff must have an email:
 * it is how they are invited, and how they sign in afterwards.
 */
function checkStaffRow(row, line, seen) {
  const value = (k) => (row[k] == null ? '' : String(row[k]).trim());
  const out = {
    line,
    first_name: value('first_name'),
    last_name: value('last_name'),
    email: value('email').toLowerCase(),
    phone: value('phone'),
    role: value('role').toLowerCase() === 'admin' ? 'admin' : 'teacher',
    title: value('title'),
    department: value('department'),
    qualifications: value('qualifications'),
    staff_code: value('staff_code'),
    is_senco: truthy(row.is_senco),
    errors: [],
    warnings: [],
  };

  if (!out.first_name || !out.last_name) out.errors.push('A first and last name are needed');

  if (!out.email) out.errors.push('An email is needed: it is how they are invited to sign in');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) out.errors.push('That email does not look right');
  else if (db.prepare('SELECT 1 FROM users WHERE lower(email) = lower(?)').get(out.email)) {
    out.errors.push('Somebody already has that email');
  } else if (seen.emails.has(out.email)) out.errors.push('That email appears twice in this file');
  seen.emails.add(out.email);

  if (out.staff_code) {
    if (db.prepare('SELECT 1 FROM staff WHERE lower(staff_code) = lower(?)').get(out.staff_code)) {
      out.errors.push(`Staff number ${out.staff_code} is already in use`);
    } else if (seen.codes.has(out.staff_code.toLowerCase())) {
      out.errors.push('That staff number appears twice in this file');
    }
    seen.codes.add(out.staff_code.toLowerCase());
  }

  if (value('role') && !['teacher', 'admin'].includes(value('role').toLowerCase())) {
    out.warnings.push(`"${value('role')}" is not a role here, so they come in as a teacher`);
  }
  if (!out.title) out.warnings.push('No job title');

  out.status = out.errors.length ? 'error' : 'ready';
  return out;
}

/**
 * Takes on a list of staff in one go.
 *
 * Each account is created with an unguessable password and a one-time link for
 * the person to set their own, exactly as inviting them one at a time does.
 * The links come back once, for the office to send on.
 */
r.post('/staff/import', requirePermission('staff.manage'), (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows) return res.status(400).json({ error: 'Send the rows to import' });
  if (rows.length > 500) return res.status(400).json({ error: 'Import at most 500 people at a time' });

  const seen = { emails: new Set(), codes: new Set() };
  const checked = rows.map((row, i) => checkStaffRow(row, i + 1, seen));
  const ready = checked.filter((r) => r.status === 'ready');
  const failed = checked.filter((r) => r.status === 'error');

  const summary = {
    total: checked.length,
    ready: ready.length,
    errors: failed.length,
    teachers: ready.filter((r) => r.role === 'teacher').length,
    administrators: ready.filter((r) => r.role === 'admin').length,
  };

  if (req.body?.dry_run) return res.json({ rows: checked, summary, committed: false });
  if (failed.length && !req.body?.allow_partial) {
    return res.status(400).json({
      error: `${failed.length} row${failed.length === 1 ? '' : 's'} need fixing before this can be imported.`,
      rows: checked, summary, committed: false,
    });
  }
  if (!ready.length) return res.status(400).json({ error: 'There is nothing to import', rows: checked, summary });

  const addUser = db.prepare(
    `INSERT INTO users (role, email, password_hash, first_name, last_name, phone, is_senco)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const addStaff = db.prepare(
    'INSERT INTO staff (user_id, staff_code, title, department, qualifications) VALUES (?, ?, ?, ?, ?)'
  );
  const addInvite = db.prepare(
    `INSERT INTO account_invites (user_id, email, role, first_name, last_name, token_hash, token_hint, invited_by, expires_at)
     VALUES (?, ?, ?, ?, ?, '', '', ?, datetime('now'))`
  );

  const created = db.transaction(() => ready.map((row) => {
    const user = addUser.run(row.role, row.email, unusablePassword(), row.first_name, row.last_name,
                             row.phone || null, row.is_senco ? 1 : 0);
    const code = row.staff_code || `STF-${100 + Number(user.lastInsertRowid)}`;
    addStaff.run(user.lastInsertRowid, code, row.title || null, row.department || null, row.qualifications || null);

    const invite = addInvite.run(user.lastInsertRowid, row.email, row.role, row.first_name, row.last_name, req.user.id);
    return { user_id: user.lastInsertRowid, invite_id: invite.lastInsertRowid, staff_code: code, row };
  }))();

  // Tokens are issued outside the write, so a failure cannot leave half a list
  // holding links that were never recorded.
  const links = created.map(({ row, invite_id, user_id, staff_code }) => {
    const issued = issueToken(invite_id, 7);
    return {
      line: row.line, user_id, staff_code, name: `${row.first_name} ${row.last_name}`,
      email: row.email, role: row.role,
      activation_link: inviteLink(issued.token, req), expires_at: issued.expires_at,
    };
  });

  audit({ user: req.user, action: 'import', entity: 'staff', entityId: 'bulk',
          next: { ...summary, imported: links.length }, ip: req.ip });

  res.status(201).json({ rows: checked, summary: { ...summary, imported: links.length }, created: links, committed: true });
});

/**
 * Puts pupils into a class, or takes them out of one.
 *
 * A pupil belongs to exactly one class, so adding them here moves them: the
 * class they came from is reported back, since a register changing under a
 * teacher without warning is how children go missing from one.
 */
r.post('/classes/:id/students', requirePermission('students.manage'), (req, res) => {
  const klass = db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.id);
  if (!klass) return res.status(404).json({ error: 'Class not found' });

  const ids = [...new Set((req.body?.student_ids ?? []).map(Number).filter(Boolean))];
  if (!ids.length) return res.status(400).json({ error: 'Choose at least one pupil' });

  const moved = [];
  db.transaction(() => {
    for (const id of ids) {
      const student = db.prepare(
        `SELECT s.id, s.class_id, u.first_name, u.last_name, c.name AS class_name
         FROM students s JOIN users u ON u.id = s.user_id
         LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`
      ).get(id);
      if (!student || student.class_id === klass.id) continue;

      db.prepare('UPDATE students SET class_id = ? WHERE id = ?').run(klass.id, id);
      moved.push({
        id, name: `${student.first_name} ${student.last_name}`, from: student.class_name ?? null,
      });
    }
  })();

  audit({ user: req.user, action: 'update', entity: 'classes', entityId: klass.id,
          next: { added: moved.length, to: klass.name }, ip: req.ip });

  res.json({
    added: moved.length,
    moved: moved.filter((m) => m.from),
    roster: db.prepare("SELECT COUNT(*) n FROM students WHERE class_id = ? AND status = 'active'").get(klass.id).n,
  });
});

/** Takes a pupil out of a class, leaving them enrolled but unplaced. */
r.delete('/classes/:id/students/:studentId', requirePermission('students.manage'), (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id = ? AND class_id = ?')
    .get(req.params.studentId, req.params.id);
  if (!student) return res.status(404).json({ error: 'That pupil is not in this class' });

  db.prepare('UPDATE students SET class_id = NULL WHERE id = ?').run(student.id);
  audit({ user: req.user, action: 'update', entity: 'students', entityId: student.id,
          prev: { class_id: student.class_id }, next: { class_id: null }, ip: req.ip });
  res.json({ ok: true });
});

/* ── The school's own divisions ───────────────────────────────────────────── */

/** Every phase the school teaches in, in the order it thinks of them. */
r.get('/sections', (req, res) => {
  res.json(db.prepare(
    `SELECT s.*,
            (SELECT COUNT(*) FROM classes c WHERE c.section = s.key) AS class_count,
            -- A subject is taught in as many sections as the school says, so the
            -- count reads the list it keeps rather than the one column a subject
            -- started life with: Maths taught across the school was showing
            -- against a single section.
            (SELECT COUNT(*) FROM subjects sub
              WHERE sub.section = s.key
                 OR EXISTS (SELECT 1 FROM subject_sections ss
                            WHERE ss.subject_id = sub.id AND ss.section = s.key)) AS subject_count,
            (SELECT COUNT(*) FROM students st JOIN classes c2 ON c2.id = st.class_id
             WHERE c2.section = s.key AND st.status = 'active') AS student_count
     FROM sections s
     ${req.query.all === '1' ? '' : 'WHERE s.is_active = 1'}
     ORDER BY s.sort_order, s.id`
  ).all().map((sec) => ({ ...sec, teachers: sectionTeachers.all(sec.key) })));
});

/** A handle that survives renaming: "Junior Secondary" becomes junior_secondary. */
const sectionKey = (name) =>
  String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32);

r.post('/sections', requirePermission('curriculum.manage'), (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'Give the section a name' });

  const base = sectionKey(name) || 'section';
  let key = base;
  for (let n = 2; db.prepare('SELECT 1 FROM sections WHERE key = ?').get(key); n += 1) key = `${base}_${n}`;

  const last = db.prepare('SELECT COALESCE(MAX(sort_order), 0) n FROM sections').get().n;
  const out = db.prepare('INSERT INTO sections (key, name, sort_order) VALUES (?, ?, ?)')
    .run(key, name, Number(req.body?.sort_order) || last + 10);

  audit({ user: req.user, action: 'create', entity: 'sections', entityId: out.lastInsertRowid,
          next: { key, name }, ip: req.ip });
  res.status(201).json(db.prepare('SELECT * FROM sections WHERE id = ?').get(out.lastInsertRowid));
});

/** Renaming is safe at any time: classes and subjects hold the key, not the name. */
r.patch('/sections/:id', requirePermission('curriculum.manage'), (req, res) => {
  const prev = db.prepare('SELECT * FROM sections WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Section not found' });

  const fields = ['name', 'sort_order', 'is_active'].filter((f) => f in (req.body ?? {}));
  if (fields.includes('is_active') && !req.body.is_active) {
    const inUse = db.prepare('SELECT COUNT(*) n FROM classes WHERE section = ?').get(prev.key).n;
    if (inUse) return res.status(409).json({ error: `${prev.name} still has ${inUse} class${inUse === 1 ? '' : 'es'} in it` });
  }
  if (fields.length) {
    db.prepare(`UPDATE sections SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`)
      .run(...fields.map((f) => req.body[f]), prev.id);
    audit({ user: req.user, action: 'update', entity: 'sections', entityId: prev.id, prev, next: req.body, ip: req.ip });
  }
  res.json(db.prepare('SELECT * FROM sections WHERE id = ?').get(prev.id));
});

/**
 * Copies a whole section: its classes, what they are taught, and when.
 *
 * A school that runs Nursery 2 with three classrooms usually runs Nursery 3
 * the same way, so the shape is worth copying rather than rebuilding. Pupils
 * are never copied, and a teacher who would end up in two rooms at once is
 * left off the copy rather than double-booked.
 */
r.post('/sections/:id/duplicate', requirePermission('curriculum.manage'), (req, res) => {
  const source = db.prepare('SELECT * FROM sections WHERE id = ?').get(req.params.id);
  if (!source) return res.status(404).json({ error: 'Section not found' });

  const name = String(req.body?.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'Give the new section a name' });
  if (db.prepare('SELECT 1 FROM sections WHERE lower(name) = lower(?)').get(name)) {
    return res.status(409).json({ error: `${name} already exists` });
  }

  const withClasses = req.body?.with_classes !== false;
  const withSubjects = req.body?.with_subjects !== false;
  const withTimetable = req.body?.with_timetable !== false;
  const needsTeacher = new Set();

  const base = sectionKey(name) || 'section';
  let key = base;
  for (let n = 2; db.prepare('SELECT 1 FROM sections WHERE key = ?').get(key); n += 1) key = `${base}_${n}`;

  const made = db.transaction(() => {
    const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) n FROM sections').get().n + 10;
    const section = db.prepare('INSERT INTO sections (key, name, sort_order) VALUES (?, ?, ?)')
      .run(key, name, Number(req.body?.sort_order) || order);

    // The subjects taught in the old section are offered in the new one too.
    let subjects = 0;
    for (const row of db.prepare('SELECT subject_id FROM subject_sections WHERE section = ?').all(source.key)) {
      db.prepare('INSERT OR IGNORE INTO subject_sections (subject_id, section) VALUES (?, ?)')
        .run(row.subject_id, key);
      subjects += 1;
    }

    let classes = 0;
    let lessons = 0;
    if (withClasses) {
      for (const klass of db.prepare('SELECT * FROM classes WHERE section = ?').all(source.key)) {
        // Classes carry their section's name, so the copies take the new one.
        const copyName = klass.name === source.name ? name : klass.name;
        const exists = db.prepare(
          `SELECT 1 FROM classes WHERE section = ? AND lower(name) = lower(?)
           AND COALESCE(lower(room), '') = COALESCE(lower(?), '')`
        ).get(key, copyName, klass.room);
        if (exists) continue;

        const copy = db.prepare(
          `INSERT INTO classes (name, year_label, stream, section, level, academic_year, room)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(copyName, klass.year_label, klass.stream, key, klass.level, klass.academic_year, klass.room);
        classes += 1;

        if (!withSubjects) continue;
        for (const pair of db.prepare('SELECT * FROM class_subjects WHERE class_id = ?').all(klass.id)) {
          const slots = withTimetable
            ? db.prepare('SELECT * FROM timetable_slots WHERE class_subject_id = ?').all(pair.id)
            : [];

          const clashes = pair.teacher_id && slots.some((slot) => db.prepare(
            `SELECT 1 FROM timetable_slots ts JOIN class_subjects cs ON cs.id = ts.class_subject_id
             WHERE cs.teacher_id = ? AND ts.day_of_week = ? AND ts.period = ?`
          ).get(pair.teacher_id, slot.day_of_week, slot.period));

          if (clashes) {
            needsTeacher.add(db.prepare('SELECT name FROM subjects WHERE id = ?').get(pair.subject_id)?.name);
          }

          const newPair = db.prepare('INSERT INTO class_subjects (class_id, subject_id, teacher_id) VALUES (?, ?, ?)')
            .run(copy.lastInsertRowid, pair.subject_id, clashes ? null : pair.teacher_id);

          for (const slot of slots) {
            db.prepare(
              `INSERT INTO timetable_slots (class_subject_id, day_of_week, period, start_time, end_time, room)
               VALUES (?, ?, ?, ?, ?, ?)`
            ).run(newPair.lastInsertRowid, slot.day_of_week, slot.period, slot.start_time, slot.end_time, slot.room);
            lessons += 1;
          }
        }
      }
    }

    return { id: section.lastInsertRowid, subjects, classes, lessons };
  })();

  audit({ user: req.user, action: 'duplicate', entity: 'sections', entityId: made.id,
          prev: { from: source.name }, next: { name, ...made }, ip: req.ip });

  res.status(201).json({
    ...db.prepare('SELECT * FROM sections WHERE id = ?').get(made.id),
    copied: { classes: made.classes, subjects: made.subjects, lessons: made.lessons },
    needs_teacher: [...needsTeacher].filter(Boolean),
  });
});

r.delete('/sections/:id', requirePermission('curriculum.manage'), (req, res) => {
  const prev = db.prepare('SELECT * FROM sections WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Section not found' });

  const attached = {
    classes: db.prepare('SELECT COUNT(*) n FROM classes WHERE section = ?').get(prev.key).n,
    subjects: db.prepare('SELECT COUNT(*) n FROM subjects WHERE section = ?').get(prev.key).n,
  };
  if (attached.classes || attached.subjects) {
    return res.status(409).json({
      error: `${prev.name} still holds ${attached.classes} class${attached.classes === 1 ? '' : 'es'} and ${attached.subjects} subject${attached.subjects === 1 ? '' : 's'}. Move them first.`,
      attached,
    });
  }
  if (db.prepare('SELECT COUNT(*) n FROM sections').get().n <= 1) {
    return res.status(409).json({ error: 'A school needs at least one section' });
  }

  db.prepare('DELETE FROM sections WHERE id = ?').run(prev.id);
  audit({ user: req.user, action: 'delete', entity: 'sections', entityId: prev.id, prev, ip: req.ip });
  res.json({ ok: true });
});

/* ── Classes & subjects ───────────────────────────────────────────────────── */
r.get('/classes', (req, res) => {
  const scope = req.user.role === 'teacher' ? teacherClassIds(req.user.id) : null;
  if (scope && !scope.length) return res.json([]);

  res.json(db.prepare(
    `SELECT c.*, u.first_name || ' ' || u.last_name AS homeroom_teacher,
            (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status='active') AS student_count
     FROM classes c LEFT JOIN users u ON u.id = c.homeroom_teacher_id
     ${scope ? `WHERE c.id IN (${scope.map(() => '?').join(',')})` : ''}
     -- Section, then year, then the order the arms were created in, which is
     -- the order the office wrote them down.
     ORDER BY CASE c.section WHEN 'nursery' THEN 1 WHEN 'primary' THEN 2 ELSE 3 END,
              c.level, c.id`
  ).all(...(scope ?? [])));
});

/**
 * Copies a class into a new one beside it.
 *
 * What makes a class is mostly its setup, not its pupils: which subjects it
 * takes, who teaches them, and when they meet. Those come across; the pupils do
 * not, because the point of a copy is somewhere to put different ones.
 *
 * The teacher is the one thing that often cannot come with it. A parallel arm
 * meets at the same times, so the same teacher would be in two rooms at once:
 * where that happens the lessons are still copied and the subject arrives
 * without a teacher, which is the decision the school has to make anyway.
 */
r.post('/classes/:id/duplicate', requirePermission('curriculum.manage'), (req, res) => {
  const source = db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.id);
  if (!source) return res.status(404).json({ error: 'Class not found' });

  const b = req.body ?? {};

  // A copy usually joins the same part of the school, but a year that repeats
  // its shape further up is exactly what duplication is for.
  const section = b.section && b.section !== source.section ? String(b.section) : source.section;
  if (!db.prepare('SELECT 1 FROM sections WHERE key = ?').get(section)) {
    return res.status(400).json({ error: 'Choose one of your school\'s sections' });
  }

  // A copy is the same class in another room: it keeps the name unless one is
  // given, and the room is what tells the two apart.
  const stream = String(b.stream ?? '').trim() || null;
  const room = b.room === undefined ? source.room : (String(b.room ?? '').trim() || null);
  const name = String(b.name ?? '').trim()
    || (stream ? `${source.year_label ?? source.name} ${stream}`.trim() : source.name);

  // Same name and same room would be two of the same class; a different room
  // makes it a different class, which is the whole point of copying it.
  const clash = db.prepare(
    `SELECT 1 FROM classes WHERE lower(name) = lower(?) AND section = ?
     AND COALESCE(lower(room), '') = COALESCE(lower(?), '')`
  ).get(name, section, room);
  if (clash) {
    return res.status(409).json({
      error: room ? `${name} in room ${room} already exists` : `${name} already exists in that section`,
    });
  }

  const withSubjects = b.with_subjects !== false;
  const withTimetable = b.with_timetable !== false;
  const needsTeacher = [];

  const copy = db.transaction(() => {
    const made = db.prepare(
      `INSERT INTO classes (name, year_label, stream, section, level, academic_year, homeroom_teacher_id, room)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(name, source.year_label, stream, section, levelFor(section, name, null), source.academic_year,
          b.homeroom_teacher_id ?? null, room);

    if (!withSubjects) return { id: made.lastInsertRowid, subjects: 0, lessons: 0 };

    // Breaks come across with the week, but they are not subjects and are not
    // counted as any: a copy reporting "4 subjects" for three taught ones reads
    // as a mistake to whoever is checking the new class.
    const pairs = db.prepare(
      `SELECT cs.*, sub.name AS subject, sub.is_break FROM class_subjects cs
       JOIN subjects sub ON sub.id = cs.subject_id WHERE cs.class_id = ?`
    ).all(source.id);
    let lessons = 0;

    for (const pair of pairs) {
      const slots = withTimetable
        ? db.prepare('SELECT * FROM timetable_slots WHERE class_subject_id = ?').all(pair.id)
        : [];

      // Would this teacher already be somewhere else at any of these times?
      const clashes = pair.teacher_id && slots.some((slot) => db.prepare(
        `SELECT 1 FROM timetable_slots ts JOIN class_subjects cs ON cs.id = ts.class_subject_id
         WHERE cs.teacher_id = ? AND ts.day_of_week = ? AND ts.period = ?`
      ).get(pair.teacher_id, slot.day_of_week, slot.period));

      if (clashes) needsTeacher.push(pair.subject);

      const newPair = db.prepare('INSERT INTO class_subjects (class_id, subject_id, teacher_id) VALUES (?, ?, ?)')
        .run(made.lastInsertRowid, pair.subject_id, clashes ? null : pair.teacher_id);

      for (const slot of slots) {
        db.prepare(
          `INSERT INTO timetable_slots (class_subject_id, day_of_week, period, start_time, end_time, room)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(newPair.lastInsertRowid, slot.day_of_week, slot.period, slot.start_time, slot.end_time,
              b.room ?? slot.room);
        lessons += 1;
      }
    }
    return { id: made.lastInsertRowid, subjects: pairs.filter((p) => !p.is_break).length, lessons };
  })();

  audit({ user: req.user, action: 'duplicate', entity: 'classes', entityId: copy.id,
          prev: { from: source.name }, next: { name, ...copy, needs_teacher: needsTeacher }, ip: req.ip });

  res.status(201).json({
    ...db.prepare('SELECT * FROM classes WHERE id = ?').get(copy.id),
    copied: { subjects: copy.subjects, lessons: copy.lessons },
    needs_teacher: needsTeacher,
  });
});

/**
 * Removes a class. Pupils are the hard stop: a child cannot be left without a
 * class, so they are moved out first, by hand, deliberately. Everything else
 * the class owns is reported before it goes, and only a confirmed request
 * takes it: lessons, registers, marks, events and permission slips all hang
 * off the class and go with it.
 */
r.delete('/classes/:id', requirePermission('curriculum.manage'), (req, res) => {
  const klass = db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.id);
  if (!klass) return res.status(404).json({ error: 'Class not found' });

  const enrolled = db.prepare("SELECT COUNT(*) n FROM students WHERE class_id = ? AND status = 'active'").get(klass.id).n;
  if (enrolled) {
    return res.status(409).json({
      error: `${klass.name} still has ${enrolled} pupil${enrolled === 1 ? '' : 's'}. Move them to another class first.`,
      pupils: enrolled,
    });
  }

  const attached = {
    subjects: db.prepare('SELECT COUNT(*) n FROM class_subjects WHERE class_id = ?').get(klass.id).n,
    lessons: db.prepare(
      `SELECT COUNT(*) n FROM timetable_slots ts JOIN class_subjects cs ON cs.id = ts.class_subject_id
       WHERE cs.class_id = ?`
    ).get(klass.id).n,
    registers: db.prepare(
      `SELECT COUNT(*) n FROM attendance a JOIN class_subjects cs ON cs.id = a.class_subject_id
       WHERE cs.class_id = ?`
    ).get(klass.id).n,
    assignments: db.prepare(
      `SELECT COUNT(*) n FROM assignments a JOIN class_subjects cs ON cs.id = a.class_subject_id
       WHERE cs.class_id = ?`
    ).get(klass.id).n,
    events: db.prepare('SELECT COUNT(*) n FROM calendar_events WHERE class_id = ?').get(klass.id).n,
  };

  const total = Object.values(attached).reduce((a, b) => a + b, 0);
  if (total && !req.query.confirm) {
    return res.status(409).json({
      error: `${klass.name} has teaching records against it.`,
      attached,
      hint: 'Repeat with ?confirm=1 to remove the class and everything listed.',
    });
  }

  db.prepare('DELETE FROM classes WHERE id = ?').run(klass.id);
  audit({ user: req.user, action: 'delete', entity: 'classes', entityId: klass.id,
          prev: { ...klass, attached }, ip: req.ip });
  res.json({ ok: true, removed: attached });
});

/**
 * Fills a class with the subjects its section teaches.
 *
 * The curriculum is decided by section and the register is kept by class, and a
 * school that has both still has to join them. This is that join, asked for
 * rather than assumed: it adds what is missing, leaves teachers to be set, and
 * touches nothing already paired.
 */
r.post('/classes/:id/subjects/from-section', requirePermission('curriculum.manage'), (req, res) => {
  const klass = db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.id);
  if (!klass) return res.status(404).json({ error: 'Class not found' });

  const added = offerSectionSubjectsToClass(klass.id, klass.section);
  if (added) {
    audit({ user: req.user, action: 'update', entity: 'class_subjects', entityId: klass.id,
            next: { added, from: klass.section }, ip: req.ip });
  }
  res.json({ added });
});

r.get('/classes/:id/roster', requireRole('admin', 'teacher'), (req, res) => {
  if (req.user.role === 'teacher' && !teachesClass(req.user.id, req.params.id)) {
    return res.status(403).json({ error: 'You do not teach this class' });
  }
  res.json(db.prepare(
    `SELECT s.id, s.student_code, u.first_name, u.last_name, u.avatar_colour, u.avatar_url, u.avatar_emoji,
            iep.needs, iep.time_multiplier, iep.multi_format_approved
     FROM students s JOIN users u ON u.id = s.user_id
     LEFT JOIN iep_profiles iep ON iep.student_id = s.id
     WHERE s.class_id = ? AND s.status = 'active' ORDER BY u.first_name`
  ).all(req.params.id).map((s) => ({ ...s, needs: JSON.parse(s.needs || '[]') })));
});

/**
 * Creates a class, or a whole year group at once.
 *
 * Pass `streams: ['Rose', 'Lily']` with a `year_label` and each arm is created
 * as its own class inside the same year: same section and level, so registers,
 * timetables and reports treat them as parallel classes of one year rather than
 * as unrelated groups. Without streams it creates the single class it is given,
 * exactly as before.
 */
/**
 * Where a year sits in the order, worked out from what it is called.
 *
 * "Primary 1", "Year 7" and "JSS 1" all carry their own position, so a school
 * never has to give it separately: the number in the name is the number. A year
 * named without one ("Reception") goes after everything else in its phase.
 */
function levelFor(section, label, explicit) {
  const given = Number(explicit);
  if (Number.isFinite(given) && given > 0) return given;

  const found = String(label ?? '').match(/\d+/);
  if (found) return Number(found[0]);

  const highest = db.prepare('SELECT COALESCE(MAX(level), 0) n FROM classes WHERE section = ?').get(section).n;
  return highest + 1;
}

r.post('/classes', requirePermission('curriculum.manage'), (req, res) => {
  const b = req.body ?? {};
  const section = b.section;
  if (!db.prepare('SELECT 1 FROM sections WHERE key = ?').get(section)) {
    return res.status(400).json({ error: 'Choose one of your school\'s sections' });
  }

  // Ordering comes from whatever names the class: "Primary 1 Rose" sorts on 1.
  // Each class is read separately, so one batch may span several years.
  const levelOf = (name) => levelFor(section, b.year_label ?? name, b.level);
  const yearLabel = String(b.year_label ?? '').trim() || null;
  const streams = Array.isArray(b.streams)
    ? [...new Set(b.streams.map((x) => String(x).trim()).filter(Boolean))]
    : [];

  // A school that teaches one class per room names them the same way. Each room
  // becomes a class, named for the section it sits in and the room itself:
  // "Nursery 1" and "A" make "Nursery 1A". A room already carrying the section
  // name is left as written rather than repeating it.
  const rooms = Array.isArray(b.rooms)
    ? [...new Set(b.rooms.map((x) => String(x).trim()).filter(Boolean))]
    : [];

  const sectionName = db.prepare('SELECT name FROM sections WHERE key = ?').get(section)?.name ?? '';

  if (!streams.length && !rooms.length && !b.name && !yearLabel) {
    return res.status(400).json({ error: 'Give the class a name' });
  }

  const year = db.prepare('SELECT academic_year FROM school_settings WHERE id = 1').get()?.academic_year;
  const insert = db.prepare(
    `INSERT INTO classes (name, year_label, stream, section, level, academic_year, homeroom_teacher_id, room)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // A class is named as the school writes it on the register. Where a year
  // group is given, it is prefixed unless the name already carries it.
  const compose = (stream) => {
    if (!yearLabel) return stream.trim();
    return (stream.toLowerCase().startsWith(yearLabel.toLowerCase()) ? stream : `${yearLabel} ${stream}`).trim();
  };

  // Every class in a section carries the section's name; the classroom is what
  // tells them apart, so "Nursery 1" is taught in A, B and C.
  const rows = rooms.length
    ? rooms.map((room) => ({
        name: sectionName || room, stream: null, level: levelOf(sectionName || room), room, byRoom: true,
      }))
    : streams.length
      ? streams.map((stream) => {
          const name = compose(stream);
          return { name, stream: yearLabel ? stream : null, level: levelOf(name) };
        })
      : [{ name: b.name || yearLabel, stream: null, level: levelOf(b.name || yearLabel) }];

  // Names have to be told apart inside a section, not across the school: two
  // parts of a school may each have a 1A, and they are different classes.
  // Classes named for their classroom are told apart by it, so the same name
  // in a different room is a different class. Ones given their own names are
  // not: a repeat there would be indistinguishable on a register.
  const taken = rows
    .filter((r) => (r.byRoom
      ? db.prepare(
          `SELECT 1 FROM classes WHERE lower(name) = lower(?) AND section = ?
           AND COALESCE(lower(room), '') = COALESCE(lower(?), '')`
        ).get(r.name, section, r.room ?? null)
      : db.prepare('SELECT 1 FROM classes WHERE lower(name) = lower(?) AND section = ?').get(r.name, section)))
    .map((r) => (r.byRoom && r.room ? `${r.name} in ${r.room}` : r.name));
  if (taken.length) {
    return res.status(409).json({
      error: `${sectionName || 'This section'} already has ${taken.join(', ')}`,
    });
  }

  const created = db.transaction(() => rows.map((row) => {
    const out = insert.run(row.name, yearLabel, row.stream, section, row.level,
                           b.academic_year ?? year ?? '2026/2027',
                           b.homeroom_teacher_id ?? null, row.room ?? b.room ?? null);
    return db.prepare('SELECT * FROM classes WHERE id = ?').get(out.lastInsertRowid);
  }))();

  for (const klass of created) {
    audit({ user: req.user, action: 'create', entity: 'classes', entityId: klass.id, next: klass, ip: req.ip });
  }

  // One class in, one class out: only a batch answers with a list.
  res.status(201).json(streams.length || rooms.length ? created : created[0]);
});

/** Renaming a class, moving its year, or handing it to another homeroom teacher. */
r.patch('/classes/:id', requirePermission('curriculum.manage'), (req, res) => {
  const prev = db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Class not found' });

  const patch = { ...req.body };
  // Renaming the year moves it in the order, so the position follows the name
  // rather than being kept in step by hand.
  if (('year_label' in patch || 'name' in patch) && !('level' in patch)) {
    patch.level = levelFor(prev.section, patch.year_label ?? patch.name, null);
  }

  const fields = ['name', 'year_label', 'stream', 'level', 'room', 'homeroom_teacher_id']
    .filter((f) => f in patch);
  if (!fields.length) return res.json(prev);

  if (patch.name && patch.name !== prev.name
      && db.prepare('SELECT 1 FROM classes WHERE lower(name) = lower(?) AND section = ? AND id != ?')
        .get(patch.name, patch.section ?? prev.section, prev.id)) {
    return res.status(409).json({ error: 'Another class in this section already has that name' });
  }

  db.prepare(`UPDATE classes SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`)
    .run(...fields.map((f) => (patch[f] === '' ? null : patch[f])), prev.id);

  audit({ user: req.user, action: 'update', entity: 'classes', entityId: prev.id, prev, next: req.body, ip: req.ip });
  res.json(db.prepare('SELECT * FROM classes WHERE id = ?').get(prev.id));
});

/** Every subject, with the full list of sections it is taught in. */
/**
 * A subject taught in a section is taught by the classes in it.
 *
 * Saying "Mathematics runs through Grade 4" and then adding it to Grade 4 A, B
 * and C by hand is the same fact entered four times, and the register that
 * matters — the class one — is the one that gets forgotten. Attaching it here
 * leaves the teacher unset: who teaches which class is a separate decision, and
 * an existing pairing is never overwritten.
 */
function offerSubjectToClasses(subjectId, sectionKeys) {
  const add = db.prepare(
    'INSERT OR IGNORE INTO class_subjects (class_id, subject_id, teacher_id) VALUES (?, ?, NULL)'
  );
  const classesIn = db.prepare('SELECT id FROM classes WHERE section = ?');
  let added = 0;
  for (const key of sectionKeys) {
    for (const klass of classesIn.all(key)) added += add.run(klass.id, subjectId).changes;
  }
  return added;
}

/** The same, for one class joining a school that already teaches subjects. */
function offerSectionSubjectsToClass(classId, sectionKey) {
  const add = db.prepare(
    'INSERT OR IGNORE INTO class_subjects (class_id, subject_id, teacher_id) VALUES (?, ?, NULL)'
  );
  const subjects = db.prepare(
    `SELECT id FROM subjects WHERE section = ?
      OR EXISTS (SELECT 1 FROM subject_sections ss WHERE ss.subject_id = subjects.id AND ss.section = ?)`
  ).all(sectionKey, sectionKey);
  let added = 0;
  for (const subject of subjects) added += add.run(classId, subject.id).changes;
  return added;
}

/**
 * Fills in the teacher on class pairings that have none.
 *
 * A school says "Mrs Bello teaches Mathematics" and "Mrs Bello is in Nursery",
 * and then has to repeat that against every class taking Maths. Those two facts
 * are enough on their own: where exactly one person both teaches the subject
 * and works in that class's section, the pairing is filled in. Where more than
 * one qualifies it is left alone — guessing would put the wrong person in front
 * of a class, and the timetable is where that shows up.
 */
function fillTeachers({ subjectId = null, section = null } = {}) {
  const pairs = db.prepare(
    `SELECT cs.id, cs.subject_id, c.section FROM class_subjects cs
     JOIN classes c ON c.id = cs.class_id
     JOIN subjects sub ON sub.id = cs.subject_id
     WHERE cs.teacher_id IS NULL AND sub.is_break = 0
       AND (? IS NULL OR cs.subject_id = ?) AND (? IS NULL OR c.section = ?)`
  ).all(subjectId, subjectId, section, section);

  const teachersOf = db.prepare('SELECT user_id FROM subject_teachers WHERE subject_id = ?');
  const inSection = db.prepare('SELECT 1 FROM section_teachers WHERE section = ? AND user_id = ?');
  const set = db.prepare('UPDATE class_subjects SET teacher_id = ? WHERE id = ? AND teacher_id IS NULL');

  let assigned = 0;
  let ambiguous = 0;
  let unanswered = 0;
  const waitingOn = new Map();
  for (const pair of pairs) {
    const candidates = teachersOf.all(pair.subject_id).map((r) => r.user_id);
    // Nothing has been said about who teaches this subject, so there is nothing
    // to distribute. Which subject is named, because "283 classes have nobody"
    // is a number to despair at, while "Art and PE name no teacher" is a job.
    if (!candidates.length) {
      unanswered += 1;
      if (!waitingOn.has(pair.subject_id)) {
        waitingOn.set(pair.subject_id,
                      db.prepare('SELECT name FROM subjects WHERE id = ?').get(pair.subject_id)?.name);
      }
      continue;
    }

    const here = candidates.filter((id) => inSection.get(pair.section, id));
    const chosen = here.length === 1 ? here[0] : candidates.length === 1 ? candidates[0] : null;
    if (chosen) assigned += set.run(chosen, pair.id).changes;
    else ambiguous += 1;
  }

  return {
    assigned,
    ambiguous,
    unanswered,
    unstaffed: pairs.length - assigned,
    waiting_on: [...waitingOn.values()].filter(Boolean).sort(),
  };
}

// Prepared when asked for rather than at import: the tables exist once the
// database has been migrated, which happens after the routes are loaded.
const teachersFor = (table, column, key) => db.prepare(
  `SELECT u.id, u.first_name || ' ' || u.last_name AS name, u.email
   FROM ${table} t JOIN users u ON u.id = t.user_id
   WHERE t.${column} = ? ORDER BY u.first_name`
).all(key);

const subjectTeachers = { all: (id) => teachersFor('subject_teachers', 'subject_id', id) };
const sectionTeachers = { all: (key) => teachersFor('section_teachers', 'section', key) };

/** The staff who teach a subject, set as one list. */
r.put('/subjects/:id/teachers', requirePermission('curriculum.manage'), (req, res) => {
  const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(req.params.id);
  if (!subject) return res.status(404).json({ error: 'Subject not found' });

  const wanted = [...new Set((req.body?.teacher_ids ?? []).map(Number).filter(Boolean))];
  const staff = wanted.filter((id) => db.prepare(
    "SELECT 1 FROM users WHERE id = ? AND role IN ('teacher','admin')"
  ).get(id));
  if (staff.length !== wanted.length) {
    return res.status(400).json({ error: 'Only members of staff can teach a subject' });
  }

  const filled = db.transaction(() => {
    db.prepare('DELETE FROM subject_teachers WHERE subject_id = ?').run(subject.id);
    const add = db.prepare('INSERT INTO subject_teachers (subject_id, user_id) VALUES (?, ?)');
    for (const id of staff) add.run(subject.id, id);
    return fillTeachers({ subjectId: subject.id });
  })();

  audit({ user: req.user, action: 'update', entity: 'subject_teachers', entityId: subject.id,
          next: { teacher_ids: staff, ...filled }, ip: req.ip });
  res.json({ teachers: subjectTeachers.all(subject.id), ...filled });
});

/** The staff who work in a part of the school, set as one list. */
r.put('/sections/:key/teachers', requirePermission('curriculum.manage'), (req, res) => {
  const section = db.prepare('SELECT * FROM sections WHERE key = ?').get(req.params.key);
  if (!section) return res.status(404).json({ error: 'Section not found' });

  const wanted = [...new Set((req.body?.teacher_ids ?? []).map(Number).filter(Boolean))];
  const staff = wanted.filter((id) => db.prepare(
    "SELECT 1 FROM users WHERE id = ? AND role IN ('teacher','admin')"
  ).get(id));
  if (staff.length !== wanted.length) {
    return res.status(400).json({ error: 'Only members of staff can be put in a section' });
  }

  const filled = db.transaction(() => {
    db.prepare('DELETE FROM section_teachers WHERE section = ?').run(section.key);
    const add = db.prepare('INSERT INTO section_teachers (section, user_id) VALUES (?, ?)');
    for (const id of staff) add.run(section.key, id);
    return fillTeachers({ section: section.key });
  })();

  audit({ user: req.user, action: 'update', entity: 'section_teachers', entityId: section.key,
          next: { teacher_ids: staff, ...filled }, ip: req.ip });
  res.json({ teachers: sectionTeachers.all(section.key), ...filled });
});

/** Fills in every blank pairing the school has already answered for. */
r.post('/teaching/sync', requirePermission('curriculum.manage'), (req, res) => {
  const filled = fillTeachers();
  audit({ user: req.user, action: 'update', entity: 'class_subjects', entityId: 'bulk',
          next: filled, ip: req.ip });
  res.json(filled);
});

r.get('/subjects', (req, res) => {
  const { section } = req.query;
  const rows = section
    ? db.prepare(
        `SELECT s.* FROM subjects s JOIN subject_sections ss ON ss.subject_id = s.id
         WHERE ss.section = ? ORDER BY s.name`
      ).all(section)
    : db.prepare('SELECT * FROM subjects WHERE is_break = 0 ORDER BY COALESCE(category, char(255)), name').all();

  const sectionsOf = db.prepare('SELECT section FROM subject_sections WHERE subject_id = ?');
  const classesOf = db.prepare('SELECT COUNT(*) n FROM class_subjects WHERE subject_id = ?');
  res.json(rows.map((s) => ({
    ...s,
    sections: sectionsOf.all(s.id).map((r) => r.section),
    class_count: classesOf.get(s.id).n,
    teachers: subjectTeachers.all(s.id),
  })));
});

/**
 * Brings existing classes into line with the subjects their sections teach.
 *
 * A school that built its curriculum and its classes separately has the two
 * facts already; this joins them without touching a pairing that has a teacher,
 * a lesson or any work behind it.
 */
r.post('/subjects/offer-to-classes', requirePermission('curriculum.manage'), (req, res) => {
  const subjects = db.prepare('SELECT id FROM subjects').all();
  const sectionsOf = db.prepare('SELECT section FROM subject_sections WHERE subject_id = ?');
  let added = 0;
  db.transaction(() => {
    for (const subject of subjects) {
      const keys = sectionsOf.all(subject.id).map((r) => r.section);
      added += offerSubjectToClasses(subject.id, keys);
    }
  })();

  audit({ user: req.user, action: 'update', entity: 'class_subjects', entityId: 'bulk',
          next: { added }, ip: req.ip });
  res.json({ added });
});

r.post('/subjects', requirePermission('curriculum.manage'), (req, res) => {
  const b = req.body ?? {};
  // A subject may run through several parts of the school at once.
  const wanted = [...new Set([...(b.sections ?? []), b.section].filter(Boolean).map(String))];
  if (!b.name || !wanted.length) return res.status(400).json({ error: 'Name and section are required' });

  const unknown = wanted.filter((k) => !db.prepare('SELECT 1 FROM sections WHERE key = ?').get(k));
  if (unknown.length) return res.status(400).json({ error: 'Choose from your school\'s sections' });

  // A code is what registers and reports print, so derive a readable one when
  // the school has not got a scheme of its own yet.
  const base = (b.code || b.name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'SUBJ';
  let code = base;
  for (let n = 2; db.prepare('SELECT 1 FROM subjects WHERE code = ?').get(code); n += 1) code = `${base}${n}`;

  const id = db.transaction(() => {
    const out = db.prepare(
      'INSERT INTO subjects (name, code, category, section, colour, icon) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(b.name.trim(), code, b.category?.trim() || null, wanted[0], b.colour ?? '#2563eb', b.icon ?? 'book');
    const add = db.prepare('INSERT INTO subject_sections (subject_id, section) VALUES (?, ?)');
    for (const key of wanted) add.run(out.lastInsertRowid, key);
    return out.lastInsertRowid;
  })();

  audit({ user: req.user, action: 'create', entity: 'subjects', entityId: id, next: { ...b, code }, ip: req.ip });
  res.status(201).json({ ...db.prepare('SELECT * FROM subjects WHERE id = ?').get(id), sections: wanted });
});

r.patch('/subjects/:id', requirePermission('curriculum.manage'), (req, res) => {
  const prev = db.prepare('SELECT * FROM subjects WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Subject not found' });

  const b = req.body ?? {};
  const fields = ['name', 'category', 'colour', 'icon'].filter((f) => f in b);

  db.transaction(() => {
    if (fields.length) {
      db.prepare(`UPDATE subjects SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`)
        .run(...fields.map((f) => b[f]), prev.id);
    }

    // Where it is taught is set as a whole list; a section is only dropped when
    // no class in it is actually taking the subject.
    if (Array.isArray(b.sections) && b.sections.length) {
      const wanted = [...new Set(b.sections.map(String))];
      const held = db.prepare('SELECT section FROM subject_sections WHERE subject_id = ?').all(prev.id)
        .map((r) => r.section);

      for (const key of wanted.filter((k) => !held.includes(k))) {
        if (db.prepare('SELECT 1 FROM sections WHERE key = ?').get(key)) {
          db.prepare('INSERT OR IGNORE INTO subject_sections (subject_id, section) VALUES (?, ?)').run(prev.id, key);
        }
      }
      for (const key of held.filter((k) => !wanted.includes(k))) {
        const taught = db.prepare(
          `SELECT COUNT(*) n FROM class_subjects cs JOIN classes c ON c.id = cs.class_id
           WHERE cs.subject_id = ? AND c.section = ?`
        ).get(prev.id, key).n;
        if (!taught) db.prepare('DELETE FROM subject_sections WHERE subject_id = ? AND section = ?').run(prev.id, key);
      }
      db.prepare('UPDATE subjects SET section = ? WHERE id = ?').run(wanted[0], prev.id);
    }
  })();

  audit({ user: req.user, action: 'update', entity: 'subjects', entityId: prev.id, prev, next: b, ip: req.ip });
  const out = db.prepare('SELECT * FROM subjects WHERE id = ?').get(prev.id);
  res.json({ ...out, sections: db.prepare('SELECT section FROM subject_sections WHERE subject_id = ?').all(prev.id).map((r) => r.section) });
});

/** Refused while any class still teaches it: deleting would take its lessons. */
r.delete('/subjects/:id', requirePermission('curriculum.manage'), (req, res) => {
  const prev = db.prepare('SELECT * FROM subjects WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Subject not found' });

  const inUse = db.prepare('SELECT COUNT(*) n FROM class_subjects WHERE subject_id = ?').get(prev.id).n;
  if (inUse) {
    return res.status(409).json({ error: `${prev.name} is taught by ${inUse} class${inUse === 1 ? '' : 'es'}. Remove it from those first.` });
  }
  db.prepare('DELETE FROM subjects WHERE id = ?').run(prev.id);
  audit({ user: req.user, action: 'delete', entity: 'subjects', entityId: prev.id, prev, ip: req.ip });
  res.json({ ok: true });
});

/** Which classes take a subject, and who teaches each of them. */
r.get('/subjects/:id/classes', requireRole('admin', 'teacher'), (req, res) => {
  res.json(db.prepare(
    `SELECT cs.id, cs.class_id, cs.teacher_id, c.name AS class_name, c.year_label, c.section, c.level,
            u.first_name || ' ' || u.last_name AS teacher_name,
            (SELECT COUNT(*) FROM timetable_slots ts WHERE ts.class_subject_id = cs.id) AS lessons_per_week
     FROM class_subjects cs JOIN classes c ON c.id = cs.class_id
     LEFT JOIN users u ON u.id = cs.teacher_id
     WHERE cs.subject_id = ? ORDER BY c.level, c.name`
  ).all(req.params.id));
});

/**
 * Sets the whole list of classes that take a subject, in one go.
 *
 * A subject is usually taught right across a year, so adding it class by class
 * is the wrong shape of work. Classes already teaching it keep their teacher
 * and their lessons; ones dropped from the list are only released when nothing
 * has been recorded against them, and anything still holding marks or
 * registers is reported back rather than quietly deleted.
 */
r.put('/subjects/:id/classes', requirePermission('curriculum.manage'), (req, res) => {
  const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(req.params.id);
  if (!subject) return res.status(404).json({ error: 'Subject not found' });

  const wanted = [...new Set((req.body?.class_ids ?? []).map(Number).filter(Boolean))];
  const teacherId = req.body?.teacher_id ? Number(req.body.teacher_id) : null;
  if (teacherId && !db.prepare("SELECT 1 FROM users WHERE id = ? AND role IN ('teacher','admin')").get(teacherId)) {
    return res.status(400).json({ error: 'That teacher no longer exists' });
  }

  const current = db.prepare('SELECT * FROM class_subjects WHERE subject_id = ?').all(subject.id);
  const currentIds = new Set(current.map((c) => c.class_id));
  const kept = [];

  const result = db.transaction(() => {
    const added = [];
    for (const classId of wanted) {
      if (currentIds.has(classId)) continue;
      const klass = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
      if (!klass) continue;
      db.prepare('INSERT INTO class_subjects (class_id, subject_id, teacher_id) VALUES (?, ?, ?)')
        .run(classId, subject.id, teacherId);
      added.push(klass.name);
    }

    const removed = [];
    for (const pair of current) {
      if (wanted.includes(pair.class_id)) continue;
      const work = db.prepare(
        `SELECT (SELECT COUNT(*) FROM assignments WHERE class_subject_id = ?) +
                (SELECT COUNT(*) FROM attendance WHERE class_subject_id = ?) n`
      ).get(pair.id, pair.id).n;

      const klass = db.prepare('SELECT name FROM classes WHERE id = ?').get(pair.class_id);
      if (work) { kept.push(klass?.name); continue; }
      db.prepare('DELETE FROM class_subjects WHERE id = ?').run(pair.id);
      removed.push(klass?.name);
    }
    return { added, removed };
  })();

  audit({ user: req.user, action: 'update', entity: 'subjects', entityId: subject.id,
          next: { classes: wanted.length, ...result, kept }, ip: req.ip });

  res.json({
    ...result,
    kept_because_of_work: kept,
    classes: db.prepare(
      `SELECT cs.id, cs.class_id, c.name AS class_name FROM class_subjects cs
       JOIN classes c ON c.id = cs.class_id WHERE cs.subject_id = ? ORDER BY c.level, c.name`
    ).all(subject.id),
  });
});

/* ── What each class is taught, and by whom ───────────────────────────────── */
r.get('/classes/:id/subjects', requireRole('admin', 'teacher'), (req, res) => {
  res.json(db.prepare(
    `SELECT cs.id, cs.subject_id, cs.teacher_id, sub.name, sub.code, sub.colour, sub.icon,
            u.first_name || ' ' || u.last_name AS teacher_name,
            (SELECT COUNT(*) FROM timetable_slots ts WHERE ts.class_subject_id = cs.id) AS lessons_per_week
     FROM class_subjects cs JOIN subjects sub ON sub.id = cs.subject_id
     LEFT JOIN users u ON u.id = cs.teacher_id
     WHERE cs.class_id = ? AND sub.is_break = 0 ORDER BY sub.name`
  ).all(req.params.id));
});

r.post('/classes/:id/subjects', requirePermission('curriculum.manage'), (req, res) => {
  const klass = db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.id);
  if (!klass) return res.status(404).json({ error: 'Class not found' });

  const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(req.body?.subject_id);
  if (!subject) return res.status(400).json({ error: 'Choose a subject' });

  const teacherId = req.body?.teacher_id || null;
  if (teacherId) {
    const teacher = db.prepare("SELECT role FROM users WHERE id = ? AND role IN ('teacher','admin')").get(teacherId);
    if (!teacher) return res.status(400).json({ error: 'That teacher no longer exists' });
  }

  try {
    const out = db.prepare('INSERT INTO class_subjects (class_id, subject_id, teacher_id) VALUES (?, ?, ?)')
      .run(klass.id, subject.id, teacherId);
    audit({ user: req.user, action: 'create', entity: 'class_subjects', entityId: out.lastInsertRowid,
            next: { class: klass.name, subject: subject.name, teacher_id: teacherId }, ip: req.ip });
    res.status(201).json(db.prepare('SELECT * FROM class_subjects WHERE id = ?').get(out.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: `${klass.name} already takes ${subject.name}` });
    }
    throw e;
  }
});

/** Changing who teaches it moves every lesson, register and assignment with it. */
r.patch('/class-subjects/:id', requirePermission('curriculum.manage'), (req, res) => {
  const prev = db.prepare('SELECT * FROM class_subjects WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Not found' });

  const teacherId = req.body?.teacher_id || null;
  if (teacherId && !db.prepare("SELECT 1 FROM users WHERE id = ? AND role IN ('teacher','admin')").get(teacherId)) {
    return res.status(400).json({ error: 'That teacher no longer exists' });
  }
  db.prepare('UPDATE class_subjects SET teacher_id = ? WHERE id = ?').run(teacherId, prev.id);
  audit({ user: req.user, action: 'update', entity: 'class_subjects', entityId: prev.id,
          prev: { teacher_id: prev.teacher_id }, next: { teacher_id: teacherId }, ip: req.ip });
  res.json(db.prepare('SELECT * FROM class_subjects WHERE id = ?').get(prev.id));
});

/** Says plainly what will go with it: this cascades to lessons and marks. */
r.delete('/class-subjects/:id', requirePermission('curriculum.manage'), (req, res) => {
  const prev = db.prepare('SELECT * FROM class_subjects WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Not found' });

  const attached = {
    lessons: db.prepare('SELECT COUNT(*) n FROM timetable_slots WHERE class_subject_id = ?').get(prev.id).n,
    assignments: db.prepare('SELECT COUNT(*) n FROM assignments WHERE class_subject_id = ?').get(prev.id).n,
    registers: db.prepare('SELECT COUNT(*) n FROM attendance WHERE class_subject_id = ?').get(prev.id).n,
  };
  if ((attached.assignments || attached.registers) && !req.query.confirm) {
    return res.status(409).json({
      error: 'This subject already has work against it.',
      attached,
      hint: 'Repeat with ?confirm=1 to remove it along with those records.',
    });
  }
  db.prepare('DELETE FROM class_subjects WHERE id = ?').run(prev.id);
  audit({ user: req.user, action: 'delete', entity: 'class_subjects', entityId: prev.id, prev: { ...prev, attached }, ip: req.ip });
  res.json({ ok: true, removed: attached });
});

/** Subjects for the signed-in user's own context (student = their class, teacher = what they teach). */
r.get('/my/subjects', (req, res) => {
  if (req.user.role === 'student') {
    return res.json(db.prepare(
      `SELECT cs.id AS class_subject_id, sub.*, u.first_name || ' ' || u.last_name AS teacher_name, cs.teacher_id,
              (SELECT COUNT(*) FROM assignments a WHERE a.class_subject_id = cs.id AND a.due_at > datetime('now')) AS open_assignments
       FROM class_subjects cs JOIN subjects sub ON sub.id = cs.subject_id
       LEFT JOIN users u ON u.id = cs.teacher_id
       WHERE cs.class_id = ? ORDER BY sub.name`
    ).all(req.student?.class_id ?? 0));
  }
  if (req.user.role === 'teacher' || req.user.role === 'admin') {
    return res.json(db.prepare(
      `SELECT cs.id AS class_subject_id, sub.*, c.name AS class_name, c.section, c.id AS class_id,
              (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status='active') AS student_count
       FROM class_subjects cs JOIN subjects sub ON sub.id = cs.subject_id JOIN classes c ON c.id = cs.class_id
       WHERE cs.teacher_id = ? OR ? = 'admin' ORDER BY c.level, sub.name`
    ).all(req.user.id, req.user.role));
  }
  res.json([]);
});

/* ── Timetable ────────────────────────────────────────────────────────────── */
r.get('/timetable', (req, res) => {
  let classId = req.query.classId;
  if (!classId && req.user.role === 'student') classId = req.student?.class_id;

  if (req.user.role === 'teacher' && !classId) {
    return res.json(db.prepare(
      `SELECT ts.*, sub.name AS subject, sub.colour, sub.icon, sub.is_break, c.name AS class_name
       FROM timetable_slots ts JOIN class_subjects cs ON cs.id = ts.class_subject_id
       JOIN subjects sub ON sub.id = cs.subject_id JOIN classes c ON c.id = cs.class_id
       WHERE cs.teacher_id = ? ORDER BY ts.day_of_week, ts.period`
    ).all(req.user.id));
  }
  res.json(db.prepare(
    `SELECT ts.*, sub.name AS subject, sub.colour, sub.icon, sub.is_break, c.name AS class_name,
            u.first_name || ' ' || u.last_name AS teacher_name
     FROM timetable_slots ts JOIN class_subjects cs ON cs.id = ts.class_subject_id
     JOIN subjects sub ON sub.id = cs.subject_id JOIN classes c ON c.id = cs.class_id
     LEFT JOIN users u ON u.id = cs.teacher_id
     WHERE cs.class_id = ? ORDER BY ts.day_of_week, ts.period`
  ).all(classId ?? 0));
});

/**
 * Adding a lesson to the timetable. Two clashes are worth refusing outright,
 * because both mean somebody has to be in two places at once: a class already
 * has a lesson in that period, or the teacher is already teaching then.
 */
/* ── Importing a week ─────────────────────────────────────────────────────── */

/** The hour each period runs, for a file that gives periods but no times. */
const PERIOD_TIMES = {
  1: ['08:30', '09:15'], 2: ['09:15', '10:00'], 3: ['10:20', '11:05'], 4: ['11:05', '11:50'],
  5: ['12:40', '13:25'], 6: ['13:25', '14:10'], 7: ['14:20', '15:05'], 8: ['15:05', '15:50'],
};

const DAY_OF = {
  mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6, sun: 7, sunday: 7,
};

/**
 * One lesson from a spreadsheet, checked against the school and against the
 * rows already read.
 *
 * A timetable is the one document where a mistake is felt by everybody at once:
 * two classes sent to the same teacher, a subject nobody is free to teach. So a
 * row is checked against what is already timetabled *and* against the rest of
 * the file, which is where a hand-built week usually contradicts itself.
 */
function checkLessonRow(row, line, seen) {
  const value = (k) => (row[k] == null ? '' : String(row[k]).trim());
  const out = {
    line,
    class_name: value('class'),
    classroom: value('classroom'),
    subject_name: value('subject'),
    teacher_email: value('teacher_email').toLowerCase(),
    room: value('room'),
    errors: [],
    warnings: [],
  };

  // Which class, said the way the pupil importer says it.
  if (!out.class_name) out.errors.push('A class is needed');
  else {
    let matches = db.prepare('SELECT * FROM classes WHERE lower(name) = lower(?)').all(out.class_name);
    if (!matches.length) {
      const cut = out.class_name.lastIndexOf(' ');
      if (cut > 0) {
        matches = db.prepare(
          `SELECT * FROM classes WHERE lower(name) = lower(?) AND lower(COALESCE(room, '')) = lower(?)`
        ).all(out.class_name.slice(0, cut), out.class_name.slice(cut + 1));
      }
    }
    if (out.classroom) {
      matches = matches.filter((c) => String(c.room ?? '').toLowerCase() === out.classroom.toLowerCase());
    }
    if (!matches.length) {
      out.errors.push(out.classroom
        ? `No class "${out.class_name}" in classroom ${out.classroom}`
        : `No class called "${out.class_name}"`);
    } else if (matches.length > 1) {
      out.errors.push(`${out.class_name} has classrooms ${matches.map((c) => c.room ?? '?').join(', ')}. `
                      + 'Add a classroom column to say which.');
    } else {
      out.class_id = matches[0].id;
      out.class_label = matches[0].room ? `${matches[0].name} · ${matches[0].room}` : matches[0].name;
      out.section = matches[0].section;
    }
  }

  // When it meets.
  const rawDay = value('day').toLowerCase();
  out.day_of_week = DAY_OF[rawDay] ?? (/^[1-7]$/.test(rawDay) ? Number(rawDay) : null);
  if (!rawDay) out.errors.push('A day is needed');
  else if (!out.day_of_week) out.errors.push(`"${value('day')}" is not a day of the week`);

  out.period = Number(value('period'));
  if (!value('period')) out.errors.push('A period is needed');
  else if (!(out.period >= 1 && out.period <= 12)) out.errors.push('Period must be between 1 and 12');

  const times = PERIOD_TIMES[out.period];
  out.start_time = value('start_time') || times?.[0] || '';
  out.end_time = value('end_time') || times?.[1] || '';
  if (!value('start_time') && times) out.warnings.push(`Taking period ${out.period} as ${times[0]}-${times[1]}`);
  if (!/^\d{2}:\d{2}$/.test(out.start_time) || !/^\d{2}:\d{2}$/.test(out.end_time)) {
    out.errors.push('Start and end times look like 09:00');
  } else if (out.end_time <= out.start_time) out.errors.push('The lesson has to end after it starts');

  // What meets: a subject the school teaches, or a break in the day.
  const breakKind = value('break').toLowerCase()
    || (/^short break$/i.test(out.subject_name) ? 'short' : '')
    || (/^long break$|^lunch$/i.test(out.subject_name) ? 'long' : '');
  if (breakKind) {
    if (!BREAKS[breakKind] && !['short', 'long'].includes(breakKind)) {
      out.errors.push('A break is either short or long');
    } else {
      out.break_kind = breakKind;
      out.subject_name = BREAKS[breakKind]?.name ?? out.subject_name;
    }
  } else if (!out.subject_name) {
    out.errors.push('A subject is needed, or a break');
  } else {
    const subject = db.prepare('SELECT * FROM subjects WHERE lower(name) = lower(?) AND is_break = 0')
      .get(out.subject_name);
    if (!subject) out.errors.push(`No subject called "${out.subject_name}"`);
    else {
      out.subject_id = subject.id;
      if (out.class_id) {
        const pair = db.prepare('SELECT * FROM class_subjects WHERE class_id = ? AND subject_id = ?')
          .get(out.class_id, subject.id);
        out.class_subject_id = pair?.id ?? null;
        out.teacher_id = pair?.teacher_id ?? null;
        // A subject the class does not yet take is added by this import rather
        // than refused: a week names the classes that take a subject anyway.
        if (!pair) out.warnings.push(`${out.subject_name} added to this class`);
      }
    }
  }

  if (out.teacher_email) {
    const teacher = db.prepare(
      "SELECT id, first_name, last_name FROM users WHERE lower(email) = lower(?) AND role IN ('teacher','admin')"
    ).get(out.teacher_email);
    if (!teacher) out.errors.push(`No member of staff with the email ${out.teacher_email}`);
    else {
      out.teacher_id = teacher.id;
      out.teacher_name = `${teacher.first_name} ${teacher.last_name}`;
    }
  }

  // Nothing may be in two places at once: neither the class, nor the teacher,
  // whether the clash is with the school as it stands or with this same file.
  if (out.class_id && out.day_of_week && out.period) {
    const where = `${out.class_id}-${out.day_of_week}-${out.period}`;
    const standing = db.prepare(
      `SELECT sub.name FROM timetable_slots ts JOIN class_subjects cs ON cs.id = ts.class_subject_id
       JOIN subjects sub ON sub.id = cs.subject_id
       WHERE cs.class_id = ? AND ts.day_of_week = ? AND ts.period = ?`
    ).get(out.class_id, out.day_of_week, out.period);
    if (standing) out.errors.push(`${out.class_label} already has ${standing.name} then`);
    else if (seen.cells.has(where)) out.errors.push('This file puts that class in two lessons at once');
    seen.cells.add(where);

    if (out.teacher_id) {
      const when = `${out.teacher_id}-${out.day_of_week}-${out.period}`;
      const busy = db.prepare(
        `SELECT c.name FROM timetable_slots ts JOIN class_subjects cs ON cs.id = ts.class_subject_id
         JOIN classes c ON c.id = cs.class_id
         WHERE cs.teacher_id = ? AND ts.day_of_week = ? AND ts.period = ?`
      ).get(out.teacher_id, out.day_of_week, out.period);
      if (busy) out.errors.push(`That teacher is already with ${busy.name} then`);
      else if (seen.teachers.has(when)) out.errors.push('This file books that teacher twice at once');
      seen.teachers.add(when);
    }
  }

  out.status = out.errors.length ? 'error' : 'ready';
  return out;
}

/**
 * A week, or a whole school's week, from a spreadsheet.
 *
 * Timetables are built in a spreadsheet far more often than in any system, so
 * the file the school already has is the one that should load. Nothing is
 * written until the whole week has been checked.
 */
r.post('/timetable/import', requirePermission('curriculum.manage'), (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows) return res.status(400).json({ error: 'Send the rows to import' });
  if (rows.length > 2000) return res.status(400).json({ error: 'Import at most 2000 lessons at a time' });

  const seen = { cells: new Set(), teachers: new Set() };
  const checked = rows.map((row, i) => checkLessonRow(row, i + 1, seen));
  const ready = checked.filter((r) => r.status === 'ready');
  const failed = checked.filter((r) => r.status === 'error');

  const summary = {
    total: checked.length,
    ready: ready.length,
    errors: failed.length,
    classes: new Set(ready.map((r) => r.class_id)).size,
    breaks: ready.filter((r) => r.break_kind).length,
    new_pairings: ready.filter((r) => !r.break_kind && !r.class_subject_id).length,
  };

  if (req.body?.dry_run) return res.json({ rows: checked, summary, committed: false });
  if (failed.length && !req.body?.allow_partial) {
    return res.status(400).json({
      error: `${failed.length} row${failed.length === 1 ? '' : 's'} need fixing before this can be imported.`,
      rows: checked, summary, committed: false,
    });
  }
  if (!ready.length) return res.status(400).json({ error: 'There is nothing to import', rows: checked, summary });

  const created = db.transaction(() => ready.map((row) => {
    let pairId = row.class_subject_id;
    if (row.break_kind) {
      pairId = breakPairing(row.class_id, row.break_kind).id;
    } else if (!pairId) {
      pairId = db.prepare(
        'INSERT INTO class_subjects (class_id, subject_id, teacher_id) VALUES (?, ?, ?)'
      ).run(row.class_id, row.subject_id, row.teacher_id ?? null).lastInsertRowid;
    } else if (row.teacher_id) {
      db.prepare('UPDATE class_subjects SET teacher_id = ? WHERE id = ? AND teacher_id IS NULL')
        .run(row.teacher_id, pairId);
    }

    const made = db.prepare(
      `INSERT INTO timetable_slots (class_subject_id, day_of_week, period, start_time, end_time, room)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(pairId, row.day_of_week, row.period, row.start_time, row.end_time, row.room || null);

    return { line: row.line, id: made.lastInsertRowid, class: row.class_label,
             subject: row.subject_name, day: row.day_of_week, period: row.period };
  }))();

  audit({ user: req.user, action: 'import', entity: 'timetable_slots', entityId: 'bulk',
          next: { ...summary, imported: created.length }, ip: req.ip });

  res.status(201).json({ rows: checked, summary: { ...summary, imported: created.length }, created, committed: true });
});

/** The parts of the day that are not taught, offered on every timetable. */
const BREAKS = {
  short: { name: 'Short break', code: 'BREAK', colour: '#94a3b8', icon: 'clock' },
  long: { name: 'Long break', code: 'LUNCH', colour: '#64748b', icon: 'clock' },
};

/**
 * The pairing that puts a break on one class's week.
 *
 * A break occupies a period exactly as a lesson does, so it is easiest for
 * everything downstream — the grid, the clash rules, a pupil's day — if it is
 * one too. It is marked as a break so the curriculum, the registers and the
 * reports can leave it out, and it never has a teacher: nobody is timetabled
 * to supervise by putting lunch on a class.
 */
/**
 * The pairing that lets a class be taught a subject, made if it is missing.
 *
 * A subject reaches the timetable before anybody thinks to attach it to the
 * class: it is written on the week, and that *is* the school saying this class
 * takes it. Who teaches it stays unset, to be decided on the class page.
 */
function teachingPairing(classId, subjectId) {
  const existing = db.prepare('SELECT id FROM class_subjects WHERE class_id = ? AND subject_id = ?')
    .get(classId, subjectId);
  if (existing) return existing;

  const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND is_break = 0').get(subjectId);
  const klass = db.prepare('SELECT id FROM classes WHERE id = ?').get(classId);
  if (!subject || !klass) return null;

  const id = db.prepare('INSERT INTO class_subjects (class_id, subject_id, teacher_id) VALUES (?, ?, NULL)')
    .run(classId, subjectId).lastInsertRowid;
  return { id };
}

function breakPairing(classId, kind) {
  const spec = BREAKS[kind];
  if (!spec) return null;

  let subject = db.prepare('SELECT * FROM subjects WHERE is_break = 1 AND lower(name) = lower(?)').get(spec.name);
  if (!subject) {
    const klass = db.prepare('SELECT section FROM classes WHERE id = ?').get(classId);
    const id = db.prepare(
      `INSERT INTO subjects (name, code, section, colour, icon, is_break)
       VALUES (?, ?, ?, ?, ?, 1)`
    ).run(spec.name, spec.code, klass?.section ?? '', spec.colour, spec.icon).lastInsertRowid;
    subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(id);
  }

  db.prepare(
    'INSERT OR IGNORE INTO class_subjects (class_id, subject_id, teacher_id) VALUES (?, ?, NULL)'
  ).run(classId, subject.id);
  return db.prepare('SELECT id FROM class_subjects WHERE class_id = ? AND subject_id = ?')
    .get(classId, subject.id);
}

/**
 * Checks a lesson against the week before it is written.
 *
 * The same rules decide a new lesson and a moved one — a class cannot be in two
 * places at once, and neither can a teacher — so both go through here. `ignoreId`
 * is the lesson being moved: it must not clash with where it already is.
 */
function planLesson(body, ignoreId = null) {
  const cs = db.prepare(
    `SELECT cs.*, c.name AS class_name, sub.name AS subject
     FROM class_subjects cs JOIN classes c ON c.id = cs.class_id
     JOIN subjects sub ON sub.id = cs.subject_id WHERE cs.id = ?`
  ).get(body.class_subject_id);
  if (!cs) return { error: 'Choose a subject for this class first' };

  const day = Number(body.day_of_week);
  const period = Number(body.period);
  if (!(day >= 1 && day <= 7)) return { error: 'Pick a day of the week' };
  if (!(period >= 1 && period <= 12)) return { error: 'Period must be between 1 and 12' };
  if (!/^\d{2}:\d{2}$/.test(body.start_time ?? '') || !/^\d{2}:\d{2}$/.test(body.end_time ?? '')) {
    return { error: 'Start and end times look like 09:00' };
  }
  if (body.end_time <= body.start_time) return { error: 'The lesson has to end after it starts' };

  const skip = ignoreId ? 'AND ts.id != ?' : '';
  const args = ignoreId ? [ignoreId] : [];

  const clash = db.prepare(
    `SELECT sub.name AS subject FROM timetable_slots ts
     JOIN class_subjects cs2 ON cs2.id = ts.class_subject_id
     JOIN subjects sub ON sub.id = cs2.subject_id
     WHERE cs2.class_id = ? AND ts.day_of_week = ? AND ts.period = ? ${skip}`
  ).get(cs.class_id, day, period, ...args);
  if (clash) {
    return { error: `${cs.class_name} already has ${clash.subject} in period ${period} that day`, conflict: true };
  }

  if (cs.teacher_id) {
    const busy = db.prepare(
      `SELECT c.name AS class_name FROM timetable_slots ts
       JOIN class_subjects cs2 ON cs2.id = ts.class_subject_id
       JOIN classes c ON c.id = cs2.class_id
       WHERE cs2.teacher_id = ? AND ts.day_of_week = ? AND ts.period = ? ${skip}`
    ).get(cs.teacher_id, day, period, ...args);
    if (busy) {
      return { error: `That teacher is already with ${busy.class_name} in period ${period} that day`, conflict: true };
    }
  }

  return { cs, day, period, start_time: body.start_time, end_time: body.end_time, room: body.room ?? null };
}

r.post('/timetable', requirePermission('curriculum.manage'), (req, res) => {
  const b = { ...(req.body ?? {}) };
  if (b.break_kind) {
    const pairing = breakPairing(b.class_id, b.break_kind);
    if (!pairing) return res.status(400).json({ error: 'A break is either short or long' });
    b.class_subject_id = pairing.id;
  } else if (b.subject_id && !b.class_subject_id) {
    const pairing = teachingPairing(b.class_id, Number(b.subject_id));
    if (!pairing) return res.status(400).json({ error: 'That subject is not one this school teaches' });
    b.class_subject_id = pairing.id;
  }
  const plan = planLesson(b);
  if (plan.error) return res.status(plan.conflict ? 409 : 400).json({ error: plan.error });

  const out = db.prepare(
    'INSERT INTO timetable_slots (class_subject_id, day_of_week, period, start_time, end_time, room) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(plan.cs.id, plan.day, plan.period, plan.start_time, plan.end_time, plan.room);

  audit({ user: req.user, action: 'create', entity: 'timetable_slots', entityId: out.lastInsertRowid,
          next: { class: plan.cs.class_name, subject: plan.cs.subject, day: plan.day, period: plan.period },
          ip: req.ip });
  res.status(201).json(db.prepare('SELECT * FROM timetable_slots WHERE id = ?').get(out.lastInsertRowid));
});

/**
 * Moves or rewrites a lesson that is already on the timetable.
 *
 * A week is edited far more often than it is laid out: a subject swaps period,
 * a room changes, a lesson runs longer. Deleting and re-adding to say so loses
 * the lesson's identity, and with it anything recorded against it.
 */
r.patch('/timetable/:id', requirePermission('curriculum.manage'), (req, res) => {
  const prev = db.prepare('SELECT * FROM timetable_slots WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Lesson not found' });

  const b = { ...(req.body ?? {}) };
  if (b.break_kind) {
    const klass = db.prepare(
      'SELECT class_id FROM class_subjects WHERE id = ?'
    ).get(prev.class_subject_id);
    const pairing = breakPairing(b.class_id ?? klass?.class_id, b.break_kind);
    if (!pairing) return res.status(400).json({ error: 'A break is either short or long' });
    b.class_subject_id = pairing.id;
  } else if (b.subject_id && !b.class_subject_id) {
    const owner = db.prepare('SELECT class_id FROM class_subjects WHERE id = ?').get(prev.class_subject_id);
    const pairing = teachingPairing(b.class_id ?? owner?.class_id, Number(b.subject_id));
    if (!pairing) return res.status(400).json({ error: 'That subject is not one this school teaches' });
    b.class_subject_id = pairing.id;
  }
  const plan = planLesson({
    class_subject_id: b.class_subject_id ?? prev.class_subject_id,
    day_of_week: b.day_of_week ?? prev.day_of_week,
    period: b.period ?? prev.period,
    start_time: b.start_time ?? prev.start_time,
    end_time: b.end_time ?? prev.end_time,
    room: 'room' in b ? b.room : prev.room,
  }, prev.id);
  if (plan.error) return res.status(plan.conflict ? 409 : 400).json({ error: plan.error });

  db.prepare(
    `UPDATE timetable_slots SET class_subject_id = ?, day_of_week = ?, period = ?,
            start_time = ?, end_time = ?, room = ? WHERE id = ?`
  ).run(plan.cs.id, plan.day, plan.period, plan.start_time, plan.end_time, plan.room, prev.id);

  audit({ user: req.user, action: 'update', entity: 'timetable_slots', entityId: prev.id,
          prev, next: { class: plan.cs.class_name, subject: plan.cs.subject, day: plan.day, period: plan.period },
          ip: req.ip });
  res.json(db.prepare('SELECT * FROM timetable_slots WHERE id = ?').get(prev.id));
});

/**
 * Exchanges two lessons on the week.
 *
 * Moving one onto the other is what a person means by swapping, but doing it as
 * two moves is impossible: the first would land on a period that is still
 * taken. So both change places at once, with the same rule applied to each —
 * neither lesson may leave a teacher in two rooms, and neither may land where a
 * third lesson already sits.
 */
r.post('/timetable/swap', requirePermission('curriculum.manage'), (req, res) => {
  const one = db.prepare('SELECT * FROM timetable_slots WHERE id = ?').get(req.body?.a);
  const two = db.prepare('SELECT * FROM timetable_slots WHERE id = ?').get(req.body?.b);
  if (!one || !two) return res.status(404).json({ error: 'Lesson not found' });
  if (one.id === two.id) return res.json({ ok: true });

  const detail = (slot) => db.prepare(
    `SELECT cs.class_id, cs.teacher_id, c.name AS class_name, sub.name AS subject
     FROM class_subjects cs JOIN classes c ON c.id = cs.class_id
     JOIN subjects sub ON sub.id = cs.subject_id WHERE cs.id = ?`
  ).get(slot.class_subject_id);

  const a = detail(one);
  const b = detail(two);

  const blocked = (who, day, period) => {
    const clash = db.prepare(
      `SELECT sub.name AS subject FROM timetable_slots ts
       JOIN class_subjects cs ON cs.id = ts.class_subject_id
       JOIN subjects sub ON sub.id = cs.subject_id
       WHERE cs.class_id = ? AND ts.day_of_week = ? AND ts.period = ? AND ts.id NOT IN (?, ?)`
    ).get(who.class_id, day, period, one.id, two.id);
    if (clash) return `${who.class_name} already has ${clash.subject} in period ${period} that day`;

    if (!who.teacher_id) return null;
    const busy = db.prepare(
      `SELECT c.name AS class_name FROM timetable_slots ts
       JOIN class_subjects cs ON cs.id = ts.class_subject_id
       JOIN classes c ON c.id = cs.class_id
       WHERE cs.teacher_id = ? AND ts.day_of_week = ? AND ts.period = ? AND ts.id NOT IN (?, ?)`
    ).get(who.teacher_id, day, period, one.id, two.id);
    return busy ? `That teacher is already with ${busy.class_name} in period ${period} that day` : null;
  };

  const refusal = blocked(a, two.day_of_week, two.period) ?? blocked(b, one.day_of_week, one.period);
  if (refusal) return res.status(409).json({ error: refusal });

  const put = db.prepare(
    'UPDATE timetable_slots SET day_of_week = ?, period = ?, start_time = ?, end_time = ? WHERE id = ?'
  );
  db.transaction(() => {
    put.run(two.day_of_week, two.period, two.start_time, two.end_time, one.id);
    put.run(one.day_of_week, one.period, one.start_time, one.end_time, two.id);
  })();

  audit({ user: req.user, action: 'update', entity: 'timetable_slots', entityId: one.id,
          prev: { subject: a.subject, day: one.day_of_week, period: one.period },
          next: { swapped_with: b.subject, day: two.day_of_week, period: two.period }, ip: req.ip });

  res.json({ ok: true, swapped: [a.subject, b.subject] });
});

r.delete('/timetable/:id', requirePermission('curriculum.manage'), (req, res) => {
  const prev = db.prepare('SELECT * FROM timetable_slots WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Lesson not found' });
  db.prepare('DELETE FROM timetable_slots WHERE id = ?').run(prev.id);
  audit({ user: req.user, action: 'delete', entity: 'timetable_slots', entityId: prev.id, prev, ip: req.ip });
  res.json({ ok: true });
});

/* ── IEP / SEN register ───────────────────────────────────────────────────── */

r.get('/iep', requireRole('admin', 'teacher'), (req, res) => {
  const scope = req.user.role === 'teacher' ? teacherClassIds(req.user.id) : null;
  if (scope && !scope.length) return res.json([]);

  res.json(db.prepare(
    `SELECT iep.*, s.student_code, u.first_name, u.last_name, c.name AS class_name,
            senco.first_name || ' ' || senco.last_name AS senco_name
     FROM iep_profiles iep JOIN students s ON s.id = iep.student_id
     JOIN users u ON u.id = s.user_id LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN users senco ON senco.id = iep.senco_id
     WHERE ${IS_SEN}${scope ? ` AND s.class_id IN (${scope.map(() => '?').join(',')})` : ''}
     ORDER BY u.first_name`
  ).all(...(scope ?? [])).map((x) => ({ ...x, needs: JSON.parse(x.needs || '[]') })));
});

r.put('/iep/:studentId', requirePermission('sen.manage'), (req, res) => {
  const b = req.body ?? {};
  const prev = db.prepare('SELECT * FROM iep_profiles WHERE student_id = ?').get(req.params.studentId);
  db.prepare(
    `INSERT INTO iep_profiles (student_id, needs, time_multiplier, multi_format_approved, scribe_allowed, rest_breaks, notes, review_date, senco_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (student_id) DO UPDATE SET
       needs = excluded.needs, time_multiplier = excluded.time_multiplier,
       multi_format_approved = excluded.multi_format_approved, scribe_allowed = excluded.scribe_allowed,
       rest_breaks = excluded.rest_breaks, notes = excluded.notes, review_date = excluded.review_date,
       senco_id = excluded.senco_id, updated_at = datetime('now')`
  ).run(req.params.studentId, JSON.stringify(b.needs ?? []), Number(b.time_multiplier) || 1.0,
        b.multi_format_approved ? 1 : 0, b.scribe_allowed ? 1 : 0, b.rest_breaks ? 1 : 0,
        b.notes ?? null, b.review_date ?? null, b.senco_id ?? req.user.id);
  audit({ user: req.user, action: 'update', entity: 'iep_profiles', entityId: req.params.studentId, prev, next: b, ip: req.ip });
  const out = db.prepare('SELECT * FROM iep_profiles WHERE student_id = ?').get(req.params.studentId);
  res.json({ ...out, needs: JSON.parse(out.needs || '[]') });
});

/** Removes a plan. The pupil keeps their record; only the entitlements go. */
r.delete('/iep/:studentId', requirePermission('sen.manage'), (req, res) => {
  const prev = db.prepare('SELECT * FROM iep_profiles WHERE student_id = ?').get(req.params.studentId);
  if (!prev) return res.status(404).json({ error: 'That pupil has no support plan' });

  db.prepare('DELETE FROM iep_profiles WHERE student_id = ?').run(prev.student_id);
  audit({ user: req.user, action: 'delete', entity: 'iep_profiles', entityId: prev.student_id,
          prev, ip: req.ip });
  res.json({ ok: true });
});

/* ── Support plans, a year group at a time ────────────────────────────────── */

export const SUPPORT_IMPORT_COLUMNS = [
  'student_code', 'email', 'needs', 'extra_time', 'multi_format', 'scribe', 'rest_breaks',
  'review_date', 'notes',
];


/**
 * Checks one support row.
 *
 * Extra time is read as a school writes it: 1.5, "x1.5" or "50%" all mean the
 * same half again, because a spreadsheet coming from a SENCO will use whichever
 * of those they think in.
 */
function checkSupportRow(row, line, seen) {
  const value = (k) => (row[k] == null ? '' : String(row[k]).trim());
  const support = readSupport(row);
  const out = {
    line,
    student_code: value('student_code'),
    email: value('email').toLowerCase(),
    ...support,
  };

  const pupil = out.student_code
    ? db.prepare(
        `SELECT s.id, s.student_code, u.first_name, u.last_name FROM students s JOIN users u ON u.id = s.user_id
         WHERE lower(s.student_code) = lower(?)`
      ).get(out.student_code)
    : out.email
      ? db.prepare(
          `SELECT s.id, s.student_code, u.first_name, u.last_name FROM students s JOIN users u ON u.id = s.user_id
           WHERE lower(u.email) = lower(?)`
        ).get(out.email)
      : null;

  if (!out.student_code && !out.email) out.errors.push('A pupil number or an email is needed');
  else if (!pupil) out.errors.push(`No pupil matching ${out.student_code || out.email}`);
  else {
    out.student_id = pupil.id;
    out.name = `${pupil.first_name} ${pupil.last_name}`;
    if (seen.has(pupil.id)) out.errors.push('That pupil appears twice in this file');
    seen.add(pupil.id);
    if (db.prepare('SELECT 1 FROM iep_profiles WHERE student_id = ?').get(pupil.id)) {
      out.warnings.push('Replaces the plan they already have');
      out.replaces = true;
    }
  }

  // A row that names no need and grants nothing is classroom support, which is
  // worth keeping for any pupil. It is only empty if it says nothing at all.
  if (!out.is_sen) {
    out.warnings.push(out.notes
      ? 'Notes for staff. Not a SEN plan, so not on the register'
      : 'This row says nothing about the pupil');
  }

  out.status = out.errors.length ? 'error' : 'ready';
  return out;
}

r.post('/iep/import', requirePermission('sen.manage'), (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows) return res.status(400).json({ error: 'Send the rows to import' });
  if (rows.length > 500) return res.status(400).json({ error: 'Import at most 500 plans at a time' });

  const seen = new Set();
  const checked = rows.map((row, i) => checkSupportRow(row, i + 1, seen));
  const ready = checked.filter((r) => r.status === 'ready');
  const failed = checked.filter((r) => r.status === 'error');

  const summary = {
    total: checked.length,
    ready: ready.length,
    errors: failed.length,
    replacing: ready.filter((r) => r.replaces).length,
    with_extra_time: ready.filter((r) => r.time_multiplier > 1).length,
    sen: ready.filter((r) => r.is_sen).length,
    notes_only: ready.filter((r) => !r.is_sen).length,
  };

  if (req.body?.dry_run) return res.json({ rows: checked, summary, committed: false });
  if (failed.length && !req.body?.allow_partial) {
    return res.status(400).json({
      error: `${failed.length} row${failed.length === 1 ? '' : 's'} need fixing before this can be imported.`,
      rows: checked, summary, committed: false,
    });
  }
  if (!ready.length) return res.status(400).json({ error: 'There is nothing to import', rows: checked, summary });

  const upsert = db.prepare(
    `INSERT INTO iep_profiles (student_id, needs, time_multiplier, multi_format_approved, scribe_allowed,
                               rest_breaks, notes, review_date, senco_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (student_id) DO UPDATE SET
       needs = excluded.needs, time_multiplier = excluded.time_multiplier,
       multi_format_approved = excluded.multi_format_approved, scribe_allowed = excluded.scribe_allowed,
       rest_breaks = excluded.rest_breaks, notes = excluded.notes, review_date = excluded.review_date,
       senco_id = excluded.senco_id, updated_at = datetime('now')`
  );

  const created = db.transaction(() => ready.map((row) => {
    upsert.run(row.student_id, JSON.stringify(row.needs), row.time_multiplier,
               row.multi_format ? 1 : 0, row.scribe_allowed ? 1 : 0, row.rest_breaks ? 1 : 0,
               row.notes || null, row.review_date || null, req.user.id);
    return { line: row.line, student_id: row.student_id, name: row.name, replaced: !!row.replaces };
  }))();

  audit({ user: req.user, action: 'import', entity: 'iep_profiles', entityId: 'bulk',
          next: { ...summary, imported: created.length }, ip: req.ip });

  res.status(201).json({ rows: checked, summary: { ...summary, imported: created.length }, created, committed: true });
});

export default r;
