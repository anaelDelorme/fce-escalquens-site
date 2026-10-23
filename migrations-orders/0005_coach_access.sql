-- Shared coach code: hash only; rotation invalidates every existing coach session.
CREATE TABLE coach_access(id INTEGER PRIMARY KEY CHECK(id=1),code_hash TEXT NOT NULL DEFAULT '',version TEXT NOT NULL DEFAULT '',enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),updated_at INTEGER NOT NULL DEFAULT 0);
INSERT INTO coach_access(id) VALUES(1);
