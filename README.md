# Integrated K-12 School Management System

A unified, accessible, web-responsive platform for **Nursery, Primary and Secondary** schools,
built to the attached PRD (WCAG 2.1 AA · GDPR · COPPA).

A **public website** that any school can rebrand as its own, backed by four portals:
**Administration**, **Teaching staff**, **Students** and **Parents/Guardians**.

---

## Quick start

```bash
npm run install:all     # installs root, server and client dependencies
npm run seed            # builds the database and loads a full demo school
npm run dev             # API on :4000, web app on :5173
```

Open <http://localhost:5173>. You land on the **public school website**; the portal is behind
**Portal login**. **Every demo account uses the password `Passw0rd!`**
(the login screen has a "Use a demo account" picker so you never have to type one).

| Role | Email | What it shows off |
|---|---|---|
| Admin · Head of School | `admin@school.demo` | Whole-school analytics, fees, immutable audit log |
| SENCO | `senco@school.demo` | SEN register and IEP editing |
| Teacher · History | `e.rossi@school.demo` | An audio submission waiting to be graded |
| Teacher · Maths | `d.mensah@school.demo` | Attendance register that fills the Catch-Up Hub |
| Teacher · Nursery | `m.lin@school.demo` | Daily activity log for early years |
| Student · Alex Jordan | `stu-3004@student.demo` | 1.5× extra time, multi-format submissions approved |
| Student · Maya Thompson | `stu-1002@student.demo` | Dyslexia preset, lessons waiting in the Catch-Up Hub |
| Student · Noah Adeyemi | `stu-2002@student.demo` | Primary pupil, ADHD preset with Focus Mode on |
| Parent · Michael Jordan | `m.jordan@family.demo` | French locale, messages translate inline |
| Parent · Yuki Nakamura | `y.nakamura@family.demo` | Two children across two sections |

A full list is written to `server/data/DEMO_ACCOUNTS.md` each time you seed.

### Production

```bash
npm run build           # builds the SPA into client/dist
npm start               # the API serves the built app on :4000
```

---

## White-labelling: making it your school

Nothing about the school's identity is hardcoded. An administrator sets it all under
**Website & branding** in the admin portal, and it applies instantly across the public site *and*
every portal, with no rebuild and no code change.

| Setting | Where it shows |
|---|---|
| School name, short name, tagline | Site header, footer, browser tab, portal sidebar, login screen |
| Logo upload, or a monogram fallback | Everywhere the name appears |
| Favicon emoji | Browser tab, rendered to SVG at runtime |
| Primary + accent colour | The entire interface (see below) |
| Heading font | Public-site headings |
| Address, phone, email, office hours, map | Contact page and footer |
| Social links | Footer, hidden when blank |
| Academic year, currency | Fees, invoices, admissions copy |
| Admissions open/closed | Swaps the application form for a notice |

### One colour, a whole palette

The school picks **one** primary hex. `client/src/lib/palette.ts` converts it to HSL and derives the
full 50-900 scale, so a custom colour looks deliberate rather than one flat swatch pasted everywhere.

Those stops are published as CSS custom properties holding **RGB channel triplets**, and
`tailwind.config.js` reads them through Tailwind's `<alpha-value>` syntax:

```js
brand: { 600: 'rgb(var(--brand-600) / <alpha-value>)' }
```

That detail matters: it means every existing opacity modifier in the codebase
(`bg-brand-600/10`, `ring-brand-500/30`) keeps working against the school's own colour.

Changing branding is written to the immutable audit trail with the previous and new values, and
only an `admin` can do it. The editor shows a **live preview** across real interface components
while you tweak, and reverts if you navigate away without saving.

One deliberate exception: the **body font is never brand-controlled**. It follows each user's own
accessibility preference, because a school's typographic taste must not override a dyslexic pupil's
need for OpenDyslexic.

---

## The public website

The prospective-parent journey starts here, not at a login box.

