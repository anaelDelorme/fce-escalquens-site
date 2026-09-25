#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path.cwd()

def read(path):
    p = ROOT / path
    if not p.exists():
        raise SystemExit(f"Fichier introuvable : {path}. Lancez ce script depuis la racine du dépôt.")
    return p.read_text(encoding="utf-8")

def write(path, content):
    (ROOT / path).write_text(content, encoding="utf-8")

def replace_once(content, old, new, label):
    if new in content:
        return content, False
    if old not in content:
        raise SystemExit(f"Motif introuvable pour {label}. Le dépôt a peut-être évolué.")
    return content.replace(old, new, 1), True

changed = []

# 1) Lien "Nous rejoindre" visible dans le menu mobile.
path = "src/components/Header.astro"
content = read(path)
if 'class="mobile-join"' not in content:
    old = '<nav aria-label="Navigation principale">{nav.map(([label,href])=><a href={href} aria-current={isCurrent(href)?\'page\':undefined}>{label}</a>)}</nav>'
    new = '<nav aria-label="Navigation principale">{nav.map(([label,href])=><a href={href} aria-current={isCurrent(href)?\'page\':undefined}>{label}</a>)}<a class="mobile-join" href="/nous-rejoindre/" aria-current={isCurrent(\'/nous-rejoindre/\')?\'page\':undefined}>Nous rejoindre</a></nav>'
    content, _ = replace_once(content, old, new, "navigation mobile")

    old = '.site-header nav a[aria-current="page"]{font-weight:900;text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:6px}'
    new = '''.site-header nav a[aria-current="page"]{font-weight:900;text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:6px}.site-header nav .mobile-join{display:none}
@media(max-width:1080px){.site-header nav .mobile-join{display:block;margin-top:12px;padding:14px 15px;border-bottom:0;background:var(--gold);color:#21171b;font-weight:900}.site-header nav .mobile-join:after{color:#21171b}}'''
    content, _ = replace_once(content, old, new, "style du lien mobile")
    write(path, content)
    changed.append(path)

# 2) Charger le style partenaires sur l'accueil.
path = "src/pages/index.astro"
content = read(path)
if 'href="/sponsor-extra.css"' not in content:
    old = '<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/enhancements.css?v=6"><link rel="stylesheet" href="/brand-charter.css"><link rel="stylesheet" href="/home-extra.css"><link rel="stylesheet" href="/home-slideshow.css">'
    new = old + '<link rel="stylesheet" href="/sponsor-extra.css">'
    content, _ = replace_once(content, old, new, "stylesheet partenaires accueil")
    write(path, content)
    changed.append(path)

