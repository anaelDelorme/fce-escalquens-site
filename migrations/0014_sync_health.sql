CREATE INDEX IF NOT EXISTS idx_sync_runs_source_id
ON sync_runs(source, id DESC);
