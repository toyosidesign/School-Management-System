import { Router } from 'express';
import { db, audit } from '../db/index.js';
import { authenticate, requireRole, requireSuperAdmin } from '../lib/auth.js';
import { requirePermission } from '../lib/permissions.js';
import {
  LedgerError, accountByRole, balances, journalWithLines, money,
  nextExpenseReference, postJournal, reverseJournal, yearFor,
} from '../lib/ledger.js';
import { seedFinance } from '../db/chartOfAccounts.js';

const r = Router();
r.use(authenticate);
// The books are the school office's. Everything here is leadership only.
r.use(requirePermission('finance.manage'));

/** Ledger rules come back as refusals a bursar can read, not 500s. */
const guard = (res, work) => {
  try {
    return work();
  } catch (e) {
    if (e instanceof LedgerError) return res.status(400).json({ error: e.message, detail: e.detail });
    throw e;
  }
};

/* ── Chart of accounts ────────────────────────────────────────────────────── */
r.get('/accounts', (req, res) => {
  const withBalances = balances({ from: req.query.from, to: req.query.to });
  res.json(withBalances.filter((a) => req.query.all === '1' || a.is_active !== 0));
});

r.post('/accounts', (req, res) => {
  const b = req.body ?? {};
  if (!b.code || !b.name) return res.status(400).json({ error: 'A code and a name are required' });
  if (!['asset', 'liability', 'equity', 'income', 'expense'].includes(b.type)) {
    return res.status(400).json({ error: 'Pick what kind of account this is' });
  }
  if (db.prepare('SELECT 1 FROM accounts WHERE code = ?').get(b.code)) {
    return res.status(409).json({ error: `Account ${b.code} already exists` });
  }

  const out = db.prepare('INSERT INTO accounts (code, name, type, parent_id, description) VALUES (?, ?, ?, ?, ?)')
    .run(String(b.code).trim(), b.name.trim(), b.type, b.parent_id ?? null, b.description ?? null);
  audit({ user: req.user, action: 'create', entity: 'accounts', entityId: out.lastInsertRowid, next: b, ip: req.ip });
  res.status(201).json(db.prepare('SELECT * FROM accounts WHERE id = ?').get(out.lastInsertRowid));
});

r.patch('/accounts/:id', (req, res) => {
  const prev = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Account not found' });

  // Type is not editable: changing it would re-sign every entry already posted.
  const fields = ['code', 'name', 'parent_id', 'description', 'is_active'].filter((f) => f in (req.body ?? {}));
  if (fields.includes('is_active') && !req.body.is_active) {
    const used = db.prepare('SELECT COUNT(*) n FROM journal_lines WHERE account_id = ?').get(prev.id).n;
    if (used && prev.role) return res.status(409).json({ error: `${prev.name} is where the software posts ${prev.role.replace(/_/g, ' ')}. Point that role elsewhere first.` });
  }
  if (fields.length) {
    db.prepare(`UPDATE accounts SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`)
      .run(...fields.map((f) => req.body[f]), prev.id);
    audit({ user: req.user, action: 'update', entity: 'accounts', entityId: prev.id, prev, next: req.body, ip: req.ip });
  }
  res.json(db.prepare('SELECT * FROM accounts WHERE id = ?').get(prev.id));
});

/** Which account the software posts fees, payments and bills to. */
r.put('/accounts/:id/role', (req, res) => {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const role = req.body?.role || null;
  if (role && !['receivable', 'bank', 'cash', 'fee_income', 'payable'].includes(role)) {
    return res.status(400).json({ error: 'Unknown role' });
  }
  db.transaction(() => {
    if (role) db.prepare('UPDATE accounts SET role = NULL WHERE role = ?').run(role);
    db.prepare('UPDATE accounts SET role = ? WHERE id = ?').run(role, account.id);
  })();
  audit({ user: req.user, action: 'update', entity: 'accounts', entityId: account.id,
          prev: { role: account.role }, next: { role }, ip: req.ip });
  res.json(db.prepare('SELECT * FROM accounts WHERE id = ?').get(account.id));
});

