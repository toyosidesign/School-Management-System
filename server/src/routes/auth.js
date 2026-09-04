import { Router } from 'express';
import { db, audit } from '../db/index.js';
import { sign, verify, hash, authenticate, requireRole } from '../lib/auth.js';
import { issueCode, redeemCode, activeCodeFor } from '../lib/accessCode.js';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const avatarDir = path.join(__dirname, '../../uploads/avatars');
fs.mkdirSync(avatarDir, { recursive: true });

const AVATAR_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];
const AVATAR_SIGNATURES = {
  '.png': [[0x89, 0x50, 0x4e, 0x47]],
  '.jpg': [[0xff, 0xd8, 0xff]],
  '.jpeg': [[0xff, 0xd8, 0xff]],
  '.webp': [[0x52, 0x49, 0x46, 0x46]],
};

/** Bytes must match the extension: a renamed file is still whatever it was. */
function isRealImage(filePath, ext) {
  const expected = AVATAR_SIGNATURES[ext];
  if (!expected) return false;
  try {
    const fd = fs.openSync(filePath, 'r');
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
    return expected.some((sig) => sig.every((byte, i) => head[i] === byte));
  } catch {
    return false;
  }
}

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: avatarDir,
    filename: (req, file, cb) =>
      cb(null, `u${req.user.id}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  // The client downscales before sending, so anything large is a mistake.
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // SVG is excluded: it is a scriptable document served from our own origin.
    const ok = AVATAR_EXTS.includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Picture must be a PNG, JPG or WebP'), ok);
  },
});

const r = Router();

r.post('/login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(String(email).trim());
  if (!user || !verify(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  if (user.role === 'student') {
    return res.status(403).json({
      error: 'Pupils sign in with the code from their school, not a password.',
    });
  }
  if (!user.is_active) return res.status(403).json({ error: 'This account has been disabled' });

  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  audit({ user, action: 'login', entity: 'users', entityId: user.id, ip: req.ip });

  delete user.password_hash;
  res.json({ token: sign(user), user: profile(user.id) });
});

/**
 * Pupil sign-in. One short code, issued by the school, used once.
 *
 * Children lose passwords, share them, and cannot use an email reset link when
 * the account has no mailbox behind it. A code the school can reissue in
 * seconds is both safer and less work for everyone.
 */
r.post('/login-code', (req, res) => {
  const row = redeemCode(req.body?.code);
  if (!row) {
    return res.status(401).json({ error: 'That code is not valid. Ask your teacher for a new one.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  if (!user?.is_active) return res.status(403).json({ error: 'This account has been disabled' });

  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  audit({ user, action: 'login_code', entity: 'users', entityId: user.id, ip: req.ip });

  delete user.password_hash;
  res.json({ token: sign(user), user: profile(user.id) });
});

/**
 * Development convenience: sign in as a pupil without hunting for their code.
 *
 * Codes rotate on every seed, which makes demoing the pupil portal tedious.
 * This issues a fresh code for the named pupil and redeems it immediately, so
 * the real flow still runs end to end.
 *
 * Disabled in production, except on the demo deployment (SEED_DEMO=true, whose
 * pupils are synthetic), and always when DEV_PUPIL_LOGIN=0. It is refused before
 * it looks anything up, so a real production host cannot be talked into it.
 */
r.post('/dev-login', (req, res) => {
  if ((process.env.NODE_ENV === 'production' && process.env.SEED_DEMO !== 'true') || process.env.DEV_PUPIL_LOGIN === '0') {
    return res.status(404).json({ error: 'Endpoint not found' });
  }

  const identifier = String(req.body?.student ?? '').trim();
  const student = db.prepare(
    `SELECT s.id, s.student_code, u.id AS user_id, u.first_name, u.last_name
     FROM students s JOIN users u ON u.id = s.user_id
     WHERE u.role = 'student' AND u.is_active = 1
       AND (s.student_code = ? OR lower(u.email) = lower(?))`
  ).get(identifier, identifier);

  if (!student) return res.status(404).json({ error: 'No such pupil' });

  const { code } = issueCode(student.user_id, null, 24);
  const row = redeemCode(code);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);

  console.warn(`  Development sign-in used for ${student.student_code}. Never enable this in production.`);
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  audit({ user, action: 'login_dev', entity: 'users', entityId: user.id, ip: req.ip });

  delete user.password_hash;
  res.json({ token: sign(user), user: profile(user.id) });
});

/** Which pupils the development sign-in can be used for. */
r.get('/dev-pupils', (req, res) => {
  if ((process.env.NODE_ENV === 'production' && process.env.SEED_DEMO !== 'true') || process.env.DEV_PUPIL_LOGIN === '0') {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.json(db.prepare(
    `SELECT s.student_code, u.first_name, u.last_name, c.name AS class_name,
            iep.needs, iep.time_multiplier
     FROM students s JOIN users u ON u.id = s.user_id
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN iep_profiles iep ON iep.student_id = s.id
     WHERE u.role = 'student' AND u.is_active = 1 AND s.status = 'active'
     ORDER BY c.level DESC, u.first_name`
  ).all().map((r) => ({ ...r, needs: JSON.parse(r.needs || '[]') })));
});

r.get('/me', authenticate, (req, res) => res.json(profile(req.user.id)));

/**
 * Personalisation a person may change about themselves.
 *
 * Deliberately narrow: a pupil can set what they are called day to day and how
 * their avatar looks, but not their legal name, class, email or role. Those
 * stay with the school office, and changing them has consequences on registers
 * and reports.
 */
r.patch('/profile', authenticate, (req, res) => {
  const b = req.body ?? {};
  const updates = {};

  if ('preferred_name' in b) {
    const name = String(b.preferred_name ?? '').trim();
    if (name.length > 40) return res.status(400).json({ error: 'Preferred name must be 40 characters or fewer' });
    updates.preferred_name = name || null;
  }

  if ('avatar_colour' in b) {
    if (!/^#[0-9a-fA-F]{6}$/.test(String(b.avatar_colour))) {
      return res.status(400).json({ error: 'Colour must be a hex value such as #2563eb' });
    }
    updates.avatar_colour = b.avatar_colour;
  }

  if ('avatar_emoji' in b) {
    const emoji = String(b.avatar_emoji ?? '').trim();
    // One or two characters: enough for an emoji, not enough for a nickname
    // that would bypass the preferred-name length limit.
    if ([...emoji].length > 2) return res.status(400).json({ error: 'Choose a single emoji' });
    updates.avatar_emoji = emoji || null;
  }

  if ('locale' in b) {
    if (!/^[a-z]{2}$/.test(String(b.locale))) return res.status(400).json({ error: 'Unknown language' });
    updates.locale = b.locale;
  }

  const fields = Object.keys(updates);
  if (!fields.length) return res.json(profile(req.user.id));

  db.prepare(`UPDATE users SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`)
    .run(...fields.map((f) => updates[f]), req.user.id);

  audit({ user: req.user, action: 'profile_update', entity: 'users', entityId: req.user.id,
          next: updates, ip: req.ip });

  res.json(profile(req.user.id));
});

/** A profile picture, replacing the initials or emoji on this person's avatar. */
r.post('/profile/avatar', authenticate, avatarUpload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No picture was uploaded' });

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!isRealImage(req.file.path, ext)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: `That file does not appear to be a real ${ext.slice(1).toUpperCase()} image.` });
  }

  const previous = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(req.user.id)?.avatar_url;
  const url = `/uploads/avatars/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(url, req.user.id);

  // Only ever one picture per person on disk.
  if (previous?.startsWith('/uploads/avatars/')) {
    fs.rmSync(path.join(avatarDir, path.basename(previous)), { force: true });
  }

  audit({ user: req.user, action: 'avatar_update', entity: 'users', entityId: req.user.id,
          prev: { avatar_url: previous ?? null }, next: { avatar_url: url }, ip: req.ip });
  res.status(201).json(profile(req.user.id));
});

