import { Router } from 'express';
import { db, audit, notify } from '../db/index.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { requirePermission } from '../lib/permissions.js';

const r = Router();
r.use(authenticate);

const TYPES = ['annual', 'sick', 'compassionate', 'training', 'parental', 'unpaid'];

/**
 * The leave year runs with the school year rather than the calendar, so a
 * September start does not land mid-entitlement.
 */
function leaveYearOf(date = new Date()) {
  const d = new Date(date);
  const start = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1; // August onward
  return `${start}/${String(start + 1).slice(2)}`;
}

/** Working days between two dates, weekends excluded. */
function workingDays(start, end) {
  const from = new Date(`${start}T00:00:00`);
  const to = new Date(`${end}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return 0;
  let days = 0;
  for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days += 1;
  }
  return days;
}

/**
 * What a member of staff has left.
 *
 * Only annual leave draws down the entitlement. Sick, compassionate, training
 * and parental leave are tracked so the school can see them, but counting them
 * against a holiday allowance would be wrong.
 */
function balanceFor(userId, year = leaveYearOf()) {
  const staff = db.prepare('SELECT annual_leave_days FROM staff WHERE user_id = ?').get(userId);
  const entitlement = staff?.annual_leave_days ?? 25;

  const rows = db.prepare(
    `SELECT status, leave_type, COALESCE(SUM(working_days), 0) AS days
     FROM staff_leave WHERE user_id = ? AND leave_year = ?
     GROUP BY status, leave_type`
  ).all(userId, year);

  const sum = (status, type) => rows
    .filter((x) => x.status === status && (!type || x.leave_type === type))
    .reduce((n, x) => n + x.days, 0);

  const taken = sum('approved', 'annual');
  const booked = sum('pending', 'annual');

  return {
    leave_year: year,
    entitlement,
    taken,
    booked,
    remaining: Math.round((entitlement - taken - booked) * 10) / 10,
    sick_days: sum('approved', 'sick'),
    other_days: ['compassionate', 'training', 'parental', 'unpaid']
      .reduce((n, t) => n + sum('approved', t), 0),
  };
}

r.get('/balance', requireRole('teacher', 'admin'), (req, res) => {
  const userId = req.query.userId && req.user.role === 'admin' ? Number(req.query.userId) : req.user.id;
  res.json(balanceFor(userId, req.query.year ?? leaveYearOf()));
});

r.get('/', requireRole('teacher', 'admin'), (req, res) => {
  const mine = req.user.role === 'teacher' || req.query.mine === 'true';
  const rows = db.prepare(
    `SELECT sl.*, u.first_name, u.last_name, u.avatar_colour, u.avatar_url, u.avatar_emoji,
            st.title, st.department,
            rv.first_name || ' ' || rv.last_name AS reviewer
     FROM staff_leave sl
     JOIN users u ON u.id = sl.user_id
     LEFT JOIN staff st ON st.user_id = sl.user_id
     LEFT JOIN users rv ON rv.id = sl.reviewed_by
     ${mine ? 'WHERE sl.user_id = ?' : ''}
     ORDER BY CASE sl.status WHEN 'pending' THEN 0 ELSE 1 END, sl.start_date DESC`
  ).all(...(mine ? [req.user.id] : []));
  res.json(rows);
});

r.post('/', requireRole('teacher', 'admin'), (req, res) => {
  const b = req.body ?? {};
  const type = TYPES.includes(b.leave_type) ? b.leave_type : 'annual';

  if (!b.start_date || !b.end_date) return res.status(400).json({ error: 'Start and end dates are required' });
  if (b.end_date < b.start_date) return res.status(400).json({ error: 'The end date cannot be before the start date' });

  let days = workingDays(b.start_date, b.end_date);
  if (!days) return res.status(400).json({ error: 'That range contains no working days' });
  if (b.half_day && b.start_date === b.end_date) days = 0.5;

  const year = leaveYearOf(b.start_date);

  // Warn rather than block: staff sometimes need to go over and have it agreed.
  const balance = balanceFor(req.user.id, year);
  const exceeds = type === 'annual' && days > balance.remaining;

  const out = db.prepare(
    `INSERT INTO staff_leave (user_id, leave_type, start_date, end_date, working_days, half_day, reason, cover_notes, leave_year)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(req.user.id, type, b.start_date, b.end_date, days, b.half_day ? 1 : 0,
        b.reason ?? null, b.cover_notes ?? null, year);

  for (const approver of db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1").all()) {
    if (approver.id === req.user.id) continue;
    notify(approver.id, {
      title: 'Staff leave request',
      body: `${req.user.first_name} ${req.user.last_name}: ${days} day${days === 1 ? '' : 's'} from ${b.start_date}`,
      kind: 'leave', link: '/admin/staff-leave',
    });
  }

  audit({ user: req.user, action: 'staff_leave_request', entity: 'staff_leave', entityId: out.lastInsertRowid,
          next: { type, days, from: b.start_date, to: b.end_date }, ip: req.ip });

  res.status(201).json({
    ...db.prepare('SELECT * FROM staff_leave WHERE id = ?').get(out.lastInsertRowid),
    exceeds_balance: exceeds,
    balance: balanceFor(req.user.id, year),
  });
});

/** Staff may withdraw their own request while it is still undecided. */
r.post('/:id/cancel', requireRole('teacher', 'admin'), (req, res) => {
  const row = db.prepare('SELECT * FROM staff_leave WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Request not found' });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: 'That is not your request' });
  if (row.status !== 'pending') return res.status(409).json({ error: 'Only a pending request can be withdrawn' });

  db.prepare("UPDATE staff_leave SET status = 'cancelled' WHERE id = ?").run(row.id);
  res.json(db.prepare('SELECT * FROM staff_leave WHERE id = ?').get(row.id));
});

/** Approving staff leave is a leadership decision, as with pupil absence. */
r.post('/:id/decision', requirePermission('leave.decide'), (req, res) => {
  const row = db.prepare('SELECT * FROM staff_leave WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Request not found' });
  if (!['approved', 'rejected'].includes(req.body?.status)) {
    return res.status(400).json({ error: 'status must be "approved" or "rejected"' });
  }

  db.prepare(
    "UPDATE staff_leave SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_note = ? WHERE id = ?"
  ).run(req.body.status, req.user.id, req.body.review_note ?? null, row.id);

  notify(row.user_id, {
    title: `Leave request ${req.body.status}`,
    body: `${row.working_days} day${row.working_days === 1 ? '' : 's'} from ${row.start_date}`,
    kind: 'leave', link: '/teacher/my-leave',
  });

  audit({ user: req.user, action: 'staff_leave_decision', entity: 'staff_leave', entityId: row.id,
          prev: { status: row.status }, next: { status: req.body.status }, ip: req.ip });

  res.json({
    ...db.prepare('SELECT * FROM staff_leave WHERE id = ?').get(row.id),
    balance: balanceFor(row.user_id, row.leave_year),
  });
});

export default r;
