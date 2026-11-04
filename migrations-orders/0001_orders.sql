-- Appliquer uniquement sur ORDERS, jamais sur DB (site).
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
