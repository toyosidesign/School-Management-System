import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db, notify } from '../db/index.js';
import { addSchool, connectionFor, slugProblem, slugify } from '../db/registry.js';

const r = Router();

/**
 * Unauthenticated surface for the school's public website.
 * Mounted BEFORE the authenticated routers, so nothing here needs a token.
 * Form endpoints are rate limited harder than the rest of the API.
 */
const formLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_FORM_WINDOW_MS) || 10 * 60_000,
  // Read per request, not once at import: this module is loaded a single time
  // per process, so a fixed value here would ignore later configuration.
  max: () => Number(process.env.RATE_LIMIT_FORM) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions from this device. Please try again shortly.' },
});

export function getSettings() {
  let s = db.prepare('SELECT * FROM school_settings WHERE id = 1').get();
  if (!s) {
    db.prepare('INSERT INTO school_settings (id) VALUES (1)').run();
    s = db.prepare('SELECT * FROM school_settings WHERE id = 1').get();
  }
  return s;
}

/** Branding + all page content in one call, so the site paints in a single round trip. */
r.get('/site', (_req, res) => {
  const settings = getSettings();
  const content = db.prepare(
    'SELECT page, slot, heading, body, media_url, extra, sort_order FROM site_content WHERE is_visible = 1 ORDER BY page, sort_order'
  ).all();

  const pages = {};
  for (const c of content) {
    (pages[c.page] ??= {})[c.slot] = { ...c, extra: safeJson(c.extra, null) };
  }

  res.json({
    settings,
    pages,
    stats: {
      students: db.prepare("SELECT COUNT(*) n FROM students WHERE status='active'").get().n,
      staff: db.prepare('SELECT COUNT(*) n FROM staff').get().n,
      classes: db.prepare('SELECT COUNT(*) n FROM classes').get().n,
      subjects: db.prepare('SELECT COUNT(*) n FROM subjects').get().n,
    },
    // Named as the school names them, and in the school's own order.
    sections: db.prepare(
      `SELECT sec.key AS section, sec.name, sec.sort_order,
              COUNT(DISTINCT c.id) AS classes,
              COUNT(CASE WHEN s.status = 'active' THEN s.id END) AS students
       FROM sections sec
       LEFT JOIN classes c ON c.section = sec.key
       LEFT JOIN students s ON s.class_id = c.id
       WHERE sec.is_active = 1
       GROUP BY sec.id ORDER BY sec.sort_order, sec.id`
    ).all(),
  });
});

r.get('/news', (req, res) => {
  const limit = Math.min(50, Number(req.query.limit) || 12);
  res.json(db.prepare(
    `SELECT n.id, n.title, n.slug, n.excerpt, n.category, n.cover_colour, n.published_at,
            u.first_name || ' ' || u.last_name AS author
     FROM news_posts n LEFT JOIN users u ON u.id = n.author_id
     WHERE n.is_published = 1 ORDER BY n.published_at DESC LIMIT ?`
  ).all(limit));
});

r.get('/news/:slug', (req, res) => {
  const post = db.prepare(
    `SELECT n.*, u.first_name || ' ' || u.last_name AS author
     FROM news_posts n LEFT JOIN users u ON u.id = n.author_id
     WHERE n.slug = ? AND n.is_published = 1`
  ).get(req.params.slug);
  if (!post) return res.status(404).json({ error: 'Article not found' });
  res.json(post);
});

/** Public calendar: only whole-school events, never anything class-specific. */
r.get('/events', (_req, res) => {
  res.json(db.prepare(
    `SELECT id, title, description, event_type, start_at, end_at, all_day, location
     FROM calendar_events
     WHERE class_id IS NULL AND date(start_at) >= date('now')
     ORDER BY start_at LIMIT 8`
  ).all());
});

