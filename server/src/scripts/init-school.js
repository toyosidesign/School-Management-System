/**
 * Sets up a brand new school: an empty database, the public website skeleton
 * and one administrator to sign in and fill it all out.
 *
 *   npm run init:school -- "Northgate Academy" you@school.org "Your Name"
 *
 * Nothing is invented beyond the structure. There are no pupils, staff,
 * classes, subjects or news, and the page content is placeholder copy in the
 * school's own words to replace. The administrator has no password: the script
 * prints a one-time link for them to choose their own, as an invitation does.
 *
 * It refuses to run over a database that already holds people unless --force is
 * given, and it always copies the old file aside first.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const force = args.includes('--force');
const [schoolName, email, fullName] = args.filter((a) => a !== '--force');

if (!schoolName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: npm run init:school -- "School Name" you@school.org "Your Name" [--force]');
  process.exit(1);
}

const dbPath = process.env.SMS_DB_PATH || path.join(__dirname, '../../data/school.db');

// Never quietly write over a school's records.
if (fs.existsSync(dbPath)) {
  const existing = new Database(dbPath, { readonly: true });
  const people = existing.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='users'").get().n
    ? existing.prepare('SELECT COUNT(*) n FROM users').get().n
    : 0;
  existing.close();

  if (people > 0 && !force) {
    console.error(`\n  ${dbPath}\n  already holds ${people} accounts. Add --force to replace it (a copy is kept).\n`);
    process.exit(1);
  }

  const aside = dbPath.replace(/\.db$/, '') + `-replaced-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.db`;
  fs.copyFileSync(dbPath, aside);
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
  console.log(`\n  Previous database copied to ${path.basename(aside)}`);
}

// Imported only now: the module opens the database at load time.
process.env.SMS_DB_PATH = dbPath;
const { db, migrate } = await import('../db/index.js');
const { hash } = await import('../lib/auth.js');
const { inviteLink, issueToken } = await import('../lib/invite.js');
const { applyStarter } = await import('../db/starter.js');
const { seedFinance } = await import('../db/chartOfAccounts.js');

migrate();

// A school year is named for the September it starts in.
const now = new Date();
const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
const { pages, slots } = applyStarter(db, { name: schoolName, academicYear: `${startYear}/${startYear + 1}` });
const finance = seedFinance(db);

const [first, ...rest] = (fullName ?? email.split('@')[0]).trim().split(/\s+/);
const last = rest.join(' ') || 'Admin';

const userId = db.transaction(() => {
  const u = db.prepare(
    `INSERT INTO users (role, email, password_hash, first_name, last_name)
     VALUES ('admin', ?, ?, ?, ?)`
  ).run(email, hash(crypto.randomBytes(32).toString('base64url')), first, last);
  db.prepare('INSERT INTO staff (user_id, staff_code, title, department) VALUES (?, ?, ?, ?)')
    .run(u.lastInsertRowid, 'STF-001', 'Head of School', 'Administration');
  return u.lastInsertRowid;
})();

const invite = db.prepare(
  `INSERT INTO account_invites (user_id, email, role, first_name, last_name, token_hash, token_hint, expires_at)
   VALUES (?, ?, 'admin', ?, ?, '', '', datetime('now'))`
).run(userId, email, first, last);
const { token } = issueToken(invite.lastInsertRowid, 7);

console.log(`\n  ${schoolName} is ready.\n`);
console.log(`    Academic year   ${startYear}/${startYear + 1}`);
console.log(`    Website         ${slots} content blocks across ${pages} pages, all placeholder`);
console.log(`    Finance         ${finance.accounts} accounts, financial year ${finance.year} open`);
console.log(`    People          1 administrator, ${first} ${last} <${email}>`);
console.log(`    Everything else empty: no pupils, staff, classes, subjects or news.`);
console.log('\n  Open this link to choose your password and start setting up:\n');
console.log(`    ${inviteLink(token)}\n`);
