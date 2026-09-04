import { useEffect, useState } from 'react';
import { api, qs } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../context/ToastContext';
import { dateLong } from '../../lib/format';
import Icon from '../../components/Icon';
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';
import { Badge, ChipRail, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader, Toggle } from '../../components/ui';

const SAMPLE_TRANSCRIPT = `00:15 | Welcome back class. Today we are looking at the new topic.
09:05 | Here is a worked example. Follow along in your notes.
22:10 | This is the key idea to remember for the assessment.
38:45 | A common mistake to avoid.`;

/**
 * One question per block. The asterisk marks the correct option, which keeps
 * authoring to plain text rather than a form full of nested fields.
 */
const SAMPLE_NOTES = `Lesson notes
What we covered today, and the worked examples to copy down.

The key idea
The one thing to remember from this lesson.

What to do next
Try questions 1 to 4. Message me if you get stuck on the same step twice.`;

const SAMPLE_CHECK = `What was the main idea of this lesson?
- A plausible but wrong answer
* The correct answer
- Another wrong answer
> Shown after they answer, explaining why.`;

type CheckQuestion = { q: string; options: string[]; answer: number; explain: string | null };

function parseCheck(text: string): CheckQuestion[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => {
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
    })
    .filter(Boolean) as CheckQuestion[];
}

