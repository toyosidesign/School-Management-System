import { Router } from 'express';
import { db, audit, notify } from '../db/index.js';
import { authenticate, requireRole, canAccessStudent } from '../lib/auth.js';
import { requirePermission, can } from '../lib/permissions.js';
import { IS_SEN } from '../lib/sen.js';
import { accountByRole, postJournal } from '../lib/ledger.js';

const r = Router();
r.use(authenticate);

/* ── Calendar ─────────────────────────────────────────────────────────────── */
r.get('/calendar', (req, res) => {
  const { from, to } = req.query;
  let classIds = [];
  if (req.user.role === 'student') classIds = [req.student?.class_id];
  if (req.user.role === 'parent') {
    classIds = db.prepare('SELECT s.class_id FROM guardianships g JOIN students s ON s.id = g.student_id WHERE g.parent_user_id = ?')
      .all(req.user.id).map((x) => x.class_id);
  }

  const where = ['1=1'];
  const args = [];
  if (from) { where.push('date(e.start_at) >= date(?)'); args.push(from); }
  if (to) { where.push('date(e.start_at) <= date(?)'); args.push(to); }
  if (classIds.length) {
    where.push(`(e.class_id IS NULL OR e.class_id IN (${classIds.map(() => '?').join(',')}))`);
    args.push(...classIds);
  }

  const events = db.prepare(
    `SELECT e.*, c.name AS class_name FROM calendar_events e
     LEFT JOIN classes c ON c.id = e.class_id
     WHERE ${where.join(' AND ')} ORDER BY e.start_at`
  ).all(...args);

  // Assignment deadlines surface on the calendar too.
  let deadlines = [];
  if (req.user.role === 'student') {
    deadlines = db.prepare(
      `SELECT a.id, a.title, a.due_at, sub.name AS subject, sub.colour
       FROM assignments a JOIN class_subjects cs ON cs.id = a.class_subject_id
       JOIN subjects sub ON sub.id = cs.subject_id WHERE cs.class_id = ?`
    ).all(req.student?.class_id ?? 0)
      .map((a) => ({
        id: `assign-${a.id}`, title: `${a.subject}: ${a.title}`, event_type: 'deadline',
        start_at: a.due_at, all_day: 0, description: 'Assignment due', colour: a.colour,
      }));
  }
  res.json([...events, ...deadlines].sort((a, b) => a.start_at.localeCompare(b.start_at)));
});

/**
 * Adds an event. Most of a school year is dated, not timed: term starts, an
 * inset day, a deadline. A date alone is enough, and an event given no time is
 * stored at the start of the day and marked as lasting all of it.
 */
r.post('/calendar', requireRole('admin', 'teacher'), (req, res) => {
  const b = req.body ?? {};
  if (!b.title || !b.start_at) return res.status(400).json({ error: 'A title and a date are required' });

  const dateOnly = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));
  const allDay = b.all_day === true || dateOnly(b.start_at);
  const startAt = dateOnly(b.start_at) ? `${b.start_at}T00:00:00.000Z` : b.start_at;
  const endAt = !b.end_at ? null : (dateOnly(b.end_at) ? `${b.end_at}T23:59:59.000Z` : b.end_at);

  if (endAt && new Date(endAt) < new Date(startAt)) {
    return res.status(400).json({ error: 'It cannot end before it starts' });
  }

  const out = db.prepare(
    'INSERT INTO calendar_events (title, description, event_type, start_at, end_at, all_day, location, section, class_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(b.title, b.description ?? null, b.event_type ?? 'general', startAt, endAt,
        allDay ? 1 : 0, b.location ?? null, b.section ?? null, b.class_id ?? null, req.user.id);
  audit({ user: req.user, action: 'create', entity: 'calendar_events', entityId: out.lastInsertRowid, next: b, ip: req.ip });
  res.status(201).json(db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(out.lastInsertRowid));
});

r.delete('/calendar/:id', requireRole('admin', 'teacher'), (req, res) => {
  const prev = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Event not found' });
  db.prepare('DELETE FROM calendar_events WHERE id = ?').run(req.params.id);
  audit({ user: req.user, action: 'delete', entity: 'calendar_events', entityId: prev.id, prev, ip: req.ip });
  res.json({ ok: true });
});

/* ── E-textbook library ───────────────────────────────────────────────────── */
r.get('/textbooks', (req, res) => {
  const section = req.query.section ??
    (req.user.role === 'student'
      ? db.prepare('SELECT section FROM classes WHERE id = ?').get(req.student?.class_id ?? 0)?.section
      : null);
  const rows = section
    ? db.prepare('SELECT * FROM textbooks WHERE section = ? ORDER BY title').all(section)
    : db.prepare('SELECT * FROM textbooks ORDER BY section, title').all();
  const progress = db.prepare('SELECT textbook_id, page_number FROM reading_progress WHERE user_id = ?').all(req.user.id);
  const map = Object.fromEntries(progress.map((p) => [p.textbook_id, p.page_number]));
  res.json(rows.map((t) => ({ ...t, current_page: map[t.id] ?? 0 })));
});

