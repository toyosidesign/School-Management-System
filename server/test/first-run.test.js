/** Claiming a fresh installation: the one account nobody invites. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

let ctx;
before(async () => { ctx = await boot(); });
after(async () => { await ctx.close(); });

describe('setting up as a new user', () => {
  it('is closed once the school has an administrator', async () => {
    const state = await ctx.api('GET', '/api/public/setup-state');
    assert.equal(state.status, 200);
    assert.equal(state.body.needs_setup, false, 'the seeded school is already claimed');

    const refused = await ctx.api('POST', '/api/public/setup', {
      body: { school_name: 'Second School', name: 'Someone Else',
              email: 'someone@else.example', password: 'a-long-enough-one' },
    });
    assert.equal(refused.status, 409);
    assert.match(refused.body.error, /already been set up/i);
  });

  it('asks for what it cannot do without', async () => {
    for (const [body, expected] of [
      [{ name: 'A B', email: 'a@b.example', password: 'a-long-enough-one' }, /called/i],
      [{ school_name: 'S', email: 'a@b.example', password: 'a-long-enough-one' }, /name is needed/i],
      [{ school_name: 'S', name: 'A B', email: 'nope', password: 'a-long-enough-one' }, /email/i],
      [{ school_name: 'S', name: 'A B', email: 'a@b.example', password: 'short' }, /8 characters/i],
    ]) {
      const res = await ctx.api('POST', '/api/public/setup', { body });
      // Whichever complaint comes first, it is never a 500 and never a 201.
      assert.ok(res.status === 400 || res.status === 409, `got ${res.status}`);
      if (res.status === 400) assert.match(res.body.error, expected);
    }
  });
});
