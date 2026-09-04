import { useState } from 'react';
import { useFetch } from '../../lib/useFetch';
import { qs } from '../../lib/api';
import { dateTime, relative } from '../../lib/format';
import Icon from '../../components/Icon';
import { Badge, ChipRail, EmptyState, ErrorNote, Loading, PageHeader } from '../../components/ui';

const ACTION_TONE: Record<string, string> = {
  login: 'slate', create: 'green', update: 'brand', delete: 'red',
  grade_update: 'violet', payment: 'green', attendance_mark: 'amber',
  leave_decision: 'brand', sign_slip: 'violet', exam_start: 'amber',
  password_change: 'red', publish_material: 'green',
};

export default function AuditLog() {
  const [entity, setEntity] = useState('');
  const { data, loading, error, reload } = useFetch<any[]>(`/audit${qs({ entity, limit: 300 })}`, [entity]);

  return (
    <>
      <PageHeader
        icon="shield" title="Audit log"
        subtitle="Append-only record of every academic and financial change: who, when, from where, and what the value was before and after. Entries cannot be edited or deleted, including by administrators."
      />

      <div className="mb-5">
        <ChipRail
          ariaLabel="Filter by record type" value={entity} onChange={setEntity}
          options={[
            { value: '', label: 'Everything' },
            { value: 'submissions', label: 'Grades' },
            { value: 'attendance', label: 'Attendance' },
            { value: 'invoices', label: 'Fees' },
            { value: 'leave_requests', label: 'Leave' },
            { value: 'iep_profiles', label: 'SEN plans' },
            { value: 'students', label: 'Students' },
            { value: 'users', label: 'Accounts' },
          ]}
        />
      </div>

      {loading && <Loading rows={4} />}
      {error && <ErrorNote error={error} onRetry={reload} />}

      {!loading && (data ?? []).length === 0 && (
        <EmptyState icon="shield" title="No entries" body="Nothing has been recorded for this filter yet." />
      )}

      {(data ?? []).length > 0 && (
        <ul className="space-y-2">
          {data!.map((a) => (
            <li key={a.id} className="card p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={ACTION_TONE[a.action] ?? 'slate'}>{a.action.replace(/_/g, ' ')}</Badge>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{a.user_label}</span>
                <span className="shrink-0 font-mono text-[11px] text-ink-faint">{a.entity}#{a.entity_id ?? '-'}</span>
                <span className="shrink-0 text-xs text-ink-faint" title={dateTime(a.created_at)}>{relative(a.created_at)}</span>
              </div>

              {(a.prev_value || a.new_value) && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {a.prev_value && (
                    <div className="rounded-lg bg-red-500/8 px-2.5 py-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-red-700">Previous</p>
                      <code className="block break-all text-[11px] text-ink-soft">{a.prev_value}</code>
                    </div>
                  )}
                  {a.new_value && (
                    <div className="rounded-lg bg-emerald-500/8 px-2.5 py-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">New</p>
                      <code className="block break-all text-[11px] text-ink-soft">{a.new_value}</code>
                    </div>
                  )}
                </div>
              )}

              {a.ip_address && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-faint">
                  <Icon name="globe" className="h-3 w-3" /> {a.ip_address}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
