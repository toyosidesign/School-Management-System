import { Router } from 'express';
import { db } from '../db/index.js';
import { authenticate } from '../lib/auth.js';

const r = Router();
r.use(authenticate);

const DEFAULTS = {
  font: 'standard', text_scale: 100, bionic: 0, tint: 'white',
  high_targets: 0, captions: 0, low_sensory: 0, focus_mode: 0, voice_speed: 1.0,
};

r.get('/prefs', (req, res) => {
  const row = db.prepare('SELECT * FROM accessibility_prefs WHERE user_id = ?').get(req.user.id);
  res.json(row ?? { user_id: req.user.id, ...DEFAULTS });
});

/** Saves the toolbar overlay as the user's default preset (PRD §8.3). */
r.put('/prefs', (req, res) => {
  const p = { ...DEFAULTS, ...(req.body ?? {}) };
  const bool = (v) => (v ? 1 : 0);
  db.prepare(
    `INSERT INTO accessibility_prefs
       (user_id, font, text_scale, bionic, tint, high_targets, captions, low_sensory, focus_mode, voice_speed, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (user_id) DO UPDATE SET
       font = excluded.font, text_scale = excluded.text_scale, bionic = excluded.bionic,
       tint = excluded.tint, high_targets = excluded.high_targets, captions = excluded.captions,
       low_sensory = excluded.low_sensory, focus_mode = excluded.focus_mode,
       voice_speed = excluded.voice_speed, updated_at = datetime('now')`
  ).run(
    req.user.id, p.font, Number(p.text_scale) || 100, bool(p.bionic), p.tint,
    bool(p.high_targets), bool(p.captions), bool(p.low_sensory), bool(p.focus_mode),
    Number(p.voice_speed) || 1.0
  );
  res.json(db.prepare('SELECT * FROM accessibility_prefs WHERE user_id = ?').get(req.user.id));
});

export default r;
