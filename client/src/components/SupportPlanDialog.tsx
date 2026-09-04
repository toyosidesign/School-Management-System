import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { NEED_LABEL } from '../lib/format';
import DatePicker from './DatePicker';
import Icon from './Icon';
import Select from './Select';
import { Field, Modal, Toggle } from './ui';

export type PlanSubject = {
  student_id: number;
  name: string;
  iep?: any;
};

const blank = {
  needs: [] as string[],
  time_multiplier: '1',
  multi_format_approved: false,
  scribe_allowed: false,
  rest_breaks: false,
  review_date: '',
  notes: '',
};

/** What puts a pupil on the SEN register, mirroring the rule the server applies. */
export function countsAsSen(plan: any) {
  return !!(plan?.needs?.length || Number(plan?.time_multiplier) > 1
            || plan?.multi_format_approved || plan?.scribe_allowed || plan?.rest_breaks);
}

/**
 * One editor for a pupil's support, wherever it is opened from.
 *
 * The plan decides what a pupil is entitled to in every timed piece of work, so
 * the register, the pupil's own page and the roll all have to offer the same
 * fields: three copies of this form would drift apart, and a pupil would end up
 * with different entitlements depending on which page a teacher happened to use.
 */
export default function SupportPlanDialog({ subject, onClose, onSaved }: {
  subject: PlanSubject | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [plan, setPlan] = useState<any>(blank);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!subject) return;
    const iep = subject.iep;
    setPlan(iep ? {
      needs: iep.needs ?? [],
      time_multiplier: String(iep.time_multiplier ?? 1),
      multi_format_approved: !!iep.multi_format_approved,
      scribe_allowed: !!iep.scribe_allowed,
      rest_breaks: !!iep.rest_breaks,
      review_date: iep.review_date ?? '',
      notes: iep.notes ?? '',
    } : blank);
  }, [subject]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject) return;
    setBusy(true);
    try {
      await api.put(`/iep/${subject.student_id}`, {
        ...plan,
        time_multiplier: Number(plan.time_multiplier) || 1,
        review_date: plan.review_date || null,
        notes: plan.notes || null,
      });
      toast(sen
        ? `Saved. ${subject.name} is on the SEN register.`
        : `Support saved for ${subject.name}.`);
      onSaved();
      onClose();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const sen = countsAsSen(plan);

  const remove = async () => {
    if (!subject) return;
    setBusy(true);
    try {
      await api.delete(`/iep/${subject.student_id}`);
      toast(`Support removed for ${subject.name}.`);
      onSaved();
      onClose();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!subject} onClose={onClose} wide
      title={subject ? `Support for ${subject.name}` : 'Support'}
      footer={
        <>
          {subject?.iep && (
            <button className="btn-subtle mr-auto" disabled={busy} onClick={remove}>
              <Icon name="trash" className="h-4 w-4" /> Remove support
            </button>
          )}
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" form="support-plan-form" disabled={busy}>
            {busy ? 'Saving...' : 'Save support'}
          </button>
        </>
      }
    >
      {subject && (
        <form id="support-plan-form" onSubmit={save} className="space-y-4">
          <p className={`rounded-xl border px-3 py-2.5 text-sm ${
            sen ? 'panel-violet text-ink' : 'border-line bg-[color:var(--surface-sunken)] text-ink-soft'}`}>
            <Icon name={sen ? 'accessibility' : 'info'} className="mr-1.5 inline h-4 w-4 shrink-0" />
            {sen
              ? 'A need or an entitlement is set, so this is a SEN plan: it appears on the SEN register and the platform applies it to timed work.'
              : 'Notes only, for staff who teach this pupil. Naming a need or granting an entitlement below puts them on the SEN register.'}
          </p>

          <Field label="Needs" hint="What staff should plan around. Leave empty for general classroom support.">
            <div className="flex flex-wrap gap-2">
              {Object.entries(NEED_LABEL).map(([key, label]) => {
                const on = plan.needs.includes(key);
                return (
                  <button
                    key={key} type="button" aria-pressed={on}
                    onClick={() => setPlan({
                      ...plan,
                      needs: on ? plan.needs.filter((n: string) => n !== key) : [...plan.needs, key],
                    })}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      on ? 'border-brand-500 bg-brand-50 text-brand-800'
                        : 'border-line text-ink-soft hover:border-brand-300 hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Extra time" hint="Applied the moment they start anything timed.">
              <Select
                value={plan.time_multiplier}
                onChange={(v) => setPlan({ ...plan, time_multiplier: v })}
                options={[
                  { value: '1', label: 'Standard time' },
                  { value: '1.25', label: '25% extra (x1.25)' },
                  { value: '1.5', label: '50% extra (x1.5)' },
                  { value: '2', label: 'Double time (x2)' },
                ]}
              />
            </Field>
            <Field label="Next review" hint="When the plan is looked at again.">
              <DatePicker value={plan.review_date} onChange={(v) => setPlan({ ...plan, review_date: v })} />
            </Field>
          </div>

          <div className="space-y-3 rounded-xl border border-line p-3">
            <Toggle
              checked={plan.multi_format_approved}
              onChange={(v) => setPlan({ ...plan, multi_format_approved: v })}
              label="May answer in audio, video or diagram"
              hint="Written work can be handed in another way, transcribed for marking"
            />
            <Toggle
              checked={plan.scribe_allowed}
              onChange={(v) => setPlan({ ...plan, scribe_allowed: v })}
              label="Scribe or dictation allowed"
            />
            <Toggle
              checked={plan.rest_breaks}
              onChange={(v) => setPlan({ ...plan, rest_breaks: v })}
              label="Rest breaks allowed"
            />
          </div>

          <Field label="Notes for staff" hint="What actually helps, in practical terms.">
            <textarea className="input min-h-[5rem] resize-y" value={plan.notes}
                      onChange={(e) => setPlan({ ...plan, notes: e.target.value })}
                      placeholder="Sits near the front. Prefers instructions written down as well as spoken." />
          </Field>
        </form>
      )}
    </Modal>
  );
}
