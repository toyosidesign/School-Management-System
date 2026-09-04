/**
 * The starting point for a real school, as opposed to the demo.
 *
 * A brand new deployment has no pupils, staff, classes or news, but it cannot
 * have an empty public website: the content editor edits the slots that exist,
 * it does not invent them. So this writes the full page skeleton with neutral
 * copy a school replaces in its own words. Anything that is a fact we cannot
 * know, a fee, a name, a phone number, is left in [square brackets] rather than
 * invented, so it is obvious on the page what still needs answering.
 */

const SETTINGS = {
  name: 'Your School',
  short_name: 'School',
  tagline: 'Add a one-line description of your school here.',
  monogram: 'S',
  favicon_emoji: '🎓',
  brand_primary: '#2563eb',
  brand_accent: '#7c3aed',
  heading_font: 'Inter',
  academic_year: null,      // set from the current date at install time
  currency: 'USD',
  admissions_open: 1,
  tours_open: 1,
  campaign_enabled: 0,
  campaign_label: 'campaign',
};

/** [page, slot, heading, body, extra, sort_order] */
/**
 * The three phases most schools recognise, offered as a starting point.
 *
 * A school's own divisions are its to write — these are renamed, reordered or
 * deleted from the Sections page — but a school with none at all cannot create
 * a class on its first day, which is the first thing anybody tries to do.
 */
const SECTIONS = [
  ['nursery', 'Nursery', 1],
  ['primary', 'Primary', 2],
  ['secondary', 'Secondary', 3],
];

