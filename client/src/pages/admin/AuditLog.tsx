import { useEffect, useState } from 'react';
import { useFetch } from '../../lib/useFetch';
import { qs } from '../../lib/api';
import { dateTime, relative } from '../../lib/format';
import Icon from '../../components/Icon';
import Select from '../../components/Select';
import { Badge, EmptyState, ErrorNote, Loading, PageHeader, Pagination, TableCard } from '../../components/ui';

const ACTION_TONE: Record<string, any> = {
  login: 'slate', login_code: 'slate', create: 'green', update: 'brand', delete: 'red',
  import: 'violet', grade_update: 'violet', payment: 'green', attendance_mark: 'amber',
  leave_decision: 'brand', sign_slip: 'violet', exam_start: 'amber',
  password_change: 'red', publish_material: 'green', admissions_update: 'brand',
};

/** What the platform calls a table, in the words the school would use. */
const RECORD_LABEL: Record<string, string> = {
  users: 'Accounts', students: 'Pupils', staff: 'Staff', classes: 'Classes',
  class_subjects: 'What a class is taught', subjects: 'Subjects', sections: 'Year groups',
  timetable_slots: 'Timetable', attendance: 'Attendance', submissions: 'Marking',
  invoices: 'Fees', payments: 'Payments', journals: 'Ledger', iep_profiles: 'Support plans',
  leave_requests: 'Pupil absence', staff_leave: 'Staff leave', account_invites: 'Invitations',
  admissions_enquiries: 'Admissions', role_permissions: 'Roles and access',
  subject_teachers: 'Who teaches what', section_teachers: 'Who works where',
  school_settings: 'School settings', site_content: 'Website',
};

const say = (entity: string) => RECORD_LABEL[entity] ?? entity.replace(/_/g, ' ');

/**
 * The record of who changed what.
 *
 * Read down a column like the rest of the app's lists, and filtered by what the
 * log actually holds rather than a list written when the platform was smaller:
 * a filter for a record nobody touches is noise, and a missing one hides the
 * thing being written daily.
 */
