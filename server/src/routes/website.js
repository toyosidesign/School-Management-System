import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, audit } from '../db/index.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { requirePermission } from '../lib/permissions.js';
import { getSettings } from './public.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const brandDir = path.join(__dirname, '../../uploads/brand');
const siteDir = path.join(__dirname, '../../uploads/site');
fs.mkdirSync(brandDir, { recursive: true });
fs.mkdirSync(siteDir, { recursive: true });

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];
const IMAGE_SIGNATURES = {
  '.png':  [[0x89, 0x50, 0x4e, 0x47]],
  '.jpg':  [[0xff, 0xd8, 0xff]],
  '.jpeg': [[0xff, 0xd8, 0xff]],
  '.webp': [[0x52, 0x49, 0x46, 0x46]],
};

/** Same reasoning as pupil uploads: an extension allowlist alone is not enough. */
function isRealImage(filePath, ext) {
  const expected = IMAGE_SIGNATURES[ext];
  if (!expected) return false;
  try {
    const fd = fs.openSync(filePath, 'r');
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
    return expected.some((sig) => sig.every((byte, i) => head[i] === byte));
  } catch {
    return false;
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: brandDir,
    filename: (_req, file, cb) => cb(null, `logo-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // SVG is deliberately excluded: it is a scriptable document, and this file
    // is served from the same origin as the app and the session token.
    const ok = IMAGE_EXTS.includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Logo must be a PNG, JPG or WebP file'), ok);
  },
});

const r = Router();
r.use(authenticate);

/* ── Branding ─────────────────────────────────────────────────────────────── */
/** Stored as 0/1 in SQLite, so a JSON boolean has to be coerced before binding. */
const BOOLEAN_FIELDS = new Set(['admissions_open', 'tours_open', 'campaign_enabled']);

const SETTING_FIELDS = [
  'name', 'short_name', 'tagline', 'monogram', 'favicon_emoji',
  'brand_primary', 'brand_accent', 'heading_font', 'established_year',
  'address', 'phone', 'email', 'office_hours', 'map_embed_url',
  'facebook_url', 'instagram_url', 'x_url', 'linkedin_url',
  'academic_year', 'currency', 'admissions_open', 'tours_open', 'section_labels',
  'whatsapp_number', 'whatsapp_message',
  'campaign_enabled', 'campaign_label', 'campaign_slug', 'campaign_target_date',
];

r.get('/settings', (_req, res) => res.json(getSettings()));

r.put('/settings', requirePermission('website.manage'), (req, res) => {
  const prev = getSettings();
  const b = req.body ?? {};
  const set = SETTING_FIELDS.filter((f) => f in b);
  if (!set.length) return res.json(prev);

  for (const f of ['brand_primary', 'brand_accent']) {
    if (f in b && !/^#[0-9a-fA-F]{6}$/.test(String(b[f]))) {
      return res.status(400).json({ error: `${f.replace('_', ' ')} must be a hex colour such as #2563eb` });
    }
  }
  if ('name' in b && !String(b.name).trim()) {
    return res.status(400).json({ error: 'School name cannot be empty' });
  }

  db.prepare(
    `UPDATE school_settings SET ${set.map((f) => `${f} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = 1`
  ).run(...set.map((f) => (BOOLEAN_FIELDS.has(f) ? (b[f] ? 1 : 0) : b[f] ?? null)));

  const next = getSettings();
  audit({
    user: req.user, action: 'branding_update', entity: 'school_settings', entityId: 1,
    prev: Object.fromEntries(set.map((f) => [f, prev[f]])),
    next: Object.fromEntries(set.map((f) => [f, next[f]])), ip: req.ip,
  });
  res.json(next);
});

r.post('/settings/logo', requirePermission('website.manage'), upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image was uploaded' });
  const url = `/uploads/brand/${req.file.filename}`;
  const prev = getSettings();
  db.prepare("UPDATE school_settings SET logo_url = ?, updated_at = datetime('now') WHERE id = 1").run(url);
  audit({ user: req.user, action: 'branding_update', entity: 'school_settings', entityId: 1,
          prev: { logo_url: prev.logo_url }, next: { logo_url: url }, ip: req.ip });
  res.status(201).json(getSettings());
});

r.delete('/settings/logo', requirePermission('website.manage'), (req, res) => {
  db.prepare("UPDATE school_settings SET logo_url = NULL, updated_at = datetime('now') WHERE id = 1").run();
  audit({ user: req.user, action: 'branding_update', entity: 'school_settings', entityId: 1, next: { logo_url: null }, ip: req.ip });
  res.json(getSettings());
});

/**
 * The browser tab icon as a file, for schools with a real mark to use. Small on
 * purpose: this is drawn at 16 or 32 pixels, so anything large is wasted bytes
 * on every page load. The emoji stays as the fallback when no file is set.
 */
const faviconUpload = multer({
  storage: multer.diskStorage({
    destination: brandDir,
    filename: (_req, file, cb) => cb(null, `favicon-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 512 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = IMAGE_EXTS.includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Favicon must be a PNG, JPG or WebP file'), ok);
  },
});

