/** The everyday journeys: leave, fees, messaging and the public website. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTS, boot } from './helpers.js';

let ctx;
before(async () => { ctx = await boot({ RATE_LIMIT_FORM: '50' }); });
after(async () => { await ctx.close(); });

describe('leave requests', () => {
  it('approving tags the days as excused and opens catch-up entries', async () => {
    const parent = await ctx.login(ACCOUNTS.parent);
    // Approval is a leadership decision, so the head of school signs this off.
    const head = await ctx.login(ACCOUNTS.admin);
    const childId = (await ctx.api('GET', '/api/dashboard', { token: parent })).body.children[0].id;

    const created = await ctx.api('POST', '/api/leave', {
      token: parent,
      body: { student_id: childId, start_date: '2026-09-07', end_date: '2026-09-08', reason: 'Family travel', category: 'family' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.status, 'pending');

    const decided = await ctx.api('POST', `/api/leave/${created.body.id}/decision`, {
      token: head, body: { status: 'approved', review_note: 'Approved.' },
    });
    assert.equal(decided.body.status, 'approved');
    assert.ok(decided.body.excused_periods > 0, 'school periods in range are tagged as excused leave');
  });

  it('lets a teacher report an absence but not decide it', async () => {
    const teacher = await ctx.login(ACCOUNTS.mathsTeacher);
    const pupil = (await ctx.api('GET', '/api/students', { token: teacher })).body[0];

    const created = await ctx.api('POST', '/api/leave', {
      token: teacher,
      body: { student_id: pupil.id, start_date: '2026-09-14', end_date: '2026-09-15',
              reason: 'Family reported a hospital appointment', category: 'medical' },
    });
    assert.equal(created.status, 201, 'a teacher may report an absence');
    assert.equal(created.body.status, 'pending');

    // Marking the register is a leadership decision, not a classroom one.
    const refused = await ctx.api('POST', `/api/leave/${created.body.id}/decision`, {
      token: teacher, body: { status: 'approved' },
    });
    assert.equal(refused.status, 403);
    assert.match(refused.body.error, /does not have access/i,
                 'refused by what their role may do, which the school can set');

    const admin = await ctx.login(ACCOUNTS.admin);
    const decided = await ctx.api('POST', `/api/leave/${created.body.id}/decision`, {
      token: admin, body: { status: 'approved', review_note: 'Approved.' },
    });
    assert.equal(decided.body.status, 'approved');
  });

  it('tells leadership, not the class teacher, that a decision is waiting', async () => {
    const parent = await ctx.login(ACCOUNTS.parent);
    const childId = (await ctx.api('GET', '/api/dashboard', { token: parent })).body.children[0].id;

    await ctx.api('POST', '/api/leave', {
      token: parent,
      body: { student_id: childId, start_date: '2026-10-05', end_date: '2026-10-06', reason: 'Family travel' },
    });

    const admin = await ctx.login(ACCOUNTS.admin);
    const alerts = (await ctx.api('GET', '/api/notifications', { token: admin })).body;
    assert.ok(alerts.some((n) => /awaiting a decision/i.test(n.title)),
      'the approver is told there is something to decide');
  });

  it('rejects a leave request that ends before it starts', async () => {
    const parent = await ctx.login(ACCOUNTS.parent);
    const childId = (await ctx.api('GET', '/api/dashboard', { token: parent })).body.children[0].id;
    const res = await ctx.api('POST', '/api/leave', {
      token: parent, body: { student_id: childId, start_date: '2026-10-10', end_date: '2026-10-01', reason: 'Typo' },
    });
    assert.equal(res.status, 400);
  });
});

describe('fees', () => {
  it('records a part payment and leaves the correct balance', async () => {
    const parent = await ctx.login(ACCOUNTS.parent);
    const invoices = (await ctx.api('GET', '/api/invoices', { token: parent })).body;
    const open = invoices.find((i) => i.status !== 'paid');
    const balance = open.amount - open.paid;

    const paid = await ctx.api('POST', `/api/invoices/${open.id}/pay`, {
      token: parent, body: { amount: Math.round(balance / 2), method: 'card' },
    });
    assert.equal(paid.status, 201);
    assert.ok(paid.body.receipt_no.startsWith('RCP-'));
    assert.equal(paid.body.invoice.status, 'partial');
    assert.ok(paid.body.balance > 0);
  });

  it('refuses to take more than the outstanding balance', async () => {
    const parent = await ctx.login(ACCOUNTS.parent);
    const open = (await ctx.api('GET', '/api/invoices', { token: parent })).body.find((i) => i.status !== 'paid');
    const res = await ctx.api('POST', `/api/invoices/${open.id}/pay`, { token: parent, body: { amount: 999999 } });
    assert.equal(res.status, 400);
  });

  it('refuses payment against another family invoice', async () => {
    const parent = await ctx.login(ACCOUNTS.parent);
    const admin = await ctx.login(ACCOUNTS.admin);
    const own = (await ctx.api('GET', '/api/invoices', { token: parent })).body.map((i) => i.id);
    const other = (await ctx.api('GET', '/api/invoices', { token: admin })).body.find((i) => !own.includes(i.id));

    const res = await ctx.api('POST', `/api/invoices/${other.id}/pay`, { token: parent, body: { amount: 10 } });
    assert.equal(res.status, 403);
  });
});

describe('messaging', () => {
  it('translates on read and keeps the original', async () => {
    const parent = await ctx.login(ACCOUNTS.parent);
    const threads = (await ctx.api('GET', '/api/threads', { token: parent })).body;
    assert.ok(threads.length > 0);

    const messages = (await ctx.api('GET', `/api/threads/${threads[0].id}/messages?lang=fr`, { token: parent })).body;
    const translated = messages.find((m) => m.translated);
    assert.ok(translated, 'at least one message is translated');
    assert.notEqual(translated.translated, translated.body, 'the translation differs from the source');
    assert.ok(translated.body, 'the original is preserved');
  });

  it('refuses to read a thread the user is not part of', async () => {
    const parent = await ctx.login(ACCOUNTS.parent);
    const other = await ctx.login(ACCOUNTS.dyslexicStudent);
    const threads = (await ctx.api('GET', '/api/threads', { token: parent })).body;
    const res = await ctx.api('GET', `/api/threads/${threads[0].id}/messages`, { token: other });
    assert.equal(res.status, 403);
  });
});

describe('public website and admissions', () => {
  it('serves branding and content with no token', async () => {
    const res = await ctx.api('GET', '/api/public/site');
    assert.equal(res.status, 200);
    assert.ok(res.body.settings.name);
    assert.ok(res.body.pages.home, 'page content is included');
    assert.ok(res.body.stats.students >= 0);
  });

  it('never exposes pupil-level data on the public endpoint', async () => {
    const body = (await ctx.api('GET', '/api/public/site')).body;
    const payload = JSON.stringify(body);

    // Real pupil values, not prose. Policy copy may legitimately mention words
    // like "medical", so assert on actual identifiers instead of vocabulary.
    const admin = await ctx.login(ACCOUNTS.admin);
    const pupils = (await ctx.api('GET', '/api/students', { token: admin })).body;
    for (const pupil of pupils) {
      assert.ok(!payload.includes(pupil.student_code), `must not leak ${pupil.student_code}`);
      assert.ok(!payload.includes(pupil.email), 'must not leak a pupil email address');
    }

    for (const field of ['medical_notes', 'emergency_contact_name', 'date_of_birth', 'guardians']) {
      assert.ok(!payload.includes(`"${field}"`), `must not expose the ${field} field`);
    }
    // Only aggregate counts are published.
    assert.equal(typeof body.stats.students, 'number');
    assert.ok(!Array.isArray(body.stats.students));
  });

  it('excludes class-specific events from the public feed', async () => {
    const events = (await ctx.api('GET', '/api/public/events')).body;
    assert.ok(Array.isArray(events));
    assert.ok(events.every((e) => e.class_id === undefined || e.class_id === null));
  });

  it('captures an application and notifies administrators', async () => {
    const submitted = await ctx.api('POST', '/api/public/enquiries', {
      body: {
        kind: 'application', parent_name: 'Ada Nwosu', email: 'ada@example.test',
        child_name: 'Chidi Nwosu', section: 'primary', sen_notes: 'ADHD diagnosis.',
      },
    });
    assert.equal(submitted.status, 201);
    assert.match(submitted.body.reference, /^ENQ-\d+$/);

    const admin = await ctx.login(ACCOUNTS.admin);
    const inbox = (await ctx.api('GET', '/api/website/admissions', { token: admin })).body;
    assert.ok(inbox.some((e) => e.parent_name === 'Ada Nwosu' && e.sen_notes));

    const notifications = (await ctx.api('GET', '/api/notifications', { token: admin })).body;
    assert.ok(notifications.some((n) => /admissions application/i.test(n.title)));
  });

  it('captures a tour booking with its date and time preferences', async () => {
    const res = await ctx.api('POST', '/api/public/enquiries', {
      body: {
        kind: 'tour', parent_name: 'Chidinma Eze', email: 'c.eze@example.test',
        child_name: 'Ada Eze', preferred_date: '2026-09-18', preferred_time: 'morning',
        how_heard: 'word_of_mouth',
      },
    });
    assert.equal(res.status, 201);
    assert.match(res.body.message, /Tour request received/);

    const admin = await ctx.login(ACCOUNTS.admin);
    const inbox = (await ctx.api('GET', '/api/website/admissions?kind=tour', { token: admin })).body;
    const booking = inbox.find((e) => e.parent_name === 'Chidinma Eze');
    assert.ok(booking);
    assert.equal(booking.preferred_date, '2026-09-18');
    assert.equal(booking.preferred_time, 'morning');
    assert.equal(booking.how_heard, 'word_of_mouth');
  });

  it('refuses tour bookings when a school has paused them', async () => {
    const admin = await ctx.login(ACCOUNTS.admin);
    await ctx.api('PUT', '/api/website/settings', { token: admin, body: { tours_open: false } });

    const res = await ctx.api('POST', '/api/public/enquiries', {
      body: { kind: 'tour', parent_name: 'Someone', email: 's@example.test', child_name: 'Child' },
    });
    assert.equal(res.status, 409);

    await ctx.api('PUT', '/api/website/settings', { token: admin, body: { tours_open: true } });
  });

  it('serves every page of the site structure', async () => {
    const pages = (await ctx.api('GET', '/api/public/site')).body.pages;
    for (const page of ['home', 'about', 'learning', 'why', 'community',
                        'admissions', 'safeguarding', 'faqs', 'privacy', 'terms', 'contact']) {
      assert.ok(pages[page], `${page} content is published`);
    }
    assert.equal(pages.why.reasons.extra.length, 6, 'six differentiators');
    assert.ok(pages.faqs.items.extra.length >= 8, 'a real FAQ list');
    assert.ok(pages.safeguarding.contacts.extra.length >= 3, 'named safeguarding contacts');
  });

  it('hides the optional campaign until a school turns it on', async () => {
    const site = (await ctx.api('GET', '/api/public/site')).body;
    assert.equal(site.settings.campaign_enabled, 0, 'off by default');
    assert.ok(!site.pages.campaign, 'no campaign content is published');
  });

  it('validates enquiry input', async () => {
    assert.equal((await ctx.api('POST', '/api/public/enquiries', { body: { parent_name: 'A', email: 'bad' } })).status, 400);
    assert.equal((await ctx.api('POST', '/api/public/enquiries', { body: { kind: 'application', parent_name: 'A', email: 'a@b.test' } })).status, 400);
  });
});

describe('white-labelling', () => {
  it('rebrands the platform without a code change', async () => {
    const admin = await ctx.login(ACCOUNTS.admin);
    const res = await ctx.api('PUT', '/api/website/settings', {
      token: admin,
      body: { name: 'St Mary Grammar', brand_primary: '#9f1239', heading_font: 'Playfair Display', monogram: 'SM' },
    });
    assert.equal(res.status, 200);

    const site = (await ctx.api('GET', '/api/public/site')).body;
    assert.equal(site.settings.name, 'St Mary Grammar');
    assert.equal(site.settings.brand_primary, '#9f1239');
  });

  it('rejects a colour that is not a hex value', async () => {
    const admin = await ctx.login(ACCOUNTS.admin);
    const res = await ctx.api('PUT', '/api/website/settings', { token: admin, body: { brand_primary: 'red' } });
    assert.equal(res.status, 400);
  });

  it('accepts a hero photograph and serves it inline', async () => {
    const admin = await ctx.login(ACCOUNTS.admin);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

    const form = new FormData();
    form.set('image', new Blob([png]), 'hero.png');
    const res = await ctx.api('POST', '/api/website/content/home/hero/media', { token: admin, form });
    assert.equal(res.status, 201);
    assert.match(res.body.media_url, /^\/uploads\/site\//);

    // It must render in an <img>, so no attachment disposition, but still sandboxed.
    const served = await fetch(ctx.base + res.body.media_url);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-disposition'), null);
    assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
    assert.match(served.headers.get('content-security-policy'), /sandbox/);

    const site = (await ctx.api('GET', '/api/public/site')).body;
    assert.equal(site.pages.home.hero.media_url, res.body.media_url);

    await ctx.api('DELETE', '/api/website/content/home/hero/media', { token: admin });
    const cleared = (await ctx.api('GET', '/api/public/site')).body;
    assert.equal(cleared.pages.home.hero.media_url, null);
  });

  it('rejects a hero upload that is not a real image', async () => {
    const admin = await ctx.login(ACCOUNTS.admin);
    const form = new FormData();
    form.set('image', new Blob([new TextEncoder().encode('<svg onload=alert(1)>')]), 'evil.png');
    const res = await ctx.api('POST', '/api/website/content/home/hero/media', { token: admin, form });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /not appear to be a real PNG/);
  });

  it('records the rebrand in the audit trail', async () => {
    const admin = await ctx.login(ACCOUNTS.admin);
    await ctx.api('PUT', '/api/website/settings', { token: admin, body: { name: 'Another Name' } });
    const log = (await ctx.api('GET', '/api/audit?entity=school_settings', { token: admin })).body;
    assert.ok(log.some((a) => a.action === 'branding_update'));
  });
});

describe('calendar events', () => {
  it('takes a date without a time, and marks it all day', async () => {
    const admin = await ctx.login(ACCOUNTS.admin);
    const dated = await ctx.api('POST', '/api/calendar', {
      token: admin, body: { title: 'Term starts', event_type: 'general', start_at: '2026-09-07' },
    });
    assert.equal(dated.status, 201);
    assert.equal(dated.body.all_day, 1, 'a date alone lasts the day');
    assert.equal(dated.body.start_at, '2026-09-07T00:00:00.000Z');

    const span = await ctx.api('POST', '/api/calendar', {
      token: admin, body: { title: 'Half term', event_type: 'holiday', start_at: '2026-10-26', end_at: '2026-10-30' },
    });
    assert.equal(span.body.all_day, 1);
    assert.equal(span.body.end_at.slice(0, 10), '2026-10-30');
  });

  it('keeps the time when one is given', async () => {
    const admin = await ctx.login(ACCOUNTS.admin);
    const timed = await ctx.api('POST', '/api/calendar', {
      token: admin,
      body: {
        title: 'Governors meeting', event_type: 'meeting', all_day: false,
        start_at: '2026-09-15T18:00:00.000Z', end_at: '2026-09-15T19:30:00.000Z',
      },
    });
    assert.equal(timed.body.all_day, 0);
    assert.equal(timed.body.start_at, '2026-09-15T18:00:00.000Z');
  });

  it('still needs a title, and refuses to end before it starts', async () => {
    const admin = await ctx.login(ACCOUNTS.admin);
    assert.equal((await ctx.api('POST', '/api/calendar', {
      token: admin, body: { start_at: '2026-09-07' },
    })).status, 400);

    const backwards = await ctx.api('POST', '/api/calendar', {
      token: admin, body: { title: 'Backwards', start_at: '2026-10-10', end_at: '2026-10-01' },
    });
    assert.equal(backwards.status, 400);
    assert.match(backwards.body.error, /end before it starts/i);
  });
});
