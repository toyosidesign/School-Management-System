import { useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { detectImport, downloadText, parseCsv, toCsv } from '../lib/csv';
import Icon from './Icon';
import { Badge, Modal } from './ui';

const COLUMNS = [
  'first_name', 'last_name', 'email', 'phone', 'role', 'title', 'department',
  'qualifications', 'staff_code', 'is_senco',
];

const EXAMPLE = [
  ['Ada', 'Okonkwo', 'a.okonkwo@school.example', '+1 555 0110', 'teacher', 'Physics Teacher',
   'Secondary', 'BSc Physics, PGCE', '', ''],
  ['Femi', 'Cole', 'f.cole@school.example', '', 'teacher', 'Art Teacher', 'Primary', '', '', ''],
  ['Priya', 'Raman', 'p.raman@school.example', '', 'teacher', 'SENCO', 'Inclusion', 'National SENCO Award', '', 'yes'],
];

/**
 * Taking on a list of staff from a spreadsheet.
 *
 * Everyone arrives with a one-time link to set their own password, and those
 * links are shown once: the office downloads them, sends them out, and the
 * school never holds anybody's password.
 */
export default function StaffImport({ open, onClose, onDone }:
  { open: boolean; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [checked, setChecked] = useState<any>(null);
  const [links, setLinks] = useState<any[] | null>(null);
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => { setRows([]); setChecked(null); setLinks(null); setFilename(''); };
  const close = () => { reset(); onClose(); };

  const read = async (file: File) => {
    setBusy(true);
    try {
      const { headers, rows: parsed } = parseCsv(await file.text());

      // A file meant for another importer fails row by row with a message about
      // whatever it is missing, which never mentions the actual mistake.
      const meant = detectImport(headers);
      if (meant && meant.kind !== 'staff') {
        toast(`That looks like a ${meant.label} file. Import it from ${meant.where}.`, 'error');
        return;
      }

      if (!parsed.length) {
        toast('That file has a header but nobody in it.', 'error');
        return;
      }
      setFilename(file.name);
      setRows(parsed);
      setChecked(await api.post('/staff/import', { rows: parsed, dry_run: true }));
    } catch (e: any) {
      toast(e.message ?? 'That file could not be read', 'error');
    } finally {
      setBusy(false);
    }
  };

  const commit = async (allowPartial: boolean) => {
    setBusy(true);
    try {
      const out = await api.post('/staff/import', { rows, allow_partial: allowPartial });
      toast(`${out.summary.imported} added. Send them their links.`);
      setLinks(out.created);
      onDone();
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
      open={open} onClose={close}
      title={links ? 'Send everybody their sign-in link' : 'Take on a list of staff'} wide
      footer={
        links ? (
          <>
            <button
              className="btn-ghost"
              onClick={() => downloadText(
                'staff-sign-in-links.csv',
                toCsv(['name', 'email', 'role', 'staff_code', 'sign_in_link'],
                      links.map((l) => [l.name, l.email, l.role, l.staff_code, l.activation_link]))
              )}
            >
              <Icon name="download" className="h-4 w-4" /> Download the links
            </button>
            <button className="btn-primary" onClick={close}>Done</button>
          </>
        ) : (
          <>
            <button className="btn-ghost" onClick={close}>Cancel</button>
            {summary?.errors > 0 && summary.ready > 0 && (
              <button className="btn-ghost" disabled={busy} onClick={() => commit(true)}>
                Add the {summary.ready} that are ready
              </button>
            )}
            {summary && (
              <button className="btn-primary" disabled={busy || !summary.ready || summary.errors > 0}
                      onClick={() => commit(false)}>
                {busy ? 'Adding...' : `Add ${summary.ready} ${summary.ready === 1 ? 'person' : 'people'}`}
              </button>
            )}
          </>
        )
      }
    >
      {links ? (
        <div className="space-y-4">
          <p className="rounded-xl panel-amber px-3 py-2.5 text-sm text-ink">
            <Icon name="warning" className="mr-1.5 inline h-4 w-4 text-amber-600" />
            These links are shown once and are not kept. Download them before closing this window; anyone who
            loses theirs can be sent a new one from the Invitations page.
          </p>
          <div className="max-h-72 overflow-auto rounded-xl border border-line">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="sticky top-0 bg-[color:var(--surface-sunken)]">
                <tr className="text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {links.map((l) => (
                  <tr key={l.user_id}>
                    <td className="px-3 py-2">
                      <span className="block text-ink">{l.name}</span>
                      <span className="block text-xs text-ink-faint">{l.staff_code} · {l.role}</span>
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{l.email}</td>
                    <td className="px-3 py-2">
                      <input className="input !py-1 font-mono text-[11px]" readOnly value={l.activation_link}
                             onFocus={(e) => e.currentTarget.select()} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !checked ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Upload a spreadsheet saved as CSV. <b className="text-ink">first_name</b>,{' '}
            <b className="text-ink">last_name</b> and <b className="text-ink">email</b> are required; the email is
            how each person is invited to set their own password. <b className="text-ink">role</b> is teacher or
            admin, and <b className="text-ink">is_senco</b> takes yes to grant the SEN register.
          </p>

          <button
            className="btn-ghost"
            onClick={() => downloadText('staff-import-template.csv', toCsv(COLUMNS, EXAMPLE))}
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
            {summary.teachers > 0 && <Badge tone="brand">{summary.teachers} teachers</Badge>}
            {summary.administrators > 0 && <Badge tone="violet">{summary.administrators} administrators</Badge>}
          </div>

          {problems.length > 0 && (
            <div className="rounded-xl panel-red p-3">
              <p className="text-sm font-bold text-ink">Rows that cannot be added</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {problems.slice(0, 12).map((row: any) => (
                  <li key={row.line} className="text-ink">
                    <b>Row {row.line}</b>
                    {row.first_name && <> · {row.first_name} {row.last_name}</>}
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
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {checked.rows.map((row: any) => (
                  <tr key={row.line} className={row.status === 'error' ? 'bg-red-50/60' : ''}>
                    <td className="px-3 py-2 text-xs text-ink-faint">{row.line}</td>
                    <td className="px-3 py-2">
                      <span className="block text-ink">{row.first_name} {row.last_name}</span>
                      <span className="block text-xs text-ink-faint">{row.title || 'No job title'}</span>
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{row.email || '—'}</td>
                    <td className="px-3 py-2">
                      <Badge tone={row.role === 'admin' ? 'violet' : 'brand'}>{row.role}</Badge>
                      {row.is_senco && <Badge tone="green">SENCO</Badge>}
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