r.delete('/profile/avatar', authenticate, (req, res) => {
  const previous = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(req.user.id)?.avatar_url;
  db.prepare('UPDATE users SET avatar_url = NULL WHERE id = ?').run(req.user.id);
  if (previous?.startsWith('/uploads/avatars/')) {
    fs.rmSync(path.join(avatarDir, path.basename(previous)), { force: true });
  }
  audit({ user: req.user, action: 'avatar_update', entity: 'users', entityId: req.user.id,
          prev: { avatar_url: previous ?? null }, next: { avatar_url: null }, ip: req.ip });
  res.json(profile(req.user.id));
});

r.post('/change-password', authenticate, (req, res) => {
  if (req.user.role === 'student') {
    return res.status(403).json({ error: 'Pupils use a sign-in code and do not have a password to change.' });
  }
  const { currentPassword, newPassword } = req.body ?? {};
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!verify(currentPassword ?? '', row.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash(newPassword), req.user.id);
  audit({ user: req.user, action: 'password_change', entity: 'users', entityId: req.user.id, ip: req.ip });
  res.json({ ok: true });
});

/** Full profile: role-specific context the client needs on boot. */
export function profile(userId) {
  const user = db.prepare(
    `SELECT id, role, email, first_name, last_name, phone, avatar_colour, avatar_url, avatar_emoji,
            preferred_name, avatar_emoji, avatar_url, locale, is_senco, is_super_admin
     FROM users WHERE id = ?`
  ).get(userId);
  if (!user) return null;

  user.prefs = db.prepare('SELECT * FROM accessibility_prefs WHERE user_id = ?').get(userId) ?? null;

  if (user.role === 'student') {
    user.student = db.prepare(
      `SELECT s.*, c.name AS class_name, c.section, c.level
       FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.user_id = ?`
    ).get(userId);
    if (user.student) {
      user.iep = db.prepare('SELECT * FROM iep_profiles WHERE student_id = ?').get(user.student.id) ?? null;
      if (user.iep) user.iep.needs = JSON.parse(user.iep.needs || '[]');
    }
  }
  if (user.role === 'teacher' || user.role === 'admin') {
    user.staff = db.prepare('SELECT * FROM staff WHERE user_id = ?').get(userId) ?? null;
  }
  if (user.role === 'parent') {
    user.children = db.prepare(
      `SELECT s.id, s.student_code, u.first_name, u.last_name, u.avatar_colour, u.avatar_url, u.avatar_emoji,
              c.name AS class_name, c.section, g.relationship, g.is_primary
       FROM guardianships g
       JOIN students s ON s.id = g.student_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE g.parent_user_id = ? ORDER BY u.first_name`
    ).all(userId);
  }
  return user;
}

export default r;
