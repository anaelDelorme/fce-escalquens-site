UPDATE teams SET group_name=CASE
  WHEN gender IN ('female','F') OR LOWER(name) LIKE '%fémin%' THEN 'Féminines'
  WHEN LOWER(slug) LIKE 'senior%' OR LOWER(slug)='loisirs' THEN 'Seniors'
  WHEN category IN ('U15','U16','U17','U18','U19') THEN 'Formation'
  ELSE 'Académie'
END;

UPDATE contacts SET category=CASE LOWER(category)
  WHEN 'école de foot' THEN 'Académie'
  WHEN 'féminines' THEN 'Féminines'
  WHEN 'mécénat' THEN 'Mécénat'
  WHEN 'club' THEN 'Club'
  ELSE category
END;

UPDATE tournaments SET categories='["Académie"]'
WHERE categories IS NULL OR categories='' OR categories='[]' OR categories LIKE '%U%';