/** Removes a previously uploaded brand file, so replacing one does not pile up. */
function forgetBrandFile(url) {
  if (!url?.startsWith('/uploads/brand/')) return;
  fs.rmSync(path.join(brandDir, path.basename(url)), { force: true });
}

r.post('/settings/favicon', requirePermission('website.manage'), faviconUpload.single('favicon'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image was uploaded' });

  const ext = path.extname(req.file.filename).toLowerCase();
  if (!isRealImage(req.file.path, ext)) {
    fs.rmSync(req.file.path, { force: true });
    return res.status(400).json({ error: 'That file is not a real PNG, JPG or WebP image' });
  }

  const url = `/uploads/brand/${req.file.filename}`;
  const prev = getSettings();
  db.prepare("UPDATE school_settings SET favicon_url = ?, updated_at = datetime('now') WHERE id = 1").run(url);
  forgetBrandFile(prev.favicon_url);

  audit({ user: req.user, action: 'branding_update', entity: 'school_settings', entityId: 1,
          prev: { favicon_url: prev.favicon_url }, next: { favicon_url: url }, ip: req.ip });
  res.status(201).json(getSettings());
});

r.delete('/settings/favicon', requirePermission('website.manage'), (req, res) => {
  const prev = getSettings();
  db.prepare("UPDATE school_settings SET favicon_url = NULL, updated_at = datetime('now') WHERE id = 1").run();
  forgetBrandFile(prev.favicon_url);
  audit({ user: req.user, action: 'branding_update', entity: 'school_settings', entityId: 1,
          prev: { favicon_url: prev.favicon_url }, next: { favicon_url: null }, ip: req.ip });
  res.json(getSettings());
});

