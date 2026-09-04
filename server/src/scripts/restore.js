/**
 * Restores a snapshot taken by backup.js. The database currently in place is
 * itself copied aside first, so a restore is never a one-way door.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.SMS_DB_PATH || path.join(__dirname, '../../data/school.db');
const BACKUP_DIR = process.env.SMS_BACKUP_DIR || path.join(__dirname, '../../backups');

const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const assumeYes = process.argv.includes('--yes');

if (!arg) {
  console.error('\n  Usage: npm run restore -- <snapshot filename>\n  List them with: npm run backup -- --list\n');
  process.exit(1);
}

const source = path.isAbsolute(arg) ? arg : path.join(BACKUP_DIR, arg);
if (!fs.existsSync(source)) {
  console.error(`\n  No such snapshot: ${source}\n`);
  process.exit(1);
}

const staging = `${DB_PATH}.restoring`;
await new Promise((resolve, reject) => {
  fs.createReadStream(source)
    .pipe(zlib.createGunzip())
    .pipe(fs.createWriteStream(staging))
    .on('finish', resolve)
    .on('error', reject);
});

// Never overwrite a live database with a snapshot that is itself damaged.
// A file that is not a database at all throws on open, so this covers both.
let summary;
try {
  const verify = new Database(staging, { readonly: true, fileMustExist: true });
  const check = verify.pragma('integrity_check', { simple: true });
  if (check !== 'ok') throw new Error(`integrity check reported "${check}"`);
  summary = {
    students: verify.prepare("SELECT COUNT(*) n FROM students WHERE status='active'").get().n,
    users: verify.prepare('SELECT COUNT(*) n FROM users').get().n,
  };
  verify.close();
} catch (err) {
  fs.rmSync(staging, { force: true });
  console.error(`\n  That snapshot is not a usable database: ${err.message}`);
  console.error('  Nothing has been changed.\n');
  process.exit(1);
}

console.log(`\n  Snapshot: ${path.basename(source)}`);
console.log(`  Contains: ${summary.students} active pupils, ${summary.users} accounts`);
console.log(`  Target:   ${DB_PATH}\n`);

if (!assumeYes && process.stdin.isTTY) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('  This replaces the current database. Type "restore" to continue: ');
  rl.close();
  if (answer.trim() !== 'restore') {
    fs.rmSync(staging, { force: true });
    console.log('\n  Cancelled. Nothing has been changed.\n');
    process.exit(0);
  }
}

if (fs.existsSync(DB_PATH)) {
  const aside = `${DB_PATH}.replaced-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  fs.copyFileSync(DB_PATH, aside);
  console.log(`\n  Previous database kept at ${path.basename(aside)}`);
}

for (const suffix of ['-wal', '-shm']) fs.rmSync(DB_PATH + suffix, { force: true });
fs.renameSync(staging, DB_PATH);

console.log(`  Restored. Restart the server to pick it up.\n`);