/** Progressive loading: pages are fetched in windows, not as one blob (PRD §4.1). */
r.get('/textbooks/:id/pages', (req, res) => {
  const from = Math.max(1, Number(req.query.from) || 1);
  const size = Math.min(10, Math.max(1, Number(req.query.size) || 5));
  const book = db.prepare('SELECT * FROM textbooks WHERE id = ?').get(req.params.id);
  if (!book) return res.status(404).json({ error: 'Textbook not found' });
  const pages = db.prepare(
    'SELECT * FROM textbook_pages WHERE textbook_id = ? AND page_number >= ? ORDER BY page_number LIMIT ?'
  ).all(book.id, from, size);
  res.json({ book, from, size, total_pages: book.total_pages, pages });
});

r.put('/textbooks/:id/progress', (req, res) => {
  db.prepare(
    `INSERT INTO reading_progress (user_id, textbook_id, page_number, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (user_id, textbook_id) DO UPDATE SET page_number = excluded.page_number, updated_at = datetime('now')`
  ).run(req.user.id, req.params.id, Number(req.body?.page_number) || 1);
  res.json({ ok: true });
});

/* ── Fees & billing ───────────────────────────────────────────────────────── */
r.get('/invoices', (req, res) => {
  if (req.user.role === 'parent') {
    return res.json(db.prepare(
      `SELECT i.*, u.first_name AS student_first_name, u.last_name AS student_last_name, s.student_code,
              (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.invoice_id = i.id) AS paid
       FROM invoices i JOIN guardianships g ON g.student_id = i.student_id AND g.parent_user_id = ?
       JOIN students s ON s.id = i.student_id JOIN users u ON u.id = s.user_id
       ORDER BY i.due_date DESC`
    ).all(req.user.id));
  }
  if (req.user.role === 'student') {
    return res.json(db.prepare(
      `SELECT i.*, (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.invoice_id = i.id) AS paid
       FROM invoices i WHERE i.student_id = ? ORDER BY i.due_date DESC`
    ).all(req.student.id));
  }
  res.json(db.prepare(
    `SELECT i.*, u.first_name AS student_first_name, u.last_name AS student_last_name,
            s.student_code, c.name AS class_name,
            (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.invoice_id = i.id) AS paid
     FROM invoices i JOIN students s ON s.id = i.student_id JOIN users u ON u.id = s.user_id
     LEFT JOIN classes c ON c.id = s.class_id ORDER BY i.due_date DESC`
  ).all());
});

/**
 * Posts a fees event to the ledger, and shrugs if the school has not set up its
 * chart of accounts yet. Billing a family must never fail because the books are
 * not ready; the entry is simply not made, and `journal_id` stays null to show
 * which invoices predate the ledger.
 */
function postFees({ memo, source, sourceId, user, studentId, lines }) {
  if (!lines || !accountByRole('receivable') || !accountByRole('fee_income')) return null;
  try {
    return postJournal({
      date: new Date().toISOString().slice(0, 10),
      memo, source, sourceId, user,
      lines: lines.map((l) => ({ ...l, student_id: studentId })),
    });
  } catch {
    // A closed year or a missing account is a bookkeeping problem to fix in the
    // finance pages, not a reason to refuse a parent's payment.
    return null;
  }
}

r.post('/invoices', requirePermission('finance.manage'), (req, res) => {
  const b = req.body ?? {};
  if (!b.student_id || !b.amount || !b.due_date) {
    return res.status(400).json({ error: 'student_id, amount and due_date are required' });
  }
  const no = `INV-${new Date().getFullYear()}-${String(db.prepare('SELECT COUNT(*) n FROM invoices').get().n + 1).padStart(4, '0')}`;
  const out = db.prepare(
    'INSERT INTO invoices (invoice_no, student_id, term, description, amount, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(no, b.student_id, b.term ?? 'Term 1', b.description ?? null, Number(b.amount), b.due_date, req.user.id);

  for (const item of b.items ?? []) {
    db.prepare('INSERT INTO invoice_items (invoice_id, label, amount) VALUES (?, ?, ?)')
      .run(out.lastInsertRowid, item.label, Number(item.amount));
  }
  // Billing a family is an accounting event: the school is owed the money and
  // has earned the income. Posted here so the ledger is never reconstructed
  // from the fees module afterwards. A school that has not set up its chart of
  // accounts yet simply bills as before.
  const journalId = postFees({
    memo: `${no}: ${b.description ?? 'School fees'}`,
    source: 'invoice', sourceId: out.lastInsertRowid, user: req.user, studentId: b.student_id,
    lines: [
      { account_role: 'receivable', debit: Number(b.amount) },
      { account_role: 'fee_income', credit: Number(b.amount) },
    ],
  });
  if (journalId) db.prepare('UPDATE invoices SET journal_id = ? WHERE id = ?').run(journalId, out.lastInsertRowid);

  for (const g of db.prepare('SELECT parent_user_id FROM guardianships WHERE student_id = ?').all(b.student_id)) {
    notify(g.parent_user_id, { title: `New invoice ${no}`, body: `${b.amount} due ${b.due_date}`, kind: 'invoice', link: '/parent/fees' });
  }
  audit({ user: req.user, action: 'create', entity: 'invoices', entityId: out.lastInsertRowid, next: { no, amount: b.amount }, ip: req.ip });
  res.status(201).json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(out.lastInsertRowid));
});

