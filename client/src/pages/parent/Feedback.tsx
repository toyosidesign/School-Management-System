import { useState } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { relative } from '../../lib/format';
import Icon from '../../components/Icon';
import { Badge, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader, Toggle } from '../../components/ui';

export default function ParentFeedback() {
  const { toast } = useToast();
  const { activeChild } = useAuth();
  const child = useFetch<any>(activeChild ? `/students/${activeChild.id}` : null, [activeChild?.id]);
  const mine = useFetch<any[]>('/feedback');
  const [target, setTarget] = useState<any>(null);
  const [form, setForm] = useState({ rating: 0, clarity: 0, support: 0, comment: '', is_anonymous: true });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/feedback', {
        teacher_id: target.teacher_id,
        class_subject_id: target.class_subject_id,
        student_id: activeChild.id,
        ...form,
      });
      toast('Thank you. Your feedback has been sent.');
      setTarget(null);
      setForm({ rating: 0, clarity: 0, support: 0, comment: '', is_anonymous: true });
      mine.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!activeChild) return <EmptyState icon="users" title="No child linked to your account" />;
  if (child.loading) return <Loading rows={3} />;
  if (child.error) return <ErrorNote error={child.error} onRetry={child.reload} />;

  const rated = new Set((mine.data ?? []).map((f: any) => f.teacher_name));

  return (
    <>
      <PageHeader
        icon="star" title={`Feedback on ${activeChild.first_name}'s teachers`}
        subtitle="Tell the school what is working and what is not. You can send it anonymously, so a teacher sees the feedback but not your name."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {((child.data?.subjects ?? []) as any[]).filter((s) => s.teacher_id).map((s: any) => (
          <article key={s.class_subject_id} className="card p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: s.colour }}>
                <Icon name={s.icon ?? 'book'} className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-bold text-ink">{s.teacher_name}</h3>
                <p className="truncate text-xs text-ink-soft">{s.name}</p>
              </div>
            </div>
            <button className="btn-ghost mt-3 w-full" onClick={() => setTarget(s)}>
              <Icon name="star" className="h-4 w-4" />
              {rated.has(s.teacher_name) ? 'Send more feedback' : 'Give feedback'}
            </button>
          </article>
        ))}
      </div>

      {(mine.data ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-soft">Feedback you have sent</h2>
          <ul className="space-y-2">
            {mine.data!.map((f: any) => (
              <li key={f.id} className="card flex flex-wrap items-center gap-3 p-4">
                <Stars value={f.rating} readOnly />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{f.teacher_name} · {f.subject}</span>
                  {f.comment && <span className="block truncate text-xs text-ink-soft">{f.comment}</span>}
                </span>
                {!!f.is_anonymous && <Badge tone="slate" icon="eye">Anonymous</Badge>}
                <span className="text-xs text-ink-faint">{relative(f.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={!!target} onClose={() => setTarget(null)} title={`Feedback for ${target?.teacher_name ?? ''}`}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setTarget(null)}>Cancel</button>
            <button className="btn-primary" form="fb-form" disabled={busy || !form.rating}>{busy ? 'Sending…' : 'Send feedback'}</button>
          </>
        }
      >
        <form id="fb-form" onSubmit={submit} className="space-y-5">
          <RatingRow label="Overall, how are the lessons?" value={form.rating} onChange={(v) => setForm({ ...form, rating: v })} />
          <RatingRow label="How clearly is everything explained?" value={form.clarity} onChange={(v) => setForm({ ...form, clarity: v })} />
          <RatingRow label="How well supported does your child feel?" value={form.support} onChange={(v) => setForm({ ...form, support: v })} />

          <Field label="Anything you want to say?" hint="Optional. Be honest and kind. This is read by the teacher and the head.">
            <textarea
              className="input min-h-[6rem] resize-y" value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
              placeholder="For example: the worked examples she brings home really help."
            />
          </Field>

          <Toggle
            checked={form.is_anonymous} onChange={(v) => setForm({ ...form, is_anonymous: v })}
            label="Send anonymously" hint="The teacher sees the feedback but not your name"
          />
        </form>
      </Modal>
    </>
  );
}

function RatingRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <span className="label">{label}</span>
      <Stars value={value} onChange={onChange} />
    </div>
  );
}

function Stars({ value, onChange, readOnly }: { value: number; onChange?: (v: number) => void; readOnly?: boolean }) {
  return (
    <div className="flex gap-1" role={readOnly ? undefined : 'radiogroup'} aria-label="Rating out of five">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n} type="button" disabled={readOnly} onClick={() => onChange?.(n)}
          role={readOnly ? undefined : 'radio'} aria-checked={value === n}
          aria-label={`${n} out of 5`}
          className={`rounded-lg p-1 transition ${readOnly ? '' : 'hover:scale-110'} ${n <= value ? 'text-amber-500' : 'text-slate-300'}`}
          data-tap={readOnly ? undefined : true}
        >
          <Icon name="star" className="h-6 w-6" filled={n <= value} />
        </button>
      ))}
    </div>
  );
}
