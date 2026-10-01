#!/usr/bin/env python3
from pathlib import Path

ROOT = Path.cwd()
changed = []

def read(path):
    p = ROOT / path
    if not p.exists():
        raise SystemExit(f"Fichier introuvable : {path}. Lance ce script depuis la racine du dépôt.")
    return p.read_text(encoding="utf-8")

def write(path, content):
    (ROOT / path).write_text(content, encoding="utf-8")
    changed.append(path)

# 1) Transmettre les détails de match au collecteur de classements.
path = "scripts/sync-matches.mjs"
content = read(path)

old = '''      document.body.appendChild(output);
    };

    await Promise.all(
      [...details].map(([id,paths])=>fetchBestDetail(id,paths))
    );
'''

new = '''      document.body.appendChild(output);

      // Le détail contient notamment l'identifiant FFF exact de l'équipe.
      // Le collecteur de classements le réutilise dans la même session.
      saved.push({
        id:'fce-detail-'+id,
        status:200,
        body:bestBody
      });
    };

    await Promise.all(
      [...details].map(([id,paths])=>fetchBestDetail(id,paths))
    );
'''

if new not in content:
    if old not in content:
        raise SystemExit("Bloc fetchBestDetail introuvable dans sync-matches.mjs.")
    content = content.replace(old, new, 1)

old_version = "const SYNC_VERSION='2026.09.30-standings-28',CLUB_NO='101544',CLUB_CODE='550350',DISTRICT_NO='86';"
new_version = "const SYNC_VERSION='2026.10.01-standings-29',CLUB_NO='101544',CLUB_CODE='550350',DISTRICT_NO='86';"
if old_version in content:
    content = content.replace(old_version, new_version, 1)

old_log = '''      `fallback=${Number(discovery.fallback||0)}, `+
      `équipes=${Number(discovery.teams||0)}.`
'''
new_log = '''      `fallback=${Number(discovery.fallback||0)}, `+
      `équipes=${Number(discovery.teams||0)}, `+
      `détails=${Number(discovery.details||0)}, `+
      `saison=${Number(discovery.season||0)}.`
'''
if new_log not in content:
    if old_log not in content:
        raise SystemExit("Log découverte classements introuvable.")
    content = content.replace(old_log, new_log, 1)

write(path, content)

# 2) Chercher les identifiants d'équipe dans les réponses mensuelles ET détails.
path = "scripts/standings-integrated.mjs"
content = read(path)

start = content.find("  const discoverTeamsFromSavedMatches=()=>{")
end = content.find("\n\n  const addTarget=raw=>{", start)

if start < 0 or end < 0:
    raise SystemExit("Fonction discoverTeamsFromSavedMatches introuvable.")

replacement = r'''  const discoverTeamsFromSavedMatches=()=>{
    const season=Number(seasonStartYear)||0;
    const pattern=
      season
        ?new RegExp(
            `\\b${season}_${clubNo}_[A-Z0-9]+(?:_[A-Z0-9]+)*\\b`,
            'gi'
          )
        :new RegExp(
            `\\b\\d{4}_${clubNo}_[A-Z0-9]+(?:_[A-Z0-9]+)*\\b`,
            'gi'
          );

    for(const saved of _saved||[]){
      const id=String(saved?.id||'');

      if(
        Number(saved?.status)!==200
        ||!(
          id.startsWith('fce-matches-')
          ||id.startsWith('fce-detail-')
        )
      ){
        continue;
      }

      const raw=
        typeof saved.body==='string'
          ?saved.body
          :JSON.stringify(saved.body||{});

      for(const match of raw.matchAll(pattern)){
        addDirectTeamTarget(match[0]);
      }

      let payload;

      try{
        payload=
          typeof saved.body==='string'
            ?JSON.parse(saved.body)
            :saved.body;
      }catch{
        continue;
      }

      const members=
        Array.isArray(payload)
          ?payload
          :payload?.['hydra:member']
            ||payload?.items
            ||payload?.data
            ||[payload];

      for(const wrapper of members){
        const item=
          wrapper?.donneesFormatees
          ||wrapper
          ||{};

        for(const side of [item.recevant,item.visiteur]){
          if(String(side?.club?.clNo||'')===String(clubNo)){
            addDirectTeamTarget(side?.equipe?.id);
          }
        }
      }
    }
  };'''

content = content[:start] + replacement + content[end:]

old_discovery = '''  const discovery={
    dom:0,
    fetched:0,
    fallback:0,
    teams:directTeamTargets.size
  };
'''
new_discovery = '''  const discovery={
    dom:0,
    fetched:0,
    fallback:0,
    teams:directTeamTargets.size,
    details:
      (_saved||[])
        .filter(
          item=>
            Number(item?.status)===200
            &&String(item?.id||'')
              .startsWith('fce-detail-')
        )
        .length,
    season:Number(seasonStartYear)||0
  };
'''

if old_discovery not in content:
    raise SystemExit("Bloc discovery attendu introuvable.")
content = content.replace(old_discovery, new_discovery, 1)

write(path, content)

print("Correctif classements FFF v29 appliqué :")
for item in changed:
    print(" -", item)

print("\\nVérifications :")
print("  node --check scripts/standings-integrated.mjs")
print("  node --check scripts/sync-matches.mjs")
print("  npm run build")
print("Puis relancer la synchro en préproduction.")
