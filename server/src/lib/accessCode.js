import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';

/**
 * Short sign-in codes for pupils.
 *
 * Deliberately avoids letters and digits that look alike when read aloud or
 * written on a slip: no O/0, I/1, S/5. A child copying a code off paper should
 * not be defeated by the font.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRTUVWXYZ23456789';
const CODE_LENGTH = 8;
const DEFAULT_TTL_HOURS = 72;

export function generateCode() {
  const raw = Array.from({ length: CODE_LENGTH }, () =>
    ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  // Grouped for reading out: ABCD-EFGH
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export const normalise = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Issues a code, replacing any outstanding one for that pupil. */
export function issueCode(userId, issuedBy, ttlHours = DEFAULT_TTL_HOURS) {
  const code = generateCode();
  const expires = new Date(Date.now() + ttlHours * 3600_000).toISOString();

  db.prepare("UPDATE access_codes SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL")
    .run(userId);

  db.prepare(
    'INSERT INTO access_codes (user_id, code_hash, code_hint, issued_by, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, bcrypt.hashSync(normalise(code), 10), code.slice(-2), issuedBy ?? null, expires);

  // Returned once, to be handed to the pupil. It is not recoverable afterwards.
  return { code, expires_at: expires };
}

/**
 * Finds the pupil a code belongs to, or null.
 *
 * A code stays valid until it expires or the school revokes it, rather than
 * burning on first use: a pupil signs in most days, and issuing a fresh code
 * every session would be unworkable for staff. Reissuing revokes the old one.
 */
export function redeemCode(code) {
  const cleaned = normalise(code);
  if (cleaned.length !== CODE_LENGTH) return null;

  const candidates = db.prepare(
    `SELECT ac.*, u.role FROM access_codes ac JOIN users u ON u.id = ac.user_id
     WHERE ac.revoked_at IS NULL
       AND datetime(ac.expires_at) > datetime('now') AND u.is_active = 1`
  ).all();

  // Codes are short, so the hint narrows the set before any bcrypt work.
  for (const row of candidates.filter((c) => c.code_hint === cleaned.slice(-2))) {
    if (bcrypt.compareSync(cleaned, row.code_hash)) {
      db.prepare("UPDATE access_codes SET last_used_at = datetime('now') WHERE id = ?").run(row.id);
      return row;
    }
  }
  return null;
}

export function activeCodeFor(userId) {
  return db.prepare(
    `SELECT id, code_hint, expires_at, last_used_at, created_at FROM access_codes
     WHERE user_id = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
     ORDER BY id DESC LIMIT 1`
  ).get(userId) ?? null;
}
