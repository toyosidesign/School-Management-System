/** The teacher notice board: everything waiting on them, actioned in place. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTS, boot } from './helpers.js';

let ctx, teacher;
before(async () => {
  ctx = await boot();
  teacher = await ctx.login(ACCOUNTS.mathsTeacher);
});
after(async () => { await ctx.close(); });

const actions = async (token) => (await ctx.api('GET', '/api/dashboard/actions', { token })).body.items;

describe('work waiting on a teacher', () => {
  it('gathers marking, drafts and messages into one list', async () => {
    const res = await ctx.api('GET', '/api/dashboard/actions', { token: teacher });
    assert.equal(res.status, 200);

    const kinds = res.body.items.map((i) => i.kind);
    assert.ok(kinds.includes('grading'), 'submissions with no mark surface');
    assert.ok(kinds.includes('draft'), 'recaps never released surface');
    for (const item of res.body.items) {
      assert.ok(item.id && item.title && item.link && item.cta, `${item.kind} is actionable`);
    }
  });

  it('shows a teacher only their own classes', async () => {
    const other = await ctx.login(ACCOUNTS.historyTeacher);
    const mine = await actions(teacher);
    const theirs = new Set((await actions(other)).map((i) => i.id));
    const grading = mine.filter((i) => i.kind === 'grading');
    assert.ok(grading.length > 0);
    assert.ok(grading.every((i) => !theirs.has(i.id)), 'no crossover between teachers');
  });

  it('publishes a draft recap in place and drops it from the list', async () => {
    const draft = (await actions(teacher)).find((i) => i.kind === 'draft');
    assert.ok(draft.action, 'the draft carries an inline action');

    const done = await ctx.api('PATCH', `/api${draft.action.path}`, { token: teacher, body: draft.action.body });
    assert.equal(done.status, 200);
    assert.ok(!(await actions(teacher)).some((i) => i.id === draft.id), 'gone once pupils can see it');
  });

  it('drops the marking item once the work is marked', async () => {
    const item = (await actions(teacher)).find((i) => i.kind === 'grading');
    const detail = await ctx.api('GET', `/api${item.link.replace('/teacher', '')}`, { token: teacher });
    const waiting = detail.body.submissions.filter((s) => s.id && s.grade === null);
    assert.equal(waiting.length, item.count);

    for (const sub of waiting) {
      const graded = await ctx.api('POST', `/api/submissions/${sub.id}/grade`, {
        token: teacher, body: { grade: 15, feedback_type: 'text', feedback_text: 'Good work.' },
      });
      assert.equal(graded.status, 200);
    }
    assert.ok(!(await actions(teacher)).some((i) => i.id === item.id));
  });

  it('is closed to everyone but teachers', async () => {
    const head = await ctx.login(ACCOUNTS.admin);
    assert.equal((await ctx.api('GET', '/api/dashboard/actions', { token: head })).status, 403);
  });
});