const CONTENT = [
  ['home', 'hero',
   'Add your headline here',
   'One or two sentences on who you are and who you teach. This is the first thing a family reads, so write it in your own voice rather than in the language of a prospectus.',
   { eyebrow: 'Nursery, primary and secondary',
     primary_cta: 'Book a tour', secondary_cta: 'Apply now' }, 0],

  ['home', 'ctas', null, null,
   { primary: { label: 'Book a tour', href: '/admissions#tour' },
     secondary: { label: 'Apply now', href: '/admissions#apply' },
     persistent: { label: 'Chat with us', channel: 'whatsapp' } }, 1],

  ['home', 'pillars', 'What makes us different', null,
   [{ icon: 'book', title: 'First thing families should know',
      body: 'Replace this with something only your school can say. A promise you keep, not a feature every school lists.' },
    { icon: 'users', title: 'Second thing',
      body: 'Two or three sentences. Concrete beats general: what a parent would actually notice in a term.' },
    { icon: 'heart', title: 'Third thing',
      body: 'Keep these three the same length so the row reads evenly.' }], 2],

  ['home', 'quote',
   'A short quotation from a parent or pupil belongs here, in their words.',
   null, { author: '[Parent of a pupil in Year ...]' }, 3],

  ['about', 'hero', 'About our school',
   'A paragraph on where the school came from and what it is for. Founding year, who started it, and what has not changed since.',
   null, 0],

  ['about', 'key_messages', 'What we are known for', null,
   [{ title: 'First message', body: 'What families tell each other about you.' },
    { title: 'Second message', body: 'Something you do differently from the school down the road.' },
    { title: 'Third message', body: 'Something a prospective parent would want reassurance on.' },
    { title: 'Fourth message', body: 'Something you are proud of that is easy to verify.' }], 1],

  ['about', 'values', 'What we stand for', null,
   [{ title: 'First value', body: 'A sentence on what this looks like on an ordinary Tuesday, not as an abstract principle.' },
    { title: 'Second value', body: 'Values a school actually holds are specific enough to be inconvenient sometimes. Write those.' },
    { title: 'Third value', body: 'Replace or remove any of these four.' },
    { title: 'Fourth value', body: 'Four reads well on the page. Three is fine too.' }], 2],

  ['about', 'leadership', 'Leadership team', null,
   [{ name: '[Name]', role: 'Head of School', bio: 'A line or two on their background and what they lead on.' },
    { name: '[Name]', role: 'SENCO', bio: 'Add each member of the leadership team families are likely to meet.' },
    { name: '[Name]', role: '[Role]', bio: 'Remove any rows you do not need.' }], 3],

  ['about', 'accreditations', 'Inspections and accreditation',
   'List the bodies that inspect or accredit you, and link to the reports in full.',
   [{ name: '[Body]', short: '[Grade]', body: 'What this body assesses and when they last visited.' },
    { name: '[Body]', short: '[Grade]', body: 'Families take published reports more seriously than claims.' },
    { name: '[Body]', short: '[Grade]', body: 'Remove the rows you do not need.' }], 4],

  ['learning', 'hero', 'How we teach',
   'A paragraph on your approach across the whole school, from the youngest children to the oldest.',
   null, 0],

  ['learning', 'stages', 'The stages', null,
   [{ key: 'nursery', title: 'Early Years', ages: 'Ages [2 to 4]',
      body: 'What the youngest children do with their day, and what parents can expect to hear about.',
      points: ['A point about staffing or ratios', 'A point about the daily routine',
               'A point about early literacy or number', 'A point about settling in'] },
    { key: 'primary', title: 'Primary', ages: 'Ages [5 to 11]',
      body: 'What changes as children move up, and what stays the same.',
      points: ['A point about the curriculum', 'A point about reading',
               'A point about specialist teaching', 'A point about pastoral care'] },
    { key: 'secondary', title: 'Secondary', ages: 'Ages [11 to 16]',
      body: 'Subjects, examinations and what pupils leave with.',
      points: ['A point about subject choice', 'A point about examinations',
               'A point about careers or next steps', 'A point about independence'] }], 1],

  ['learning', 'support', 'Support for every learner',
   'How you identify and meet additional needs: who is responsible, what a support plan contains, and how parents are involved in writing it.',
   null, 2],

  ['learning', 'beyond', 'Beyond the classroom',
   'Clubs, trips, music, sport and everything that is not a lesson.',
   [{ title: '[Activity]', body: 'When it runs, who it is for, and whether it costs anything.' },
    { title: '[Activity]', body: 'Parents look here for what their particular child would enjoy.' },
    { title: '[Activity]', body: 'Be specific. "Chess club, Tuesday lunchtimes" beats "a range of clubs".' },
    { title: '[Activity]', body: 'Add or remove rows as you need.' }], 3],

  ['why', 'hero', 'Why families choose us',
   'The honest answer to the question a parent is actually asking: why here rather than somewhere else?',
   null, 0],

  ['why', 'reasons', null, null,
   [{ icon: 'shield', title: '[Reason]', body: 'One reason per card, each a sentence or two.' },
    { icon: 'accessibility', title: '[Reason]', body: 'Reasons that would survive a sceptical parent asking "such as?".' },
    { icon: 'users', title: '[Reason]', body: 'Six reads well as a grid. Fewer is fine.' },
    { icon: 'book', title: '[Reason]', body: 'Replace the icons to suit: they are drawn from the app icon set.' },
    { icon: 'heart', title: '[Reason]', body: 'Keep the lengths even so the cards line up.' },
    { icon: 'message', title: '[Reason]', body: 'Remove any card you do not need.' }], 1],

  ['why', 'safeguarding_summary', 'Keeping children safe',
   'A short summary of your safeguarding arrangements, with a link to the full page.',
   null, 2],

  ['community', 'hero', 'Our community',
   'Who is here: families, staff, alumni, and how they relate to each other.',
   null, 0],

  ['community', 'teachers', 'Our teachers',
   'A paragraph on your staff: how you recruit, how long people stay, and what they are trained in.',
   null, 1],

  ['community', 'testimonials', 'What families say', null,
   [{ quote: 'A real quotation from a real family, used with their permission.', author: '[Name]', since: '[Parent since 20XX]' },
    { quote: 'Specific quotations are worth ten general ones.', author: '[Name]', since: '[Parent since 20XX]' },
    { quote: 'Ask at the school gate. People are usually glad to be asked.', author: '[Name]', since: '[Parent since 20XX]' }], 2],

  ['community', 'alumni', 'Where our leavers go',
   'What former pupils go on to do, and how you stay in touch with them.',
   [{ name: '[Name]', left: '[Year]', now: '[What they do now]', quote: 'A sentence in their own words.' },
    { name: '[Name]', left: '[Year]', now: '[What they do now]', quote: 'Leavers are your most credible witnesses.' },
    { name: '[Name]', left: '[Year]', now: '[What they do now]', quote: 'Remove any rows you do not need.' }], 3],

  ['admissions', 'hero', 'Admissions',
   'How and when families can join, in plain language. Say whether you admit mid-year.',
   null, 0],

  ['admissions', 'steps', 'How it works', null,
   [{ step: '1', title: 'Get in touch', body: 'How to reach you and how quickly you reply.' },
    { step: '2', title: 'Come and look round', body: 'What a visit involves and whether children come too.' },
    { step: '3', title: 'Tell us about your child', body: 'What you ask families for at this point.' },
    { step: '4', title: 'Offer and settling in', body: 'How an offer is made and what happens next.' }], 1],

  ['admissions', 'journey', 'From first look to first day', null,
   [{ step: 'Discover', body: 'Read about the school and how it teaches.' },
    { step: 'Visit', body: 'See it on an ordinary school day.' },
    { step: 'Apply', body: 'Send the form on this page.' },
    { step: 'Meet', body: 'A conversation about your child.' },
    { step: 'Offer', body: 'We confirm a place.' },
    { step: 'Start', body: 'Taster days and a settled start.' }], 2],

  ['admissions', 'fees', 'Fees', null,
   [{ section: 'Nursery', term: '[Amount] per term', note: '[What is included]' },
    { section: 'Primary', term: '[Amount] per term', note: '[What is included]' },
    { section: 'Secondary', term: '[Amount] per term', note: '[What is included]' }], 3],

  ['faqs', 'hero', 'Questions families ask',
   'The questions you answer on the phone every week belong here, answered as directly as you answer them out loud.',
   null, 0],

  ['faqs', 'items', null, null,
   [{ category: 'Admissions', q: 'When can my child join?', a: '[Your answer]' },
    { category: 'Admissions', q: 'Is there a waiting list?', a: '[Your answer]' },
    { category: 'Fees', q: 'What do the fees include?', a: '[Your answer]' },
    { category: 'Support', q: 'How do you support additional needs?', a: '[Your answer]' },
    { category: 'Daily life', q: 'What are the school hours?', a: '[Your answer]' },
    { category: 'Daily life', q: 'Do you provide lunches?', a: '[Your answer]' }], 1],

  ['safeguarding', 'hero', 'Safeguarding',
   'Your commitment in a sentence, and who is responsible for it.',
   null, 0],

  ['safeguarding', 'commitments', 'What we do', null,
   [{ title: 'Safer recruitment', body: 'What checks every adult in the building has been through.' },
    { title: 'Training', body: 'Who is trained, in what, and how often it is refreshed.' },
    { title: 'Listening to children', body: 'How a child raises something, and what happens then.' },
    { title: 'Working with families', body: 'When and how you involve parents, and when you cannot.' }], 1],

  ['safeguarding', 'contacts', 'Who to contact', null,
   [{ role: 'Designated Safeguarding Lead', name: '[Name]', detail: '[Email or phone]' },
    { role: 'Deputy Safeguarding Lead', name: '[Name]', detail: '[Email or phone]' },
    { role: 'Local authority safeguarding team', name: '[Team]', detail: '[Phone]' }], 2],

  ['safeguarding', 'raise', 'Raising a concern',
   'How anybody, inside or outside the school, raises a concern about a child, and what they can expect to happen next.',
   null, 3],

  ['contact', 'hero', 'Contact us',
   'Say who picks up the phone, and when. Add anything a visitor needs to know before arriving.',
   null, 0],

  ['privacy', 'hero', 'Privacy notice',
   'How the school collects, uses and protects personal information about pupils and families.',
   null, 0],

  ['privacy', 'body', null,
   'Replace this with your own privacy notice.\n\nIt should cover: what personal data you hold about pupils and families, why you hold it and on what lawful basis, who you share it with, how long you keep it, and how somebody asks to see or correct what you hold about them. Name the person responsible for data protection and give an address for requests.\n\nIf you are not sure what this needs to say, take advice rather than adapting another school’s wording.',
   null, 1],

  ['terms', 'hero', 'Terms of use',
   'The terms on which families and staff use this website and the family portal.',
   null, 0],

  ['terms', 'body', null,
   'Replace this with your own terms of use.\n\nIt should cover: that the website is for information and does not form part of a contract, that portal accounts are personal and must not be shared, who owns work submitted through the portal, and the circumstances in which access may be withdrawn.',
   null, 1],
];

