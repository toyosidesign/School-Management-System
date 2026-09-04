PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────── Identity & access (RBAC, 4 tiers)
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  role          TEXT NOT NULL CHECK (role IN ('admin','teacher','student','parent')),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  phone         TEXT,
  avatar_colour TEXT DEFAULT '#2563eb',
  -- What the person likes to be called and how their avatar looks. Kept apart
  -- from first_name/last_name, which stay the legal record on registers,
  -- reports and certificates.
  preferred_name TEXT,
  avatar_emoji  TEXT,
  avatar_url    TEXT,          -- uploaded photograph, falls back to emoji then initials
  locale        TEXT NOT NULL DEFAULT 'en',
  is_senco      INTEGER NOT NULL DEFAULT 0,
  -- The person who holds the school itself: they decide who else administers
  -- it, and they alone close a financial year. Every super administrator is an
  -- administrator, so nothing else has to ask about two roles.
  is_super_admin INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A year group usually has several classes running in parallel: Primary 1 Rose,
-- Primary 1 Lily, Primary 1 Violet. The year group is (section, level); the arm
-- is `stream`, and `year_label` is what the school calls that year on paper.
-- How this school divides itself up. Schools do this very differently: Year 1
-- to 12 as one continuum, or Nursery, Primary, Junior Secondary and Senior
-- Secondary as four separate phases. The list is the school's to write, so it
-- is a table rather than a fixed set of three.
CREATE TABLE IF NOT EXISTS sections (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT NOT NULL UNIQUE,        -- stable handle stored on classes and subjects
  name       TEXT NOT NULL,               -- what the school calls it
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS classes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,          -- full display name, e.g. "Primary 1 Rose"
  year_label    TEXT,                   -- "Primary 1", shared by every arm of the year
  stream        TEXT,                   -- "Rose"; null when the year has one class
  section       TEXT NOT NULL,            -- sections.key
  level         INTEGER NOT NULL,
  academic_year TEXT NOT NULL DEFAULT '2026/2027',
  homeroom_teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  room          TEXT
);

CREATE TABLE IF NOT EXISTS students (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  student_code   TEXT NOT NULL UNIQUE,
  class_id       INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  date_of_birth  TEXT,
  gender         TEXT,
  address        TEXT,
  medical_notes  TEXT,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  enrolled_on    TEXT NOT NULL DEFAULT (date('now')),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','graduated','withdrawn'))
);

CREATE TABLE IF NOT EXISTS staff (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  staff_code   TEXT NOT NULL UNIQUE,
  title        TEXT,
  department   TEXT,
  hired_on     TEXT NOT NULL DEFAULT (date('now')),
  qualifications TEXT,
  annual_leave_days REAL NOT NULL DEFAULT 25    -- entitlement for a full leave year
);

-- Parent ↔ child links (a parent may have several children; a child several guardians)
CREATE TABLE IF NOT EXISTS guardianships (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id     INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relationship   TEXT NOT NULL DEFAULT 'Parent',
  is_primary     INTEGER NOT NULL DEFAULT 0,
  is_verified    INTEGER NOT NULL DEFAULT 1,
  UNIQUE (parent_user_id, student_id)
);

-- ─────────────────────────────────────────── Academics
CREATE TABLE IF NOT EXISTS subjects (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL,
  code    TEXT NOT NULL UNIQUE,
  -- What the subject belongs with on a curriculum sheet: Languages, Sciences,
  -- Humanities. Schools group their offer this way long before they think
  -- about which class takes it.
  category TEXT,
  section TEXT NOT NULL,                  -- sections.key
  colour  TEXT DEFAULT '#2563eb',
  icon    TEXT DEFAULT 'book',
  -- Break, lunch and the like: they take a period on the timetable but are not
  -- taught, marked or reported on, so the curriculum pages leave them out.
  is_break INTEGER NOT NULL DEFAULT 0
);

-- A subject is often taught right through the school: mathematics runs from
-- nursery to the last year. `subjects.section` holds where it starts; this
-- holds everywhere it is taught, and is what the pickers read.
CREATE TABLE IF NOT EXISTS subject_sections (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  section    TEXT NOT NULL,
  UNIQUE (subject_id, section)
);

