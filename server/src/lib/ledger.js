import { db } from '../db/index.js';

/**
 * Double-entry posting.
 *
 * Every rule a bursar would expect is enforced here rather than trusted to the
 * caller: entries must balance, they must fall in an open financial year, and a
 * posted entry is never edited. A mistake is corrected by reversing it, so the
 * books show both what was recorded and what it was changed to, which is the
 * only version an auditor will accept.
 */

/** Money is rounded to the minor unit before it is compared or stored. */
export const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Debits raise an asset or expense; credits raise everything else. */
const DEBIT_POSITIVE = new Set(['asset', 'expense']);

export function accountByRole(role) {
  return db.prepare('SELECT * FROM accounts WHERE role = ? AND is_active = 1').get(role) ?? null;
}

export function yearFor(date) {
  return db.prepare(
    'SELECT * FROM financial_years WHERE date(?) BETWEEN date(starts_on) AND date(ends_on)'
  ).get(date) ?? null;
}

/** Sequential, per year, and readable on a printed voucher: JV-2026-0007. */
function nextReference(prefix, date) {
  const year = String(date).slice(0, 4);
  const like = `${prefix}-${year}-%`;
  const last = db.prepare(
    'SELECT reference FROM journals WHERE reference LIKE ? ORDER BY reference DESC LIMIT 1'
  ).get(like);
  const n = last ? Number(last.reference.split('-').pop()) + 1 : 1;
  return `${prefix}-${year}-${String(n).padStart(4, '0')}`;
}

export function nextExpenseReference(date) {
  const year = String(date).slice(0, 4);
  const last = db.prepare(
    "SELECT reference FROM expenses WHERE reference LIKE ? ORDER BY reference DESC LIMIT 1"
  ).get(`EXP-${year}-%`);
  const n = last ? Number(last.reference.split('-').pop()) + 1 : 1;
  return `EXP-${year}-${String(n).padStart(4, '0')}`;
}

export class LedgerError extends Error {
  constructor(message, detail) {
    super(message);
    this.detail = detail;
  }
}

/**
 * Writes a balanced entry and posts it in one transaction.
 *
 * `lines` are `{ account_id | account_role, debit, credit, memo, student_id,
 * supplier_id }`. Nothing half-written survives a failure: an unbalanced or
 * out-of-year entry throws before anything is inserted.
 */
