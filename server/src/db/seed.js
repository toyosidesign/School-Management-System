/**
 * Seeds a small but complete demo school: 3 sections, staff, students with IEPs,
 * timetables, a fortnight of attendance (which auto-creates Catch-Up entries),
 * assignments, submissions, messages, fees, textbooks and calendar events.
 *
 * Safe to re-run: it drops and rebuilds the database file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, migrate } from './index.js';
import { hash } from '../lib/auth.js';
import { syncCatchupForAttendance } from '../lib/catchup.js';
import { issueCode } from '../lib/accessCode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PW = 'Passw0rd!';

console.log('Resetting database…');
db.pragma('foreign_keys = OFF');
for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
  db.exec(`DROP TABLE IF EXISTS "${name}"`);
}
db.pragma('foreign_keys = ON');
migrate();

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const daysAhead = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

const addUser = db.prepare(
  `INSERT INTO users (role, email, password_hash, first_name, last_name, phone, avatar_colour, locale, is_senco)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const PALETTE = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#db2777', '#65a30d'];
let colourIndex = 0;
const nextColour = () => PALETTE[colourIndex++ % PALETTE.length];

function user(role, first, last, email, extra = {}) {
  const r = addUser.run(role, email, hash(extra.password ?? PW), first, last,
    extra.phone ?? null, extra.colour ?? nextColour(), extra.locale ?? 'en', extra.senco ? 1 : 0);
  return r.lastInsertRowid;
}

/* ── Staff ────────────────────────────────────────────────────────────────── */
console.log('Creating staff…');
const admin = user('admin', 'Amara', 'Okonkwo', 'admin@school.demo', { phone: '+1 555 0100' });
const senco = user('admin', 'Priya', 'Raman', 'senco@school.demo', { senco: true, phone: '+1 555 0101' });

const teachers = {
  maths:   user('teacher', 'David', 'Mensah', 'd.mensah@school.demo', { phone: '+1 555 0110' }),
  english: user('teacher', 'Sarah', 'Whitfield', 's.whitfield@school.demo', { phone: '+1 555 0111' }),
  science: user('teacher', 'Tunde', 'Balogun', 't.balogun@school.demo', { phone: '+1 555 0112' }),
  history: user('teacher', 'Elena', 'Rossi', 'e.rossi@school.demo', { phone: '+1 555 0113' }),
  primary: user('teacher', 'Grace', 'Adeyemi', 'g.adeyemi@school.demo', { phone: '+1 555 0114' }),
  nursery: user('teacher', 'Mei', 'Lin', 'm.lin@school.demo', { phone: '+1 555 0115' }),
};

const addStaff = db.prepare('INSERT INTO staff (user_id, staff_code, title, department, qualifications) VALUES (?, ?, ?, ?, ?)');
addStaff.run(admin, 'STF-001', 'Head of School', 'Administration', 'MEd Educational Leadership');
addStaff.run(senco, 'STF-002', 'SENCO', 'Inclusion & SEN', 'MA SEN, National SENCO Award');
addStaff.run(teachers.maths, 'STF-010', 'Mathematics Teacher', 'Secondary', 'BSc Mathematics, PGCE');
addStaff.run(teachers.english, 'STF-011', 'English Teacher', 'Secondary', 'BA English, PGCE');
addStaff.run(teachers.science, 'STF-012', 'Science Teacher', 'Secondary', 'BSc Biology, PGCE');
addStaff.run(teachers.history, 'STF-013', 'History Teacher', 'Secondary', 'BA History, PGCE');
addStaff.run(teachers.primary, 'STF-014', 'Class Teacher', 'Primary', 'BEd Primary Education');
addStaff.run(teachers.nursery, 'STF-015', 'Early Years Lead', 'Nursery', 'Level 6 Early Years');

/* ── Classes & subjects ───────────────────────────────────────────────────── */
console.log('Creating classes and subjects…');
// Each class carries the year it belongs to and its arm, so parallel classes in
// one year group sit together wherever classes are listed.
// migrate() lays down a default set; the demo names the same three explicitly.
const addSection = db.prepare(
  'INSERT INTO sections (key, name, sort_order) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET name = excluded.name'
);
addSection.run('nursery', 'Nursery', 10);
addSection.run('primary', 'Primary', 20);
addSection.run('secondary', 'Secondary', 30);

