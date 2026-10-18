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
