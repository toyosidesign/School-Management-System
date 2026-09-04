/**
 * PRD §5 disaster recovery: point-in-time snapshots with retention.
 *
 * Uses SQLite's online backup API, so it is safe to run against a live database
 * without pausing writes or risking a torn copy. Snapshots are dated, gzipped,
 * and pruned on a two-tier schedule: daily copies kept for 30 days, and the
 * Sunday copy of each week kept for a year.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.SMS_DB_PATH || path.join(__dirname, '../../data/school.db');
const BACKUP_DIR = process.env.SMS_BACKUP_DIR || path.join(__dirname, '../../backups');
const DAILY_DAYS = Number(process.env.SMS_BACKUP_DAILY_DAYS) || 30;
const WEEKLY_DAYS = Number(process.env.SMS_BACKUP_WEEKLY_DAYS) || 365;

const listing = process.argv.includes('--list');

fs.mkdirSync(BACKUP_DIR, { recursive: true });

if (listing) {
  const files = snapshots();
  if (!files.length) {
    console.log('\n  No snapshots yet. Run `npm run backup` to take one.\n');
  } else {
    const total = files.reduce((n, f) => n + f.size, 0);
    console.log(`\n  ${files.length} snapshots in ${BACKUP_DIR}  (${mb(total)})\n`);
    for (const f of files) {
      console.log(`    ${f.name.padEnd(46)} ${mb(f.size).padStart(9)}   ${f.tier}`);
    }
    console.log('\n  Restore with:  npm run restore -- <filename>\n');
  }
  process.exit(0);
}

if (!fs.existsSync(DB_PATH)) {
  console.error(`\n  No database at ${DB_PATH}. Run \`npm run seed\` first.\n`);
  process.exit(1);
}

const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
const isWeekly = now.getDay() === 0;
const name = `school-${stamp}${isWeekly ? '-weekly' : ''}.db.gz`;
const target = path.join(BACKUP_DIR, name);
const staging = path.join(os.tmpdir(), `sms-backup-${process.pid}.db`);

const db = new Database(DB_PATH, { readonly: true });
try {
  await db.backup(staging);          // consistent snapshot, safe while running
  const verify = new Database(staging, { readonly: true });
  const check = verify.pragma('integrity_check', { simple: true });
  const students = verify.prepare("SELECT COUNT(*) n FROM students WHERE status='active'").get().n;
  verify.close();

  if (check !== 'ok') throw new Error(`integrity check failed: ${check}`);

  // Compress: a school database is mostly text and shrinks by roughly 80%.
  await new Promise((resolve, reject) => {
    fs.createReadStream(staging)
      .pipe(zlib.createGzip({ level: 9 }))
      .pipe(fs.createWriteStream(target))
      .on('finish', resolve)
      .on('error', reject);
  });

  const raw = fs.statSync(staging).size;
  const packed = fs.statSync(target).size;
  console.log(`\n  Snapshot written: ${name}`);
  console.log(`    ${mb(raw)} -> ${mb(packed)}   integrity ok   ${students} active pupils`);
  console.log(`    tier: ${isWeekly ? `weekly (kept ${WEEKLY_DAYS} days)` : `daily (kept ${DAILY_DAYS} days)`}`);
} finally {
  db.close();
  fs.rmSync(staging, { force: true });
}

const pruned = prune();
if (pruned.length) console.log(`\n  Pruned ${pruned.length} expired snapshot(s).`);
console.log(`\n  ${snapshots().length} snapshots retained in ${BACKUP_DIR}\n`);

function snapshots() {
  return fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('school-') && f.endsWith('.db.gz'))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { name: f, size: stat.size, mtime: stat.mtimeMs, tier: f.includes('-weekly') ? 'weekly' : 'daily' };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function prune() {
  const removed = [];
  for (const f of snapshots()) {
    const ageDays = (Date.now() - f.mtime) / 86_400_000;
    const limit = f.tier === 'weekly' ? WEEKLY_DAYS : DAILY_DAYS;
    if (ageDays > limit) {
      fs.rmSync(path.join(BACKUP_DIR, f.name), { force: true });
      removed.push(f.name);
    }
  }
  return removed;
}

function mb(bytes) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}