| Route | Page |
|---|---|
| `/` | Home: hero, live pupil/class counts, the three sections, testimonial, latest news |
| `/about` | Story, values, leadership, accessibility statement |
| `/academics` | Nursery, Primary and Secondary in detail, plus SEN support |
| `/admissions` | Process, fees table, and the **application form** |
| `/news` and `/news/:slug` | Articles and upcoming public events |
| `/contact` | Details, map embed, and the **enquiry form** |
| `/login` | The portal |

Both forms post to `POST /api/public/enquiries` and land in one reviewable pipeline at
**/admin/admissions** (New, Contacted, Offer made, Enrolled, Closed), notifying every administrator.
The application form asks about support needs with an explicit note that disclosing them does not
count against the application, and flags those enquiries for the SEN team.

Page copy is not hardcoded either: it lives in a `site_content` table and is edited from
**Website & branding, Page content**, including the structured lists (stats, pillars, steps, fees).
News is authored in the same place.

**Public endpoints are mounted before all authentication** and are the only unauthenticated surface:
`/api/public/site`, `/api/public/news`, `/api/public/events`, `/api/public/enquiries`. The site
endpoint returns only aggregate counts, never pupil data, and the public events feed excludes
anything class-specific. Form submissions are rate limited to 5 per 10 minutes per IP, on top of the
global 100 req/min.

---

## What's in the box

### Learning continuity
- **Catch-Up Hub**: marking a student absent *automatically* creates their catch-up entry and
  attaches the lesson recap, teacher notes, summary and attachments. Publishing a recap after the
  fact back-fills every entry that was waiting for it.
- Adaptive video playback with **synchronised captions built from the transcript**, and a
  **searchable transcript** where clicking a timestamp jumps the player to that moment.
- **E-textbook reader** with progressive loading (5-page windows), saved reading position and the
  full reading toolbar inline.
- **Leave requests**: approval tags every affected period as *Excused Leave* and opens Catch-Up
  entries for each missed lesson.

### Accessibility & SEN engine (UDL)
Preferences apply as `data-` attributes on `<html>`, so **every screen adapts at once** across desktop,
tablet and mobile, with no second app and no per-page work.

| Need | What the platform actually does |
|---|---|
| Dyslexia / visual stress | OpenDyslexic & Lexend fonts, soft-blue / yellow tints, **Bionic Reading**, inline text-to-speech |
| ADHD / executive function | One-click **Focus Mode** (`Alt+F`) strips secondary UI, step-by-step task chunking with progress bars |
| Autism Spectrum (ASC) | Low-sensory mode mutes all animation, predictable layout, structured change alerts |
| Dyscalculia | Visual pie-chart countdown timers, colour-coded subjects, visual schedule cards |
| Motor / fine control | Full keyboard navigation, **≥ 48 px targets** toggle, voice dictation instead of typing |

Saved as a **default preset** per user (`Alt+A` opens the toolbar anywhere, including the login screen).

### Assessment
- **Multi-format submissions**: text, audio, video or diagram/PDF, gated on the student's IEP with
  server-side format validation. Audio and video queue **background speech-to-text** so the teacher
  always has a readable transcript.
- **Automatic extra time**: a 60-minute quiz becomes 90 minutes for a student with
  `time_multiplier = 1.5`, calculated server-side at the moment they press start.
- Teacher grading with written **or audio** feedback and one-click *Submit grade & notify parent*.
- **Notice board that works**: the teacher dashboard gathers unmarked work, unclaimed registers,
  pupils waiting on a recap, unreleased drafts and unread messages into one list, each with the
  action attached. Publishing a draft recap happens in place, without leaving the dashboard.

### Parent–teacher collaboration
- Verified 1-on-1 messaging with **inline translation** (English, French, Spanish, Yorùbá, Hausa,
  Arabic). Read in your own language, expand to see the original.
- **Nursery/primary daily timeline**: meals, naps, moods, toileting, behaviour and milestones,
  pushed to guardians as they are logged.
