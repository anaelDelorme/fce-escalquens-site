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

path = "scripts/standings-integrated.mjs"
content = read(path)

old_sig = "export async function browserCollectStandings(_saved, clubNo, seasonStartYear) {"
new_sig = "export async function browserCollectStandings(_saved, clubNo, clubCode, seasonStartYear) {"
if new_sig not in content:
    if old_sig not in content:
        raise SystemExit("Signature browserCollectStandings introuvable.")
    content = content.replace(old_sig, new_sig, 1)

old_targets = '''  const targets=new Map();

  const addTarget=raw=>{
'''
new_targets = '''  const targets=new Map();
  const directTeamTargets=new Map();

  const addDirectTeamTarget=rawId=>{
    const teamId=String(rawId||'').trim();
    if(!teamId||!teamId.includes(`_${clubNo}_`))return;

    directTeamTargets.set(teamId,{
      team_fff_id:teamId,
      url:
        `${location.origin}/competition/club/`
        +`${clubCode}-f-c-escalquens/equipe/`
        +`${encodeURIComponent(teamId)}/classement`
    });
  };

  const discoverTeamsFromSavedMatches=()=>{
    for(const saved of _saved||[]){
      if(
        !String(saved?.id||'').startsWith('fce-matches-')
        ||Number(saved?.status)!==200
      )continue;

      let payload=saved.body;

      try{
        if(typeof payload==='string')payload=JSON.parse(payload);
      }catch{
        continue;
      }

      const members=
        Array.isArray(payload)
          ?payload
          :payload?.['hydra:member']
            ||payload?.items
            ||payload?.data
            ||[];

      for(const wrapper of members){
        const item=wrapper?.donneesFormatees||wrapper||{};

        for(const side of [item.recevant,item.visiteur]){
          if(String(side?.club?.clNo||'')===String(clubNo)){
            addDirectTeamTarget(side?.equipe?.id);
          }
        }
      }
    }
  };

  const addTarget=raw=>{
'''
if "const directTeamTargets=new Map();" not in content:
    if old_targets not in content:
        raise SystemExit("Point d'insertion directTeamTargets introuvable.")
    content = content.replace(old_targets, new_targets, 1)

old_discovery = '''  const discovery={
    dom:0,
    fetched:0,
    fallback:0
  };
'''
new_discovery = '''  discoverTeamsFromSavedMatches();

  const discovery={
    dom:0,
    fetched:0,
    fallback:0,
    teams:directTeamTargets.size
  };
'''
if "teams:directTeamTargets.size" not in content:
    if old_discovery not in content:
        raise SystemExit("Bloc discovery introuvable.")
    content = content.replace(old_discovery, new_discovery, 1)

insert_before = "  const append=(id,data)=>{\n"

