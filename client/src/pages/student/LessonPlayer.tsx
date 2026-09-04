import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useAccessibility } from '../../context/AccessibilityContext';
import { useToast } from '../../context/ToastContext';
import { hms } from '../../lib/format';
import Icon from '../../components/Icon';
import { Readable, SpeakButton } from '../../components/Readable';
import { Badge, ProgressBar } from '../../components/ui';

/**
 * A catch-up lesson, worked through one step at a time.
 *
 * Everything for a missed lesson used to sit on a single long page, which is
 * the worst possible shape for the pupils this exists for: a child who was ill
 * opens it already behind, and is met with a video, a transcript, notes and a
 * quiz all at once. One step at a time gives the catching up a beginning and an
 * end, and makes progress visible.
 */
export default function LessonPlayer({ entry, onUpdate, readOnly }:
  { entry: any; onUpdate: (patch: any) => void; readOnly?: boolean }) {
  const { toast } = useToast();
  const steps: any[] = entry.steps ?? [];
  const doneSteps: string[] = entry.steps_done ?? [];

  // Open on the first unfinished step, so returning resumes rather than restarts.
  const [active, setActive] = useState(() => {
    const next = steps.findIndex((s) => !doneSteps.includes(s.key));
    return next === -1 ? 0 : next;
  });

  const step = steps[active];
  const isDone = (key: string) => (entry.steps_done ?? []).includes(key);

  const record = async (payload: any, note?: string) => {
    if (readOnly) return null;
    try {
      const res = await api.patch(`/catchup/${entry.id}`, payload);
      onUpdate({
        status: res.status, steps_done: res.steps_done,
        check_score: res.check_score, check_total: res.check_total,
      });
      if (res.status === 'completed' && entry.status !== 'completed') {
        toast('Lesson caught up. Nicely done.');
      } else if (note) {
        toast(note);
      }
      return res;
    } catch (e: any) {
      toast(e.message, 'error');
      return null;
    }
  };

  const advance = () => setActive((i) => Math.min(i + 1, steps.length - 1));
  const finishStep = async (key: string, note?: string) => {
    await record({ step: key }, note);
    if (active < steps.length - 1) advance();
  };

  if (!steps.length) return null;

  return (
    <div className="border-t border-line">
      {/* Step rail */}
      <nav className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2.5 no-scrollbar" aria-label="Lesson steps">
        {steps.map((s, i) => {
          const done = isDone(s.key);
          const current = i === active;
          return (
            <button
              key={s.key}
              onClick={() => setActive(i)}
              aria-current={current ? 'step' : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                current ? 'bg-brand-600 text-white'
                  : done ? 'text-emerald-700 hover:bg-emerald-50'
                  : 'text-ink-soft hover:bg-[color:var(--surface-sunken)]'
              }`}
              data-tap
            >
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${
                current ? 'bg-white/25 text-white'
                  : done ? 'bg-emerald-600 text-white'
                  : 'bg-[color:var(--surface-sunken)] text-ink-soft'
              }`}>
                {done ? <Icon name="check" className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              {s.label}
            </button>
          );
        })}
      </nav>

      <div className="p-4 sm:p-5">
        {step?.key === 'watch' && (
          <WatchStep entry={entry} record={record} done={isDone('watch')} readOnly={readOnly} onNext={advance} />
        )}
        {step?.key === 'read' && (
          <ReadStep entry={entry} done={isDone('read')} readOnly={readOnly}
                    onDone={() => finishStep('read', 'Notes marked as read.')} />
        )}
        {step?.key === 'check' && (
          <CheckStep entry={entry} record={record} readOnly={readOnly} />
        )}
      </div>

      {/* Step footer */}
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
        <button className="btn-subtle" onClick={() => setActive((i) => Math.max(0, i - 1))} disabled={active === 0}>
          <Icon name="chevronLeft" className="h-4 w-4" /> Back
        </button>
        <p className="text-xs text-ink-faint">Step {active + 1} of {steps.length}</p>
        {active < steps.length - 1 ? (
          <button className="btn-ghost" onClick={advance}>
            Next <Icon name="chevronRight" className="h-4 w-4" />
          </button>
        ) : entry.status === 'completed' ? (
          <Badge tone="green" icon="check">All done</Badge>
        ) : (
          <span className="text-xs text-ink-faint">Finish this step</span>
        )}
      </div>
    </div>
  );
}

