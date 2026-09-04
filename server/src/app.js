import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { migrate } from './db/index.js';
import { apiLimiter, loginLimiter, inviteLimiter, contentSecurityPolicy, uploadHeaders, imageHeaders } from './lib/security.js';
import { resolveSchool } from './lib/tenant.js';
import auth from './routes/auth.js';
import accessibility from './routes/accessibility.js';
import sis from './routes/sis.js';
import permissions from './routes/permissions.js';
import academics from './routes/academics.js';
import submissions from './routes/submissions.js';
import collaboration from './routes/collaboration.js';
import operations from './routes/operations.js';
import publicSite from './routes/public.js';
import website from './routes/website.js';
import staffLeave from './routes/staffLeave.js';
import invites from './routes/invites.js';
import finance from './routes/finance.js';
import { db } from './db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Builds the express app without binding a port, so the test suite can drive it
 * directly and the entrypoint stays a thin listener.
 */
export function createApp({ serveClient = true } = {}) {
  migrate();

  const app = express();

  app.set('trust proxy', 1);
  app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') ?? true, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Security headers on everything the app serves.
  app.use(contentSecurityPolicy);

  // PRD §5 rate limiting. Anonymous traffic is capped per IP; signed-in traffic
  // is capped per user, because an entire school shares one outbound address.
  // Which school this request is for, decided before anything reads anything.
  app.use(resolveSchool);

  app.use('/api/auth/login', loginLimiter());
  app.use('/api/invites/token', inviteLimiter());
  app.use('/api', apiLimiter());

  // Staff-uploaded material has to be viewable in place: branding imagery in an
  // <img>, lesson attachments opened in a tab. Mounted first, being more
  // specific than the pupil-submission path below.
  const staticOpts = { dotfiles: 'deny', index: false, fallthrough: false };
  for (const dir of ['brand', 'site', 'lessons', 'avatars']) {
    app.use(`/uploads/${dir}`, imageHeaders,
      express.static(path.join(__dirname, `../uploads/${dir}`), staticOpts));
  }

  // Everything else in uploads is pupil-submitted: attacker-controlled bytes on
  // our own origin, so never rendered inline.
  app.use('/uploads', uploadHeaders, express.static(path.join(__dirname, '../uploads'), {
    ...staticOpts,
    fallthrough: true,
    setHeaders: (res) => res.setHeader('Content-Disposition', 'attachment'),
  }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime_seconds: Math.round(process.uptime()),
      students: db.prepare("SELECT COUNT(*) n FROM students WHERE status='active'").get().n,
      version: '1.0.0',
    });
  });

  app.use('/api/public', publicSite);   // unauthenticated: the school's website
  app.use('/api/auth', auth);
  app.use('/api/invites', invites);
  app.use('/api/accessibility', accessibility);
  app.use('/api/permissions', permissions);
  app.use('/api', sis);
  app.use('/api', academics);
  app.use('/api', submissions);
  app.use('/api', collaboration);
  app.use('/api', operations);
  app.use('/api/website', website);
  app.use('/api/staff-leave', staffLeave);
  app.use('/api/finance', finance);

  // Serve the built SPA in production.
  const clientDist = path.join(__dirname, '../../client/dist');
  if (serveClient && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found' }));

  app.use((err, _req, res, _next) => {
    if (process.env.NODE_ENV !== 'test') console.error(err);
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large (200 MB max)' });
    if (err?.message?.startsWith('Logo must be')) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
  });

  return app;
}