/** Every posting to one account, with a running balance: the account statement. */
r.get('/accounts/:id/ledger', (req, res) => {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const rows = db.prepare(
    `SELECT j.id AS journal_id, j.reference, j.entry_date, j.memo, j.source,
            jl.debit, jl.credit, jl.memo AS line_memo,
            su.first_name || ' ' || su.last_name AS student_name, sup.name AS supplier_name
     FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
     LEFT JOIN students st ON st.id = jl.student_id
     LEFT JOIN users su ON su.id = st.user_id
     LEFT JOIN suppliers sup ON sup.id = jl.supplier_id
     WHERE jl.account_id = ? AND j.status = 'posted'
     ORDER BY date(j.entry_date), j.id`
  ).all(account.id);

  const sign = ['asset', 'expense'].includes(account.type) ? 1 : -1;
  let running = 0;
  const entries = rows.map((row) => {
    running = money(running + sign * (row.debit - row.credit));
    return { ...row, balance: running };
  });

  res.json({ account, entries, balance: running });
});

/* ── Journal entries ──────────────────────────────────────────────────────── */
r.get('/journals', (req, res) => {
  const where = ['1=1'];
  const args = [];
  if (req.query.status) { where.push('j.status = ?'); args.push(req.query.status); }
  if (req.query.from) { where.push('date(j.entry_date) >= date(?)'); args.push(req.query.from); }
  if (req.query.to) { where.push('date(j.entry_date) <= date(?)'); args.push(req.query.to); }

  res.json(db.prepare(
    `SELECT j.*, u.first_name || ' ' || u.last_name AS posted_by_name,
            (SELECT reference FROM journals r WHERE r.id = j.reversed_by) AS reversed_by_reference,
            (SELECT COALESCE(SUM(debit), 0) FROM journal_lines WHERE journal_id = j.id) AS total,
            (SELECT COUNT(*) FROM journal_lines WHERE journal_id = j.id) AS line_count
     FROM journals j LEFT JOIN users u ON u.id = j.posted_by
     WHERE ${where.join(' AND ')}
     ORDER BY date(j.entry_date) DESC, j.id DESC LIMIT ?`
  ).all(...args, Math.min(500, Number(req.query.limit) || 100)));
});

r.get('/journals/:id', (req, res) => {
  const journal = journalWithLines(req.params.id);
  if (!journal) return res.status(404).json({ error: 'Entry not found' });
  res.json(journal);
});

r.post('/journals', (req, res) => guard(res, () => {
  const b = req.body ?? {};
  const id = postJournal({
    date: b.entry_date, memo: b.memo, lines: b.lines, user: req.user,
    status: b.status === 'draft' ? 'draft' : 'posted',
  });
  audit({ user: req.user, action: 'create', entity: 'journals', entityId: id, next: b, ip: req.ip });
  res.status(201).json(journalWithLines(id));
}));

r.post('/journals/:id/post', (req, res) => guard(res, () => {
  const journal = db.prepare('SELECT * FROM journals WHERE id = ?').get(req.params.id);
  if (!journal) return res.status(404).json({ error: 'Entry not found' });
  if (journal.status !== 'draft') return res.status(409).json({ error: 'Only a draft can be posted' });

  const year = yearFor(journal.entry_date);
  if (year?.is_closed) return res.status(409).json({ error: `${year.name} is closed` });

  db.prepare("UPDATE journals SET status = 'posted', posted_by = ?, posted_at = datetime('now'), year_id = ? WHERE id = ?")
    .run(req.user.id, year?.id ?? null, journal.id);
  audit({ user: req.user, action: 'post', entity: 'journals', entityId: journal.id, ip: req.ip });
  res.json(journalWithLines(journal.id));
}));

r.post('/journals/:id/reverse', (req, res) => guard(res, () => {
  const id = reverseJournal(Number(req.params.id), { user: req.user, reason: req.body?.reason });
  audit({ user: req.user, action: 'reverse', entity: 'journals', entityId: req.params.id,
          next: { reversal_id: id, reason: req.body?.reason }, ip: req.ip });
  res.json({ ok: true, reversal: journalWithLines(id) });
}));

/* ── Suppliers ────────────────────────────────────────────────────────────── */
r.get('/suppliers', (_req, res) => {
  res.json(db.prepare(
    `SELECT s.*,
            (SELECT COUNT(*) FROM expenses e WHERE e.supplier_id = s.id) AS bill_count,
            (SELECT COALESCE(SUM(e.amount), 0) FROM expenses e WHERE e.supplier_id = s.id AND e.status = 'paid') AS paid_total
     FROM suppliers s ORDER BY s.is_active DESC, s.name`
  ).all());
});

