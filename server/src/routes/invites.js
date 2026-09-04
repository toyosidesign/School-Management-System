import { Router } from 'express';
import { db, audit, notify } from '../db/index.js';
import { sign, hash, authenticate, requireRole } from '../lib/auth.js';
import { requirePermission } from '../lib/permissions.js';
import { INVITABLE_ROLES, findByToken, inviteLink, isLive, issueToken, statusOf } from '../lib/invite.js';
import { profile } from './auth.js';

const r = Router();

const schoolName = () =>
  db.prepare('SELECT name FROM school_settings WHERE id = 1').get()?.name ?? 'the school';

/**
 * Three shapes of the same page. A brand new account, an account the school
 * created that its owner has never signed into, and a password reset for
 * somebody already using the system. Only the last of those leaves the name
 * fields out, because by then the name is theirs to change in settings.
 */
const kindOf = (invite) => {
  if (!invite.user_id) return 'new_account';
  const owner = db.prepare('SELECT last_login_at FROM users WHERE id = ?').get(invite.user_id);
  return owner?.last_login_at ? 'password_reset' : 'first_sign_in';
};

const publicView = (invite) => ({
  kind: kindOf(invite),
  first_name: invite.first_name,
  last_name: invite.last_name,
  email: invite.email,
  role: invite.role,
  message: invite.message,
  expires_at: invite.expires_at,
  school: schoolName(),
  child: invite.student_id
    ? db.prepare(
        `SELECT u.first_name || ' ' || u.last_name AS name, c.name AS class_name
         FROM students s JOIN users u ON u.id = s.user_id
         LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`
      ).get(invite.student_id)
    : null,
});

/* ── Accepting an invitation (no token required, this is how you get one) ─── */

/** What the activation page shows before anyone types a password. */
r.get('/token/:token', (req, res) => {
  const invite = findByToken(req.params.token);
  if (!isLive(invite)) {
    return res.status(410).json({ error: 'This invitation is no longer valid. Ask the school to send a new one.' });
  }
  res.json(publicView(invite));
});

/**
 * Creates the account. Until this point no user row exists at all, so an
 * invitation that is never opened leaves nothing behind to be signed into.
 */
