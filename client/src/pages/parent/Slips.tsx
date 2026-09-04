import { useState } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { dateLong, money, relative } from '../../lib/format';
import Icon from '../../components/Icon';
import { Readable } from '../../components/Readable';
import { Badge, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader } from '../../components/ui';

export default function ParentSlips() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, loading, error, reload } = useFetch<any[]>('/slips');
  const [signing, setSigning] = useState<any>(null);
  const [decision, setDecision] = useState<'approved' | 'declined'>('approved');
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);

  const openSign = (slip: any) => {
    setSigning(slip);
    setDecision('approved');
    setSignature(`${user.first_name} ${user.last_name}`);
  };

  const sign = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/slips/${signing.id}/sign`, { student_id: signing.student_id, decision, signature });
      toast(decision === 'approved' ? 'Consent given. Thank you.' : 'Recorded as declined.');
      setSigning(null);
      reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  const slips = data ?? [];
  const pending = slips.filter((s) => !s.decision);

  return (
    <>
      <PageHeader
        icon="slip" title="Permission slips"
        subtitle={pending.length ? `${pending.length} awaiting your signature.` : 'Everything is signed. Nothing needs your attention.'}
      />

      {slips.length === 0 ? (
        <EmptyState icon="slip" title="No permission slips" body="Trips and activities needing consent appear here." />
      ) : (
        <ul className="space-y-3">
          {slips.map((s) => {
            const overdue = !s.decision && new Date(s.respond_by) < new Date();
            return (
              <li key={`${s.id}-${s.student_id}`} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      {s.decision
                        ? <Badge tone={s.decision === 'approved' ? 'green' : 'red'} icon={s.decision === 'approved' ? 'check' : 'x'}>
                            {s.decision === 'approved' ? 'Consent given' : 'Declined'}
                          </Badge>
                        : <Badge tone={overdue ? 'red' : 'amber'}>{overdue ? 'Response overdue' : 'Needs your signature'}</Badge>}
                      <Badge tone="slate">{s.student_first_name}</Badge>
                      {s.cost > 0 && <Badge tone="brand" icon="money">{money(s.cost)}</Badge>}
                    </div>
                    <h2 className="font-bold text-ink">{s.title}</h2>
                    {s.description && <Readable text={s.description} className="mt-1 text-sm text-ink-soft" />}
                    <p className="mt-2 text-xs text-ink-faint">
                      {s.event_date && <>Event {dateLong(s.event_date)} · </>}
                      Respond by {dateLong(s.respond_by)}
                    </p>
                    {s.signed_at && (
                      <p className="mt-1.5 text-xs text-ink-faint">
                        Signed “{s.signature}” · {relative(s.signed_at)}
                      </p>
                    )}
                  </div>

                  <button className={s.decision ? 'btn-ghost shrink-0' : 'btn-primary shrink-0'} onClick={() => openSign(s)}>
                    <Icon name={s.decision ? 'text' : 'check'} className="h-4 w-4" />
                    {s.decision ? 'Change response' : 'Sign now'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={!!signing} onClose={() => setSigning(null)} title={signing?.title ?? 'Permission slip'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setSigning(null)}>Cancel</button>
            <button className="btn-primary" form="sign-form" disabled={busy || !signature.trim()}>
              {busy ? 'Submitting…' : 'Submit response'}
            </button>
          </>
        }
      >
        {signing && (
          <form id="sign-form" onSubmit={sign} className="space-y-4">
            <div className="rounded-xl bg-[color:var(--surface-sunken)] p-4 text-sm">
              <p className="font-bold text-ink">{signing.title}</p>
              {signing.description && <p className="mt-1 text-ink-soft">{signing.description}</p>}
              <dl className="mt-3 space-y-1 text-xs text-ink-soft">
                <div className="flex justify-between"><dt>Child</dt><dd className="font-semibold text-ink">{signing.student_first_name}</dd></div>
                {signing.event_date && <div className="flex justify-between"><dt>Date</dt><dd className="font-semibold text-ink">{dateLong(signing.event_date)}</dd></div>}
                {signing.cost > 0 && <div className="flex justify-between"><dt>Cost</dt><dd className="font-semibold text-ink">{money(signing.cost)}</dd></div>}
              </dl>
            </div>

            <fieldset>
              <legend className="label">Your decision</legend>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'approved', label: 'I give consent', icon: 'check' },
                  { value: 'declined', label: 'I do not consent', icon: 'x' },
                ].map((d) => (
                  <button
                    key={d.value} type="button" role="radio" aria-checked={decision === d.value}
                    onClick={() => setDecision(d.value as any)}
                    className={`rounded-xl border-2 p-3 text-center transition ${
                      decision === d.value
                        ? d.value === 'approved' ? 'border-emerald-600 bg-emerald-50' : 'border-red-600 bg-red-50'
                        : 'border-line hover:border-brand-300'
                    }`}
                    data-tap
                  >
                    <Icon name={d.icon} className={`mx-auto h-5 w-5 ${d.value === 'approved' ? 'text-emerald-600' : 'text-red-600'}`} />
                    <span className="mt-1 block text-xs font-semibold text-ink">{d.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <Field label="Type your full name to sign" required hint="Your typed name, the time and your IP address are recorded in the audit trail.">
              <input
                className="input font-semibold" value={signature} required
                onChange={(e) => setSignature(e.target.value)} placeholder="Your full name"
                style={{ fontFamily: 'cursive' }}
              />
            </Field>
          </form>
        )}
      </Modal>
    </>
  );
}