r.post('/suppliers', (req, res) => {
  if (!req.body?.name) return res.status(400).json({ error: 'A name is required' });
  const b = req.body;
  const out = db.prepare(
    'INSERT INTO suppliers (name, contact, email, phone, address, tax_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(b.name.trim(), b.contact ?? null, b.email ?? null, b.phone ?? null, b.address ?? null, b.tax_id ?? null, b.notes ?? null);
  audit({ user: req.user, action: 'create', entity: 'suppliers', entityId: out.lastInsertRowid, next: b, ip: req.ip });
  res.status(201).json(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(out.lastInsertRowid));
});

r.patch('/suppliers/:id', (req, res) => {
  const prev = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Supplier not found' });
  const fields = ['name', 'contact', 'email', 'phone', 'address', 'tax_id', 'notes', 'is_active']
    .filter((f) => f in (req.body ?? {}));
  if (fields.length) {
    db.prepare(`UPDATE suppliers SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`)
      .run(...fields.map((f) => req.body[f]), prev.id);
    audit({ user: req.user, action: 'update', entity: 'suppliers', entityId: prev.id, prev, next: req.body, ip: req.ip });
  }
  res.json(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(prev.id));
});

/* ── Expenditure ──────────────────────────────────────────────────────────── */
r.get('/expenses', (req, res) => {
  const where = ['1=1'];
  const args = [];
  if (req.query.status) { where.push('e.status = ?'); args.push(req.query.status); }
  res.json(db.prepare(
    `SELECT e.*, s.name AS supplier, a.code AS account_code, a.name AS account,
            p.name AS paid_from, u.first_name || ' ' || u.last_name AS approved_by_name,
            j.reference AS journal_reference
     FROM expenses e
     LEFT JOIN suppliers s ON s.id = e.supplier_id
     JOIN accounts a ON a.id = e.account_id
     LEFT JOIN accounts p ON p.id = e.paid_from_id
     LEFT JOIN users u ON u.id = e.approved_by
     LEFT JOIN journals j ON j.id = e.journal_id
     WHERE ${where.join(' AND ')}
     ORDER BY date(e.spent_on) DESC, e.id DESC LIMIT 300`
  ).all(...args));
});

r.post('/expenses', (req, res) => {
  const b = req.body ?? {};
  const amount = money(b.amount);
  if (!(amount > 0)) return res.status(400).json({ error: 'An amount is required' });
  if (!b.description) return res.status(400).json({ error: 'Say what this was for' });

  const account = db.prepare("SELECT * FROM accounts WHERE id = ? AND type = 'expense'").get(b.account_id);
  if (!account) return res.status(400).json({ error: 'Choose the expense account this belongs to' });

  const spentOn = String(b.spent_on ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const out = db.prepare(
    `INSERT INTO expenses (reference, supplier_id, account_id, paid_from_id, description, amount, spent_on, note, receipt_url, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(nextExpenseReference(spentOn), b.supplier_id ?? null, account.id, b.paid_from_id ?? null,
        b.description.trim(), amount, spentOn, b.note ?? null, b.receipt_url ?? null, req.user.id);

  audit({ user: req.user, action: 'create', entity: 'expenses', entityId: out.lastInsertRowid, next: b, ip: req.ip });
  res.status(201).json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(out.lastInsertRowid));
});

r.post('/expenses/:id/decision', (req, res) => {
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found' });
  if (expense.status !== 'draft') return res.status(409).json({ error: 'That has already been decided' });

  const approved = req.body?.status !== 'rejected';
  db.prepare("UPDATE expenses SET status = ?, approved_by = ?, approved_at = datetime('now'), note = COALESCE(?, note) WHERE id = ?")
    .run(approved ? 'approved' : 'rejected', req.user.id, req.body?.note ?? null, expense.id);
  audit({ user: req.user, action: approved ? 'approve' : 'reject', entity: 'expenses', entityId: expense.id, ip: req.ip });
  res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(expense.id));
});

/** Paying an approved bill is what puts it in the books. */
r.post('/expenses/:id/pay', (req, res) => guard(res, () => {
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found' });
  if (expense.status !== 'approved') return res.status(409).json({ error: 'Approve it before paying it' });

  const from = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.body?.paid_from_id ?? expense.paid_from_id)
    ?? accountByRole('bank');
  if (!from) return res.status(400).json({ error: 'Choose the account it was paid from' });

  const supplier = expense.supplier_id
    ? db.prepare('SELECT name FROM suppliers WHERE id = ?').get(expense.supplier_id) : null;

  const journalId = postJournal({
    date: req.body?.paid_on ?? new Date().toISOString().slice(0, 10),
    memo: `${expense.reference}: ${expense.description}${supplier ? ` (${supplier.name})` : ''}`,
    source: 'expense', sourceId: expense.id, user: req.user,
    lines: [
      { account_id: expense.account_id, debit: expense.amount, supplier_id: expense.supplier_id },
      { account_id: from.id, credit: expense.amount, supplier_id: expense.supplier_id },
    ],
  });

  db.prepare("UPDATE expenses SET status = 'paid', paid_from_id = ?, journal_id = ? WHERE id = ?")
    .run(from.id, journalId, expense.id);
  audit({ user: req.user, action: 'pay', entity: 'expenses', entityId: expense.id,
          next: { journal_id: journalId, paid_from: from.name }, ip: req.ip });
  res.json({ ...db.prepare('SELECT * FROM expenses WHERE id = ?').get(expense.id), journal: journalWithLines(journalId) });
}));

/* ── Financial years ──────────────────────────────────────────────────────── */
r.get('/years', (_req, res) => {
  res.json(db.prepare(
    `SELECT fy.*, (SELECT COUNT(*) FROM journals j WHERE j.year_id = fy.id AND j.status = 'posted') AS entries
     FROM financial_years fy ORDER BY fy.starts_on DESC`
  ).all());
});

r.post('/years', (req, res) => {
  const b = req.body ?? {};
  if (!b.name || !b.starts_on || !b.ends_on) return res.status(400).json({ error: 'A name and both dates are required' });
  if (b.ends_on <= b.starts_on) return res.status(400).json({ error: 'The year has to end after it starts' });
  try {
    const out = db.prepare('INSERT INTO financial_years (name, starts_on, ends_on) VALUES (?, ?, ?)')
      .run(b.name, b.starts_on, b.ends_on);
    res.status(201).json(db.prepare('SELECT * FROM financial_years WHERE id = ?').get(out.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'That year already exists' });
    throw e;
  }
});

/**
 * Closing a year freezes it: nothing may be posted into it afterwards.
 *
 * The school's own decision, not the office's: a closed year is what the
 * accounts are answered on, so reopening one is a thing the person who holds
 * the school should have to do themselves.
 */
r.post('/years/:id/close', requireSuperAdmin, (req, res) => {
  const year = db.prepare('SELECT * FROM financial_years WHERE id = ?').get(req.params.id);
  if (!year) return res.status(404).json({ error: 'Year not found' });

  const open = req.body?.reopen === true;
  const drafts = db.prepare("SELECT COUNT(*) n FROM journals WHERE year_id = ? AND status = 'draft'").get(year.id).n;
  if (!open && drafts) {
    return res.status(409).json({ error: `${drafts} draft entr${drafts === 1 ? 'y is' : 'ies are'} still unposted in ${year.name}` });
  }

  db.prepare('UPDATE financial_years SET is_closed = ?, closed_by = ?, closed_at = ? WHERE id = ?')
    .run(open ? 0 : 1, open ? null : req.user.id, open ? null : new Date().toISOString(), year.id);
  audit({ user: req.user, action: open ? 'reopen' : 'close', entity: 'financial_years', entityId: year.id, ip: req.ip });
  res.json(db.prepare('SELECT * FROM financial_years WHERE id = ?').get(year.id));
});

/* ── Reports ──────────────────────────────────────────────────────────────── */
r.get('/reports/trial-balance', (req, res) => {
  const rows = balances({ from: req.query.from, to: req.query.to })
    .filter((a) => a.debits || a.credits);
  const totals = rows.reduce((acc, a) => ({
    debits: money(acc.debits + a.debits), credits: money(acc.credits + a.credits),
  }), { debits: 0, credits: 0 });

  // A trial balance that does not balance means the ledger has been reached
  // around, so it is reported rather than quietly summed.
  res.json({ rows, totals, balanced: totals.debits === totals.credits });
});

r.get('/reports/profit-loss', (req, res) => {
  const rows = balances({ from: req.query.from, to: req.query.to });
  const income = rows.filter((a) => a.type === 'income' && a.balance !== 0);
  const expense = rows.filter((a) => a.type === 'expense' && a.balance !== 0);
  const totalIncome = money(income.reduce((s, a) => s + a.balance, 0));
  const totalExpense = money(expense.reduce((s, a) => s + a.balance, 0));

  res.json({
    from: req.query.from ?? null, to: req.query.to ?? null,
    income, expense, total_income: totalIncome, total_expense: totalExpense,
    surplus: money(totalIncome - totalExpense),
  });
});

r.get('/reports/balance-sheet', (req, res) => {
  const asOf = req.query.to ?? new Date().toISOString().slice(0, 10);
  const rows = balances({ to: asOf });
  const pick = (type) => rows.filter((a) => a.type === type && a.balance !== 0);
  const sum = (list) => money(list.reduce((s, a) => s + a.balance, 0));

  const assets = pick('asset');
  const liabilities = pick('liability');
  const equity = pick('equity');
  // Undistributed surplus is what makes the sheet balance before year end.
  const surplus = money(sum(pick('income')) - sum(pick('expense')));

  res.json({
    as_of: asOf, assets, liabilities, equity, surplus,
    total_assets: sum(assets),
    total_liabilities: sum(liabilities),
    total_equity: money(sum(equity) + surplus),
    balanced: sum(assets) === money(sum(liabilities) + sum(equity) + surplus),
  });
});

r.get('/reports/budget', (req, res) => {
  const year = req.query.year_id
    ? db.prepare('SELECT * FROM financial_years WHERE id = ?').get(req.query.year_id)
    : db.prepare('SELECT * FROM financial_years WHERE is_closed = 0 ORDER BY starts_on DESC LIMIT 1').get();
  if (!year) return res.json({ year: null, rows: [] });

  const actuals = new Map(
    balances({ from: year.starts_on, to: year.ends_on }).map((a) => [a.id, a.balance])
  );
  const rows = db.prepare(
    `SELECT b.id, b.amount AS budget, b.note, a.id AS account_id, a.code, a.name, a.type
     FROM budgets b JOIN accounts a ON a.id = b.account_id
     WHERE b.year_id = ? ORDER BY a.code`
  ).all(year.id).map((row) => {
    const actual = money(actuals.get(row.account_id) ?? 0);
    return { ...row, actual, variance: money(row.budget - actual),
             used: row.budget ? Math.round((actual / row.budget) * 100) : null };
  });

  res.json({ year, rows });
});

r.put('/budgets', (req, res) => {
  const b = req.body ?? {};
  if (!b.year_id || !b.account_id) return res.status(400).json({ error: 'A year and an account are required' });
  db.prepare(
    `INSERT INTO budgets (year_id, account_id, amount, note) VALUES (?, ?, ?, ?)
     ON CONFLICT (year_id, account_id) DO UPDATE SET amount = excluded.amount, note = excluded.note`
  ).run(b.year_id, b.account_id, money(b.amount ?? 0), b.note ?? null);
  audit({ user: req.user, action: 'update', entity: 'budgets', entityId: `${b.year_id}/${b.account_id}`, next: b, ip: req.ip });
  res.json({ ok: true });
});

/* ── Where the books stand today ──────────────────────────────────────────── */
r.get('/overview', (_req, res) => {
  const year = db.prepare('SELECT * FROM financial_years WHERE is_closed = 0 ORDER BY starts_on DESC LIMIT 1').get();
  const rows = year ? balances({ from: year.starts_on, to: year.ends_on }) : balances();
  const sum = (type) => money(rows.filter((a) => a.type === type).reduce((s, a) => s + a.balance, 0));
  const roleBalance = (role) => money(rows.find((a) => a.role === role)?.balance ?? 0);

  res.json({
    year: year ?? null,
    ready: db.prepare('SELECT COUNT(*) n FROM accounts').get().n > 0,
    cash: money(roleBalance('bank') + roleBalance('cash')),
    receivable: roleBalance('receivable'),
    payable: roleBalance('payable'),
    income: sum('income'),
    expense: sum('expense'),
    surplus: money(sum('income') - sum('expense')),
    unposted: db.prepare("SELECT COUNT(*) n FROM journals WHERE status = 'draft'").get().n,
    awaiting_approval: db.prepare("SELECT COUNT(*) n FROM expenses WHERE status = 'draft'").get().n,
    unpaid_bills: db.prepare("SELECT COUNT(*) n FROM expenses WHERE status = 'approved'").get().n,
    recent: db.prepare(
      `SELECT j.id, j.reference, j.entry_date, j.memo, j.source, j.status,
              (SELECT COALESCE(SUM(debit), 0) FROM journal_lines WHERE journal_id = j.id) AS total
       FROM journals j WHERE j.status = 'posted' ORDER BY j.id DESC LIMIT 8`
    ).all(),
  });
});

/** Lays down the starting chart of accounts on a school that has none. */
r.post('/setup', (req, res) => {
  const existing = db.prepare('SELECT COUNT(*) n FROM accounts').get().n;
  const result = seedFinance(db);
  audit({ user: req.user, action: 'create', entity: 'accounts', entityId: 'chart',
          next: { ...result, existing }, ip: req.ip });
  res.status(201).json(result);
});

export default r;