r.post('/token/:token/accept', (req, res) => {
  const invite = findByToken(req.params.token);
  if (!isLive(invite)) {
    return res.status(410).json({ error: 'This invitation is no longer valid. Ask the school to send a new one.' });
  }

  const b = req.body ?? {};
  const password = String(b.password ?? '');
  if (password.length < 8) {
    return res.status(400).json({ error: 'Choose a password of at least 8 characters' });
  }
  if (password.toLowerCase() === invite.email.toLowerCase()) {
    return res.status(400).json({ error: 'Your password cannot be your email address' });
  }

  const taken = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(invite.email);
  if (taken && taken.id !== invite.user_id) {
    return res.status(409).json({ error: 'An account already exists for this address. Try signing in instead.' });
  }

  const first = String(b.first_name ?? invite.first_name).trim() || invite.first_name;
  const last = String(b.last_name ?? invite.last_name).trim() || invite.last_name;

  // An invite against an existing record only ever sets the password. Nothing
  // a person types on the activation page can change their role or their links
  // to children: those stay the school's to decide.
  if (invite.user_id) {
    // Somebody signing in for the first time may still be correcting how the
    // office spelled their name. Once they have signed in before, the name on
    // the record is theirs to change in settings, not through a reset link.
    const naming = kindOf(invite) === 'first_sign_in';
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?').run(hash(password), invite.user_id);
      if (naming) {
        db.prepare('UPDATE users SET first_name = ?, last_name = ?, phone = COALESCE(?, phone) WHERE id = ?')
          .run(first, last, b.phone || null, invite.user_id);
      }
      db.prepare("UPDATE account_invites SET accepted_at = datetime('now'), accepted_user_id = ? WHERE id = ?")
        .run(invite.user_id, invite.id);
    })();
    const existing = db.prepare('SELECT id, role, first_name, last_name FROM users WHERE id = ?').get(invite.user_id);
    audit({ user: existing, action: 'password_set', entity: 'users', entityId: existing.id,
            next: { invite_id: invite.id }, ip: req.ip });
    return res.status(200).json({ token: sign(existing), user: profile(existing.id) });
  }

  const userId = db.transaction(() => {
    const u = db.prepare(
      `INSERT INTO users (role, email, password_hash, first_name, last_name, phone)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(invite.role, invite.email, hash(password), first, last, b.phone ?? invite.phone ?? null);
    const id = u.lastInsertRowid;

    if (invite.role === 'admin' || invite.role === 'teacher') {
      db.prepare('INSERT INTO staff (user_id, staff_code, title, department) VALUES (?, ?, ?, ?)')
        .run(id, `STF-${100 + Number(id)}`, invite.title ?? null, invite.department ?? null);
    }
    // A guardian is linked to their child by the school, never by themselves.
    if (invite.role === 'parent' && invite.student_id) {
      db.prepare(
        `INSERT OR IGNORE INTO guardianships (parent_user_id, student_id, relationship, is_primary, is_verified)
         VALUES (?, ?, ?, 0, 1)`
      ).run(id, invite.student_id, invite.relationship ?? 'Parent');
    }

    db.prepare("UPDATE account_invites SET accepted_at = datetime('now'), accepted_user_id = ? WHERE id = ?")
      .run(id, invite.id);
    return id;
  })();

  const user = db.prepare('SELECT id, role, first_name, last_name FROM users WHERE id = ?').get(userId);
  audit({ user, action: 'account_create', entity: 'users', entityId: userId,
          next: { role: invite.role, email: invite.email, invite_id: invite.id }, ip: req.ip });

  if (invite.invited_by) {
    notify(invite.invited_by, {
      title: 'Invitation accepted',
      body: `${first} ${last} has set up their account.`,
      kind: 'info',
      link: invite.role === 'parent' ? '/admin/students' : '/admin/staff',
    });
  }

  res.status(201).json({ token: sign(user), user: profile(userId) });
});

/* ── Managing invitations (school leadership only) ────────────────────────── */
r.use(authenticate);
r.use(requirePermission('invites.manage'));

r.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT i.*, u.first_name || ' ' || u.last_name AS invited_by_name,
            su.first_name || ' ' || su.last_name AS child_name
     FROM account_invites i
     LEFT JOIN users u ON u.id = i.invited_by
     LEFT JOIN students s ON s.id = i.student_id
     LEFT JOIN users su ON su.id = s.user_id
     ORDER BY i.created_at DESC LIMIT 200`
  ).all();
  // Never send the hash out, even to an administrator.
  res.json(rows.map(({ token_hash, token_hint, ...i }) => ({ ...i, status: statusOf(i) })));
});