r.get('/invoices/:id', (req, res) => {
  const i = db.prepare(
    `SELECT i.*, u.first_name AS student_first_name, u.last_name AS student_last_name, s.student_code
     FROM invoices i JOIN students s ON s.id = i.student_id JOIN users u ON u.id = s.user_id WHERE i.id = ?`
  ).get(req.params.id);
  if (!i) return res.status(404).json({ error: 'Invoice not found' });
  if (!canAccessStudent(req, i.student_id)) return res.status(403).json({ error: 'Not permitted' });
  i.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(i.id);
  i.payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at').all(i.id);
  i.paid = i.payments.reduce((a, p) => a + p.amount, 0);
  i.balance = Math.round((i.amount - i.paid) * 100) / 100;
  res.json(i);
});

/**
 * Simulated gateway checkout. Replace `simulateGateway` with a Stripe/Paystack
 * PaymentIntent confirmation. Everything downstream (receipt, status, audit,
 * notification) already works off the returned reference.
 */
r.post('/invoices/:id/pay', requireRole('parent', 'admin'), (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (!canAccessStudent(req, invoice.student_id)) return res.status(403).json({ error: 'Not permitted' });
  if (invoice.status === 'paid') return res.status(409).json({ error: 'This invoice is already settled' });

  const paidSoFar = db.prepare('SELECT COALESCE(SUM(amount),0) n FROM payments WHERE invoice_id = ?').get(invoice.id).n;
  const balance = Math.round((invoice.amount - paidSoFar) * 100) / 100;
  const amount = Math.round((Number(req.body?.amount) || balance) * 100) / 100;
  if (amount <= 0 || amount > balance) {
    return res.status(400).json({ error: `Amount must be between 0.01 and ${balance.toFixed(2)}` });
  }

  const reference = simulateGateway(req.body?.method ?? 'card');
  const receiptNo = `RCP-${Date.now().toString(36).toUpperCase()}`;
  db.prepare('INSERT INTO payments (invoice_id, receipt_no, amount, method, reference, paid_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(invoice.id, receiptNo, amount, req.body?.method ?? 'card', reference, req.user.id);

  const payment = db.prepare('SELECT id FROM payments WHERE receipt_no = ?').get(receiptNo);
  const bank = accountByRole(req.body?.method === 'cash' ? 'cash' : 'bank') ?? accountByRole('bank');
  const paymentJournal = postFees({
    memo: `${receiptNo}: payment against ${invoice.invoice_no}`,
    source: 'payment', sourceId: payment?.id, user: req.user, studentId: invoice.student_id,
    lines: bank ? [
      { account_id: bank.id, debit: amount },
      { account_role: 'receivable', credit: amount },
    ] : null,
  });
  if (paymentJournal) {
    db.prepare('UPDATE payments SET journal_id = ?, account_id = ? WHERE id = ?')
      .run(paymentJournal, bank?.id ?? null, payment.id);
  }

  const status = amount >= balance ? 'paid' : 'partial';
  db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, invoice.id);
  audit({ user: req.user, action: 'payment', entity: 'invoices', entityId: invoice.id,
          prev: { status: invoice.status, paid: paidSoFar }, next: { status, paid: paidSoFar + amount, receiptNo }, ip: req.ip });

  res.status(201).json({
    receipt_no: receiptNo, reference, amount, method: req.body?.method ?? 'card',
    invoice: db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice.id),
    balance: Math.round((balance - amount) * 100) / 100,
  });
});

/* ── Notifications & announcements ────────────────────────────────────────── */
r.get('/notifications', (req, res) => {
  res.json(db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 60').all(req.user.id));
});

r.post('/notifications/read', (req, res) => {
  const ids = req.body?.ids;
  if (Array.isArray(ids) && ids.length) {
    db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
      .run(req.user.id, ...ids);
  } else {
    db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(req.user.id);
  }
  res.json({ ok: true });
});

r.get('/announcements', (req, res) => {
  res.json(db.prepare(
    `SELECT a.*, u.first_name || ' ' || u.last_name AS author FROM announcements a
     LEFT JOIN users u ON u.id = a.created_by
     WHERE a.audience = 'all' OR a.audience = ? ORDER BY a.pinned DESC, a.created_at DESC LIMIT 30`
  ).all(`${req.user.role}s`));
});

r.post('/announcements', requireRole('admin', 'teacher'), (req, res) => {
  const b = req.body ?? {};
  if (!b.title || !b.body) return res.status(400).json({ error: 'title and body are required' });
  const out = db.prepare('INSERT INTO announcements (title, body, audience, pinned, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(b.title, b.body, b.audience ?? 'all', b.pinned ? 1 : 0, req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM announcements WHERE id = ?').get(out.lastInsertRowid));
});

