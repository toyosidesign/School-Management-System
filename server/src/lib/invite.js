import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './../db/index.js';

/**
 * One-time invitations to create an account.
 *
 * The school always makes the first move: an administrator invites someone by
 * email and they follow a link to set their own password. That keeps two
 * properties a school needs. Nobody can register uninvited against a system
 * holding children's records, and no member of staff ever knows another
 * person's password, because no default is ever set on their behalf.
 */

const DEFAULT_TTL_DAYS = 7;
/** Long enough that guessing is hopeless, short enough to paste into a message. */
const TOKEN_BYTES = 32;

export const INVITABLE_ROLES = ['admin', 'teacher', 'parent'];

function newToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/** The link a school sends. Absolute, so it survives being pasted anywhere. */
export function inviteLink(token, req) {
  const base = process.env.PUBLIC_URL
    || (req ? `${req.protocol}://${req.get('host')}` : 'http://localhost:5173');
  return `${base.replace(/\/$/, '')}/activate/${token}`;
}

/** Writes a fresh token onto an invite row and returns the plain token once. */
export function issueToken(inviteId, ttlDays = DEFAULT_TTL_DAYS) {
  const token = newToken();
  const expires = new Date(Date.now() + ttlDays * 86_400_000).toISOString();
  db.prepare(
    `UPDATE account_invites SET token_hash = ?, token_hint = ?, expires_at = ?, revoked_at = NULL
     WHERE id = ?`
  ).run(bcrypt.hashSync(token, 10), token.slice(-6), expires, inviteId);
  return { token, expires_at: expires };
}

/**
 * Resolves a token to its invite, or null. The hint narrows the candidate set
 * so a single bcrypt comparison does the real work.
 */
export function findByToken(token) {
  const raw = String(token ?? '');
  if (raw.length < 20) return null;

  const candidates = db.prepare(
    `SELECT * FROM account_invites
     WHERE token_hint = ? AND accepted_at IS NULL AND revoked_at IS NULL`
  ).all(raw.slice(-6));

  for (const row of candidates) {
    if (bcrypt.compareSync(raw, row.token_hash)) return row;
  }
  return null;
}

/** Open invites only: expiry is a reason to resend, not to leak the old link. */
export function isLive(invite) {
  return !!invite && !invite.accepted_at && !invite.revoked_at
    && new Date(invite.expires_at).getTime() > Date.now();
}

export function statusOf(invite) {
  if (invite.accepted_at) return 'accepted';
  if (invite.revoked_at) return 'revoked';
  if (new Date(invite.expires_at).getTime() <= Date.now()) return 'expired';
  return 'pending';
}
