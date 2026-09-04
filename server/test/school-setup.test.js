/** Building a school from nothing: subjects, who teaches what, and when. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTS, boot } from './helpers.js';

let ctx, admin, teacher;
before(async () => {
  ctx = await boot();
  admin = await ctx.login(ACCOUNTS.admin);
  teacher = await ctx.login(ACCOUNTS.mathsTeacher);
});
after(async () => { await ctx.close(); });

const post = (path, body, token = admin) => ctx.api('POST', path, { token, body });

describe('the curriculum', () => {
  it('derives a code when the school has no scheme of its own', async () => {
    const made = await post('/api/subjects', { name: 'Design Technology', section: 'secondary', colour: '#0891b2' });
    assert.equal(made.status, 201);
    assert.equal(made.body.code, 'DESIGN');

    // A second subject that reduces to the same code gets its own.
    const clash = await post('/api/subjects', { name: 'Design Studies', section: 'primary' });
    assert.equal(clash.body.code, 'DESIGN2');
  });

  it('will not delete a subject a class still takes', async () => {
    const subject = (await ctx.api('GET', '/api/subjects', { token: admin })).body
      .find((s) => s.name === 'Mathematics');
    const refused = await ctx.api('DELETE', `/api/subjects/${subject.id}`, { token: admin });
    assert.equal(refused.status, 409);
    assert.match(refused.body.error, /taught by/i);
  });

  it('counts a subject against every section that teaches it', async () => {
    const before = (await ctx.api('GET', '/api/sections', { token: admin })).body;
    const [a, b] = before.slice(0, 2);

    const made = await post('/api/subjects', { name: 'Citizenship', sections: [a.key, b.key] });
    assert.equal(made.status, 201);

    const after = (await ctx.api('GET', '/api/sections', { token: admin })).body;
    const count = (key) => after.find((s) => s.key === key).subject_count;
    assert.equal(count(a.key), before[0].subject_count + 1);
    assert.equal(count(b.key), before[1].subject_count + 1,
                 'a subject taught in two sections shows in both, not just the first');
  });

  it('is the office to change, not a teacher', async () => {
    assert.equal((await post('/api/subjects', { name: 'Latin', section: 'secondary' }, teacher)).status, 403);
  });
});

describe('what a class is taught', () => {
  let klass, subject;

  before(async () => {
    klass = (await ctx.api('GET', '/api/classes', { token: admin })).body[0];
    subject = (await post('/api/subjects', { name: 'Drama', section: klass.section })).body;
  });

  it('pairs a subject with a teacher, and refuses the same subject twice', async () => {
    const staff = (await ctx.api('GET', '/api/staff', { token: admin })).body.find((s) => s.role === 'teacher');
    const added = await post(`/api/classes/${klass.id}/subjects`, { subject_id: subject.id, teacher_id: staff.user_id });
    assert.equal(added.status, 201);

    const again = await post(`/api/classes/${klass.id}/subjects`, { subject_id: subject.id });
    assert.equal(again.status, 409);

    const listed = (await ctx.api('GET', `/api/classes/${klass.id}/subjects`, { token: admin })).body
      .find((row) => row.subject_id === subject.id);
    assert.equal(listed.teacher_id, staff.user_id);
    assert.equal(listed.lessons_per_week, 0);
  });

  it('moves the subject to another teacher', async () => {
    const row = (await ctx.api('GET', `/api/classes/${klass.id}/subjects`, { token: admin })).body
      .find((r) => r.subject_id === subject.id);
    const other = (await ctx.api('GET', '/api/staff', { token: admin })).body
      .find((s) => s.role === 'teacher' && s.user_id !== row.teacher_id);

    const moved = await ctx.api('PATCH', `/api/class-subjects/${row.id}`, {
      token: admin, body: { teacher_id: other.user_id },
    });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.teacher_id, other.user_id);
  });

  it('warns before removing one that already has work against it', async () => {
    // A pairing the demo school has taught: registers and marks already exist.
    const taught = (await ctx.api('GET', '/api/my/subjects', { token: admin })).body
      .find((r) => r.name === 'Mathematics');
    const busy = (await ctx.api('GET', `/api/classes/${taught.class_id}/subjects`, { token: admin })).body
      .find((r) => r.name === 'Mathematics');
    const refused = await ctx.api('DELETE', `/api/class-subjects/${busy.id}`, { token: admin });
    assert.equal(refused.status, 409);
    assert.ok(refused.body.attached.registers > 0 || refused.body.attached.assignments > 0);

    const forced = await ctx.api('DELETE', `/api/class-subjects/${busy.id}?confirm=1`, { token: admin });
    assert.equal(forced.status, 200);
  });
});

describe('the timetable', () => {
  let row, klass;

  before(async () => {
    klass = (await ctx.api('GET', '/api/classes', { token: admin })).body[1];
    const subject = (await post('/api/subjects', { name: 'Philosophy', section: klass.section })).body;
    const staff = (await ctx.api('GET', '/api/staff', { token: admin })).body.find((s) => s.role === 'teacher');
    await post(`/api/classes/${klass.id}/subjects`, { subject_id: subject.id, teacher_id: staff.user_id });
    row = (await ctx.api('GET', `/api/classes/${klass.id}/subjects`, { token: admin })).body
      .find((r) => r.subject_id === subject.id);
  });

  it('adds a lesson and counts it against the subject', async () => {
    const made = await post('/api/timetable', {
      class_subject_id: row.id, day_of_week: 3, period: 9, start_time: '14:00', end_time: '14:45', room: 'R9',
    });
    assert.equal(made.status, 201);

    const listed = (await ctx.api('GET', `/api/classes/${klass.id}/subjects`, { token: admin })).body
      .find((r) => r.id === row.id);
    assert.equal(listed.lessons_per_week, 1, 'the subject now shows one lesson a week');
  });

  it('refuses to put a class in two lessons at once', async () => {
    const clash = await post('/api/timetable', {
      class_subject_id: row.id, day_of_week: 3, period: 9, start_time: '14:00', end_time: '14:45',
    });
    assert.equal(clash.status, 409);
    assert.match(clash.body.error, /already has/i);
  });

  it('refuses to put a teacher in two rooms at once', async () => {
    // Same teacher, a different class, the same period.
    const klass = (await ctx.api('GET', '/api/classes', { token: admin })).body[2];
    const subject = (await post('/api/subjects', { name: 'Debating', section: klass.section })).body;
    const teacherId = (await ctx.api('GET', '/api/staff', { token: admin })).body.find((s) => s.role === 'teacher').user_id;
    await post(`/api/classes/${klass.id}/subjects`, { subject_id: subject.id, teacher_id: teacherId });
    const other = (await ctx.api('GET', `/api/classes/${klass.id}/subjects`, { token: admin })).body
      .find((r) => r.subject_id === subject.id);

    const clash = await post('/api/timetable', {
      class_subject_id: other.id, day_of_week: 3, period: 9, start_time: '14:00', end_time: '14:45',
    });
    assert.equal(clash.status, 409);
    assert.match(clash.body.error, /already with/i);
  });

  it('moves a lesson without losing it, and refuses a move into a taken period', async () => {
    const mine = (await ctx.api('GET', `/api/timetable?classId=${klass.id}`, { token: admin })).body;
    const slot = mine[0];

    // Somewhere in the week nothing else is booked for this class or its teacher.
    const taken = new Set(mine.map((s) => `${s.day_of_week}-${s.period}`));
    const free = [1, 2, 3, 4, 5].flatMap((d) => [1, 2, 3, 4, 5, 6, 7, 8].map((pd) => [d, pd]))
      .find(([d, pd]) => !taken.has(`${d}-${pd}`));

    const moved = await ctx.api('PATCH', `/api/timetable/${slot.id}`, {
      token: admin,
      body: { day_of_week: free[0], period: free[1], start_time: '13:00', end_time: '13:45', room: 'Lab 2' },
    });
    assert.equal(moved.status, 200, moved.body.error);
    assert.equal(moved.body.id, slot.id, 'the same lesson, in a new place');
    assert.equal(moved.body.period, free[1]);
    assert.equal(moved.body.room, 'Lab 2');

    // Back on top of a lesson that is still where it was.
    const other = (await ctx.api('GET', `/api/timetable?classId=${klass.id}`, { token: admin })).body
      .find((s) => s.id !== slot.id);
    if (other) {
      const clash = await ctx.api('PATCH', `/api/timetable/${slot.id}`, {
        token: admin, body: { day_of_week: other.day_of_week, period: other.period },
      });
      assert.equal(clash.status, 409);
    }

    assert.equal((await ctx.api('PATCH', `/api/timetable/${slot.id}`,
                                { token: teacher, body: { period: 1 } })).status, 403);
  });

  it('puts a break on the week without it becoming a subject', async () => {
    const freeIn = async (id) => {
      const week = (await ctx.api('GET', `/api/timetable?classId=${id}`, { token: admin })).body;
      const taken = new Set(week.map((s) => `${s.day_of_week}-${s.period}`));
      return [1, 2, 3, 4, 5].flatMap((d) => [1, 2, 3, 4, 5, 6, 7, 8].map((pd) => [d, pd]))
        .find(([d, pd]) => !taken.has(`${d}-${pd}`));
    };
    const [day, period] = await freeIn(klass.id);

    const made = await post('/api/timetable', {
      class_id: klass.id, break_kind: 'long', day_of_week: day, period,
      start_time: '12:00', end_time: '12:45',
    });
    assert.equal(made.status, 201, made.body.error);

    const week = (await ctx.api('GET', `/api/timetable?classId=${klass.id}`, { token: admin })).body;
    const lunch = week.find((s) => s.id === made.body.id);
    assert.equal(lunch.subject, 'Long break');
    assert.equal(lunch.is_break, 1);
    assert.equal(lunch.teacher_name, null, 'nobody is timetabled to supervise by this');

    // The curriculum is what is taught, so a break is not in it.
    const curriculum = (await ctx.api('GET', '/api/subjects', { token: admin })).body;
    assert.ok(!curriculum.some((sub) => sub.name === 'Long break'));
    const taught = (await ctx.api('GET', `/api/classes/${klass.id}/subjects`, { token: admin })).body;
    assert.ok(!taught.some((row) => row.name === 'Long break'));

    // A second class shares the same break rather than inventing another.
    const other = (await ctx.api('GET', '/api/classes', { token: admin })).body
      .find((c) => c.id !== klass.id);
    const [otherDay, otherPeriod] = await freeIn(other.id);
    const again = await post('/api/timetable', {
      class_id: other.id, break_kind: 'long', day_of_week: otherDay, period: otherPeriod,
      start_time: '12:00', end_time: '12:45',
    });
    assert.equal(again.status, 201, again.body.error);
    assert.equal((await ctx.api('GET', '/api/subjects?all=1', { token: admin })).body
      .filter((sub) => sub.name === 'Long break').length, 0, 'still absent from the curriculum');
  });

  it('swaps two lessons in one move', async () => {
    const week = (await ctx.api('GET', `/api/timetable?classId=${klass.id}`, { token: admin })).body;
    const [one, two] = week;

    const swap = await post('/api/timetable/swap', { a: one.id, b: two.id });
    assert.equal(swap.status, 200, swap.body.error);

    const after = (await ctx.api('GET', `/api/timetable?classId=${klass.id}`, { token: admin })).body;
    const nowOne = after.find((s) => s.id === one.id);
    const nowTwo = after.find((s) => s.id === two.id);
    assert.equal(nowOne.period, two.period, 'each lesson takes the other place');
    assert.equal(nowOne.start_time, two.start_time, 'and the hour that goes with it');
    assert.equal(nowTwo.period, one.period);
    assert.equal(after.length, week.length, 'nothing is created or lost by a swap');

    assert.equal((await post('/api/timetable/swap', { a: one.id, b: two.id }, teacher)).status, 403);
  });

  it('checks the times make sense', async () => {
    for (const body of [
      { day_of_week: 9, period: 1, start_time: '09:00', end_time: '09:45' },
      { day_of_week: 2, period: 1, start_time: 'morning', end_time: '09:45' },
      { day_of_week: 2, period: 1, start_time: '10:00', end_time: '09:45' },
    ]) {
      const bad = await post('/api/timetable', { class_subject_id: row.id, ...body });
      assert.equal(bad.status, 400, JSON.stringify(body));
    }
  });
});

describe('the setup checklist', () => {
  it('reports what a school still has to do', async () => {
    const res = await ctx.api('GET', '/api/setup', { token: admin });
    assert.equal(res.status, 200);
    assert.equal(res.body.total, res.body.steps.length);

    for (const step of res.body.steps) {
      assert.ok(step.key && step.title && step.link && step.cta);
      assert.equal(typeof step.done, 'boolean');
    }
    // The demo school is fully populated, and its website carries no
    // bracketed placeholders, so nothing is outstanding.
    const outstanding = res.body.steps.filter((s) => !s.done).map((s) => s.key);
    assert.deepEqual(outstanding, [], 'nothing outstanding for a populated school');
    assert.equal(res.body.complete, true);
  });

  it('is for school leadership only', async () => {
    assert.equal((await ctx.api('GET', '/api/setup', { token: teacher })).status, 403);
  });
});

describe('classes are named as the school writes them', () => {
  it('creates several at once, each keeping its own name and order', async () => {
    const made = await post('/api/classes', {
      section: 'primary', streams: ['Primary 1 Rose', 'Primary 1 Lily', 'Primary 2 Hibiscus'], room: 'P-1',
    });
    assert.equal(made.status, 201);
    assert.deepEqual(made.body.map((c) => c.name), ['Primary 1 Rose', 'Primary 1 Lily', 'Primary 2 Hibiscus']);

    // The number in a name is what orders it, read per class rather than per batch.
    assert.deepEqual(made.body.map((c) => c.level), [1, 1, 2]);
    assert.ok(made.body.every((c) => c.section === 'primary'));
  });

  it('refuses a name already used in that section, but not in another', async () => {
    const clash = await post('/api/classes', { section: 'primary', streams: ['Primary 1 Rose'] });
    assert.equal(clash.status, 409);
    assert.match(clash.body.error, /Primary 1 Rose/);

    // Two parts of a school may each have a 1A; they are different classes.
    const elsewhere = await post('/api/classes', { section: 'secondary', streams: ['Primary 1 Rose'] });
    assert.equal(elsewhere.status, 201, 'the same name in another section is fine');
  });

  it('creates a single class on its own', async () => {
    const made = await post('/api/classes', { section: 'secondary', streams: ['JSS 3'] });
    assert.equal(made.status, 201);
    assert.equal(made.body[0].name, 'JSS 3');
    assert.equal(made.body[0].level, 3);
  });

  it('hands a class to a homeroom teacher after the fact', async () => {
    const rose = (await ctx.api('GET', '/api/classes', { token: admin })).body.find((c) => c.name === 'Primary 1 Rose');
    const aTeacher = (await ctx.api('GET', '/api/staff', { token: admin })).body.find((s) => s.role === 'teacher');

    const moved = await ctx.api('PATCH', `/api/classes/${rose.id}`, {
      token: admin, body: { homeroom_teacher_id: aTeacher.user_id },
    });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.homeroom_teacher_id, aTeacher.user_id);

    const renameClash = await ctx.api('PATCH', `/api/classes/${rose.id}`, {
      token: admin, body: { name: 'Primary 1 Lily' },
    });
    assert.equal(renameClash.status, 409);
  });
});

describe('removing a class', () => {
  it('will not strand pupils in no class at all', async () => {
    const full = (await ctx.api('GET', '/api/classes', { token: admin })).body.find((c) => c.student_count > 0);
    const refused = await ctx.api('DELETE', `/api/classes/${full.id}`, { token: admin });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.pupils, full.student_count);
    assert.match(refused.body.error, /Move them/i);
  });

  it('removes an empty class outright', async () => {
    const made = (await post('/api/classes', {
      section: 'primary', streams: ['Primary 2 Willow'],
    })).body[0];
    const gone = await ctx.api('DELETE', `/api/classes/${made.id}`, { token: admin });
    assert.equal(gone.status, 200);
    assert.ok(!(await ctx.api('GET', '/api/classes', { token: admin })).body.some((c) => c.id === made.id));
  });

  it('names what would go before taking a class that has been taught', async () => {
    const klass = (await post('/api/classes', {
      section: 'primary', streams: ['Primary 3 Ash'],
    })).body[0];
    const subject = (await ctx.api('GET', '/api/subjects', { token: admin })).body.find((s) => s.section === 'primary');
    const cs = (await post(`/api/classes/${klass.id}/subjects`, { subject_id: subject.id })).body;
    await post('/api/timetable', {
      class_subject_id: cs.id, day_of_week: 2, period: 4, start_time: '11:00', end_time: '11:45',
    });

    const warned = await ctx.api('DELETE', `/api/classes/${klass.id}`, { token: admin });
    assert.equal(warned.status, 409);
    assert.equal(warned.body.attached.subjects, 1);
    assert.equal(warned.body.attached.lessons, 1);

    const done = await ctx.api('DELETE', `/api/classes/${klass.id}?confirm=1`, { token: admin });
    assert.equal(done.status, 200);
    assert.ok(!(await ctx.api('GET', '/api/classes', { token: admin })).body.some((c) => c.id === klass.id));
  });

  it('is not a teacher to make', async () => {
    const klass = (await ctx.api('GET', '/api/classes', { token: admin })).body[0];
    assert.equal((await ctx.api('DELETE', `/api/classes/${klass.id}`, { token: teacher })).status, 403);
  });
});

describe('enrolling a list of pupils', () => {
  const list = () => ([
    { first_name: 'Ada', last_name: 'Bello', class: 'Primary 4 Kestrels', date_of_birth: '2016-03-14',
      guardian_name: 'Ngozi Bello', guardian_email: 'n.bello@family.example', guardian_relationship: 'Mother' },
    { first_name: 'Tom', last_name: 'Fisher', class: 'Primary 4 Kestrels' },
    { first_name: '', last_name: 'Nameless', class: 'Primary 4 Kestrels' },
    { first_name: 'Bad', last_name: 'Class', class: 'Primary 9 Nowhere' },
    { first_name: 'Clash', last_name: 'Email', class: 'Primary 4 Kestrels', email: ACCOUNTS.admin },
    { first_name: 'Bad', last_name: 'Date', class: 'Primary 4 Kestrels', date_of_birth: '14/03/2016' },
  ]);

  it('will not guess which classroom of a year a pupil belongs in', async () => {
    // Classes of a year share a name, so a name alone can point at several.
    await post('/api/classes', { section: 'primary', rooms: ['X', 'Y'] });
    const year = (await ctx.api('GET', '/api/sections', { token: admin })).body
      .find((sec) => sec.key === 'primary').name;

    const dry = await post('/api/students/import', {
      rows: [
        { first_name: 'Ada', last_name: 'One', class: year },
        { first_name: 'Tom', last_name: 'Two', class: year, classroom: 'Y' },
        { first_name: 'Sam', last_name: 'Three', class: `${year} X` },
      ],
      dry_run: true,
    });

    assert.match(dry.body.rows[0].errors[0], /classrooms/i, 'ambiguity is refused, not guessed');
    assert.ok(dry.body.rows[1].class_id, 'a classroom column resolves it');
    assert.ok(dry.body.rows[2].class_id, 'so does writing them together');
  });

  it('checks a file without writing anything, and says what is wrong with each row', async () => {
    const before = (await ctx.api('GET', '/api/students', { token: admin })).body.length;
    const dry = await post('/api/students/import', { rows: list(), dry_run: true });

    assert.equal(dry.status, 200);
    assert.equal(dry.body.committed, false);
    assert.equal(dry.body.summary.ready, 2);
    assert.equal(dry.body.summary.errors, 4);

    const errors = Object.fromEntries(dry.body.rows.filter((r) => r.status === 'error').map((r) => [r.line, r.errors[0]]));
    assert.match(errors[3], /first and last name/i);
    assert.match(errors[4], /No class called/i);
    assert.match(errors[5], /already has that email/i);
    assert.match(errors[6], /Date of birth/i);

    assert.equal((await ctx.api('GET', '/api/students', { token: admin })).body.length, before,
                 'a preview enrols nobody');
  });

  it('refuses the whole file while any row is wrong', async () => {
    const refused = await post('/api/students/import', { rows: list() });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /need fixing/i);
    assert.equal(refused.body.committed, false);
  });

  it('enrols the good rows on request, with their guardians attached', async () => {
    const done = await post('/api/students/import', { rows: list(), allow_partial: true });
    assert.equal(done.status, 201);
    assert.equal(done.body.summary.imported, 2);

    const ada = done.body.created.find((c) => c.name === 'Ada Bello');
    const detail = (await ctx.api('GET', `/api/students/${ada.student_id}`, { token: admin })).body;
    assert.equal(detail.class_name, 'Primary 4 Kestrels');
    assert.equal(detail.guardians[0].relationship, 'Mother');

    // The guardian arrives without a password, like every other account.
    const guessed = await ctx.api('POST', '/api/auth/login', {
      body: { email: 'n.bello@family.example', password: 'Passw0rd!' },
    });
    assert.equal(guessed.status, 401);
  });

  it('links a child to a guardian who already has an account', async () => {
    const done = await post('/api/students/import', {
      rows: [{ first_name: 'Zoe', last_name: 'Adeyemi', class: 'Nursery 2 Sunflowers', guardian_email: ACCOUNTS.parent }],
    });
    assert.equal(done.status, 201);
    const detail = (await ctx.api('GET', `/api/students/${done.body.created[0].student_id}`, { token: admin })).body;
    assert.equal(detail.guardians[0].email, ACCOUNTS.parent);
  });

  it('is a job for an administrator', async () => {
    assert.equal((await post('/api/students/import', { rows: [], dry_run: true }, teacher)).status, 403);
  });
});

describe('taking on a list of staff', () => {
  const list = () => ([
    { first_name: 'Ada', last_name: 'Okonkwo', email: 'a.okonkwo@school.example', role: 'teacher',
      title: 'Physics Teacher', department: 'Secondary' },
    { first_name: 'Priya', last_name: 'Raman', email: 'p.raman@school.example', title: 'SENCO', is_senco: 'yes' },
    { first_name: 'Bola', last_name: 'Ige', email: 'b.ige@school.example', role: 'admin', title: 'Bursar' },
    { first_name: 'No', last_name: 'Email' },
    { first_name: 'Taken', last_name: 'Email', email: ACCOUNTS.mathsTeacher },
  ]);

  it('insists on an email, since that is how they are invited', async () => {
    const dry = await post('/api/staff/import', { rows: list(), dry_run: true });
    assert.equal(dry.status, 200);
    assert.equal(dry.body.summary.ready, 3);
    assert.equal(dry.body.summary.administrators, 1);

    const errors = Object.fromEntries(dry.body.rows.filter((r) => r.status === 'error').map((r) => [r.line, r.errors[0]]));
    assert.match(errors[4], /email is needed/i);
    assert.match(errors[5], /already has that email/i);
  });

  it('adds them with a one-time link each, and no password anybody knows', async () => {
    const done = await post('/api/staff/import', { rows: list(), allow_partial: true });
    assert.equal(done.status, 201);
    assert.equal(done.body.summary.imported, 3);

    for (const person of done.body.created) {
      assert.match(person.activation_link, /\/activate\//);
      assert.match(person.staff_code, /^STF-\d+$/);
    }

    const staff = (await ctx.api('GET', '/api/staff', { token: admin })).body;
    const senco = staff.find((s) => s.email === 'p.raman@school.example');
    assert.equal(senco.is_senco, 1, 'the SEN flag comes across');
    assert.equal(staff.find((s) => s.email === 'b.ige@school.example').role, 'admin');

    const guessed = await ctx.api('POST', '/api/auth/login', {
      body: { email: 'a.okonkwo@school.example', password: 'Passw0rd!' },
    });
    assert.equal(guessed.status, 401);

    // The link they were given is the one that lets them in.
    const token = done.body.created[0].activation_link.split('/activate/')[1];
    assert.equal((await ctx.api('GET', `/api/invites/token/${token}`)).body.kind, 'first_sign_in');
    assert.equal((await ctx.api('POST', `/api/invites/token/${token}/accept`, {
      body: { password: 'their-own-password' },
    })).status, 200);
    assert.equal((await ctx.api('POST', '/api/auth/login', {
      body: { email: 'a.okonkwo@school.example', password: 'their-own-password' },
    })).status, 200);
  });

  it('is a job for an administrator', async () => {
    assert.equal((await post('/api/staff/import', { rows: [], dry_run: true }, teacher)).status, 403);
  });
});

describe('a school divides itself up', () => {
  let jss;

  it('adds a section of its own and puts classes and subjects in it', async () => {
    const before = (await ctx.api('GET', '/api/sections', { token: admin })).body;
    assert.ok(before.length >= 3);

    jss = (await post('/api/sections', { name: 'Junior Secondary' })).body;
    assert.equal(jss.key, 'junior_secondary', 'a handle that survives renaming');

    const classes = (await post('/api/classes', {
      section: jss.key, streams: ['JSS 1 Gold', 'JSS 1 Silver'],
    })).body;
    assert.equal(classes.length, 2);
    assert.equal(classes[0].section, jss.key);

    const subject = await post('/api/subjects', { name: 'Basic Technology', section: jss.key });
    assert.equal(subject.status, 201);
  });

  it('renames without touching anything academic', async () => {
    const renamed = await ctx.api('PATCH', `/api/sections/${jss.id}`, {
      token: admin, body: { name: 'Junior Secondary School' },
    });
    assert.equal(renamed.body.name, 'Junior Secondary School');

    const still = (await ctx.api('GET', '/api/classes', { token: admin })).body
      .filter((c) => c.section === jss.key);
    assert.equal(still.length, 2, 'the classes are held by key, not by name');
  });

  it('refuses a section the school has not defined', async () => {
    const bad = await post('/api/classes', { section: 'made_up', streams: ['Nowhere'] });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /your school/i);
  });

  it('will not remove one that still holds classes', async () => {
    const refused = await ctx.api('DELETE', `/api/sections/${jss.id}`, { token: admin });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.attached.classes, 2);

    const spare = (await post('/api/sections', { name: 'Sixth Form' })).body;
    assert.equal((await ctx.api('DELETE', `/api/sections/${spare.id}`, { token: admin })).status, 200);
  });

  it('reports what each section holds, and names them on the public site', async () => {
    const listed = (await ctx.api('GET', '/api/sections', { token: admin })).body;
    for (const section of listed) {
      assert.equal(typeof section.class_count, 'number');
      assert.equal(typeof section.student_count, 'number');
    }
    const site = (await ctx.api('GET', '/api/public/site')).body;
    assert.deepEqual(site.sections.map((s) => s.name), listed.map((s) => s.name));
  });

  it('is read by teachers and written by administrators', async () => {
    assert.equal((await ctx.api('GET', '/api/sections', { token: teacher })).status, 200);
    assert.equal((await post('/api/sections', { name: 'Nope' }, teacher)).status, 403);
  });
});

describe('duplicating a class', () => {
  it('brings the setup and leaves the pupils', async () => {
    const source = (await ctx.api('GET', '/api/classes', { token: admin })).body.find((c) => c.student_count > 0);
    const subjects = (await ctx.api('GET', `/api/classes/${source.id}/subjects`, { token: admin })).body;
    const lessons = (await ctx.api('GET', `/api/timetable?classId=${source.id}`, { token: admin })).body;

    const copy = await post(`/api/classes/${source.id}/duplicate`, { name: `${source.name} Beta` });
    assert.equal(copy.status, 201);
    assert.equal(copy.body.year_label, source.year_label, 'it joins the same year');
    assert.equal(copy.body.section, source.section);
    assert.equal(copy.body.copied.subjects, subjects.length);
    assert.equal(copy.body.copied.lessons, lessons.length, 'the timetable shape comes across whole');

    const roster = (await ctx.api('GET', `/api/classes/${copy.body.id}/roster`, { token: admin })).body;
    assert.equal(roster.length, 0, 'the copy starts empty');
  });

  it('leaves a subject without a teacher rather than booking them twice', async () => {
    const source = (await ctx.api('GET', '/api/classes', { token: admin })).body.find((c) => c.name.endsWith('Alpha'));
    const copy = await post(`/api/classes/${source.id}/duplicate`, { name: `${source.name} Gamma` });

    assert.ok(copy.body.needs_teacher.length > 0, 'the original teachers are busy at those times');
    const taught = (await ctx.api('GET', `/api/classes/${copy.body.id}/subjects`, { token: admin })).body;
    for (const name of copy.body.needs_teacher) {
      assert.equal(taught.find((s) => s.name === name).teacher_id, null);
    }

    // And the clash rule still holds for anything added by hand afterwards:
    // a period the copied timetable already fills cannot take a second lesson.
    const timetable = (await ctx.api('GET', `/api/timetable?classId=${copy.body.id}`, { token: admin })).body;
    const taken = timetable[0];
    const clash = await post('/api/timetable', {
      class_subject_id: taught.find((s) => s.id !== taken.class_subject_id).id,
      day_of_week: taken.day_of_week, period: taken.period, start_time: '08:00', end_time: '08:45',
    });
    assert.equal(clash.status, 409);
  });

  it('copies the shell alone when asked, and refuses a name already taken', async () => {
    const source = (await ctx.api('GET', '/api/classes', { token: admin })).body[0];
    const bare = await post(`/api/classes/${source.id}/duplicate`, { name: `${source.name} Shell`, with_subjects: false });
    assert.equal(bare.body.copied.subjects, 0);
    assert.equal(bare.body.copied.lessons, 0);

    assert.equal((await post(`/api/classes/${source.id}/duplicate`, { name: `${source.name} Shell` })).status, 409);
    assert.equal((await post(`/api/classes/${source.id}/duplicate`, { name: 'Nope' }, teacher)).status, 403);
  });
});

describe('importing a week', () => {
  let klass, subjectName;

  before(async () => {
    klass = (await ctx.api('GET', '/api/classes', { token: admin })).body
      .find((c) => c.section && c.name);
    subjectName = (await ctx.api('GET', `/api/classes/${klass.id}/subjects`, { token: admin })).body[0]?.name
      ?? (await ctx.api('GET', '/api/subjects', { token: admin })).body[0].name;
  });

  const free = async () => {
    const week = (await ctx.api('GET', `/api/timetable?classId=${klass.id}`, { token: admin })).body;
    const taken = new Set(week.map((s) => `${s.day_of_week}-${s.period}`));
    return [1, 2, 3, 4, 5].flatMap((d) => [1, 2, 3, 4, 5, 6, 7, 8].map((pd) => [d, pd]))
      .filter(([d, pd]) => !taken.has(`${d}-${pd}`));
  };

  it('reads days and periods as a school writes them, and fills in the hour', async () => {
    const [[day, period]] = await free();
    const dry = await post('/api/timetable/import', {
      rows: [{ class: klass.name, classroom: klass.room ?? '', subject: subjectName,
               day: 'Tue', period: String(period) }],
      dry_run: true,
    });
    assert.equal(dry.status, 200);
    const row = dry.body.rows[0];
    assert.equal(row.day_of_week, 2, 'Tue is Tuesday');
    assert.match(row.warnings.join(' '), /Taking period/, 'the standard hour is used and said so');
    assert.ok(row.start_time && row.end_time);
    assert.equal(day >= 1, true);
  });

  it('refuses a file that contradicts itself, and writes nothing on a dry run', async () => {
    const [[day, period]] = await free();
    const twice = [
      { class: klass.name, classroom: klass.room ?? '', subject: subjectName, day: String(day), period },
      { class: klass.name, classroom: klass.room ?? '', subject: 'Long break', day: String(day), period },
    ];
    const dry = await post('/api/timetable/import', { rows: twice, dry_run: true });
    assert.equal(dry.body.summary.errors, 1);
    assert.match(dry.body.rows[1].errors.join(' '), /two lessons at once/);

    const refused = await post('/api/timetable/import', { rows: twice });
    assert.equal(refused.status, 400);
    assert.equal((await ctx.api('GET', `/api/timetable?classId=${klass.id}`, { token: admin })).body
      .filter((s) => s.day_of_week === day && s.period === period).length, 0, 'nothing was written');
  });

  it('imports the week, breaks and all', async () => {
    const slots = await free();
    const rows = [
      { class: klass.name, classroom: klass.room ?? '', subject: subjectName,
        day: String(slots[0][0]), period: slots[0][1] },
      { class: klass.name, classroom: klass.room ?? '', break: 'long',
        day: String(slots[1][0]), period: slots[1][1] },
    ];
    const done = await post('/api/timetable/import', { rows });
    assert.equal(done.status, 201, done.body.error);
    assert.equal(done.body.summary.imported, 2);
    assert.equal(done.body.summary.breaks, 1);

    const week = (await ctx.api('GET', `/api/timetable?classId=${klass.id}`, { token: admin })).body;
    assert.ok(week.some((s) => s.day_of_week === slots[1][0] && s.period === slots[1][1] && s.is_break === 1));
  });

  it('is a job for an administrator', async () => {
    assert.equal((await post('/api/timetable/import', { rows: [], dry_run: true }, teacher)).status, 403);
  });
});

describe('what a role may do, as the school decides it', () => {
  const matrix = async (token = admin) => (await ctx.api('GET', '/api/permissions', { token })).body;

  it('ships with sensible defaults and says which are the school\'s own', async () => {
    const out = await matrix();
    const pupils = out.permissions.find((p) => p.key === 'students.manage');
    assert.equal(pupils.roles.admin.allowed, true);
    assert.equal(pupils.roles.teacher.allowed, false);
    assert.equal(pupils.roles.admin.decided, false, 'a default is not a decision');
  });

  it('refuses an administrator the part their school has taken from them', async () => {
    // The office keeps the pupils but is no longer to touch the fees.
    const off = await ctx.api('PUT', '/api/permissions', {
      token: admin, body: { role: 'admin', permission: 'finance.manage', allowed: false },
    });
    assert.equal(off.status, 200);

    const made = await post('/api/staff', {
      first_name: 'Remi', last_name: 'Office', email: 'remi.office@school.example', role: 'admin',
    });
    const token = made.body.activation_link.split('/activate/')[1];
    await ctx.api('POST', `/api/invites/token/${token}/accept`, { body: { password: 'their-own-password' } });
    const office = await ctx.login('remi.office@school.example', 'their-own-password');

    const refused = await ctx.api('POST', '/api/invoices', {
      token: office, body: { student_id: 1, amount: 100, due_date: '2027-01-01', description: 'Test' },
    });
    assert.equal(refused.status, 403);
    assert.match(refused.body.error, /fees and the ledger/i);

    // The rest of the office is untouched.
    assert.equal((await ctx.api('GET', '/api/students', { token: office })).status, 200);

    // And the person who holds the school is never refused by their own switch.
    assert.notEqual((await ctx.api('POST', '/api/invoices', {
      token: admin, body: { student_id: 1, amount: 100, due_date: '2027-01-01', description: 'Test' },
    })).status, 403);

    // Put it back; the decision disappears rather than being stored as agreement.
    const back = await ctx.api('PUT', '/api/permissions', {
      token: admin, body: { role: 'admin', permission: 'finance.manage', allowed: true },
    });
    assert.equal(back.body.permissions.find((p) => p.key === 'finance.manage').roles.admin.decided, false);
  });

  it('can hand a part of the office to teachers', async () => {
    await ctx.api('PUT', '/api/permissions', {
      token: admin, body: { role: 'teacher', permission: 'sen.manage', allowed: true },
    });

    const pupil = (await ctx.api('GET', '/api/students', { token: admin })).body[0];
    const written = await ctx.api('PUT', `/api/iep/${pupil.id}`, {
      token: teacher, body: { needs: ['adhd'], time_multiplier: 1.25 },
    });
    assert.equal(written.status, 200, 'a teacher may now keep support plans');

    await ctx.api('PUT', '/api/permissions', {
      token: admin, body: { role: 'teacher', permission: 'sen.manage', allowed: false },
    });
    assert.equal((await ctx.api('PUT', `/api/iep/${pupil.id}`,
                                { token: teacher, body: { needs: [] } })).status, 403);
  });

  it('is the super administrator\'s to set, and nobody else\'s', async () => {
    assert.equal((await ctx.api('PUT', '/api/permissions', {
      token: teacher, body: { role: 'teacher', permission: 'sen.manage', allowed: true },
    })).status, 403);
  });
});

describe('two tiers of administrator', () => {
  it('makes the school\'s first administrator its super administrator', async () => {
    const admins = (await ctx.api('GET', '/api/staff', { token: admin })).body
      .filter((s) => s.role === 'admin');
    assert.ok(admins.some((a) => a.is_super_admin), 'somebody holds the school');
  });

  it('lets a super administrator appoint another administrator', async () => {
    const person = (await ctx.api('GET', '/api/staff', { token: admin })).body
      .find((s) => s.role === 'teacher' && !s.is_super_admin);

    const promoted = await ctx.api('PATCH', `/api/staff/${person.id}`, {
      token: admin, body: { role: 'admin' },
    });
    assert.equal(promoted.status, 200, promoted.body.error);
    assert.equal(promoted.body.role, 'admin');
    assert.equal(promoted.body.is_super_admin, 0, 'an administrator, not an owner');

    // Put them back, so the rest of the suite sees the school it expects.
    await ctx.api('PATCH', `/api/staff/${person.id}`, { token: admin, body: { role: 'teacher' } });
  });

  it('will not let a plain administrator appoint one', async () => {
    // A real office account: added by the owner, with a password of their own.
    const made = await post('/api/staff', {
      first_name: 'Ola', last_name: 'Bursar', email: 'ola.bursar@school.example', role: 'admin',
    });
    assert.equal(made.status, 201, made.body.error);

    const token = made.body.activation_link.split('/activate/')[1];
    await ctx.api('POST', `/api/invites/token/${token}/accept`, { body: { password: 'their-own-password' } });
    const office = await ctx.login('ola.bursar@school.example', 'their-own-password');

    const colleague = (await ctx.api('GET', '/api/staff', { token: admin })).body
      .find((s) => s.role === 'teacher');

    const refused = await ctx.api('PATCH', `/api/staff/${colleague.id}`, {
      token: office, body: { role: 'admin' },
    });
    assert.equal(refused.status, 403);
    assert.match(refused.body.error, /super administrator/i);

    // They run the office perfectly well otherwise.
    assert.equal((await ctx.api('PATCH', `/api/staff/${colleague.id}`,
                                { token: office, body: { title: 'Head of Year' } })).status, 200);
  });

  it('will not leave the school without a super administrator', async () => {
    const holder = (await ctx.api('GET', '/api/staff', { token: admin })).body
      .find((s) => s.is_super_admin);
    const refused = await ctx.api('PATCH', `/api/staff/${holder.id}`, {
      token: admin, body: { is_super_admin: false },
    });
    assert.equal(refused.status, 409);
    assert.match(refused.body.error, /only super administrator/i);
  });

  it('keeps closing a financial year to the super administrator', async () => {
    const years = (await ctx.api('GET', '/api/finance/years', { token: admin })).body;
    if (!years.length) return;
    assert.equal((await ctx.api('POST', `/api/finance/years/${years[0].id}/close`,
                                { token: teacher, body: {} })).status, 403);
  });
});

describe('a staff record', () => {
  it('is edited as one form across the account and the record', async () => {
    const person = (await ctx.api('GET', '/api/staff', { token: admin })).body
      .find((s) => s.role === 'teacher');

    const saved = await ctx.api('PATCH', `/api/staff/${person.id}`, {
      token: admin,
      body: { title: 'Head of Mathematics', department: 'Secondary', phone: '+1 555 0101', is_senco: true },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.title, 'Head of Mathematics');
    assert.equal(saved.body.is_senco, 1, 'the account changes with the record');

    const listed = (await ctx.api('GET', '/api/staff', { token: admin })).body
      .find((s) => s.id === person.id);
    assert.equal(listed.department, 'Secondary');
    assert.equal(listed.phone, '+1 555 0101');
  });

  it('refuses an email somebody else already has', async () => {
    const staff = (await ctx.api('GET', '/api/staff', { token: admin })).body;
    const taken = await ctx.api('PATCH', `/api/staff/${staff[0].id}`, {
      token: admin, body: { email: staff[1].email },
    });
    assert.equal(taken.status, 409);
    assert.match(taken.body.error, /already has that email/);
  });

  it('will not let the school lose its last administrator', async () => {
    const admins = (await ctx.api('GET', '/api/staff', { token: admin })).body
      .filter((s) => s.role === 'admin');
    if (admins.length !== 1) return;

    const refused = await ctx.api('PATCH', `/api/staff/${admins[0].id}`, {
      token: admin, body: { role: 'teacher' },
    });
    assert.equal(refused.status, 409);
    assert.match(refused.body.error, /only administrator/i);
  });

  it('is the office to change, not a teacher', async () => {
    const person = (await ctx.api('GET', '/api/staff', { token: admin })).body[0];
    assert.equal((await ctx.api('PATCH', `/api/staff/${person.id}`,
                                { token: teacher, body: { title: 'Head' } })).status, 403);
  });
});

describe('who teaches what', () => {
  it('fills in a class pairing from the subject alone when only one person teaches it', async () => {
    const staff = (await ctx.api('GET', '/api/staff', { token: admin })).body.filter((s) => s.role === 'teacher');
    const klass = (await ctx.api('GET', '/api/classes', { token: admin })).body[0];
    const subject = (await post('/api/subjects', { name: 'Astronomy', sections: [klass.section] })).body;
    await post(`/api/classes/${klass.id}/subjects`, { subject_id: subject.id });

    const set = await ctx.api('PUT', `/api/subjects/${subject.id}/teachers`,
                              { token: admin, body: { teacher_ids: [staff[0].user_id] } });
    assert.equal(set.status, 200);
    assert.equal(set.body.assigned, 1, 'the pairing that had nobody now has them');
    assert.equal(set.body.teachers[0].id, staff[0].user_id);

    const taught = (await ctx.api('GET', `/api/classes/${klass.id}/subjects`, { token: admin })).body
      .find((r) => r.subject_id === subject.id);
    assert.equal(taught.teacher_id, staff[0].user_id);

    const listed = (await ctx.api('GET', '/api/subjects', { token: admin })).body
      .find((sub) => sub.id === subject.id);
    assert.equal(listed.teachers.length, 1, 'the subject carries its teachers');
  });

  it('leaves a pairing alone when several could teach it, until the section says who', async () => {
    const staff = (await ctx.api('GET', '/api/staff', { token: admin })).body.filter((s) => s.role === 'teacher');
    if (staff.length < 2) return;

    const klass = (await ctx.api('GET', '/api/classes', { token: admin })).body[1];
    const subject = (await post('/api/subjects', { name: 'Geology', sections: [klass.section] })).body;
    await post(`/api/classes/${klass.id}/subjects`, { subject_id: subject.id });

    const both = await ctx.api('PUT', `/api/subjects/${subject.id}/teachers`, {
      token: admin, body: { teacher_ids: [staff[0].user_id, staff[1].user_id] },
    });
    assert.equal(both.body.assigned, 0, 'two candidates is not an answer');
    assert.equal(both.body.ambiguous, 1);

    // Saying who works in that part of the school settles it.
    const filled = await ctx.api('PUT', `/api/sections/${klass.section}/teachers`, {
      token: admin, body: { teacher_ids: [staff[1].user_id] },
    });
    assert.equal(filled.status, 200);
    assert.ok(filled.body.assigned >= 1);

    const taught = (await ctx.api('GET', `/api/classes/${klass.id}/subjects`, { token: admin })).body
      .find((r) => r.subject_id === subject.id);
    assert.equal(taught.teacher_id, staff[1].user_id, 'the one who is in this section');

    const sections = (await ctx.api('GET', '/api/sections', { token: admin })).body
      .find((sec) => sec.key === klass.section);
    assert.equal(sections.teachers.length, 1, 'the section carries its staff');
  });

  it('never overwrites a teacher already paired with a class', async () => {
    const staff = (await ctx.api('GET', '/api/staff', { token: admin })).body.filter((s) => s.role === 'teacher');
    const taught = (await ctx.api('GET', '/api/classes', { token: admin })).body
      .map((c) => c.id);
    const pair = (await Promise.all(taught.map((id) =>
      ctx.api('GET', `/api/classes/${id}/subjects`, { token: admin }).then((r) => r.body))))
      .flat().find((row) => row.teacher_id);
    if (!pair) return;

    const before = pair.teacher_id;
    await ctx.api('PUT', `/api/subjects/${pair.subject_id}/teachers`, {
      token: admin, body: { teacher_ids: [staff[0].user_id] },
    });
    const after = (await ctx.api('GET', `/api/classes/${pair.class_id ?? taught[0]}/subjects`, { token: admin })).body
      .find((row) => row.id === pair.id);
    if (after) assert.equal(after.teacher_id, before, 'a pairing that has somebody is left as it is');
  });

  it('is the office to set, not a teacher', async () => {
    const subject = (await ctx.api('GET', '/api/subjects', { token: admin })).body[0];
    assert.equal((await ctx.api('PUT', `/api/subjects/${subject.id}/teachers`,
                                { token: teacher, body: { teacher_ids: [] } })).status, 403);
    assert.equal((await post('/api/teaching/sync', {}, teacher)).status, 403);
  });
});

describe('joining the curriculum to the classes', () => {
  it('fills a class with what its section teaches, and adds nothing twice', async () => {
    const klass = (await ctx.api('GET', '/api/classes', { token: admin })).body[0];
    const before = (await ctx.api('GET', `/api/classes/${klass.id}/subjects`, { token: admin })).body.length;

    const first = await post(`/api/classes/${klass.id}/subjects/from-section`, {});
    assert.equal(first.status, 200);

    const after = (await ctx.api('GET', `/api/classes/${klass.id}/subjects`, { token: admin })).body;
    assert.equal(after.length, before + first.body.added);
    assert.ok(after.every((cs) => 'teacher_id' in cs), 'who teaches it stays a separate decision');

    const again = await post(`/api/classes/${klass.id}/subjects/from-section`, {});
    assert.equal(again.body.added, 0, 'running it twice changes nothing');
  });

  it('does the same across the school in one go, for an administrator only', async () => {
    assert.equal((await post('/api/subjects/offer-to-classes', {}, teacher)).status, 403);
    const out = await post('/api/subjects/offer-to-classes', {});
    assert.equal(out.status, 200);
    assert.equal(typeof out.body.added, 'number');
    assert.equal((await post('/api/subjects/offer-to-classes', {})).body.added, 0);
  });
});

describe('a subject taught across a year', () => {
  let subject, primaryClasses;

  it('is set as one list rather than class by class', async () => {
    // Names of their own: earlier tests in this file used the Primary 1 ones.
    const made = await post('/api/classes', {
      section: 'primary', streams: ['Primary 5 Ash', 'Primary 5 Birch', 'Primary 5 Cedar'],
    });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    primaryClasses = made.body;
    subject = (await post('/api/subjects', { name: 'Handwriting', section: 'primary' })).body;
    const aTeacher = (await ctx.api('GET', '/api/staff', { token: admin })).body.find((s) => s.role === 'teacher');

    const set = await ctx.api('PUT', `/api/subjects/${subject.id}/classes`, {
      token: admin, body: { class_ids: primaryClasses.map((c) => c.id), teacher_id: aTeacher.user_id },
    });
    assert.equal(set.status, 200);
    assert.equal(set.body.added.length, 3);

    const taking = (await ctx.api('GET', `/api/subjects/${subject.id}/classes`, { token: admin })).body;
    assert.equal(taking.length, 3);
    assert.ok(taking.every((t) => t.teacher_id === aTeacher.user_id), 'the teacher comes with them');
  });

  it('releases the classes dropped from the list', async () => {
    const fewer = await ctx.api('PUT', `/api/subjects/${subject.id}/classes`, {
      token: admin, body: { class_ids: [primaryClasses[0].id] },
    });
    assert.equal(fewer.body.removed.length, 2);
    assert.equal(fewer.body.classes.length, 1);
  });

  it('keeps a class that has work recorded against it', async () => {
    // Put real work behind one of them: a set assignment.
    const taking = (await ctx.api('GET', `/api/subjects/${subject.id}/classes`, { token: admin })).body;
    assert.ok(taking.length > 0);
    const set = await post('/api/assignments', {
      class_subject_id: taking[0].id, title: 'Letter formation', due_at: '2026-11-01T09:00:00.000Z',
    });
    assert.equal(set.status, 201);

    const emptied = await ctx.api('PUT', `/api/subjects/${subject.id}/classes`, { token: admin, body: { class_ids: [] } });
    assert.deepEqual(emptied.body.kept_because_of_work, [taking[0].class_name],
                     'marks and registers are not thrown away by a tick box');
    assert.equal(emptied.body.classes.length, 1, 'that class still takes it');
  });

  it('is read by teachers and set by administrators', async () => {
    assert.equal((await ctx.api('GET', `/api/subjects/${subject.id}/classes`, { token: teacher })).status, 200);
    assert.equal((await ctx.api('PUT', `/api/subjects/${subject.id}/classes`, {
      token: teacher, body: { class_ids: [] },
    })).status, 403);
  });
});

describe('a subject taught through the whole school', () => {
  let maths;

  it('is created in several sections at once', async () => {
    const made = await post('/api/subjects', {
      name: 'Mathematics (whole school)', sections: ['nursery', 'primary', 'secondary'], icon: 'calculator',
    });
    assert.equal(made.status, 201);
    assert.deepEqual(made.body.sections, ['nursery', 'primary', 'secondary']);
    maths = made.body;

    // And it turns up wherever it is taught, not only where it was first put.
    for (const section of ['nursery', 'primary', 'secondary']) {
      const listed = (await ctx.api('GET', `/api/subjects?section=${section}`, { token: admin })).body;
      assert.ok(listed.some((s) => s.id === maths.id), section);
    }
  });

  it('widens an existing subject without disturbing it', async () => {
    const existing = (await ctx.api('GET', '/api/subjects', { token: admin })).body
      .find((s) => s.name === 'Mathematics');
    assert.deepEqual(existing.sections, ['secondary'], 'what it had before is what it keeps');

    const widened = await ctx.api('PATCH', `/api/subjects/${existing.id}`, {
      token: admin, body: { sections: ['secondary', 'primary'] },
    });
    assert.deepEqual([...widened.body.sections].sort(), ['primary', 'secondary']);
  });

  it('will not drop a section where classes are still taking it', async () => {
    // Put it in front of a class, so the section is genuinely in use.
    const klass = (await ctx.api('GET', '/api/classes', { token: admin })).body
      .find((c) => c.section === 'primary');
    await post(`/api/classes/${klass.id}/subjects`, { subject_id: maths.id });

    const narrowed = await ctx.api('PATCH', `/api/subjects/${maths.id}`, {
      token: admin, body: { sections: ['nursery'] },
    });
    assert.ok(narrowed.body.sections.includes('primary'),
              'a section is only released when nothing in it teaches the subject');
    assert.ok(!narrowed.body.sections.includes('secondary'),
              'one nothing teaches is released');
  });

  it('refuses a section the school does not have', async () => {
    const bad = await post('/api/subjects', { name: 'Nope', sections: ['made_up'] });
    assert.equal(bad.status, 400);
  });
});

describe('subjects grouped by category', () => {
  it('carries the category it belongs to on a curriculum sheet', async () => {
    const made = await post('/api/subjects', {
      name: 'Music', category: 'Creative arts', sections: ['primary', 'secondary'], icon: 'music',
    });
    assert.equal(made.status, 201);
    assert.equal(made.body.category, 'Creative arts');

    const listed = (await ctx.api('GET', '/api/subjects', { token: admin })).body
      .find((s) => s.id === made.body.id);
    assert.equal(listed.category, 'Creative arts');

    const moved = await ctx.api('PATCH', `/api/subjects/${made.body.id}`, {
      token: admin, body: { category: 'Performing arts' },
    });
    assert.equal(moved.body.category, 'Performing arts');
  });

  it('lists them in category order, with the uncategorised last', async () => {
    const listed = (await ctx.api('GET', '/api/subjects', { token: admin })).body;
    const categories = listed.map((s) => s.category);
    const namedRun = categories.filter((c) => c != null);
    assert.deepEqual([...namedRun].sort(), namedRun, 'named categories come out in order');
    assert.ok(categories.indexOf(null) === -1 || categories.indexOf(null) >= namedRun.length,
              'anything without one comes after');
  });
});

describe('duplicating a section', () => {
  let source, copy;

  it('brings its classes, what they are taught and when', async () => {
    source = (await post('/api/sections', { name: 'Nursery 2' })).body;
    const classes = (await post('/api/classes', { section: source.key, rooms: ['A', 'B', 'C'] })).body;
    const subject = (await post('/api/subjects', { name: 'Circle Time', sections: [source.key] })).body;

    for (const klass of classes) {
      await post(`/api/classes/${klass.id}/subjects`, { subject_id: subject.id });
    }

    copy = (await post(`/api/sections/${source.id}/duplicate`, { name: 'Nursery 3' })).body;
    assert.equal(copy.copied.classes, 3);
    assert.ok(copy.copied.subjects >= 1);

    // The classes are named for the section they are now in.
    const made = (await ctx.api('GET', '/api/classes', { token: admin })).body
      .filter((c) => c.section === copy.key);
    assert.deepEqual(made.map((c) => c.name), ['Nursery 3', 'Nursery 3', 'Nursery 3']);
    assert.deepEqual(made.map((c) => c.room).sort(), ['A', 'B', 'C']);

    // And what was taught there is offered here.
    const offered = (await ctx.api('GET', `/api/subjects?section=${copy.key}`, { token: admin })).body;
    assert.ok(offered.some((s) => s.name === 'Circle Time'));
  });

  it('leaves the pupils where they are', async () => {
    const made = (await ctx.api('GET', '/api/classes', { token: admin })).body
      .filter((c) => c.section === copy.key);
    for (const klass of made) {
      const roster = (await ctx.api('GET', `/api/classes/${klass.id}/roster`, { token: admin })).body;
      assert.equal(roster.length, 0);
    }
  });

  it('copies the shell alone when asked, and refuses a name already used', async () => {
    const shell = await post(`/api/sections/${source.id}/duplicate`, { name: 'Nursery 4', with_classes: false });
    assert.equal(shell.status, 201);
    assert.equal(shell.body.copied.classes, 0);

    assert.equal((await post(`/api/sections/${source.id}/duplicate`, { name: 'Nursery 3' })).status, 409);
    assert.equal((await post(`/api/sections/${source.id}/duplicate`, { name: '' })).status, 400);
  });

  it('is an administrator job', async () => {
    assert.equal((await post(`/api/sections/${source.id}/duplicate`, { name: 'Nope' }, teacher)).status, 403);
  });
});

describe('importing a list of classes', () => {
  const list = () => ([
    { section: 'Primary', classroom: 'A', homeroom_teacher_email: ACCOUNTS.mathsTeacher, subjects: 'Numeracy; Literacy' },
    { section: 'Primary', classroom: 'B', subjects: 'Numeracy' },
    { section: 'Atlantis', classroom: 'A' },
    { section: 'Primary', classroom: 'A' },
  ]);

  it('checks a file against the school without creating anything', async () => {
    const before = (await ctx.api('GET', '/api/classes', { token: admin })).body.length;
    const dry = await post('/api/classes/import', { rows: list(), dry_run: true });

    assert.equal(dry.status, 200);
    assert.equal(dry.body.summary.ready, 2);
    assert.equal(dry.body.summary.errors, 2);

    const errors = Object.fromEntries(dry.body.rows.filter((r) => r.status === 'error').map((r) => [r.line, r.errors[0]]));
    assert.match(errors[3], /No section called/i, 'sections are not invented from a file');
    assert.match(errors[4], /twice in this file/i);

    assert.equal((await ctx.api('GET', '/api/classes', { token: admin })).body.length, before);
  });

  it('creates them with their homeroom teacher and subjects attached', async () => {
    const done = await post('/api/classes/import', { rows: list(), allow_partial: true });
    assert.equal(done.status, 201);
    assert.equal(done.body.summary.imported, 2);

    const first = done.body.created[0];
    const listed = (await ctx.api('GET', '/api/classes', { token: admin })).body.find((c) => c.id === first.id);
    assert.equal(listed.room, 'A');
    assert.ok(listed.homeroom_teacher, 'the teacher matched by email is attached');

    const taught = (await ctx.api('GET', `/api/classes/${first.id}/subjects`, { token: admin })).body;
    assert.deepEqual(taught.map((s) => s.name).sort(), ['Literacy', 'Numeracy']);
  });

  it('warns about a subject it does not recognise rather than creating one', async () => {
    const before = (await ctx.api('GET', '/api/subjects', { token: admin })).body.length;
    const dry = await post('/api/classes/import', {
      rows: [{ section: 'Secondary', classroom: 'Z', subjects: 'Mathematics; Nothing Here' }], dry_run: true,
    });
    assert.equal(dry.body.rows[0].status, 'ready');
    assert.match(dry.body.rows[0].warnings[0], /Nothing Here/);
    assert.equal((await ctx.api('GET', '/api/subjects', { token: admin })).body.length, before);
  });

  it('is a job for an administrator', async () => {
    assert.equal((await post('/api/classes/import', { rows: [], dry_run: true }, teacher)).status, 403);
  });
});

describe('importing support plans', () => {
  const list = () => ([
    { student_code: 'STU-1002', needs: 'dyslexia', extra_time: '1.25', multi_format: 'yes',
      review_date: '2027-01-15', notes: 'Written instructions.' },
    { student_code: 'STU-1003', needs: 'adhd; asc', extra_time: '50%', rest_breaks: 'yes' },
    { student_code: 'STU-9999', needs: 'dyslexia' },
    { student_code: 'STU-1005', extra_time: 'lots' },
  ]);

  it('reads extra time the way a school writes it, and refuses what it cannot', async () => {
    const dry = await post('/api/iep/import', { rows: list(), dry_run: true });
    assert.equal(dry.status, 200);

    const byLine = Object.fromEntries(dry.body.rows.map((r) => [r.line, r]));
    assert.equal(byLine[1].time_multiplier, 1.25, 'a plain multiplier');
    assert.equal(byLine[2].time_multiplier, 1.5, '50% is half again');

    assert.match(byLine[3].errors[0], /No pupil matching/);
    assert.match(byLine[4].errors[0], /not a number/,
                 'an unreadable value must not quietly become standard time');
  });

  it('saves the plans and says which it replaced', async () => {
    const done = await post('/api/iep/import', { rows: list(), allow_partial: true });
    assert.equal(done.status, 201);
    assert.equal(done.body.summary.imported, 2);

    const register = (await ctx.api('GET', '/api/iep', { token: admin })).body;
    const maya = register.find((r) => r.student_code === 'STU-1002');
    assert.deepEqual(maya.needs, ['dyslexia']);
    assert.equal(maya.time_multiplier, 1.25);
    assert.equal(maya.multi_format_approved, 1);
  });

  it('drops a need it does not recognise rather than inventing one', async () => {
    const dry = await post('/api/iep/import', {
      rows: [{ student_code: 'STU-1004', needs: 'telepathy; adhd' }], dry_run: true,
    });
    assert.equal(dry.body.rows[0].status, 'ready');
    assert.deepEqual(dry.body.rows[0].needs, ['adhd']);
    assert.match(dry.body.rows[0].warnings.join(' '), /telepathy/);
  });

  it('takes a pupil off the register, leaving the pupil', async () => {
    const register = (await ctx.api('GET', '/api/iep', { token: admin })).body;
    const row = register[0];
    assert.equal((await ctx.api('DELETE', `/api/iep/${row.student_id}`, { token: admin })).status, 200);

    const after = (await ctx.api('GET', '/api/iep', { token: admin })).body;
    assert.ok(!after.some((r) => r.student_id === row.student_id));
    assert.ok((await ctx.api('GET', `/api/students/${row.student_id}`, { token: admin })).body.id,
              'the pupil is untouched');

    assert.equal((await ctx.api('DELETE', `/api/iep/${row.student_id}`, { token: admin })).status, 404);
  });

  it('is a job for an administrator', async () => {
    assert.equal((await post('/api/iep/import', { rows: [], dry_run: true }, teacher)).status, 403);
  });
});

describe('support that arrives with the pupil', () => {
  const rows = () => ([
    { first_name: 'Ivy', last_name: 'Stone',
      needs: 'dyslexia', extra_time: '25%', support_notes: 'Coloured overlay.' },
    { first_name: 'Otis', last_name: 'Stone',
      support_notes: 'Repeat the task once after the class instruction.' },
    { first_name: 'Pearl', last_name: 'Stone' },
  ]);

  it('records it as the pupil is enrolled, and only SEN reaches the register', async () => {
    const dry = await post('/api/students/import', { rows: rows(), dry_run: true });
    assert.equal(dry.body.summary.with_support, 2, 'notes count as support');
    assert.equal(dry.body.summary.joining_register, 1, 'only the named need is SEN');

    const done = await post('/api/students/import', { rows: rows() });
    assert.equal(done.status, 201);

    const roll = (await ctx.api('GET', '/api/students', { token: admin })).body;
    const byName = (first) => roll.find((s) => s.first_name === first && s.last_name === 'Stone');
    assert.deepEqual(byName('Ivy').needs, ['dyslexia']);
    assert.equal(byName('Ivy').time_multiplier, 1.25);
    assert.equal(byName('Ivy').is_sen, 1);
    assert.equal(byName('Otis').iep.notes, 'Repeat the task once after the class instruction.');
    assert.equal(byName('Otis').is_sen, 0, 'notes alone are not a plan');
    assert.equal(byName('Pearl').iep, null, 'nothing is invented for a pupil with no support');

    const register = (await ctx.api('GET', '/api/iep', { token: admin })).body;
    assert.ok(register.some((r) => r.student_id === byName('Ivy').id));
    assert.ok(!register.some((r) => r.student_id === byName('Otis').id));
  });

  it('refuses extra time it cannot read rather than enrolling without it', async () => {
    const dry = await post('/api/students/import', {
      rows: [{ first_name: 'Nell', last_name: 'Stone', extra_time: 'lots' }], dry_run: true,
    });
    assert.equal(dry.body.rows[0].status, 'error');
    assert.match(dry.body.rows[0].errors.join(' '), /not a number/);
  });
});

describe('support recorded for any pupil', () => {
  const roll = async (query = '') =>
    (await ctx.api('GET', `/api/students${query}`, { token: admin })).body;
  const register = async () => (await ctx.api('GET', '/api/iep', { token: admin })).body;

  it('keeps classroom notes off the SEN register, and the roll carries them', async () => {
    const pupil = (await roll()).find((s) => !s.iep);
    const saved = await ctx.api('PUT', `/api/iep/${pupil.id}`, {
      token: admin, body: { needs: [], time_multiplier: 1, notes: 'Sits near the front.' },
    });
    assert.equal(saved.status, 200);

    assert.ok(!(await register()).some((r) => r.student_id === pupil.id),
              'notes alone are not a SEN plan');

    const row = (await roll()).find((s) => s.id === pupil.id);
    assert.equal(row.iep.notes, 'Sits near the front.');
    assert.equal(row.is_sen, 0);
    assert.ok((await roll('?support=true')).some((s) => s.id === pupil.id));
    assert.ok(!(await roll('?sen=true')).some((s) => s.id === pupil.id));
  });

  it('puts a pupil on the register the moment a need or an entitlement is set', async () => {
    const pupil = (await roll()).find((s) => s.iep && !s.is_sen);
    await ctx.api('PUT', `/api/iep/${pupil.id}`, {
      token: admin, body: { needs: ['dyslexia'], time_multiplier: 1, notes: pupil.iep.notes },
    });

    const entry = (await register()).find((r) => r.student_id === pupil.id);
    assert.ok(entry, 'a named need reaches the register without being added there again');
    assert.equal(entry.notes, pupil.iep.notes, 'the classroom notes are kept');
    assert.equal((await roll()).find((s) => s.id === pupil.id).is_sen, 1);

    // An entitlement on its own counts, with no need named.
    const other = (await roll()).find((s) => !s.iep);
    await ctx.api('PUT', `/api/iep/${other.id}`, {
      token: admin, body: { needs: [], time_multiplier: 1.25 },
    });
    assert.ok((await register()).some((r) => r.student_id === other.id));
  });

  it('leaves the register when the needs and entitlements are cleared', async () => {
    const entry = (await register())[0];
    await ctx.api('PUT', `/api/iep/${entry.student_id}`, {
      token: admin, body: { needs: [], time_multiplier: 1, notes: 'Doing fine now.' },
    });

    assert.ok(!(await register()).some((r) => r.student_id === entry.student_id));
    const row = (await roll()).find((s) => s.id === entry.student_id);
    assert.equal(row.iep.notes, 'Doing fine now.', 'the support record stays, off the register');
  });
});
