import jwt from 'jsonwebtoken';
import { currentSchool } from './tenant.js';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const EXPIRES = process.env.JWT_EXPIRES_IN || '12h';

export const hash = (pw) => bcrypt.hashSync(pw, 10);
export const verify = (pw, digest) => bcrypt.compareSync(pw, digest);

export function sign(user) {
  // Stamped with the school it was issued for. Two schools both have a user 1,
  // and a token that did not say which one would quietly resolve to whoever
  // holds that id at whichever school it was presented to.
  return jwt.sign({ sub: user.id, role: user.role, school: currentSchool()?.slug ?? null },
                  SECRET, { expiresIn: EXPIRES });
}

/** Attaches req.user; also resolves req.student for student accounts. */
export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, SECRET);
    if ((payload.school ?? null) !== (currentSchool()?.slug ?? null)) {
      return res.status(401).json({ error: 'That sign-in belongs to a different school' });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(payload.sub);
    if (!user) return res.status(401).json({ error: 'Account not found or disabled' });
    delete user.password_hash;
    req.user = user;
    if (user.role === 'student') {
      req.student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(user.id);
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please sign in again' });
  }
}

/** RBAC across the 4 tiers (PRD §5). */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

/**
 * The acts that decide who else may run the school.
 *
 * Granting administration, and closing a financial year, are the two things
 * that cannot be undone by the person they are done to: an administrator who
 * can appoint administrators can lock the owner out of their own school, and a
 * closed year is meant to stay closed. Everything else an administrator does
 * is day-to-day office work and stays open to all of them.
 */
export const isSuperAdmin = (user) => user?.role === 'admin' && !!user.is_super_admin;

export function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'admin' || !req.user.is_super_admin) {
    return res.status(403).json({ error: 'Only a super administrator can do this' });
  }
  next();
}

/** A parent may only read data for children they are a verified guardian of. */
export function guardsStudent(userId, studentId) {
  return !!db
    .prepare('SELECT 1 FROM guardianships WHERE parent_user_id = ? AND student_id = ? AND is_verified = 1')
    .get(userId, studentId);
}

/**
 * Every class a teacher is connected to, either by teaching a subject in it or
 * by being its homeroom teacher. This is the boundary of what they may read.
 */
export function teacherClassIds(userId) {
  return db
    .prepare(
      `SELECT DISTINCT class_id FROM (
         SELECT class_id FROM class_subjects WHERE teacher_id = ?
         UNION SELECT id AS class_id FROM classes WHERE homeroom_teacher_id = ?
       ) WHERE class_id IS NOT NULL`
    )
    .all(userId, userId)
    .map((r) => r.class_id);
}

/** Does this teacher teach the class this student is in? */
export function teachesStudent(userId, studentId) {
  return !!db
    .prepare(
      `SELECT 1 FROM students s
       WHERE s.id = ? AND s.class_id IN (
         SELECT class_id FROM class_subjects WHERE teacher_id = ?
         UNION SELECT id FROM classes WHERE homeroom_teacher_id = ?
       )`
    )
    .get(studentId, userId, userId);
}

export function teachesClass(userId, classId) {
  return !!db
    .prepare(
      `SELECT 1 FROM classes c WHERE c.id = ? AND (
         c.homeroom_teacher_id = ?
         OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id = c.id AND cs.teacher_id = ?)
       )`
    )
    .get(classId, userId, userId);
}

export function teachesClassSubject(userId, classSubjectId) {
  return !!db
    .prepare(
      `SELECT 1 FROM class_subjects cs JOIN classes c ON c.id = cs.class_id
       WHERE cs.id = ? AND (cs.teacher_id = ? OR c.homeroom_teacher_id = ?)`
    )
    .get(classSubjectId, userId, userId);
}

/**
 * Central check: can this user see this student's record at all?
 * Teachers are scoped to their own classes. A student record carries medical
 * notes, home address and emergency contacts, so a school-wide read for every
 * member of staff is more access than the job needs.
 */
export function canAccessStudent(req, studentId) {
  const id = Number(studentId);
  if (req.user.role === 'admin') return true;
  if (req.user.role === 'teacher') return teachesStudent(req.user.id, id);
  if (req.user.role === 'student') return req.student?.id === id;
  if (req.user.role === 'parent') return guardsStudent(req.user.id, id);
  return false;
}

/** Standard refusal, so the wording is identical everywhere. */
export function denyStudentAccess(res) {
  return res.status(403).json({ error: 'You do not teach this student' });
}