# 3) Bouton rapide Afficher/Masquer dans l'admin boutique.
path = "public/admin.js"
content = read(path)
if "data-shop-visibility" not in content:
    old = "let current='teams',editing=null,editingRow={},token=sessionStorage.getItem('admin-token')||'',references={teams:[],club_members:[],venues:[],competition_levels:[],seasons:[],tournaments:[],team_competitions:[],shop_categories:[]},referencesLoaded=false;"
    new = "let current='teams',editing=null,editingRow={},token=sessionStorage.getItem('admin-token')||'',references={teams:[],club_members:[],venues:[],competition_levels:[],seasons:[],tournaments:[],team_competitions:[],shop_categories:[]},referencesLoaded=false,loadedRows=[];"
    content, _ = replace_once(content, old, new, "cache des lignes admin")

    marker = "  const help={"
    if "  loadedRows=response.ok&&Array.isArray(rows)?rows:[];\n" not in content:
        if marker not in content:
            raise SystemExit("Motif introuvable pour la liste admin.")
        content = content.replace(marker, "  loadedRows=response.ok&&Array.isArray(rows)?rows:[];\n" + marker, 1)

    render_pattern = re.compile(r"  \$\('#records'\)\.innerHTML=response\.ok\?rows\.map\(row=>\{[^\n]+\n")
    match = render_pattern.search(content)
    if not match:
        raise SystemExit("Motif introuvable pour le rendu des lignes admin.")
    render = '''  $('#records').innerHTML=response.ok?rows.map(row=>{
    const automatic=current==='matches'&&row.source!=='manual';
    const protectedRow=current==='shop_settings';
    const visibilityButton=current==='shop_products'
      ?`<button class="shop-visibility ${Number(row.active)===1?'is-visible':'is-hidden'}" data-shop-visibility="${row.id}" aria-pressed="${Number(row.active)===1?'true':'false'}">${Number(row.active)===1?'Masquer':'Afficher'}</button>`
      :'';
    return `<article class="${automatic?'automatic':''}"><div><b>${esc(recordTitle(row))}</b><small>${esc(recordDetail(row))}</small>${automatic?'<em>Synchronisé automatiquement</em>':''}</div>${automatic?'':`${visibilityButton}<button data-edit='${JSON.stringify(row).replace(/'/g,'&#39;')}'>Modifier</button>${protectedRow?'':`<button data-delete="${row.id}">Supprimer</button>`}`}</article>`;
  }).join(''):'';
'''
    content = content[:match.start()] + render + content[match.end():]

    old = "  document.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>open(JSON.parse(button.dataset.edit)));\n  document.querySelectorAll('[data-delete]').forEach(button=>button.onclick=()=>remove(button.dataset.delete));"
    new = old + "\n  document.querySelectorAll('[data-shop-visibility]').forEach(button=>button.onclick=()=>toggleShopVisibility(button.dataset.shopVisibility,button));"
    content, _ = replace_once(content, old, new, "gestion du bouton visibilité")

    marker = "}\nfunction field(name,value){"
    toggle_fn = '''}
async function toggleShopVisibility(id,button){
  const row=loadedRows.find(item=>String(item.id)===String(id));
  if(!row)return;
  const next=Number(row.active)===1?0:1;
  if(next===1&&!String(row.image_key||'').trim()){
    $('#status').textContent='Ajoutez une photo à cet article avant de le rendre visible.';
    return;
  }
  const idleLabel=button.textContent;
  button.disabled=true;
  button.textContent=next===1?'Affichage…':'Masquage…';
  try{
    const response=await fetch(`/admin-api/shop_products/${id}`,{
      method:'PUT',
      headers:jsonHeaders(),
      body:JSON.stringify({...row,active:next})
    });
    let result={};
    try{result=await response.json()}catch{}
    if(!response.ok)throw new Error(
      response.status===401
        ?'Votre session Cloudflare a expiré. Rechargez la page.'
        :result.error||'Modification impossible.'
    );
    await load();
    $('#status').textContent=next===1
      ?`« ${row.name||'Article'} » est maintenant visible dans la boutique.`
      :`« ${row.name||'Article'} » est maintenant masqué de la boutique.`;
  }catch(error){
    $('#status').textContent=error.message||'Modification impossible.';
    button.disabled=false;
    button.textContent=idleLabel;
  }
}
function field(name,value){'''
    content, _ = replace_once(content, marker, toggle_fn, "fonction visibilité boutique")

    write(path, content)
    changed.append(path)

# 4) Style du bouton rapide admin.
path = "public/admin.css"
content = read(path)
if ".shop-visibility" not in content:
    content += '''
#records article .shop-visibility{font-weight:900;border:1px solid var(--wine)}
#records article .shop-visibility.is-visible{background:#fff1a8;color:var(--wine)}
#records article .shop-visibility.is-hidden{background:var(--wine);color:#fff}
#records article .shop-visibility:disabled{opacity:.55;cursor:wait}
'''
    write(path, content)
    changed.append(path)

# 5) Hiérarchie visuelle des partenaires.
path = "public/sponsors.js"
content = r'''const sponsorsEsc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const sponsorSafeUrl=value=>{try{const url=new URL(value,location.origin);return ['http:','https:'].includes(url.protocol)?url.href:'';}catch{return '';}};
const sponsorsRoot=document.querySelector('#sponsors-list');
const sponsorTierLabels={majeur:'Partenaire majeur',premium:'Partenaire premium',partenaire:'Partenaire',soutien:'Soutien'};
const sponsorCard=sponsor=>{
  const tier=String(sponsor.tier||'partenaire').toLowerCase();
  const label=sponsorTierLabels[tier]||'Partenaire';
  const logo=sponsor.logo_key
    ?`<img src="/media/${encodeURIComponent(sponsor.logo_key).replace(/%2F/g,'/')}" alt="${sponsorsEsc(sponsor.name)}" loading="lazy">`
    :`<b>${sponsorsEsc(sponsor.name)}</b>`;
  const cardContent=`<span class="sponsor-card__logo">${logo}</span><small>${sponsorsEsc(label)}</small>`;
  const url=sponsor.website_url?sponsorSafeUrl(sponsor.website_url):'';
  return url
    ?`<a class="sponsor-card" href="${sponsorsEsc(url)}" target="_blank" rel="noopener" title="${sponsorsEsc(sponsor.name)}">${cardContent}</a>`
    :`<div class="sponsor-card" title="${sponsorsEsc(sponsor.name)}">${cardContent}</div>`;
};
const sponsorSection=(key,title,items)=>items.length
  ?`<section class="sponsor-tier sponsor-tier--${key}"><div class="sponsor-tier__heading"><h3>${title}</h3><span>${items.length}</span></div><div class="sponsor-tier__grid">${items.map(sponsorCard).join('')}</div></section>`
  :'';
if(sponsorsRoot)Promise.resolve(window.fceHomeData||window.fceMecenatData||fetch('/api/page/mecenat').then(response=>response.json())).then(data=>{
  const sponsors=(data.sponsors||[]).map((sponsor,index)=>({...sponsor,_index:index}));
  const rank={majeur:0,premium:1,partenaire:2,soutien:3};
  sponsors.sort((a,b)=>(rank[String(a.tier||'partenaire').toLowerCase()]??4)-(rank[String(b.tier||'partenaire').toLowerCase()]??4)||a._index-b._index);
  const majors=sponsors.filter(sponsor=>String(sponsor.tier||'').toLowerCase()==='majeur');
  const premiums=sponsors.filter(sponsor=>String(sponsor.tier||'').toLowerCase()==='premium');
  const partners=sponsors.filter(sponsor=>!['majeur','premium'].includes(String(sponsor.tier||'').toLowerCase()));
  sponsorsRoot.innerHTML=[
    sponsorSection('major','Partenaires majeurs',majors),
    sponsorSection('premium','Partenaires premium',premiums),
    sponsorSection('partner','Partenaires',partners)
  ].join('')||'<p>Les partenaires seront bientôt présentés ici.</p>';
}).catch(()=>{sponsorsRoot.innerHTML='<p>Les partenaires seront bientôt présentés ici.</p>'});
'''
write(path, content)
changed.append(path)

