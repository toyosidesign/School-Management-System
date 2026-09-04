/**
 * Creates the first real administrator on a fresh deployment, or adds another
 * one later, without ever setting a password on somebody's behalf.
 *
 * The account is written with an unguessable hash and an activation link is
 * printed. Whoever it belongs to opens that link and chooses their own
 * password, exactly as an invited colleague would.
 *
 *   npm run create:admin -- you@school.org "Your Name"
 *
 * Run it again for the same address and it prints a fresh link rather than
 * refusing, so this doubles as the way back in if the last admin is locked out.
 */
import crypto from 'node:crypto';
import { db, migrate } from '../db/index.js';
import { hash } from '../lib/auth.js';
import { inviteLink, issueToken } from '../lib/invite.js';

const [email, fullName] = process.argv.slice(2);

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: npm run create:admin -- you@school.org "Your Name"');
  process.exit(1);
}

const [first, ...rest] = (fullName ?? email.split('@')[0]).trim().split(/\s+/);
const last = rest.join(' ') || 'Admin';

migrate();

const existing = db.prepare('SELECT id, role, first_name, last_name, last_login_at FROM users WHERE lower(email) = lower(?)').get(email);

const userId = existing ? existing.id : db.transaction(() => {
  const u = db.prepare(
    `INSERT INTO users (role, email, password_hash, first_name, last_name)
     VALUES ('admin', ?, ?, ?, ?)`
  ).run(email, hash(crypto.randomBytes(32).toString('base64url')), first, last);

  db.prepare('INSERT INTO staff (user_id, staff_code, title, department) VALUES (?, ?, ?, ?)')
    .run(u.lastInsertRowid, `STF-${100 + Number(u.lastInsertRowid)}`, 'Head of School', 'Administration');
  return u.lastInsertRowid;
})();

if (existing && existing.role !== 'admin') {
  db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(userId);
  console.log(`Existing ${existing.role} account promoted to administrator.`);
}

// Any link still outstanding for this person stops working.
db.prepare(
  `UPDATE account_invites SET revoked_at = datetime('now')
   WHERE user_id = ? AND accepted_at IS NULL AND revoked_at IS NULL`
).run(userId);

const invite = db.prepare(
  `INSERT INTO account_invites (user_id, email, role, first_name, last_name, token_hash, token_hint, expires_at)
   VALUES (?, ?, 'admin', ?, ?, '', '', datetime('now'))`
).run(userId, email, first, last);

const { token, expires_at } = issueToken(invite.lastInsertRowid, 7);

const verb = !existing ? 'Administrator created:'
  : existing.last_login_at ? 'Password reset for' : 'Activation link reissued for';
console.log(`\n  ${verb} ${existing?.first_name ?? first} ${existing?.last_name ?? last} <${email}>`);
console.log('\n  Open this link to choose your password:\n');
console.log(`    ${inviteLink(token)}\n`);
console.log(`  It works once and expires ${new Date(expires_at).toDateString()}.\n`);
