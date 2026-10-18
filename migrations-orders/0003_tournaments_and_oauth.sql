ALTER TABLE orders ADD COLUMN kind TEXT NOT NULL DEFAULT 'shop' CHECK(kind IN ('shop','tournament'));
CREATE INDEX orders_kind_created ON orders(kind,created_at DESC);
CREATE TABLE tournament_registrations (
 order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
 tournament_id INTEGER NOT NULL,
 tournament_name TEXT NOT NULL,
 club_name TEXT NOT NULL,
 team_name TEXT NOT NULL,
 category TEXT NOT NULL,
 registration_status TEXT NOT NULL DEFAULT 'pending' CHECK(registration_status IN ('pending','accepted','cancelled','attended')),
 payment_choice TEXT NOT NULL CHECK(payment_choice IN ('now','later')),
 payment_deadline INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
);
CREATE INDEX registrations_tournament ON tournament_registrations(tournament_id,registration_status);
CREATE TABLE tournament_admins (email TEXT PRIMARY KEY COLLATE NOCASE,name TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
-- OAuth access/refresh tokens are encrypted using AES-GCM. No plaintext credentials.
CREATE TABLE helloasso_tokens (
 cache_key TEXT PRIMARY KEY,
 encrypted TEXT NOT NULL DEFAULT '',
 expires_at INTEGER NOT NULL DEFAULT 0,
 lock_id TEXT NOT NULL DEFAULT '',
 locked_until INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE orders ADD COLUMN mutation_id TEXT NOT NULL DEFAULT '';