- **Digital permission slips** with typed signature, timestamp and IP recorded to the audit trail.

### Starting a real school
`npm run init:school -- "School Name" you@school.org "Your Name"` sets up an empty deployment: the
public website skeleton with placeholder copy to replace, and one administrator holding a one-time
link to choose their own password. No pupils, staff, classes, subjects or news. The admin dashboard
then carries a **setup checklist** that disappears once the school is up: brand it, add subjects and
classes, invite staff, enrol pupils, build the timetable, write the website copy. Everything on that
list is doable in the app.

Run it against a database file of your choosing with `SMS_DB_PATH`, and it refuses to overwrite a
database that already holds accounts unless you pass `--force` (which keeps a dated copy either way).

### Accounts
Nobody signs themselves up. An administrator invites a colleague or a guardian by email and the
system returns a **one-time activation link**, valid for seven days, which the school passes on.
The account is created only when that person opens it and chooses their own password, so no default
password ever exists and no member of staff knows anybody else's. The same mechanism resets a
password for somebody locked out, and staff added directly to the roster arrive with an unguessable
hash plus an activation link. Pupils are outside all of this: they sign in with an access code.

### Finance
A real general ledger, not a fees table with totals. A standard school chart of accounts opens with
the school; every fee billed, payment banked, bill paid and salary run posts as a balanced
double-entry journal. Entries that do not balance are refused with the difference; a posted entry is
never edited, only reversed, and both the mistake and the correction stay in the ledger so an
account statement always adds up. Financial years can be closed to freeze them. The statements
(trial balance, income and expenditure, balance sheet, budget against actual) are read straight from
the ledger rather than assembled per module, so they always agree with the day book.

### Staff leave
Teachers request leave and see their entitlement, days taken and what is still booked; only the
head of school approves. Approved leave draws down the annual allowance, and the approvals queue
flags anyone away in the next fortnight with no cover noted.

### Administration
Student & staff SIS, class rosters and timetabling, SEN register, fee invoicing with a simulated
gateway (receipts, part payments, balances), announcements, and a whole-school analytics dashboard.

**Support belongs to every pupil, SEN or not.** The student list carries a **Support** column: badges
for a pupil with a plan, *Support notes* for one with classroom notes, *Add support* for one with
nothing yet, and any of them opens the editor on the spot. It is the same editor as the pupil's own
page and the SEN register, saving to the same `PUT /api/iep/{studentId}`, so support means the same
thing wherever it was written.

**What reaches the SEN register is decided by the record, not by a second step.** A note that a pupil
sits near the front stays between classrooms. The moment the record names a need or grants an
entitlement — extra time, answering in audio or video, a scribe, rest breaks — it *is* a SEN plan and
the pupil is on the register, whether it was written on the roll, on their own page or by the SENCO.
Clear those again and they come off it, keeping the notes. One predicate (`lib/sen.js`) decides this
for the register, the roll and the dashboard counts, so the three cannot disagree. Two dropdowns above
the roll filter it: the school's own sections, and *With support recorded* / *On the SEN register*.

