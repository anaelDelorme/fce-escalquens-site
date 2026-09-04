-- Supprime les anciens plateaux FAL dont l'identifiant ne contenait pas le
-- numéro de site. Leur remplaçant à quatre segments contient les participants,
-- le terrain et, lorsqu'il est publié par la FFF, le programme détaillé.

DELETE FROM matches AS legacy
WHERE legacy.source='district_fal'
  AND legacy.event_type IN ('plateau','animation')
  AND LENGTH(legacy.source_id)-LENGTH(REPLACE(legacy.source_id,':',''))=2
  AND EXISTS (
    SELECT 1
    FROM matches AS current
    WHERE current.source='district_fal'
      AND current.id<>legacy.id
      AND current.source_id LIKE legacy.source_id || ':%'
  );
