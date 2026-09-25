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
    target = ROOT / path
    target.write_text(content, encoding="utf-8")
    changed.append(path)

def replace_once(content, old, new, label):
    if new in content:
        return content, False
    if old not in content:
        raise SystemExit(f"Motif introuvable pour : {label}")
    return content.replace(old, new, 1), True


# 1) PARTENAIRES
write("public/sponsors.js", r'''const sponsorsEsc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const sponsorSafeUrl=value=>{try{const url=new URL(value,location.origin);return ['http:','https:'].includes(url.protocol)?url.href:'';}catch{return '';}};
const sponsorsRoot=document.querySelector('#sponsors-list');

const sponsorTier=value=>{
  const tier=String(value||'partenaire').toLowerCase();
  return tier==='majeur'||tier==='premium'?tier:'partenaire';
};

const sponsorCard=(sponsor,kind)=>{
  const url=sponsorSafeUrl(sponsor.website_url);
  const media=sponsor.logo_key
    ?`<img src="/media/${encodeURIComponent(sponsor.logo_key).replace(/%2F/g,'/')}" alt="${sponsorsEsc(sponsor.name)}" loading="lazy">`
    :`<strong>${sponsorsEsc(sponsor.name)}</strong>`;
  const content=`<span class="sponsor-logo-box">${media}</span>`;
  return url
    ?`<a class="sponsor-card sponsor-card--${kind}" href="${sponsorsEsc(url)}" target="_blank" rel="noopener" title="${sponsorsEsc(sponsor.name)}">${content}</a>`
    :`<div class="sponsor-card sponsor-card--${kind}" title="${sponsorsEsc(sponsor.name)}">${content}</div>`;
};

const sponsorGrid=(items,kind)=>items.length
  ?`<div class="sponsor-grid sponsor-grid--${kind}">${items.map(item=>sponsorCard(item,kind)).join('')}</div>`
  :'';

if(sponsorsRoot){
  Promise.resolve(
    window.fceHomeData
    ||window.fceMecenatData
    ||fetch('/api/page/mecenat').then(response=>response.json())
  ).then(data=>{
    const sponsors=data.sponsors||[];
    const majors=sponsors.filter(item=>sponsorTier(item.tier)==='majeur');
    const premiums=sponsors.filter(item=>sponsorTier(item.tier)==='premium');
    const partners=sponsors.filter(item=>sponsorTier(item.tier)==='partenaire');

    sponsorsRoot.innerHTML=sponsors.length?`
      ${majors.length?`
        <section class="sponsor-group sponsor-group--major">
          <div class="sponsor-group__heading">
            <h3>Nos partenaires majeurs</h3>
          </div>
          ${sponsorGrid(majors,'major')}
        </section>
      `:''}

      ${(premiums.length||partners.length)?`
        <section class="sponsor-group sponsor-group--support">
          <div class="sponsor-group__heading sponsor-group__heading--support">
            <h3>Ils nous accompagnent</h3>
          </div>

          ${premiums.length?`
            <div class="sponsor-subgroup sponsor-subgroup--premium">
              <h4>Partenaires premium</h4>
              ${sponsorGrid(premiums,'premium')}
            </div>
          `:''}

          ${partners.length?`
            <div class="sponsor-subgroup sponsor-subgroup--partner">
              <h4>Partenaires</h4>
              ${sponsorGrid(partners,'partner')}
            </div>
          `:''}
        </section>
      `:''}
    `:'<p>Les partenaires seront bientôt présentés ici.</p>';
  }).catch(()=>{
    sponsorsRoot.innerHTML='<p>Les partenaires seront bientôt présentés ici.</p>';
  });
}
''')