r.post('/', (req, res) => {
  const b = req.body ?? {};

  // Inviting somebody who already has a record: they set a password, nothing
  // else. Useful for a new teacher added to the roster, or anyone locked out.
  if (b.user_id) {
    const person = db.prepare('SELECT id, role, email, first_name, last_name FROM users WHERE id = ?').get(b.user_id);
    if (!person) return res.status(404).json({ error: 'That person no longer exists' });
    if (person.role === 'student') {
      return res.status(400).json({ error: 'Pupils sign in with an access code. Issue a new code instead.' });
    }
    db.prepare(
      `UPDATE account_invites SET revoked_at = datetime('now')
       WHERE user_id = ? AND accepted_at IS NULL AND revoked_at IS NULL`
    ).run(person.id);

    const out = db.prepare(
      `INSERT INTO account_invites (user_id, email, role, first_name, last_name, message,
                                    token_hash, token_hint, invited_by, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, '', '', ?, datetime('now'))`
    ).run(person.id, person.email, person.role, person.first_name, person.last_name,
          b.message ?? null, req.user.id);

    const issued = issueToken(out.lastInsertRowid, Number(b.days) || 7);
    audit({ user: req.user, action: 'invite_create', entity: 'account_invites', entityId: out.lastInsertRowid,
            next: { user_id: person.id, kind: 'password_reset', expires_at: issued.expires_at }, ip: req.ip });

    const row = db.prepare('SELECT * FROM account_invites WHERE id = ?').get(out.lastInsertRowid);
    const { token_hash: _h, token_hint: _t, ...safe } = row;
    return res.status(201).json({ ...safe, status: 'pending', link: inviteLink(issued.token, req) });
  }

  const email = String(b.email ?? '').trim().toLowerCase();
  const role = String(b.role ?? '');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  if (!INVITABLE_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Pupils sign in with an access code and cannot be invited by email' });
  }
  if (!b.first_name || !b.last_name) {
    return res.status(400).json({ error: 'First and last name are required' });
  }
  if (db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(email)) {
    return res.status(409).json({ error: 'Someone already has an account with that address' });
  }
  if (role === 'parent' && b.student_id) {
    const child = db.prepare('SELECT id FROM students WHERE id = ?').get(b.student_id);
    if (!child) return res.status(400).json({ error: 'That pupil no longer exists' });
  }

  // One open invitation per address. Inviting again replaces the old link.
  db.prepare(
    `UPDATE account_invites SET revoked_at = datetime('now')
     WHERE lower(email) = ? AND accepted_at IS NULL AND revoked_at IS NULL`
  ).run(email);

  const out = db.prepare(
    `INSERT INTO account_invites (email, role, first_name, last_name, phone, title, department,
                                  student_id, relationship, message, token_hash, token_hint,
                                  invited_by, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, datetime('now'))`
  ).run(email, role, b.first_name, b.last_name, b.phone ?? null, b.title ?? null, b.department ?? null,
        role === 'parent' ? b.student_id ?? null : null, b.relationship ?? null, b.message ?? null,
        req.user.id);

  const { token, expires_at } = issueToken(out.lastInsertRowid, Number(b.days) || 7);
  audit({ user: req.user, action: 'invite_create', entity: 'account_invites', entityId: out.lastInsertRowid,
          next: { email, role, expires_at }, ip: req.ip });

  const invite = db.prepare('SELECT * FROM account_invites WHERE id = ?').get(out.lastInsertRowid);
  const { token_hash, token_hint, ...safe } = invite;
  // The link is returned once, for the school to send on. It is not stored.
  res.status(201).json({ ...safe, status: 'pending', link: inviteLink(token, req) });
});

/** A fresh link and a fresh clock, for an invite that expired or went astray. */
r.post('/:id/resend', (req, res) => {
  const invite = db.prepare('SELECT * FROM account_invites WHERE id = ?').get(req.params.id);
  if (!invite) return res.status(404).json({ error: 'Invitation not found' });
  if (invite.accepted_at) return res.status(409).json({ error: 'That invitation has already been used' });

  const { token, expires_at } = issueToken(invite.id, Number(req.body?.days) || 7);
  audit({ user: req.user, action: 'invite_resend', entity: 'account_invites', entityId: invite.id,
          next: { expires_at }, ip: req.ip });
  res.json({ id: invite.id, status: 'pending', expires_at, link: inviteLink(token, req) });
});

r.post('/:id/revoke', (req, res) => {
  const invite = db.prepare('SELECT * FROM account_invites WHERE id = ?').get(req.params.id);
  if (!invite) return res.status(404).json({ error: 'Invitation not found' });
  if (invite.accepted_at) {
    return res.status(409).json({ error: 'That invitation has been used. Deactivate the account instead.' });
  }
  db.prepare("UPDATE account_invites SET revoked_at = datetime('now') WHERE id = ?").run(invite.id);
  audit({ user: req.user, action: 'invite_revoke', entity: 'account_invites', entityId: invite.id, ip: req.ip });
  res.json({ ok: true });
});

export default r;
