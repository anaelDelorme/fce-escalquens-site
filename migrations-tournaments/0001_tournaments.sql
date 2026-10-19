-- Appliquer uniquement sur TOURNAMENTS. Cette base est distincte de DB et ORDERS.
PRAGMA foreign_keys=ON;
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 0);
INSERT INTO settings(id) VALUES(1);
CREATE TABLE orders (
 id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE,
 request_hash TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, token_version INTEGER NOT NULL DEFAULT 1,
 token_expires INTEGER NOT NULL,
 email TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, phone TEXT NOT NULL,
 licensed_name TEXT NOT NULL DEFAULT '', team TEXT NOT NULL DEFAULT '',
 delivery_method TEXT NOT NULL CHECK(delivery_method IN ('coach','club')),
 total_cents INTEGER NOT NULL CHECK(total_cents>0),
 payment_status TEXT NOT NULL DEFAULT 'pending', fulfillment TEXT NOT NULL DEFAULT 'new',
 public_note TEXT NOT NULL DEFAULT '', internal_note TEXT NOT NULL DEFAULT '',
 terms_version TEXT NOT NULL, terms_snapshot TEXT NOT NULL, terms_accepted_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, paid_at INTEGER, closed_at INTEGER,
 version INTEGER NOT NULL DEFAULT 0, last_checked INTEGER NOT NULL DEFAULT 0,
 reconcile_after INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX orders_created ON orders(created_at DESC);
CREATE INDEX orders_reconcile ON orders(reconcile_after);
CREATE TABLE order_items (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 product_id INTEGER NOT NULL, variant_id TEXT NOT NULL, name TEXT NOT NULL,
 sku TEXT NOT NULL, supplier TEXT NOT NULL, size TEXT NOT NULL, color TEXT NOT NULL,
 options_json TEXT NOT NULL, unit_cents INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 30),
 received INTEGER NOT NULL DEFAULT 0, delivered INTEGER NOT NULL DEFAULT 0,
 CHECK(received BETWEEN 0 AND quantity), CHECK(delivered BETWEEN 0 AND received)
);
CREATE INDEX order_items_order ON order_items(order_id);
CREATE TABLE checkout_attempts (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 intent_id INTEGER UNIQUE, provider_order_id INTEGER, state TEXT NOT NULL DEFAULT 'creating',
 redirect_url TEXT, created_at INTEGER NOT NULL, last_error TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX one_active_checkout ON checkout_attempts(order_id) WHERE state IN ('creating','pending','uncertain');
CREATE TABLE payments (
 id INTEGER PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 attempt_id TEXT NOT NULL REFERENCES checkout_attempts(id), state TEXT NOT NULL,
 amount_cents INTEGER NOT NULL, refunded_cents INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
);
CREATE TABLE order_events (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 kind TEXT NOT NULL, actor TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX order_events_order ON order_events(order_id,created_at);
CREATE TABLE outbox (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
 available_at INTEGER NOT NULL, locked_until INTEGER NOT NULL DEFAULT 0,
 last_error TEXT NOT NULL DEFAULT '', sent_at INTEGER, provider_id TEXT
);
CREATE INDEX outbox_pending ON outbox(status,available_at);
CREATE TABLE surveys (
 order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
 ease INTEGER NOT NULL CHECK(ease BETWEEN 1 AND 5),
 catalogue INTEGER NOT NULL CHECK(catalogue BETWEEN 1 AND 5),
 overall INTEGER NOT NULL CHECK(overall BETWEEN 1 AND 5),
 comment TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE settings_events (id TEXT PRIMARY KEY, actor TEXT NOT NULL, created_at INTEGER NOT NULL);

-- Habilitations boutique indépendantes des administrateurs du site.
-- Aucune copie automatique depuis DB.admins : aucun droit implicite.
CREATE TABLE shop_admins (
 email TEXT PRIMARY KEY COLLATE NOCASE,
 name TEXT NOT NULL DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);

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

CREATE TABLE tournaments(id INTEGER PRIMARY KEY AUTOINCREMENT,slug TEXT NOT NULL UNIQUE,name TEXT NOT NULL,summary TEXT NOT NULL DEFAULT '',starts_on TEXT NOT NULL,ends_on TEXT,venue TEXT NOT NULL DEFAULT '',categories TEXT NOT NULL DEFAULT '[]',registration_url TEXT,rules_key TEXT,status TEXT NOT NULL DEFAULT 'draft',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,season_id INTEGER,venue_id INTEGER,tournify_url TEXT NOT NULL DEFAULT '',organizer TEXT NOT NULL DEFAULT '',registration_price TEXT NOT NULL DEFAULT '',image_key TEXT NOT NULL DEFAULT '',poster_key TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE tournament_teams(id INTEGER PRIMARY KEY AUTOINCREMENT,tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,team_id INTEGER NOT NULL,notes TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(tournament_id,team_id));
-- Event presentation remains in DB. Registrations and payments live in ORDERS.
CREATE TABLE tournament_sales (
 tournament_id INTEGER PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 fee_cents INTEGER NOT NULL CHECK(fee_cents BETWEEN 1 AND 1000000),
 allow_pay_later INTEGER NOT NULL DEFAULT 1 CHECK(allow_pay_later IN (0,1)),
 capacity INTEGER NOT NULL DEFAULT 0 CHECK(capacity BETWEEN 0 AND 10000),
 registration_deadline INTEGER NOT NULL DEFAULT 0,
 payment_deadline INTEGER NOT NULL DEFAULT 0,
 terms TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE tournament_sales ADD COLUMN form_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE tournament_registrations ADD COLUMN answers_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE tournament_registrations ADD COLUMN form_snapshot TEXT NOT NULL DEFAULT '[]';
CREATE TABLE module_imports(id TEXT PRIMARY KEY,imported_at INTEGER NOT NULL);
