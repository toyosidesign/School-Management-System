import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');

/**
 * The list of schools on this deployment, and nothing else.
 *
 * Kept in its own database, holding only what is needed to find a school and
 * open it: no pupil, no mark, no fee is in here. A school's records live in a
 * file of their own, which is what keeps one school's data out of another's —
 * not a column that every query has to remember to filter on.
 */
export const REGISTRY_PATH = process.env.SMS_REGISTRY_PATH || path.join(dataDir, 'registry.db');
fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });

// Schools live beside their registry, not beside the code: point the registry
// at a scratch directory and the schools follow it there, which is what keeps a
// test run from writing a school into the deployment's own data directory.
const schoolsDir = path.join(path.dirname(REGISTRY_PATH), 'schools');
fs.mkdirSync(schoolsDir, { recursive: true });

export const registry = new Database(REGISTRY_PATH);
registry.pragma('journal_mode = WAL');

registry.exec(`
  CREATE TABLE IF NOT EXISTS schools (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slug       TEXT NOT NULL UNIQUE,      -- the subdomain, and the handle everywhere else
    name       TEXT NOT NULL,
    db_file    TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
    created_by TEXT,                      -- the email that set it up, for support
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/** Names a subdomain cannot take, because something else already answers to it. */
const RESERVED = new Set([
  'www', 'api', 'app', 'admin', 'mail', 'smtp', 'ftp', 'static', 'assets', 'cdn', 'status',
  'help', 'support', 'docs', 'blog', 'about', 'login', 'signup', 'sign-up', 'school', 'schools',
  'test', 'staging', 'demo', 'localhost',
]);

/** A subdomain made from what the school calls itself. */
export function slugify(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function slugProblem(slug) {
  if (!slug || slug.length < 3) return 'A school address needs at least three characters';
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return 'Use lowercase letters, numbers and hyphens only';
  }
  if (RESERVED.has(slug)) return `${slug} is reserved`;
  if (findSchool(slug)) return 'That address is taken';
  return null;
}

export const findSchool = (slug) =>
  registry.prepare('SELECT * FROM schools WHERE slug = ?').get(String(slug ?? '').toLowerCase());

export const listSchools = () =>
  registry.prepare('SELECT slug, name, created_at, status FROM schools ORDER BY name').all();

export function addSchool({ slug, name, createdBy }) {
  const file = path.join(schoolsDir, `${slug}.db`);
  // A file with no registry row behind it is somebody else's data, or the
  // remains of a school that was removed. Adopting it silently would hand a
  // stranger's records to whoever signed up next.
  if (fs.existsSync(file)) {
    throw Object.assign(new Error(`A database already exists for ${slug}`), { status: 409 });
  }
  registry.prepare(
    'INSERT INTO schools (slug, name, db_file, created_by) VALUES (?, ?, ?, ?)'
  ).run(slug, name, file, createdBy ?? null);
  return findSchool(slug);
}

// A school's connection is opened once and kept: SQLite handles are cheap to
// hold and expensive to churn, and every request for that school wants the same
// one so its WAL is shared rather than fought over.
const open = new Map();

export function connectionFor(school) {
  if (open.has(school.slug)) return open.get(school.slug);

  fs.mkdirSync(path.dirname(school.db_file), { recursive: true });
  const connection = new Database(school.db_file);
  connection.pragma('journal_mode = WAL');
  connection.pragma('foreign_keys = ON');
  migrate(connection);
  open.set(school.slug, connection);
  return connection;
}

export function closeAll() {
  for (const connection of open.values()) connection.close();
  open.clear();
}
