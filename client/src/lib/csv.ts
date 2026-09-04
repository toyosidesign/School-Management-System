/**
 * A small CSV reader for spreadsheet exports.
 *
 * Written by hand rather than pulled in as a dependency: what a school's office
 * exports from Excel or Sheets is comma-separated, quoted where a field
 * contains a comma, and that is the whole of what this needs to survive.
 */
export type CsvRow = Record<string, string>;

/** Splits on commas outside quotes, handling "" as an escaped quote. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/** Header names are matched loosely: "First Name", "first_name" and "firstname" all land together. */
const normalise = (header: string) =>
  header.toLowerCase().replace(/^﻿/, '').trim().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');

export function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  // A quoted field may itself contain a newline, so the file is walked once
  // rather than split on newlines first.
  const lines: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"') { quoted = !quoted; current += c; continue; }
    if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      lines.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) lines.push(current);

  const meaningful = lines.filter((l) => l.trim().length > 0);
  if (!meaningful.length) return { headers: [], rows: [] };

  const headers = splitLine(meaningful[0]).map(normalise);
  const rows = meaningful.slice(1).map((line) => {
    const cells = splitLine(line);
    const row: CsvRow = {};
    headers.forEach((h, i) => { if (h) row[h] = cells[i] ?? ''; });
    return row;
  });

  return { headers, rows };
}

/** Builds a file the office can open, fill in and send back. */
export function toCsv(headers: string[], rows: string[][] = []): string {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\n');
}

/** Hands a generated file to the browser. */
export function downloadText(filename: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Which importer a file is meant for, judged by the columns it carries.
 *
 * Four importers take a CSV and three of them accept a name, so a file put in
 * the wrong one fails row by row with a message about names when the real
 * problem is that it is the wrong file. Naming the right destination is the
 * only useful thing to say at that point.
 */
export type ImportKind = 'students' | 'staff' | 'classes' | 'support' | 'timetable';

const SIGNATURES: { kind: ImportKind; label: string; where: string; columns: string[] }[] = [
  { kind: 'support', label: 'support plans', where: 'the SEN register',
    columns: ['needs', 'extra_time', 'multi_format', 'scribe', 'rest_breaks'] },
  { kind: 'staff', label: 'staff', where: 'the Staff page',
    columns: ['role', 'title', 'department', 'staff_code', 'is_senco', 'qualifications'] },
  { kind: 'students', label: 'pupils', where: 'the Students page',
    columns: ['guardian_name', 'guardian_email', 'guardian_phone', 'medical_notes', 'student_code'] },
  { kind: 'classes', label: 'classes', where: 'the Classes page',
    columns: ['section', 'homeroom_teacher_email', 'subjects'] },
  { kind: 'timetable', label: 'timetable', where: 'the Timetable page',
    columns: ['day', 'period', 'start_time', 'end_time', 'teacher_email'] },
];

export function detectImport(headers: string[]): { kind: ImportKind; label: string; where: string } | null {
  const present = new Set(headers);

  // An enrolment file may carry the support columns too, so a name column
  // settles it: nothing but a pupil list names the person being enrolled.
  if (present.has('first_name') && present.has('last_name')) {
    return present.has('role') || present.has('staff_code')
      ? { kind: 'staff', label: 'staff', where: 'the Staff page' }
      : { kind: 'students', label: 'pupils', where: 'the Students page' };
  }

  const scored = SIGNATURES
    .map((sig) => ({ ...sig, hits: sig.columns.filter((c) => present.has(c)).length }))
    .filter((sig) => sig.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  const best = scored[0];
  if (!best) return null;
  // A tie says nothing: two importers share the column, so let the file through.
  if (scored[1] && scored[1].hits === best.hits) return null;
  return { kind: best.kind, label: best.label, where: best.where };
}