write("public/sponsor-extra.css", r'''.sponsor-logos{display:block;margin-top:34px}
.sponsor-group{display:grid;gap:20px}
.sponsor-group+.sponsor-group{margin-top:58px;padding-top:48px;border-top:1px solid var(--line)}
.sponsor-group__heading{display:flex;align-items:center;gap:18px}
.sponsor-group__heading h3{margin:0;color:var(--wine);font-size:clamp(25px,3vw,38px);line-height:1;text-transform:uppercase}
.sponsor-group__heading:after{content:"";height:1px;flex:1;background:var(--line)}
.sponsor-group__heading--support h3{font-size:clamp(23px,2.6vw,34px)}
.sponsor-subgroup{display:grid;gap:14px}
.sponsor-subgroup+.sponsor-subgroup{margin-top:24px}
.sponsor-subgroup h4{margin:0;color:#6e625e;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
.sponsor-grid{display:grid;align-items:stretch}
.sponsor-grid--major{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.sponsor-grid--premium{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.sponsor-grid--partner{grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.sponsor-card{min-width:0;display:grid;place-items:center;background:#fff;border:1px solid #e7ddd4;border-radius:18px;text-decoration:none;overflow:hidden;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
a.sponsor-card:hover{transform:translateY(-3px);border-color:#d9c7b9;box-shadow:0 16px 36px rgba(43,28,22,.08)}
.sponsor-logo-box{width:100%;height:100%;display:grid;place-items:center}
.sponsor-card img{display:block;width:100%;object-fit:contain}
.sponsor-card strong{color:var(--ink);text-align:center}
.sponsor-logos .sponsor-card--major{min-height:220px;padding:30px 34px;border-radius:22px;box-shadow:0 10px 30px rgba(43,28,22,.055)}
.sponsor-logos .sponsor-card--major img{height:135px}
.sponsor-logos .sponsor-card--major strong{font-size:24px}
.sponsor-logos .sponsor-card--premium{min-height:160px;padding:24px}
.sponsor-logos .sponsor-card--premium img{height:92px}
.sponsor-logos .sponsor-card--premium strong{font-size:19px}
.sponsor-logos .sponsor-card--partner{min-height:122px;padding:18px 20px;border-radius:15px}
.sponsor-logos .sponsor-card--partner img{height:65px}
.sponsor-logos .sponsor-card--partner strong{font-size:15px}

@media(max-width:900px){
  .sponsor-grid--major{gap:12px}
  .sponsor-logos .sponsor-card--major{min-height:185px;padding:24px}
  .sponsor-logos .sponsor-card--major img{height:110px}
  .sponsor-grid--partner{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media(max-width:700px){
  .sponsor-logos{margin-top:26px}
  .sponsor-group+.sponsor-group{margin-top:40px;padding-top:36px}
  .sponsor-group__heading{align-items:flex-end}
  .sponsor-group__heading h3,.sponsor-group__heading--support h3{font-size:26px}
  .sponsor-grid--major{grid-template-columns:1fr}
  .sponsor-logos .sponsor-card--major{min-height:165px;padding:22px 28px}
  .sponsor-logos .sponsor-card--major img{height:105px}
  .sponsor-grid--premium,.sponsor-grid--partner{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .sponsor-logos .sponsor-card--premium{min-height:125px;padding:16px}
  .sponsor-logos .sponsor-card--premium img{height:73px}
  .sponsor-logos .sponsor-card--partner{min-height:100px;padding:13px}
  .sponsor-logos .sponsor-card--partner img{height:54px}
}
''')

path = "src/pages/index.astro"
content = read(path)
if "/sponsor-extra.css" not in content:
    old = '<link rel="stylesheet" href="/home-extra.css"><link rel="stylesheet" href="/home-slideshow.css">'
    new = '<link rel="stylesheet" href="/home-extra.css"><link rel="stylesheet" href="/home-slideshow.css"><link rel="stylesheet" href="/sponsor-extra.css?v=2">'
    content, did = replace_once(content, old, new, "CSS partenaires accueil")
    if did:
        write(path, content)

path = "src/pages/mecenat/index.astro"
content = read(path)
if 'href="/sponsor-extra.css?v=2"' not in content:
    content = content.replace('href="/sponsor-extra.css"', 'href="/sponsor-extra.css?v=2"')
    write(path, content)


# 2) SAISON ACTIVE DANS LES API ÉQUIPES
path = "src/worker.ts"
content = read(path)

teams_old = "      t.id,t.slug,t.name,t.category,t.group_name,t.level,t.gender,t.player_count,t.photo_key,\n      CASE"
teams_new = "      t.id,t.slug,t.name,t.category,t.group_name,t.level,t.gender,t.player_count,t.photo_key,\n      (SELECT label FROM seasons WHERE active=1 ORDER BY id DESC LIMIT 1) AS season_label,\n      CASE"
if teams_new not in content:
    content, _ = replace_once(content, teams_old, teams_new, "saison active liste équipes")

profile_old = "      t.id,t.slug,t.name,t.category,t.group_name,t.level,t.gender,t.description,t.player_count,t.photo_key,\n      CASE"
profile_new = "      t.id,t.slug,t.name,t.category,t.group_name,t.level,t.gender,t.description,t.player_count,t.photo_key,\n      (SELECT label FROM seasons WHERE active=1 ORDER BY id DESC LIMIT 1) AS season_label,\n      CASE"
if profile_new not in content:
    content, _ = replace_once(content, profile_old, profile_new, "saison active fiche équipe")

