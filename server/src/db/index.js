import Database from 'better-sqlite3';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');
fs.mkdirSync(dataDir, { recursive: true });

/** Overridable so the test suite and the backup tooling can point elsewhere. */
export const DB_PATH = process.env.SMS_DB_PATH || path.join(dataDir, 'school.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

/**
 * The school this request belongs to.
 *
 * One deployment now holds many schools, each in its own database file. Rather
 * than thread a connection through every route and query — hundreds of call
 * sites, each one a chance to read the wrong school's pupils — the connection
 * is held for the life of the request and `db` resolves to it. A query that
 * forgets to say which school it means cannot exist, because none of them say.
 */
const perRequest = new AsyncLocalStorage();

/** The database a deployment falls back to: scripts, tests, and a single school. */
export const defaultDb = new Database(DB_PATH);
defaultDb.pragma('journal_mode = WAL');
defaultDb.pragma('foreign_keys = ON');

export const currentConnection = () => perRequest.getStore() ?? defaultDb;

/** Runs everything inside `fn` against one school's database. */
export const runWithSchool = (connection, fn) => perRequest.run(connection, fn);

export const db = new Proxy({}, {
  get(_target, property) {
    const connection = currentConnection();
    const value = connection[property];
    return typeof value === 'function' ? value.bind(connection) : value;
  },
  set(_target, property, value) {
    currentConnection()[property] = value;
    return true;
  },
});

/**
 * Columns added to a table after it first shipped. `CREATE TABLE IF NOT EXISTS`
 * does nothing to a table that already exists, so a running school would never
 * see them: each one is added here, once, if it is missing.
 */
const ADDED_COLUMNS = [
  ['school_settings', 'favicon_url', 'TEXT'],
  ['classes', 'year_label', 'TEXT'],
  ['classes', 'stream', 'TEXT'],
  // Fees post to the ledger, so each one records where it landed.
  ['invoices', 'journal_id', 'INTEGER'],
  ['payments', 'journal_id', 'INTEGER'],
  ['payments', 'account_id', 'INTEGER'],
  ['invoice_items', 'account_id', 'INTEGER'],
  ['journals', 'reversed_by', 'INTEGER'],
  ['school_settings', 'section_labels', 'TEXT'],
  ['subjects', 'category', 'TEXT'],
  ['subjects', 'is_break', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'is_super_admin', 'INTEGER NOT NULL DEFAULT 0'],
  ['admissions_enquiries', 'read_at', 'TEXT'],
];

/**
 * Constraints written into a table when it was created, which a later release
 * has to lift. SQLite cannot drop a CHECK, so the table is rebuilt around the
 * data: create the new shape, copy the rows across, swap the names.
 */
function relaxSectionChecks() {
  const rebuilt = [
    ['classes', `CREATE TABLE classes_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, year_label TEXT, stream TEXT,
        section TEXT NOT NULL, level INTEGER NOT NULL,
        academic_year TEXT NOT NULL DEFAULT '2026/2027',
        homeroom_teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        room TEXT)`,
      'id, name, year_label, stream, section, level, academic_year, homeroom_teacher_id, room'],
    ['subjects', `CREATE TABLE subjects_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, section TEXT NOT NULL,
        colour TEXT DEFAULT '#2563eb', icon TEXT DEFAULT 'book')`,
      'id, name, code, section, colour, icon'],
  ];

  for (const [table, create, columns] of rebuilt) {
    const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)?.sql ?? '';
    if (!/CHECK\s*\(\s*section/i.test(sql)) continue;

    // Foreign keys elsewhere point at these rows, so they are held while the
    // table is swapped and checked once it is whole again.
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(create);
      db.exec(`INSERT INTO ${table}_new (${columns}) SELECT ${columns} FROM ${table}`);
      db.exec(`DROP TABLE ${table}`);
      db.exec(`ALTER TABLE ${table}_new RENAME TO ${table}`);
    })();
    db.pragma('foreign_keys = ON');
  }
}

export function migrate(connection) {
  // A school's own database is migrated the first time it is opened, so this
  // takes a connection as well as running against whichever one is current.
  if (connection) return runWithSchool(connection, () => migrate());

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(sql);

  for (const [table, column, type] of ADDED_COLUMNS) {
    const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }

  relaxSectionChecks();

  // A school that predates the two tiers has administrators but no owner among
  // them, and nobody could grant it: the rank can only be given by somebody who
  // holds it. The school's first administrator takes it, which is who set the
  // school up.
  const holder = db.prepare("SELECT 1 FROM users WHERE role = 'admin' AND is_super_admin = 1").get();
  if (!holder) {
    db.exec(`UPDATE users SET is_super_admin = 1 WHERE id = (
               SELECT id FROM users WHERE role = 'admin' AND is_active = 1 ORDER BY id LIMIT 1)`);
  }

  // Subjects that predate being taught in more than one section keep the one
  // they have, listed where every picker now looks for it.
  db.exec(`INSERT OR IGNORE INTO subject_sections (subject_id, section)
           SELECT id, section FROM subjects`);

  // A school that predates the sections table keeps exactly what it had.
  if (db.prepare('SELECT COUNT(*) n FROM sections').get().n === 0) {
    const add = db.prepare('INSERT INTO sections (key, name, sort_order) VALUES (?, ?, ?)');
    const custom = (() => {
      try { return JSON.parse(db.prepare('SELECT section_labels FROM school_settings WHERE id = 1').get()?.section_labels ?? 'null') ?? {}; }
      catch { return {}; }
    })();
    [['nursery', 'Nursery'], ['primary', 'Primary'], ['secondary', 'Secondary']]
      .forEach(([key, name], i) => add.run(key, custom[key] || name, (i + 1) * 10));
  }
}

/** Immutable audit trail: User_ID, timestamp, previous/new value, IP (PRD §5). */
export function audit({ user, action, entity, entityId, prev, next, ip }) {
  db.prepare(
    `INSERT INTO audit_logs (user_id, user_label, action, entity, entity_id, prev_value, new_value, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    user?.id ?? null,
    user ? `${user.first_name} ${user.last_name} (${user.role})` : 'system',
    action,
    entity,
    entityId != null ? String(entityId) : null,
    prev == null ? null : JSON.stringify(prev),
    next == null ? null : JSON.stringify(next),
    ip ?? null
  );
}

export function notify(userId, { title, body, kind = 'info', link = null }) {
  db.prepare(
    'INSERT INTO notifications (user_id, title, body, kind, link) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, title, body ?? null, kind, link);
}
