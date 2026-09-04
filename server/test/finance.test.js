/** The general ledger: what it accepts, what it refuses, and what it reports. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTS, boot } from './helpers.js';

let ctx, admin, accounts;
const codeId = (code) => accounts.find((a) => a.code === code).id;

before(async () => {
  ctx = await boot();
  admin = await ctx.login(ACCOUNTS.admin);
  accounts = (await ctx.api('GET', '/api/finance/accounts', { token: admin })).body;
});
after(async () => { await ctx.close(); });

const post = (path, body) => ctx.api('POST', path, { token: admin, body });
const get = (path) => ctx.api('GET', path, { token: admin });

describe('posting to the ledger', () => {
  it('refuses an entry that does not balance, and says by how much', async () => {
    const bad = await post('/api/finance/journals', {
      entry_date: '2026-09-01', memo: 'Out by ten',
      lines: [{ account_id: codeId('5900'), debit: 100 }, { account_id: codeId('1010'), credit: 90 }],
    });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /does not balance/i);
    assert.equal(bad.body.detail.difference, 10);
  });

  it('refuses a line that is both a debit and a credit, and a one-legged entry', async () => {
    const both = await post('/api/finance/journals', {
      entry_date: '2026-09-01', memo: 'Both',
      lines: [{ account_id: codeId('5900'), debit: 50, credit: 50 }, { account_id: codeId('1010'), credit: 50 }],
    });
    assert.equal(both.status, 400);

    const single = await post('/api/finance/journals', {
      entry_date: '2026-09-01', memo: 'One leg', lines: [{ account_id: codeId('5900'), debit: 50 }],
    });
    assert.equal(single.status, 400);
  });

  it('posts a balanced entry and moves both accounts', async () => {
    const before = (await get(`/api/finance/accounts/${codeId('5900')}/ledger`)).body.balance;
    const made = await post('/api/finance/journals', {
      entry_date: '2026-09-01', memo: 'Bank charges for August',
      lines: [{ account_id: codeId('5900'), debit: 45 }, { account_id: codeId('1010'), credit: 45 }],
    });
    assert.equal(made.status, 201);
    assert.equal(made.body.total, 45);
    assert.equal(made.body.status, 'posted');

    const after = (await get(`/api/finance/accounts/${codeId('5900')}/ledger`)).body.balance;
    assert.equal(after, before + 45, 'an expense account rises with a debit');
  });
});

describe('correcting a mistake', () => {
  it('reverses by posting the mirror image, and both entries stay in the account', async () => {
    const made = (await post('/api/finance/journals', {
      entry_date: '2026-09-02', memo: 'Posted to the wrong account',
      lines: [{ account_id: codeId('5310'), debit: 120 }, { account_id: codeId('1010'), credit: 120 }],
    })).body;
    const before = (await get(`/api/finance/accounts/${codeId('5310')}/ledger`)).body.balance;

    const reversed = await post(`/api/finance/journals/${made.id}/reverse`, { reason: 'Wrong account' });
    assert.equal(reversed.status, 200);

    const ledger = (await get(`/api/finance/accounts/${codeId('5310')}/ledger`)).body;
    assert.equal(ledger.balance, before - 120, 'the correction cancels the mistake exactly');
    assert.equal(ledger.entries.filter((e) => e.reference === made.reference).length, 1,
                 'the original is still on the statement');

    const original = (await get(`/api/finance/journals/${made.id}`)).body;
    assert.equal(original.status, 'posted', 'nothing is struck from the ledger');
    assert.equal(original.reversed_by_reference, reversed.body.reversal.reference);

    // A correction is made once.
    assert.equal((await post(`/api/finance/journals/${made.id}/reverse`, {})).status, 400);
  });
});

describe('fees reach the books', () => {
  it('bills a family as a debt owed and income earned, and banks the payment', async () => {
    const pupil = (await get('/api/students')).body[0];
    const receivable = accounts.find((a) => a.role === 'receivable');
    const income = accounts.find((a) => a.role === 'fee_income');
    const owedBefore = (await get(`/api/finance/accounts/${receivable.id}/ledger`)).body.balance;
    const earnedBefore = (await get(`/api/finance/accounts/${income.id}/ledger`)).body.balance;

    const invoice = (await post('/api/invoices', {
      student_id: pupil.id, amount: 900, due_date: '2026-10-01', description: 'Field trip',
    })).body;
    assert.ok(invoice.journal_id, 'the invoice records where it posted');

    assert.equal((await get(`/api/finance/accounts/${receivable.id}/ledger`)).body.balance, owedBefore + 900);
    assert.equal((await get(`/api/finance/accounts/${income.id}/ledger`)).body.balance, earnedBefore + 900);

    const paid = await post(`/api/invoices/${invoice.id}/pay`, { amount: 900, method: 'transfer' });
    assert.equal(paid.status, 201);
    assert.equal((await get(`/api/finance/accounts/${receivable.id}/ledger`)).body.balance, owedBefore,
                 'paying settles the debt again');
  });
});

describe('expenditure', () => {
  it('will not pay a bill nobody approved, and posts it when they do', async () => {
    const made = (await post('/api/finance/expenses', {
      description: 'Playground repairs', amount: 1250, account_id: codeId('5130'), spent_on: '2026-08-28',
    })).body;
    assert.equal(made.status, 'draft');
    assert.match(made.reference, /^EXP-2026-\d{4}$/);

    assert.equal((await post(`/api/finance/expenses/${made.id}/pay`, {})).status, 409);

    await post(`/api/finance/expenses/${made.id}/decision`, { status: 'approved' });
    const paid = await post(`/api/finance/expenses/${made.id}/pay`, {});
    assert.equal(paid.status, 200);
    assert.equal(paid.body.status, 'paid');
    assert.equal(paid.body.journal.total, 1250);
  });
});

describe('the statements', () => {
  it('balance, and agree with each other', async () => {
    const trial = (await get('/api/finance/reports/trial-balance')).body;
    assert.equal(trial.totals.debits, trial.totals.credits);
    assert.equal(trial.balanced, true);

    const sheet = (await get('/api/finance/reports/balance-sheet')).body;
    assert.equal(sheet.balanced, true, 'assets equal liabilities plus funds');

    const pl = (await get('/api/finance/reports/profit-loss')).body;
    assert.equal(pl.surplus, Math.round((pl.total_income - pl.total_expense) * 100) / 100);
    assert.equal(sheet.surplus, pl.surplus, 'the sheet carries the same surplus the account shows');
  });

  it('reports budget against what was actually spent', async () => {
    const budget = (await get('/api/finance/reports/budget')).body;
    assert.ok(budget.rows.length > 0);
    for (const row of budget.rows) {
      assert.equal(typeof row.actual, 'number');
      assert.equal(row.variance, Math.round((row.budget - row.actual) * 100) / 100);
    }
  });
});

describe('a closed year', () => {
  it('refuses anything posted into it, until it is reopened', async () => {
    const year = (await get('/api/finance/years')).body[0];
    assert.equal((await post(`/api/finance/years/${year.id}/close`, {})).body.is_closed, 1);

    const late = await post('/api/finance/journals', {
      entry_date: year.starts_on, memo: 'Too late',
      lines: [{ account_id: codeId('5900'), debit: 10 }, { account_id: codeId('1010'), credit: 10 }],
    });
    assert.equal(late.status, 400);
    assert.match(late.body.error, /closed/i);

    await post(`/api/finance/years/${year.id}/close`, { reopen: true });
    const now = await post('/api/finance/journals', {
      entry_date: year.starts_on, memo: 'After reopening',
      lines: [{ account_id: codeId('5900'), debit: 10 }, { account_id: codeId('1010'), credit: 10 }],
    });
    assert.equal(now.status, 201);
  });
});

describe('who may see the books', () => {
  it('is school leadership alone', async () => {
    const teacher = await ctx.login(ACCOUNTS.mathsTeacher);
    for (const path of ['/api/finance/overview', '/api/finance/accounts', '/api/finance/journals',
                        '/api/finance/reports/trial-balance']) {
      assert.equal((await ctx.api('GET', path, { token: teacher })).status, 403, path);
    }
    const parent = await ctx.login(ACCOUNTS.parent);
    assert.equal((await ctx.api('GET', '/api/finance/overview', { token: parent })).status, 403);
  });
});
