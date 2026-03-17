CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lead_id TEXT,
  lead_percent INTEGER NOT NULL DEFAULT 0,
  company_percent INTEGER NOT NULL DEFAULT 0,
  chat_activity INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE team_members (
  team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_updated_at TIMESTAMPTZ,
  role TEXT NOT NULL,
  team_id TEXT REFERENCES teams(id),
  subscription TEXT NOT NULL,
  theme TEXT NOT NULL,
  referral_code TEXT NOT NULL,
  referral_income_percent INTEGER NOT NULL DEFAULT 0,
  payout_boost TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'ru'
);

CREATE TABLE offers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  reward TEXT NOT NULL,
  admin_id TEXT REFERENCES users(id),
  openings INTEGER NOT NULL DEFAULT 1,
  priority TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE offer_assignments (
  offer_id TEXT REFERENCES offers(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (offer_id, user_id)
);

CREATE TABLE candidates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  offer_id TEXT REFERENCES offers(id),
  scout_id TEXT REFERENCES users(id),
  team_id TEXT REFERENCES teams(id),
  status TEXT NOT NULL,
  location TEXT,
  interview_passed BOOLEAN NOT NULL DEFAULT FALSE,
  registration_passed BOOLEAN NOT NULL DEFAULT FALSE,
  shifts_completed INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  by_user_id TEXT REFERENCES users(id),
  assignee_user_id TEXT REFERENCES users(id),
  team_id TEXT REFERENCES teams(id),
  deadline DATE,
  priority TEXT NOT NULL DEFAULT 'medium',
  done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE trainings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  role TEXT NOT NULL,
  mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE training_assignments (
  training_id TEXT REFERENCES trainings(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (training_id, user_id)
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  author_id TEXT REFERENCES users(id),
  author_name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  team_id TEXT REFERENCES teams(id),
  is_global BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE chat_participants (
  chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id),
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public_applications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  experience TEXT NOT NULL,
  languages TEXT NOT NULL,
  motivation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE notification_users (
  notification_id TEXT REFERENCES notifications(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  PRIMARY KEY (notification_id, user_id)
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);
