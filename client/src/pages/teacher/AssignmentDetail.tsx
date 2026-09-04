import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../context/ToastContext';
import { dateLong, relative } from '../../lib/format';
import Icon from '../../components/Icon';
import { Readable, SpeakButton } from '../../components/Readable';
import { Avatar, Badge, ErrorNote, Field, Loading, PageHeader, ProgressBar, SenBadges, Toggle } from '../../components/ui';

/** Teacher multi-format submission review (PRD §8.4). */
export default function TeacherAssignmentDetail() {
  const { id } = useParams();
  const { data, loading, error, reload } = useFetch<any>(`/assignments/${id}`);
  const [openId, setOpenId] = useState<number | null>(null);

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const rows = data.submissions ?? [];
  const submitted = rows.filter((r: any) => r.id);
  const graded = rows.filter((r: any) => r.grade != null);

  return (
    <>
      <Link to="/teacher/assignments" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <Icon name="chevronLeft" className="h-4 w-4" /> All assignments
      </Link>

      <PageHeader
        title={data.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span style={{ color: data.colour }} className="font-semibold">{data.subject}</span>
            <span className="text-ink-faint">·</span><span>{data.class_name}</span>
            <span className="text-ink-faint">·</span><span>Due {dateLong(data.due_at)}</span>
            <span className="text-ink-faint">·</span><span>{data.max_score} marks</span>
          </span>
        }
      />

      <div className="card mb-5 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <ProgressBar value={submitted.length} max={rows.length} label={`Submitted: ${submitted.length} of ${rows.length}`} />
          <ProgressBar value={graded.length} max={rows.length} label={`Graded: ${graded.length} of ${rows.length}`} tone="green" />
        </div>
        {data.description && (
          <div className="mt-4 border-t border-line pt-3">
            <Readable text={data.description} className="text-sm text-ink-soft" />
          </div>
        )}
      </div>

      <ul className="space-y-3">
        {rows.map((row: any) => (
          <SubmissionRow
            key={row.student_code} row={row} assignment={data}
            open={openId === row.id} onToggle={() => setOpenId(openId === row.id ? null : row.id)}
            onGraded={reload}
          />
        ))}
      </ul>
    </>
  );
}

