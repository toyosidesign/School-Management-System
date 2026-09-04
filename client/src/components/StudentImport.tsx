import { useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { detectImport, downloadText, parseCsv, toCsv } from '../lib/csv';
import Icon from './Icon';
import { Badge, Modal } from './ui';

const COLUMNS = [
  'first_name', 'last_name', 'email', 'class', 'classroom', 'student_code', 'date_of_birth', 'gender',
  'address', 'medical_notes', 'emergency_contact_name', 'emergency_contact_phone',
  'guardian_name', 'guardian_email', 'guardian_phone', 'guardian_relationship',
  'needs', 'extra_time', 'multi_format', 'scribe', 'rest_breaks', 'review_date', 'support_notes',
];

const EXAMPLE = [
  ['Ada', 'Bello', '', 'Grade 4', 'A', '', '2016-03-14', 'female', '12 Harbour Road', '',
   'Ngozi Bello', '+1 555 0134', 'Ngozi Bello', 'n.bello@family.example', '+1 555 0134', 'Mother',
   'dyslexia', '1.25', 'yes', 'no', 'no', '2027-04-13', 'Coloured overlay. Instructions in writing too.'],
  ['Tom', 'Fisher', '', 'Grade 4', 'B', '', '2016-08-02', 'male', '', 'Peanut allergy',
   'Ruth Fisher', '+1 555 0187', 'Ruth Fisher', 'r.fisher@family.example', '+1 555 0187', 'Mother',
   '', '', 'no', 'no', 'no', '', 'Needs the task repeated once after the class instruction.'],
];

/**
 * Enrolling a list of pupils from a spreadsheet.
 *
 * The file is checked against the school before anything is written, and the
 * result of that check is what the administrator approves: the same pass runs
 * for the preview and the import, so the two cannot disagree.
 */
export default function StudentImport({ open, onClose, onDone }:
  { open: boolean; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [checked, setChecked] = useState<any>(null);
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => { setRows([]); setChecked(null); setFilename(''); };

  const read = async (file: File) => {
    setBusy(true);
    try {
      const { headers, rows: parsed } = parseCsv(await file.text());

      // A file meant for another importer fails row by row with a message about
      // whatever it is missing, which never mentions the actual mistake.
      const meant = detectImport(headers);
      if (meant && meant.kind !== 'students') {
        toast(`That looks like a ${meant.label} file. Import it from ${meant.where}.`, 'error');
        return;
      }

      if (!parsed.length) {
        toast('That file has a header but no pupils in it.', 'error');
        return;
      }
      setFilename(file.name);
      setRows(parsed);
      setChecked(await api.post('/students/import', { rows: parsed, dry_run: true }));
    } catch (e: any) {
      toast(e.message ?? 'That file could not be read', 'error');
    } finally {
      setBusy(false);
    }
  };

  const commit = async (allowPartial: boolean) => {
    setBusy(true);
    try {
      const out = await api.post('/students/import', { rows, allow_partial: allowPartial });
      toast(`${out.summary.imported} pupil${out.summary.imported === 1 ? '' : 's'} enrolled.`);
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
      open={open} onClose={() => { reset(); onClose(); }} title="Enrol a list of pupils" wide
      footer={
        <>
          <button className="btn-ghost" onClick={() => { reset(); onClose(); }}>Cancel</button>
          {summary?.errors > 0 && summary.ready > 0 && (
            <button className="btn-ghost" disabled={busy} onClick={() => commit(true)}>
              Import the {summary.ready} that are ready
            </button>
          )}
          {summary && (
            <button className="btn-primary" disabled={busy || !summary.ready || summary.errors > 0}
                    onClick={() => commit(false)}>
              {busy ? 'Enrolling...' : `Enrol ${summary.ready} pupil${summary.ready === 1 ? '' : 's'}`}
            </button>
          )}
        </>
      }
    >
      {!checked ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Upload a spreadsheet saved as CSV. Only <b className="text-ink">first_name</b> and{' '}
            <b className="text-ink">last_name</b> are required. A <b className="text-ink">class</b> has to match one
            you have already created, with <b className="text-ink">classroom</b> beside it where a year has more
            than one. A guardian with an email gets an account linked to the child. Support can come in the
            same file: <b className="text-ink">support_notes</b> alone stays classroom support, while{' '}
            <b className="text-ink">needs</b> or an entitlement (<b className="text-ink">extra_time</b>,{' '}
            <b className="text-ink">multi_format</b>, <b className="text-ink">scribe</b>,{' '}
            <b className="text-ink">rest_breaks</b>) puts the pupil on the SEN register.
          </p>

          <button
            className="btn-ghost"
            onClick={() => downloadText('pupil-import-template.csv', toCsv(COLUMNS, EXAMPLE))}
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
            {summary.new_guardians > 0 && <Badge tone="brand">{summary.new_guardians} new guardians</Badge>}
            {summary.linked_guardians > 0 && (
              <Badge tone="violet">{summary.linked_guardians} linked to existing guardians</Badge>
            )}
            {summary.with_support > 0 && <Badge tone="slate">{summary.with_support} with support recorded</Badge>}
            {summary.joining_register > 0 && (
              <Badge tone="violet" icon="accessibility">{summary.joining_register} joining the SEN register</Badge>
            )}
          </div>

          {problems.length > 0 && (
            <div className="rounded-xl panel-red p-3">
              <p className="text-sm font-bold text-ink">Rows that cannot be enrolled</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {problems.slice(0, 12).map((row: any) => (
                  <li key={row.line} className="text-ink">
                    <b>Row {row.line}</b>
                    {row.first_name && <> · {row.first_name} {row.last_name}</>}
                    <span className="block text-xs text-red-800">{row.errors.join(' · ')}</span>
                  </li>
                ))}
                {problems.length > 12 && (
                  <li className="text-xs text-ink-soft">and {problems.length - 12} more</li>
                )}
              </ul>
            </div>
          )}

          <div className="max-h-72 overflow-auto rounded-xl border border-line">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="sticky top-0 bg-[color:var(--surface-sunken)]">
                <tr className="text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th className="px-3 py-2 font-semibold">Row</th>
                  <th className="px-3 py-2 font-semibold">Pupil</th>
                  <th className="px-3 py-2 font-semibold">Class</th>
                  <th className="px-3 py-2 font-semibold">Guardian</th>
                  <th className="px-3 py-2 font-semibold">Support</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {checked.rows.map((row: any) => (
                  <tr key={row.line} className={row.status === 'error' ? 'bg-red-50/60' : ''}>
                    <td className="px-3 py-2 text-xs text-ink-faint">{row.line}</td>
                    <td className="px-3 py-2">
                      <span className="block text-ink">{row.first_name} {row.last_name}</span>
                      {row.warnings.length > 0 && (
                        <span className="block text-xs text-amber-700">{row.warnings.join(' · ')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{row.class_label ?? row.class_name ?? '—'}</td>
                    <td className="px-3 py-2 text-ink-soft">
                      {row.guardian.existing ?? row.guardian.name ?? '—'}
                      {row.guardian.is_new && <Badge tone="brand">new</Badge>}
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-soft">
                      {!row.support?.has_support ? '—'
                        : row.support.is_sen
                          ? [row.support.needs.join(', '),
                             row.support.time_multiplier > 1 && `x${row.support.time_multiplier}`]
                              .filter(Boolean).join(' · ') || 'SEN plan'
                          : 'Notes'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {summary.new_guardians > 0 && (
            <p className="text-xs text-ink-faint">
              <Icon name="info" className="mr-1.5 inline h-3.5 w-3.5" />
              New guardians are created without a password. Send them an invitation from the Invitations page when
              you are ready for them to sign in.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
