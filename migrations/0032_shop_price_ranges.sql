-- Synchroniser les anciens libellés avec les tarifs réellement configurés.
UPDATE shop_products SET price_label=(
 SELECT CASE WHEN MIN(price_cents)<>MAX(price_cents)
 THEN 'De '||REPLACE(printf('%.2f €',MIN(price_cents)/100.0),'.',',')||' à '||REPLACE(printf('%.2f €',MAX(price_cents)/100.0),'.',',')
 ELSE REPLACE(printf('%.2f €',MIN(price_cents)/100.0),'.',',') END
 FROM shop_variants WHERE product_id=shop_products.id AND active=1
) WHERE EXISTS(SELECT 1 FROM shop_variants WHERE product_id=shop_products.id AND active=1);