export function postJournal({ date, memo, source = 'manual', sourceId = null, lines, user, status = 'posted' }) {
  const entryDate = String(date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);

  const resolved = (lines ?? []).map((line, i) => {
    const account = line.account_role
      ? accountByRole(line.account_role)
      : db.prepare('SELECT * FROM accounts WHERE id = ?').get(line.account_id);
    if (!account) {
      throw new LedgerError(
        line.account_role
          ? `No account is set up for ${line.account_role.replace(/_/g, ' ')}`
          : `Line ${i + 1} has no account`
      );
    }
    if (!account.is_active) throw new LedgerError(`${account.name} is closed and cannot be posted to`);

    const debit = money(line.debit ?? 0);
    const credit = money(line.credit ?? 0);
    if (debit < 0 || credit < 0) throw new LedgerError(`Line ${i + 1} cannot be negative`);
    if ((debit > 0) === (credit > 0)) {
      throw new LedgerError(`Line ${i + 1} must be either a debit or a credit, not both or neither`);
    }
    return { ...line, account_id: account.id, debit, credit };
  });

  if (resolved.length < 2) throw new LedgerError('An entry needs at least two lines');

  const debits = money(resolved.reduce((sum, l) => sum + l.debit, 0));
  const credits = money(resolved.reduce((sum, l) => sum + l.credit, 0));
  if (debits !== credits) {
    throw new LedgerError('The entry does not balance', { debits, credits, difference: money(debits - credits) });
  }
  if (debits === 0) throw new LedgerError('An entry cannot be for nothing');

  const year = yearFor(entryDate);
  if (year?.is_closed) throw new LedgerError(`${year.name} is closed. Post this to an open year.`);

  return db.transaction(() => {
    const journal = db.prepare(
      `INSERT INTO journals (reference, entry_date, memo, source, source_id, year_id, status, posted_by, posted_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      nextReference(source === 'manual' ? 'JV' : 'AUTO', entryDate),
      entryDate, memo ?? null, source, sourceId, year?.id ?? null, status,
      status === 'posted' ? user?.id ?? null : null,
      status === 'posted' ? new Date().toISOString() : null,
      user?.id ?? null
    );

    const addLine = db.prepare(
      `INSERT INTO journal_lines (journal_id, account_id, debit, credit, memo, student_id, supplier_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const line of resolved) {
      addLine.run(journal.lastInsertRowid, line.account_id, line.debit, line.credit,
                  line.memo ?? null, line.student_id ?? null, line.supplier_id ?? null);
    }
    return journal.lastInsertRowid;
  })();
}

/**
 * Corrects a posted entry by posting its mirror image, dated today.
 *
 * Both entries stay in the ledger. That matters: striking the original out
 * while keeping the correction would leave the account short by the amount of
 * the mistake, and an account statement that cannot be added up is worse than
 * one that shows a correction.
 */
export function reverseJournal(journalId, { user, reason }) {
  const original = db.prepare('SELECT * FROM journals WHERE id = ?').get(journalId);
  if (!original) throw new LedgerError('Entry not found');
  if (original.status !== 'posted') throw new LedgerError('Only a posted entry can be reversed');
  if (original.reversed_by) throw new LedgerError('That entry has already been reversed');

  const lines = db.prepare('SELECT * FROM journal_lines WHERE journal_id = ?').all(journalId);
  const today = new Date().toISOString().slice(0, 10);

  const reversalId = postJournal({
    date: today,
    memo: `Reversal of ${original.reference}${reason ? `: ${reason}` : ''}`,
    source: 'reversal',
    sourceId: original.id,
    user,
    lines: lines.map((l) => ({
      account_id: l.account_id, debit: l.credit, credit: l.debit,
      memo: l.memo, student_id: l.student_id, supplier_id: l.supplier_id,
    })),
  });

  db.prepare('UPDATE journals SET void_reason = ?, reversed_by = ? WHERE id = ?')
    .run(reason ?? null, reversalId, original.id);
  db.prepare('UPDATE journals SET reverses_id = ? WHERE id = ?').run(original.id, reversalId);
  return reversalId;
}

export function journalWithLines(id) {
  const journal = db.prepare(
    `SELECT j.*, u.first_name || ' ' || u.last_name AS posted_by_name, fy.name AS year,
            (SELECT reference FROM journals r WHERE r.id = j.reversed_by) AS reversed_by_reference,
            (SELECT reference FROM journals o WHERE o.id = j.reverses_id) AS reverses_reference
     FROM journals j LEFT JOIN users u ON u.id = j.posted_by
     LEFT JOIN financial_years fy ON fy.id = j.year_id WHERE j.id = ?`
  ).get(id);
  if (!journal) return null;

  journal.lines = db.prepare(
    `SELECT jl.*, a.code, a.name AS account, a.type,
            su.first_name || ' ' || su.last_name AS student_name, sup.name AS supplier_name
     FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id
     LEFT JOIN students st ON st.id = jl.student_id
     LEFT JOIN users su ON su.id = st.user_id
     LEFT JOIN suppliers sup ON sup.id = jl.supplier_id
     WHERE jl.journal_id = ? ORDER BY jl.debit DESC, jl.id`
  ).all(id);

  journal.total = money(journal.lines.reduce((sum, l) => sum + l.debit, 0));
  return journal;
}

/**
 * Balance of every account over a window, signed the way the account reads:
 * a bank account with money in it is positive, and so is income earned.
 */
export function balances({ from, to } = {}) {
  const where = ["j.status = 'posted'"];
  const args = [];
  if (from) { where.push('date(j.entry_date) >= date(?)'); args.push(from); }
  if (to) { where.push('date(j.entry_date) <= date(?)'); args.push(to); }

  const rows = db.prepare(
    `SELECT a.id, a.code, a.name, a.type, a.role, a.parent_id,
            COALESCE(SUM(jl.debit), 0) AS debits, COALESCE(SUM(jl.credit), 0) AS credits
     FROM accounts a
     LEFT JOIN journal_lines jl ON jl.account_id = a.id
     LEFT JOIN journals j ON j.id = jl.journal_id AND ${where.join(' AND ')}
     GROUP BY a.id ORDER BY a.code`
  ).all(...args);

  return rows.map((r) => {
    const debits = money(r.debits);
    const credits = money(r.credits);
    return {
      ...r, debits, credits,
      balance: money(DEBIT_POSITIVE.has(r.type) ? debits - credits : credits - debits),
    };
  });
}
