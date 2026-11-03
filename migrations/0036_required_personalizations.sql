ALTER TABLE shop_personalizations ADD COLUMN required INTEGER NOT NULL DEFAULT 0 CHECK(required IN (0,1));

-- Ecussons already attached to articles are compulsory. Keep their availability,
-- assignments and prices unchanged, and invalidate older admin edit versions.
UPDATE shop_personalizations SET required=1,version=version+1
WHERE lower(replace(replace(label,'É','e'),'é','e')) LIKE '%ecusson%';
