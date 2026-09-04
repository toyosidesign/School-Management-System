/**
 * Each test file gets its own copy of a seeded database, so files can run in
 * parallel and none can see another's writes. The template is seeded once and
 * reused, because seeding is far slower than copying a SQLite file.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');
const TEMPLATE = path.join(os.tmpdir(), 'sms-test-template.db');

/** Newest mtime anywhere under a directory. */
function newestMtime(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : fs.statSync(full).mtimeMs);
  }
  return newest;
}

function ensureTemplate() {
  // Compare against the whole source tree, not just seed.js. Checking one file
  // means a schema change leaves a stale template in place, and every test then
  // fails against a database that is missing columns the code expects.
  const stale = !fs.existsSync(TEMPLATE) ||
    fs.statSync(TEMPLATE).mtimeMs < newestMtime(path.join(serverRoot, 'src'));
  if (!stale) return;

  const seedPath = path.join(serverRoot, 'src/db/seed.js');

  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(TEMPLATE + suffix, { force: true });
  }
  execFileSync(process.execPath, [seedPath], {
    cwd: serverRoot,
    env: { ...process.env, SMS_DB_PATH: TEMPLATE, NODE_ENV: 'test' },
    stdio: 'pipe',
  });
}

/**
 * Boots an isolated app instance and returns helpers bound to it.
 * `env` lets a test tighten rate limits without affecting other files.
 */
export async function boot(env = {}) {
  ensureTemplate();

  const dbPath = path.join(os.tmpdir(), `sms-test-${process.pid}-${Math.random().toString(36).slice(2)}.db`);
  fs.copyFileSync(TEMPLATE, dbPath);

  Object.assign(process.env, { NODE_ENV: 'test', SMS_DB_PATH: dbPath, ...env });

  const { createApp } = await import(`../src/app.js?t=${Date.now()}`);
  const app = createApp({ serveClient: false });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  /** Thin fetch wrapper returning { status, body } so assertions stay readable. */
  async function api(method, pathname, { token, body, form, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (form) init.body = form;
    else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(base + pathname, init);
    const text = await res.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
    return { status: res.status, body: parsed, headers: res.headers };
  }

  /**
   * Signs in as anyone. Pupils have no password, so their accounts go through
   * the code flow: an administrator issues a code and it is redeemed, exactly
   * as a school would do it.
   */
  async function login(email, password = 'Passw0rd!') {
    if (email.endsWith('@student.demo')) return loginPupil(email);

    const res = await api('POST', '/api/auth/login', { body: { email, password } });
    if (!res.body?.token) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
    return res.body.token;
  }

  async function loginPupil(email) {
    const admin = await api('POST', '/api/auth/login', {
      body: { email: 'admin@school.demo', password: 'Passw0rd!' },
    });
    const adminToken = admin.body?.token;
    if (!adminToken) throw new Error('could not sign in as an administrator to issue a code');

    const pupils = await api('GET', '/api/students', { token: adminToken });
    const pupil = (pupils.body ?? []).find((p) => p.email?.toLowerCase() === email.toLowerCase());
    if (!pupil) throw new Error(`no pupil found for ${email}`);

    const issued = await api('POST', `/api/students/${pupil.id}/access-code`, { token: adminToken, body: {} });
    if (!issued.body?.code) throw new Error(`could not issue a code for ${email}: ${JSON.stringify(issued.body)}`);

    const res = await api('POST', '/api/auth/login-code', { body: { code: issued.body.code } });
    if (!res.body?.token) throw new Error(`code sign-in failed for ${email}: ${JSON.stringify(res.body)}`);
    return res.body.token;
  }

  async function close() {
    await new Promise((resolve) => server.close(resolve));
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
  }

  return { base, api, login, close, dbPath };
}

export const ACCOUNTS = {
  admin: 'admin@school.demo',
  senco: 'senco@school.demo',
  mathsTeacher: 'd.mensah@school.demo',
  historyTeacher: 'e.rossi@school.demo',
  nurseryTeacher: 'm.lin@school.demo',
  senStudent: 'stu-3004@student.demo',      // Alex Jordan: 1.5x time, multi-format
  dyslexicStudent: 'stu-1002@student.demo', // Maya Thompson
  peerStudent: 'stu-1003@student.demo',
  parent: 'm.jordan@family.demo',           // guardian of Alex only
};
