import { useState } from 'react';
import { api } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useToast } from '../context/ToastContext';
import Icon from './Icon';
import Select from './Select';
import { Avatar, Badge, Loading, Toggle } from './ui';

/**
 * Who holds which tier, and the one place a rank is handed over.
 *
 * Roles are set on a person's staff record too; this is the same act gathered
 * in one view, because "who can do what here" is a question asked about the
 * whole school rather than one person at a time.
 */
export default function RolesAndAccess({ owner }: { owner: boolean }) {
  const { toast } = useToast();
  const staff = useFetch<any[]>('/staff');
  const access = useFetch<any>('/permissions');
  const [busy, setBusy] = useState(0);
  const [saving, setSaving] = useState('');

  /**
   * One line of the matrix, changed.
   *
   * Sent as a decision about a single permission rather than the whole grid, so
   * two people editing this at once cannot overwrite each other's answers with
   * a snapshot taken before the other pressed anything.
   */
  const setPermission = async (permission: any, role: string, allowed: boolean) => {
    setSaving(`${role}:${permission.key}`);
    try {
      await api.put('/permissions', { role, permission: permission.key, allowed });
      const who = role === 'super' ? 'Super administrators'
        : role === 'admin' ? 'Administrators' : 'Teachers';
      toast(allowed
        ? `${who} may now: ${permission.label.toLowerCase()}.`
        : `${who} no longer have ${permission.label.toLowerCase()}.`);
      access.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setSaving('');
    }
  };

  const setRole = async (person: any, value: string) => {
    setBusy(person.id);
    try {
      await api.patch(`/staff/${person.id}`, {
        role: value === 'teacher' ? 'teacher' : 'admin',
        is_super_admin: value === 'super',
      });
      toast(`${person.first_name} ${person.last_name} is now ${
        value === 'super' ? 'a super administrator' : value === 'admin' ? 'an administrator' : 'a teacher'}.`);
      staff.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(0);
    }
  };

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
        <Icon name="shield" className="h-5 w-5 shrink-0 text-brand-600" /> What each role may do
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Checked on every request, not just hidden from the menus.{' '}
        {owner
          ? 'Setting these is guarded by the rank rather than by the grid, so anything turned off here can always be turned back on.'
          : 'Set by a super administrator.'}
      </p>
      <p className="mt-2 text-xs text-ink-faint">
        Pupils and guardians are not listed. A pupil’s record carries medical notes, an address and emergency
        contacts, so their access is granted per record rather than per role: a teacher sees the pupils they
        teach, a guardian sees their own children, and neither is a setting.
      </p>

      {access.loading && <Loading rows={3} />}

      {access.data && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="py-2 pr-3 font-bold">Part of the job</th>
                <th className="w-28 px-3 py-2 font-bold">Super admin</th>
                <th className="w-28 px-3 py-2 font-bold">Administrator</th>
                <th className="w-28 px-3 py-2 font-bold">Teacher</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {access.data.permissions.map((permission: any) => (
                <tr key={permission.key}>
                  <td className="py-2.5 pr-3">
                    <span className="block font-semibold text-ink">{permission.label}</span>
                    <span className="block text-xs text-ink-faint">{permission.detail}</span>
                  </td>
                  {['super', 'admin', 'teacher'].map((role) => (
                    <td key={role} className="px-3 py-2.5">
                      {owner ? (
                        <span className="flex items-center gap-2">
                          <Toggle
                            checked={permission.roles[role].allowed}
                            onChange={(v) => setPermission(permission, role, v)}
                            label=""
                            ariaLabel={`${permission.label} for ${
                              role === 'super' ? 'super administrators'
                                : role === 'admin' ? 'administrators' : 'teachers'}`}
                            disabled={saving === `${role}:${permission.key}`}
                          />
                          {permission.roles[role].decided && (
                            <span className="text-[11px] text-ink-faint">yours</span>
                          )}
                        </span>
                      ) : (
                        <Icon
                          name={permission.roles[role].allowed ? 'check' : 'x'}
                          className={`h-4 w-4 ${permission.roles[role].allowed ? 'text-green-600' : 'text-ink-faint'}`}
                          strokeWidth={3}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="mt-6 text-sm font-bold uppercase tracking-wide text-ink-soft">Who holds what</h3>
      <p className="mt-1 text-xs text-ink-faint">
        {owner
          ? 'Changing somebody here changes it on their staff record too. The school can never be left without a super administrator.'
          : 'Only a super administrator can change these. Pupils and guardians are not listed: their access comes from the child they belong to.'}
      </p>

      {staff.loading && <Loading rows={2} />}

      <ul className="mt-3 divide-y divide-line">
        {(staff.data ?? []).map((person: any) => (
          <li key={person.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <Avatar first={person.first_name} last={person.last_name} colour={person.avatar_colour}
                    src={person.avatar_url} emoji={person.avatar_emoji} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">
                {person.first_name} {person.last_name}
              </span>
              <span className="block truncate text-xs text-ink-faint">{person.email}</span>
            </span>
            {owner ? (
              <span className="w-full sm:w-56">
                <Select
                  ariaLabel={`Role for ${person.first_name} ${person.last_name}`}
                  disabled={busy === person.id}
                  value={person.is_super_admin ? 'super' : person.role}
                  onChange={(v) => setRole(person, v)}
                  options={[
                    { value: 'teacher', label: 'Teacher' },
                    { value: 'admin', label: 'Administrator' },
                    { value: 'super', label: 'Super administrator' },
                  ]}
                />
              </span>
            ) : (
              <Badge tone={person.role === 'admin' ? 'violet' : 'brand'}>
                {person.is_super_admin ? 'super admin' : person.role}
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
