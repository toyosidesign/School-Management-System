/** Many schools on one deployment, each in a database of its own. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-tenants-'));
process.env.SMS_REGISTRY_PATH = path.join(workspace, 'registry.db');
process.env.SMS_DB_PATH = path.join(workspace, 'default.db');

const { createApp } = await import('../src/app.js');
const { closeAll } = await import('../src/db/registry.js');

let server, base;
before(async () => {
  const app = createApp({ serveClient: false });
  server = app.listen(0);
  await new Promise((done) => server.once('listening', done));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  closeAll();
  await new Promise((done) => server.close(done));
  fs.rmSync(workspace, { recursive: true, force: true });
});

const call = async (method, url, { body, token, school } = {}) => {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(school ? { 'x-school': school } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const signUp = (slug, name, email) => call('POST', '/api/public/schools', {
  body: { school_name: name, slug, name: 'Head Teacher', email, password: 'a-good-long-password' },
});

describe('a deployment holding many schools', () => {
  let northgate, riverside;

  it('sets each one up with its own administrator', async () => {
    const first = await signUp('northgate', 'Northgate Academy', 'head@northgate.example');
    assert.equal(first.status, 201, first.body?.error);
    assert.equal(first.body.school.slug, 'northgate');
    assert.equal(first.body.user.is_super_admin, 1);
    northgate = first.body.token;

    const second = await signUp('riverside', 'Riverside Prep', 'head@riverside.example');
    assert.equal(second.status, 201, second.body?.error);
    riverside = second.body.token;
  });

  it('keeps one school\'s records out of the other', async () => {
    const enrolled = await call('POST', '/api/students', {
      token: northgate, school: 'northgate',
      body: { first_name: 'Ada', last_name: 'Bello', email: 'ada@northgate.example' },
    });
    assert.equal(enrolled.status, 201, enrolled.body?.error);

    const theirs = await call('GET', '/api/students', { token: northgate, school: 'northgate' });
    assert.equal(theirs.body.length, 1);

    const others = await call('GET', '/api/students', { token: riverside, school: 'riverside' });
    assert.equal(others.body.length, 0, 'a pupil enrolled at one school is not at the other');
  });

  it('will not let one school\'s session read another\'s records', async () => {
    // Both schools have a user 1. A token that did not say which school it was
    // for would quietly resolve to whoever holds that id at the other one.
    const trespass = await call('GET', '/api/students', { token: northgate, school: 'riverside' });
    assert.equal(trespass.status, 401);
    assert.match(trespass.body.error, /different school/i);

    const home = await call('GET', '/api/students', { token: northgate, school: 'northgate' });
    assert.equal(home.status, 200, 'the same token is fine at its own school');
  });

  it('refuses an address that is taken, reserved, or malformed', async () => {
    assert.match((await signUp('northgate', 'Another', 'a@b.example')).body.error, /taken/i);
    assert.match((await signUp('www', 'Another', 'a@b.example')).body.error, /reserved/i);
    assert.match((await signUp('No Spaces', 'Another', 'a@b.example')).body.error, /lowercase/i);
    assert.match((await signUp('ab', 'Another', 'a@b.example')).body.error, /three characters/i);
  });

  it('answers nothing for a school that does not exist', async () => {
    const missing = await call('GET', '/api/public/site', { school: 'nowhere' });
    assert.equal(missing.status, 404);
    assert.match(missing.body.error, /No school at nowhere/);
  });

  it('shows each school its own name on the public site', async () => {
    const one = await call('GET', '/api/public/site', { school: 'northgate' });
    const two = await call('GET', '/api/public/site', { school: 'riverside' });
    assert.equal(one.body.settings.name, 'Northgate Academy');
    assert.equal(two.body.settings.name, 'Riverside Prep');
  });
});
