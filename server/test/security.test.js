/** Regression tests for the three defects fixed after the security audit. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTS, boot } from './helpers.js';

let ctx;
before(async () => { ctx = await boot(); });
after(async () => { await ctx.close(); });

const upload = (type, bytes, name) => {
  const form = new FormData();
  form.set('submission_type', type);
  form.set('file', new Blob([new Uint8Array(bytes)]), name);
  return form;
};
const SVG_BYTES = [...new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')];
const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const PDF_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0];

describe('uploaded files cannot become same-origin script', () => {
  it('rejects an SVG submission outright', async () => {
    const student = await ctx.login(ACCOUNTS.senStudent);
    const res = await ctx.api('POST', '/api/assignments/1/submissions', {
      token: student, form: upload('DIAGRAM_PDF', SVG_BYTES, 'diagram.svg'),
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Invalid format/);
  });

  it('rejects SVG bytes disguised with a .png extension', async () => {
    const student = await ctx.login(ACCOUNTS.senStudent);
    const res = await ctx.api('POST', '/api/assignments/1/submissions', {
      token: student, form: upload('DIAGRAM_PDF', SVG_BYTES, 'diagram.png'),
    });
    assert.equal(res.status, 400, 'an extension allowlist alone would let this through');
    assert.match(res.body.error, /does not appear to be a real PNG/);
  });

  it('accepts genuine PNG and PDF files', async () => {
    const student = await ctx.login(ACCOUNTS.senStudent);
    for (const [bytes, name] of [[PNG_BYTES, 'chart.png'], [PDF_BYTES, 'notes.pdf']]) {
      const res = await ctx.api('POST', '/api/assignments/1/submissions', {
        token: student, form: upload('DIAGRAM_PDF', bytes, name),
      });
      assert.equal(res.status, 201, `${name} should be accepted`);
    }
  });

  it('serves uploads sandboxed, never inline, never sniffed', async () => {
    const student = await ctx.login(ACCOUNTS.senStudent);
    const res = await ctx.api('POST', '/api/assignments/1/submissions', {
      token: student, form: upload('DIAGRAM_PDF', PNG_BYTES, 'safe.png'),
    });
    const served = await fetch(ctx.base + res.body.file_url);

    assert.equal(served.headers.get('content-disposition'), 'attachment');
    assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
    assert.match(served.headers.get('content-security-policy'), /sandbox/);
    assert.match(served.headers.get('content-security-policy'), /default-src 'none'/);
  });

  it('rejects an SVG logo even from an administrator', async () => {
    const admin = await ctx.login(ACCOUNTS.admin);
    const form = new FormData();
    form.set('logo', new Blob([new Uint8Array(SVG_BYTES)]), 'logo.svg');
    const res = await ctx.api('POST', '/api/website/settings/logo', { token: admin, form });
    assert.equal(res.status, 400);
  });

  it('sets security headers on application responses', async () => {
    const res = await fetch(ctx.base + '/api/health');
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(res.headers.get('referrer-policy'));
  });
});

describe('rate limiting is per user, not per shared school IP', () => {
  it('does not let one pupil exhaust another pupil budget', async () => {
    const limited = await boot({ RATE_LIMIT_USER: '5', RATE_LIMIT_ANON: '100' });
    try {
      const a = await limited.login(ACCOUNTS.senStudent);
      const b = await limited.login(ACCOUNTS.peerStudent);

      for (let i = 0; i < 5; i++) await limited.api('GET', '/api/notifications', { token: a });
      const exhausted = await limited.api('GET', '/api/notifications', { token: a });
      assert.equal(exhausted.status, 429, 'the heavy user is throttled');

      const other = await limited.api('GET', '/api/notifications', { token: b });
      assert.equal(other.status, 200, 'a different user on the same IP is unaffected');
    } finally {
      await limited.close();
    }
  });

  it('caps public form submissions to blunt spam', async () => {
    const limited = await boot({ RATE_LIMIT_FORM: '3' });
    try {
      const send = () => limited.api('POST', '/api/public/enquiries', {
        body: { parent_name: 'Spammer', email: 'spam@example.test', message: 'hello' },
      });
      // The limiter store is shared per process, so assert that it stops rather
      // than assuming which submission is the first to be refused.
      let refused = false;
      for (let i = 0; i < 8 && !refused; i++) refused = (await send()).status === 429;
      assert.ok(refused, 'public form submissions are rate limited');
    } finally {
      await limited.close();
    }
  });

  it('still caps sign-in attempts by address to blunt credential stuffing', async () => {
    const limited = await boot({ RATE_LIMIT_LOGIN: '3' });
    try {
      for (let i = 0; i < 3; i++) {
        await limited.api('POST', '/api/auth/login', { body: { email: ACCOUNTS.admin, password: 'wrong' } });
      }
      const blocked = await limited.api('POST', '/api/auth/login', { body: { email: ACCOUNTS.admin, password: 'wrong' } });
      assert.equal(blocked.status, 429);
      assert.match(blocked.body.error, /Too many sign-in attempts/);
    } finally {
      await limited.close();
    }
  });
});

describe('teachers are scoped to the pupils they actually teach', () => {
  it('refuses a nursery teacher access to a secondary pupil record', async () => {
    const nursery = await ctx.login(ACCOUNTS.nurseryTeacher);
    const maths = await ctx.login(ACCOUNTS.mathsTeacher);

    const theirs = (await ctx.api('GET', '/api/students', { token: maths })).body;
    const secondaryId = theirs[0].id;

    const denied = await ctx.api('GET', `/api/students/${secondaryId}`, { token: nursery });
    assert.equal(denied.status, 403);

    const allowed = await ctx.api('GET', `/api/students/${secondaryId}`, { token: maths });
    assert.equal(allowed.status, 200, 'their own pupil is still fully readable');
    assert.ok(allowed.body.guardians, 'including guardian contact details');
  });

  it('narrows student, class and SEN lists to the teacher own classes', async () => {
    const nursery = await ctx.login(ACCOUNTS.nurseryTeacher);
    const admin = await ctx.login(ACCOUNTS.admin);

    const nurseryStudents = (await ctx.api('GET', '/api/students', { token: nursery })).body;
    const allStudents = (await ctx.api('GET', '/api/students', { token: admin })).body;
    assert.ok(nurseryStudents.length > 0);
    assert.ok(nurseryStudents.length < allStudents.length, 'a teacher sees fewer pupils than an administrator');
    assert.equal(new Set(nurseryStudents.map((s) => s.section)).size, 1);
    assert.equal(nurseryStudents[0].section, 'nursery');

    const seenSen = (await ctx.api('GET', '/api/iep', { token: nursery })).body;
    const allSen = (await ctx.api('GET', '/api/iep', { token: admin })).body;
    assert.ok(allSen.length > seenSen.length, 'the SEN register is scoped too');
  });

  it('refuses grading, registers and recaps for classes a teacher does not take', async () => {
    const nursery = await ctx.login(ACCOUNTS.nurseryTeacher);

    const register = await ctx.api('POST', '/api/attendance', {
      token: nursery,
      body: { class_subject_id: 1, date: '2026-09-20', records: [{ student_id: 1, status: 'absent' }] },
    });
    assert.equal(register.status, 403);

    const grade = await ctx.api('POST', '/api/submissions/1/grade', { token: nursery, body: { grade: 10 } });
    assert.equal(grade.status, 403);

    const recap = await ctx.api('POST', '/api/materials', {
      token: nursery, body: { class_subject_id: 1, lesson_date: '2026-09-20', topic: 'Not my class' },
    });
    assert.equal(recap.status, 403);
  });
});
