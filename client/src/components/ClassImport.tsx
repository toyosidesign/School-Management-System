import { useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { detectImport, downloadText, parseCsv, toCsv } from '../lib/csv';
import Icon from './Icon';
import { Badge, Modal } from './ui';

const COLUMNS = ['section', 'classroom', 'name', 'homeroom_teacher_email', 'subjects'];

const EXAMPLE = [
  ['Grade 4', 'A', '', 'g.adeyemi@school.example', 'Mathematics; English Language'],
  ['Grade 4', 'B', '', '', 'Mathematics; English Language'],
  ['Grade 5', 'A', '', '', ''],
];

/**
 * Laying out a school's classes from a spreadsheet.
 *
 * Sections are not invented from a file: a class joins a part of the school
 * that already exists, so an unknown section is an error rather than a new
 * one appearing quietly. Subjects are matched by name and attached where they
 * are found, and anything unrecognised is reported instead.
 */
export default function ClassImport({ open, onClose, onDone }:
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
      if (meant && meant.kind !== 'classes') {
        toast(`That looks like a ${meant.label} file. Import it from ${meant.where}.`, 'error');
        return;
      }

      if (!parsed.length) {
        toast('That file has a header but no classes in it.', 'error');
        return;
      }
      setFilename(file.name);
      setRows(parsed);
      setChecked(await api.post('/classes/import', { rows: parsed, dry_run: true }));
    } catch (e: any) {
      toast(e.message ?? 'That file could not be read', 'error');
    } finally {
      setBusy(false);
    }
  };

  const commit = async (allowPartial: boolean) => {
    setBusy(true);
    try {
      const out = await api.post('/classes/import', { rows, allow_partial: allowPartial });
      toast(`${out.summary.imported} class${out.summary.imported === 1 ? '' : 'es'} created.`);
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
      open={open} onClose={close} title="Import classes" wide
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
              {busy ? 'Creating...' : `Create ${summary.ready} class${summary.ready === 1 ? '' : 'es'}`}
            </button>
          )}
        </>
      }
    >
      {!checked ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Upload a spreadsheet saved as CSV. <b className="text-ink">section</b> must match one your school
            already has, and <b className="text-ink">classroom</b> names the class within it. A homeroom teacher
            is matched by email, and <b className="text-ink">subjects</b> takes a list separated by semicolons.
          </p>

          <button
            className="btn-ghost"
            onClick={() => downloadText('class-import-template.csv', toCsv(COLUMNS, EXAMPLE))}
          >
            <Icon name="download" className="h-4 w-4" /> Download the template
          </button>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-line p-6 hover:border-brand-400">
            <Icon name="upload" className="h-6 w-6 shrink-0 text-ink-faint" />
            <span>
              <span className="block text-sm font-semibold text-ink">
                {busy ? 'Reading the file...' : 'Choose a CSV file'}
              </span>
              <span className="block text-xs text-ink-faint">Nothing is created until you have seen what it will do</span>
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
            {summary.sections > 0 && <Badge tone="brand">across {summary.sections} section{summary.sections === 1 ? '' : 's'}</Badge>}
            {summary.with_teacher > 0 && <Badge tone="violet">{summary.with_teacher} with a homeroom teacher</Badge>}
            {summary.subject_links > 0 && <Badge tone="slate">{summary.subject_links} subject links</Badge>}
          </div>

          {problems.length > 0 && (
            <div className="rounded-xl panel-red p-3">
              <p className="text-sm font-bold text-ink">Rows that cannot be created</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {problems.slice(0, 12).map((row: any) => (
                  <li key={row.line} className="text-ink">
                    <b>Row {row.line}</b>
                    {row.section_name && <> · {row.section_name} {row.room}</>}
                    <span className="block text-xs text-red-800">{row.errors.join(' · ')}</span>
                  </li>
                ))}
                {problems.length > 12 && <li className="text-xs text-ink-soft">and {problems.length - 12} more</li>}
              </ul>
            </div>
          )}

          <div className="max-h-72 overflow-auto rounded-xl border border-line">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="sticky top-0 bg-[color:var(--surface-sunken)]">
                <tr className="text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th className="px-3 py-2 font-semibold">Row</th>
                  <th className="px-3 py-2 font-semibold">Class</th>
                  <th className="px-3 py-2 font-semibold">Section</th>
                  <th className="px-3 py-2 font-semibold">Homeroom</th>
                  <th className="px-3 py-2 font-semibold">Subjects</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {checked.rows.map((row: any) => (
                  <tr key={row.line} className={row.status === 'error' ? 'bg-red-50/60' : ''}>
                    <td className="px-3 py-2 text-xs text-ink-faint">{row.line}</td>
                    <td className="px-3 py-2">
                      <span className="block text-ink">{row.name || '—'}</span>
                      {row.room && <span className="block text-xs text-ink-faint">Classroom {row.room}</span>}
                      {row.warnings.length > 0 && (
                        <span className="block text-xs text-amber-700">{row.warnings.join(' · ')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{row.section_label ?? row.section_name}</td>
                    <td className="px-3 py-2 text-ink-soft">{row.teacher_name ?? '—'}</td>
                    <td className="px-3 py-2 text-ink-soft">{row.subject_ids.length || '—'}</td>
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
