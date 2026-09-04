import { useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { detectImport, downloadText, parseCsv, toCsv } from '../lib/csv';
import { DAY_NAMES } from '../lib/format';
import Icon from './Icon';
import { Badge, Modal } from './ui';

const COLUMNS = ['class', 'classroom', 'subject', 'break', 'day', 'period',
                 'start_time', 'end_time', 'room', 'teacher_email'];

const EXAMPLE = [
  ['Grade 4', 'A', 'Mathematics', '', 'Mon', '1', '08:30', '09:15', '', 'g.adeyemi@school.example'],
  ['Grade 4', 'A', 'English', '', 'Mon', '2', '', '', '', ''],
  ['Grade 4', 'A', '', 'short', 'Mon', '3', '', '', '', ''],
  ['Grade 4', 'B', 'Mathematics', '', 'Tue', '1', '', '', 'Lab 2', ''],
];

/**
 * A week arriving as a spreadsheet.
 *
 * Timetables are built in a spreadsheet long before they are typed into
 * anything, so the file the school already has is the one that should load. It
 * is checked against the week as it stands *and* against itself before a single
 * lesson is written: a file that puts one teacher in two rooms is the mistake
 * worth catching, and it is invisible until the whole file is read at once.
 */
export default function TimetableImport({ open, onClose, onDone }:
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

      const meant = detectImport(headers);
      if (meant && meant.kind !== 'timetable') {
        toast(`That looks like a ${meant.label} file. Import it from ${meant.where}.`, 'error');
        return;
      }

      if (!parsed.length) {
        toast('That file has a header but no lessons in it.', 'error');
        return;
      }
      setFilename(file.name);
      setRows(parsed);
      setChecked(await api.post('/timetable/import', { rows: parsed, dry_run: true }));
    } catch (e: any) {
      toast(e.message ?? 'That file could not be read', 'error');
    } finally {
      setBusy(false);
    }
  };

  const commit = async (allowPartial: boolean) => {
    setBusy(true);
    try {
      const out = await api.post('/timetable/import', { rows, allow_partial: allowPartial });
      toast(`${out.summary.imported} lesson${out.summary.imported === 1 ? '' : 's'} timetabled.`);
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
      open={open} onClose={close} title="Import a timetable" wide
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
              {busy ? 'Timetabling...' : `Timetable ${summary.ready} lesson${summary.ready === 1 ? '' : 's'}`}
            </button>
          )}
        </>
      }
    >
      {!checked ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Upload a spreadsheet saved as CSV. One row is one lesson:{' '}
            <b className="text-ink">class</b> (with <b className="text-ink">classroom</b> where a year has more
            than one), <b className="text-ink">subject</b>, <b className="text-ink">day</b> and{' '}
            <b className="text-ink">period</b>. Times are worked out from the period unless you give them.
            Put <b className="text-ink">short</b> or <b className="text-ink">long</b> in the{' '}
            <b className="text-ink">break</b> column for a break instead of a lesson.
          </p>

          <button
            className="btn-ghost"
            onClick={() => downloadText('timetable-import-template.csv', toCsv(COLUMNS, EXAMPLE))}
          >
            <Icon name="download" className="h-4 w-4" /> Download the template
          </button>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-line p-6 hover:border-brand-400">
            <Icon name="upload" className="h-6 w-6 shrink-0 text-ink-faint" />
            <span>
              <span className="block text-sm font-semibold text-ink">
                {busy ? 'Reading the file...' : 'Choose a CSV file'}
              </span>
              <span className="block text-xs text-ink-faint">Nothing is timetabled until you have seen what it will do</span>
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
            {summary.classes > 0 && (
              <Badge tone="brand">across {summary.classes} class{summary.classes === 1 ? '' : 'es'}</Badge>
            )}
            {summary.breaks > 0 && <Badge tone="slate">{summary.breaks} breaks</Badge>}
            {summary.new_pairings > 0 && (
              <Badge tone="violet">{summary.new_pairings} subject{summary.new_pairings === 1 ? '' : 's'} joining a class</Badge>
            )}
          </div>

          {problems.length > 0 && (
            <div className="rounded-xl panel-red p-3">
              <p className="text-sm font-bold text-ink">Rows that cannot be timetabled</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {problems.slice(0, 12).map((row: any) => (
                  <li key={row.line} className="text-ink">
                    <b>Row {row.line}</b>
                    {row.class_name && <> · {row.class_name} {row.subject_name}</>}
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
                  <th className="px-3 py-2 font-semibold">Class</th>
                  <th className="px-3 py-2 font-semibold">Lesson</th>
                  <th className="px-3 py-2 font-semibold">When</th>
                  <th className="px-3 py-2 font-semibold">Teacher</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {checked.rows.map((row: any) => (
                  <tr key={row.line} className={row.status === 'error' ? 'bg-red-50/60' : ''}>
                    <td className="px-3 py-2 text-xs text-ink-faint">{row.line}</td>
                    <td className="px-3 py-2 text-ink-soft">{row.class_label ?? row.class_name ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className="block text-ink">{row.subject_name || '—'}</span>
                      {row.warnings.length > 0 && (
                        <span className="block text-xs text-amber-700">{row.warnings.join(' · ')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-soft">
                      {row.day_of_week ? `${DAY_NAMES[row.day_of_week]} · P${row.period}` : '—'}
                      <span className="block font-mono text-[10px] text-ink-faint">
                        {row.start_time}{row.end_time ? `-${row.end_time}` : ''}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{row.teacher_name ?? '—'}</td>
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