/* ── 1. Watch the recap ───────────────────────────────────────────────────── */
function WatchStep({ entry, record, done, readOnly, onNext }: any) {
  const { prefs } = useAccessibility();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [position, setPosition] = useState(entry.video_position || 0);
  const [duration, setDuration] = useState(entry.video_duration || 0);
  const [query, setQuery] = useState('');
  const transcript: { t: string; text: string }[] = entry.transcript ?? [];

  // Pick up where they left off. The position was already being saved; it was
  // simply never used, so every pupil restarted from the beginning.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !entry.video_position) return;
    const resume = () => { el.currentTime = entry.video_position; };
    el.addEventListener('loadedmetadata', resume, { once: true });
    return () => el.removeEventListener('loadedmetadata', resume);
  }, [entry.video_position]);

  // Save progress occasionally rather than on every frame.
  useEffect(() => {
    if (readOnly || !position) return;
    const t = setTimeout(() => record({ video_position: Math.floor(position) }), 4000);
    return () => clearTimeout(t);
  }, [Math.floor(position / 10), readOnly]);

  const seek = (stamp: string) => {
    const [m, sec] = stamp.split(':').map(Number);
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = m * 60 + (sec || 0);
    el.play().catch(() => {});
  };

  const lines = query
    ? transcript.filter((l) => l.text.toLowerCase().includes(query.toLowerCase()))
    : transcript;

  const watchedFraction = duration ? position / duration : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-3">
        {entry.video_url ? (
          <>
            <div className="overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef} controls playsInline preload="metadata" className="aspect-video w-full"
                crossOrigin="anonymous"
                onLoadedMetadata={(e) => setDuration((e.target as HTMLVideoElement).duration || 0)}
                onTimeUpdate={(e) => {
                  const el = e.target as HTMLVideoElement;
                  setPosition(el.currentTime);
                  if (!done && el.duration && el.currentTime / el.duration > 0.9) record({ step: 'watch' });
                }}
                onEnded={() => record({ step: 'watch' })}
              >
                <source src={entry.video_url} type="video/mp4" />
                <track kind="captions" srcLang={entry.captions_lang ?? 'en'} label="English"
                       default={!!prefs.captions} src={captionsDataUrl(transcript)} />
                Your browser cannot play this recording. Use the transcript and notes instead.
              </video>
            </div>

            <ProgressBar
              value={Math.round(watchedFraction * 100)}
              label={duration ? `Watched ${hms(position)} of ${hms(duration)}` : 'Watch progress'}
              tone={done ? 'green' : 'brand'}
            />

            <div className="flex flex-wrap items-center gap-2">
              {entry.video_position > 5 && position <= entry.video_position + 1 && (
                <Badge tone="brand" icon="clock">Resumed from {hms(entry.video_position)}</Badge>
              )}
              {prefs.captions
                ? <Badge tone="green" icon="check">Captions on</Badge>
                : <Badge tone="slate">Captions available in the player</Badge>}
              {done && <Badge tone="green" icon="check">Watched</Badge>}
            </div>

            {!readOnly && !done && (
              <button className="btn-ghost w-full" onClick={() => record({ step: 'watch' }, 'Marked as watched.')}>
                <Icon name="check" className="h-4 w-4" /> I have watched this
              </button>
            )}
            {done && <button className="btn-primary w-full" onClick={onNext}>Next: read the notes</button>}
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">
            There is no recording for this lesson. The notes cover what you missed.
          </p>
        )}
      </div>

      <aside className="min-w-0">
        <div className="rounded-xl border border-line bg-[color:var(--surface-sunken)]">
          <div className="border-b border-line p-3">
            <h4 className="mb-2 text-sm font-bold text-ink">Transcript</h4>
            <label className="relative block">
              <span className="sr-only">Search the transcript</span>
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <input className="input !py-2 !pl-9 !text-sm" type="search" value={query}
                     onChange={(e) => setQuery(e.target.value)} placeholder="Find a moment..." />
            </label>
          </div>
          <ol className="max-h-80 space-y-0.5 overflow-y-auto p-2">
            {lines.length === 0 && (
              <li className="px-2 py-4 text-center text-xs text-ink-faint">Nothing matches that.</li>
            )}
            {lines.map((line, i) => (
              <li key={i}>
                <button onClick={() => seek(line.t)}
                        className="flex w-full gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-[color:var(--surface-raised)]"
                        data-tap>
                  <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-brand-600">{line.t}</span>
                  <span className="text-xs leading-relaxed text-ink-soft">{line.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}

/* ── 2. Read the notes ────────────────────────────────────────────────────── */
function ReadStep({ entry, done, readOnly, onDone }: any) {
  const notes = (entry.attachments ?? []).filter((a: any) => a.type === 'note' && a.content);

  // Everything written for this lesson, in the order a pupil should meet it.
  const sections = useMemo(() => {
    const out: { title: string; body: string }[] = [];
    if (entry.summary) out.push({ title: 'Summary', body: entry.summary });
    if (entry.teacher_notes) out.push({ title: 'What to focus on', body: entry.teacher_notes });
    for (const note of notes) out.push({ title: note.name, body: note.content });
    return out;
  }, [entry.summary, entry.teacher_notes, entry.attachments]);

  const allText = sections.map((s) => `${s.title}. ${s.body}`).join('\n\n');

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">
          {sections.length} section{sections.length === 1 ? '' : 's'} to read. Use read-aloud if that is easier.
        </p>
        <SpeakButton text={allText} label="Read the whole lesson aloud" />
      </div>

      {sections.map((section, i) => (
        <section key={i} className="rounded-xl border border-line p-4">
          <div className="mb-2 flex items-start justify-between gap-3">
            <h4 className="font-display text-base font-bold text-ink">{section.title}</h4>
            <SpeakButton text={section.body} compact />
          </div>
          <div className="space-y-3">
            {section.body.split('\n\n').map((para: string, p: number) => (
              <Readable key={p} text={para} className="text-[15px] leading-relaxed text-ink" />
            ))}
          </div>
        </section>
      ))}

      {!!(entry.attachments ?? []).filter((a: any) => a.type !== 'note').length && (
        <section className="rounded-xl border border-line p-4">
          <h4 className="mb-2 font-display text-base font-bold text-ink">Also attached</h4>
          <div className="space-y-2">
            {(entry.attachments ?? []).filter((a: any) => a.type !== 'note').map((a: any) => (
              a.type === 'audio' && a.url && a.url !== '#' ? (
                <div key={a.name}>
                  <p className="mb-1 text-sm font-semibold text-ink">{a.name}</p>
                  <audio controls preload="none" className="w-full" src={a.url} />
                </div>
              ) : a.url && a.url !== '#' ? (
                <a key={a.name} href={a.url} target="_blank" rel="noreferrer" className="btn-ghost w-full justify-start">
                  <Icon name="file" className="h-4 w-4" /> {a.name}
                </a>
              ) : null
            ))}
          </div>
        </section>
      )}

      {!readOnly && (
        done
          ? <p className="flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 py-3 text-sm font-semibold text-emerald-900">
              <Icon name="check" className="h-4 w-4" strokeWidth={2.5} /> You have read the notes
            </p>
          : <button className="btn-primary w-full !py-3" onClick={onDone}>
              <Icon name="check" className="h-4 w-4" /> I have read this
            </button>
      )}
    </div>
  );
}

/* ── 3. Quick check ───────────────────────────────────────────────────────── */
function CheckStep({ entry, record, readOnly }: any) {
  const questions: any[] = entry.check_questions ?? [];
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [marked, setMarked] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  const question = questions[index];
  const answeredAll = questions.every((_, i) => answers[i] != null);

  const submit = async () => {
    setBusy(true);
    const res = await record({ answers: questions.map((_, i) => answers[i]) });
    if (res?.marked) { setMarked(res.marked); setIndex(0); }
    setBusy(false);
  };

  /* Results review, walked through one at a time like the questions were. */
  if (marked) {
    const score = marked.filter((m) => m.correct).length;
    const result = marked[index];
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 rounded-xl border border-line p-4 text-center">
          <p className="font-display text-3xl font-bold text-ink">{score} / {marked.length}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {score === marked.length
              ? 'All correct. You have caught up on this lesson.'
              : 'Have a look at the ones you missed, then try again if you want to.'}
          </p>
        </div>

        <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
          Question {index + 1} of {marked.length}
        </p>
        <p className="mt-1 font-semibold text-ink">{questions[index].q}</p>

        <div className="mt-3 space-y-1.5">
          {questions[index].options.map((option: string, oi: number) => {
            const isAnswer = result.answer === oi;
            const chose = result.chosen === oi;
            return (
              <div key={oi} className={`flex items-start gap-2.5 rounded-xl border-2 px-3 py-2.5 text-sm ${
                isAnswer ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                  : chose ? 'border-red-300 bg-red-50 text-red-900'
                  : 'border-line text-ink-soft'
              }`}>
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-current text-[10px] font-bold leading-none">
                  {String.fromCharCode(65 + oi)}
                </span>
                <span className="min-w-0 flex-1">{option}</span>
                {isAnswer && <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={3} />}
                {chose && !isAnswer && <span className="text-xs font-semibold">you chose this</span>}
              </div>
            );
          })}
        </div>

        {result.explain && (
          <p className="mt-3 rounded-xl bg-[color:var(--surface-sunken)] px-4 py-3 text-sm text-ink-soft">
            {result.explain}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <button className="btn-subtle" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
            <Icon name="chevronLeft" className="h-4 w-4" /> Previous
          </button>
          {index < marked.length - 1 ? (
            <button className="btn-ghost" onClick={() => setIndex((i) => i + 1)}>
              Next <Icon name="chevronRight" className="h-4 w-4" />
            </button>
          ) : (
            <button className="btn-ghost" onClick={() => { setMarked(null); setAnswers({}); setIndex(0); }}>
              <Icon name="catchup" className="h-4 w-4" /> Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  /* Answering, one question at a time. */
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <ProgressBar
          value={Object.keys(answers).length} max={questions.length}
          label={`Question ${index + 1} of ${questions.length}`}
        />
      </div>

      <p className="font-display text-lg font-bold leading-snug text-ink">{question.q}</p>

      <div className="mt-4 space-y-2" role="radiogroup" aria-label={question.q}>
        {question.options.map((option: string, oi: number) => {
          const chosen = answers[index] === oi;
          return (
            <button
              key={oi} type="button" role="radio" aria-checked={chosen} disabled={readOnly}
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

      <div className="mt-5 flex items-center justify-between gap-3">
        <button className="btn-subtle" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
          <Icon name="chevronLeft" className="h-4 w-4" /> Previous
        </button>
        {index < questions.length - 1 ? (
          <button className="btn-ghost" onClick={() => setIndex((i) => i + 1)} disabled={answers[index] == null}>
            Next <Icon name="chevronRight" className="h-4 w-4" />
          </button>
        ) : (
          <button className="btn-primary" onClick={submit} disabled={!answeredAll || busy || readOnly}>
            <Icon name="check" className="h-4 w-4" /> {busy ? 'Checking...' : 'Check my answers'}
          </button>
        )}
      </div>

      {!answeredAll && index === questions.length - 1 && (
        <p className="mt-2 text-center text-xs text-ink-faint">Answer every question to finish.</p>
      )}
    </div>
  );
}

/** Builds a WebVTT track from the transcript, so captions need no extra file. */
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