const addClass = db.prepare(
  `INSERT INTO classes (name, year_label, stream, section, level, homeroom_teacher_id, room)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const classes = {
  nursery2: addClass.run('Nursery 2 Sunflowers', 'Nursery 2', 'Sunflowers', 'nursery', 2, teachers.nursery, 'EY-1').lastInsertRowid,
  primary4: addClass.run('Primary 4 Kestrels', 'Primary 4', 'Kestrels', 'primary', 4, teachers.primary, 'P-4').lastInsertRowid,
  grade9:   addClass.run('Grade 9 Alpha', 'Grade 9', 'Alpha', 'secondary', 9, teachers.maths, 'S-12').lastInsertRowid,
};

// Subjects carry the group they sit in on a curriculum sheet.
const addSubject = db.prepare(
  'INSERT INTO subjects (name, code, category, section, colour, icon) VALUES (?, ?, ?, ?, ?, ?)'
);
const subjects = {
  mathsSec:  addSubject.run('Mathematics', 'MATH-9', 'Mathematics', 'secondary', '#2563eb', 'calculator').lastInsertRowid,
  english:   addSubject.run('English Language', 'ENG-9', 'Languages', 'secondary', '#7c3aed', 'book').lastInsertRowid,
  science:   addSubject.run('Integrated Science', 'SCI-9', 'Sciences', 'secondary', '#059669', 'flask').lastInsertRowid,
  history:   addSubject.run('History', 'HIST-9', 'Humanities', 'secondary', '#d97706', 'scroll').lastInsertRowid,
  numeracy:  addSubject.run('Numeracy', 'NUM-4', 'Mathematics', 'primary', '#0891b2', 'calculator').lastInsertRowid,
  literacy:  addSubject.run('Literacy', 'LIT-4', 'Languages', 'primary', '#db2777', 'book').lastInsertRowid,
  discovery: addSubject.run('World Discovery', 'WLD-4', 'Humanities', 'primary', '#65a30d', 'globe').lastInsertRowid,
  play:      addSubject.run('Play & Discovery', 'PLAY-N', 'Early years', 'nursery', '#f59e0b', 'star').lastInsertRowid,
  phonics:   addSubject.run('Early Phonics', 'PHON-N', 'Early years', 'nursery', '#8b5cf6', 'music').lastInsertRowid,
};

const addCS = db.prepare('INSERT INTO class_subjects (class_id, subject_id, teacher_id) VALUES (?, ?, ?)');
const cs = {
  g9maths:   addCS.run(classes.grade9, subjects.mathsSec, teachers.maths).lastInsertRowid,
  g9english: addCS.run(classes.grade9, subjects.english, teachers.english).lastInsertRowid,
  g9science: addCS.run(classes.grade9, subjects.science, teachers.science).lastInsertRowid,
  g9history: addCS.run(classes.grade9, subjects.history, teachers.history).lastInsertRowid,
  p4num:     addCS.run(classes.primary4, subjects.numeracy, teachers.primary).lastInsertRowid,
  p4lit:     addCS.run(classes.primary4, subjects.literacy, teachers.primary).lastInsertRowid,
  p4wld:     addCS.run(classes.primary4, subjects.discovery, teachers.primary).lastInsertRowid,
  n2play:    addCS.run(classes.nursery2, subjects.play, teachers.nursery).lastInsertRowid,
  n2phon:    addCS.run(classes.nursery2, subjects.phonics, teachers.nursery).lastInsertRowid,
};

console.log('Building timetable…');
const addSlot = db.prepare('INSERT INTO timetable_slots (class_subject_id, day_of_week, period, start_time, end_time, room) VALUES (?, ?, ?, ?, ?, ?)');
const PERIODS = [['08:30', '09:20'], ['09:30', '10:20'], ['10:40', '11:30'], ['11:40', '12:30'], ['13:30', '14:20']];
const timetable = {
  [classes.grade9]: [
    [1, [cs.g9maths, cs.g9english, cs.g9science, cs.g9history, cs.g9maths]],
    [2, [cs.g9english, cs.g9maths, cs.g9history, cs.g9science, cs.g9english]],
    [3, [cs.g9science, cs.g9history, cs.g9maths, cs.g9english, cs.g9science]],
    [4, [cs.g9history, cs.g9science, cs.g9english, cs.g9maths, cs.g9history]],
    [5, [cs.g9maths, cs.g9english, cs.g9science, cs.g9history, cs.g9maths]],
  ],
  [classes.primary4]: [
    [1, [cs.p4num, cs.p4lit, cs.p4wld, cs.p4num, cs.p4lit]],
    [2, [cs.p4lit, cs.p4num, cs.p4num, cs.p4wld, cs.p4num]],
    [3, [cs.p4wld, cs.p4num, cs.p4lit, cs.p4lit, cs.p4wld]],
    [4, [cs.p4num, cs.p4wld, cs.p4num, cs.p4lit, cs.p4num]],
    [5, [cs.p4lit, cs.p4lit, cs.p4wld, cs.p4num, cs.p4lit]],
  ],
  [classes.nursery2]: [
    [1, [cs.n2play, cs.n2phon, cs.n2play]],
    [2, [cs.n2phon, cs.n2play, cs.n2phon]],
    [3, [cs.n2play, cs.n2phon, cs.n2play]],
    [4, [cs.n2phon, cs.n2play, cs.n2phon]],
    [5, [cs.n2play, cs.n2phon, cs.n2play]],
  ],
};
for (const [classId, days] of Object.entries(timetable)) {
  const room = db.prepare('SELECT room FROM classes WHERE id = ?').get(classId).room;
  for (const [dow, slots] of days) {
    slots.forEach((classSubjectId, i) => addSlot.run(classSubjectId, dow, i + 1, PERIODS[i][0], PERIODS[i][1], room));
  }
}

/* ── Students, guardians, IEPs ────────────────────────────────────────────── */
console.log('Enrolling students…');
const addStudent = db.prepare(
  `INSERT INTO students (user_id, student_code, class_id, date_of_birth, gender, address,
                         medical_notes, emergency_contact_name, emergency_contact_phone, enrolled_on)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const addGuardian = db.prepare('INSERT INTO guardianships (parent_user_id, student_id, relationship, is_primary) VALUES (?, ?, ?, ?)');
const addIep = db.prepare(
  `INSERT INTO iep_profiles (student_id, needs, time_multiplier, multi_format_approved, scribe_allowed, rest_breaks, notes, review_date, senco_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const ROSTER = [
  // Grade 9: the PRD's worked examples live here.
  { first: 'Maya',   last: 'Thompson', code: 'STU-1002', klass: 'grade9',   dob: '2011-04-12', gender: 'F',
    parent: ['Rebecca', 'Thompson', 'r.thompson@family.demo', 'Mother', 'en'],
    iep: { needs: ['dyslexia'], multiplier: 1.25, multiFormat: 0, notes: 'Benefits from OpenDyslexic and soft blue tint. Reads with TTS support.' } },
  { first: 'Alex',   last: 'Jordan', code: 'STU-3004', klass: 'grade9', dob: '2011-01-22', gender: 'NB',
    parent: ['Michael', 'Jordan', 'm.jordan@family.demo', 'Father', 'fr'],
    iep: { needs: ['dyslexia', 'adhd'], multiplier: 1.5, multiFormat: 1, scribe: 1, breaks: 1,
           notes: 'Multi-format submission approved. 50% extra time on all timed assessments.' } },
  { first: 'Chloe',  last: 'Nakamura', code: 'STU-1003', klass: 'grade9', dob: '2011-07-03', gender: 'F',
    parent: ['Yuki', 'Nakamura', 'y.nakamura@family.demo', 'Mother', 'en'] },
  { first: 'Daniel', last: 'Owusu', code: 'STU-1004', klass: 'grade9', dob: '2011-02-18', gender: 'M',
    parent: ['Kwame', 'Owusu', 'k.owusu@family.demo', 'Father', 'en'],
    iep: { needs: ['asc'], multiplier: 1.25, breaks: 1, notes: 'Low-sensory mode preferred. Needs advance notice of timetable changes.' } },
  { first: 'Sofia',  last: 'Marquez', code: 'STU-1005', klass: 'grade9', dob: '2011-09-30', gender: 'F',
    parent: ['Lucia', 'Marquez', 'l.marquez@family.demo', 'Mother', 'es'],
    iep: { needs: ['dyscalculia'], multiplier: 1.25, notes: 'Colour-coded number work and visual schedule cards.' } },
  { first: 'Idris',  last: 'Bello', code: 'STU-1006', klass: 'grade9', dob: '2011-06-08', gender: 'M',
    parent: ['Halima', 'Bello', 'h.bello@family.demo', 'Mother', 'ha'] },

  // Primary 4
  { first: 'Lily',   last: 'Chen', code: 'STU-2001', klass: 'primary4', dob: '2016-03-15', gender: 'F',
    parent: ['Wei', 'Chen', 'w.chen@family.demo', 'Father', 'en'] },
  { first: 'Noah',   last: 'Adeyemi', code: 'STU-2002', klass: 'primary4', dob: '2016-05-21', gender: 'M',
    parent: ['Folake', 'Adeyemi', 'f.adeyemi@family.demo', 'Mother', 'yo'],
    iep: { needs: ['adhd'], multiplier: 1.25, breaks: 1, notes: 'Task chunking and visual progress bars. Focus Mode on by default.' } },
  { first: 'Amelia', last: 'Kowalski', code: 'STU-2003', klass: 'primary4', dob: '2016-11-02', gender: 'F',
    parent: ['Anna', 'Kowalski', 'a.kowalski@family.demo', 'Mother', 'en'] },
  { first: 'Zane',   last: 'Ferreira', code: 'STU-2004', klass: 'primary4', dob: '2016-08-19', gender: 'M',
    parent: ['Beatriz', 'Ferreira', 'b.ferreira@family.demo', 'Mother', 'es'] },

  // Nursery 2
  { first: 'Ivy',    last: 'Bennett', code: 'STU-4001', klass: 'nursery2', dob: '2022-02-10', gender: 'F',
    parent: ['Claire', 'Bennett', 'c.bennett@family.demo', 'Mother', 'en'] },
  { first: 'Omar',   last: 'Haddad', code: 'STU-4002', klass: 'nursery2', dob: '2022-04-27', gender: 'M',
    parent: ['Nadia', 'Haddad', 'n.haddad@family.demo', 'Mother', 'ar'] },
];

const students = {};
for (const p of ROSTER) {
  const uid = user('student', p.first, p.last, `${p.code.toLowerCase()}@student.demo`);
  const sid = addStudent.run(uid, p.code, classes[p.klass], p.dob, p.gender,
    '14 Rosewood Avenue, Springfield', null, `${p.parent[0]} ${p.parent[1]}`, '+1 555 0200',
    iso(daysAgo(400))).lastInsertRowid;
  students[p.code] = { id: sid, userId: uid, ...p };

  const pid = user('parent', p.parent[0], p.parent[1], p.parent[2], { locale: p.parent[4], phone: '+1 555 02' + String(sid).padStart(2, '0') });
  addGuardian.run(pid, sid, p.parent[3], 1);
  students[p.code].parentId = pid;

  if (p.iep) {
    addIep.run(sid, JSON.stringify(p.iep.needs), p.iep.multiplier ?? 1.0,
      p.iep.multiFormat ?? 0, p.iep.scribe ?? 0, p.iep.breaks ?? 0,
      p.iep.notes, iso(daysAhead(90)), senco);
  }
}

// One parent with two children, to exercise the child switcher.
addGuardian.run(students['STU-1003'].parentId, students['STU-4001'].id, 'Mother', 0);

/* ── Accessibility presets ────────────────────────────────────────────────── */
const addPrefs = db.prepare(
  `INSERT INTO accessibility_prefs (user_id, font, text_scale, bionic, tint, high_targets, captions, low_sensory, focus_mode, voice_speed)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
addPrefs.run(students['STU-1002'].userId, 'opendyslexic', 110, 1, 'blue', 1, 1, 0, 0, 0.9);
addPrefs.run(students['STU-3004'].userId, 'lexend', 115, 1, 'blue', 1, 1, 0, 1, 1.0);
addPrefs.run(students['STU-1004'].userId, 'standard', 100, 0, 'white', 1, 1, 1, 0, 1.0);
addPrefs.run(students['STU-2002'].userId, 'lexend', 120, 0, 'yellow', 1, 0, 0, 1, 1.0);

/* ── Lesson materials ─────────────────────────────────────────────────────── */
console.log('Publishing lesson recaps…');
const addMaterial = db.prepare(
  `INSERT INTO lesson_materials (class_subject_id, lesson_date, period, topic, summary, teacher_notes, video_url, video_duration, transcript, attachments, check_questions, created_by)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

/**
 * Two quick questions per lesson. Enough that finishing a catch-up means the
 * pupil engaged with it, short enough that it does not feel like a punishment
 * for having been ill.
 */
const checksFor = (topic) => JSON.stringify([
  {
    q: `In this lesson on ${topic.toLowerCase()}, what did the teacher say to do first?`,
    options: ['Read the whole thing twice', 'Look at the worked example', 'Skip to the questions', 'Ask a friend'],
    answer: 1,
    explain: 'The recap starts with a worked example at 09:05, before any of the practice questions.',
  },
  {
    q: 'What is the most useful thing to do if you get stuck?',
    options: ['Leave it blank', 'Guess and move on', 'Message your teacher through the portal', 'Start the whole lesson again'],
    answer: 2,
    explain: 'You can message your teacher from the portal, and they can see exactly which lesson you missed.',
  },
]);
const SAMPLE_VIDEO = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
const SAMPLE_AUDIO = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4';

const transcriptFor = (topic) => JSON.stringify([
  { t: '00:15', text: 'Welcome back class. Today we are looking at ' + topic + '.' },
  { t: '03:40', text: 'Let us start with the definition and why it matters.' },
  { t: '09:05', text: 'Here is a worked example on the board. Follow along in your notes.' },
  { t: '15:30', text: 'Notice the pattern that emerges when we change the coefficient.' },
  { t: '22:10', text: 'The discriminant determines roots. This is the key idea to remember.' },
  { t: '31:00', text: 'Now try question four on your worksheet with the person next to you.' },
  { t: '38:45', text: 'Common mistake: forgetting to check the sign before squaring.' },
  { t: '44:00', text: 'Homework is set on the portal. See you next lesson.' },
]);
/**
 * Lesson attachments.
 *
 * A note carries its text with it and is read inside the app, where the
 * accessibility settings apply: font, tint, text size, bionic reading and
 * read-aloud. Handing a dyslexic child a PDF to download undoes all of that,
 * so notes are the default and files are the exception.
 */
const attachmentsFor = (topic) => JSON.stringify([
  {
    name: 'Lesson notes',
    type: 'note',
    content:
      `${topic}\n\n` +
      'What we covered\n' +
      `We started with what you already knew, then built up ${topic.toLowerCase()} one step at a time. ` +
      'The three worked examples on the board are the ones to copy into your book.\n\n' +
      'The key idea\n' +
      'Once you can spot the pattern, the rest follows. Look at each worked example twice: once to ' +
      'read it through, and once copying it down line by line. That is far more useful than reading ' +
      'it five times.\n\n' +
      'Common mistakes\n' +
      'Most marks are lost by rushing the first line. Check the sign before you go any further, and ' +
      'write out the step you would normally do in your head.\n\n' +
      'What to do next\n' +
      'Try questions 1 to 4 on the worksheet. If you get stuck on the same step twice, stop and ' +
      'message me through the portal rather than guessing.',
  },
  {
    name: 'Summary card',
    type: 'note',
    content:
      `${topic} in short\n\n` +
      '1. Read the question twice before writing anything.\n' +
      '2. Write down what you already know.\n' +
      '3. Work through it one line at a time, showing every step.\n' +
      '4. Check your answer against the worked example.\n\n' +
      'If you only remember one thing: the pattern matters more than the numbers.',
  },
  { name: 'Teacher recap (audio)', type: 'audio', url: SAMPLE_AUDIO },
]);

/**
 * Planned absences, and the recaps that go with them.
 *
 * Both are derived from the real timetable rather than guessed. A recap belongs
 * to a specific class, date and period, so publishing one for "English, period 2"
 * only reaches an absent pupil if English genuinely sits in period 2 that
 * weekday. Resolving the actual slot first means every demo absence lands on a
 * lesson that exists, and its recap always attaches.
 */
/**
 * The Nth most recent school day. Counting back in calendar days means a seed
 * run on a Monday silently loses its Saturday and Sunday absences, so the demo
 * ends up thinner on some days of the week than others.
 */
const schoolDaysAgo = (n) => {
  const d = new Date();
  let remaining = n;
  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return d;
};

const slotsOn = (classId, agoDays) => {
  const dow = schoolDaysAgo(agoDays).getDay() || 7;
  if (dow > 5) return [];
  return db.prepare(
    `SELECT ts.class_subject_id, ts.period, sub.name AS subject
     FROM timetable_slots ts
     JOIN class_subjects cs ON cs.id = ts.class_subject_id
     JOIN subjects sub ON sub.id = cs.subject_id
     WHERE cs.class_id = ? AND ts.day_of_week = ?
     ORDER BY ts.period`
  ).all(classId, dow);
};

const TOPICS = {
  'Mathematics': ['Quadratic Equations: Intro and Graphing', 'Factorising Quadratic Expressions', 'Simultaneous Equations'],
  'English Language': ['Persuasive Writing Techniques', 'Analysing Character Motivation'],
  'Integrated Science': ['Cell Structure and Organelles', 'Photosynthesis and Energy Transfer'],
  'History': ['Causes of the Industrial Revolution', 'Life in the Mill Towns'],
  'Numeracy': ['Multiplying Two-Digit Numbers', 'Times Tables 6, 7 and 8'],
  'Literacy': ['Writing a Character Description', 'Speech Marks and Dialogue'],
  'World Discovery': ['Rivers and How They Shape Land', 'Volcanoes and Mountains'],
  'Play & Discovery': ['Shapes and Colours Circle Time'],
  'Early Phonics': ['Letter Sounds and Rhyme'],
};
const topicFor = (subject, n) => {
  const list = TOPICS[subject] ?? [`${subject} recap`];
  return list[n % list.length];
};

const publishRecap = (classSubjectId, date, period, topic, author) =>
  addMaterial.run(classSubjectId, date, period, topic,
    `Recap of "${topic}". Key ideas, worked examples and the practice set from the lesson.`,
    'Focus on the three worked examples. If you missed this, watch from 09:05 and attempt questions 1 to 4.',
    SAMPLE_VIDEO, 2700, transcriptFor(topic), attachmentsFor(topic), checksFor(topic), author);

// Who misses what. `slot` picks from that day's real timetable; `pending` leaves
// the recap unpublished on purpose, to show the waiting state in the hub.
const PLANNED_ABSENCES = [
  { code: 'STU-1002', ago: 3, slot: 0 },
  { code: 'STU-1002', ago: 6, slot: 1 },
  { code: 'STU-1002', ago: 4, slot: 2 },
  { code: 'STU-3004', ago: 5, slot: 0 },
  { code: 'STU-3004', ago: 7, slot: 3 },
  { code: 'STU-1003', ago: 4, slot: 1 },
  { code: 'STU-1003', ago: 8, slot: 0 },
  { code: 'STU-1003', ago: 9, slot: 2, pending: true },
  { code: 'STU-1004', ago: 3, slot: 0 },
  { code: 'STU-1005', ago: 9, slot: 1 },
  { code: 'STU-1006', ago: 8, slot: 2 },
  { code: 'STU-2002', ago: 3, slot: 0 },
  { code: 'STU-2002', ago: 5, slot: 1 },
  { code: 'STU-2001', ago: 6, slot: 2 },
  { code: 'STU-2001', ago: 4, slot: 0, pending: true },
];

const ABSENCES = new Set();
const published = new Set();
let topicIndex = 0;

for (const plan of PLANNED_ABSENCES) {
  const student = students[plan.code];
  const slots = slotsOn(classes[student.klass], plan.ago);
  if (!slots.length) continue;

  const slot = slots[plan.slot % slots.length];
  const date = iso(schoolDaysAgo(plan.ago));
  ABSENCES.add(`${plan.code}|${date}|${slot.period}`);

  const key = `${slot.class_subject_id}|${date}|${slot.period}`;
  if (!plan.pending && !published.has(key)) {
    published.add(key);
    const teacher = db.prepare('SELECT teacher_id FROM class_subjects WHERE id = ?').get(slot.class_subject_id);
    publishRecap(slot.class_subject_id, date, slot.period, topicFor(slot.subject, topicIndex++), teacher?.teacher_id ?? admin);
  }
}

// A few more recaps so the teacher's list is not limited to missed lessons.
for (const [classId, ago, slotIndex] of [
  [classes.grade9, 2, 0], [classes.grade9, 2, 2], [classes.grade9, 5, 3],
  [classes.primary4, 2, 1], [classes.primary4, 7, 0], [classes.nursery2, 3, 0],
]) {
  const slots = slotsOn(classId, ago);
  if (!slots.length) continue;
  const slot = slots[slotIndex % slots.length];
  const date = iso(schoolDaysAgo(ago));
  const key = `${slot.class_subject_id}|${date}|${slot.period}`;
  if (published.has(key)) continue;
  published.add(key);
  const teacher = db.prepare('SELECT teacher_id FROM class_subjects WHERE id = ?').get(slot.class_subject_id);
  publishRecap(slot.class_subject_id, date, slot.period, topicFor(slot.subject, topicIndex++), teacher?.teacher_id ?? admin);
}

/* ── Attendance (auto-populates the Catch-Up Hub) ─────────────────────────── */
console.log('Recording attendance and generating Catch-Up Hub entries…');
const addAttendance = db.prepare(
  `INSERT OR IGNORE INTO attendance (student_id, class_subject_id, date, period, status, marked_by) VALUES (?, ?, ?, ?, ?, ?)`
);
const readAttendance = db.prepare(
  'SELECT * FROM attendance WHERE student_id = ? AND class_subject_id = ? AND date = ? AND period = ?'
);

// Deliberate absences so the Catch-Up Hub has content on first login.

const allStudents = db.prepare(
  `SELECT s.id, s.student_code, s.class_id FROM students s`
).all();

db.transaction(() => {
  for (let ago = 14; ago >= 1; ago--) {
    const date = iso(daysAgo(ago));
    const dow = daysAgo(ago).getDay() || 7;
    if (dow > 5) continue;

    for (const student of allStudents) {
      const slots = db.prepare(
        `SELECT ts.class_subject_id, ts.period FROM timetable_slots ts
         JOIN class_subjects c2 ON c2.id = ts.class_subject_id
         WHERE c2.class_id = ? AND ts.day_of_week = ?`
      ).all(student.class_id, dow);

      for (const slot of slots) {
        const key = `${student.student_code}|${date}|${slot.period}`;
        let status = 'present';
        if (ABSENCES.has(key)) status = 'absent';
        else if (Math.random() < 0.03) status = 'late';

        addAttendance.run(student.id, slot.class_subject_id, date, slot.period, status, teachers.maths);
        if (status === 'absent') {
          syncCatchupForAttendance(readAttendance.get(student.id, slot.class_subject_id, date, slot.period));
        }
      }
    }
  }
})();

/* ── Assignments & submissions ────────────────────────────────────────────── */
console.log('Setting assignments…');
const addAssignment = db.prepare(
  `INSERT INTO assignments (class_subject_id, title, description, instructions_steps, questions, due_at, max_score, allow_multi_format, base_duration_minutes, created_by)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const QUADRATICS_QUIZ = JSON.stringify([
  { q: 'What does the discriminant tell you about a quadratic equation?',
    options: ['How steep the curve is', 'How many real roots it has', 'Where the y-intercept sits', 'Whether it opens upwards'],
    answer: 1,
    explain: 'The discriminant is b squared minus 4ac. Positive means two real roots, zero means one, negative means none.' },
  { q: 'A parabola opens downwards. What does that tell you about a?',
    options: ['a is greater than zero', 'a is less than zero', 'a equals zero', 'It says nothing about a'],
    answer: 1,
    explain: 'A negative coefficient of x squared flips the curve, so it opens downwards.' },
  { q: 'Factorise x squared plus 5x plus 6.',
    options: ['(x + 1)(x + 6)', '(x + 2)(x + 3)', '(x - 2)(x - 3)', '(x + 5)(x + 1)'],
    answer: 1,
    explain: 'You need two numbers that multiply to 6 and add to 5: that is 2 and 3.' },
  { q: 'Where does a parabola cross the x-axis?',
    options: ['At its vertex', 'Where y equals zero', 'Where x equals zero', 'At the y-intercept'],
    answer: 1,
    explain: 'The x-axis is the line y = 0, so the roots are the values of x that make the expression zero.' },
]);

const TIMES_TABLES_QUIZ = JSON.stringify([
  { q: 'What is 7 times 8?', options: ['54', '56', '48', '64'], answer: 1,
    explain: 'Seven eights are fifty-six. It rhymes, which is why it is the easiest one to remember.' },
  { q: 'What is 6 times 9?', options: ['54', '56', '63', '45'], answer: 0,
    explain: 'Six nines are fifty-four. Nine times any number: the digits always add up to nine.' },
  { q: 'What is 8 times 8?', options: ['56', '64', '72', '48'], answer: 1,
    explain: 'Eight eights are sixty-four.' },
]);
const steps = (arr) => JSON.stringify(arr);

const assignments = {
  historyEssay: addAssignment.run(cs.g9history, 'History Impact Essay',
    'Explain how the Industrial Revolution reshaped daily life for working families. Use at least three sources from class.',
    steps(['Re-read the three source extracts', 'Draft your thesis in one sentence',
           'Write three body paragraphs, one per source', 'Write a short conclusion', 'Proofread, then submit']),
    null,
    daysAhead(5).toISOString(), 100, 1, null, teachers.history).lastInsertRowid,

  mathsQuiz: addAssignment.run(cs.g9maths, 'Quadratics Check-In Quiz',
    'A timed quiz covering graphing, factorising and the discriminant. Four questions, marked as soon as you submit.',
    steps(['Read every question first', 'Answer the ones you are sure of', 'Go back to the harder ones', 'Check before submitting']),
    QUADRATICS_QUIZ,
    daysAhead(3).toISOString(), 50, 0, 60, teachers.maths).lastInsertRowid,

  scienceLab: addAssignment.run(cs.g9science, 'Photosynthesis Lab Report',
    'Write up the pond-weed experiment: method, results table, graph and conclusion.',
    steps(['Write the method in past tense', 'Complete the results table', 'Plot the graph', 'Write your conclusion']),
    null,
    daysAhead(9).toISOString(), 100, 1, null, teachers.science).lastInsertRowid,

  englishSpeech: addAssignment.run(cs.g9english, 'Persuasive Speech',
    'Record or write a three-minute persuasive speech on a cause that matters to you.',
    steps(['Pick your cause', 'List three arguments', 'Write or record the speech', 'Submit in your chosen format']),
    null,
    daysAhead(7).toISOString(), 100, 1, null, teachers.english).lastInsertRowid,

  mathsPast: addAssignment.run(cs.g9maths, 'Factorising Practice Set',
    'Twenty factorising questions from the workbook.', steps([]), null,
    daysAgo(2).toISOString(), 20, 0, null, teachers.maths).lastInsertRowid,

  p4Story: addAssignment.run(cs.p4lit, 'My Adventure Story',
    'Write or record a short adventure story with a beginning, middle and end.',
    steps(['Think of your hero', 'What is the problem?', 'How is it solved?', 'Write or record it', 'Read it out loud once']),
    null,
    daysAhead(4).toISOString(), 20, 1, null, teachers.primary).lastInsertRowid,

  p4Maths: addAssignment.run(cs.p4num, 'Times Tables Challenge',
    'Three quick questions on the 6, 7 and 8 times tables, marked as soon as you submit.',
    steps([]), TIMES_TABLES_QUIZ,
    daysAgo(1).toISOString(), 20, 0, 20, teachers.primary).lastInsertRowid,
};

const addSubmission = db.prepare(
  `INSERT INTO submissions (assignment_id, student_id, submission_type, body, file_name, file_url, file_duration, transcript, status, submitted_at, grade, feedback_type, feedback_text, graded_by, graded_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

// Alex's audio submission, the PRD §8.4 worked example.
addSubmission.run(assignments.historyEssay, students['STU-3004'].id, 'AUDIO', null,
  'essay_recap.mp3', '#', '04:30',
  'In this response, I am explaining how the Industrial Revolution changed where families lived and worked. ' +
  'My first source shows the shift from rural cottages into terraced housing near the mills…',
  'submitted', daysAgo(1).toISOString(), null, 'text', null, null, null);

addSubmission.run(assignments.historyEssay, students['STU-1002'].id, 'TEXT',
  'The Industrial Revolution changed family life more than any other event of the period. First, the move from ' +
  'cottage industry to factory work separated home from workplace for the first time…', null, null, null, null,
  'submitted', daysAgo(2).toISOString(), null, 'text', null, null, null);

addSubmission.run(assignments.mathsPast, students['STU-1002'].id, 'TEXT', 'Answers 1–20 attached in my notebook photo.',
  null, null, null, null, 'graded', daysAgo(3).toISOString(), 16, 'text',
  'Solid work Maya. Watch the sign when the middle term is negative: questions 12 and 17.', teachers.maths, daysAgo(2).toISOString());

addSubmission.run(assignments.mathsPast, students['STU-1003'].id, 'TEXT', 'All twenty completed.',
  null, null, null, null, 'graded', daysAgo(3).toISOString(), 19, 'text',
  'Excellent, only one slip. Try the extension set next.', teachers.maths, daysAgo(2).toISOString());

addSubmission.run(assignments.mathsPast, students['STU-1005'].id, 'TEXT', 'I found these hard but I tried all of them.',
  null, null, null, null, 'graded', daysAgo(3).toISOString(), 12, 'audio',
  'Sofia, good persistence. I have recorded a walkthrough of questions 5–10 for you.', teachers.maths, daysAgo(2).toISOString());

addSubmission.run(assignments.p4Maths, students['STU-2001'].id, 'TEXT', '6s and 7s done, 8s nearly!',
  null, null, null, null, 'graded', daysAgo(2).toISOString(), 17, 'text',
  'Great effort Lily! The 8s will click with a bit more practice.', teachers.primary, daysAgo(1).toISOString());

// Handed in after the deadline and not yet marked, so the maths teacher's
// notice board opens with real work waiting on them.
addSubmission.run(assignments.mathsPast, students['STU-1004'].id, 'TEXT',
  'Sorry this is late Mr Mensah, I was away. Questions 1 to 20 are all here.',
  null, null, null, null, 'submitted', daysAgo(1).toISOString(), null, 'text', null, null, null);

addSubmission.run(assignments.mathsPast, students['STU-1006'].id, 'TEXT',
  'I got stuck on 14 and 15 but everything else is done.',
  null, null, null, null, 'submitted', daysAgo(1).toISOString(), null, 'text', null, null, null);

// A recap written up but never released. It shows on the notice board with a
// one-tap Publish, which is the fastest route from draft to pupils.
db.prepare(
  `INSERT INTO lesson_materials (class_subject_id, lesson_date, period, topic, summary, teacher_notes,
                                 video_url, video_duration, transcript, attachments, check_questions,
                                 created_by, is_published, published_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`
).run(cs.g9maths, iso(daysAgo(1)), 2, 'Simultaneous Equations',
  'Recap of "Simultaneous Equations". Elimination first, then substitution, with two worked examples.',
  'Draft. Check the second worked example before releasing this one.',
  SAMPLE_VIDEO, 2700, transcriptFor('Simultaneous Equations'),
  attachmentsFor('Simultaneous Equations'), checksFor('Simultaneous Equations'), teachers.maths);

/* ── Finance: the books behind the fees ───────────────────────────────────── */
console.log('Opening the ledger…');
const { seedFinance } = await import('./chartOfAccounts.js');
const { postJournal, accountByRole } = await import('../lib/ledger.js');
seedFinance(db);

const accountId = (code) => db.prepare('SELECT id FROM accounts WHERE code = ?').get(code).id;
const bursar = { id: admin, first_name: 'Amara', last_name: 'Okonkwo', role: 'admin' };

// What a school's books actually contain: the funds it opened the year with,
// a term of running costs, and salaries.
postJournal({
  date: iso(daysAgo(120)), memo: 'Opening balances brought forward', source: 'opening', user: bursar,
  lines: [
    { account_id: accountId('1010'), debit: 62_400 },
    { account_id: accountId('1020'), debit: 1_200 },
    { account_id: accountId('1510'), debit: 480_000 },
    { account_id: accountId('1520'), debit: 36_000 },
    { account_id: accountId('3000'), credit: 579_600 },
  ],
});

const addSupplier = db.prepare('INSERT INTO suppliers (name, contact, email, phone) VALUES (?, ?, ?, ?)');
const suppliers = {
  power: addSupplier.run('Meridian Power', 'Accounts', 'billing@meridianpower.example', '+1 555 0301').lastInsertRowid,
  books: addSupplier.run('Kingsway Educational Supplies', 'Ada Bright', 'orders@kingsway.example', '+1 555 0302').lastInsertRowid,
  clean: addSupplier.run('Brightwell Facilities', 'Site office', 'hello@brightwell.example', '+1 555 0303').lastInsertRowid,
};

const addExpense = db.prepare(
  `INSERT INTO expenses (reference, supplier_id, account_id, paid_from_id, description, amount, spent_on, status, approved_by, approved_at, journal_id, created_by)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const RUNNING_COSTS = [
  [suppliers.power, '5120', 'Electricity, first term', 1_820, 74],
  [suppliers.clean, '5140', 'Cleaning and grounds, first term', 2_400, 66],
  [suppliers.books, '5210', 'Reading scheme and stationery', 1_150, 52],
  [null, '5320', 'Broadband and telephone', 680, 40],
  [suppliers.power, '5120', 'Electricity, second term', 1_960, 12],
];

RUNNING_COSTS.forEach(([supplierId, code, description, amount, ago], i) => {
  const spentOn = iso(daysAgo(ago));
  const journalId = postJournal({
    date: spentOn, memo: description, source: 'expense', user: bursar,
    lines: [
      { account_id: accountId(code), debit: amount, supplier_id: supplierId },
      { account_role: 'bank', credit: amount, supplier_id: supplierId },
    ],
  });
  addExpense.run(`EXP-${spentOn.slice(0, 4)}-${String(i + 1).padStart(4, '0')}`, supplierId, accountId(code),
                 accountByRole('bank').id, description, amount, spentOn, 'paid', admin,
                 new Date().toISOString(), journalId, admin);
});

// One bill still going through approval, so the queue is not empty on a demo.
addExpense.run(`EXP-${iso(daysAgo(3)).slice(0, 4)}-0006`, suppliers.books, accountId('5220'), null,
               'Science laboratory consumables', 940, iso(daysAgo(3)), 'draft', null, null, null, admin);

for (const [code, amount] of [['5010', 18_600], ['5020', 6_400]]) {
  postJournal({
    date: iso(daysAgo(30)), memo: 'Payroll, first term', source: 'payroll', user: bursar,
    lines: [
      { account_id: accountId(code), debit: amount },
      { account_role: 'bank', credit: amount },
    ],
  });
}

const openYear = db.prepare('SELECT id FROM financial_years ORDER BY starts_on DESC LIMIT 1').get().id;
const addBudget = db.prepare('INSERT INTO budgets (year_id, account_id, amount) VALUES (?, ?, ?)');
for (const [code, amount] of [['5010', 58_000], ['5020', 19_500], ['5120', 6_000], ['5140', 7_500],
                              ['5210', 3_600], ['5220', 2_800], ['5320', 2_400], ['4000', 120_000]]) {
  addBudget.run(openYear, accountId(code), amount);
}

/* ── Leave requests ───────────────────────────────────────────────────────── */
console.log('Adding leave requests…');
const addLeave = db.prepare(
  `INSERT INTO leave_requests (student_id, requested_by, start_date, end_date, reason, category, status, reviewed_by, reviewed_at, review_note)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
addLeave.run(students['STU-1002'].id, students['STU-1002'].parentId, iso(daysAhead(6)), iso(daysAhead(7)),
  'Hospital appointment and follow-up assessment.', 'medical', 'pending', null, null, null);
addLeave.run(students['STU-2002'].id, students['STU-2002'].parentId, iso(daysAhead(12)), iso(daysAhead(14)),
  'Family wedding travelling out of state.', 'family', 'pending', null, null, null);
addLeave.run(students['STU-1006'].id, students['STU-1006'].parentId, iso(daysAgo(8)), iso(daysAgo(8)),
  'Religious observance.', 'religious', 'approved', teachers.maths, daysAgo(9).toISOString(), 'Approved. Please catch up via the hub.');

/* ── Calendar ─────────────────────────────────────────────────────────────── */
console.log('Filling the school calendar…');
const addEvent = db.prepare(
  'INSERT INTO calendar_events (title, description, event_type, start_at, end_at, all_day, location, section, class_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
const at = (d, h, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x.toISOString(); };
addEvent.run('Parent–Teacher Conference Day', 'Fifteen-minute slots bookable through the parent portal.', 'meeting',
  at(daysAhead(10), 9), at(daysAhead(10), 16), 0, 'Main Hall', null, null, admin);
addEvent.run('Mid-Term Assessments Begin', 'Secondary assessments across all subjects.', 'exam',
  at(daysAhead(15), 8, 30), at(daysAhead(19), 15), 0, 'Exam Hall', 'secondary', null, admin);
addEvent.run('Half-Term Break', 'School closed for all sections.', 'holiday',
  at(daysAhead(22), 0), at(daysAhead(26), 23, 59), 1, null, null, null, admin);
addEvent.run('Grade 9 Science Museum Trip', 'Coaches depart 08:15 sharp. Packed lunch required.', 'excursion',
  at(daysAhead(8), 8, 15), at(daysAhead(8), 16), 0, 'City Science Museum', 'secondary', classes.grade9, teachers.science);
addEvent.run('Nursery Sports Morning', 'Parents welcome from 09:30.', 'sports',
  at(daysAhead(5), 9, 30), at(daysAhead(5), 12), 0, 'Field', 'nursery', classes.nursery2, teachers.nursery);
addEvent.run('Primary 4 Class Assembly', 'Kestrels present their rivers project.', 'general',
  at(daysAhead(3), 14), at(daysAhead(3), 15), 0, 'Main Hall', 'primary', classes.primary4, teachers.primary);
addEvent.run('Inclusion & SEN Coffee Morning', 'Drop-in with the SENCO. No booking needed.', 'meeting',
  at(daysAhead(4), 8, 45), at(daysAhead(4), 10), 0, 'Room 3', null, null, senco);

/* ── Messaging ────────────────────────────────────────────────────────────── */
console.log('Seeding parent–teacher conversations…');
const addThread = db.prepare('INSERT INTO threads (subject, student_id, created_by) VALUES (?, ?, ?)');
const addParticipant = db.prepare('INSERT INTO thread_participants (thread_id, user_id) VALUES (?, ?)');
const addMessage = db.prepare('INSERT INTO messages (thread_id, sender_id, body, source_lang, created_at) VALUES (?, ?, ?, ?, ?)');

const t1 = addThread.run("Alex's extra time arrangement", students['STU-3004'].id, teachers.history).lastInsertRowid;
addParticipant.run(t1, teachers.history);
addParticipant.run(t1, students['STU-3004'].parentId);
addMessage.run(t1, teachers.history,
  'Good morning. I wanted to confirm that Alex now has 50% extra time applied automatically to every timed assessment, and audio submissions are approved for written tasks.',
  'en', daysAgo(3).toISOString());
addMessage.run(t1, students['STU-3004'].parentId,
  'Thank you, that is a great help. Alex found the audio option much less stressful than the written essay.',
  'en', daysAgo(3).toISOString());
addMessage.run(t1, teachers.history,
  'Agreed. The transcript comes through automatically so marking is unaffected. I will send progress notes after the next assignment.',
  'en', daysAgo(2).toISOString());

const t2 = addThread.run('Reading progress this term', students['STU-1002'].id, students['STU-1002'].parentId).lastInsertRowid;
addParticipant.run(t2, students['STU-1002'].parentId);
addParticipant.run(t2, teachers.english);
addMessage.run(t2, students['STU-1002'].parentId,
  'Hello, Maya has been using the OpenDyslexic setting at home and says reading feels easier. Is that showing in class?',
  'en', daysAgo(5).toISOString());
addMessage.run(t2, teachers.english,
  'Good morning. Yes, she is reading aloud with much more confidence and her last piece of homework was her strongest yet. Please keep the tint and font settings as they are.',
  'en', daysAgo(4).toISOString());

const t3 = addThread.run('Sports morning arrangements', students['STU-4002'].id, teachers.nursery).lastInsertRowid;
addParticipant.run(t3, teachers.nursery);
addParticipant.run(t3, students['STU-4002'].parentId);
addMessage.run(t3, teachers.nursery,
  'Hello. Please remember the sports morning next week. Omar will need trainers and a sun hat. Thank you.',
  'en', daysAgo(1).toISOString());

const t4 = addThread.run('Quadratics homework', students['STU-1004'].id, students['STU-1004'].parentId).lastInsertRowid;
addParticipant.run(t4, students['STU-1004'].parentId);
addParticipant.run(t4, teachers.maths);
addMessage.run(t4, students['STU-1004'].parentId,
  'Good afternoon Mr Mensah. Noah handed his factorising set in a day late after being unwell. Could you let us know how he got on once it is marked?',
  'en', daysAgo(1).toISOString());

/* ── Nursery activity timeline ────────────────────────────────────────────── */
console.log('Logging nursery activity…');
const addActivity = db.prepare(
  'INSERT INTO activity_logs (student_id, entry_type, detail, rating, occurred_at, logged_by) VALUES (?, ?, ?, ?, ?, ?)'
);
const nurseryDay = (studentId) => {
  const today = new Date();
  const entries = [
    ['meal', 'Breakfast: porridge with banana', 'Ate all', 8, 30],
    ['mood', 'Settled quickly at drop-off, went straight to the block corner', 'Happy', 9, 5],
    ['note', 'Joined circle time and named four shapes independently', null, 10, 15],
    ['meal', 'Lunch: rice, chicken and green beans', 'Ate most', 12, 15],
    ['nap', 'Rest time', 'Slept 45 minutes', 13, 0],
    ['toilet', 'Nappy change', 'Dry', 14, 30],
    ['milestone', 'Wrote the first letter of their name unaided for the first time', null, 15, 0],
    ['behaviour', 'Shared the crayons with a friend without prompting', 'Positive', 15, 30],
  ];
  for (const [type, detail, rating, h, m] of entries) {
    const when = new Date(today); when.setHours(h, m, 0, 0);
    addActivity.run(studentId, type, detail, rating, when.toISOString(), teachers.nursery);
  }
};
nurseryDay(students['STU-4001'].id);
nurseryDay(students['STU-4002'].id);
addActivity.run(students['STU-2002'].id, 'milestone', 'Read a full chapter aloud in guided reading', null, new Date().toISOString(), teachers.primary);

/* ── Permission slips ─────────────────────────────────────────────────────── */
const addSlip = db.prepare(
  'INSERT INTO permission_slips (title, description, event_date, cost, class_id, respond_by, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
addSlip.run('Science Museum Trip (Grade 9)', 'Full-day trip. Coaches leave at 08:15 and return by 16:00. Packed lunch required.',
  iso(daysAhead(8)), 18, classes.grade9, iso(daysAhead(4)), teachers.science);
addSlip.run('Nursery Sports Morning Photography', 'Consent for photographs to appear in the school newsletter.',
  iso(daysAhead(5)), 0, classes.nursery2, iso(daysAhead(3)), teachers.nursery);
addSlip.run('Primary 4 Local Woodland Walk', 'Half-day walk to Hollow Woods. Sturdy shoes and a coat needed.',
  iso(daysAhead(11)), 0, classes.primary4, iso(daysAhead(7)), teachers.primary);

/* ── Textbooks ────────────────────────────────────────────────────────────── */
console.log('Stocking the e-library…');
const addBook = db.prepare(
  'INSERT INTO textbooks (title, author, subject_id, section, cover_colour, description, total_pages) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
const addPage = db.prepare('INSERT INTO textbook_pages (textbook_id, page_number, heading, content) VALUES (?, ?, ?, ?)');

const BOOKS = [
  ['Foundations of Algebra', 'R. Ndiaye', subjects.mathsSec, 'secondary', '#2563eb',
   'A step-by-step introduction to algebraic thinking, from expressions through to quadratic equations.',
   ['Expressions and Terms', 'Solving Linear Equations', 'Introducing Quadratics', 'Factorising', 'Graphing Parabolas',
    'The Discriminant', 'Simultaneous Equations', 'Word Problems', 'Revision Set A', 'Revision Set B', 'Glossary', 'Answers']],
  ['Reading the World: Language & Literature', 'S. Whitfield', subjects.english, 'secondary', '#7c3aed',
   'Close reading, persuasive writing and character analysis for lower secondary.',
   ['Why We Read', 'Narrative Voice', 'Character Motivation', 'Persuasive Techniques', 'Structuring an Argument',
    'Editing Your Draft', 'Poetry Basics', 'Comparing Texts', 'Exam Practice', 'Glossary']],
  ['Living Systems: Integrated Science', 'T. Balogun', subjects.science, 'secondary', '#059669',
   'Cells, energy and ecosystems, with lab write-up guidance throughout.',
   ['The Cell', 'Organelles at Work', 'Diffusion and Osmosis', 'Photosynthesis', 'Respiration',
    'Food Chains', 'Ecosystems', 'Writing a Lab Report', 'Practical Safety', 'Glossary']],
  ['Number Explorers 4', 'G. Adeyemi', subjects.numeracy, 'primary', '#0891b2',
   'Primary numeracy with visual models, colour-coded number lines and practice pages.',
   ['Counting in Steps', 'Place Value', 'Adding Big Numbers', 'Taking Away', 'Times Tables 6, 7 and 8',
    'Sharing and Dividing', 'Fractions of Shapes', 'Measuring', 'Shapes Around Us', 'Puzzle Pages']],
  ['Story Makers', 'G. Adeyemi', subjects.literacy, 'primary', '#db2777',
   'Building sentences into stories, with word banks and picture prompts.',
   ['Sentences That Work', 'Describing People', 'Describing Places', 'Beginnings', 'Middles', 'Endings',
    'Speech Marks', 'Editing Together', 'Read Aloud Pages']],
  ['My First Shapes and Colours', 'M. Lin', subjects.play, 'nursery', '#f59e0b',
   'Big pictures, few words. Made to be read aloud together.',
   ['Red', 'Blue', 'Yellow', 'Circles', 'Squares', 'Triangles', 'Big and Small', 'Counting to Five']],
];

const LOREM = (heading) =>
  `${heading} is one of the ideas we return to again and again this year. Start by reading the short explanation below, ` +
  `then try the two questions at the end of the page.\n\n` +
  `The key point is this: once you can recognise the pattern, the rest follows. Look carefully at each worked example ` +
  `and notice what stays the same and what changes. If a step is unclear, use the read-aloud button at the top of the ` +
  `page and follow along with the highlighting.\n\n` +
  `Worked example. Read it once through without writing anything. Then read it a second time and copy each line into ` +
  `your notebook as you go. Working through it twice is far more useful than reading it five times.\n\n` +
  `Try it yourself.\n1. Write down what you already know about ${heading.toLowerCase()}.\n` +
  `2. Complete the practice set on the next page, then check your answers at the back of the book.\n\n` +
  `Remember: it is completely normal for this to take more than one attempt. Ask your teacher through the portal if ` +
  `you get stuck, and use the Catch-Up Hub if you missed the lesson where we covered it.`;

for (const [title, author, subjectId, section, colour, description, chapters] of BOOKS) {
  const bookId = addBook.run(title, author, subjectId, section, colour, description, chapters.length).lastInsertRowid;
  chapters.forEach((heading, i) => addPage.run(bookId, i + 1, heading, LOREM(heading)));
}

/* ── Fees ─────────────────────────────────────────────────────────────────── */
console.log('Issuing invoices…');
const addInvoice = db.prepare(
  'INSERT INTO invoices (invoice_no, student_id, term, description, amount, due_date, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
const addItem = db.prepare('INSERT INTO invoice_items (invoice_id, label, amount) VALUES (?, ?, ?)');
const addPayment = db.prepare('INSERT INTO payments (invoice_id, receipt_no, amount, method, reference, paid_by) VALUES (?, ?, ?, ?, ?, ?)');

const FEES = { nursery2: 1450, primary4: 1850, grade9: 2400 };
let invoiceSeq = 0;
for (const p of ROSTER) {
  const s = students[p.code];
  const base = FEES[p.klass];

  const paidInvoice = addInvoice.run(`INV-2026-${String(++invoiceSeq).padStart(4, '0')}`, s.id, 'Term 1 2026/27',
    'Tuition, materials and lunch', base, iso(daysAgo(20)), 'paid', admin).lastInsertRowid;
  addItem.run(paidInvoice, 'Tuition', base * 0.8);
  addItem.run(paidInvoice, 'Learning materials', base * 0.1);
  addItem.run(paidInvoice, 'Lunch programme', base * 0.1);
  addPayment.run(paidInvoice, `RCP-${String(invoiceSeq).padStart(5, '0')}A`, base, 'card',
    `CARD-${Math.random().toString(36).slice(2, 10).toUpperCase()}`, s.parentId);

  const openInvoice = addInvoice.run(`INV-2026-${String(++invoiceSeq).padStart(4, '0')}`, s.id, 'Term 2 2026/27',
    'Tuition, materials and lunch', base, iso(daysAhead(12)), 'unpaid', admin).lastInsertRowid;
  addItem.run(openInvoice, 'Tuition', base * 0.8);
  addItem.run(openInvoice, 'Learning materials', base * 0.1);
  addItem.run(openInvoice, 'Lunch programme', base * 0.1);
}

// One partially-paid invoice so the parent view shows a balance.
const partial = db.prepare("SELECT id, amount FROM invoices WHERE student_id = ? AND status='unpaid'").get(students['STU-1005'].id);
addPayment.run(partial.id, 'RCP-PARTIAL1', Math.round(partial.amount / 2), 'transfer', 'TRF-8H2K9QW1', students['STU-1005'].parentId);
db.prepare("UPDATE invoices SET status='partial' WHERE id = ?").run(partial.id);

// The fees above went in as records; the books have to agree with them. Each
// invoice raises a debt and earns income, each receipt banks money and settles
// the debt, exactly as the API posts them when a school does this for real.
for (const invoice of db.prepare('SELECT * FROM invoices').all()) {
  const journalId = postJournal({
    date: invoice.issued_on, memo: `${invoice.invoice_no}: ${invoice.description}`,
    source: 'invoice', sourceId: invoice.id, user: bursar,
    lines: [
      { account_role: 'receivable', debit: invoice.amount, student_id: invoice.student_id },
      { account_role: 'fee_income', credit: invoice.amount, student_id: invoice.student_id },
    ],
  });
  db.prepare('UPDATE invoices SET journal_id = ? WHERE id = ?').run(journalId, invoice.id);
}

for (const payment of db.prepare('SELECT p.*, i.student_id, i.invoice_no FROM payments p JOIN invoices i ON i.id = p.invoice_id').all()) {
  const into = accountByRole(payment.method === 'cash' ? 'cash' : 'bank');
  const journalId = postJournal({
    date: payment.paid_at.slice(0, 10), memo: `${payment.receipt_no}: payment against ${payment.invoice_no}`,
    source: 'payment', sourceId: payment.id, user: bursar,
    lines: [
      { account_id: into.id, debit: payment.amount, student_id: payment.student_id },
      { account_role: 'receivable', credit: payment.amount, student_id: payment.student_id },
    ],
  });
  db.prepare('UPDATE payments SET journal_id = ?, account_id = ? WHERE id = ?').run(journalId, into.id, payment.id);
}

/* ── Announcements & feedback ─────────────────────────────────────────────── */
const addAnnouncement = db.prepare('INSERT INTO announcements (title, body, audience, pinned, created_by) VALUES (?, ?, ?, ?, ?)');
addAnnouncement.run('Accessibility toolbar now live for everyone',
  'Every page now carries the accessibility toolbar. Choose your font, tint, text size and reading options, then save them as your default preset. The settings follow you on phone, tablet and desktop.',
  'all', 1, senco);
addAnnouncement.run('Catch-Up Hub materials within 24 hours',
  'Teachers now publish lesson recaps within a day of each lesson. If your child was absent the materials appear automatically in their Catch-Up Hub.',
  'all', 1, admin);
addAnnouncement.run('Term 2 invoices issued', 'Term 2 invoices are now available in the fees section. Payment is due within two weeks.', 'parents', 0, admin);
addAnnouncement.run('Reminder: publish your lesson recaps', 'Please attach notes and a summary to each lesson so absent students are not left behind.', 'teachers', 0, admin);

const addFeedback = db.prepare(
  'INSERT INTO teacher_feedback (teacher_id, student_id, class_subject_id, rating, clarity, support, comment, is_anonymous) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
// Written by guardians about their child's teachers.
addFeedback.run(teachers.maths, students['STU-1003'].id, cs.g9maths, 5, 5, 4, 'The worked examples she brings home are really clear. More of those please.', 1);
addFeedback.run(teachers.maths, students['STU-1005'].id, cs.g9maths, 4, 3, 5, 'She understands far better when the numbers are colour-coded.', 1);
addFeedback.run(teachers.history, students['STU-3004'].id, cs.g9history, 5, 5, 5, 'Being able to submit audio made an enormous difference to our son.', 0);
addFeedback.run(teachers.english, students['STU-1002'].id, cs.g9english, 5, 4, 5, 'Thank you for letting her use the reading toolbar in class.', 1);

/* ── Notifications ────────────────────────────────────────────────────────── */
const addNotification = db.prepare('INSERT INTO notifications (user_id, title, body, kind, link) VALUES (?, ?, ?, ?, ?)');
addNotification.run(students['STU-1002'].userId, 'Catch-Up Hub: 3 lessons waiting', 'Mathematics, English and Mathematics again.', 'catchup', '/student/catch-up');
addNotification.run(students['STU-3004'].userId, 'Extra time confirmed', 'Your timed assessments now run at 1.5×.', 'info', '/student/assignments');
addNotification.run(teachers.history, 'New audio submission', 'Alex Jordan submitted "History Impact Essay".', 'submission', '/teacher/assignments');
addNotification.run(students['STU-1002'].parentId, 'Term 2 invoice issued', 'Due in 12 days.', 'invoice', '/parent/fees');


/* ── Branding & public website ────────────────────────────────────────────── */
console.log('Configuring branding and the public website...');

db.prepare(
  `INSERT INTO school_settings
     (id, name, short_name, tagline, monogram, favicon_emoji, brand_primary, brand_accent,
      heading_font, established_year, address, phone, email, office_hours, map_embed_url,
      facebook_url, instagram_url, academic_year, currency, admissions_open,
      tours_open, whatsapp_number, whatsapp_message,
      campaign_enabled, campaign_label, campaign_slug, campaign_target_date)
   VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1,
           1, ?, ?, 0, ?, ?, ?)`
).run(
  'Northgate Academy', 'Northgate',
  'A school where every child is given the tools to learn in the way that works for them.',
  'N', '\u{1F393}', '#2563eb', '#7c3aed', 'Inter', '1998',
  '14 Rosewood Avenue, Springfield, SP2 4QL',
  '+1 555 0100', 'hello@northgate.demo',
  'Monday to Friday, 08:00 to 16:30',
  null,
  'https://facebook.com/', 'https://instagram.com/',
  '2026/2027', 'USD',
  '+15550100', 'Hello, I would like to ask about admissions.',
  null, 'campaign', null
);

const addContent = db.prepare(
  `INSERT INTO site_content (page, slot, heading, body, media_url, extra, sort_order)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

const CONTENT = [
  ['home', 'hero',
   'Every child learns differently. Our school is built around that.',
   'Nursery, primary and secondary education in one connected community, with accessibility and individual support designed in from the start rather than added on later.',
   null,
   { primary_cta: 'Book a tour', secondary_cta: 'Apply now',
     eyebrow: 'Nursery, primary and secondary' }, 0],

  ['home', 'pillars', 'What makes us different', null, null,
   [{ icon: 'accessibility', title: 'Accessibility as standard',
      body: 'Dyslexia, ADHD, autism and dyscalculia support is built into every screen and every classroom, not reserved for a separate programme.' },
    { icon: 'catchup', title: 'Nobody falls behind',
      body: 'Miss a lesson and the recording, notes and summary are waiting for you the same day. Illness should not cost a term of progress.' },
    { icon: 'message', title: 'Parents in the loop',
      body: 'Message your child’s teacher directly, in your own language, and see attendance, grades and daily updates as they happen.' }], 2],

  ['home', 'quote',
   'My son went from dreading school to asking to go in early. The difference was being allowed to record his answers instead of writing them.',
   null, null, { author: 'Parent of a Year 9 pupil' }, 3],

  ['about', 'hero', 'About our school',
   'Founded in 1998 by a group of teachers and parents who believed a mainstream school could properly serve children who learn differently. Nearly thirty years on, that is still the whole idea.',
   null, null, 0],

  ['about', 'values', 'What we stand for', null, null,
   [{ title: 'Every child, specifically',
      body: 'We plan for the child in front of us. Support plans are practical documents staff act on daily, not paperwork filed once a year.' },
    { title: 'Honest with families',
      body: 'You will hear from us when things go well and when they do not. No surprises at parents’ evening.' },
    { title: 'Calm and predictable',
      body: 'Consistent routines, clear expectations and advance notice of change. Predictability is a form of kindness.' },
    { title: 'High expectations for all',
      body: 'Adjusting how a child shows what they know is not lowering the bar. We expect a great deal of every pupil.' }], 1],

  ['about', 'leadership', 'Leadership team', null, null,
   [{ name: 'Amara Okonkwo', role: 'Head of School', bio: 'Twenty years in inclusive education, previously deputy head at two large comprehensives.' },
    { name: 'Priya Raman', role: 'SENCO', bio: 'National SENCO Award. Leads our support planning and staff training on accessible teaching.' },
    { name: 'David Mensah', role: 'Head of Secondary', bio: 'Mathematics specialist with a focus on making abstract concepts concrete.' }], 2],

  ['admissions', 'hero', 'Admissions',
   'We admit pupils throughout the year wherever we have space. The process is deliberately straightforward, and you will always speak to a person.',
   null, null, 0],

  ['admissions', 'steps', 'How it works', null, null,
   [{ step: '1', title: 'Get in touch', body: 'Send the form on this page or call the office. We will reply within two working days.' },
    { step: '2', title: 'Come and look round', body: 'Visit during a normal school day, not a staged open evening. Bring your child.' },
    { step: '3', title: 'Tell us about your child', body: 'A conversation about how they learn, what helps, and anything that has not worked elsewhere.' },
    { step: '4', title: 'Offer and settling in', body: 'We confirm a place, agree a support plan if one is needed, and arrange taster days.' }], 1],

  ['admissions', 'fees', 'Fees', null, null,
   [{ section: 'Nursery', term: '$1,450 per term', note: 'Includes lunch and all materials' },
    { section: 'Primary', term: '$1,850 per term', note: 'Includes lunch, materials and trips' },
    { section: 'Secondary', term: '$2,400 per term', note: 'Includes lunch, materials and exam fees' }], 2],

// ── Home ──
  ['home', 'ctas', null, null, null,
   { primary: { label: 'Book a school tour', href: '/admissions#tour' },
     secondary: { label: 'Apply now', href: '/admissions#apply' },
     persistent: { label: 'WhatsApp admissions', channel: 'whatsapp' } }, 4],

  // ── About ──
  ['about', 'key_messages', 'What we are known for', null, null,
   [{ title: 'A structured curriculum', body: 'A clear, sequenced programme from nursery to secondary, so nothing is left to chance.' },
    { title: 'Pastoral care', body: 'Every child has a named adult who knows them, and a form group that stays together.' },
    { title: 'Future ready', body: 'Digital literacy, spoken confidence and independent study built into ordinary lessons.' },
    { title: 'Safe and nurturing', body: 'Small classes, calm routines and a safeguarding team that families can name.' }], 1],

  ['about', 'accreditations', 'Accreditation and membership', 'What these mean for your family, in plain terms.', null,
   [{ name: 'Independent Schools Inspectorate', short: 'ISI',
      body: 'Inspected against national standards for education, welfare and safeguarding. Reports are public.' },
    { name: 'Council of British International Schools', short: 'COBIS',
      body: 'Membership requires meeting agreed standards for teaching, safeguarding and governance, checked periodically.' },
    { name: 'Examination board centre status', short: 'Exams',
      body: 'A registered examination centre, so pupils sit their public examinations here rather than travelling.' }], 3],

  // ── Learning ──
  ['learning', 'hero', 'Learning',
   'Every stage has a purpose. Children can join at any point and stay through to the end of secondary, without ever having to start again somewhere new.',
   null, null, 0],

  ['learning', 'stages', 'Every stage has a purpose', null, null,
   [{ key: 'nursery', title: 'Early Years', ages: 'Ages 2 to 4',
      body: 'A warm, stimulating start that develops confidence, curiosity and a love of learning.',
      points: ['A key worker for every child', 'Daily activity timeline for parents', 'Early phonics and number play', 'Settling-in visits before starting'] },
    { key: 'primary', title: 'Primary', ages: 'Ages 5 to 11',
      body: 'Strong foundations in literacy, numeracy, science and the wider world, with room to explore.',
      points: ['Average class size of 18', 'Daily reading with an adult', 'Specialist teaching from Year 4', 'Weekly outdoor learning'] },
    { key: 'secondary', title: 'Secondary', ages: 'Ages 11 to 16',
      body: 'Subject specialists throughout, with assessment arrangements matched to each pupil support plan.',
      points: ['Full curriculum to public examinations', 'Extra time and reader arrangements', 'Coursework in audio or video where approved', 'Careers guidance from Year 9'] }], 1],

  ['learning', 'beyond', 'Beyond the classroom',
   'Sport, arts, clubs, leadership and community experiences help children discover what they are good at, which is rarely the thing on the timetable.',
   null,
   [{ title: 'Sport', body: 'Weekly fixtures, inclusive teams and a games programme that does not drop the least confident.' },
    { title: 'Arts and music', body: 'Instrumental tuition, choir, drama and an annual production every child can be part of.' },
    { title: 'Clubs and societies', body: 'Coding, debating, chess, gardening and more, refreshed each term on pupil request.' },
    { title: 'Leadership and service', body: 'School council, peer mentoring and community projects with real responsibility.' }], 2],

  ['learning', 'support', 'Support for different learners',
   'Around one in five of our pupils has an agreed support plan. Those plans are practical documents staff act on daily, not paperwork filed once a year.',
   null, null, 3],

  // ── Why us ──
  ['why', 'hero', 'Why families choose us',
   'The honest version: what actually makes the experience here different from the school down the road.',
   null, null, 0],

  ['why', 'reasons', null, null, null,
   [{ icon: 'shield', title: 'Recognised standards',
      body: 'Inspected and accredited against published national standards, with reports families can read in full rather than take on trust.' },
    { icon: 'users', title: 'Exceptional people',
      body: 'Teachers stay. Retention runs above ninety percent, which means your child is taught by people who know them and each other.' },
    { icon: 'heart', title: 'Whole-child development',
      body: 'Academic achievement alongside character, confidence, creativity and wellbeing, with none of the four treated as optional.' },
    { icon: 'home', title: 'Purposeful facilities',
      body: 'Spaces built for how children actually learn: room for collaboration, quiet, movement and mess.' },
    { icon: 'accessibility', title: 'Accessibility as standard',
      body: 'Support for dyslexia, ADHD, autism and dyscalculia built into every lesson and every screen, not run as a separate programme.' },
    { icon: 'star', title: 'A lasting community',
      body: 'Families stay connected long after their children leave, and alumni come back to teach, speak and mentor.' }], 1],

  ['why', 'safeguarding_summary', 'Safeguarding comes first',
   'Every adult on site is checked and trained. Our designated safeguarding lead is named on the safeguarding page along with what to do if you are worried about any child, whether or not they attend this school.',
   null, null, 2],

  // ── Community ──
  ['community', 'hero', 'Community and people',
   'Parents choose people, not buildings. These are the people your child will spend their days with.',
   null, null, 0],

  ['community', 'teachers', 'Meet our teachers',
   'Our teaching staff are subject specialists who stay for years, not terms. Many trained here or returned after teaching elsewhere.',
   null, null, 1],

  ['community', 'testimonials', 'Hear from our parents', null, null,
   [{ quote: 'We wanted a school where our child would be challenged academically but still feel known, supported and confident. That is what we found.',
      author: 'Parent of a Year 7 pupil', since: 'Joined 2023' },
    { quote: 'My son went from dreading school to asking to go in early. The difference was being allowed to record his answers instead of writing them.',
      author: 'Parent of a Year 9 pupil', since: 'Joined 2021' },
    { quote: 'The daily updates in the nursery years meant we never felt out of the loop, even on the days we could not do drop-off ourselves.',
      author: 'Parent of a nursery child', since: 'Joined 2025' }], 2],

  ['community', 'alumni', 'Where are they now?',
   'Twenty years of leavers, and a good number of them still around.',
   null,
   [{ name: 'Adaeze O.', left: 'Class of 2014', now: 'Paediatric registrar',
      quote: 'The teachers here were the first people who told me medicine was a realistic thing to want.' },
    { name: 'Thomas R.', left: 'Class of 2016', now: 'Structural engineer',
      quote: 'I was the child who could not sit still. They found ways to teach me anyway.' },
    { name: 'Priya S.', left: 'Class of 2011', now: 'Teacher, and now a parent here',
      quote: 'I send my own daughter here. That is the whole review, really.' }], 3],

  // ── Admissions ──
  ['admissions', 'journey', 'How families usually get here', null, null,
   [{ step: 'Discover', body: 'Read about the school, the stages and how we teach.' },
    { step: 'Build trust', body: 'Look at our inspection reports, safeguarding and accreditation.' },
    { step: 'See the difference', body: 'Understand what actually sets the experience apart.' },
    { step: 'Hear from parents', body: 'Read what current families say, unedited.' },
    { step: 'Book a tour', body: 'Visit on a normal school day and bring your child.' },
    { step: 'Apply', body: 'Submit an application and agree any support arrangements.' }], 1],

  // ── Safeguarding ──
  ['safeguarding', 'hero', 'Safeguarding',
   'Every child has the right to be safe. This page sets out who is responsible, how to raise a concern, and what happens next. It applies whether or not the child attends this school.',
   null, null, 0],

  ['safeguarding', 'contacts', 'Who to contact', null, null,
   [{ role: 'Designated Safeguarding Lead', name: 'Named in the school office', detail: 'First point of contact for any concern about a child.' },
    { role: 'Deputy Safeguarding Lead', name: 'Named in the school office', detail: 'Available when the lead is not on site.' },
    { role: 'Safeguarding Governor', name: 'Named in the school office', detail: 'Provides independent oversight of safeguarding practice.' }], 1],

  ['safeguarding', 'commitments', 'What we do', null, null,
   [{ title: 'Every adult is checked', body: 'All staff, governors and regular volunteers are background checked before they start, and records are audited.' },
    { title: 'Everyone is trained', body: 'Safeguarding training on induction and refreshed annually, with the leads trained to a higher level.' },
    { title: 'Concerns are recorded', body: 'Every concern is logged, however small, so that patterns are visible rather than lost.' },
    { title: 'Children are taught to speak up', body: 'Pupils learn who they can talk to and what will happen if they do.' }], 2],

  ['safeguarding', 'raise', 'If you are worried about a child',
   'Contact the school office and ask for the Designated Safeguarding Lead. If a child is in immediate danger, contact the emergency services first, then tell us. You do not need to be certain to raise a concern, and you will never be criticised for raising one that turns out to be nothing.',
   null, null, 3],

  // ── FAQs ──
  ['faqs', 'hero', 'Frequently asked questions',
   'The questions families actually ask us. If yours is not here, the office will answer it directly.',
   null, null, 0],

  ['faqs', 'items', null, null, null,
   [{ category: 'Admissions', q: 'When can my child join?',
      a: 'At any point in the year where we have space. Most families join in September, but mid-year moves are common and we plan for them.' },
    { category: 'Admissions', q: 'Is there an entrance examination?',
      a: 'No. We ask for a conversation, a taster day and the reports from your current school.' },
    { category: 'Admissions', q: 'Do you have a waiting list?',
      a: 'For some year groups. The office will tell you honestly where you stand rather than keeping you hoping.' },
    { category: 'Fees', q: 'How are fees paid?',
      a: 'Once a term through the parent portal, by card, transfer or mobile wallet. Instalments can be arranged.' },
    { category: 'Fees', q: 'Are bursaries available?',
      a: 'Yes, means tested. Ask the office. Applying for one does not affect an admissions decision.' },
    { category: 'Fees', q: 'What is included?',
      a: 'Tuition, lunch, materials and most trips. Instrumental tuition and residential trips are charged separately.' },
    { category: 'Support', q: 'My child has a diagnosis. Should I tell you?',
      a: 'Yes, and it does not count against an application. Knowing early means arrangements are in place from day one rather than three months in.' },
    { category: 'Support', q: 'What support is available in examinations?',
      a: 'Extra time, readers, scribes, rest breaks and alternative formats where there is an agreed plan and evidence of normal way of working.' },
    { category: 'Daily life', q: 'What are the school hours?',
      a: 'The taught day runs from 08:30 to 15:30, with wraparound care available from 07:30 and until 18:00.' },
    { category: 'Daily life', q: 'What happens if my child is absent?',
      a: 'Report it through the parent portal. Lesson recordings, notes and summaries appear automatically in their Catch-Up Hub the same day.' }], 1],

  // ── Policies ──
  ['privacy', 'hero', 'Privacy notice',
   'How we collect, use and protect personal information about pupils, families and staff.',
   null, null, 0],

  ['privacy', 'body', null,
   'We collect only the information we need to educate and care for your child: contact details, academic records, attendance, health and dietary information, and any agreed support arrangements.\n\nWe use it to provide education and pastoral care, to meet our legal and safeguarding duties, and to communicate with you. We do not sell it, and we do not share it with third parties for marketing.\n\nWe share information with local authorities and examination boards where the law requires it, and with medical services in an emergency. Records are retained for the periods set out in our retention schedule and then securely destroyed.\n\nYou have the right to see the information we hold about your child, to have inaccuracies corrected, and to object to certain uses. Contact the school office to make a request. If you are not satisfied with our response you may complain to the relevant data protection authority.',
   null, null, 1],

  ['terms', 'hero', 'Terms of use',
   'The terms on which this website and the family portal are provided.',
   null, null, 0],

  ['terms', 'body', null,
   'This website is provided for information about the school. We take care to keep it accurate but it does not form part of any contract, and fees, dates and arrangements may change.\n\nThe family portal is for the use of enrolled families, pupils and staff. Accounts are personal and must not be shared. You are responsible for keeping your password confidential and for activity under your account.\n\nContent you submit through the portal, including coursework and messages, remains yours. You grant the school permission to use it for the purposes of education, assessment and safeguarding.\n\nWe monitor use of the portal to keep it secure and to meet our safeguarding duties. Misuse may result in access being withdrawn.',
   null, null, 1],

  ['contact', 'hero', 'Contact us',
   'The school office is open through the school day and someone will always pick up. For anything urgent about a child already with us, please call rather than email.',
   null, null, 0],
];

for (const [page, slot, heading, body, media, extra, order] of CONTENT) {
  addContent.run(page, slot, heading, body, media, extra == null ? null : JSON.stringify(extra), order);
}

const addPost = db.prepare(
  `INSERT INTO news_posts (title, slug, excerpt, body, category, cover_colour, published_at, author_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const POSTS = [
  ['Accessibility toolbar now live across the school', 'accessibility-toolbar-live',
   'Every pupil can now set their own font, colour tint and reading options, and those settings follow them onto any device.',
   'From this week every page of the pupil and parent portal carries an accessibility toolbar.\n\nPupils can choose OpenDyslexic or Lexend, set a background tint, turn on Bionic Reading, enlarge text, switch on captions by default and have any page read aloud. Once saved, the preset follows them onto any device they sign in from.\n\nThis came directly out of conversations with pupils in Years 8 and 9, several of whom had been quietly changing their browser settings every lesson. It should not have taken us as long as it did.',
   'news', '#7c3aed', 3, senco],
  ['Catch-Up Hub: no pupil loses a lesson to illness', 'catch-up-hub-launch',
   'Miss a lesson and the recording, teacher notes and a summary are waiting in your hub the same day.',
   'When a pupil is marked absent, the system now automatically assembles everything they missed into one place.\n\nThat means the lesson recording with searchable captions, the teacher’s notes, a written summary and any handouts. Pupils can jump straight to the part of the lesson they need by clicking a line in the transcript.\n\nTeachers publish a recap within a day of each lesson. Parents can see the same materials from their own portal.',
   'news', '#2563eb', 9, admin],
  ['Autumn term dates and the half-term break', 'autumn-term-dates',
   'Term dates, the half-term break and this year’s inset days are now confirmed.',
   'The autumn term runs to mid-December, with a week-long half-term break in the last week of October.\n\nThere are two inset days when school is closed to pupils. Both are listed on the school calendar in the portal, and families will get a reminder a fortnight before each one.',
   'notice', '#059669', 16, admin],
  ['Year 9 science trip to the City Science Museum', 'year-9-science-museum-trip',
   'A full-day visit built around the forces and energy unit, with consent forms now in the parent portal.',
   'Year 9 will visit the City Science Museum next month as part of the forces and energy unit.\n\nCoaches leave at 08:15 and return by 16:00. Pupils need a packed lunch and should wear school uniform with comfortable shoes. The cost is $18, payable through the parent portal.\n\nConsent forms are in the portal under Permission Slips and can be signed digitally in under a minute.',
   'event', '#d97706', 22, admin],
];
for (const [title, slug, excerpt, body, category, colour, ago, author] of POSTS) {
  addPost.run(title, slug, excerpt, body, category, colour, daysAgo(ago).toISOString(), author);
}

const addEnquiry = db.prepare(
  `INSERT INTO admissions_enquiries
     (kind, parent_name, email, phone, child_name, child_dob, section, entry_year, message, sen_notes, status, source_page, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
addEnquiry.run('application', 'Tomiwa Adebayo', 't.adebayo@example.com', '+1 555 0311',
  'Simi Adebayo', '2015-06-14', 'primary', '2026/2027',
  'We are moving into the area in August and would like to visit before we decide.',
  'Simi has a diagnosis of dyslexia and currently gets extra time in tests.',
  'new', '/admissions', daysAgo(1).toISOString());
addEnquiry.run('enquiry', 'Hannah Whitmore', 'h.whitmore@example.com', '+1 555 0312',
  null, null, 'secondary', null,
  'Do you have space in Year 8 for January, and is there a waiting list?',
  null, 'contacted', '/contact', daysAgo(4).toISOString());
addEnquiry.run('application', 'Marcus Reid', 'm.reid@example.com', '+1 555 0313',
  'Ella Reid', '2022-11-03', 'nursery', '2026/2027',
  'Looking for three full days a week starting in September.',
  null, 'offer_made', '/admissions', daysAgo(9).toISOString());

/* ── Staff leave ──────────────────────────────────────────────────────────── */
console.log('Recording staff leave...');
const addStaffLeave = db.prepare(
  `INSERT INTO staff_leave (user_id, leave_type, start_date, end_date, working_days, reason, cover_notes, status, reviewed_by, reviewed_at, leave_year)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const leaveYear = (() => {
  const d = new Date();
  const start = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${start}/${String(start + 1).slice(2)}`;
})();

// Entitlements differ by role, as they do in a real school.
db.prepare('UPDATE staff SET annual_leave_days = ? WHERE user_id = ?').run(30, admin);
db.prepare('UPDATE staff SET annual_leave_days = ? WHERE user_id = ?').run(28, senco);

const STAFF_LEAVE = [
  [teachers.maths, 'annual', 40, 36, 4, 'Half-term break, family visit.', 'Cover arranged with Ms Whitfield.', 'approved'],
  [teachers.maths, 'sick', 22, 22, 1, 'Migraine.', 'Cover supervisor took the lessons.', 'approved'],
  [teachers.maths, 'annual', -21, -17, 5, 'Booked holiday.', 'Cover to be arranged.', 'pending'],
  [teachers.english, 'annual', 30, 26, 5, 'Spring break.', 'Cover arranged.', 'approved'],
  [teachers.english, 'training', 12, 12, 1, 'Literacy moderation day.', 'Class merged for the day.', 'approved'],
  [teachers.science, 'annual', -10, -8, 3, 'Family wedding.', 'Cover to be arranged.', 'pending'],
  [teachers.history, 'compassionate', 55, 51, 5, 'Family bereavement.', 'Cover arranged by the office.', 'approved'],
  [teachers.nursery, 'annual', 18, 14, 5, 'Annual leave.', 'Key worker cover in place.', 'approved'],
];
for (const [userId, type, agoStart, agoEnd, days, reason, cover, status] of STAFF_LEAVE) {
  // Negative values mean future dates. Order them so the start is always first,
  // whichever direction they run in.
  const at = (n) => iso(n >= 0 ? daysAgo(n) : daysAhead(-n));
  const [from, to] = [at(agoStart), at(agoEnd)].sort();
  addStaffLeave.run(
    userId, type, from, to,
    days, reason, cover, status,
    status === 'approved' ? admin : null,
    status === 'approved' ? daysAgo(agoStart + 5).toISOString() : null,
    leaveYear
  );
}

/* ── Pupil sign-in codes ──────────────────────────────────────────────────── */
console.log('Issuing pupil sign-in codes...');
const demoCodes = {};
for (const code of ['STU-1003', 'STU-3004', 'STU-1002', 'STU-2001', 'STU-2002']) {
  demoCodes[code] = issueCode(students[code].userId, admin, 24 * 365).code;
}

/* ── Done ─────────────────────────────────────────────────────────────────── */
const counts = {
  users: db.prepare('SELECT COUNT(*) n FROM users').get().n,
  students: db.prepare('SELECT COUNT(*) n FROM students').get().n,
  attendance: db.prepare('SELECT COUNT(*) n FROM attendance').get().n,
  catchup: db.prepare('SELECT COUNT(*) n FROM catchup_entries').get().n,
  assignments: db.prepare('SELECT COUNT(*) n FROM assignments').get().n,
  invoices: db.prepare('SELECT COUNT(*) n FROM invoices').get().n,
  textbook_pages: db.prepare('SELECT COUNT(*) n FROM textbook_pages').get().n,
  site_blocks: db.prepare('SELECT COUNT(*) n FROM site_content').get().n,
  news_posts: db.prepare('SELECT COUNT(*) n FROM news_posts').get().n,
  enquiries: db.prepare('SELECT COUNT(*) n FROM admissions_enquiries').get().n,
};

console.log('\n  Seed complete.', counts);
console.log(`
  Staff and guardian accounts. Password for all: ${PW}

    Admin (Head of School)   admin@school.demo
    SENCO                    senco@school.demo
    Teacher (Maths)          d.mensah@school.demo
    Teacher (History)        e.rossi@school.demo
    Teacher (Nursery)        m.lin@school.demo
  Pupils sign in with a CODE, not a password. Use these on the "I am a pupil" tab:

    ${demoCodes['STU-1003']}   Chloe Nakamura   Grade 9, no support plan
    ${demoCodes['STU-3004']}   Alex Jordan      Grade 9, 1.5x time, multi-format
    ${demoCodes['STU-1002']}   Maya Thompson    Grade 9, dyslexia preset
    ${demoCodes['STU-2001']}   Lily Chen        Primary 4, no support plan
    ${demoCodes['STU-2002']}   Noah Adeyemi     Primary 4, ADHD preset
    Parent                   m.jordan@family.demo    Alex's father (French locale)
    Parent                   y.nakamura@family.demo  Two children
`);

fs.writeFileSync(
  path.join(__dirname, '../../data/DEMO_ACCOUNTS.md'),
  `# Demo accounts\n\nPassword for every account: \`${PW}\`\n\n` +
  db.prepare("SELECT role, email, first_name, last_name FROM users ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'teacher' THEN 2 WHEN 'student' THEN 3 ELSE 4 END, email")
    .all().map((u) => `- **${u.role}**: \`${u.email}\` (${u.first_name} ${u.last_name})`).join('\n') + '\n'
);