/** Writes settings and the page skeleton. Existing rows are left alone. */
export function applyStarter(db, { name, academicYear } = {}) {
  const settings = { ...SETTINGS, name: name || SETTINGS.name, academic_year: academicYear ?? null };
  settings.short_name = (name || SETTINGS.short_name).split(/\s+/)[0].slice(0, 24);
  settings.monogram = (name || 'S').trim()[0].toUpperCase();

  const columns = Object.keys(settings);
  db.prepare(
    `INSERT INTO school_settings (id, ${columns.join(', ')})
     VALUES (1, ${columns.map(() => '?').join(', ')})
     ON CONFLICT (id) DO NOTHING`
  ).run(...columns.map((c) => settings[c]));

  const addSection = db.prepare(
    'INSERT INTO sections (key, name, sort_order) VALUES (?, ?, ?) ON CONFLICT (key) DO NOTHING'
  );
  for (const [key, name, order] of SECTIONS) addSection.run(key, name, order);

  const add = db.prepare(
    `INSERT INTO site_content (page, slot, heading, body, extra, sort_order)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (page, slot) DO NOTHING`
  );
  for (const [page, slot, heading, body, extra, order] of CONTENT) {
    add.run(page, slot, heading, body, extra == null ? null : JSON.stringify(extra), order);
  }

  return { pages: new Set(CONTENT.map((c) => c[0])).size, slots: CONTENT.length };
}