-- Who teaches a subject at all, before any class is involved. A school knows
-- "Mrs Bello teaches Mathematics" long before it knows which classes she takes,
-- and that is what fills in a class pairing that has nobody against it.
-- What a role may do, where the school has decided differently from the
-- defaults. Only the differences are stored: a row here is the school saying
-- "our administrators may not touch fees" or "our teachers keep the register of
-- support plans". Anything not named falls back to what the code ships with.
CREATE TABLE IF NOT EXISTS role_permissions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  role       TEXT NOT NULL,               -- users.role
  permission TEXT NOT NULL,               -- a key from the catalogue in lib/permissions.js
  allowed    INTEGER NOT NULL,
  set_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  set_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (role, permission)
);

CREATE TABLE IF NOT EXISTS subject_teachers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (subject_id, user_id)
);

-- Who works in a part of the school. Where several people teach a subject, this
-- is what says which of them belongs to Nursery and which to Senior.
CREATE TABLE IF NOT EXISTS section_teachers (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL,                    -- sections.key
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (section, user_id)
);

CREATE TABLE IF NOT EXISTS class_subjects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (class_id, subject_id)
);

CREATE TABLE IF NOT EXISTS timetable_slots (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  class_subject_id INTEGER NOT NULL REFERENCES class_subjects(id) ON DELETE CASCADE,
  day_of_week      INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  period           INTEGER NOT NULL,
  start_time       TEXT NOT NULL,
  end_time         TEXT NOT NULL,
  room             TEXT
);

CREATE TABLE IF NOT EXISTS attendance (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id       INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_subject_id INTEGER NOT NULL REFERENCES class_subjects(id) ON DELETE CASCADE,
  date             TEXT NOT NULL,
  period           INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL CHECK (status IN ('present','absent','late','excused')),
  note             TEXT,
  marked_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, class_subject_id, date, period)
);

-- Lesson recaps a teacher publishes; the Catch-Up Hub links absences to these.
CREATE TABLE IF NOT EXISTS lesson_materials (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  class_subject_id INTEGER NOT NULL REFERENCES class_subjects(id) ON DELETE CASCADE,
  lesson_date      TEXT NOT NULL,
  period           INTEGER NOT NULL DEFAULT 1,
  topic            TEXT NOT NULL,
  summary          TEXT,
  teacher_notes    TEXT,
  video_url        TEXT,
  video_duration   INTEGER,
  captions_lang    TEXT DEFAULT 'en',
  transcript       TEXT,          -- JSON [{t:"00:15", text:"..."}]
  attachments      TEXT,          -- JSON [{name, type, url}]
  -- A short comprehension check so finishing a catch-up lesson means something
  -- more than pressing a button. JSON [{q, options:[], answer, explain}].
  -- The answer key is stripped before this ever reaches a pupil.
  check_questions  TEXT,
  -- A draft recap is invisible to pupils: the catch-up entry stays "pending"
  -- until a teacher is happy for it to go out.
  is_published     INTEGER NOT NULL DEFAULT 1,
  published_at     TEXT,
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (class_subject_id, lesson_date, period)
);

CREATE TABLE IF NOT EXISTS catchup_entries (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id         INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_subject_id   INTEGER NOT NULL REFERENCES class_subjects(id) ON DELETE CASCADE,
  lesson_material_id INTEGER REFERENCES lesson_materials(id) ON DELETE SET NULL,
  attendance_id      INTEGER REFERENCES attendance(id) ON DELETE CASCADE,
  lesson_date        TEXT NOT NULL,
  period             INTEGER NOT NULL DEFAULT 1,
  reason             TEXT NOT NULL DEFAULT 'absent',  -- absent | excused leave
  status             TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','completed')),
  video_position     INTEGER NOT NULL DEFAULT 0,
  -- Which parts of the lesson the pupil has worked through: JSON ["watch","read","check"]
  steps_done         TEXT NOT NULL DEFAULT '[]',
  check_score        INTEGER,
  check_total        INTEGER,
  check_attempts     INTEGER NOT NULL DEFAULT 0,
  completed_at       TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, class_subject_id, lesson_date, period)
);

