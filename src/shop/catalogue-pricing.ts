// Keep the stored presentation price consistent with the exact active checkout prices.
// Legacy products without configured variants retain their text until configured.
export function priceLabelStatement(db: D1Database, productId: number, onlyConfigured=false) {
  return db.prepare(`UPDATE shop_products SET price_label=COALESCE((
    SELECT CASE WHEN MIN(price_cents)<>MAX(price_cents) THEN 'De '||REPLACE(printf('%.2f €',MIN(price_cents)/100.0),'.',',')||' à '||REPLACE(printf('%.2f €',MAX(price_cents)/100.0),'.',',') ELSE REPLACE(printf('%.2f €',MIN(price_cents)/100.0),'.',',') END
    FROM shop_variants WHERE product_id=shop_products.id AND active=1 HAVING COUNT(*)>0
  ),'') WHERE id=? AND (?=0 OR EXISTS(SELECT 1 FROM shop_variants WHERE product_id=shop_products.id))`)
    .bind(productId,onlyConfigured?1:0);
}
