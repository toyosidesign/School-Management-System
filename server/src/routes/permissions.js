import { Router } from 'express';
import { db, audit } from '../db/index.js';
import { authenticate, requireRole, requireSuperAdmin } from '../lib/auth.js';
import { PERMISSIONS, SETTABLE_ROLES, matrix } from '../lib/permissions.js';

const r = Router();
r.use(authenticate);

/**
 * What every role may do, as it stands.
 *
 * Readable by any administrator, because knowing the shape of access is part of
 * running the office; changeable only by the person who holds the school.
 */
r.get('/', requireRole('admin', 'teacher'), (_req, res) => {
  res.json({ roles: SETTABLE_ROLES, permissions: matrix() });
});

/**
 * The school deciding one line differently.
 *
 * Stored as a decision rather than a copy of the whole matrix, so a permission
 * added to the platform later arrives with its default rather than switched off
 * by a matrix saved before it existed.
 */
r.put('/', requireSuperAdmin, (req, res) => {
  const { role, permission, allowed } = req.body ?? {};
  if (!SETTABLE_ROLES.includes(role)) {
    return res.status(400).json({
      error: 'Permissions are set for super administrators, administrators and teachers',
    });
  }
  const known = PERMISSIONS.find((p) => p.key === permission);
  if (!known) return res.status(400).json({ error: 'No such permission' });

  const fallback = role === 'super' ? true : !!known.defaults[role];
  const isDefault = fallback === !!allowed;
  if (isDefault) {
    // Back to the default is the absence of a decision, not a decision to agree
    // with one: a permission that later changes shape should follow the code.
    db.prepare('DELETE FROM role_permissions WHERE role = ? AND permission = ?').run(role, permission);
  } else {
    db.prepare(
      `INSERT INTO role_permissions (role, permission, allowed, set_by, set_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT (role, permission) DO UPDATE SET
         allowed = excluded.allowed, set_by = excluded.set_by, set_at = datetime('now')`
    ).run(role, permission, allowed ? 1 : 0, req.user.id);
  }

  audit({ user: req.user, action: 'update', entity: 'role_permissions', entityId: `${role}:${permission}`,
          next: { allowed: !!allowed }, ip: req.ip });
  res.json({ roles: SETTABLE_ROLES, permissions: matrix() });
});

export default r;