function SubmissionRow({ row, assignment, open, onToggle, onGraded }: any) {
  const { toast } = useToast();
  const [grade, setGrade] = useState(row.grade ?? '');
  const [feedback, setFeedback] = useState(row.feedback_text ?? '');
  const [feedbackType, setFeedbackType] = useState(row.feedback_type ?? 'text');
  const [notifyParent, setNotifyParent] = useState(true);
  const [busy, setBusy] = useState(false);

  const notSubmitted = !row.id;
  const late = row.status === 'late';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/submissions/${row.id}/grade`, {
        grade: Number(grade), feedback_text: feedback, feedback_type: feedbackType, notify_parent: notifyParent,
      });
      toast(notifyParent ? 'Grade saved and the guardian has been notified.' : 'Grade saved.');
      onGraded();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="card overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar first={row.first_name} last={row.last_name} colour={row.avatar_colour} src={row.avatar_url} emoji={row.avatar_emoji} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{row.first_name} {row.last_name}</p>
            <p className="truncate text-xs text-ink-faint">{row.student_code}</p>
            <div className="mt-1"><SenBadges needs={row.needs} multiplier={row.time_multiplier} multiFormat={row.multi_format_approved} /></div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {notSubmitted ? (
            <Badge tone="slate">Not submitted</Badge>
          ) : (
            <>
              <Badge tone={row.submission_type === 'TEXT' ? 'slate' : 'green'}
                     icon={row.submission_type === 'AUDIO' ? 'speaker' : row.submission_type === 'VIDEO' ? 'video' : row.submission_type === 'DIAGRAM_PDF' ? 'file' : 'text'}>
                {row.submission_type === 'DIAGRAM_PDF' ? 'Diagram' : row.submission_type[0] + row.submission_type.slice(1).toLowerCase()}
              </Badge>
              {late && <Badge tone="amber">Late</Badge>}
              {row.grade != null
                ? <span className="text-lg font-bold tabular-nums text-emerald-600">{row.grade}<span className="text-sm text-ink-faint">/{assignment.max_score}</span></span>
                : <Badge tone="amber">To grade</Badge>}
              <button className="btn-ghost" onClick={onToggle} aria-expanded={open}>
                <Icon name={open ? 'chevronDown' : 'eye'} className="h-4 w-4" />
                {open ? 'Close' : 'Review'}
              </button>
            </>
          )}
        </div>
      </div>

      {open && !notSubmitted && (
        <div className="grid gap-4 border-t border-line p-4 lg:grid-cols-2">
          {/* ── Submission media ── */}
          <section className="min-w-0">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">Submission media</h3>

            {row.submission_type === 'TEXT' && (
              <div className="rounded-xl border border-line bg-[color:var(--surface-sunken)] p-3">
                <Readable text={row.body ?? ''} className="text-sm text-ink" />
                <div className="mt-2"><SpeakButton text={row.body ?? ''} compact /></div>
              </div>
            )}

            {row.submission_type === 'AUDIO' && (
              <div className="rounded-xl border border-line p-3">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                  <Icon name="speaker" className="h-4 w-4 text-brand-600" />
                  {row.file_name} {row.file_duration && <span className="font-normal text-ink-faint">({row.file_duration})</span>}
                </p>
                {row.file_url && row.file_url !== '#'
                  ? <audio controls className="w-full" src={row.file_url} />
                  : <p className="text-xs text-ink-faint">Demo recording. Playback URL not stored for the seeded example.</p>}
              </div>
            )}

            {row.submission_type === 'VIDEO' && row.file_url && row.file_url !== '#' && (
              <video controls playsInline className="w-full rounded-xl" src={row.file_url} />
            )}

            {row.submission_type === 'DIAGRAM_PDF' && (
              <a href={row.file_url} target="_blank" rel="noreferrer" className="btn-ghost w-full">
                <Icon name="file" className="h-4 w-4" /> Open {row.file_name}
              </a>
            )}

            {row.transcript && (
              <div className="mt-3 rounded-xl bg-[color:var(--surface-sunken)] p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
                  <Icon name="accessibility" className="h-3.5 w-3.5" />
                  Auto-generated transcript
                  <span className="font-normal normal-case text-ink-faint">(SEN accommodation)</span>
                </p>
                <Readable text={row.transcript} className="text-xs leading-relaxed text-ink-soft" />
              </div>
            )}

            <p className="mt-2 text-xs text-ink-faint">Submitted {relative(row.submitted_at)}</p>
          </section>

          {/* ── Grading ── */}
          <form onSubmit={submit} className="min-w-0 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Grading &amp; feedback</h3>

            <Field label={`Grade out of ${assignment.max_score}`} required>
              <input
                type="number" className="input" min={0} max={assignment.max_score} step="0.5" required
                value={grade} onChange={(e) => setGrade(e.target.value)}
              />
            </Field>

            <fieldset>
              <legend className="label">Feedback type</legend>
              <div className="flex gap-2">
                {['text', 'audio'].map((t) => (
                  <button
                    key={t} type="button" role="radio" aria-checked={feedbackType === t}
                    onClick={() => setFeedbackType(t)}
                    className={`flex-1 rounded-xl border-2 py-2 text-sm font-semibold capitalize transition ${
                      feedbackType === t ? 'border-brand-600 bg-brand-600/8 text-ink' : 'border-line text-ink-soft'
                    }`}
                    data-tap
                  >
                    <Icon name={t === 'audio' ? 'mic' : 'text'} className="mx-auto mb-0.5 h-4 w-4" />
                    {t === 'audio' ? 'Audio note' : 'Written'}
                  </button>
                ))}
              </div>
            </fieldset>

            <Field label="Feedback" hint={feedbackType === 'audio' ? 'Describe your audio note here; upload support is wired to the same endpoint.' : undefined}>
              <textarea
                className="input min-h-[7rem] resize-y" value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="What went well, and what to work on next."
              />
            </Field>

            <Toggle
              checked={notifyParent} onChange={setNotifyParent}
              label="Notify the parent or guardian" hint="Sends the grade and feedback to the parent portal"
            />

            <button className="btn-primary w-full" disabled={busy || grade === ''}>
              <Icon name="check" className="h-4 w-4" />
              {busy ? 'Saving…' : notifyParent ? 'Submit grade & notify parent' : 'Submit grade'}
            </button>
          </form>
        </div>
      )}
    </li>
  );
}