path = "public/sponsor-extra.css"
content = r'''.sponsor-logos{display:grid;gap:32px;margin-top:30px}
.sponsor-tier{display:grid;gap:14px}
.sponsor-tier__heading{display:flex;align-items:center;gap:12px}
.sponsor-tier__heading h3{margin:0;color:var(--wine);font-size:14px;text-transform:uppercase;letter-spacing:.08em}
.sponsor-tier__heading span{display:grid;place-items:center;min-width:28px;height:28px;border-radius:999px;background:#eee5dc;color:var(--wine);font-size:10px;font-weight:900}
.sponsor-tier__heading:after{content:'';height:1px;flex:1;background:var(--line)}
.sponsor-tier__grid{display:grid;gap:14px}
.sponsor-tier--major .sponsor-tier__grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.sponsor-tier--premium .sponsor-tier__grid{grid-template-columns:repeat(3,minmax(0,1fr))}
.sponsor-tier--partner .sponsor-tier__grid{grid-template-columns:repeat(4,minmax(0,1fr))}
.sponsor-card{min-width:0;min-height:120px;border:1px solid var(--line);border-radius:14px;display:grid;grid-template-rows:1fr auto;place-items:center;gap:12px;padding:18px;background:#fff;text-align:center}
.sponsor-card__logo{width:100%;display:grid;place-items:center;min-height:72px}
.sponsor-card img{width:100%;height:70px;object-fit:contain}
.sponsor-card b{font-size:16px;color:var(--ink)}
.sponsor-card small{color:var(--wine);font-weight:900;text-transform:uppercase;font-size:9px;letter-spacing:.06em}
.sponsor-tier--major .sponsor-card{min-height:190px;padding:24px;border-top:6px solid var(--gold);background:linear-gradient(145deg,#fff,#fff9e7)}
.sponsor-tier--major .sponsor-card__logo{min-height:110px}
.sponsor-tier--major .sponsor-card img{height:105px}
.sponsor-tier--major .sponsor-card b{font-size:21px}
.sponsor-tier--premium .sponsor-card{min-height:145px;border-top:4px solid var(--wine)}
.sponsor-tier--premium .sponsor-card img{height:82px}
.sponsor-card:hover{transform:translateY(-2px);box-shadow:0 13px 28px rgba(41,25,20,.075)}
@media(max-width:760px){
  .sponsor-logos{gap:26px;margin-top:24px}
  .sponsor-tier--major .sponsor-tier__grid{grid-template-columns:1fr}
  .sponsor-tier--premium .sponsor-tier__grid,.sponsor-tier--partner .sponsor-tier__grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .sponsor-tier--major .sponsor-card{min-height:155px;padding:20px}
  .sponsor-tier--major .sponsor-card__logo{min-height:88px}
  .sponsor-tier--major .sponsor-card img{height:86px}
  .sponsor-tier--premium .sponsor-card,.sponsor-tier--partner .sponsor-card{min-height:118px;padding:13px}
  .sponsor-tier--premium .sponsor-card img,.sponsor-tier--partner .sponsor-card img{height:62px}
  .sponsor-tier__heading h3{font-size:12px}
}
'''
write(path, content)
changed.append(path)

print("Modifications appliquées :")
for item in dict.fromkeys(changed):
    print(f" - {item}")
print("\nÀ vérifier ensuite : npm run build")