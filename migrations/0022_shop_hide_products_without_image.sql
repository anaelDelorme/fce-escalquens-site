UPDATE shop_products
SET
  active=0,
  featured=0,
  highlighted=0,
  updated_at=CURRENT_TIMESTAMP
WHERE TRIM(COALESCE(image_key,''))='';