CREATE TABLE IF NOT EXISTS assignments (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  class_subject_id INTEGER NOT NULL REFERENCES class_subjects(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  instructions_steps TEXT,        -- JSON [], ADHD task chunking
  -- A quiz presents these instead of a blank answer box. Same shape as a
  -- lesson check: [{q, options:[], answer, explain}]. Marked server-side, and
  -- the answer key is stripped before it reaches a pupil.
  questions        TEXT,
  due_at           TEXT NOT NULL,
  max_score        INTEGER NOT NULL DEFAULT 100,
  allow_multi_format INTEGER NOT NULL DEFAULT 1,
  base_duration_minutes INTEGER,  -- set for timed quizzes/exams
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS submissions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id   INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id      INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  submission_type TEXT NOT NULL CHECK (submission_type IN ('TEXT','AUDIO','VIDEO','DIAGRAM_PDF','QUIZ')),
  body            TEXT,
  file_name       TEXT,
  file_url        TEXT,
  file_duration   TEXT,
  transcript      TEXT,
  status          TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','late','graded','returned')),
  submitted_at    TEXT NOT NULL DEFAULT (datetime('now')),
  grade           REAL,
  feedback_type   TEXT DEFAULT 'text',
  feedback_text   TEXT,
  feedback_audio_url TEXT,
  graded_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  graded_at       TEXT,
  UNIQUE (assignment_id, student_id)
);

CREATE TABLE IF NOT EXISTS exam_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  base_minutes      INTEGER NOT NULL,
  time_multiplier   REAL NOT NULL DEFAULT 1.0,
  allowed_minutes   INTEGER NOT NULL,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  submitted_at  TEXT,
  UNIQUE (assignment_id, student_id)
);

