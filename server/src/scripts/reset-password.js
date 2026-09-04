/**
 * Resets a password on any school this deployment holds.
 *
 *   npm run reset:password -- --list
 *   npm run reset:password -- ada@school.org
 *   npm run reset:password -- "Ada Bello" --school northgate
 *   npm run reset:password -- ada@school.org "NewPassw0rd" --school northgate
 *
 * The first argument is whatever you call the account: its email, or a name,
 * whole or partial. Say the school with --school <slug> when you know it; leave
 * it off and every school is searched, so a match comes back named with the
 * school it is in. Either way, with no password a fresh activation link is
 * issued (on that school's own address, where the token is valid), and with a
 * password it is set directly.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- arguments: flags in any position, two positionals (who, password) -------
const raw = process.argv.slice(2);
let schoolSlug = null;
let list = false;
const pos = [];
for (let i = 0; i < raw.length; i++) {
  const a = raw[i];
  if (a === '--list') list = true;
  else if (a === '--school' || a === '-s') schoolSlug = raw[++i];
  else if (a.startsWith('--school=')) schoolSlug = a.slice('--school='.length);
  else pos.push(a);
}
const [who, newPassword] = pos;

const { defaultDb, runWithSchool } = await import('../db/index.js');
const { registry, findSchool, connectionFor } = await import('../db/registry.js');
const { hash } = await import('../lib/auth.js');
const { issueToken, INVITABLE_ROLES } = await import('../lib/invite.js');

// The schools this deployment holds, plus the default database a single-school
// install (or a leftover seed) keeps its people in.
const schools = registry.prepare('SELECT * FROM schools ORDER BY name').all();
const defaultHasUsers =
  defaultDb.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='users'").get().n > 0 &&
  defaultDb.prepare('SELECT COUNT(*) n FROM users').get().n > 0;

/** A place to look: a registered school, or the fallback database. */
const asTarget = (school) => ({ slug: school.slug, name: school.name, status: school.status, conn: connectionFor(school) });
const targets = [
  ...schools.map(asTarget),
  ...(defaultHasUsers ? [{ slug: null, name: '(default database)', status: 'active', conn: defaultDb }] : []),
];

if (list) {
  console.log('\n  Schools on this deployment:\n');
  if (!targets.length) console.log('    none yet.');
  for (const t of targets) {
    const n = t.conn.prepare('SELECT COUNT(*) n FROM users').get().n;
    console.log(`    ${(t.slug ?? '(default)').padEnd(24)} ${t.name}  ${t.status === 'active' ? '' : `[${t.status}] `}${n} accounts`);
  }
  console.log('');
  process.exit(0);
}

if (!who || !who.trim()) {
  console.error('Usage: npm run reset:password -- "<email or name>" [new password] [--school <slug>]');
  console.error('       npm run reset:password -- --list');
  process.exit(1);
}

// --- narrow to the schools to search ----------------------------------------
let searchIn = targets;
if (schoolSlug) {
  const school = findSchool(schoolSlug);
  if (!school) {
    console.error(`\n  No school at "${schoolSlug}". Try one of:\n`);
    for (const t of targets) if (t.slug) console.error(`    ${t.slug}  (${t.name})`);
    console.error('\n  or --list to see them all.\n');
    process.exit(1);
  }
  searchIn = [asTarget(school)];
}

// --- find the account, across whichever schools are in scope -----------------
const term = who.trim();
const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(term);

function findUsers(conn) {
  return isEmail
    ? conn.prepare('SELECT id, role, email, first_name, last_name FROM users WHERE lower(email) = lower(?)').all(term)
    : conn.prepare(
        `SELECT id, role, email, first_name, last_name FROM users
          WHERE lower(first_name || ' ' || last_name) = lower(?)
             OR lower(first_name || ' ' || last_name) LIKE ?
             OR lower(email) LIKE ?
          ORDER BY (lower(first_name || ' ' || last_name) = lower(?)) DESC, first_name`
      ).all(term, `%${term.toLowerCase()}%`, `%${term.toLowerCase()}%`, term);
}

const hits = [];
for (const t of searchIn) for (const user of findUsers(t.conn)) hits.push({ school: t, user });

const where = schoolSlug ? `"${schoolSlug}"` : `${searchIn.length} school${searchIn.length === 1 ? '' : 's'}`;
if (hits.length === 0) {
  console.error(`\n  No account matches "${term}" in ${where}.\n`);
  process.exit(1);
}
if (hits.length > 1) {
  console.error(`\n  "${term}" matches ${hits.length} accounts. Say which with --school <slug>:\n`);
  for (const h of hits) {
    console.error(`    ${(h.school.slug ?? '(default)').padEnd(20)} ${h.user.first_name} ${h.user.last_name} <${h.user.email}>  (${h.user.role})`);
  }
  console.error('');
  process.exit(1);
}

const { school, user } = hits[0];
const label = `${user.first_name} ${user.last_name} <${user.email}>`;
const at = school.slug ? ` at ${school.name}` : '';

/** The school's own address, where its activation tokens are valid. */
function activationUrl(slug, token) {
  let url;
  try { url = new URL(process.env.PUBLIC_URL || 'http://localhost:5173'); }
  catch { url = new URL('http://localhost:5173'); }
  if (slug) url.hostname = `${slug}.${url.hostname}`;
  url.pathname = `/activate/${token}`;
  url.search = '';
  return url.toString();
}

// --- do the reset, against that one school's database ------------------------
if (newPassword != null) {
  if (String(newPassword).length < 8) {
    console.error('\n  The password needs at least 8 characters.\n');
    process.exit(1);
  }
  runWithSchool(school.conn, () => {
    school.conn.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash(String(newPassword)), user.id);
    school.conn.prepare(
      "UPDATE account_invites SET revoked_at = datetime('now') WHERE user_id = ? AND accepted_at IS NULL AND revoked_at IS NULL"
    ).run(user.id);
  });
  console.log(`\n  Password set for ${label}${at}.\n`);
  process.exit(0);
}

if (!INVITABLE_ROLES.includes(user.role)) {
  console.error(
    `\n  ${user.email} is a ${user.role} account, which does not use activation links.\n` +
    `  Give a new password to set it directly:\n\n` +
    `    npm run reset:password -- "${user.email}" "<new password>"${school.slug ? ` --school ${school.slug}` : ''}\n`
  );
  process.exit(1);
}

const token = runWithSchool(school.conn, () => {
  school.conn.prepare(
    "UPDATE account_invites SET revoked_at = datetime('now') WHERE user_id = ? AND accepted_at IS NULL AND revoked_at IS NULL"
  ).run(user.id);
  const invite = school.conn.prepare(
    `INSERT INTO account_invites (user_id, email, role, first_name, last_name, token_hash, token_hint, expires_at)
     VALUES (?, ?, ?, ?, ?, '', '', datetime('now'))`
  ).run(user.id, user.email, user.role, user.first_name, user.last_name);
  return issueToken(invite.lastInsertRowid, 7).token;
});

console.log(`\n  A password-reset link for ${label}${at}, valid 7 days:\n`);
console.log(`    ${activationUrl(school.slug, token)}\n`);
