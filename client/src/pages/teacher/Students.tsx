import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../../lib/useFetch';
import Icon from '../../components/Icon';
import { Avatar, ChipRail, EmptyState, ErrorNote, Loading, PageHeader, SenBadges } from '../../components/ui';

export default function TeacherStudents() {
  const classes = useFetch<any[]>('/classes');
  const [classId, setClassId] = useState('');
  const [q, setQ] = useState('');
  const students = useFetch<any[]>(`/students${classId ? `?classId=${classId}` : ''}`, [classId]);

  const filtered = useMemo(() => {
    const rows = students.data ?? [];
    if (!q.trim()) return rows;
    const needle = q.toLowerCase();
    return rows.filter((s: any) =>
      `${s.first_name} ${s.last_name} ${s.student_code}`.toLowerCase().includes(needle));
  }, [students.data, q]);

  return (
    <>
      <PageHeader icon="users" title="My students" subtitle="Accommodation badges show at a glance who needs what." />

      <div className="mb-5 space-y-3">
        <label className="relative block">
          <span className="sr-only">Search students</span>
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input className="input !pl-10" type="search" value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Search by name or student code…" />
        </label>
        <ChipRail
          ariaLabel="Filter by class" value={classId} onChange={setClassId}
          options={[{ value: '', label: 'All classes' },
                    ...(classes.data ?? []).map((c: any) => ({ value: String(c.id), label: c.name, count: c.student_count }))]}
        />
      </div>

      {students.loading && <Loading rows={4} />}
      {students.error && <ErrorNote error={students.error} onRetry={students.reload} />}

      {!students.loading && filtered.length === 0 && (
        <EmptyState icon="search" title="No students match" body="Try a different name, code or class." />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s: any) => (
          <Link key={s.id} to={`/teacher/students/${s.id}`} className="card p-4 transition hover:border-brand-300 hover:shadow-md">
            <div className="flex items-start gap-3">
              <Avatar first={s.first_name} last={s.last_name} colour={s.avatar_colour} src={s.avatar_url} emoji={s.avatar_emoji} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{s.first_name} {s.last_name}</p>
                <p className="truncate text-xs text-ink-soft">{s.class_name}</p>
                <p className="text-[11px] text-ink-faint">{s.student_code}</p>
              </div>
            </div>
            {(s.needs?.length > 0 || s.time_multiplier > 1) && (
              <div className="mt-3"><SenBadges needs={s.needs} multiplier={s.time_multiplier} multiFormat={s.multi_format_approved} /></div>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}