fallback = r'''
  const parsedTeamIds=
    new Set(
      diagnostics
        .filter(item=>item.rows>0&&item.team_fff_id)
        .map(item=>String(item.team_fff_id))
    );

  for(const target of directTeamTargets.values()){
    if(parsedTeamIds.has(target.team_fff_id))continue;

    const diagnostic={
      url:target.url,
      status:0,
      rows:0,
      error:'',
      team_fff_id:target.team_fff_id,
      discovery:'team-direct'
    };

    try{
      const response=await fetch(
        target.url,
        {
          credentials:'include',
          headers:{Accept:'text/html,application/xhtml+xml'}
        }
      );

      diagnostic.status=response.status;
      const html=await response.text();

      if(!response.ok)throw new Error(`HTTP ${response.status}`);

      const doc=new DOMParser().parseFromString(html,'text/html');

      const candidates=[...doc.querySelectorAll('table')]
        .map(table=>({
          table,
          headers:[...table.querySelectorAll('thead th')]
            .map(th=>normalizeHeader(th.textContent))
        }))
        .filter(candidate=>
          candidate.headers.includes('equipe')
          &&candidate.headers.includes('pts')
        )
        .sort((a,b)=>b.headers.length-a.headers.length);

      const selected=candidates[0];

      if(!selected){
        diagnostic.error='Pas de tableau de classement';
        diagnostics.push(diagnostic);
        continue;
      }

      const headers=selected.headers;
      const teamIndex=headers.indexOf('equipe');
      const pointsIndex=headers.indexOf('pts');
      const playedIndex=headers.indexOf('j');
      const wonIndex=headers.indexOf('g');
      const drawnIndex=headers.indexOf('n');
      const lostIndex=headers.indexOf('p');
      const goalsForIndex=headers.indexOf('bp');
      const goalsAgainstIndex=headers.indexOf('bc');

      const headings=[...doc.querySelectorAll('h1,h2,h3,h4,strong')]
        .map(node=>String(node.textContent||'').replace(/\s+/g,' ').trim())
        .filter(Boolean);

      const classementHeading=
        headings.find(value=>/^classement\s+/i.test(value))
        ||'';

      const competitionName=
        classementHeading.replace(/^classement\s*/i,'').trim()
        ||`Équipe ${target.team_fff_id}`;

      const poolHeading=
        headings.find(value=>/\bpoule\s+[a-z0-9]+/i.test(value))
        ||'';

      const poolLabel=
        poolHeading.match(/\bpoule\s+[a-z0-9]+/i)?.[0]
        ||'';

      const phaseId=
        `team:${target.team_fff_id}:`
        +(normalizeHeader(competitionName)||'classement');

      const tableRows=[...selected.table.querySelectorAll('tbody tr')]
        .map((tr,index)=>{
          const cells=[...tr.querySelectorAll('td')]
            .map(td=>String(td.textContent||'').replace(/\s+/g,' ').trim());

          const teamName=cells[teamIndex]||'';
          if(!teamName)return null;

          return {
            source:'fff',
            phase_id:phaseId,
            team_fff_id:target.team_fff_id,
            category_code:'',
            team_number:'',
            competition_name:competitionName,
            pool_label:poolLabel,
            source_url:target.url,
            team_name:teamName,
            position:asNumber(cells[0])||index+1,
            played:playedIndex>=0?asNumber(cells[playedIndex]):0,
            won:wonIndex>=0?asNumber(cells[wonIndex]):0,
            drawn:drawnIndex>=0?asNumber(cells[drawnIndex]):0,
            lost:lostIndex>=0?asNumber(cells[lostIndex]):0,
            goals_for:goalsForIndex>=0?asNumber(cells[goalsForIndex]):0,
            goals_against:goalsAgainstIndex>=0?asNumber(cells[goalsAgainstIndex]):0,
            points:pointsIndex>=0?asNumber(cells[pointsIndex]):0,
            raw_json:{headers,cells,discovery:'team-direct'}
          };
        })
        .filter(Boolean);

      if(!tableRows.some(row=>/escalquens/i.test(row.team_name))){
        diagnostic.error='FC Escalquens absent';
      }else{
        diagnostic.rows=tableRows.length;
        rows.push(...tableRows);
        parsedTeamIds.add(target.team_fff_id);
      }
    }catch(error){
      diagnostic.error=String(error?.message||error);
    }

    diagnostics.push(diagnostic);
  }


'''

if "discovery:'team-direct'" not in content:
    if insert_before not in content:
        raise SystemExit("Point d'insertion fallback direct introuvable.")
    content = content.replace(insert_before, fallback + insert_before, 1)

write(path, content)

path = "scripts/sync-matches.mjs"
content = read(path)

old_version = "const SYNC_VERSION='2026.09.22-staging-27',CLUB_NO='101544',CLUB_CODE='550350',DISTRICT_NO='86';"
new_version = "const SYNC_VERSION='2026.09.30-standings-28',CLUB_NO='101544',CLUB_CODE='550350',DISTRICT_NO='86';"
if old_version in content:
    content = content.replace(old_version, new_version, 1)
elif new_version not in content:
    raise SystemExit("Version du collecteur introuvable.")

old_call = '''    await (${browserCollectStandings.toString()})(
      saved,
      '${CLUB_NO}',
      ${Number(targetUrls.seasonYear)}
    );
'''
new_call = '''    await (${browserCollectStandings.toString()})(
      saved,
      '${CLUB_NO}',
      '${CLUB_CODE}',
      ${Number(targetUrls.seasonYear)}
    );
'''
if new_call not in content:
    if old_call not in content:
        raise SystemExit("Appel browserCollectStandings introuvable.")
    content = content.replace(old_call, new_call, 1)

old_log = '''      `FFF : découverte classements — DOM=${Number(discovery.dom||0)}, `+
      `HTML=${Number(discovery.fetched||0)}, `+
      `fallback=${Number(discovery.fallback||0)}.`
'''
new_log = '''      `FFF : découverte classements — DOM=${Number(discovery.dom||0)}, `+
      `HTML=${Number(discovery.fetched||0)}, `+
      `fallback=${Number(discovery.fallback||0)}, `+
      `équipes=${Number(discovery.teams||0)}.`
'''
if new_log not in content:
    if old_log not in content:
        raise SystemExit("Log découverte classements introuvable.")
    content = content.replace(old_log, new_log, 1)

write(path, content)

print("Correctif classements FFF appliqué :")
for item in changed:
    print(" -", item)
print("\\nEnsuite :")
print("  node --check scripts/standings-integrated.mjs")
print("  node --check scripts/sync-matches.mjs")
print("  npm run build")
print("Puis lancer manuellement la synchro en préproduction.")