/** Admissions enquiry and application both land in the same reviewable inbox. */
r.post('/enquiries', formLimiter, (req, res) => {
  const b = req.body ?? {};
  const kind = ['application', 'tour'].includes(b.kind) ? b.kind : 'enquiry';

  if (!b.parent_name?.trim()) return res.status(400).json({ error: 'Please tell us your name' });
  if (!isEmail(b.email)) return res.status(400).json({ error: 'Please enter a valid email address' });
  if (kind === 'application' && !b.child_name?.trim()) {
    return res.status(400).json({ error: "Please tell us the child's name" });
  }
  const settings = getSettings();
  if (kind === 'application' && !settings.admissions_open) {
    return res.status(409).json({ error: 'Applications are closed at the moment. Please send an enquiry instead.' });
  }
  if (kind === 'tour' && !settings.tours_open) {
    return res.status(409).json({ error: 'Tour bookings are paused at the moment. Please send an enquiry instead.' });
  }

  const out = db.prepare(
    `INSERT INTO admissions_enquiries
       (kind, parent_name, email, phone, child_name, child_dob, section, entry_year, message, sen_notes,
        preferred_date, preferred_time, how_heard, source_page, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    kind, b.parent_name.trim(), b.email.trim(), b.phone ?? null,
    b.child_name ?? null, b.child_dob ?? null, b.section ?? null, b.entry_year ?? null,
    b.message ?? null, b.sen_notes ?? null,
    b.preferred_date ?? null, b.preferred_time ?? null, b.how_heard ?? null,
    b.source_page ?? null, req.ip
  );

  // Tell every administrator there is something new to review.
  for (const a of db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1").all()) {
    notify(a.id, {
      title: { application: 'New admissions application', tour: 'New school tour request' }[kind] ?? 'New website enquiry',
      body: `${b.parent_name}${b.child_name ? ` about ${b.child_name}` : ''}`,
      kind: 'admissions',
      link: '/admin/admissions',
    });
  }

  res.status(201).json({
    ok: true,
    reference: `ENQ-${String(out.lastInsertRowid).padStart(5, '0')}`,
    message: {
      application: 'Application received. Our admissions team will be in touch within two working days.',
      tour: 'Tour request received. We will confirm a time with you within two working days.',
    }[kind] ?? 'Thank you. We have your enquiry and will reply shortly.',
  });
});

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function safeJson(v, fallback) {
  try { return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

/* ── First run ────────────────────────────────────────────────────────────── */

/**
 * Whether this deployment is still waiting to be set up.
 *
 * A school on a fresh installation has nobody who can let anybody in, so the
 * first account has to be able to make itself. The moment one administrator
 * exists that door closes for good, which is why this is answerable without
 * signing in: it says only whether the school has been claimed, never anything
 * about it.
 */
r.get('/setup-state', (_req, res) => {
  const claimed = db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get();
  res.json({ needs_setup: !claimed });
});

/**
 * Claiming a fresh installation: the school's name, and the person who runs it.
 *
 * They choose their own password here rather than being sent a link, because
 * there is nobody to send it: this is the one account in the system that is not
 * invited by somebody else. It is refused outright once any administrator
 * exists, so it cannot be used to add a second way in later.
 */
r.post('/setup', async (req, res) => {
  if (db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) {
    return res.status(409).json({ error: 'This school has already been set up. Sign in instead.' });
  }

  const b = req.body ?? {};
  const schoolName = String(b.school_name ?? '').trim();
  const email = String(b.email ?? '').trim().toLowerCase();
  const password = String(b.password ?? '');
  const [first, ...rest] = String(b.name ?? '').trim().split(/\s+/).filter(Boolean);
  const last = rest.join(' ');

  if (!schoolName) return res.status(400).json({ error: 'What is the school called?' });
  if (!first) return res.status(400).json({ error: 'Your name is needed' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'That email does not look right' });
  if (password.length < 8) return res.status(400).json({ error: 'A password of at least 8 characters, please' });

  const { hash, sign } = await import('../lib/auth.js');
  const { profile } = await import('./auth.js');
  const { applyStarter } = await import('../db/starter.js');
  const { seedFinance } = await import('../db/chartOfAccounts.js');

  const now = new Date();
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const academicYear = `${startYear}/${startYear + 1}`;

  const site = applyStarter(db, { name: schoolName, academicYear });
  const finance = seedFinance(db);

  const userId = db.transaction(() => {
    const user = db.prepare(
      `INSERT INTO users (role, email, password_hash, first_name, last_name, is_super_admin)
       VALUES ('admin', ?, ?, ?, ?, 1)`
    ).run(email, hash(password), first, last || 'Admin');
    db.prepare('INSERT INTO staff (user_id, staff_code, title, department) VALUES (?, ?, ?, ?)')
      .run(user.lastInsertRowid, 'STF-001', 'Head of School', 'Administration');
    return user.lastInsertRowid;
  })();

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.status(201).json({
    token: sign(user),
    user: profile(userId),
    school: { name: schoolName, academic_year: academicYear, pages: site.pages, accounts: finance.accounts },
  });
});

/**
 * A new school on a deployment that holds many.
 *
 * The school gets its own database from the first moment: not a row in a shared
 * one with everybody else's pupils beside it, which is the arrangement where a
 * forgotten `WHERE school_id = ?` becomes a data breach. Its address is a
 * subdomain, and the person who sets it up holds it.
 */
r.post('/schools', async (req, res) => {
  if (process.env.ALLOW_SCHOOL_SIGNUP === '0') {
    return res.status(403).json({ error: 'This deployment is not taking new schools' });
  }

  const b = req.body ?? {};
  const name = String(b.school_name ?? '').trim();
  const slug = String(b.slug ?? '').trim().toLowerCase() || slugify(name);
  const email = String(b.email ?? '').trim().toLowerCase();
  const password = String(b.password ?? '');
  const [first, ...rest] = String(b.name ?? '').trim().split(/\s+/).filter(Boolean);

  if (!name) return res.status(400).json({ error: 'What is the school called?' });
  const problem = slugProblem(slug);
  if (problem) return res.status(409).json({ error: problem });
  if (!first) return res.status(400).json({ error: 'Your name is needed' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'That email does not look right' });
  if (password.length < 8) return res.status(400).json({ error: 'A password of at least 8 characters, please' });

  const { hash, sign } = await import('../lib/auth.js');
  const { profile } = await import('./auth.js');
  const { applyStarter } = await import('../db/starter.js');
  const { seedFinance } = await import('../db/chartOfAccounts.js');
  const { runAsSchool } = await import('../lib/tenant.js');

  let school;
  try {
    school = addSchool({ slug, name, createdBy: email });
  } catch (e) {
    return res.status(e.status ?? 500).json({ error: e.status ? e.message : 'That school could not be created' });
  }
  const connection = connectionFor(school);

  const now = new Date();
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const academicYear = `${startYear}/${startYear + 1}`;

  const made = runAsSchool(school, connection, () => {
    const site = applyStarter(db, { name, academicYear });
    const finance = seedFinance(db);
    const userId = db.transaction(() => {
      const user = db.prepare(
        `INSERT INTO users (role, email, password_hash, first_name, last_name, is_super_admin)
         VALUES ('admin', ?, ?, ?, ?, 1)`
      ).run(email, hash(password), first, rest.join(' ') || 'Admin');
      db.prepare('INSERT INTO staff (user_id, staff_code, title, department) VALUES (?, ?, ?, ?)')
        .run(user.lastInsertRowid, 'STF-001', 'Head of School', 'Administration');
      return user.lastInsertRowid;
    })();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    return { token: sign(user), user: profile(userId), site, finance };
  });

  res.status(201).json({
    token: made.token,
    user: made.user,
    school: {
      slug, name, academic_year: academicYear,
      pages: made.site.pages, accounts: made.finance.accounts,
    },
  });
});

/** Whether this deployment takes new schools, and which one is being looked at. */
r.get('/tenancy', (req, res) => {
  res.json({
    accepting: process.env.ALLOW_SCHOOL_SIGNUP !== '0',
    school: req.school ?? null,
  });
});

export default r;
