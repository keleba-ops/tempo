import type { DatabaseSync } from 'node:sqlite';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'customer')),
  email_notifications INTEGER NOT NULL DEFAULT 1,
  in_app_notifications INTEGER NOT NULL DEFAULT 1,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'United States',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  cover_image TEXT NOT NULL DEFAULT '',
  accent_color TEXT NOT NULL DEFAULT '#d16a45',
  approval_required INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 5.0,
  review_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_businesses_owner ON businesses(owner_id);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  buffer_minutes INTEGER NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  is_active INTEGER NOT NULL DEFAULT 1,
  house_call INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_services_business ON services(business_id);

CREATE TABLE IF NOT EXISTS availability_rules (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute INTEGER NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  is_active INTEGER NOT NULL DEFAULT 1,
  CHECK (end_minute > start_minute)
);
CREATE INDEX IF NOT EXISTS idx_availability_business ON availability_rules(business_id, weekday);

CREATE TABLE IF NOT EXISTS availability_exceptions (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  is_closed INTEGER NOT NULL DEFAULT 1,
  start_minute INTEGER,
  end_minute INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (business_id, date)
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  notes TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL,
  location_type TEXT NOT NULL DEFAULT 'business',
  service_address TEXT NOT NULL DEFAULT '',
  service_city TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  cancellation_reason TEXT NOT NULL DEFAULT '',
  reminder_sent_at TEXT,
  rescheduled_from TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_business_time ON bookings(business_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_time ON bookings(customer_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_live_service_slot
  ON bookings(service_id, starts_at) WHERE status IN ('pending', 'confirmed');
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_live_business_slot
  ON bookings(business_id, starts_at) WHERE status IN ('pending', 'confirmed');

CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, business_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_business ON favorites(business_id);

CREATE TABLE IF NOT EXISTS service_watchlist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, service_id)
);
CREATE INDEX IF NOT EXISTS idx_watchlist_service ON service_watchlist(service_id);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (business_id, customer_id)
);
CREATE INDEX IF NOT EXISTS idx_conversations_business ON conversations(business_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(conversation_id, read_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT NOT NULL DEFAULT '',
  business_id TEXT,
  booking_id TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  text TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'logged',
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_codes_lookup ON email_codes(email, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_outbox_user ON email_outbox(user_id, created_at DESC);
`;

export function initSchema(db: DatabaseSync): void {
  db.exec(SCHEMA_SQL);
  ensureMigrations(db);
}

function ensureMigrations(db: DatabaseSync): void {
  const migrations: { table: string; column: string; definition: string }[] = [
    { table: 'users', column: 'phone', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'users', column: 'address', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'users', column: 'must_change_password', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'users', column: 'city', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'services', column: 'house_call', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'bookings', column: 'location_type', definition: "TEXT NOT NULL DEFAULT 'business'" },
    { table: 'bookings', column: 'service_address', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'bookings', column: 'service_city', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'bookings', column: 'contact_phone', definition: "TEXT NOT NULL DEFAULT ''" },
  ];

  for (const migration of migrations) {
    const columns = db.prepare(`PRAGMA table_info(${migration.table})`).all() as unknown as { name: string }[];
    if (!columns.some((column) => column.name === migration.column)) {
      db.exec(`ALTER TABLE ${migration.table} ADD COLUMN ${migration.column} ${migration.definition}`);
    }
  }
}