export default function AuditLog() {
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [days, setDays] = useState('');
  const [who, setWho] = useState('');
  const [shown, setShown] = useState<number | null>(null);

  const { data, loading, error, reload } =
    useFetch<any>(`/audit${qs({ entity, action, q, days, who, limit: 300 })}`,
                  [entity, action, q, days, who]);

  const all = data?.entries ?? [];

  // A log is read a screenful at a time: it is the newest few that answer
  // "what just happened", and three hundred rows bury them.
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const entries = all.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);

  // Narrowing the log starts again from the newest, not halfway down the
  // previous answer.
  useEffect(() => { setPage(1); }, [entity, action, q, days, who]);

  return (
    <>
      <PageHeader
        icon="shield" title="Audit log"
        subtitle="Who changed what, when, and from where. Entries cannot be edited or deleted, by anybody, including an administrator: the database itself refuses it."
      />

      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <label className="relative block w-full min-w-[14rem] flex-1">
          <span className="sr-only">Search the log</span>
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input className="input !pl-10" type="search" value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Search a name or a value…" />
        </label>

        <Select
          ariaLabel="Filter by record" value={entity} onChange={setEntity} className="w-full sm:w-48"
          options={[
            { value: '', label: 'Every record', hint: `${data?.total ?? 0} entries in all` },
            ...(data?.kinds ?? []).map((k: any) => ({
              value: k.entity, label: say(k.entity), hint: `${k.n} entries`,
            })),
          ]}
        />

        <Select
          ariaLabel="Filter by action" value={action} onChange={setAction} className="w-full sm:w-40"
          options={[
            { value: '', label: 'Every action' },
            ...(data?.actions ?? []).map((a: any) => ({
              value: a.action, label: a.action.replace(/_/g, ' '), hint: `${a.n} times`,
            })),
          ]}
        />

        <Select
          ariaLabel="Filter by when" value={days} onChange={setDays} className="w-full sm:w-40"
          options={[
            { value: '', label: 'All time' },
            { value: '1', label: 'Last 24 hours' },
            { value: '7', label: 'Last 7 days' },
            { value: '30', label: 'Last 30 days' },
            { value: '90', label: 'Last 3 months' },
          ]}
        />

        <Select
          ariaLabel="Filter by person" value={who} onChange={setWho} className="w-full sm:w-48"
          options={[
            { value: '', label: 'Anybody' },
            ...(data?.people ?? []).map((p: any) => ({
              value: p.user_label, label: p.user_label, hint: `${p.n} entries`,
            })),
          ]}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {(entity || action || days || who || q) && (
          <button
            className="inline-flex items-center gap-1.5 px-1 text-sm font-semibold text-brand-600 hover:text-brand-800"
            onClick={() => { setEntity(''); setAction(''); setDays(''); setWho(''); setQ(''); }}
          >
            <Icon name="x" className="h-3.5 w-3.5" /> Clear the filters
          </button>
        )}
      </div>

      {loading && <Loading rows={4} />}
      {error && <ErrorNote error={error} onRetry={reload} />}

      {!loading && all.length === 0 && (
        <EmptyState icon="shield" title="Nothing recorded here"
                    body="Nothing matches this filter yet. Every change made in the app lands in this log." />
      )}

      {all.length > 0 && (
        <>
          <TableCard title="What changed" count={all.length} noun="entries" className="hidden lg:block">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[24%]" />
                <col className="w-[16%]" />
                <col className="w-[30%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead className="border-b border-line bg-[color:var(--surface-sunken)] text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-bold">When</th>
                  <th className="px-4 py-3 font-bold">Who</th>
                  <th className="px-4 py-3 font-bold">Did what</th>
                  <th className="px-4 py-3 font-bold">To which record</th>
                  <th className="px-4 py-3 font-bold">From</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map((a: any) => {
                  const open = shown === a.id;
                  const detail = a.prev_value || a.new_value;
                  return (
                    <tr
                      key={a.id}
                      onClick={() => detail && setShown(open ? null : a.id)}
                      className={`align-top ${detail ? 'cursor-pointer hover:bg-[color:var(--surface-sunken)]' : ''}`}
                    >
                      <td className="px-4 py-3 text-ink-soft" title={dateTime(a.created_at)}>
                        {relative(a.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="block truncate text-ink">{a.user_label ?? 'the system'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={ACTION_TONE[a.action] ?? 'slate'}>{a.action.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block truncate text-ink-soft">
                          {say(a.entity)} <span className="font-mono text-xs text-ink-faint">#{a.entity_id ?? '—'}</span>
                        </span>
                        {detail && (
                          <span className="mt-0.5 block text-xs text-brand-600">
                            {open ? 'Hide what changed' : 'What changed'}
                          </span>
                        )}
                        {open && (
                          <span className="mt-2 grid gap-2 sm:grid-cols-2">
                            {a.prev_value && (
                              <span className="block rounded-lg bg-red-500/8 px-2.5 py-1.5">
                                <span className="block text-[10px] font-bold uppercase tracking-wide text-red-700">Before</span>
                                <code className="block break-all text-[11px] text-ink-soft">{a.prev_value}</code>
                              </span>
                            )}
                            {a.new_value && (
                              <span className="block rounded-lg bg-emerald-500/8 px-2.5 py-1.5">
                                <span className="block text-[10px] font-bold uppercase tracking-wide text-emerald-700">After</span>
                                <code className="block break-all text-[11px] text-ink-soft">{a.new_value}</code>
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-faint">{a.ip_address ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableCard>

          <ul className="space-y-2 lg:hidden">
            {entries.map((a: any) => (
              <li key={a.id} className="card p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={ACTION_TONE[a.action] ?? 'slate'}>{a.action.replace(/_/g, ' ')}</Badge>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                    {a.user_label ?? 'the system'}
                  </span>
                  <span className="shrink-0 text-xs text-ink-faint" title={dateTime(a.created_at)}>
                    {relative(a.created_at)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  {say(a.entity)} <span className="font-mono">#{a.entity_id ?? '—'}</span>
                </p>
                {(a.prev_value || a.new_value) && (
                  <div className="mt-2 space-y-1.5">
                    {a.prev_value && (
                      <p className="rounded-lg bg-red-500/8 px-2.5 py-1.5 text-[11px] text-ink-soft">
                        <b className="text-red-700">Before</b> {a.prev_value}
                      </p>
                    )}
                    {a.new_value && (
                      <p className="rounded-lg bg-emerald-500/8 px-2.5 py-1.5 text-[11px] text-ink-soft">
                        <b className="text-emerald-700">After</b> {a.new_value}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>

          <Pagination page={Math.min(page, pageCount)} pageSize={PAGE_SIZE} total={all.length}
                      onPage={setPage} noun="entries" />

          <p className="mt-2 text-xs text-ink-faint">
            Newest first. {all.length} entries match this filter, of {data?.total ?? all.length} in the log.
          </p>
        </>
      )}
    </>
  );
}
