-- The existing price remains the FCE price. Reference/coach prices are optional per variant.
ALTER TABLE shop_variants ADD COLUMN catalogue_price_cents INTEGER CHECK(catalogue_price_cents IS NULL OR catalogue_price_cents BETWEEN 1 AND 1000000);
ALTER TABLE shop_variants ADD COLUMN coach_price_cents INTEGER CHECK(coach_price_cents IS NULL OR coach_price_cents BETWEEN 1 AND 1000000);
