/** Account creation: the school invites, the person sets their own password. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTS, boot } from './helpers.js';

let ctx, admin;
before(async () => {
  ctx = await boot({ RATE_LIMIT_INVITE: '500', RATE_LIMIT_LOGIN: '200' });
  admin = await ctx.login(ACCOUNTS.admin);
});
after(async () => { await ctx.close(); });

const tokenOf = (link) => link.split('/activate/')[1];

const invite = (body, token = admin) => ctx.api('POST', '/api/invites', { token, body });
const view = (t) => ctx.api('GET', `/api/invites/token/${t}`);
const accept = (t, body) => ctx.api('POST', `/api/invites/token/${t}/accept`, { body });

describe('inviting somebody to create an account', () => {
  it('creates the account only when they open the link and choose a password', async () => {
    const created = await invite({
      role: 'teacher', first_name: 'Ada', last_name: 'Okonkwo',
      email: 'a.okonkwo@school.demo', title: 'Physics Teacher', department: 'Secondary',
    });
    assert.equal(created.status, 201);
    assert.ok(created.body.link.includes('/activate/'), 'the sender gets a link to pass on');

    // Nothing to sign in to yet.
    const staffBefore = (await ctx.api('GET', '/api/staff', { token: admin })).body;
    assert.ok(!staffBefore.some((s) => s.email === 'a.okonkwo@school.demo'));

    const token = tokenOf(created.body.link);
    const shown = await view(token);
    assert.equal(shown.status, 200);
    assert.equal(shown.body.kind, 'new_account');
    assert.equal(shown.body.first_name, 'Ada');

    const done = await accept(token, { password: 'a-decent-password', first_name: 'Ada', last_name: 'Okonkwo' });
    assert.equal(done.status, 201);
    assert.equal(done.body.user.role, 'teacher');
    assert.ok(done.body.token, 'they are signed in straight away');

    const signIn = await ctx.api('POST', '/api/auth/login', {
      body: { email: 'a.okonkwo@school.demo', password: 'a-decent-password' },
    });
    assert.equal(signIn.status, 200);

    const staff = (await ctx.api('GET', '/api/staff', { token: admin })).body
      .find((s) => s.email === 'a.okonkwo@school.demo');
    assert.equal(staff.title, 'Physics Teacher', 'the staff record arrives with them');
  });

  it('links a guardian to their child, and only the school can set that', async () => {
    const pupil = (await ctx.api('GET', '/api/students', { token: admin })).body[0];
    const created = await invite({
      role: 'parent', first_name: 'Ngozi', last_name: 'Bello',
      email: 'n.bello@family.demo', student_id: pupil.id, relationship: 'Mother',
    });
    const token = tokenOf(created.body.link);
    assert.equal((await view(token)).body.child.name, `${pupil.first_name} ${pupil.last_name}`);

    // Attempting to claim a different child on the way in changes nothing.
    const done = await accept(token, { password: 'guardian-password', student_id: 999, role: 'admin' });
    assert.equal(done.status, 201);
    assert.equal(done.body.user.role, 'parent');
    assert.deepEqual(done.body.user.children.map((c) => c.id), [pupil.id]);
  });

  it('burns the link on use and refuses a replay', async () => {
    const created = await invite({ role: 'teacher', first_name: 'Kai', last_name: 'Ng', email: 'k.ng@school.demo' });
    const token = tokenOf(created.body.link);
    assert.equal((await accept(token, { password: 'first-password-set' })).status, 201);
    assert.equal((await accept(token, { password: 'second-password-set' })).status, 410);
  });

  it('refuses a password anybody could guess', async () => {
    const created = await invite({ role: 'teacher', first_name: 'Sam', last_name: 'Doe', email: 's.doe@school.demo' });
    const token = tokenOf(created.body.link);
    assert.equal((await accept(token, { password: 'short' })).status, 400);
    assert.equal((await accept(token, { password: 's.doe@school.demo' })).status, 400);
  });

  it('cancelling and resending both kill the old link', async () => {
    const revoked = await invite({ role: 'teacher', first_name: 'Lee', last_name: 'Park', email: 'l.park@school.demo' });
    await ctx.api('POST', `/api/invites/${revoked.body.id}/revoke`, { token: admin, body: {} });
    assert.equal((await view(tokenOf(revoked.body.link))).status, 410);

    const stale = await invite({ role: 'teacher', first_name: 'Mo', last_name: 'Diop', email: 'm.diop@school.demo' });
    const fresh = await ctx.api('POST', `/api/invites/${stale.body.id}/resend`, { token: admin, body: {} });
    assert.equal((await view(tokenOf(stale.body.link))).status, 410, 'the first link stops working');
    assert.equal((await view(tokenOf(fresh.body.link))).status, 200, 'the new one works');
  });

  it('will not invite a pupil or an address that already has an account', async () => {
    const pupilRole = await invite({ role: 'student', first_name: 'A', last_name: 'B', email: 'new.pupil@school.demo' });
    assert.equal(pupilRole.status, 400);
    assert.match(pupilRole.body.error, /access code/i);

    const taken = await invite({ role: 'teacher', first_name: 'David', last_name: 'Mensah', email: ACCOUNTS.mathsTeacher });
    assert.equal(taken.status, 409);
  });

  it('is managed by school leadership alone', async () => {
    const teacher = await ctx.login(ACCOUNTS.mathsTeacher);
    assert.equal((await ctx.api('GET', '/api/invites', { token: teacher })).status, 403);
    assert.equal((await invite({ role: 'admin', first_name: 'X', last_name: 'Y', email: 'x@y.demo' }, teacher)).status, 403);
  });

  it('never hands back the token, even to an administrator', async () => {
    const list = (await ctx.api('GET', '/api/invites', { token: admin })).body;
    assert.ok(list.length > 0);
    for (const row of list) {
      assert.ok(!('token_hash' in row) && !('token_hint' in row), 'no way to reconstruct a live link');
      assert.ok(['pending', 'accepted', 'expired', 'revoked'].includes(row.status));
    }
  });
});

describe('accounts the school creates directly', () => {
  it('sets no password anybody else knows, and hands over an activation link', async () => {
    const added = await ctx.api('POST', '/api/staff', {
      token: admin,
      body: { first_name: 'Femi', last_name: 'Cole', email: 'f.cole@school.demo', role: 'teacher', title: 'Art Teacher' },
    });
    assert.equal(added.status, 201);
    assert.ok(added.body.activation_link, 'the office gets a link to send on');

    for (const guess of ['Passw0rd!', 'password', 'f.cole']) {
      const attempt = await ctx.api('POST', '/api/auth/login', { body: { email: 'f.cole@school.demo', password: guess } });
      assert.equal(attempt.status, 401, `"${guess}" must not sign them in`);
    }

    const set = await accept(tokenOf(added.body.activation_link), { password: 'my-own-password' });
    assert.equal(set.status, 200);
    assert.equal((await ctx.api('POST', '/api/auth/login', {
      body: { email: 'f.cole@school.demo', password: 'my-own-password' },
    })).status, 200);
  });

  it('sends a locked-out teacher a link that only resets their password', async () => {
    // Somebody already using the system: they have signed in at least once.
    await ctx.login(ACCOUNTS.historyTeacher);
    const person = (await ctx.api('GET', '/api/staff', { token: admin })).body
      .find((s) => s.email === ACCOUNTS.historyTeacher);
    const created = await invite({ user_id: person.user_id });
    assert.equal(created.status, 201);

    const shown = await view(tokenOf(created.body.link));
    assert.equal(shown.body.kind, 'password_reset');
    assert.ok(!('first_name' in (shown.body.child ?? {})), 'a reset carries no extra record detail');
    assert.equal(shown.body.email, ACCOUNTS.historyTeacher);

    // Role is taken from the record, never from what the form posts.
    const done = await accept(tokenOf(created.body.link), { password: 'replacement-password', role: 'admin' });
    assert.equal(done.status, 200);
    assert.equal(done.body.user.role, 'teacher');

    assert.equal((await ctx.api('POST', '/api/auth/login', {
      body: { email: ACCOUNTS.historyTeacher, password: 'Passw0rd!' },
    })).status, 401, 'the old password stops working');
  });

  it('will not send a pupil a password link', async () => {
    const listed = (await ctx.api('GET', '/api/students', { token: admin })).body[0];
    const pupil = (await ctx.api('GET', `/api/students/${listed.id}`, { token: admin })).body;
    const refused = await invite({ user_id: pupil.user_id });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /access code/i);
  });
});
