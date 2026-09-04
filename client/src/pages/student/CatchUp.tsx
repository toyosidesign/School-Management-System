import { useMemo, useRef, useState } from 'react';
import { api, qs } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useAccessibility } from '../../context/AccessibilityContext';
import { useToast } from '../../context/ToastContext';
import { dateLong, hms } from '../../lib/format';
import Icon from '../../components/Icon';
import LessonPlayer from './LessonPlayer';
import { Badge, ChipRail, EmptyState, ErrorNote, Loading, PageHeader, ProgressBar } from '../../components/ui';

/**
 * Catch-Up Hub (PRD §4.1 / §8.2). Entries arrive automatically whenever the
 * student is marked absent or granted excused leave. Desktop lays out player +
 * transcript side by side; tablet and mobile stack with a collapsible transcript.
 */
export default function CatchUp({ studentId }: { studentId?: number } = {}) {
  const [subject, setSubject] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  const path = `/catchup${qs({ studentId, subjectId: subject, status })}`;
  const { data, loading, error, reload, setData } = useFetch<any[]>(path, [subject, status, studentId]);

  const entries = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((e) =>
      [e.topic, e.subject, e.summary, e.teacher_notes]
        .concat((e.transcript ?? []).map((t: any) => t.text))
        .join(' ').toLowerCase().includes(q)
    );
  }, [data, search]);

  const subjects = useMemo(() => {
    const seen = new Map<number, string>();
    (data ?? []).forEach((e: any) => seen.set(e.subject_id ?? e.code, e.subject));
    return [...new Set((data ?? []).map((e: any) => e.subject))];
  }, [data]);

  const done = (data ?? []).filter((e) => e.status === 'completed').length;
  const total = (data ?? []).length;

  const updateEntry = (id: number, patch: any) =>
    setData((cur: any) => (cur ?? []).map((e: any) => (e.id === id ? { ...e, ...patch } : e)));

  return (
    <>
      <PageHeader
        icon="catchup"
        title="Catch-Up Hub"
        subtitle={
          total
            ? `${total - done} lesson${total - done === 1 ? '' : 's'} to catch up on · ${done} completed`
            : 'Everything you have missed will appear here automatically.'
        }
      />

      {total > 0 && (
        <div className="card mb-5 p-4" data-focus-hide>
          <ProgressBar value={done} max={total} tone={done === total ? 'green' : 'brand'} label="Catch-up progress" />
        </div>
      )}

      <div className="mb-5 space-y-3">
        <label className="relative block">
          <span className="sr-only">Search topics, notes and transcripts</span>
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            className="input !pl-10" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search topics, notes and transcripts…" type="search"
          />
        </label>

        <div className="flex flex-col gap-2 sm:flex-row" data-focus-hide>
          <ChipRail
            ariaLabel="Filter by status" value={status} onChange={setStatus}
            options={[
              { value: '', label: 'All' },
              { value: 'new', label: 'Not started' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'completed', label: 'Completed' },
            ]}
          />
        </div>
      </div>

      {loading && <Loading rows={2} label="Loading your catch-up lessons" />}
      {error && <ErrorNote error={error} onRetry={reload} />}

      {!loading && !error && entries.length === 0 && (
        <EmptyState
          icon="check"
          title={search ? 'Nothing matches that search' : 'You are all caught up'}
          body={
            search
              ? 'Try a different word, or clear the search to see every lesson.'
              : 'When you are marked absent, the lesson recap, teacher notes and summary appear here on their own.'
          }
        />
      )}

      <div className="space-y-4">
        {entries.map((entry) => (
          <CatchUpCard
            key={entry.id} entry={entry}
            open={openId === entry.id}
            onToggle={() => setOpenId(openId === entry.id ? null : entry.id)}
            onUpdate={(patch) => updateEntry(entry.id, patch)}
            readOnly={!!studentId}
          />
        ))}
      </div>
    </>
  );
}

