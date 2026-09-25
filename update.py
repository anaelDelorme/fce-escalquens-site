#!/usr/bin/env python3
from pathlib import Path

ROOT = Path.cwd()
changed = []

def read(path):
    target = ROOT / path
    if not target.exists():
        raise SystemExit(f"Fichier introuvable : {path}. Lance ce script depuis la racine du dépôt.")
    return target.read_text(encoding="utf-8")

def write(path, content):
    (ROOT / path).write_text(content, encoding="utf-8")
    changed.append(path)

def replace_once(content, old, new, label):
    if new in content:
        return content, False
    if old not in content:
        raise SystemExit(f"Motif introuvable pour : {label}")
    return content.replace(old, new, 1), True


# 1) L'accueil reçoit la saison active + le genre.
path = "src/worker.ts"
content = read(path)

old = '''      env.DB.prepare(`SELECT id,slug,name,group_name,level,category FROM teams
        WHERE active=1 ORDER BY name COLLATE NOCASE ASC`),'''

new = '''      env.DB.prepare(`SELECT
        id,slug,name,group_name,level,category,gender,
        (SELECT label FROM seasons WHERE active=1 ORDER BY id DESC LIMIT 1) AS season_label
        FROM teams
        WHERE active=1 ORDER BY name COLLATE NOCASE ASC`),'''

content, did = replace_once(
    content, old, new,
    "saison active dans /api/page/home"
)
if did:
    write(path, content)


# 2) Même logique que sur la page Équipes.
path = "public/site.js"
content = read(path)

anchor = '''const esc=value=>String(value??'').replace(/[<>"'&]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
'''

helpers = r'''const esc=value=>String(value??'').replace(/[<>"'&]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

const cleanHomeTeamName=value=>String(value||'')
  .replace(/\s*\((?=[^)]*(?:19|20)\d{2})[^)]*\)\s*$/,'')
  .trim();

const displayHomeTeamName=value=>cleanHomeTeamName(value)
  .replace(/(U\s*\d{1,2}F?)\s*(?:-|–|—|à|À)\s*(U\s*\d{1,2}F?)/gi,'$1 – $2')
  .replace(/\s{2,}/g,' ');

const homeSeasonEndYear=label=>{
  const years=String(label||'').match(/\d{4}/g)||[];
  const year=Number(years[years.length-1]);
  return Number.isInteger(year)?year:null;
};

const homeTeamAges=name=>{
  const ages=[...new Set(
    [...cleanHomeTeamName(name).matchAll(/U\s*(\d{1,2})/gi)]
      .map(match=>Number(match[1]))
      .filter(age=>Number.isInteger(age)&&age>=5&&age<=20)
  )];

  if(!ages.length)return [];

  if(ages.length===2&&Math.abs(ages[0]-ages[1])>1){
    const start=Math.min(...ages);
    const end=Math.max(...ages);
    return Array.from({length:end-start+1},(_,index)=>start+index);
  }

  return ages;
};

const homeTeamBirthYears=team=>{
  const endYear=homeSeasonEndYear(team.season_label);
  if(!endYear)return [];

  return [...new Set(
    homeTeamAges(team.name).map(age=>endYear-age)
  )].sort((a,b)=>a-b);
};

const homeTeamBirthLabel=(team,years)=>{
  if(!years.length)return '';

  const feminine=
    team.group_name==='Féminines'
    ||team.gender==='female';

  const born=feminine?'Nées':'Nés';

  if(years.length===1)return `${born} en ${years[0]}`;
  if(years.length===2)return `${born} en ${years[0]} · ${years[1]}`;

  return `${born} de ${years[0]} à ${years[years.length-1]}`;
};

const homeTeamCard=(team,index)=>{
  const name=displayHomeTeamName(team.name);
  const years=homeTeamBirthYears(team);
  const yearsText=homeTeamBirthLabel(team,years);

  return `<a class="team-card tone-${index%4}" href="/equipes/fiche/?slug=${encodeURIComponent(team.slug)}">
    <span>${esc(team.group_name)}</span>
    <b>${esc(name)}</b>
    ${yearsText?`<p class="team-card-birthyears">${esc(yearsText)}</p>`:''}
    <small class="team-card-level">${esc(team.level||team.category||'')}</small>
    <i>→</i>
  </a>`;
};
'''

if "const homeTeamBirthYears=team=>" not in content:
    content, _ = replace_once(
        content, anchor, helpers,
        "helpers des années sur l'accueil"
    )

old_render = '''  if(rail)rail.innerHTML=teams.map((team,index)=>`<a class="team-card tone-${index%4}" href="/equipes/fiche/?slug=${encodeURIComponent(team.slug)}"><span>${esc(team.group_name)}</span><b>${esc(team.name)}</b><small>${esc(team.level||team.category)}</small><i>→</i></a>`).join('');'''

new_render = '''  if(rail)rail.innerHTML=teams.map(homeTeamCard).join('');'''

content, did = replace_once(
    content, old_render, new_render,
    "rendu des cartes équipes sur l'accueil"
)

write(path, content)


# 3) Affichage plus propre dans le carrousel.
path = "public/enhancements.css"
content = read(path)

if "/* Accueil — années de naissance dans le carrousel équipes */" not in content:
    content += r'''

/* Accueil — années de naissance dans le carrousel équipes */
.team-card b{
  line-height:.96;
  text-wrap:balance;
}
.team-card-birthyears{
  width:max-content;
  max-width:100%;
  margin:9px 0 0;
  padding:6px 9px;
  border-radius:999px;
  background:#fff2;
  color:var(--gold);
  font:900 11px/1 Arial,sans-serif;
  letter-spacing:.02em;
  text-transform:none;
}
.team-card-level{
  margin-top:10px;
  font-size:10px;
  line-height:1.2;
  opacity:.92;
}
@media(max-width:600px){
  .team-card b{
    font-size:42px;
  }
  .team-card-birthyears{
    font-size:10px;
  }
}
'''
    write(path, content)


# 4) Forcer le nouveau CSS côté navigateur.
path = "src/pages/index.astro"
content = read(path)
if '/enhancements.css?v=7' not in content:
    content = content.replace('/enhancements.css?v=6', '/enhancements.css?v=7')
    write(path, content)


print("Correctif accueil appliqué :")
for item in dict.fromkeys(changed):
    print(f" - {item}")
print("\\nÀ lancer ensuite : npm run build")
