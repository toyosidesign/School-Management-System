/**
 * A starting chart of accounts for a school, and the financial year to post
 * into. Schools rename, add and retire accounts from here; the handful the
 * software posts to itself are marked with a `role` so fee posting keeps
 * working through any restructuring.
 *
 * Codes follow the usual blocks: 1000 assets, 2000 liabilities, 3000 funds,
 * 4000 income, 5000 expenditure.
 */
const ACCOUNTS = [
  ['1000', 'Current assets', 'asset', null, null],
  ['1010', 'Bank current account', 'asset', '1000', 'bank'],
  ['1020', 'Cash in hand', 'asset', '1000', 'cash'],
  ['1200', 'Fees receivable', 'asset', '1000', 'receivable'],
  ['1400', 'Prepayments', 'asset', '1000', null],
  ['1500', 'Fixed assets', 'asset', null, null],
  ['1510', 'Buildings', 'asset', '1500', null],
  ['1520', 'Furniture and equipment', 'asset', '1500', null],
  ['1530', 'Vehicles', 'asset', '1500', null],

  ['2000', 'Current liabilities', 'liability', null, null],
  ['2010', 'Suppliers payable', 'liability', '2000', 'payable'],
  ['2020', 'Fees received in advance', 'liability', '2000', null],
  ['2030', 'Payroll liabilities', 'liability', '2000', null],
  ['2040', 'Tax payable', 'liability', '2000', null],

  ['3000', 'Accumulated fund', 'equity', null, null],

  ['4000', 'Fee income', 'income', null, 'fee_income'],
  ['4010', 'Registration and admission fees', 'income', null, null],
  ['4020', 'Uniform and books', 'income', null, null],
  ['4030', 'Transport income', 'income', null, null],
  ['4040', 'Trips and activities', 'income', null, null],
  ['4900', 'Donations and grants', 'income', null, null],

  ['5000', 'Staff costs', 'expense', null, null],
  ['5010', 'Teaching salaries', 'expense', '5000', null],
  ['5020', 'Support staff salaries', 'expense', '5000', null],
  ['5030', 'Staff training', 'expense', '5000', null],
  ['5100', 'Premises', 'expense', null, null],
  ['5110', 'Rent and rates', 'expense', '5100', null],
  ['5120', 'Utilities', 'expense', '5100', null],
  ['5130', 'Repairs and maintenance', 'expense', '5100', null],
  ['5140', 'Cleaning and security', 'expense', '5100', null],
  ['5200', 'Teaching and learning', 'expense', null, null],
  ['5210', 'Books and stationery', 'expense', '5200', null],
  ['5220', 'Laboratory and workshop', 'expense', '5200', null],
  ['5230', 'Examinations', 'expense', '5200', null],
  ['5300', 'Administration', 'expense', null, null],
  ['5310', 'Office and printing', 'expense', '5300', null],
  ['5320', 'Telephone and internet', 'expense', '5300', null],
  ['5330', 'Professional fees', 'expense', '5300', null],
  ['5340', 'Insurance', 'expense', '5300', null],
  ['5400', 'Transport and travel', 'expense', null, null],
  ['5500', 'Catering', 'expense', null, null],
  ['5900', 'Bank charges', 'expense', null, null],
];

/** A school year, August to July, named for the September it opens in. */
export function currentYearRange(today = new Date()) {
  const start = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
  return { name: `${start}/${start + 1}`, starts_on: `${start}-08-01`, ends_on: `${start + 1}-07-31` };
}

/** Writes the chart and the open year, leaving anything already there alone. */
export function seedFinance(db, { today } = {}) {
  const insert = db.prepare(
    'INSERT INTO accounts (code, name, type, parent_id, role) VALUES (?, ?, ?, ?, ?) ON CONFLICT (code) DO NOTHING'
  );
  const idOf = db.prepare('SELECT id FROM accounts WHERE code = ?');

  db.transaction(() => {
    for (const [code, name, type, parentCode, role] of ACCOUNTS) {
      const parent = parentCode ? idOf.get(parentCode)?.id ?? null : null;
      // A role is unique across the chart, so never claim one already taken.
      const roleTaken = role && db.prepare('SELECT 1 FROM accounts WHERE role = ?').get(role);
      insert.run(code, name, type, parent, roleTaken ? null : role);
    }
  })();

  const year = currentYearRange(today);
  db.prepare(
    'INSERT INTO financial_years (name, starts_on, ends_on) VALUES (?, ?, ?) ON CONFLICT (name) DO NOTHING'
  ).run(year.name, year.starts_on, year.ends_on);

  return {
    accounts: db.prepare('SELECT COUNT(*) n FROM accounts').get().n,
    year: year.name,
  };
}