/* ── Audit log (admin only) ───────────────────────────────────────────────── */
/**
 * Everything waiting on somebody, in one place.
 *
 * A school's decisions arrive through different doors — a parent reports an
 * absence, a teacher books leave, a family applies — and each has had its own
 * page, which means the answer to "what is waiting on me?" was three pages and
 * a memory. This gathers them, keeping each one's own rules: a person only sees
 * what their role may decide, and deciding still happens through the route that
 * owns it, so nothing here is a second way to approve something.
 */
r.get('/requests', requireRole('admin', 'teacher'), (req, res) => {
  const out = [];
  const wanted = req.query.status ?? 'pending';
  const openOnly = wanted === 'pending';

  if (can(req.user, 'pupil_leave.decide')) {
    const rows = db.prepare(
      `SELECT l.*, u.first_name AS pupil_first, u.last_name AS pupil_last, s.student_code,
              c.name AS class_name, c.room AS class_room,
              rq.first_name || ' ' || rq.last_name AS asked_by,
              rv.first_name || ' ' || rv.last_name AS reviewer
       FROM leave_requests l
       JOIN students s ON s.id = l.student_id JOIN users u ON u.id = s.user_id
       LEFT JOIN classes c ON c.id = s.class_id
       LEFT JOIN users rq ON rq.id = l.requested_by
       LEFT JOIN users rv ON rv.id = l.reviewed_by
       ${openOnly ? "WHERE l.status = 'pending'" : ''}
       ORDER BY l.created_at DESC LIMIT 200`
    ).all();

    for (const row of rows) {
      out.push({
        kind: 'pupil_leave',
        kind_label: 'Pupil absence',
        id: row.id,
        status: row.status,
        who: `${row.pupil_first} ${row.pupil_last}`,
        who_detail: [row.class_name && `${row.class_name}${row.class_room ? ` · ${row.class_room}` : ''}`,
                     row.student_code].filter(Boolean).join(' · '),
        summary: row.reason,
        category: row.category,
        starts_on: row.start_date,
        ends_on: row.end_date,
        asked_by: row.asked_by,
        asked_at: row.created_at,
        reviewer: row.reviewer,
        review_note: row.review_note,
        decide_path: `/api/leave/${row.id}/decision`,
        link: `/admin/leave`,
      });
    }
  }

  if (can(req.user, 'leave.decide')) {
    const rows = db.prepare(
      `SELECT sl.*, u.first_name, u.last_name, st.title, st.department,
              rv.first_name || ' ' || rv.last_name AS reviewer
       FROM staff_leave sl JOIN users u ON u.id = sl.user_id
       LEFT JOIN staff st ON st.user_id = sl.user_id
       LEFT JOIN users rv ON rv.id = sl.reviewed_by
       ${openOnly ? "WHERE sl.status = 'pending'" : ''}
       ORDER BY sl.created_at DESC LIMIT 200`
    ).all();

    for (const row of rows) {
      out.push({
        kind: 'staff_leave',
        kind_label: 'Staff leave',
        id: row.id,
        status: row.status,
        who: `${row.first_name} ${row.last_name}`,
        who_detail: [row.title, row.department].filter(Boolean).join(' · '),
        summary: row.reason,
        category: row.leave_type,
        starts_on: row.start_date,
        ends_on: row.end_date,
        asked_by: `${row.first_name} ${row.last_name}`,
        asked_at: row.created_at,
        reviewer: row.reviewer,
        review_note: row.review_note,
        decide_path: `/api/staff-leave/${row.id}/decision`,
        link: `/admin/staff-leave`,
      });
    }
  }

  if (can(req.user, 'website.manage')) {
    const rows = db.prepare(
      `SELECT * FROM admissions_enquiries ${openOnly ? "WHERE status = 'new'" : ''}
       ORDER BY created_at DESC LIMIT 200`
    ).all();

    for (const row of rows) {
      out.push({
        kind: 'admission',
        kind_label: row.kind === 'application' ? 'Admission' : row.kind === 'tour' ? 'Tour' : 'Enquiry',
        id: row.id,
        // An enquiry is answered by working it through the pipeline, not by a
        // yes or no, so it is listed to be seen rather than decided here.
        status: row.status === 'new' ? 'pending' : row.status,
        who: row.parent_name,
        who_detail: [row.child_name && `about ${row.child_name}`, row.email, row.phone]
          .filter(Boolean).join(' · '),
        summary: row.message,
        category: row.kind,
        asked_at: row.created_at,
        link: '/admin/admissions',
      });
    }
  }

  out.sort((a, b) => String(b.asked_at ?? '').localeCompare(String(a.asked_at ?? '')));
  res.json({
    requests: out,
    counts: out.reduce((acc, row) => {
      if (row.status === 'pending') acc[row.kind] = (acc[row.kind] ?? 0) + 1;
      return acc;
    }, {}),
  });
});

