import { db } from '../db/index.js';

/**
 * What a school can decide for itself about who may do what.
 *
 * Roles are the four tiers the platform is built on; permissions are the parts
 * of the job that schools genuinely divide differently. One school's office
 * runs the fees and another's bursar is the only one allowed near them; one
 * lets a senior teacher build the timetable and another keeps it with the head.
 * Those are the lines that move, so those are the ones that are settable.
 *
 * What is NOT here is deliberate. A guardian only ever seeing their own child,
 * a teacher only the pupils they teach, the audit log being unalterable: those
 * are not preferences, and a school that could switch them off would be one
 * mis-click from a data breach it could not undo.
 */
export const PERMISSIONS = [
  { key: 'students.manage', label: 'Pupils',
    detail: 'Enrol, edit and remove pupils, and import a roll',
    defaults: { super: true, admin: true, teacher: false } },
  { key: 'staff.manage', label: 'Staff records',
    detail: 'Take on staff, edit their records, import a list',
    defaults: { super: true, admin: true, teacher: false } },
  { key: 'curriculum.manage', label: 'Classes, subjects and the timetable',
    detail: 'Sections, classes, subjects, who teaches what, and the week',
    defaults: { super: true, admin: true, teacher: false } },
  { key: 'sen.manage', label: 'Support plans',
    detail: 'Write and remove SEN plans, and import them',
    defaults: { super: true, admin: true, teacher: false } },
  { key: 'finance.manage', label: 'Fees and the ledger',
    detail: 'Invoices, payments, suppliers, budgets and journals',
    defaults: { super: true, admin: true, teacher: false } },
  { key: 'website.manage', label: 'Website and branding',
    detail: 'Public pages, news, admissions inbox, logo and colours',
    defaults: { super: true, admin: true, teacher: false } },
  { key: 'audit.read', label: 'Audit trail',
    detail: 'Read the record of who changed what. Nobody can alter it',
    defaults: { super: true, admin: true, teacher: false } },
  { key: 'invites.manage', label: 'Invitations',
    detail: 'Invite people to the platform and reissue sign-in links',
    defaults: { super: true, admin: true, teacher: false } },
  { key: 'leave.decide', label: 'Staff leave',
    detail: 'Approve or refuse a colleague’s leave request',
    defaults: { super: true, admin: true, teacher: false } },
  { key: 'pupil_leave.decide', label: 'Pupil absence',
    detail: 'Approve or refuse a reported absence, which marks the register',
    defaults: { super: true, admin: true, teacher: false } },
];

const BY_KEY = new Map(PERMISSIONS.map((p) => [p.key, p]));

/**
 * The roles a school may set permissions for. Pupils and guardians are not
 * among them: their access comes from the child they are, or the child they
 * belong to, and is decided per record rather than per role.
 *
 * `super` is the super administrator, kept apart from `admin` because it is a
 * rank on top of that role rather than a role of its own. Switching a part of
 * the job off for themselves is allowed — a head who does not touch the ledger
 * can say so — and cannot lock them out, because setting these is guarded by
 * the rank itself and never by the grid.
 */
export const SETTABLE_ROLES = ['super', 'admin', 'teacher'];

/** Which row of the grid a person is answered by. */
const rowFor = (user) => (user.role === 'admin' && user.is_super_admin ? 'super' : user.role);

/**
 * Whether this person may do this thing.
 *
 * A super administrator is never refused: they are the one who grants and
 * removes these, so a school that switched something off could otherwise lock
 * the ability to switch it back on inside the thing it switched off.
 */
export function can(user, key) {
  if (!user) return false;

  const permission = BY_KEY.get(key);
  if (!permission) return false;

  const row = rowFor(user);
  const set = db.prepare('SELECT allowed FROM role_permissions WHERE role = ? AND permission = ?')
    .get(row, key);
  if (set) return !!set.allowed;
  // A super administrator holds every part of the job unless the school has
  // said otherwise about this one.
  return row === 'super' ? true : !!permission.defaults[user.role];
}

/** The whole matrix as it stands, defaults and decisions together. */
export function matrix() {
  const set = db.prepare('SELECT role, permission, allowed FROM role_permissions').all();
  return PERMISSIONS.map((permission) => ({
    ...permission,
    roles: Object.fromEntries(SETTABLE_ROLES.map((role) => {
      const decided = set.find((row) => row.role === role && row.permission === permission.key);
      const fallback = role === 'super' ? true : !!permission.defaults[role];
      return [role, {
        allowed: decided ? !!decided.allowed : fallback,
        decided: !!decided,
      }];
    })),
  }));
}

export function requirePermission(key) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!can(req.user, key)) {
      const permission = BY_KEY.get(key);
      return res.status(403).json({
        error: `Your role does not have access to ${permission?.label.toLowerCase() ?? 'this'}`,
      });
    }
    next();
  };
}