function formatCheck(questions: CheckQuestion[] = []): string {
  return questions
    .map((c) =>
      [c.q, ...c.options.map((o, i) => `${i === c.answer ? '*' : '-'} ${o}`), c.explain ? `> ${c.explain}` : null]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n\n');
}

export default function TeacherMaterials() {
  const { toast } = useToast();
  const subjects = useFetch<any[]>('/my/subjects');
  const [cs, setCs] = useState('');
  const [state, setState] = useState('');
  const materials = useFetch<any[]>(`/materials${qs({ classSubjectId: cs, state })}`, [cs, state]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({
    class_subject_id: '', lesson_date: new Date().toISOString().slice(0, 10), period: 1,
    topic: '', summary: '', teacher_notes: '', video_url: '', transcript: SAMPLE_TRANSCRIPT,
    check: SAMPLE_CHECK, notes: SAMPLE_NOTES, is_published: true,
  });

  useEffect(() => {
    if (!form.class_subject_id && subjects.data?.length) {
      setForm((f: any) => ({ ...f, class_subject_id: String(subjects.data![0].class_subject_id) }));
    }
  }, [subjects.data, form.class_subject_id]);

  const togglePublish = async (m: any) => {
    try {
      await api.patch(`/materials/${m.id}/publish`, { is_published: !m.is_published });
      materials.reload();
      toast(m.is_published
        ? 'Withdrawn. Pupils now see this lesson as waiting for a recap.'
        : 'Published. Anyone who missed this lesson has been notified.');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const transcript = form.transcript.split('\n').map((line: string) => {
        const [t, ...rest] = line.split('|');
        return { t: t.trim(), text: rest.join('|').trim() };
      }).filter((l: any) => l.t && l.text);

      const res = await api.post('/materials', {
        ...form,
        class_subject_id: Number(form.class_subject_id),
        period: Number(form.period),
        transcript,
        check_questions: parseCheck(form.check),
        is_published: form.is_published,
        // Written notes travel as text so a pupil's font, tint and read-aloud
        // settings apply to them. Files are added separately, after publishing.
        attachments: form.notes.trim()
          ? [{ name: 'Lesson notes', type: 'note', content: form.notes.trim() }]
          : [],
      });
      toast(
        res.backfilled_catchup_entries
          ? `Recap published and attached to ${res.backfilled_catchup_entries} waiting Catch-Up ${res.backfilled_catchup_entries === 1 ? 'entry' : 'entries'}.`
          : 'Lesson recap published.'
      );
      setOpen(false);
      materials.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        icon="video" title="Lesson recaps"
        subtitle="What you publish here is what absent students see in their Catch-Up Hub. Recaps attach themselves to existing entries automatically."
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Icon name="plus" className="h-4 w-4" /> Publish a recap</button>}
      />

      <div className="mb-5 space-y-3">
        <div className="card p-4">
          <label className="block">
            <span className="label">Filter by class and subject</span>
            <Select
              value={cs}
              onChange={(v) => setCs(v)}
              options={[{ value: "", label: `All of my classes` }, ...(subjects.data ?? []).map((s: any) => ({ value: String(s.class_subject_id), label: `${s.class_name} · ${s.name}` }))]}
            />
          </label>
        </div>

        <ChipRail
          ariaLabel="Filter by publication state" value={state} onChange={setState}
          options={[
            { value: '', label: 'All' },
            { value: 'published', label: 'Published' },
            { value: 'draft', label: 'Drafts' },
          ]}
        />
      </div>

      {materials.loading && <Loading rows={3} />}
      {materials.error && <ErrorNote error={materials.error} onRetry={materials.reload} />}

      {!materials.loading && (materials.data ?? []).length === 0 && (
        <EmptyState
          icon="video" title="No recaps published yet"
          body="Publish notes, a summary and, if you have one, a recording, so students who were away can catch up on their own."
          action={<button className="btn-primary" onClick={() => setOpen(true)}>Publish your first recap</button>}
        />
      )}

      <ul className="space-y-3">
        {(materials.data ?? []).map((m: any) => (
          <li key={m.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <Badge tone={m.is_published ? 'green' : 'amber'} icon={m.is_published ? 'check' : 'clock'}>
                    {m.is_published ? 'Published' : 'Draft'}
                  </Badge>
                  {m.subject && <Badge tone="brand">{m.subject}</Badge>}
                  {m.class_name && <Badge tone="slate">{m.class_name}</Badge>}
                  <Badge tone="slate">Period {m.period}</Badge>
                  {m.video_url && <Badge tone="green" icon="video">Recording</Badge>}
                  {!!m.transcript?.length && <Badge tone="green" icon="text">{m.transcript.length}-line transcript</Badge>}
                  {!!m.check_questions?.length && (
                    <Badge tone="violet" icon="assignment">{m.check_questions.length}-question check</Badge>
                  )}
                  {!!m.attachments?.length && (
                    <Badge tone="slate" icon="file">
                      {m.attachments.length} attachment{m.attachments.length === 1 ? '' : 's'}
                    </Badge>
                  )}
                </div>
                <h2 className="font-bold text-ink">{m.topic}</h2>
                <p className="text-xs text-ink-faint">{dateLong(m.lesson_date)}</p>
                {m.summary && <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{m.summary}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
              <button
                className={m.is_published ? 'btn-ghost' : 'btn-primary'}
                onClick={() => togglePublish(m)}
                title={m.is_published ? 'Withdraw from pupils' : 'Make visible to pupils'}
              >
                <Icon name={m.is_published ? 'x' : 'check'} className="h-4 w-4" />
                {m.is_published ? 'Withdraw' : 'Publish'}
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  setForm({
                    class_subject_id: String(m.class_subject_id), lesson_date: m.lesson_date, period: m.period,
                    topic: m.topic, summary: m.summary ?? '', teacher_notes: m.teacher_notes ?? '',
                    video_url: m.video_url ?? '',
                    transcript: (m.transcript ?? []).map((l: any) => `${l.t} | ${l.text}`).join('\n'),
                    check: formatCheck(m.check_questions),
                    notes: (m.attachments ?? []).find((a: any) => a.type === 'note')?.content ?? '',
                  });
                  setOpen(true);
                }}
              >
                <Icon name="text" className="h-4 w-4" /> Edit
              </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Modal
        open={open} onClose={() => setOpen(false)} title="Publish a lesson recap" wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="mat-form" disabled={busy || !form.topic || !form.class_subject_id}>
              {busy ? 'Publishing…' : 'Publish recap'}
            </button>
          </>
        }
      >
        <form id="mat-form" onSubmit={publish} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Class and subject" required>
              <Select
                value={form.class_subject_id}
                onChange={(v) => setForm({ ...form, class_subject_id: v })}
                options={[...(subjects.data ?? []).map((s: any) => ({ value: String(s.class_subject_id), label: `${s.class_name} · ${s.name}` }))]}
              />
            </Field>
            <Field label="Lesson date" required>
              <DatePicker
                value={form.lesson_date}
                onChange={(v) => setForm({ ...form, lesson_date: v })}
              />
            </Field>
            <Field label="Period">
              <Select
                value={form.period}
                onChange={(v) => setForm({ ...form, period: v })}
                options={[...[1, 2, 3, 4, 5].map((p: any) => ({ value: String(p), label: `Period ${p}` }))]}
              />
            </Field>
          </div>

          <Field label="Topic" required>
            <input className="input" value={form.topic} required placeholder="e.g. Quadratic Equations: Intro & Graphing"
                   onChange={(e) => setForm({ ...form, topic: e.target.value })} />
          </Field>

          <Field label="Summary" hint="A short paragraph a student can read in a minute.">
            <textarea className="input min-h-[5rem] resize-y" value={form.summary}
                      onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          </Field>

          <Field label="Teacher notes" hint="What should an absent student focus on? Point them at the part of the recording that matters.">
            <textarea className="input min-h-[5rem] resize-y" value={form.teacher_notes}
                      onChange={(e) => setForm({ ...form, teacher_notes: e.target.value })} />
          </Field>

          <Field label="Recording URL" hint="Any MP4 URL. Streaming adapts to the student's bandwidth and captions are built from the transcript below.">
            <input className="input" type="url" value={form.video_url} placeholder="https://…"
                   onChange={(e) => setForm({ ...form, video_url: e.target.value })} />
          </Field>

          <Field label="Transcript" hint="One line per timestamp, in the form  mm:ss | what was said. Students can search this and jump straight to that moment.">
            <textarea className="input min-h-[8rem] resize-y font-mono text-xs" value={form.transcript}
                      onChange={(e) => setForm({ ...form, transcript: e.target.value })} />
          </Field>

          <Toggle
            checked={form.is_published}
            onChange={(v) => setForm({ ...form, is_published: v })}
            label="Publish to pupils now"
            hint="Leave off to save it as a draft. Pupils keep seeing the lesson as waiting until you publish."
          />

          <Field
            label="Notes for pupils who missed this"
            hint="Written here rather than attached as a file, so a pupil's own font, colour, text size and read-aloud settings work on it. Leave a blank line between sections."
          >
            <textarea className="input min-h-[9rem] resize-y" value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>

          <Field
            label="Quick check"
            hint="A blank line between questions. Mark the correct option with * and the wrong ones with -. A line starting with > is shown after they answer. Leave empty for no check."
          >
            <textarea className="input min-h-[10rem] resize-y font-mono text-xs" value={form.check}
                      onChange={(e) => setForm({ ...form, check: e.target.value })} spellCheck={false} />
            <span className="mt-1 block text-xs text-ink-faint">
              {parseCheck(form.check).length} question{parseCheck(form.check).length === 1 ? '' : 's'} will be published.
              Pupils finish a catch-up lesson by answering these, so it means more than pressing a button.
            </span>
          </Field>
        </form>
      </Modal>
    </>
  );
}