r.get('/audit', requirePermission('audit.read'), (req, res) => {
  const { entity, action, limit = 200 } = req.query;
  const where = ['1=1']; const args = [];
  if (entity) { where.push('entity = ?'); args.push(entity); }
  if (action) { where.push('action = ?'); args.push(action); }
  res.json(db.prepare(
    `SELECT * FROM audit_logs WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`
  ).all(...args, Math.min(1000, Number(limit))));
});

/* ── First-run setup ──────────────────────────────────────────────────────── */
/**
 * What a new school still has to do before the platform is any use to anybody.
 * A fresh install has one administrator and a placeholder website, so this
 * drives a checklist rather than leaving them to guess the running order:
 * classes and subjects first, because staff and pupils attach to them.
 */
r.get('/setup', requireRole('admin'), (req, res) => {
  const one = (sql, ...args) => db.prepare(sql).get(...args).n;

  const settings = db.prepare('SELECT name, logo_url FROM school_settings WHERE id = 1').get() ?? {};
  const counts = {
    classes: one('SELECT COUNT(*) n FROM classes'),
    subjects: one('SELECT COUNT(*) n FROM subjects'),
    teachers: one("SELECT COUNT(*) n FROM users WHERE role = 'teacher'"),
    students: one("SELECT COUNT(*) n FROM students WHERE status = 'active'"),
    timetable: one('SELECT COUNT(*) n FROM timetable_slots'),
    pending_invites: one("SELECT COUNT(*) n FROM account_invites WHERE accepted_at IS NULL AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')"),
  };
  // The website ships as a full page skeleton whose facts are left in square
  // brackets to be filled in, so what is measured is whether any are left,
  // rather than whether somebody pressed save.
  const blocks = db.prepare('SELECT heading, body, extra FROM site_content').all();
  const placeholders = blocks.filter((row) => {
    // Only the text counts: JSON punctuation in `extra` is full of brackets.
    const strings = [row.heading, row.body];
    const walk = (value) => {
      if (typeof value === 'string') strings.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    try { walk(JSON.parse(row.extra ?? 'null')); } catch { /* not JSON, ignore */ }
    return strings.some((text) => typeof text === 'string' && /\[[^\]]{1,60}\]/.test(text));
  }).length;

  const steps = [
    { key: 'brand', title: 'Name and brand your school',
      body: 'Your name, logo and colours, which follow through to every screen and the public site.',
      link: '/admin/website', cta: 'Open branding',
      done: !!settings.logo_url || (!!settings.name && settings.name !== 'Your School') },
    { key: 'subjects', title: 'Add your subjects',
      body: 'What is taught, per section. Classes and timetables are built from these.',
      link: '/admin/subjects', cta: 'Add subjects', done: counts.subjects > 0, count: counts.subjects },
    { key: 'classes', title: 'Add your classes',
      body: 'One per teaching group, with the section and year it belongs to.',
      link: '/admin/classes', cta: 'Add classes', done: counts.classes > 0, count: counts.classes },
    { key: 'staff', title: 'Invite your staff',
      body: 'Each colleague sets their own password from the link you send them.',
      link: '/admin/invitations', cta: 'Invite staff', done: counts.teachers > 0, count: counts.teachers },
    { key: 'students', title: 'Add your pupils',
      body: 'Enrol pupils into their class. Each one gets a sign-in code rather than a password.',
      link: '/admin/students', cta: 'Add pupils', done: counts.students > 0, count: counts.students },
    { key: 'timetable', title: 'Build the timetable',
      body: 'Lessons per class and period. Registers, catch-up and today\'s schedule all read from it.',
      link: '/admin/classes', cta: 'Build timetable', done: counts.timetable > 0, count: counts.timetable },
    { key: 'website', title: 'Write your website copy',
      body: placeholders
        ? `${placeholders} of ${blocks.length} blocks still have details in square brackets to fill in.`
        : 'Every page is in place, waiting for your own words.',
      link: '/admin/website', cta: 'Edit content', done: blocks.length > 0 && placeholders === 0, count: placeholders },
  ];

  const done = steps.filter((s) => s.done).length;
  res.json({
    school: settings.name ?? null,
    steps,
    done,
    total: steps.length,
    complete: done === steps.length,
    pending_invites: counts.pending_invites,
  });
});

/* ── Work waiting on a teacher (the notice board's "needs you" list) ──────── */
/**
 * Everything a teacher still has to act on, newest pressure first. Each item
 * carries a link so the notice board can send them straight to the right page,
 * and the ones that are a single decision carry an `action` the board performs
 * inline without a page change.
 */