write(path, content)


# 3) LISTE DES ÉQUIPES
write("public/teams.js", r'''const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let teams=[];
const root=document.querySelector('#all-teams');

const cleanTeamName=value=>String(value||'')
  .replace(/\s*\((?=[^)]*(?:19|20)\d{2})[^)]*\)\s*$/,'')
  .trim();

const displayTeamName=value=>cleanTeamName(value)
  .replace(/(U\s*\d{1,2}F?)\s*(?:-|–|—|à|À)\s*(U\s*\d{1,2}F?)/gi,'$1 – $2')
  .replace(/\s{2,}/g,' ');

const seasonEndYear=label=>{
  const years=String(label||'').match(/\d{4}/g)||[];
  const year=Number(years[years.length-1]);
  return Number.isInteger(year)?year:null;
};

const teamAgeBounds=name=>{
  const ages=[...new Set(
    [...cleanTeamName(name).matchAll(/U\s*(\d{1,2})/gi)]
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

const teamBirthYears=team=>{
  const endYear=seasonEndYear(team.season_label);
  if(!endYear)return [];
  return [...new Set(teamAgeBounds(team.name).map(age=>endYear-age))].sort((a,b)=>a-b);
};

const birthLabel=(team,years)=>{
  if(!years.length)return '';
  const feminine=team.group_name==='Féminines'||team.gender==='female';
  const born=feminine?'Nées':'Nés';
  if(years.length===1)return `${born} en ${years[0]}`;
  if(years.length===2)return `${born} en ${years[0]} · ${years[1]}`;
  return `${born} de ${years[0]} à ${years[years.length-1]}`;
};

function draw(group=''){
  const rows=teams.filter(team=>!group||team.group_name===group);
  root.innerHTML=rows.map((team,index)=>{
    const feminine=team.group_name==='Féminines'||team.gender==='female';
    const years=teamBirthYears(team);
    const name=displayTeamName(team.name);
    const yearsText=birthLabel(team,years);

    return `<a class="catalog-card tone-${index%4}" href="/equipes/fiche/?slug=${encodeURIComponent(team.slug)}">
      <div class="catalog-image"><img src="${esc(team.photo_url||'/team-default.webp')}" alt="${esc(team.photo_alt||`Photo du groupe ${name}`)}" loading="lazy" decoding="async"></div>
      <small>${esc(team.group_name)}</small>
      <h2>${esc(name)}</h2>
      ${yearsText?`<p class="catalog-birthyears">${esc(yearsText)}</p>`:''}
      <p class="catalog-level">${esc(team.level||'')}</p>
      <div class="catalog-card__footer"><span><b>${team.player_count||'—'}</b> ${feminine?'licenciées pratiquantes':'licenciés pratiquants'}</span><i>Voir la fiche →</i></div>
    </a>`;
  }).join('')||'<p>Aucune équipe dans cette section.</p>';
}

fetch('/api/page/teams?v=4').then(response=>response.json()).then(data=>{
  teams=(data.teams||[]).sort((a,b)=>String(a.name).localeCompare(String(b.name),'fr',{numeric:true,sensitivity:'base'}));
  draw();
});

document.querySelectorAll('[data-group]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-group]').forEach(item=>{
    const active=item===button;
    item.classList.toggle('active',active);
    item.setAttribute('aria-pressed',String(active));
  });
  draw(button.dataset.group);
}));
''')

path = "public/enhancements.css"
content = read(path)
if "/* Page Équipes — années de naissance */" not in content:
    content += r'''

/* Page Équipes — années de naissance */
.team-catalog{align-items:stretch}
.catalog-card{display:flex;flex-direction:column;min-width:0;height:100%}
.catalog-card h2{margin:12px 0 7px;line-height:.98;text-wrap:balance}
.catalog-birthyears{display:inline-flex;align-items:center;align-self:flex-start;width:auto;margin:2px 0 12px;padding:7px 10px;border-radius:999px;background:#f3ebe6;color:var(--wine);font-size:11px;font-weight:900;line-height:1;white-space:nowrap}
.catalog-level{min-height:20px;margin:0 0 14px;color:#5f5551;font-size:13px}
.catalog-card>.catalog-card__footer{margin-top:auto;padding-top:14px;border-top:1px solid var(--line);display:flex;gap:10px;align-items:center}
.catalog-card__footer span{min-width:0;font-size:13px}
.catalog-card__footer i{margin-left:auto;flex:0 0 auto;font-style:normal;font-weight:900;color:var(--wine);white-space:nowrap}
@media(max-width:900px){.team-catalog{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){.team-catalog{grid-template-columns:1fr}.catalog-card h2{font-size:32px}.catalog-level{min-height:0}}
'''
    write(path, content)


