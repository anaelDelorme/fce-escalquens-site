#!/usr/bin/env python3
from pathlib import Path

ROOT=Path.cwd()
changed=[]

def read(path):
    p=ROOT/path
    if not p.exists():
        raise SystemExit(f"Fichier introuvable : {path}")
    return p.read_text(encoding="utf-8")

def write(path,content):
    (ROOT/path).write_text(content,encoding="utf-8")
    changed.append(path)

# ------------------------------------------------------------
# 1) sync-matches : exécuter les classements tôt dans la session
# ------------------------------------------------------------
path="scripts/sync-matches.mjs"
content=read(path)

content=content.replace(
    "const SYNC_VERSION='2026.10.01-standings-29',CLUB_NO='101544',CLUB_CODE='550350',DISTRICT_NO='86';",
    "const SYNC_VERSION='2026.10.01-standings-30',CLUB_NO='101544',CLUB_CODE='550350',DISTRICT_NO='86';",
    1
)

early_anchor="""    await Promise.all(targets.map(([id,src])=>fetchOne(id,src)));
    const min=Date.now()-7*86400000,max=Date.now()+45*86400000,details=new Map();
"""

early_replacement="""    await Promise.all(targets.map(([id,src])=>fetchOne(id,src)));

    // Les classements passent AVANT les nombreux détails de matchs/plateaux.
    // Ils sont ainsi disponibles même si la suite de la session navigateur
    // approche la limite de temps ZenRows.
    await (${browserCollectStandings.toString()})(
      saved,
      '${CLUB_NO}',
      '${CLUB_CODE}',
      ${Number(targetUrls.seasonYear)}
    );

    const min=Date.now()-7*86400000,max=Date.now()+45*86400000,details=new Map();
"""

if early_replacement not in content:
    if early_anchor not in content:
        raise SystemExit("Point d'insertion précoce des classements introuvable.")
    content=content.replace(early_anchor,early_replacement,1)

late_call="""    // Les classements sont lus dans cette même session navigateur :
    // aucun second appel ZenRows n'est nécessaire.
    await (${browserCollectStandings.toString()})(
      saved,
      '${CLUB_NO}',
      '${CLUB_CODE}',
      ${Number(targetUrls.seasonYear)}
    );

"""
if content.count("await (${browserCollectStandings.toString()})(")>1:
    if late_call not in content:
        raise SystemExit("Ancien appel tardif des classements introuvable.")
    content=content.replace(late_call,"",1)

# Signaler clairement l'absence de métadonnées.
old_meta="""  const standings=embeddedPayloadFromHtml(html,'fce-standings')||[];
  const standingsMeta=embeddedPayloadFromHtml(html,'fce-standings-meta')||{};
"""
new_meta="""  const standings=embeddedPayloadFromHtml(html,'fce-standings')||[];
  const standingsMetaPayload=embeddedPayloadFromHtml(html,'fce-standings-meta');
  const standingsMeta=standingsMetaPayload||{};
"""
if new_meta not in content:
    if old_meta not in content:
        raise SystemExit("Lecture standingsMeta introuvable.")
    content=content.replace(old_meta,new_meta,1)

old_return="""    falGamePayloads,
    standings,
    standingsMeta
  };
"""
new_return="""    falGamePayloads,
    standings,
    standingsMeta,
    standingsMetaPresent:Boolean(standingsMetaPayload)
  };
"""
if new_return not in content:
    if old_return not in content:
        raise SystemExit("Retour payload ZenRows introuvable.")
    content=content.replace(old_return,new_return,1)

old_log="""  console.log(`FFF : ${payloads.falGamePayloads.length} page(s) de détail de plateau ciblée(s), ${plateauGameCount} mini-match(s) trouvé(s), sans crédit ZenRows supplémentaire.`);
"""
new_log="""  console.log(`FFF : ${payloads.falGamePayloads.length} page(s) de détail de plateau ciblée(s), ${plateauGameCount} mini-match(s) trouvé(s), sans crédit ZenRows supplémentaire.`);
  if(!payloads.standingsMetaPresent){
    console.log('Warning: le collecteur classements n’a pas produit ses métadonnées dans la session ZenRows.');
  }
"""
if new_log not in content:
    if old_log not in content:
        raise SystemExit("Log plateau introuvable.")
    content=content.replace(old_log,new_log,1)

write(path,content)

# ------------------------------------------------------------
# 2) standings : ne plus attendre 2,5 s le DOM avant le fallback
# ------------------------------------------------------------
path="scripts/standings-integrated.mjs"
content=read(path)

old="""    attempt<10
    && !document.querySelector(
"""
new="""    attempt<4
    && !document.querySelector(
"""
if new not in content:
    if old not in content:
        raise SystemExit("Boucle d'attente DOM classements introuvable.")
    content=content.replace(old,new,1)

content=content.replace(
    "   * On attend au maximum 2,5 secondes, sans faire échouer",
    "   * On attend au maximum 1 seconde, sans faire échouer",
    1
)

write(path,content)

print("Correctif classements v30 appliqué :")
for item in changed:
    print(" -",item)
print("\\nÀ vérifier :")
print("  node --check scripts/standings-integrated.mjs")
print("  node --check scripts/sync-matches.mjs")
print("  npm run build")
print("Puis relancer le workflow préproduction.")
