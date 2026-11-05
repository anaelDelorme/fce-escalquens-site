-- Métadonnées de retrait du suivi, sans changer le schéma des commandes/paiements.
CREATE TABLE order_archives (
 order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
 archived_at INTEGER NOT NULL,
 archived_by TEXT NOT NULL DEFAULT ''
);
