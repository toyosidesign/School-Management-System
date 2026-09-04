/**
 * The two Gherkin stories from PRD §6, asserted directly.
 * These are the platform's headline behaviours; if either regresses the product
 * has lost the thing that distinguishes it.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTS, boot } from './helpers.js';

let ctx;
before(async () => { ctx = await boot(); });
after(async () => { await ctx.close(); });

describe('Story 1: attendance populates the Catch-Up Hub', () => {
  it('creates an entry with subject, date and linked materials when a pupil is marked absent', async () => {
    const teacher = await ctx.login(ACCOUNTS.mathsTeacher);
    const student = await ctx.login(ACCOUNTS.peerStudent);

    const me = await ctx.api('GET', '/api/auth/me', { token: student });
    const studentId = me.body.student.id;

    const before = await ctx.api('GET', '/api/catchup', { token: student });
    const countBefore = before.body.length;

    // Publish the lesson first, so the recap is available to attach.
    await ctx.api('POST', '/api/materials', {
      token: teacher,
      body: {
        class_subject_id: 1, lesson_date: '2026-09-10', period: 2,
        topic: 'Quadratic Equations Intro and Graphing',
        summary: 'Recap of quadratics.', teacher_notes: 'Watch from 09:05.',
        video_url: 'https://example.test/lesson.mp4',
        transcript: [{ t: '22:10', text: 'The discriminant determines roots' }],
      },
    });

    const marked = await ctx.api('POST', '/api/attendance', {
      token: teacher,
      body: {
        class_subject_id: 1, date: '2026-09-10', period: 2,
        records: [{ student_id: studentId, status: 'absent' }],
      },
    });

    assert.equal(marked.status, 201);
    assert.equal(marked.body.catchup_entries_created, 1, 'marking absent must create exactly one entry');

    const after = await ctx.api('GET', '/api/catchup', { token: student });
    assert.equal(after.body.length, countBefore + 1);

    const entry = after.body.find((e) => e.lesson_date === '2026-09-10');
    assert.ok(entry, 'an entry exists for the missed date');
    assert.equal(entry.subject, 'Mathematics');
    assert.equal(entry.reason, 'absent');
    assert.equal(entry.materials_ready, true, 'linked materials are attached');
    assert.ok(entry.video_url, 'entry carries the recorded lecture');
    assert.ok(entry.teacher_notes, 'entry carries teacher notes');
    assert.ok(entry.summary, 'entry carries the summary');
    assert.equal(entry.transcript.length, 1, 'transcript is searchable');
  });

  it('back-fills materials into entries created before the recap was published', async () => {
    const teacher = await ctx.login(ACCOUNTS.mathsTeacher);
    const student = await ctx.login(ACCOUNTS.peerStudent);
    const studentId = (await ctx.api('GET', '/api/auth/me', { token: student })).body.student.id;

    await ctx.api('POST', '/api/attendance', {
      token: teacher,
      body: { class_subject_id: 1, date: '2026-09-14', period: 1, records: [{ student_id: studentId, status: 'absent' }] },
    });

    let entries = (await ctx.api('GET', '/api/catchup', { token: student })).body;
    const orphan = entries.find((e) => e.lesson_date === '2026-09-14');
    assert.equal(orphan.materials_ready, false, 'no recap exists yet');

    const published = await ctx.api('POST', '/api/materials', {
      token: teacher,
      body: { class_subject_id: 1, lesson_date: '2026-09-14', period: 1, topic: 'Simultaneous equations' },
    });
    assert.ok(published.body.backfilled_catchup_entries >= 1);

    entries = (await ctx.api('GET', '/api/catchup', { token: student })).body;
    assert.equal(entries.find((e) => e.lesson_date === '2026-09-14').materials_ready, true);
  });

  it('removes the entry if the pupil turns out to have been present', async () => {
    const teacher = await ctx.login(ACCOUNTS.mathsTeacher);
    const student = await ctx.login(ACCOUNTS.peerStudent);
    const studentId = (await ctx.api('GET', '/api/auth/me', { token: student })).body.student.id;

    await ctx.api('POST', '/api/attendance', {
      token: teacher,
      body: { class_subject_id: 1, date: '2026-09-15', period: 1, records: [{ student_id: studentId, status: 'absent' }] },
    });
    assert.ok((await ctx.api('GET', '/api/catchup', { token: student })).body.some((e) => e.lesson_date === '2026-09-15'));

    await ctx.api('POST', '/api/attendance', {
      token: teacher,
      body: { class_subject_id: 1, date: '2026-09-15', period: 1, records: [{ student_id: studentId, status: 'present' }] },
    });
    assert.ok(!(await ctx.api('GET', '/api/catchup', { token: student })).body.some((e) => e.lesson_date === '2026-09-15'),
      'correcting the register clears the entry');
  });
});

describe('Catch-up lessons are worked through, not ticked off', () => {
  it('seeds absences that land on real timetabled lessons with recaps', async () => {
    // Recaps are keyed to a class, date and period. If the seed guesses those
    // instead of reading the timetable, pupils open the hub to a wall of
    // "recap pending" and there is nothing to catch up on.
    const admin = await ctx.login(ACCOUNTS.admin);
    const pupils = (await ctx.api('GET', '/api/students', { token: admin })).body;

    let total = 0;
    let withRecap = 0;
    for (const pupil of pupils) {
      for (const entry of (await ctx.api('GET', `/api/catchup?studentId=${pupil.id}`, { token: admin })).body) {
        total += 1;
        if (entry.materials_ready) withRecap += 1;
      }
    }

    assert.ok(total >= 8, `expected a populated hub, got ${total} entries`);
    assert.ok(withRecap / total > 0.7,
      `only ${withRecap} of ${total} catch-up entries have a recap; absences are not lining up with lessons`);
  });

  it('gives pupils attachments they can actually read', async () => {
    const student = await ctx.login(ACCOUNTS.dyslexicStudent);
    const entry = (await ctx.api('GET', '/api/catchup', { token: student })).body
      .find((e) => e.materials_ready);

    assert.ok(entry.attachments.length > 0, 'a lesson has attachments');

    const notes = entry.attachments.filter((a) => a.type === 'note');
    assert.ok(notes.length > 0, 'written material travels as text, not as a file to download');
    for (const note of notes) {
      assert.ok(note.content && note.content.length > 100,
        'a note carries its text, so the pupil font, tint and read-aloud apply to it');
    }

    // Nothing should be a placeholder link that goes nowhere.
    for (const a of entry.attachments) {
      assert.ok(a.content || (a.url && a.url !== '#'), `${a.name} has nothing behind it`);
    }
  });

  it('lets a teacher attach a file, and refuses one from another class', async () => {
    const teacher = await ctx.login(ACCOUNTS.mathsTeacher);
    const material = (await ctx.api('GET', '/api/materials', { token: teacher })).body[0];

    const form = new FormData();
    form.set('name', 'Practice worksheet');
    form.set('file', new Blob([new TextEncoder().encode('%PDF-1.4 test')]), 'worksheet.pdf');
    const res = await ctx.api('POST', `/api/materials/${material.id}/attachments`, { token: teacher, form });
    assert.equal(res.status, 201);

    const added = res.body.attachments.at(-1);
    assert.equal(added.name, 'Practice worksheet');
    assert.match(added.url, /^\/uploads\/lessons\//);

    // Lesson material opens in place rather than forcing a download.
    const served = await fetch(ctx.base + added.url);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-disposition'), null);
    assert.match(served.headers.get('content-security-policy'), /sandbox/);

    const nursery = await ctx.login(ACCOUNTS.nurseryTeacher);
    const denied = await ctx.api('POST', `/api/materials/${material.id}/attachments`, {
      token: nursery, form: (() => { const f = new FormData();
        f.set('file', new Blob([new TextEncoder().encode('%PDF-1.4')]), 'x.pdf'); return f; })(),
    });
    assert.equal(denied.status, 403);
  });

  it('gives every demo pupil something they can actually work on', async () => {
    for (const account of [ACCOUNTS.dyslexicStudent, ACCOUNTS.senStudent, ACCOUNTS.peerStudent]) {
      const token = await ctx.login(account);
      const entries = (await ctx.api('GET', '/api/catchup', { token })).body;
      const workable = entries.filter((e) => e.materials_ready && e.steps.length > 0);
      assert.ok(workable.length > 0, `${account} has no workable catch-up lesson`);
    }
  });

  it('exposes the steps a lesson needs, and never the answer key', async () => {
    const student = await ctx.login(ACCOUNTS.dyslexicStudent);
    const entry = (await ctx.api('GET', '/api/catchup', { token: student })).body
      .find((e) => e.materials_ready);

    assert.ok(entry, 'a lesson with materials exists');
    assert.deepEqual(entry.steps.map((s) => s.key), ['watch', 'read', 'check']);
    assert.deepEqual(entry.steps_done, []);
    assert.ok(entry.check_questions.length > 0);
    for (const question of entry.check_questions) {
      assert.deepEqual(Object.keys(question).sort(), ['options', 'q'],
        'the correct answer must never reach the pupil');
    }
  });

  it('completes only once every step is done, and marks server-side', async () => {
    const student = await ctx.login(ACCOUNTS.dyslexicStudent);
    const entry = (await ctx.api('GET', '/api/catchup', { token: student })).body
      .find((e) => e.materials_ready);
    const patch = (body) => ctx.api('PATCH', `/api/catchup/${entry.id}`, { token: student, body });

    let res = await patch({ step: 'watch' });
    assert.equal(res.body.status, 'in_progress');

    res = await patch({ step: 'read' });
    assert.deepEqual(res.body.steps_done.sort(), ['read', 'watch']);
    assert.equal(res.body.status, 'in_progress', 'the check is still outstanding');

    // Wrong answers still complete the lesson: catching up is the point.
    res = await patch({ answers: entry.check_questions.map(() => 0) });
    assert.equal(res.body.status, 'completed');
    assert.equal(res.body.check_total, entry.check_questions.length);
    assert.ok(res.body.marked.every((m) => typeof m.correct === 'boolean'));

    // Retrying replaces the score rather than stacking attempts.
    const correct = res.body.marked.map((m) => m.answer);
    res = await patch({ answers: correct });
    assert.equal(res.body.check_score, entry.check_questions.length);
  });

  it('refuses a pupil who simply declares the lesson finished', async () => {
    const student = await ctx.login(ACCOUNTS.senStudent);
    const entry = (await ctx.api('GET', '/api/catchup', { token: student })).body
      .find((e) => e.materials_ready && e.status !== 'completed');
    assert.ok(entry, 'an unfinished lesson exists');

    const res = await ctx.api('PATCH', `/api/catchup/${entry.id}`, {
      token: student, body: { status: 'completed' },
    });
    assert.notEqual(res.body.status, 'completed');
    assert.deepEqual(res.body.steps_done, []);

    const bogus = await ctx.api('PATCH', `/api/catchup/${entry.id}`, {
      token: student, body: { step: 'everything' },
    });
    assert.deepEqual(bogus.body.steps_done, []);
  });
});

describe('Story 2: SEN multi-format submission and automatic extra time', () => {
  it('calculates 60 x 1.5 = 90 minutes for a pupil with an extra-time arrangement', async () => {
    const student = await ctx.login(ACCOUNTS.senStudent);

    const me = await ctx.api('GET', '/api/auth/me', { token: student });
    assert.equal(me.body.iep.time_multiplier, 1.5);

    const assignments = (await ctx.api('GET', '/api/assignments', { token: student })).body;
    const timed = assignments.find((a) => a.base_duration_minutes === 60);
    assert.ok(timed, 'a 60-minute timed assessment exists');

    const session = await ctx.api('POST', `/api/assignments/${timed.id}/start`, { token: student });
    assert.equal(session.status, 201);
    assert.equal(session.body.base_minutes, 60);
    assert.equal(session.body.time_multiplier, 1.5);
    assert.equal(session.body.allowed_minutes, 90, '60 x 1.5 must be 90');

    const remainingMs = new Date(session.body.expires_at).getTime() - Date.now();
    assert.ok(remainingMs > 89 * 60_000 && remainingMs <= 90 * 60_000,
      'the countdown initialises at roughly 01:30:00');
  });

  it('gives a pupil without an arrangement the standard duration', async () => {
    const student = await ctx.login(ACCOUNTS.peerStudent);
    const assignments = (await ctx.api('GET', '/api/assignments', { token: student })).body;
    const timed = assignments.find((a) => a.base_duration_minutes === 60);

    const session = await ctx.api('POST', `/api/assignments/${timed.id}/start`, { token: student });
    assert.equal(session.body.time_multiplier, 1);
    assert.equal(session.body.allowed_minutes, 60);
  });

  it('starting twice returns the same session rather than resetting the clock', async () => {
    const student = await ctx.login(ACCOUNTS.dyslexicStudent);
    const assignments = (await ctx.api('GET', '/api/assignments', { token: student })).body;
    const timed = assignments.find((a) => a.base_duration_minutes === 60);

    const first = await ctx.api('POST', `/api/assignments/${timed.id}/start`, { token: student });
    const second = await ctx.api('POST', `/api/assignments/${timed.id}/start`, { token: student });
    assert.equal(second.body.expires_at, first.body.expires_at, 'the timer cannot be restarted');
  });

  it('presents a quiz as questions, not a blank answer box', async () => {
    const student = await ctx.login(ACCOUNTS.senStudent);
    const list = (await ctx.api('GET', '/api/assignments', { token: student })).body;
    const quiz = list.find((a) => a.title === 'Quadratics Check-In Quiz');

    const detail = (await ctx.api('GET', `/api/assignments/${quiz.id}`, { token: student })).body;
    assert.equal(detail.is_quiz, true);
    assert.ok(detail.question_count >= 3, 'a quiz has real questions');
    for (const question of detail.questions) {
      assert.deepEqual(Object.keys(question).sort(), ['options', 'q'],
        'the answer key must never reach the pupil');
      assert.ok(question.options.length >= 2);
    }
  });

  it('marks a quiz on submission and records the grade', async () => {
    const student = await ctx.login(ACCOUNTS.senStudent);
    const list = (await ctx.api('GET', '/api/assignments', { token: student })).body;
    const quiz = list.find((a) => a.title === 'Quadratics Check-In Quiz');
    const detail = (await ctx.api('GET', `/api/assignments/${quiz.id}`, { token: student })).body;

    await ctx.api('POST', `/api/assignments/${quiz.id}/start`, { token: student });

    // Half right, so the grade has to be calculated rather than assumed.
    const answers = detail.questions.map((_, i) => (i % 2 === 0 ? 1 : 0));
    const res = await ctx.api('POST', `/api/assignments/${quiz.id}/submissions`, {
      token: student, body: { submission_type: 'QUIZ', answers },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.submission_type, 'QUIZ');
    assert.equal(res.body.total, detail.question_count);
    assert.equal(res.body.grade, Math.round((res.body.score / res.body.total) * detail.max_score * 100) / 100);
    assert.ok(['graded', 'late'].includes(res.body.status), 'a marked quiz needs no teacher');
    assert.equal(res.body.marked.length, detail.question_count);
  });

  it('refuses a quiz submitted with questions unanswered', async () => {
    const student = await ctx.login(ACCOUNTS.peerStudent);
    const list = (await ctx.api('GET', '/api/assignments', { token: student })).body;
    const quiz = list.find((a) => a.title === 'Quadratics Check-In Quiz');

    const res = await ctx.api('POST', `/api/assignments/${quiz.id}/submissions`, {
      token: student, body: { submission_type: 'QUIZ', answers: [0] },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Answer all/);
  });

  it('lets staff see the answer key that pupils cannot', async () => {
    const teacher = await ctx.login(ACCOUNTS.mathsTeacher);
    const list = (await ctx.api('GET', '/api/assignments', { token: teacher })).body;
    const quiz = list.find((a) => a.title === 'Quadratics Check-In Quiz');
    const detail = (await ctx.api('GET', `/api/assignments/${quiz.id}`, { token: teacher })).body;
    assert.ok(detail.questions.every((q) => typeof q.answer === 'number'));
  });

  it('accepts an audio submission and queues speech-to-text for the teacher', async () => {
    const student = await ctx.login(ACCOUNTS.senStudent);
    const assignments = (await ctx.api('GET', '/api/assignments', { token: student })).body;
    const essay = assignments.find((a) => a.title === 'History Impact Essay');

    const form = new FormData();
    form.set('submission_type', 'AUDIO');
    form.set('duration', '04:30');
    // A minimal but genuine MP3 frame header, so the magic-number check passes.
    form.set('file', new Blob([new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0, 0, 0])]), 'essay_recap.mp3');

    const res = await ctx.api('POST', `/api/assignments/${essay.id}/submissions`, { token: student, form });
    assert.equal(res.status, 201);
    assert.equal(res.body.submission_type, 'AUDIO');
    assert.equal(res.body.status, 'submitted');
    assert.equal(res.body.file_name, 'essay_recap.mp3');
    assert.match(res.body.transcript, /Transcription queued/, 'speech-to-text is queued for teacher review');
  });

  it('refuses multi-format from a pupil without that arrangement on a text-only task', async () => {
    const student = await ctx.login(ACCOUNTS.peerStudent);
    const assignments = (await ctx.api('GET', '/api/assignments', { token: student })).body;
    const textOnly = assignments.find((a) => a.allow_multi_format === 0);
    assert.ok(textOnly, 'a text-only assignment exists');

    const form = new FormData();
    form.set('submission_type', 'AUDIO');
    form.set('file', new Blob([new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0])]), 'answer.mp3');

    const res = await ctx.api('POST', `/api/assignments/${textOnly.id}/submissions`, { token: student, form });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /not approved/i);
  });
});
