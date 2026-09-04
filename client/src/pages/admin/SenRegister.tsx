import { useState } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useToast } from '../../context/ToastContext';
import { dateLong, NEED_LABEL } from '../../lib/format';
import Icon from '../../components/Icon';
import DatePicker from '../../components/DatePicker';
import Select from '../../components/Select';
import SupportImport from '../../components/SupportImport';
import { Badge, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader, SenBadges, StatCard, Toggle } from '../../components/ui';

const NEEDS = Object.entries(NEED_LABEL);
const MULTIPLIERS = [1, 1.1, 1.25, 1.5, 2];

export default function SenRegister() {
  const { toast } = useToast();
  const { data, loading, error, reload } = useFetch<any[]>('/iep');
  const students = useFetch<any[]>('/students');
  const [editing, setEditing] = useState<any>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);

  /** A plan is entitlements, so removing one is a decision worth confirming. */
  const remove = async (row: any) => {
    try {
      await api.delete(`/iep/${row.student_id}`);
      toast(`${row.first_name} ${row.last_name} taken off the register.`);
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const openEditor = (row: any) => setEditing({
    student_id: row.student_id,
    name: `${row.first_name} ${row.last_name}`,
    needs: row.needs ?? [],
    time_multiplier: row.time_multiplier ?? 1,
    multi_format_approved: !!row.multi_format_approved,
    scribe_allowed: !!row.scribe_allowed,
    rest_breaks: !!row.rest_breaks,
    notes: row.notes ?? '',
    review_date: row.review_date ?? '',
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/iep/${editing.student_id}`, editing);
      toast('Support plan saved. The change is recorded in the audit trail.');
      setEditing(null);
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const rows = data ?? [];
  // The register holds pupils whose support names a need or grants an
  // entitlement. Everyone else can be added, including a pupil who already has
  // classroom notes: those are carried into the plan rather than overwritten.
  const unregistered = (students.data ?? []).filter((s: any) => !rows.some((r) => r.student_id === s.id));
  const needCounts = NEEDS.map(([key, label]) => ({ key, label, n: rows.filter((r) => r.needs.includes(key)).length }));

  return (
    <>
      <PageHeader
        icon="accessibility" title="SEN register"
        subtitle="Individual Education Plans. Every change here immediately affects extra time, submission formats and the accessibility defaults across the platform."
        actions={
          <>
            <button className="btn-ghost" onClick={() => setImporting(true)}>
              <Icon name="upload" className="h-4 w-4" /> Import plans
            </button>
            <button className="btn-primary" onClick={() => setAdding(true)}>
              <Icon name="plus" className="h-4 w-4" /> New plan
            </button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="On the register" value={rows.length} icon="accessibility" tone="violet" />
        {needCounts.slice(0, 4).map((n) => (
          <StatCard key={n.key} label={n.label.split(' /')[0]} value={n.n} icon="users" />
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="accessibility" title="No students on the register yet"
          body="A pupil joins the register as soon as their support names a need or grants an entitlement, whether it is written here or on the roll."
        />
      ) : (
        <ul className="mb-6 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-ink">{r.first_name} {r.last_name}</p>
                  <p className="text-xs text-ink-soft">{r.class_name} · {r.student_code}</p>
                  <div className="mt-2"><SenBadges needs={r.needs} multiplier={r.time_multiplier} multiFormat={r.multi_format_approved} /></div>
                  {r.notes && <p className="mt-2 text-sm text-ink-soft">{r.notes}</p>}
                  <p className="mt-1.5 text-xs text-ink-faint">
                    {r.senco_name && `SENCO: ${r.senco_name} · `}
                    {r.review_date ? `Review due ${dateLong(r.review_date)}` : 'No review scheduled'}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1">
                  <button className="btn-ghost btn-sm" onClick={() => openEditor(r)}>
                    <Icon name="pencil" className="h-3.5 w-3.5" /> Edit plan
                  </button>
                  <button className="btn-subtle !px-2" onClick={() => remove(r)}
                          aria-label={`Take ${r.first_name} ${r.last_name} off the register`}
                          title="Take off the register">
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={adding} onClose={() => setAdding(false)} title="New support plan"
        footer={<button className="btn-ghost" onClick={() => setAdding(false)}>Close</button>}
      >
        <Field label="Pupil" required hint="Everyone not already on the register. Pupils with classroom support keep their notes.">
          <Select
            value=""
            placeholder={unregistered.length ? 'Choose a pupil' : 'Everyone already has a plan'}
            onChange={(v) => {
              const pupil = unregistered.find((p: any) => String(p.id) === v);
              if (!pupil) return;
              setAdding(false);
              openEditor({
                student_id: pupil.id, first_name: pupil.first_name, last_name: pupil.last_name,
                needs: [], ...(pupil.iep ?? {}),
              });
            }}
            options={unregistered.map((p: any) => ({
              value: String(p.id),
              label: `${p.first_name} ${p.last_name}`,
              hint: p.iep
                ? `${p.class_name ?? 'Not in a class'} · has support notes`
                : p.class_name ?? 'Not in a class',
            }))}
          />
        </Field>
      </Modal>

      <Modal
        open={!!editing} onClose={() => setEditing(null)} title={`Support plan: ${editing?.name ?? ''}`} wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn-primary" form="iep-form" disabled={busy}>{busy ? 'Saving…' : 'Save plan'}</button>
          </>
        }
      >
        {editing && (
          <form id="iep-form" onSubmit={save} className="space-y-5">
            <fieldset>
              <legend className="label">Identified needs</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {NEEDS.map(([key, label]) => {
                  const picked = editing.needs.includes(key);
                  return (
                    <button
                      key={key} type="button" role="checkbox" aria-checked={picked}
                      onClick={() => setEditing({
                        ...editing,
                        needs: picked ? editing.needs.filter((n: string) => n !== key) : [...editing.needs, key],
                      })}
                      className={`flex items-center gap-2.5 rounded-xl border-2 p-3 text-left transition ${
                        picked ? 'border-brand-600 bg-brand-600/8' : 'border-line hover:border-brand-300'
                      }`}
                      data-tap
                    >
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border-2 ${
                        picked ? 'border-brand-600 bg-brand-600 text-white' : 'border-line'
                      }`}>
                        {picked && <Icon name="check" className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span className="text-sm font-medium text-ink">{label}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <Field label="Extra time in timed assessments" hint="Applied automatically the moment the student starts a timed quiz or exam.">
              <div className="flex flex-wrap gap-2">
                {MULTIPLIERS.map((m) => (
                  <button
                    key={m} type="button" role="radio" aria-checked={editing.time_multiplier === m}
                    onClick={() => setEditing({ ...editing, time_multiplier: m })}
                    className={`rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition ${
                      editing.time_multiplier === m ? 'border-brand-600 bg-brand-600/8 text-ink' : 'border-line text-ink-soft hover:border-brand-300'
                    }`}
                    data-tap
                  >
                    {m === 1 ? 'Standard' : `+${Math.round((m - 1) * 100)}%`}
                    <span className="ml-1 text-xs font-normal text-ink-faint">×{m}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-faint">
                A 60-minute exam becomes {Math.round(60 * editing.time_multiplier)} minutes.
              </p>
            </Field>

            <div className="space-y-1">
              <Toggle checked={editing.multi_format_approved} onChange={(v) => setEditing({ ...editing, multi_format_approved: v })}
                      label="Multi-format submissions approved" hint="Audio, video or diagram in place of written work" />
              <Toggle checked={editing.scribe_allowed} onChange={(v) => setEditing({ ...editing, scribe_allowed: v })}
                      label="Scribe or dictation allowed" />
              <Toggle checked={editing.rest_breaks} onChange={(v) => setEditing({ ...editing, rest_breaks: v })}
                      label="Rest breaks allowed" />
            </div>

            <Field label="Plan notes" hint="Practical guidance staff can act on: what actually helps this student.">
              <textarea className="input min-h-[6rem] resize-y" value={editing.notes}
                        onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Field>

            <Field label="Next review date">
              <DatePicker
                value={editing.review_date}
                onChange={(v) => setEditing({ ...editing, review_date: v })}
              />
            </Field>
          </form>
        )}
      </Modal>
      <SupportImport open={importing} onClose={() => setImporting(false)}
                     onDone={() => { reload(); students.reload(); }} />

    </>
  );
}