r.get('/dashboard/actions', requireRole('teacher'), (req, res) => {
  const me = req.user.id;
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toTimeString().slice(0, 5);
  const items = [];

  // Registers for today's lessons that have not been marked.
  const registers = db.prepare(
    `SELECT ts.period, ts.start_time, ts.end_time, cs.id AS class_subject_id,
            sub.name AS subject, c.name AS class_name
     FROM timetable_slots ts
     JOIN class_subjects cs ON cs.id = ts.class_subject_id
     JOIN subjects sub ON sub.id = cs.subject_id
     JOIN classes c ON c.id = cs.class_id
     WHERE cs.teacher_id = ? AND ts.day_of_week = ?
       AND NOT EXISTS (SELECT 1 FROM attendance a
                       WHERE a.class_subject_id = cs.id AND a.date = ? AND a.period = ts.period)
     ORDER BY ts.period`
  ).all(me, new Date().getDay() || 7, today);
  for (const slot of registers) {
    items.push({
      id: `register-${slot.class_subject_id}-${slot.period}`,
      kind: 'register',
      title: `Take the register for ${slot.class_name}`,
      detail: `${slot.subject} · period ${slot.period}, ${slot.start_time} to ${slot.end_time}`,
      tone: slot.end_time < now ? 'red' : 'brand',
      urgent: slot.end_time < now,
      link: `/teacher/attendance?cs=${slot.class_subject_id}&period=${slot.period}`,
      cta: 'Take register',
    });
  }

  // Work handed in and still waiting on a mark.
  const grading = db.prepare(
    `SELECT a.id, a.title, a.due_at, sub.name AS subject, c.name AS class_name, COUNT(*) AS n
     FROM submissions s
     JOIN assignments a ON a.id = s.assignment_id
     JOIN class_subjects cs ON cs.id = a.class_subject_id
     JOIN subjects sub ON sub.id = cs.subject_id
     JOIN classes c ON c.id = cs.class_id
     WHERE cs.teacher_id = ? AND s.grade IS NULL
     GROUP BY a.id ORDER BY a.due_at`
  ).all(me);
  for (const g of grading) {
    items.push({
      id: `grade-${g.id}`,
      kind: 'grading',
      title: `${g.n} submission${g.n === 1 ? '' : 's'} to mark`,
      detail: `${g.title} · ${g.class_name} ${g.subject}`,
      count: g.n,
      tone: 'amber',
      urgent: !!g.due_at && g.due_at < new Date().toISOString(),
      link: `/teacher/assignments/${g.id}`,
      cta: 'Mark work',
    });
  }

  // Absent pupils with no recap to catch up on.
  const recaps = db.prepare(
    `SELECT cs.id AS class_subject_id, ce.lesson_date, sub.name AS subject, c.name AS class_name,
            COUNT(DISTINCT ce.student_id) AS n
     FROM catchup_entries ce
     JOIN class_subjects cs ON cs.id = ce.class_subject_id
     JOIN subjects sub ON sub.id = cs.subject_id
     JOIN classes c ON c.id = cs.class_id
     WHERE cs.teacher_id = ? AND ce.lesson_material_id IS NULL
     GROUP BY cs.id, ce.lesson_date ORDER BY ce.lesson_date DESC`
  ).all(me);
  for (const rc of recaps) {
    items.push({
      id: `recap-${rc.class_subject_id}-${rc.lesson_date}`,
      kind: 'recap',
      title: `${rc.n} pupil${rc.n === 1 ? '' : 's'} waiting on a recap`,
      detail: `${rc.class_name} ${rc.subject} · ${rc.lesson_date}`,
      count: rc.n,
      tone: 'red',
      link: `/teacher/materials?cs=${rc.class_subject_id}&date=${rc.lesson_date}`,
      cta: 'Publish a recap',
    });
  }

  // Recaps written but never released, which pupils cannot see yet.
  const drafts = db.prepare(
    `SELECT m.id, m.topic, m.lesson_date, sub.name AS subject, c.name AS class_name,
            (SELECT COUNT(*) FROM catchup_entries ce WHERE ce.lesson_material_id = m.id) AS waiting
     FROM lesson_materials m
     JOIN class_subjects cs ON cs.id = m.class_subject_id
     JOIN subjects sub ON sub.id = cs.subject_id
     JOIN classes c ON c.id = cs.class_id
     WHERE cs.teacher_id = ? AND m.is_published = 0
     ORDER BY m.lesson_date DESC`
  ).all(me);
  for (const d of drafts) {
    items.push({
      id: `draft-${d.id}`,
      kind: 'draft',
      title: `Draft recap: ${d.topic}`,
      detail: d.waiting
        ? `${d.class_name} ${d.subject} · ${d.waiting} pupil${d.waiting === 1 ? '' : 's'} cannot see it yet`
        : `${d.class_name} ${d.subject} · ${d.lesson_date}`,
      tone: 'amber',
      link: '/teacher/materials',
      cta: 'Publish now',
      action: { method: 'PATCH', path: `/materials/${d.id}/publish`, body: { is_published: true }, label: 'Publish now' },
    });
  }

  // Messages from parents that have not been opened.
  const unread = db.prepare(
    `SELECT COUNT(*) n FROM messages m
     JOIN thread_participants tp ON tp.thread_id = m.thread_id AND tp.user_id = ?
     WHERE m.sender_id != ? AND (tp.last_read_at IS NULL OR m.created_at > tp.last_read_at)`
  ).get(me, me).n;
  if (unread) {
    items.push({
      id: 'messages',
      kind: 'message',
      title: `${unread} unread message${unread === 1 ? '' : 's'}`,
      detail: 'Families are waiting on a reply.',
      count: unread,
      tone: 'brand',
      link: '/messages',
      cta: 'Open messages',
    });
  }

  // Pupil leave they reported that leadership has not decided on.
  const leave = db.prepare(
    `SELECT COUNT(*) n FROM leave_requests l
     WHERE l.requested_by = ? AND l.status = 'pending'`
  ).get(me).n;
  if (leave) {
    items.push({
      id: 'leave',
      kind: 'leave',
      title: `${leave} leave request${leave === 1 ? '' : 's'} with the head of school`,
      detail: 'No action needed from you yet, you will see the outcome here.',
      count: leave,
      tone: 'slate',
      link: '/teacher/leave',
      cta: 'View requests',
    });
  }

  const rank = { register: 0, grading: 1, recap: 2, draft: 3, message: 4, leave: 5 };
  items.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || rank[a.kind] - rank[b.kind]);
  res.json({ items, urgent: items.filter((i) => i.urgent).length });
});

