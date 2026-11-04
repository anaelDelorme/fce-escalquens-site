-- NULL keeps the natural child/adult size order; existing prices are untouched.
ALTER TABLE shop_variants ADD COLUMN display_order INTEGER DEFAULT NULL CHECK(display_order IS NULL OR display_order BETWEEN 0 AND 100000);
