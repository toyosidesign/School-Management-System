import { useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { detectImport, downloadText, parseCsv, toCsv } from '../lib/csv';
import Icon from './Icon';
import { Badge, Modal } from './ui';

const COLUMNS = [
  'student_code', 'email', 'needs', 'extra_time', 'multi_format', 'scribe', 'rest_breaks',
  'review_date', 'notes',
];

const EXAMPLE = [
  ['STU-1002', '', 'dyslexia', '1.25', 'yes', 'no', 'no', '2027-01-15', 'Prefers instructions written down.'],
  ['STU-3004', '', 'adhd; asc', '50%', 'yes', 'no', 'yes', '2027-03-01', 'Sits near the front. Rest break each hour.'],
];

/**
 * Support plans arriving as a list, the way a SENCO keeps them.
 *
 * A plan decides what a pupil is entitled to in every timed piece of work, so
 * an import is checked pupil by pupil first and says plainly which existing
 * plans it would replace.
 */
export default function SupportImport({ open, onClose, onDone }:
  { open: boolean; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [checked, setChecked] = useState<any>(null);
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => { setRows([]); setChecked(null); setFilename(''); };
  const close = () => { reset(); onClose(); };

  const read = async (file: File) => {
    setBusy(true);
    try {
      const { headers, rows: parsed } = parseCsv(await file.text());

      // A file meant for another importer fails row by row with a message about
      // whatever it is missing, which never mentions the actual mistake.
      const meant = detectImport(headers);
      if (meant && meant.kind !== 'support') {
        toast(`That looks like a ${meant.label} file. Import it from ${meant.where}.`, 'error');
        return;
      }

      if (!parsed.length) {
        toast('That file has a header but no pupils in it.', 'error');
        return;
      }
      setFilename(file.name);
      setRows(parsed);
      setChecked(await api.post('/iep/import', { rows: parsed, dry_run: true }));
    } catch (e: any) {
      toast(e.message ?? 'That file could not be read', 'error');
    } finally {
      setBusy(false);
    }
  };

  const commit = async (allowPartial: boolean) => {
    setBusy(true);
    try {
      const out = await api.post('/iep/import', { rows, allow_partial: allowPartial });
      toast(`${out.summary.imported} support plan${out.summary.imported === 1 ? '' : 's'} saved.`);
      reset();
      onDone();
      onClose();
    } catch (e: any) {
      if (e.body?.rows) setChecked(e.body);
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const summary = checked?.summary;
  const problems = (checked?.rows ?? []).filter((r: any) => r.status === 'error');

  return (
    <Modal
      open={open} onClose={close} title="Import support plans" wide
      footer={
        <>
          <button className="btn-ghost" onClick={close}>Cancel</button>
          {summary?.errors > 0 && summary.ready > 0 && (
            <button className="btn-ghost" disabled={busy} onClick={() => commit(true)}>
              Import the {summary.ready} that are ready
            </button>
          )}
          {summary && (
            <button className="btn-primary" disabled={busy || !summary.ready || summary.errors > 0}
                    onClick={() => commit(false)}>
              {busy ? 'Saving...' : `Save ${summary.ready} plan${summary.ready === 1 ? '' : 's'}`}
            </button>
          )}
        </>
      }
    >
      {!checked ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Upload a spreadsheet saved as CSV. Each row is one pupil, matched by{' '}
            <b className="text-ink">student_code</b> or <b className="text-ink">email</b>. Support can be
            recorded for any pupil: a row with notes alone stays classroom support, and a row naming a
            need or granting an entitlement joins the SEN register.{' '}
            <b className="text-ink">needs</b> takes any of dyslexia, adhd, asc, dyscalculia, motor;{' '}
            <b className="text-ink">extra_time</b> reads 1.5, x1.5 or 50% alike; the rest take yes or no.
          </p>

          <button
            className="btn-ghost"
            onClick={() => downloadText('support-plan-template.csv', toCsv(COLUMNS, EXAMPLE))}
          >
            <Icon name="download" className="h-4 w-4" /> Download the template
          </button>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-line p-6 hover:border-brand-400">
            <Icon name="upload" className="h-6 w-6 shrink-0 text-ink-faint" />
            <span>
              <span className="block text-sm font-semibold text-ink">
                {busy ? 'Reading the file...' : 'Choose a CSV file'}
              </span>
              <span className="block text-xs text-ink-faint">Nothing is saved until you have seen what it will do</span>
            </span>
            <input type="file" className="sr-only" accept=".csv,text/csv"
                   onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
          </label>

          <details className="rounded-xl border border-line p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Columns it understands</summary>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {COLUMNS.map((c) => <li key={c}><Badge tone="slate">{c}</Badge></li>)}
            </ul>
          </details>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink">
              <b>{filename}</b> · {summary.total} row{summary.total === 1 ? '' : 's'}
            </p>
            <button className="btn-ghost btn-sm" onClick={reset}>Choose another file</button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge tone={summary.ready ? 'green' : 'slate'} icon="check">{summary.ready} ready</Badge>
            {summary.errors > 0 && <Badge tone="red" icon="warning">{summary.errors} to fix</Badge>}
            {summary.replacing > 0 && <Badge tone="amber">{summary.replacing} replacing an existing plan</Badge>}
            {summary.sen > 0 && <Badge tone="violet" icon="accessibility">{summary.sen} joining the SEN register</Badge>}
            {summary.notes_only > 0 && <Badge tone="slate">{summary.notes_only} classroom notes only</Badge>}
            {summary.with_extra_time > 0 && <Badge tone="violet">{summary.with_extra_time} with extra time</Badge>}
          </div>

          {problems.length > 0 && (
            <div className="rounded-xl panel-red p-3">
              <p className="text-sm font-bold text-ink">Rows that cannot be saved</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {problems.slice(0, 12).map((row: any) => (
                  <li key={row.line} className="text-ink">
                    <b>Row {row.line}</b>
                    {(row.name || row.student_code) && <> · {row.name ?? row.student_code}</>}
                    <span className="block text-xs text-red-800">{row.errors.join(' · ')}</span>
                  </li>
                ))}
                {problems.length > 12 && <li className="text-xs text-ink-soft">and {problems.length - 12} more</li>}
              </ul>
            </div>
          )}

          <div className="max-h-72 overflow-auto rounded-xl border border-line">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="sticky top-0 bg-[color:var(--surface-sunken)]">
                <tr className="text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th className="px-3 py-2 font-semibold">Row</th>
                  <th className="px-3 py-2 font-semibold">Pupil</th>
                  <th className="px-3 py-2 font-semibold">Needs</th>
                  <th className="px-3 py-2 font-semibold">Extra time</th>
                  <th className="px-3 py-2 font-semibold">Also</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {checked.rows.map((row: any) => (
                  <tr key={row.line} className={row.status === 'error' ? 'bg-red-50/60' : ''}>
                    <td className="px-3 py-2 text-xs text-ink-faint">{row.line}</td>
                    <td className="px-3 py-2">
                      <span className="block text-ink">{row.name ?? row.student_code ?? row.email}</span>
                      {row.warnings.length > 0 && (
                        <span className="block text-xs text-amber-700">{row.warnings.join(' · ')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{row.needs.join(', ') || '—'}</td>
                    <td className="px-3 py-2 tabular-nums text-ink-soft">
                      {row.time_multiplier > 1 ? `x${row.time_multiplier}` : 'Standard'}
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-soft">
                      {[row.multi_format && 'multi-format', row.scribe_allowed && 'scribe', row.rest_breaks && 'rest breaks']
                        .filter(Boolean).join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