/** Photography for a content block: hero images, section imagery. */
const siteUpload = multer({
  storage: multer.diskStorage({
    destination: siteDir,
    filename: (req, file, cb) =>
      cb(null, `${req.params.page}-${req.params.slot}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = IMAGE_EXTS.includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Image must be a PNG, JPG or WebP file'), ok);
  },
});

/* ── Page content ─────────────────────────────────────────────────────────── */
r.get('/content', (_req, res) => {
  res.json(db.prepare('SELECT * FROM site_content ORDER BY page, sort_order').all()
    .map((c) => ({ ...c, extra: safeJson(c.extra, null) })));
});

r.put('/content/:page/:slot', requirePermission('website.manage'), (req, res) => {
  const { page, slot } = req.params;
  const b = req.body ?? {};
  const prev = db.prepare('SELECT * FROM site_content WHERE page = ? AND slot = ?').get(page, slot);

  db.prepare(
    `INSERT INTO site_content (page, slot, heading, body, media_url, extra, sort_order, is_visible, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (page, slot) DO UPDATE SET
       heading = excluded.heading, body = excluded.body, media_url = excluded.media_url,
       extra = excluded.extra, sort_order = excluded.sort_order,
       is_visible = excluded.is_visible, updated_at = datetime('now')`
  ).run(page, slot, b.heading ?? null, b.body ?? null, b.media_url ?? null,
        b.extra == null ? null : JSON.stringify(b.extra),
        b.sort_order ?? prev?.sort_order ?? 0,
        b.is_visible === false ? 0 : 1);

  audit({ user: req.user, action: 'content_update', entity: 'site_content', entityId: `${page}/${slot}`,
          prev: prev ? { heading: prev.heading } : null, next: { heading: b.heading }, ip: req.ip });

  const out = db.prepare('SELECT * FROM site_content WHERE page = ? AND slot = ?').get(page, slot);
  res.json({ ...out, extra: safeJson(out.extra, null) });
});

r.post('/content/:page/:slot/media', requirePermission('website.manage'), siteUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image was uploaded' });

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!isRealImage(req.file.path, ext)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: `That file does not appear to be a real ${ext.slice(1).toUpperCase()} image.` });
  }

  const { page, slot } = req.params;
  const url = `/uploads/site/${req.file.filename}`;
  const prev = db.prepare('SELECT media_url FROM site_content WHERE page = ? AND slot = ?').get(page, slot);

  db.prepare(
    `INSERT INTO site_content (page, slot, media_url, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (page, slot) DO UPDATE SET media_url = excluded.media_url, updated_at = datetime('now')`
  ).run(page, slot, url);

  audit({ user: req.user, action: 'content_media', entity: 'site_content', entityId: `${page}/${slot}`,
          prev: prev ?? null, next: { media_url: url }, ip: req.ip });

  res.status(201).json(db.prepare('SELECT * FROM site_content WHERE page = ? AND slot = ?').get(page, slot));
});

r.delete('/content/:page/:slot/media', requirePermission('website.manage'), (req, res) => {
  const { page, slot } = req.params;
  db.prepare("UPDATE site_content SET media_url = NULL, updated_at = datetime('now') WHERE page = ? AND slot = ?")
    .run(page, slot);
  audit({ user: req.user, action: 'content_media', entity: 'site_content', entityId: `${page}/${slot}`,
          next: { media_url: null }, ip: req.ip });
  res.json({ ok: true });
});

/* ── News ─────────────────────────────────────────────────────────────────── */
r.get('/news', (_req, res) => {
  res.json(db.prepare(
    `SELECT n.*, u.first_name || ' ' || u.last_name AS author FROM news_posts n
     LEFT JOIN users u ON u.id = n.author_id ORDER BY n.published_at DESC`
  ).all());
});

r.post('/news', requireRole('admin', 'teacher'), (req, res) => {
  const b = req.body ?? {};
  if (!b.title?.trim() || !b.body?.trim()) return res.status(400).json({ error: 'Title and body are required' });

  const base = slugify(b.title);
  let slug = base;
  let n = 2;
  while (db.prepare('SELECT 1 FROM news_posts WHERE slug = ?').get(slug)) slug = `${base}-${n++}`;

  const out = db.prepare(
    `INSERT INTO news_posts (title, slug, excerpt, body, category, cover_colour, is_published, author_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(b.title.trim(), slug, b.excerpt ?? null, b.body.trim(), b.category ?? 'news',
        b.cover_colour ?? '#2563eb', b.is_published === false ? 0 : 1, req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM news_posts WHERE id = ?').get(out.lastInsertRowid));
});

r.patch('/news/:id', requireRole('admin', 'teacher'), (req, res) => {
  const prev = db.prepare('SELECT * FROM news_posts WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Article not found' });
  const fields = ['title', 'excerpt', 'body', 'category', 'cover_colour', 'is_published'];
  const set = fields.filter((f) => f in (req.body ?? {}));
  if (set.length) {
    db.prepare(`UPDATE news_posts SET ${set.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`)
      .run(...set.map((f) => (f === 'is_published' ? (req.body[f] ? 1 : 0) : req.body[f])), prev.id);
  }
  res.json(db.prepare('SELECT * FROM news_posts WHERE id = ?').get(prev.id));
});

r.delete('/news/:id', requirePermission('website.manage'), (req, res) => {
  const prev = db.prepare('SELECT * FROM news_posts WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Article not found' });
  db.prepare('DELETE FROM news_posts WHERE id = ?').run(prev.id);
  audit({ user: req.user, action: 'delete', entity: 'news_posts', entityId: prev.id, prev, ip: req.ip });
  res.json({ ok: true });
});

/* ── Admissions inbox ─────────────────────────────────────────────────────── */
r.get('/admissions', requireRole('admin', 'teacher'), (req, res) => {
  const { status, kind } = req.query;
  const where = ['1=1']; const args = [];
  if (status) { where.push('e.status = ?'); args.push(status); }
  if (kind) { where.push('e.kind = ?'); args.push(kind); }
  res.json(db.prepare(
    `SELECT e.*, u.first_name || ' ' || u.last_name AS assigned_name
     FROM admissions_enquiries e LEFT JOIN users u ON u.id = e.assigned_to
     WHERE ${where.join(' AND ')} ORDER BY e.created_at DESC`
  ).all(...args));
});

/**
 * Marks an enquiry as read, once somebody has actually opened it.
 *
 * Kept apart from the pipeline stage it sits at: an enquiry read on the morning
 * it arrives is still at the new stage that afternoon, and an inbox that treats
 * the two as one thing either loses track of what has been seen or moves
 * families along a pipeline nobody decided to move them along.
 */
r.post('/admissions/:id/read', requirePermission('website.manage'), (req, res) => {
  const row = db.prepare('SELECT * FROM admissions_enquiries WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Enquiry not found' });

  if (!row.read_at) {
    db.prepare("UPDATE admissions_enquiries SET read_at = datetime('now') WHERE id = ?").run(row.id);
  }
  res.json(db.prepare('SELECT * FROM admissions_enquiries WHERE id = ?').get(row.id));
});

r.patch('/admissions/:id', requirePermission('website.manage'), (req, res) => {
  const prev = db.prepare('SELECT * FROM admissions_enquiries WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Enquiry not found' });

  const fields = ['status', 'internal_note', 'assigned_to'];
  const set = fields.filter((f) => f in (req.body ?? {}));
  if (set.length) {
    db.prepare(
      `UPDATE admissions_enquiries SET ${set.map((f) => `${f} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`
    ).run(...set.map((f) => req.body[f]), prev.id);
  }
  audit({ user: req.user, action: 'admissions_update', entity: 'admissions_enquiries', entityId: prev.id,
          prev: { status: prev.status }, next: { status: req.body.status ?? prev.status }, ip: req.ip });
  res.json(db.prepare('SELECT * FROM admissions_enquiries WHERE id = ?').get(prev.id));
});

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
function safeJson(v, fallback) {
  try { return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

export default r;
