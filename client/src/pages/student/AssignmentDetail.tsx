import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getToken } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { dateLong, hms, relative } from '../../lib/format';
import Icon from '../../components/Icon';
import { Readable, SpeakButton } from '../../components/Readable';
import { Badge, ErrorNote, Field, Loading, PageHeader, PieTimer, ProgressBar } from '../../components/ui';

const FORMATS = [
  { value: 'TEXT', label: 'Write it', icon: 'text', accept: '', hint: 'Type your answer in the box' },
  { value: 'AUDIO', label: 'Record audio', icon: 'mic', accept: '.mp3,.m4a,.wav,.ogg,.webm', hint: 'Speak your answer instead of writing it' },
  { value: 'VIDEO', label: 'Record video', icon: 'video', accept: '.mp4,.webm,.mov', hint: 'Explain your answer to camera' },
  { value: 'DIAGRAM_PDF', label: 'Diagram or PDF', icon: 'file', accept: '.pdf,.png,.jpg,.jpeg,.webp', hint: 'Upload a drawing, mind map or scan' },
];

export default function StudentAssignmentDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, loading, error, reload } = useFetch<any>(`/assignments/${id}`);

  const [format, setFormat] = useState('TEXT');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);

  const iep = user.iep;
  const canMultiFormat = !!data?.allow_multi_format || !!iep?.multi_format_approved;

  useEffect(() => {
    if (data?.submission) {
      setFormat(data.submission.submission_type);
      setBody(data.submission.body ?? '');
    }
  }, [data?.submission]);

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const submission = data.submission;
  const graded = submission?.grade != null;
  const overdue = new Date(data.due_at) < new Date();
  const steps: string[] = data.instructions_steps ?? [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const form = new FormData();
      form.append('submission_type', format);
      if (format === 'TEXT') form.append('body', body);
      else if (file) form.append('file', file);
      await api.post(`/assignments/${id}/submissions`, form);
      toast(format === 'TEXT' ? 'Answer submitted.' : `${format.toLowerCase()} submitted. A transcript is being prepared for your teacher.`);
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link to="/student/assignments" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <Icon name="chevronLeft" className="h-4 w-4" /> All assignments
      </Link>

      <PageHeader
        title={data.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span style={{ color: data.colour }} className="font-semibold">{data.subject}</span>
            <span className="text-ink-faint">·</span>
            <span>Due {dateLong(data.due_at)} ({relative(data.due_at)})</span>
            <span className="text-ink-faint">·</span>
            <span>{data.max_score} marks</span>
          </span>
        }
        actions={<SpeakButton text={`${data.title}. ${data.description ?? ''}`} label="Read aloud" />}
      />

      {/* ── Timed assessment: extra time applied automatically (PRD Story 2) ── */}
      {data.base_duration_minutes && !submission && (
        <ExamPanel assignment={data} session={data.exam_session} iep={iep} onStarted={reload} />
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          {/* ── Brief ── */}
          <section className="card p-4 sm:p-5">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-soft">What to do</h2>
            <Readable text={data.description ?? 'No further instructions were given.'} className="text-sm text-ink" />
          </section>

          {/* ── Graded feedback ── */}
          {graded && (
            <section className="card panel-green p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Your grade</h2>
                <span className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {submission.grade}<span className="text-base text-ink-faint">/{data.max_score}</span>
                </span>
              </div>
              <ProgressBar value={submission.grade} max={data.max_score} tone="green" />
              {submission.feedback_text && (
                <div className="mt-4">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-soft">Teacher feedback</p>
                  <Readable text={submission.feedback_text} className="text-sm text-ink" />
                  <div className="mt-2"><SpeakButton text={submission.feedback_text} label="Read feedback aloud" compact /></div>
                </div>
              )}
              {submission.feedback_type === 'audio' && submission.feedback_audio_url && (
                <audio controls className="mt-3 w-full" src={submission.feedback_audio_url} />
              )}
            </section>
          )}

          {/* ── A quiz is answered, not written ── */}
          {!graded && data.is_quiz && data.exam_session && (
            <QuizRunner assignment={data} onSubmitted={reload} />
          )}

          {!graded && data.is_quiz && !data.exam_session && (
            <section className="card p-5 text-center">
              <Icon name="clock" className="mx-auto h-8 w-8 text-brand-600" />
              <p className="mt-3 font-display text-lg font-bold text-ink">
                {data.question_count} questions, ready when you are
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
                Start the timer above when you are ready to begin. Your answers are marked as soon as you submit.
              </p>
            </section>
          )}

          {/* ── Submission form ── */}
          {!graded && !data.is_quiz && (
            <form onSubmit={submit} className="card p-4 sm:p-5">
              <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-ink-soft">
                {submission ? 'Replace your submission' : 'Submit your work'}
              </h2>
              {submission && (
                <p className="mb-3 text-xs text-ink-soft">
                  You submitted {submission.submission_type.toLowerCase()} {relative(submission.submitted_at)}.
                  Submitting again replaces it.
                </p>
              )}

              {canMultiFormat ? (
                <>
                  <p className="mb-3 text-sm text-ink-soft">Choose how you want to answer.</p>
                  <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Submission format">
                    {FORMATS.map((f) => (
                      <button
                        key={f.value} type="button" role="radio" aria-checked={format === f.value}
                        onClick={() => { setFormat(f.value); setFile(null); }}
                        className={`rounded-xl border-2 p-3 text-center transition ${
                          format === f.value ? 'border-brand-600 bg-brand-600/8' : 'border-line hover:border-brand-300'
                        }`}
                        data-tap
                      >
                        <Icon name={f.icon} className="mx-auto h-5 w-5 text-brand-600" />
                        <span className="mt-1.5 block text-xs font-semibold text-ink">{f.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mb-4 text-xs text-ink-faint">{FORMATS.find((f) => f.value === format)?.hint}</p>
                </>
              ) : (
                <p className="mb-4 rounded-xl bg-[color:var(--surface-sunken)] px-3 py-2.5 text-xs text-ink-soft">
                  This assignment is set as a written response only.
                </p>
              )}

              {format === 'TEXT' ? (
                <>
                  <Field label="Your answer" required>
                    <textarea
                      className="input min-h-[12rem] resize-y" value={body} onChange={(e) => setBody(e.target.value)}
                      placeholder="Start writing here…" required
                    />
                  </Field>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <DictationButton onText={(t) => setBody((b) => (b ? `${b} ${t}` : t))} />
                    <span className="text-xs tabular-nums text-ink-faint">{body.trim().split(/\s+/).filter(Boolean).length} words</span>
                  </div>
                </>
              ) : (
                <FilePicker
                  accept={FORMATS.find((f) => f.value === format)!.accept}
                  file={file} onPick={setFile} format={format}
                />
              )}

              <button className="btn-primary mt-5 w-full sm:w-auto" disabled={busy || (format === 'TEXT' ? !body.trim() : !file)}>
                <Icon name="upload" className="h-4 w-4" />
                {busy ? 'Submitting…' : submission ? 'Replace submission' : 'Submit assignment'}
              </button>
              {overdue && <p className="mt-2 text-xs font-medium text-amber-700">This is past the deadline, so it will be marked as late.</p>}
            </form>
          )}

          {graded && data.is_quiz && submission?.body && (
            <QuizReview assignment={data} answers={safeParse(submission.body)} />
          )}

          {/* ── Existing non-text submission preview ── */}
          {submission && submission.submission_type !== 'TEXT' && (
            <section className="card p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-soft">What you submitted</h2>
              <div className="flex items-center gap-3 rounded-xl border border-line p-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-600/10 text-brand-600">
                  <Icon name={submission.submission_type === 'AUDIO' ? 'speaker' : submission.submission_type === 'VIDEO' ? 'video' : 'file'} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{submission.file_name}</span>
                  <span className="block text-xs text-ink-soft">
                    {submission.submission_type.toLowerCase()}{submission.file_duration ? ` · ${submission.file_duration}` : ''}
                  </span>
                </span>
              </div>
              {submission.transcript && (
                <div className="mt-3 rounded-xl bg-[color:var(--surface-sunken)] p-3">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-soft">
                    Auto-generated transcript <span className="font-normal normal-case text-ink-faint">(sent to your teacher)</span>
                  </p>
                  <Readable text={submission.transcript} className="text-xs text-ink-soft" />
                </div>
              )}
            </section>
          )}
        </div>

        {/* ── Step-by-step chunking sidebar (ADHD support, PRD §3.1) ── */}
        <aside className="min-w-0 space-y-4">
          {steps.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-ink-soft">Step by step</h2>
              <p className="mb-3 text-xs text-ink-faint">Tick each step as you go. Nothing is submitted until you press the button.</p>
              <ProgressBar value={step} max={steps.length} tone={step === steps.length ? 'green' : 'brand'} />
              <ol className="mt-3 space-y-1">
                {steps.map((s, i) => (
                  <li key={i}>
                    <button
                      type="button" onClick={() => setStep(i < step ? i : i + 1)}
                      className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-[color:var(--surface-sunken)]"
                      aria-pressed={i < step} data-tap
                    >
                      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-[10px] font-bold ${
                        i < step ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-line text-ink-faint'
                      }`}>
                        {i < step ? <Icon name="check" className="h-3 w-3" strokeWidth={3} /> : i + 1}
                      </span>
                      <span className={`text-sm ${i < step ? 'text-ink-faint line-through' : 'text-ink'}`}>{s}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {iep && (
            <section className="card panel-violet p-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-violet-800 dark:text-violet-300">
                <Icon name="accessibility" className="shrink-0 h-4 w-4" /> Your arrangements
              </h2>
              <ul className="space-y-1.5 text-sm text-ink-soft">
                {iep.time_multiplier > 1 && (
                  <li className="flex gap-2"><Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                    {Math.round((iep.time_multiplier - 1) * 100)}% extra time is added automatically</li>
                )}
                {!!iep.multi_format_approved && (
                  <li className="flex gap-2"><Icon name="mic" className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                    You may answer with audio, video or a diagram</li>
                )}
                {!!iep.rest_breaks && (
                  <li className="flex gap-2"><Icon name="heart" className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                    Rest breaks are allowed, and the timer pauses with your teacher</li>
                )}
                {!!iep.scribe_allowed && (
                  <li className="flex gap-2"><Icon name="text" className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                    A scribe or dictation may be used</li>
                )}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

/* ── Timed assessment with the IEP multiplier applied ─────────────────────── */
function ExamPanel({ assignment, session, iep, onStarted }: any) {
  const { toast } = useToast();
  const [live, setLive] = useState(session);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => setLive(session), [session]);

  useEffect(() => {
    if (!live?.expires_at) return;
    const tick = () => setRemaining(Math.max(0, (new Date(live.expires_at).getTime() - Date.now()) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [live?.expires_at]);

  const multiplier = iep?.time_multiplier ?? 1;
  const allowed = Math.round(assignment.base_duration_minutes * multiplier);

  const start = async () => {
    try {
      const s = await api.post(`/assignments/${assignment.id}/start`);
      setLive(s);
      toast(`Timer started. You have ${s.allowed_minutes} minutes.`);
      onStarted?.();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  if (!live) {
    return (
      <section className="card mb-5 panel-amber p-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-bold text-ink"><Icon name="clock" className="shrink-0 h-5 w-5 text-amber-600" /> Timed assessment</h2>
        <p className="mt-2 text-sm text-ink-soft">
          This quiz runs for <b className="text-ink">{assignment.base_duration_minutes} minutes</b> as standard.
          {multiplier > 1 && (
            <> Your arrangements add <b className="text-ink">{Math.round((multiplier - 1) * 100)}%</b>, so your timer will
            be set to <b className="text-ink">{assignment.base_duration_minutes} × {multiplier} = {allowed} minutes</b>.</>
          )}
        </p>
        <p className="mt-2 text-xs text-ink-faint">The clock starts the moment you press start, so make sure you are ready.</p>
        <button className="btn-primary mt-4" onClick={start}>
          <Icon name="play" className="h-4 w-4" /> Start quiz ({allowed} minutes)
        </button>
      </section>
    );
  }

  const total = live.allowed_minutes * 60;
  const expired = remaining <= 0;

  return (
    <section className={`card mb-5 p-4 sm:p-5 ${expired ? 'panel-red' : 'panel-brand'}`}>
      <div className="flex items-center gap-4">
        <PieTimer remaining={remaining} total={total} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
            {expired ? 'Time is up' : 'Time remaining'}
          </p>
          <p className="font-mono text-3xl font-bold tabular-nums text-ink">{hms(remaining)}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {live.base_minutes} min base × {live.time_multiplier} = {live.allowed_minutes} min allowed
          </p>
        </div>
      </div>
      {expired && (
        <p className="mt-3 text-sm font-medium text-red-700">
          Submit what you have now. Your teacher will see that the time ran out.
        </p>
      )}
    </section>
  );
}

/* ── File picker with drag-and-drop and a keyboard-only fallback ───────────── */
function FilePicker({ accept, file, onPick, format }: any) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onPick(e.dataTransfer.files[0] ?? null); }}
        className={`rounded-xl border-2 border-dashed p-6 text-center transition ${
          dragging ? 'border-brand-500 bg-brand-600/5' : 'border-line'
        }`}
      >
        <Icon name="upload" className="mx-auto h-8 w-8 text-ink-faint" />
        <p className="mt-2 text-sm font-semibold text-ink">
          {file ? file.name : `Choose your ${format.toLowerCase().replace('_', ' ')} file`}
        </p>
        <p className="mt-1 text-xs text-ink-faint">
          {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `Drag it here, or browse. Accepted: ${accept}`}
        </p>
        <button type="button" className="btn-ghost mt-3" onClick={() => inputRef.current?.click()}>
          <Icon name="file" className="h-4 w-4" /> {file ? 'Choose a different file' : 'Browse files'}
        </button>
        <input
          ref={inputRef} type="file" accept={accept} className="sr-only"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          aria-label={`Upload your ${format.toLowerCase()} file`}
        />
      </div>
      {file && (
        <button type="button" className="btn-subtle mt-2 !text-xs" onClick={() => onPick(null)}>
          <Icon name="x" className="h-3.5 w-3.5" /> Remove file
        </button>
      )}
    </div>
  );
}

/* ── Voice dictation (PRD §3.1 motor row) ─────────────────────────────────── */
export function DictationButton({ onText }: { onText: (text: string) => void }) {
  const { toast } = useToast();
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  const Recognition = typeof window !== 'undefined'
    ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    : null;

  if (!Recognition) return null;

  const toggle = () => {
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Recognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      const text = Array.from(e.results).slice(e.resultIndex).map((r: any) => r[0].transcript).join(' ').trim();
      if (text) onText(text);
    };
    rec.onerror = () => { setListening(false); toast('Dictation could not start. Check microphone permission.', 'error'); };
    rec.onend = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  };

  return (
    <button type="button" onClick={toggle} className={listening ? 'btn-danger !py-1.5 !text-xs' : 'btn-ghost !py-1.5 !text-xs'} data-tap>
      <Icon name="mic" className="h-4 w-4" />
      {listening ? 'Stop dictation' : 'Dictate instead of typing'}
    </button>
  );
}

function safeParse(v: any) {
  try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; }
}

/**
 * A quiz, one question at a time, against the clock.
 *
 * Marked on the server the moment it is submitted, so a pupil sees where they
 * stand straight away rather than waiting for a teacher, and the answer key
 * never has to be sent to the browser.
 */
function QuizRunner({ assignment, onSubmitted }: { assignment: any; onSubmitted: () => void }) {
  const { toast } = useToast();
  const questions: any[] = assignment.questions ?? [];
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);

  const answeredAll = questions.every((_, i) => answers[i] != null);
  const question = questions[index];

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/assignments/${assignment.id}/submissions`, {
        submission_type: 'QUIZ',
        answers: questions.map((_, i) => answers[i]),
      });
      toast('Submitted and marked.');
      onSubmitted();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-ink">
          Question {index + 1} of {questions.length}
        </h2>
        <span className="text-sm text-ink-soft">{Object.keys(answers).length} answered</span>
      </div>

      <ProgressBar value={Object.keys(answers).length} max={questions.length} />

      <p className="mt-5 font-display text-lg font-bold leading-snug text-ink">{question.q}</p>

      <div className="mt-4 space-y-2" role="radiogroup" aria-label={question.q}>
        {question.options.map((option: string, oi: number) => {
          const chosen = answers[index] === oi;
          return (
            <button
              key={oi} type="button" role="radio" aria-checked={chosen}
              onClick={() => {
                setAnswers({ ...answers, [index]: oi });
                if (index < questions.length - 1) setTimeout(() => setIndex(index + 1), 180);
              }}
              className={`flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
                chosen ? 'border-brand-600 bg-brand-600/8 text-ink' : 'border-line text-ink-soft hover:border-brand-300'
              }`}
              data-tap
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center self-start rounded-full border-2 border-current text-xs font-bold leading-none">
                {String.fromCharCode(65 + oi)}
              </span>
              <span className="min-w-0 flex-1 text-[15px]">{option}</span>
            </button>
          );
        })}
      </div>

      {/* Every question reachable, so nothing is answered blind. */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {questions.map((_, i) => (
          <button
            key={i} onClick={() => setIndex(i)} aria-label={`Go to question ${i + 1}`}
            aria-current={i === index ? 'true' : undefined}
            className={`h-8 w-8 rounded-lg text-xs font-bold leading-none transition ${
              i === index ? 'bg-brand-600 text-white'
                : answers[i] != null ? 'bg-emerald-100 text-emerald-800'
                : 'bg-[color:var(--surface-sunken)] text-ink-soft'
            }`}
            data-tap
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
        <button className="btn-subtle" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
          <Icon name="chevronLeft" className="h-4 w-4" /> Previous
        </button>
        {index < questions.length - 1 ? (
          <button className="btn-ghost" onClick={() => setIndex((i) => i + 1)}>
            Next <Icon name="chevronRight" className="h-4 w-4" />
          </button>
        ) : (
          <button className="btn-primary" onClick={submit} disabled={!answeredAll || busy}>
            <Icon name="check" className="h-4 w-4" /> {busy ? 'Submitting...' : 'Submit quiz'}
          </button>
        )}
      </div>

      {!answeredAll && (
        <p className="mt-2 text-center text-xs text-ink-faint">
          {questions.length - Object.keys(answers).length} still to answer.
        </p>
      )}
    </section>
  );
}

/** The marked paper: what they chose, what was right, and why. */
function QuizReview({ assignment, answers }: { assignment: any; answers: number[] | null }) {
  if (!Array.isArray(answers)) return null;
  return (
    <section className="card p-5">
      <h2 className="font-display text-lg font-bold text-ink">Your answers</h2>
      <ol className="mt-4 space-y-5">
        {(assignment.questions ?? []).map((question: any, qi: number) => (
          <li key={qi}>
            <p className="text-sm font-semibold text-ink">{qi + 1}. {question.q}</p>
            <div className="mt-2 space-y-1.5">
              {question.options.map((option: string, oi: number) => {
                const chose = answers[qi] === oi;
                return (
                  <div key={oi} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 text-sm ${
                    chose ? 'border-brand-400 bg-brand-600/8 text-ink' : 'border-line text-ink-soft'
                  }`}>
                    <span className="grid h-5 w-5 shrink-0 place-items-center self-start rounded-full border-2 border-current text-[10px] font-bold leading-none">
                      {String.fromCharCode(65 + oi)}
                    </span>
                    <span className="min-w-0 flex-1">{option}</span>
                    {chose && <span className="shrink-0 text-xs font-semibold">your answer</span>}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-ink-faint">
        Your teacher can see which questions the class found hardest.
      </p>
    </section>
  );
}
