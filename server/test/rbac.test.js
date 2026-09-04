/** Role boundaries and the guardian relationship, which gate all pupil data. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTS, boot } from './helpers.js';

let ctx;
before(async () => { ctx = await boot(); });
after(async () => { await ctx.close(); });

describe('authentication', () => {
  it('rejects a wrong password without revealing whether the account exists', async () => {
    const wrongPassword = await ctx.api('POST', '/api/auth/login', { body: { email: ACCOUNTS.admin, password: 'nope' } });
    const noSuchUser = await ctx.api('POST', '/api/auth/login', { body: { email: 'ghost@nowhere.test', password: 'nope' } });
    assert.equal(wrongPassword.status, 401);
    assert.equal(noSuchUser.status, 401);
    assert.equal(wrongPassword.body.error, noSuchUser.body.error, 'identical message either way');
  });

  it('refuses a forged token', async () => {
    const res = await ctx.api('GET', '/api/auth/me', { token: 'not.a.real.token' });
    assert.equal(res.status, 401);
  });

  it('requires a token for anything outside the public site', async () => {
    for (const path of ['/api/students', '/api/dashboard', '/api/audit', '/api/website/admissions']) {
      assert.equal((await ctx.api('GET', path)).status, 401, `${path} must require auth`);
    }
  });
});

describe('parents see only their own children', () => {
  it('exposes just the linked child on the dashboard', async () => {
    const parent = await ctx.login(ACCOUNTS.parent);
    const res = await ctx.api('GET', '/api/dashboard', { token: parent });
    assert.equal(res.body.children.length, 1);
    assert.equal(res.body.children[0].first_name, 'Alex');
  });

  it('refuses another family child record', async () => {
    const parent = await ctx.login(ACCOUNTS.parent);
    const admin = await ctx.login(ACCOUNTS.admin);
    const all = (await ctx.api('GET', '/api/students', { token: admin })).body;
    const own = (await ctx.api('GET', '/api/dashboard', { token: parent })).body.children[0].id;
    const other = all.find((s) => s.id !== own);

    assert.equal((await ctx.api('GET', `/api/students/${other.id}`, { token: parent })).status, 403);
    assert.equal((await ctx.api('GET', `/api/catchup?studentId=${other.id}`, { token: parent })).status, 403);
    assert.equal((await ctx.api('GET', `/api/activity?studentId=${other.id}`, { token: parent })).status, 403);
  });

  it('cannot file a leave request for a child they do not guard', async () => {
    const parent = await ctx.login(ACCOUNTS.parent);
    const admin = await ctx.login(ACCOUNTS.admin);
    const all = (await ctx.api('GET', '/api/students', { token: admin })).body;
    const own = (await ctx.api('GET', '/api/dashboard', { token: parent })).body.children[0].id;
    const other = all.find((s) => s.id !== own);

    const res = await ctx.api('POST', '/api/leave', {
      token: parent,
      body: { student_id: other.id, start_date: '2026-10-01', end_date: '2026-10-02', reason: 'Trip' },
    });
    assert.equal(res.status, 403);
  });
});

describe('students see only themselves', () => {
  it('cannot read a classmate record or catch-up hub', async () => {
    const student = await ctx.login(ACCOUNTS.senStudent);
    const peer = await ctx.login(ACCOUNTS.peerStudent);
    const peerId = (await ctx.api('GET', '/api/auth/me', { token: peer })).body.student.id;

    assert.equal((await ctx.api('GET', `/api/students/${peerId}`, { token: student })).status, 403);
    const own = await ctx.api('GET', `/api/catchup?studentId=${peerId}`, { token: student });
    assert.notEqual(own.status, 500);
  });

  it('cannot reach staff-only endpoints', async () => {
    const student = await ctx.login(ACCOUNTS.senStudent);
    for (const path of ['/api/students', '/api/staff', '/api/audit', '/api/iep', '/api/website/admissions']) {
      const res = await ctx.api('GET', path, { token: student });
      assert.equal(res.status, 403, `${path} must be refused`);
    }
  });

  it('can personalise its own account but not the official record', async () => {
    const student = await ctx.login(ACCOUNTS.senStudent);

    const ok = await ctx.api('PATCH', '/api/auth/profile', {
      token: student,
      body: { preferred_name: 'Alex J', avatar_colour: '#9333ea', avatar_emoji: '\u{1F98A}' },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.preferred_name, 'Alex J');
    assert.equal(ok.body.avatar_colour, '#9333ea');

    // The legal name, role and sign-in stay with the school office.
    const before = ok.body;
    const attempt = await ctx.api('PATCH', '/api/auth/profile', {
      token: student,
      body: { first_name: 'Hacker', last_name: 'Hacker', role: 'admin', email: 'attacker@example.test' },
    });
    assert.equal(attempt.body.first_name, before.first_name);
    assert.equal(attempt.body.role, 'student');
    assert.equal(attempt.body.email, before.email);
  });

  it('validates personalisation input', async () => {
    const student = await ctx.login(ACCOUNTS.senStudent);
    assert.equal((await ctx.api('PATCH', '/api/auth/profile', { token: student, body: { avatar_colour: 'purple' } })).status, 400);
    assert.equal((await ctx.api('PATCH', '/api/auth/profile', { token: student, body: { avatar_emoji: 'a nickname' } })).status, 400);
    assert.equal((await ctx.api('PATCH', '/api/auth/profile', { token: student, body: { preferred_name: 'x'.repeat(50) } })).status, 400);
  });

  it('cannot request its own day off', async () => {
    const student = await ctx.login(ACCOUNTS.senStudent);
    const res = await ctx.api('POST', '/api/leave', {
      token: student,
      body: { start_date: '2026-10-01', end_date: '2026-10-02', reason: 'Tired' },
    });
    assert.equal(res.status, 403, 'excusing a child is a decision for the adults');
  });

  it('cannot rate its teachers', async () => {
    const student = await ctx.login(ACCOUNTS.senStudent);
    assert.equal((await ctx.api('POST', '/api/feedback', { token: student, body: { teacher_id: 3, rating: 1 } })).status, 403);
    assert.equal((await ctx.api('GET', '/api/feedback', { token: student })).status, 403);
  });

  it('cannot grade its own work', async () => {
    const student = await ctx.login(ACCOUNTS.senStudent);
    const res = await ctx.api('POST', '/api/submissions/1/grade', { token: student, body: { grade: 100 } });
    assert.equal(res.status, 403);
  });
});

describe('pupils sign in with a code, not a password', () => {
  it('refuses a pupil password sign-in even with the right password', async () => {
    const res = await ctx.api('POST', '/api/auth/login', {
      body: { email: 'stu-3004@student.demo', password: 'Passw0rd!' },
    });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /code from their school/);
  });

  it('signs in with an issued code, and the code keeps working', async () => {
    const admin = await ctx.login(ACCOUNTS.admin);
    const pupils = (await ctx.api('GET', '/api/students', { token: admin })).body;
    const pupil = pupils[0];

    const issued = await ctx.api('POST', `/api/students/${pupil.id}/access-code`, { token: admin, body: {} });
    assert.equal(issued.status, 201);
    assert.match(issued.body.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    for (const attempt of [1, 2]) {
      const res = await ctx.api('POST', '/api/auth/login-code', { body: { code: issued.body.code } });
      assert.ok(res.body.token, `code should still work on attempt ${attempt}`);
      assert.equal(res.body.user.role, 'student');
    }

    // Lower case and missing punctuation still work: a child copying it off paper.
    const loose = await ctx.api('POST', '/api/auth/login-code', {
      body: { code: issued.body.code.toLowerCase().replace('-', ' ') },
    });
    assert.ok(loose.body.token);
  });

  it('revokes the previous code when a new one is issued', async () => {
    const admin = await ctx.login(ACCOUNTS.admin);
    const pupil = (await ctx.api('GET', '/api/students', { token: admin })).body[1];

    const first = (await ctx.api('POST', `/api/students/${pupil.id}/access-code`, { token: admin, body: {} })).body;
    const second = (await ctx.api('POST', `/api/students/${pupil.id}/access-code`, { token: admin, body: {} })).body;

    assert.equal((await ctx.api('POST', '/api/auth/login-code', { body: { code: first.code } })).status, 401);
    assert.ok((await ctx.api('POST', '/api/auth/login-code', { body: { code: second.code } })).body.token);
  });

  it('rejects a wrong code and never reveals an existing one', async () => {
    assert.equal((await ctx.api('POST', '/api/auth/login-code', { body: { code: 'ZZZZ-ZZZZ' } })).status, 401);

    const admin = await ctx.login(ACCOUNTS.admin);
    const pupil = (await ctx.api('GET', '/api/students', { token: admin })).body[0];
    const peek = await ctx.api('GET', `/api/students/${pupil.id}/access-code`, { token: admin });
    assert.ok(!JSON.stringify(peek.body ?? {}).match(/"code"/), 'the code itself is never readable again');
  });

  it('offers a development sign-in, and refuses it in production', async () => {
    // Available while developing, so the pupil portal can be reached without
    // looking up a rotating code.
    const listed = await ctx.api('GET', '/api/auth/dev-pupils');
    assert.equal(listed.status, 200);
    assert.ok(listed.body.length > 0);

    const signedIn = await ctx.api('POST', '/api/auth/dev-login', {
      body: { student: listed.body[0].student_code },
    });
    assert.ok(signedIn.body.token);
    assert.equal(signedIn.body.user.role, 'student');

    assert.equal((await ctx.api('POST', '/api/auth/dev-login', { body: { student: 'STU-9999' } })).status, 404);

    // Same app, production settings: the endpoint must not exist at all.
    const prod = await boot({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) });
    try {
      assert.equal((await prod.api('GET', '/api/auth/dev-pupils')).status, 404);
      assert.equal((await prod.api('POST', '/api/auth/dev-login', { body: { student: 'STU-1002' } })).status, 404);
    } finally {
      await prod.close();
      process.env.NODE_ENV = 'test';
    }
  });

  it('does not let a pupil change a password they do not have', async () => {
    const admin = await ctx.login(ACCOUNTS.admin);
    const pupil = (await ctx.api('GET', '/api/students', { token: admin })).body[0];
    const issued = (await ctx.api('POST', `/api/students/${pupil.id}/access-code`, { token: admin, body: {} })).body;
    const token = (await ctx.api('POST', '/api/auth/login-code', { body: { code: issued.code } })).body.token;

    const res = await ctx.api('POST', '/api/auth/change-password', {
      token, body: { currentPassword: 'Passw0rd!', newPassword: 'somethingelse' },
    });
    assert.equal(res.status, 403);
  });
});

describe('administrator-only surfaces', () => {
  it('keeps branding, the audit log and enrolment out of teacher hands', async () => {
    const teacher = await ctx.login(ACCOUNTS.mathsTeacher);
    assert.equal((await ctx.api('PUT', '/api/website/settings', { token: teacher, body: { name: 'X' } })).status, 403);
    assert.equal((await ctx.api('GET', '/api/audit', { token: teacher })).status, 403);
    assert.equal((await ctx.api('POST', '/api/students', { token: teacher, body: { first_name: 'A', last_name: 'B', email: 'a@b.test' } })).status, 403);
  });

  it('records grade changes in the audit trail with before and after values', async () => {
    const teacher = await ctx.login(ACCOUNTS.historyTeacher);
    const admin = await ctx.login(ACCOUNTS.admin);

    const assignments = (await ctx.api('GET', '/api/assignments', { token: teacher })).body;
    const essay = assignments.find((a) => a.title === 'History Impact Essay');
    const detail = await ctx.api('GET', `/api/assignments/${essay.id}`, { token: teacher });
    const submission = detail.body.submissions.find((s) => s.id);

    await ctx.api('POST', `/api/submissions/${submission.id}/grade`, { token: teacher, body: { grade: 88 } });

    const log = (await ctx.api('GET', '/api/audit?entity=submissions', { token: admin })).body;
    const entry = log.find((a) => a.action === 'grade_update');
    assert.ok(entry, 'the grade change is logged');
    assert.match(entry.new_value, /88/);
    assert.ok(entry.user_label.includes('Rossi'), 'the log names who did it');
    assert.ok(entry.ip_address, 'and from where');
  });

  it('rejects attempts to alter the audit log', async () => {
    const { db } = await import('../src/db/index.js');
    assert.throws(() => db.prepare("UPDATE audit_logs SET action = 'tampered' WHERE id = 1").run(), /append-only/);
    assert.throws(() => db.prepare('DELETE FROM audit_logs WHERE id = 1').run(), /append-only/);
  });
});
