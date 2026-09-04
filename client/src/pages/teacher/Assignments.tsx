import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../context/ToastContext';
import { dateLong, relative } from '../../lib/format';
import Icon from '../../components/Icon';
import Select from '../../components/Select';
import { Badge, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader, ProgressBar, Toggle } from '../../components/ui';

const SAMPLE_QUIZ = `What does the discriminant tell you?
- How steep the curve is
* How many real roots there are
- Where the y-intercept sits
> b squared minus 4ac: positive means two roots, zero means one, negative means none.`;

/** Same syntax as a lesson check: * marks the answer, > adds an explanation. */
function parseQuestions(text: string) {
  return text.split(/\n\s*\n/).map((block) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return null;
    const q = lines[0];
    const options: string[] = [];
    let answer = -1;
    let explain: string | null = null;
    for (const line of lines.slice(1)) {
      if (line.startsWith('>')) { explain = line.slice(1).trim(); continue; }
      const correct = line.startsWith('*');
      if (correct || line.startsWith('-')) {
        if (correct) answer = options.length;
        options.push(line.slice(1).trim());
      }
    }
    if (!q || options.length < 2 || answer < 0) return null;
    return { q, options, answer, explain };
  }).filter(Boolean) as any[];
}

export default function TeacherAssignments() {
  const { toast } = useToast();
  const { data, loading, error, reload } = useFetch<any[]>('/assignments');
  const subjects = useFetch<any[]>('/my/subjects');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({
    class_subject_id: '', title: '', description: '', due_at: '', max_score: 100,
    allow_multi_format: true, timed: false, base_duration_minutes: 60, steps: '',
    quiz: '',
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/assignments', {
        class_subject_id: Number(form.class_subject_id),
        title: form.title,
        description: form.description,
        instructions_steps: form.steps.split('\n').map((s: string) => s.trim()).filter(Boolean),
        due_at: new Date(form.due_at).toISOString(),
        max_score: Number(form.max_score),
        allow_multi_format: form.allow_multi_format,
        base_duration_minutes: form.timed ? Number(form.base_duration_minutes) : null,
        questions: parseQuestions(form.quiz),
      });
      toast('Assignment set. Students and their guardians have been notified.');
      setOpen(false);
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        icon="assignment" title="Assignments"
        subtitle="Set work, then review and grade submissions: written, audio, video or diagram."
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Icon name="plus" className="h-4 w-4" /> New assignment</button>}
      />

      {(data ?? []).length === 0 ? (
        <EmptyState icon="assignment" title="No assignments yet" body="Set your first piece of work for a class."
                    action={<button className="btn-primary" onClick={() => setOpen(true)}>Set an assignment</button>} />
      ) : (
        <ul className="space-y-3">
          {data!.map((a) => {
            const ungraded = a.submitted_count - a.graded_count;
            return (
              <li key={a.id}>
                <Link to={`/teacher/assignments/${a.id}`} className="card flex flex-col gap-3 p-4 transition hover:border-brand-300 hover:shadow-md sm:flex-row sm:items-center">
                  <span className="hidden h-14 w-1.5 shrink-0 rounded-full sm:block" style={{ background: a.colour }} />
                  <span className="min-w-0 flex-1">
                    <span className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: a.colour }}>{a.subject}</span>
                      <span className="text-xs text-ink-faint">{a.class_name}</span>
                      {a.base_duration_minutes && <Badge tone="amber" icon="clock">Timed · {a.base_duration_minutes} min</Badge>}
                      {a.is_quiz && <Badge tone="violet" icon="assignment">Quiz · {a.question_count} marked automatically</Badge>}
                      {!!a.allow_multi_format && <Badge tone="green" icon="mic">Multi-format</Badge>}
                    </span>
                    <span className="block font-semibold text-ink">{a.title}</span>
                    <span className="mt-0.5 block text-xs text-ink-soft">Due {dateLong(a.due_at)} · {relative(a.due_at)}</span>
                    <span className="mt-2 block max-w-xs">
                      <ProgressBar
                        value={a.submitted_count} max={a.class_size}
                        label={`${a.submitted_count} of ${a.class_size} submitted`}
                        tone={a.submitted_count === a.class_size ? 'green' : 'brand'}
                      />
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {ungraded > 0
                      ? <Badge tone="amber">{ungraded} to grade</Badge>
                      : a.submitted_count > 0 ? <Badge tone="green" icon="check">All graded</Badge> : <Badge tone="slate">No submissions</Badge>}
                    <Icon name="chevronRight" className="h-5 w-5 text-ink-faint" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={open} onClose={() => setOpen(false)} title="Set a new assignment" wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="assign-form" disabled={busy || !form.title || !form.class_subject_id || !form.due_at}>
              {busy ? 'Setting…' : 'Set assignment'}
            </button>
          </>
        }
      >
        <form id="assign-form" onSubmit={create} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Class and subject" required>
              <Select
                value={form.class_subject_id}
                onChange={(v) => setForm({ ...form, class_subject_id: v })}
                options={[{ value: "", label: `Choose…` }, ...(subjects.data ?? []).map((s: any) => ({ value: String(s.class_subject_id), label: `${s.class_name} · ${s.name}` }))]}
              />
            </Field>
            <Field label="Due date and time" required>
              <input type="datetime-local" className="input" value={form.due_at} required
                     onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
            </Field>
          </div>

          <Field label="Title" required>
            <input className="input" value={form.title} required placeholder="e.g. History Impact Essay"
                   onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>

          <Field label="What should students do?">
            <textarea className="input min-h-[6rem] resize-y" value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Explain the task in plain language." />
          </Field>

          <Field
            label="Step-by-step breakdown"
            hint="One step per line. Shown as a tickable checklist. This is what makes long tasks manageable for students with ADHD."
          >
            <textarea className="input min-h-[6rem] resize-y font-mono text-xs" value={form.steps}
                      onChange={(e) => setForm({ ...form, steps: e.target.value })}
                      placeholder={'Read the three sources\nDraft your thesis\nWrite three paragraphs\nProofread and submit'} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Marks available">
              <input type="number" className="input" min={1} value={form.max_score}
                     onChange={(e) => setForm({ ...form, max_score: e.target.value })} />
            </Field>
            <Field label="Timed assessment length" hint="Extra-time arrangements are applied per student automatically.">
              <div className="flex gap-2">
                <input
                  type="number" className="input" min={5} value={form.base_duration_minutes} disabled={!form.timed}
                  onChange={(e) => setForm({ ...form, base_duration_minutes: e.target.value })}
                />
                <button type="button" className={form.timed ? 'btn-primary shrink-0' : 'btn-ghost shrink-0'}
                        onClick={() => setForm({ ...form, timed: !form.timed })} aria-pressed={form.timed}>
                  {form.timed ? 'Timed' : 'Untimed'}
                </button>
              </div>
            </Field>
          </div>

          <Field
            label="Quiz questions"
            hint="Leave empty for a written assignment. With questions, pupils answer them instead of a blank box and the work is marked the moment they submit. A blank line between questions, * on the correct option, > for an explanation."
          >
            <textarea
              className="input min-h-[10rem] resize-y font-mono text-xs" value={form.quiz} spellCheck={false}
              onChange={(e) => setForm({ ...form, quiz: e.target.value })}
              placeholder={SAMPLE_QUIZ}
            />
            <span className="mt-1 block text-xs text-ink-faint">
              {parseQuestions(form.quiz).length > 0
                ? `${parseQuestions(form.quiz).length} question${parseQuestions(form.quiz).length === 1 ? '' : 's'}. Marked automatically out of ${form.max_score}.`
                : 'No questions: pupils will write or record an answer.'}
            </span>
          </Field>

          <Toggle
            checked={form.allow_multi_format} onChange={(v) => setForm({ ...form, allow_multi_format: v })}
            label="Accept audio, video and diagram submissions"
            hint="Students with an approved IEP can always use these formats regardless of this setting"
          />
        </form>
      </Modal>
    </>
  );
}