# 4) FICHE ÉQUIPE
path = "src/pages/equipes/fiche.astro"
content = read(path)

hero_old = '<section class="page-hero wine"><p class="eyebrow">Fiche équipe</p><h1 id="team-name" aria-live="polite">Chargement…</h1><p id="team-description"></p></section>'
hero_new = '<section class="page-hero wine"><p class="eyebrow">Fiche équipe</p><h1 id="team-name" aria-live="polite">Chargement…</h1><p id="team-birthyears" class="team-birthyears" hidden></p><p id="team-description"></p></section>'
if hero_new not in content:
    content, _ = replace_once(content, hero_old, hero_new, "années sous le titre fiche équipe")

style_old = '.staff article img{width:72px;height:72px;object-fit:cover;border-radius:50%;margin-bottom:10px}'
style_new = '.staff article img{width:72px;height:72px;object-fit:cover;border-radius:50%;margin-bottom:10px}\n      .team-birthyears{display:inline-flex;align-self:flex-start;width:max-content;margin:0 0 18px;padding:8px 12px;border-radius:999px;background:var(--gold);color:var(--wine);font-size:12px;font-weight:950;line-height:1;letter-spacing:.02em}\n      .team-birthyears[hidden]{display:none}'
if ".team-birthyears{" not in content:
    content, _ = replace_once(content, style_old, style_new, "style années fiche équipe")

content = content.replace('/team-profile.js?v=29', '/team-profile.js?v=30')
write(path, content)

path = "public/team-profile.js"
content = read(path)

helper_marker = '''const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
'''
helpers = r'''const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

const cleanTeamName=value=>String(value||'')
  .replace(/\s*\((?=[^)]*(?:19|20)\d{2})[^)]*\)\s*$/,'')
  .trim();

const displayTeamName=value=>cleanTeamName(value)
  .replace(/(U\s*\d{1,2}F?)\s*(?:-|–|—|à|À)\s*(U\s*\d{1,2}F?)/gi,'$1 – $2')
  .replace(/\s{2,}/g,' ');

const seasonEndYear=label=>{
  const years=String(label||'').match(/\d{4}/g)||[];
  const year=Number(years[years.length-1]);
  return Number.isInteger(year)?year:null;
};

const teamAgeBounds=name=>{
  const ages=[...new Set(
    [...cleanTeamName(name).matchAll(/U\s*(\d{1,2})/gi)]
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

const teamBirthYears=team=>{
  const endYear=seasonEndYear(team.season_label);
  if(!endYear)return [];
  return [...new Set(teamAgeBounds(team.name).map(age=>endYear-age))].sort((a,b)=>a-b);
};

const birthLabel=(team,years)=>{
  if(!years.length)return '';
  const feminine=team.group_name==='Féminines'||team.gender==='female';
  const born=feminine?'Nées':'Nés';
  if(years.length===1)return `${born} en ${years[0]}`;
  if(years.length===2)return `${born} en ${years[0]} · ${years[1]}`;
  return `${born} de ${years[0]} à ${years[years.length-1]}`;
};
'''
if "const teamBirthYears=team=>" not in content:
    content, _ = replace_once(content, helper_marker, helpers, "helpers années team-profile.js")

load_old = "  document.title=`${team.name} - FC Escalquens`;set('#team-name',team.name);set('#team-description',team.description);set('#player-count',team.player_count||'—');"
load_new = '''  const teamDisplayName=displayTeamName(team.name);
  const years=teamBirthYears(team);
  const yearsText=birthLabel(team,years);
  document.title=`${teamDisplayName} - FC Escalquens`;
  set('#team-name',teamDisplayName);
  set('#team-description',team.description);
  set('#player-count',team.player_count||'—');
  const birthNode=document.querySelector('#team-birthyears');
  if(birthNode){
    birthNode.textContent=yearsText;
    birthNode.hidden=!yearsText;
  }'''
if load_new not in content:
    content, _ = replace_once(content, load_old, load_new, "affichage années fiche équipe")

content = content.replace("&v=26", "&v=27")
write(path, content)

print("Correctif appliqué :")
for item in dict.fromkeys(changed):
    print(f" - {item}")
print("\\nEnsuite : npm run build")