-- ─────────────────────────────────────────── SEN / UDL engine
CREATE TABLE IF NOT EXISTS iep_profiles (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id     INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  needs          TEXT NOT NULL DEFAULT '[]',   -- JSON ["dyslexia","adhd","asc","dyscalculia","motor"]
  time_multiplier REAL NOT NULL DEFAULT 1.0,
  multi_format_approved INTEGER NOT NULL DEFAULT 0,
  scribe_allowed INTEGER NOT NULL DEFAULT 0,
  rest_breaks    INTEGER NOT NULL DEFAULT 0,
  notes          TEXT,
  review_date    TEXT,
  senco_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accessibility_prefs (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  font         TEXT NOT NULL DEFAULT 'standard',  -- standard | opendyslexic | lexend
  text_scale   INTEGER NOT NULL DEFAULT 100,
  bionic       INTEGER NOT NULL DEFAULT 0,
  tint         TEXT NOT NULL DEFAULT 'white',     -- white | blue | yellow | dark
  high_targets INTEGER NOT NULL DEFAULT 0,
  captions     INTEGER NOT NULL DEFAULT 0,
  low_sensory  INTEGER NOT NULL DEFAULT 0,
  focus_mode   INTEGER NOT NULL DEFAULT 0,
  voice_speed  REAL NOT NULL DEFAULT 1.0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────── Attendance-adjacent workflows
CREATE TABLE IF NOT EXISTS leave_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  requested_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date    TEXT NOT NULL,
  end_date      TEXT NOT NULL,
  reason        TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'other',  -- illness | family | medical | religious | other
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TEXT,
  review_note   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  event_type  TEXT NOT NULL DEFAULT 'general', -- general | exam | holiday | excursion | meeting | sports | deadline
  start_at    TEXT NOT NULL,
  end_at      TEXT,
  all_day     INTEGER NOT NULL DEFAULT 0,
  location    TEXT,
  section     TEXT,                              -- null = whole school
  class_id    INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────── Parent ↔ teacher collaboration
CREATE TABLE IF NOT EXISTS threads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  subject    TEXT NOT NULL,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS thread_participants (
  thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT,
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id  INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  source_lang TEXT NOT NULL DEFAULT 'en',
  translations TEXT NOT NULL DEFAULT '{}',   -- JSON { "fr": "...", "yo": "..." }
  attachment_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  entry_type  TEXT NOT NULL,  -- meal | nap | mood | toilet | behaviour | milestone | note
  detail      TEXT NOT NULL,
  rating      TEXT,           -- e.g. "ate all", "slept 45m", "happy"
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  logged_by   INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS permission_slips (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  event_date  TEXT,
  cost        REAL DEFAULT 0,
  class_id    INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  respond_by  TEXT NOT NULL,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS slip_responses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slip_id     INTEGER NOT NULL REFERENCES permission_slips(id) ON DELETE CASCADE,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decision    TEXT NOT NULL CHECK (decision IN ('approved','declined')),
  signature   TEXT NOT NULL,
  signed_at   TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address  TEXT,
  UNIQUE (slip_id, student_id)
);

CREATE TABLE IF NOT EXISTS teacher_feedback (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id       INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_subject_id INTEGER REFERENCES class_subjects(id) ON DELETE SET NULL,
  rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  clarity          INTEGER CHECK (clarity BETWEEN 1 AND 5),
  support          INTEGER CHECK (support BETWEEN 1 AND 5),
  comment          TEXT,
  is_anonymous     INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────── Library
CREATE TABLE IF NOT EXISTS textbooks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  author      TEXT,
  subject_id  INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  section     TEXT NOT NULL,
  cover_colour TEXT DEFAULT '#2563eb',
  description TEXT,
  total_pages INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS textbook_pages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  textbook_id INTEGER NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  heading     TEXT,
  content     TEXT NOT NULL,
  UNIQUE (textbook_id, page_number)
);

CREATE TABLE IF NOT EXISTS reading_progress (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  textbook_id INTEGER NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, textbook_id)
);

-- ─────────────────────────────────────────── Finance
CREATE TABLE IF NOT EXISTS invoices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no  TEXT NOT NULL UNIQUE,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term        TEXT NOT NULL,
  description TEXT,
  amount      REAL NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'USD',
  issued_on   TEXT NOT NULL DEFAULT (date('now')),
  due_date    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid','overdue','void')),
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  amount     REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  receipt_no  TEXT NOT NULL UNIQUE,
  amount      REAL NOT NULL,
  method      TEXT NOT NULL DEFAULT 'card',
  reference   TEXT,
  paid_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  paid_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────── Platform services
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT,
  kind       TEXT NOT NULL DEFAULT 'info',
  link       TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  audience   TEXT NOT NULL DEFAULT 'all',  -- all | teachers | parents | students | section:<name>
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Append-only: enforced by triggers below (immutable audit trail, PRD §5)
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
  user_label  TEXT,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  prev_value  TEXT,
  new_value   TEXT,
  ip_address  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
BEFORE UPDATE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;

CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
BEFORE DELETE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;

CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id, date);
CREATE INDEX IF NOT EXISTS idx_catchup_student ON catchup_entries(student_id, status);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(student_id, status);
CREATE INDEX IF NOT EXISTS idx_activity_student ON activity_logs(student_id, occurred_at);

-- ═══════════════════════════════════════════ Public website & white-labelling
-- Single-row table holding everything a school customises about its identity.
CREATE TABLE IF NOT EXISTS school_settings (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  name              TEXT NOT NULL DEFAULT 'Your School',
  short_name        TEXT NOT NULL DEFAULT 'School',
  tagline           TEXT,
  logo_url          TEXT,                  -- uploaded file, falls back to the monogram
  monogram          TEXT NOT NULL DEFAULT 'S',
  favicon_emoji     TEXT NOT NULL DEFAULT '🎓',
  favicon_url       TEXT,                  -- uploaded tab icon, takes precedence over the emoji
  brand_primary     TEXT NOT NULL DEFAULT '#2563eb',
  brand_accent      TEXT NOT NULL DEFAULT '#7c3aed',
  heading_font      TEXT NOT NULL DEFAULT 'Inter',
  established_year  TEXT,
  -- What this school calls its three phases. Schools divide the same years very
  -- differently: Year 1 to 12, Primary 1 to 6 with Junior and Senior Secondary,
  -- Early Years and Prep. The phases stay fixed underneath, the names do not.
  section_labels    TEXT,                  -- JSON {nursery, primary, secondary}
  address           TEXT,
  phone             TEXT,
  email             TEXT,
  office_hours      TEXT,
  map_embed_url     TEXT,
  facebook_url      TEXT,
  instagram_url     TEXT,
  x_url             TEXT,
  linkedin_url      TEXT,
  academic_year     TEXT NOT NULL DEFAULT '2026/2027',
  currency          TEXT NOT NULL DEFAULT 'USD',
  admissions_open   INTEGER NOT NULL DEFAULT 1,
  tours_open        INTEGER NOT NULL DEFAULT 1,
  whatsapp_number   TEXT,                  -- persistent admissions channel
  whatsapp_message  TEXT,                  -- prefilled text for the WhatsApp link
  -- An optional time-bound campaign (anniversary, appeal, capital project).
  -- Generic on purpose: any school runs these, not just one with a birthday.
  campaign_enabled  INTEGER NOT NULL DEFAULT 0,
  campaign_label    TEXT,                  -- short nav label, e.g. "20 Years"
  campaign_slug     TEXT DEFAULT 'campaign',
  campaign_target_date TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Editable content blocks for the public pages, keyed by page + slot.
CREATE TABLE IF NOT EXISTS site_content (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  page        TEXT NOT NULL,      -- home | about | academics | admissions | contact
  slot        TEXT NOT NULL,      -- hero_title | hero_body | ...
  heading     TEXT,
  body        TEXT,
  media_url   TEXT,
  extra       TEXT,               -- JSON: lists, stats, steps, cards
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_visible  INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (page, slot)
);

CREATE TABLE IF NOT EXISTS news_posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  excerpt      TEXT,
  body         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'news',
  cover_colour TEXT DEFAULT '#2563eb',
  is_published INTEGER NOT NULL DEFAULT 1,
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  author_id    INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Everything arriving from the public site lands in one reviewable inbox.
CREATE TABLE IF NOT EXISTS admissions_enquiries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL DEFAULT 'enquiry' CHECK (kind IN ('enquiry','application','tour')),
  parent_name   TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  child_name    TEXT,
  child_dob     TEXT,
  section       TEXT,                -- nursery | primary | secondary
  entry_year    TEXT,
  message       TEXT,
  sen_notes     TEXT,                -- disclosed support needs, feeds the SEN team
  status        TEXT NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','contacted','offer_made','enrolled','closed')),
  -- Whether anybody has actually read it, which is not the same as where it has
  -- got to: an enquiry can be read on the morning it arrives and still be at the
  -- new stage that afternoon.
  read_at       TEXT,
  assigned_to   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  internal_note TEXT,
  preferred_date TEXT,                    -- tour bookings
  preferred_time TEXT,
  how_heard     TEXT,
  source_page   TEXT,
  ip_address    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_enquiries_status ON admissions_enquiries(status, created_at);
CREATE INDEX IF NOT EXISTS idx_news_published ON news_posts(is_published, published_at);

-- ═══════════════════════════════════════════ Pupil access codes
-- Pupils sign in with a short code issued by the school rather than a password
-- they choose, forget and ask to reset. Nothing here is reversible: only a hash
-- is stored, exactly as for a password.
CREATE TABLE IF NOT EXISTS access_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  code_hint   TEXT NOT NULL,          -- last two characters, so staff can read one out
  issued_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at  TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_access_codes_user ON access_codes(user_id, expires_at);

-- ═══════════════════════════════════════════ Staff leave
-- Distinct from pupil absence: this is a member of staff's own entitlement,
-- drawn down across a leave year, rather than a child being marked off a
-- register. Different rules, different approvers, different consequences.
CREATE TABLE IF NOT EXISTS staff_leave (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type    TEXT NOT NULL DEFAULT 'annual'
                CHECK (leave_type IN ('annual','sick','compassionate','training','parental','unpaid')),
  start_date    TEXT NOT NULL,
  end_date      TEXT NOT NULL,
  working_days  REAL NOT NULL,
  half_day      INTEGER NOT NULL DEFAULT 0,
  reason        TEXT,
  cover_notes   TEXT,                  -- who is covering the classes
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TEXT,
  review_note   TEXT,
  leave_year    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_staff_leave_user ON staff_leave(user_id, leave_year);
CREATE INDEX IF NOT EXISTS idx_staff_leave_status ON staff_leave(status, start_date);

-- ═══════════════════════════════════════════ Account invitations
-- Nobody signs themselves up. The school invites a member of staff or a
-- guardian by email, and they open a one-time link to set their own password.
-- The account only exists once they accept, so an unaccepted invite leaves no
-- half-formed login behind. Pupils are not invited: they use access codes.
CREATE TABLE IF NOT EXISTS account_invites (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Set when the record already exists and only the sign-in is missing: a
  -- teacher added to the roster before they have ever signed in, or anyone who
  -- has lost their password. Null means the account is created on acceptance.
  user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('admin','teacher','parent')),
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  phone          TEXT,
  -- Applied when they accept, so the account arrives already in its place.
  title          TEXT,                 -- staff job title
  department     TEXT,
  student_id     INTEGER REFERENCES students(id) ON DELETE CASCADE,  -- guardian's child
  relationship   TEXT,                 -- Mother, Father, Guardian...
  message        TEXT,                 -- personal note shown on the activation page
  -- Only a hash is kept. The link is shown to the sender once and never again.
  token_hash     TEXT NOT NULL,
  token_hint     TEXT NOT NULL,
  invited_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at     TEXT NOT NULL,
  accepted_at    TEXT,
  accepted_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  revoked_at     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_invites_email ON account_invites(email);
CREATE INDEX IF NOT EXISTS idx_invites_open ON account_invites(accepted_at, revoked_at, expires_at);

-- ═══════════════════════════════════════════ Finance: the general ledger
-- Fees alone are receivables, not accounting. Everything with a monetary
-- consequence, a fee billed, a payment banked, a supplier paid, a salary run,
-- lands here as a balanced journal entry, and the reports are read from these
-- two tables rather than assembled from each module's own arithmetic.

CREATE TABLE IF NOT EXISTS financial_years (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,        -- "2026/2027"
  starts_on  TEXT NOT NULL,
  ends_on    TEXT NOT NULL,
  is_closed  INTEGER NOT NULL DEFAULT 0,  -- closed years refuse new postings
  closed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  closed_at  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,       -- 1200, 4000: sorts the reports
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  parent_id   INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  description TEXT,
  -- Accounts the software itself posts to. Named rather than hard-coded by id
  -- so a school can restructure its chart without breaking fee posting.
  role        TEXT UNIQUE,                -- receivable | bank | cash | fee_income | payable
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  reference    TEXT NOT NULL UNIQUE,      -- JV-2026-0001
  entry_date   TEXT NOT NULL,
  memo         TEXT,
  -- What caused it: a hand-written entry, or another module posting through.
  source       TEXT NOT NULL DEFAULT 'manual'
               CHECK (source IN ('manual','invoice','payment','expense','payroll','opening','reversal')),
  source_id    INTEGER,
  year_id      INTEGER REFERENCES financial_years(id) ON DELETE SET NULL,
  -- A posted entry is never edited or withdrawn. Correcting one means posting
  -- its mirror image: both stay in the ledger and cancel out, which is what
  -- makes the correction visible instead of silently rewriting the past.
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  posted_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  posted_at    TEXT,
  reverses_id  INTEGER REFERENCES journals(id) ON DELETE SET NULL,  -- set on the reversing entry
  reversed_by  INTEGER REFERENCES journals(id) ON DELETE SET NULL,  -- set on the one it corrects
  void_reason  TEXT,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_id INTEGER NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  debit      REAL NOT NULL DEFAULT 0,
  credit     REAL NOT NULL DEFAULT 0,
  memo       TEXT,
  -- Who the money is with, when that matters: a pupil's fees, a supplier's bill.
  student_id  INTEGER REFERENCES students(id) ON DELETE SET NULL,
  supplier_id INTEGER,
  CHECK (debit >= 0 AND credit >= 0),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  contact    TEXT,
  email      TEXT,
  phone      TEXT,
  address    TEXT,
  tax_id     TEXT,
  notes      TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  reference    TEXT NOT NULL UNIQUE,      -- EXP-2026-0001
  supplier_id  INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  account_id   INTEGER NOT NULL REFERENCES accounts(id),   -- what it was spent on
  paid_from_id INTEGER REFERENCES accounts(id),            -- which bank or cash account
  description  TEXT NOT NULL,
  amount       REAL NOT NULL CHECK (amount > 0),
  spent_on     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid','rejected')),
  approved_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at  TEXT,
  note         TEXT,
  receipt_url  TEXT,
  journal_id   INTEGER REFERENCES journals(id) ON DELETE SET NULL,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budgets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  year_id    INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount     REAL NOT NULL DEFAULT 0,
  note       TEXT,
  UNIQUE (year_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_journal ON journal_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_journals_date ON journals(entry_date, status);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status, spent_on);