function CatchUpCard({ entry, open, onToggle, onUpdate, readOnly }: any) {
  const { toast } = useToast();

  const statusTone = { new: 'amber', in_progress: 'brand', completed: 'green' }[entry.status] ?? 'slate';
  const statusLabel = { new: 'Not started', in_progress: 'In progress', completed: 'Completed' }[entry.status];

  const steps: any[] = entry.steps ?? [];
  const doneSteps: string[] = entry.steps_done ?? [];
  const isDone = (key: string) => doneSteps.includes(key);

  return (
    <article className="card overflow-hidden">
      {/* ── Header ── */}
      <header className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {/* Why the lesson was missed. Uses the same colour language as the
                register: red for absent, violet for excused leave. Deliberately
                different from the status badge beside it, which is amber. */}
            <Badge tone={entry.reason.includes('leave') ? 'violet' : 'red'}>
              {entry.reason.includes('leave') ? 'Excused leave' : 'Absent'}
            </Badge>
            <Badge tone={statusTone}>{statusLabel}</Badge>
            {!entry.materials_ready && <Badge tone="slate" icon="clock">Recap pending</Badge>}
          </div>
          <h2 className="text-base font-bold text-ink sm:text-lg">
            <span style={{ color: entry.colour }}>{entry.subject}</span>
            <span className="text-ink-faint"> · </span>
            <span className="font-medium text-ink-soft">{dateLong(entry.lesson_date)}</span>
          </h2>
          {entry.topic && <p className="mt-1 text-sm font-medium text-ink-soft">Topic: {entry.topic}</p>}
          {entry.teacher_name && <p className="mt-0.5 text-xs text-ink-faint">{entry.teacher_name} · Period {entry.period}</p>}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {entry.materials_ready && (
            <button className="btn-ghost" onClick={onToggle} aria-expanded={open}>
              <Icon name={open ? 'chevronDown' : 'play'} className="h-4 w-4" />
              {open ? 'Close' : 'Open lesson'}
            </button>
          )}
          {entry.materials_ready && steps.length > 0 && (
            <span className="flex items-center gap-2 rounded-xl bg-[color:var(--surface-sunken)] px-3 py-2">
              <span className="text-xs font-semibold text-ink-soft">
                {doneSteps.length} of {steps.length} done
              </span>
              <span className="flex gap-1" aria-hidden="true">
                {steps.map((st: any) => (
                  <span
                    key={st.key}
                    className={`h-1.5 w-6 rounded-full ${isDone(st.key) ? 'bg-emerald-500' : 'bg-line'}`}
                  />
                ))}
              </span>
            </span>
          )}
        </div>
      </header>

      {open && entry.materials_ready && entry.status === 'completed' && (
        <p className="mx-4 mb-4 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          <Icon name="check" className="h-5 w-5 shrink-0" strokeWidth={2.5} />
          You have caught up on this lesson.
          {entry.check_total ? ` Quick check: ${entry.check_score} out of ${entry.check_total}.` : ''}
        </p>
      )}

      {!entry.materials_ready && (
        <p className="px-4 py-4 text-sm text-ink-soft">
          Your teacher has not published the recap for this lesson yet. It will appear here as soon as they do, and
          you will get a notification.
        </p>
      )}

      {/* The lesson itself, worked through step by step. */}
      {open && entry.materials_ready && (
        <LessonPlayer entry={entry} onUpdate={onUpdate} readOnly={readOnly} />
      )}

    </article>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-amber-200 px-0.5 text-ink">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

/** Builds a WebVTT track from the stored transcript so captions need no extra file. */
function captionsDataUrl(transcript: { t: string; text: string }[]) {
  if (!transcript?.length) return '';
  const toVtt = (stamp: string, offset = 0) => {
    const [m, s] = stamp.split(':').map(Number);
    return `00:${String(m + Math.floor((s + offset) / 60)).padStart(2, '0')}:${String((s + offset) % 60).padStart(2, '0')}.000`;
  };
  const body = transcript
    .map((l, i) => `${i + 1}\n${toVtt(l.t)} --> ${toVtt(transcript[i + 1]?.t ?? l.t, transcript[i + 1] ? 0 : 6)}\n${l.text}`)
    .join('\n\n');
  return `data:text/vtt;charset=utf-8,${encodeURIComponent(`WEBVTT\n\n${body}`)}`;
}