**Lists arrive as spreadsheets.** Pupils, staff, classes and support plans each import from CSV, with
a template to download. Every import is checked against the school first and the preview is what gets
approved — the same validation pass runs for both, so the two cannot disagree — and nothing is written
unless every row is ready, or the administrator chooses to take only the rows that are. A file dropped
into the wrong importer is recognised by its columns and named ("that looks like a support plans file,
import it from the SEN register") instead of failing row by row. Classes join sections that already
exist, pupils join classes that already exist, and an ambiguous class name reports its classrooms
rather than guessing. Staff imports return one-time activation links, shown once.

**Support arrives with the pupil.** The enrolment file takes the support columns too — `needs`,
`extra_time`, `multi_format`, `scribe`, `rest_breaks`, `review_date`, `support_notes` — so a school
that already records how a child is supported does not have to keep a second list saying it again.
Notes alone are classroom support; a need or an entitlement makes it a SEN plan, and the preview says
how many of each before anything is written. The SEN register's own importer still exists for a SENCO
working from their own list.

`sample-students-50.csv` at the repo root is one such file: 50 pupils with guardians across the year
groups, 40 of them carrying support — 10 SEN plans covering every category, 30 with classroom notes.

### Non-functional
- **RBAC across 4 tiers**, enforced per-route and per-record. A parent can only ever read data for
  a child they are a verified guardian of, and a **teacher only for pupils in classes they actually
  teach** or are homeroom teacher of. Student records carry medical notes, home addresses and
  emergency contacts, so school-wide staff read access is more than the job needs.
- **Uploads are never rendered inline.** Files are attacker-controlled bytes served from the same
  origin as the app and the session token, so `/uploads` sets `Content-Disposition: attachment`,
  `X-Content-Type-Options: nosniff` and a `sandbox` CSP. SVG is rejected outright (it is a scriptable
  document, not an image) and every upload's magic number must match its extension.
- **Rate limiting keyed by user, not IP.** A school shares one outbound address, so per-IP limits
  would throttle everyone at once. Signed-in traffic is bucketed per user (600/min); anonymous
  traffic falls back to IP (100/min); sign-in attempts stay IP-bound at 10 per 15 minutes to blunt
  credential stuffing.
- **Security headers** on every response: CSP, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`, and HSTS in production.
- **Immutable audit trail** capturing user, timestamp, previous value, new value and IP for every
  grade, fee and record change. SQLite triggers reject `UPDATE` and `DELETE` on the log, including
  from an administrator.
- Rate limiting at 100 req/min per IP, bcrypt password hashing, JWT sessions.

---

## Responsive strategy

| Viewport | Layout |
|---|---|
| **Mobile** (< 640 px) | Single column, persistent 5-item bottom nav, full-screen drawer for the rest, 48 px targets, stacked collapsible transcript |
| **Tablet** (640–1023 px) | Two columns, inline media players, collapsible side panels |
| **Desktop** (≥ 1024 px) | Three-column workspace: sidebar nav + workbench + inspector/transcript panel |

Tables become cards below `lg`; every horizontal filter rail scrolls rather than wrapping.

---

## Architecture

```
school-management-system/
├── server/                      Node 20+ · Express · SQLite (better-sqlite3) · JWT
│   ├── src/
│   │   ├── index.js             app wiring, rate limiting, static SPA serving
│   │   ├── db/
│   │   │   ├── schema.sql       50 tables + append-only audit triggers
│   │   │   ├── index.js         connection, migrate(), audit(), notify()
│   │   │   └── seed.js          full demo school
│   │   ├── lib/
│   │   │   ├── auth.js          hashing, JWT, requireRole, canAccessStudent
│   │   │   ├── catchup.js       the attendance → Catch-Up Hub engine
│   │   │   └── translate.js     inline translation (pluggable provider)
│   │   └── routes/              public (unauthenticated site + enquiries)
│   │                            website (branding, content, news, admissions inbox)
│   │                            auth · accessibility · sis · academics
│   │                            submissions · collaboration · operations
│   ├── data/school.db           created by the seed
│   └── uploads/                 submitted audio/video/diagrams
│
└── client/                      React 18 · Vite · TypeScript · Tailwind
    └── src/
        ├── context/             AuthContext · AccessibilityContext · ToastContext
        │                        BrandingContext (white-labelling)
        ├── components/          Shell (responsive nav) · AccessibilityToolbar
        │                        Readable (bionic + TTS) · Icon · ui.tsx
        ├── assets/images/       bundled site artwork, picked up automatically
        ├── lib/                 api · useFetch · format · palette · assets
        └── pages/
            ├── site/                the public website
            ├── admin/  teacher/  student/  parent/
            └── Login · Calendar · Messages
```

### Key API endpoints

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/login` | Returns JWT + role-scoped profile |
| `POST` | `/api/attendance` | **Creates Catch-Up entries as a side effect** |
| `GET` | `/api/students/{id}/catchup` → `/api/catchup` | Filterable by subject, date, status, free text |
| `POST` | `/api/assignments/{id}/submissions` | `multipart/form-data`, `submission_type: TEXT\|AUDIO\|VIDEO\|DIAGRAM_PDF` |
| `POST` | `/api/assignments/{id}/start` | Applies the IEP time multiplier server-side |
| `POST` | `/api/submissions/{id}/grade` | Grades and notifies the guardian |
| `POST` | `/api/leave/{id}/decision` | Approval tags Excused Leave across the range |
| `GET` | `/api/threads/{id}/messages?lang=fr` | Translates on read, caches the result |
| `PUT` | `/api/accessibility/prefs` | Saves the SEN toolbar preset |
| `PUT` | `/api/iep/{studentId}` | The support plan, written from the roll, the pupil or the register |
| `GET` | `/api/students?sen=true` | The roll, narrowed to the SEN register (`?support=true` for any support) |
| `POST` | `/api/students/import` | CSV, `dry_run` for the preview. Same for staff, classes and `/iep` |
| `GET` | `/api/audit` | Admin only, append-only |
| `GET` | `/api/public/site` | **No auth.** Branding + all page content in one call |
| `POST` | `/api/public/enquiries` | **No auth.** Application or enquiry, rate limited |
| `PUT` | `/api/website/settings` | Admin only. Rebrands the whole platform |
| `GET` | `/api/website/admissions` | The admissions pipeline |

---

## Going to production

The pieces deliberately stubbed for a self-contained demo, and where to swap them:

| Stub | Replace with |
|---|---|
| `lib/translate.js` offline dictionary | Set `TRANSLATE_ENDPOINT` (+ `TRANSLATE_API_KEY`) for DeepL, Google Cloud Translation, Azure Translator. The function signature does not change. |
| `queueTranscription()` in `routes/submissions.js` | Whisper, AssemblyAI or Deepgram behind the same call |
| `simulateGateway()` in `routes/operations.js` | Stripe / Paystack PaymentIntent. Receipts, statuses, audit and notifications already run off the returned reference |
| Local disk uploads | S3 / Cloudflare R2 signed URLs |

### Images

Two sources, in precedence order:

1. **A school's own upload**, added at *Website & branding, Page content*, stored in
   `server/uploads/site/`. Always wins, which is what makes the platform white-label.
2. **Bundled artwork** in `client/src/assets/images/`. Drop a file in a folder and it
   appears: `src/lib/assets.ts` globs the directory, so there is no import to write, and
   Vite fingerprints and optimises it. See the README in that folder for slot names and sizes.
3. If neither exists, a brand-coloured illustration renders, so nothing is ever an empty frame.
| SQLite | Postgres. The schema is standard SQL; swap `better-sqlite3` for `pg` |

Also required before going live: set a real `JWT_SECRET`, put the API behind TLS 1.3, enable
encryption at rest, and configure the backup schedule described in PRD §5. Set `NODE_ENV=production`
so the CSP drops `unsafe-inline`/`unsafe-eval` (both are only there for the Vite dev server) and HSTS
switches on. There is still no automated test suite; the verification described below was manual.

Copy `server/.env.example` to `server/.env` and adjust as needed.

---

## Verified against the PRD acceptance suites

Both Gherkin stories in §6 pass end to end:

- **Story 1**: marking `STU-1002` absent creates a Catch-Up Hub entry containing the subject, the
  date, and the linked video, teacher notes and summary cards; the player streams with the
  transcript searchable and captions available.
- **Story 2**: `STU-3004` submits `essay_recap.mp3`, the server validates the format, sets the
  status to `Submitted` and queues speech-to-text; starting the 60-minute quiz produces
  `60 × 1.5 = 90 minutes` and a countdown initialised at `01:30:00`.