/* ── Dashboard analytics ──────────────────────────────────────────────────── */
r.get('/dashboard', (req, res) => {
  const role = req.user.role;

  if (role === 'admin') {
    const attendance = db.prepare(
      `SELECT status, COUNT(*) n FROM attendance WHERE date >= date('now','-30 day') GROUP BY status`
    ).all();
    const total = attendance.reduce((a, b) => a + b.n, 0) || 1;
    return res.json({
      students: db.prepare("SELECT COUNT(*) n FROM students WHERE status='active'").get().n,
      staff: db.prepare('SELECT COUNT(*) n FROM staff').get().n,
      classes: db.prepare('SELECT COUNT(*) n FROM classes').get().n,
      sen_students: db.prepare(`SELECT COUNT(*) n FROM iep_profiles iep WHERE ${IS_SEN}`).get().n,
      attendance_rate: Math.round(((attendance.find((a) => a.status === 'present')?.n ?? 0) / total) * 100),
      by_section: db.prepare(
        "SELECT c.section, COUNT(s.id) n FROM classes c LEFT JOIN students s ON s.class_id = c.id AND s.status='active' GROUP BY c.section"
      ).all(),
      fees: db.prepare(
        `SELECT COALESCE(SUM(amount),0) billed,
                COALESCE((SELECT SUM(amount) FROM payments),0) collected,
                COALESCE(SUM(CASE WHEN status IN ('unpaid','overdue','partial') THEN 1 ELSE 0 END), 0) outstanding_count
         FROM invoices`
      ).get(),
      pending_leave: db.prepare("SELECT COUNT(*) n FROM leave_requests WHERE status='pending'").get().n,
      recent_audit: db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 8').all(),
    });
  }

  if (role === 'teacher') {
    return res.json({
      classes: db.prepare('SELECT COUNT(DISTINCT class_id) n FROM class_subjects WHERE teacher_id = ?').get(req.user.id).n,
      students: db.prepare(
        `SELECT COUNT(DISTINCT s.id) n FROM class_subjects cs JOIN students s ON s.class_id = cs.class_id
         WHERE cs.teacher_id = ? AND s.status='active'`
      ).get(req.user.id).n,
      ungraded: db.prepare(
        `SELECT COUNT(*) n FROM submissions sub JOIN assignments a ON a.id = sub.assignment_id
         JOIN class_subjects cs ON cs.id = a.class_subject_id
         WHERE cs.teacher_id = ? AND sub.grade IS NULL`
      ).get(req.user.id).n,
      pending_leave: db.prepare(
        `SELECT COUNT(*) n FROM leave_requests l JOIN students s ON s.id = l.student_id
         JOIN classes c ON c.id = s.class_id WHERE c.homeroom_teacher_id = ? AND l.status = 'pending'`
      ).get(req.user.id).n,
      sen_in_classes: db.prepare(
        `SELECT COUNT(DISTINCT iep.student_id) n FROM iep_profiles iep JOIN students s ON s.id = iep.student_id
         JOIN class_subjects cs ON cs.class_id = s.class_id WHERE cs.teacher_id = ? AND ${IS_SEN}`
      ).get(req.user.id).n,
      missing_recaps: db.prepare(
        `SELECT COUNT(*) n FROM catchup_entries ce JOIN class_subjects cs ON cs.id = ce.class_subject_id
         WHERE cs.teacher_id = ? AND ce.lesson_material_id IS NULL`
      ).get(req.user.id).n,
      today: db.prepare(
        `SELECT ts.*, sub.name AS subject, sub.colour, c.name AS class_name, cs.id AS class_subject_id
         FROM timetable_slots ts JOIN class_subjects cs ON cs.id = ts.class_subject_id
         JOIN subjects sub ON sub.id = cs.subject_id JOIN classes c ON c.id = cs.class_id
         WHERE cs.teacher_id = ? AND ts.day_of_week = ? ORDER BY ts.period`
      ).all(req.user.id, new Date().getDay() || 7),
    });
  }

  if (role === 'student') {
    const sid = req.student?.id ?? 0;
    const att = db.prepare('SELECT status, COUNT(*) n FROM attendance WHERE student_id = ? GROUP BY status').all(sid);
    const total = att.reduce((a, b) => a + b.n, 0) || 1;
    return res.json({
      catchup_open: db.prepare("SELECT COUNT(*) n FROM catchup_entries WHERE student_id = ? AND status != 'completed'").get(sid).n,
      due_soon: db.prepare(
        `SELECT COUNT(*) n FROM assignments a JOIN class_subjects cs ON cs.id = a.class_subject_id
         LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ?
         WHERE cs.class_id = ? AND s.id IS NULL AND a.due_at > datetime('now')`
      ).get(sid, req.student?.class_id ?? 0).n,
      attendance_rate: Math.round(((att.find((a) => a.status === 'present')?.n ?? 0) / total) * 100),
      average_grade: db.prepare('SELECT ROUND(AVG(grade),1) n FROM submissions WHERE student_id = ? AND grade IS NOT NULL').get(sid).n,
      today: db.prepare(
        `SELECT ts.*, sub.name AS subject, sub.colour, sub.icon,
                u.first_name || ' ' || u.last_name AS teacher_name
         FROM timetable_slots ts JOIN class_subjects cs ON cs.id = ts.class_subject_id
         JOIN subjects sub ON sub.id = cs.subject_id LEFT JOIN users u ON u.id = cs.teacher_id
         WHERE cs.class_id = ? AND ts.day_of_week = ? ORDER BY ts.period`
      ).all(req.student?.class_id ?? 0, new Date().getDay() || 7),
      upcoming: db.prepare(
        `SELECT a.id, a.title, a.due_at, sub.name AS subject, sub.colour,
                s.status AS submission_status
         FROM assignments a JOIN class_subjects cs ON cs.id = a.class_subject_id
         JOIN subjects sub ON sub.id = cs.subject_id
         LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ?
         WHERE cs.class_id = ? AND a.due_at > datetime('now','-3 day') ORDER BY a.due_at LIMIT 6`
      ).all(sid, req.student?.class_id ?? 0),
    });
  }

  // Parent
  const children = db.prepare(
    `SELECT s.id, s.student_code, u.first_name, u.last_name, u.avatar_colour, u.avatar_url, u.avatar_emoji, c.name AS class_name, c.section
     FROM guardianships g JOIN students s ON s.id = g.student_id JOIN users u ON u.id = s.user_id
     LEFT JOIN classes c ON c.id = s.class_id WHERE g.parent_user_id = ?`
  ).all(req.user.id);

  for (const child of children) {
    const att = db.prepare('SELECT status, COUNT(*) n FROM attendance WHERE student_id = ? GROUP BY status').all(child.id);
    const total = att.reduce((a, b) => a + b.n, 0) || 1;
    child.attendance_rate = Math.round(((att.find((a) => a.status === 'present')?.n ?? 0) / total) * 100);
    child.average_grade = db.prepare('SELECT ROUND(AVG(grade),1) n FROM submissions WHERE student_id = ? AND grade IS NOT NULL').get(child.id).n;
    child.open_catchup = db.prepare("SELECT COUNT(*) n FROM catchup_entries WHERE student_id = ? AND status != 'completed'").get(child.id).n;
    child.outstanding_fees = db.prepare(
      "SELECT COALESCE(SUM(amount),0) - COALESCE((SELECT SUM(p.amount) FROM payments p JOIN invoices i2 ON i2.id = p.invoice_id WHERE i2.student_id = ?),0) n FROM invoices WHERE student_id = ? AND status != 'void'"
    ).get(child.id, child.id).n;
    child.recent_activity = db.prepare(
      'SELECT * FROM activity_logs WHERE student_id = ? ORDER BY occurred_at DESC LIMIT 4'
    ).all(child.id);
  }
  res.json({
    children,
    unread_messages: db.prepare(
      `SELECT COUNT(*) n FROM messages m JOIN thread_participants tp ON tp.thread_id = m.thread_id AND tp.user_id = ?
       WHERE m.sender_id != ? AND (tp.last_read_at IS NULL OR m.created_at > tp.last_read_at)`
    ).get(req.user.id, req.user.id).n,
    pending_slips: db.prepare(
      `SELECT COUNT(*) n FROM permission_slips ps JOIN students s ON s.class_id = ps.class_id
       JOIN guardianships g ON g.student_id = s.id AND g.parent_user_id = ?
       LEFT JOIN slip_responses sr ON sr.slip_id = ps.id AND sr.student_id = s.id
       WHERE sr.id IS NULL AND date(ps.respond_by) >= date('now')`
    ).get(req.user.id).n,
  });
});

function simulateGateway(method) {
  return `${method.toUpperCase()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

export default r;
