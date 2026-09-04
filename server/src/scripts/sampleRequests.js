/**
 * A week's worth of requests, so the queue can be seen doing its job.
 *
 * Sample data, written to whichever database SMS_DB_PATH points at. Everything
 * it creates is marked in its own text ("[sample]") so it can be taken out
 * again in one statement, printed at the end: a school trying the page out
 * should never have to pick demonstration rows out of its real ones by eye.
 *
 *   node src/scripts/sampleRequests.js            add them
 *   node src/scripts/sampleRequests.js --remove   take them away again
 */
// The same database the server runs on, which .env decides. Without this a
// script quietly seeds the demo school instead of the real one.
import 'dotenv/config';
import { db, migrate } from '../db/index.js';

migrate();

const MARK = '[sample]';

if (process.argv.includes('--remove')) {
  const gone = {
    pupil: db.prepare(`DELETE FROM leave_requests WHERE reason LIKE '%${MARK}'`).run().changes,
    staff: db.prepare(`DELETE FROM staff_leave WHERE reason LIKE '%${MARK}'`).run().changes,
    enquiries: db.prepare(`DELETE FROM admissions_enquiries WHERE message LIKE '%${MARK}'`).run().changes,
  };
  console.log(`Removed ${gone.pupil} pupil absences, ${gone.staff} staff leave requests, ${gone.enquiries} enquiries.`);
  process.exit(0);
}

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const pupils = db.prepare(
  `SELECT s.id, u.first_name, u.last_name FROM students s JOIN users u ON u.id = s.user_id
   WHERE s.status = 'active' ORDER BY RANDOM() LIMIT 6`
).all();
const office = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
const staff = db.prepare("SELECT id, first_name FROM users WHERE role IN ('teacher','admin') ORDER BY id").all();

if (!pupils.length || !office) {
  console.error('This school has no pupils yet. Enrol some first.');
  process.exit(1);
}

const absences = [
  ['medical', 'Hospital appointment for a hearing test', 3, 3],
  ['illness', 'Chickenpox, expected back after the weekend', -1, 2],
  ['family', 'Travelling for a grandparent’s funeral', 5, 8],
  ['religious', 'Observing Eid with family', 10, 10],
  ['other', 'Selected for the regional swimming trials', 14, 15],
];

const addAbsence = db.prepare(
  `INSERT INTO leave_requests (student_id, requested_by, start_date, end_date, reason, category, status)
   VALUES (?, ?, ?, ?, ?, ?, 'pending')`
);
let pupilCount = 0;
absences.forEach(([category, reason, from, to], i) => {
  const pupil = pupils[i % pupils.length];
  addAbsence.run(pupil.id, office.id, day(from), day(to), `${reason} ${MARK}`, category);
  pupilCount += 1;
});

const bookings = [
  ['annual', 'Half term break booked in advance', 21, 25, 5],
  ['training', 'Two-day safeguarding course', 7, 8, 2],
  ['compassionate', 'Family bereavement', 1, 2, 2],
];

const addLeave = db.prepare(
  `INSERT INTO staff_leave (user_id, leave_type, start_date, end_date, working_days, reason, cover_notes,
                            status, leave_year)
   VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
);
const leaveYear = `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`;
let staffCount = 0;
bookings.forEach(([type, reason, from, to, days], i) => {
  const person = staff[i % staff.length];
  if (!person) return;
  addLeave.run(person.id, type, day(from), day(to), days, `${reason} ${MARK}`,
               i === 1 ? 'Cover arranged with the year group' : null, leaveYear);
  staffCount += 1;
});

const enquiries = [
  ['application', 'Adaeze Okafor', 'a.okafor@family.example', 'Chidi Okafor',
   'We are moving into the area in January and would like to apply for a place.'],
  ['enquiry', 'Musa Bello', 'm.bello@family.example', 'Halima Bello',
   'Could you tell me what the fees are for Grade 4, and whether there is a bus?'],
  ['tour', 'Ngozi Umeh', 'n.umeh@family.example', 'Emeka Umeh',
   'We would love to visit before applying. Any morning next week would suit.'],
];

const addEnquiry = db.prepare(
  `INSERT INTO admissions_enquiries (kind, parent_name, email, phone, child_name, message, status)
   VALUES (?, ?, ?, ?, ?, ?, 'new')`
);
enquiries.forEach(([kind, parent, email, child, message]) => {
  addEnquiry.run(kind, parent, email, '+234 8090 000 0000', child, `${message} ${MARK}`);
});

console.log(`Added ${pupilCount} pupil absences, ${staffCount} staff leave requests, `
            + `${enquiries.length} admissions enquiries. All marked ${MARK}.`);
console.log('Take them away again with: node src/scripts/sampleRequests.js --remove');
