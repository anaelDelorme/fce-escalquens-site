#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path.cwd()

required = [
    ROOT / "src" / "pages" / "index.astro",
    ROOT / "public" / "admin.js",
    ROOT / "src" / "worker.ts",
]
missing = [str(path.relative_to(ROOT)) for path in required if not path.exists()]
if missing:
    sys.exit(
        "Erreur : lance ce script depuis la racine du dépôt FC Escalquens.\n"
        "Fichiers introuvables : " + ", ".join(missing)
    )

def write(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")

def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f"Impossible de modifier {label} : motif introuvable.")
    return text.replace(old, new, 1)

migration = '''-- Diaporama de la page d'accueil.
-- Migration additive : aucune donnée existante n'est supprimée.

CREATE TABLE IF NOT EXISTS home_slides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_key TEXT NOT NULL DEFAULT '',
  alt_text TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_home_slides_active_order
  ON home_slides(active, display_order, id);

-- Reprend l'éventuelle photo d'accueil déjà configurée comme première diapositive.
INSERT INTO home_slides (object_key, alt_text, display_order, active)
SELECT sm.object_key,
       COALESCE(NULLIF(TRIM(sm.alt_text), ''), 'Photo du FC Escalquens'),
       10,
       1
FROM site_media sm
WHERE sm.slot = 'home_collective'
  AND TRIM(COALESCE(sm.object_key, '')) <> ''
  AND NOT EXISTS (SELECT 1 FROM home_slides)
LIMIT 1;

PRAGMA optimize;
'''
write(ROOT / "migrations" / "0014_home_slideshow.sql", migration)

home_css = r'''.home-slideshow{position:relative;isolation:isolate;background:#23171a}
.home-slideshow-stage{position:absolute;inset:0;overflow:hidden}
.home-slideshow-stage img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;transition:opacity .18s ease}
.home-slideshow-stage img.is-changing{opacity:.28}
.home-slideshow .slash,.home-slideshow>i{z-index:2}
.home-slideshow-controls{position:absolute;z-index:4;right:18px;bottom:18px;display:flex;gap:8px;align-items:center}
.home-slideshow-controls button{min-width:44px;min-height:44px;border:2px solid #fff;background:#171214e8;color:#fff;font:900 14px/1 Arial,sans-serif;display:grid;place-items:center;cursor:pointer;box-shadow:0 2px 8px #0005}
.home-slideshow-controls button:hover{background:#fff;color:#171214}
.home-slideshow-controls button:focus-visible,.home-slideshow-dots button:focus-visible{outline:3px solid #f4c400;outline-offset:3px}
.home-slideshow-controls .slide-toggle{padding:0 13px;min-width:auto}
.home-slideshow-dots{position:absolute;z-index:4;left:50%;bottom:18px;transform:translateX(-50%);display:flex;align-items:center;justify-content:center;gap:0;padding:0 5px;background:#171214b8;border-radius:999px}
.home-slideshow-dots button{position:relative;width:44px;height:44px;border:0;background:transparent;cursor:pointer;padding:0}
.home-slideshow-dots button::after{content:"";position:absolute;left:50%;top:50%;width:9px;height:9px;border-radius:50%;transform:translate(-50%,-50%);background:#fff9;border:1px solid #171214}
.home-slideshow-dots button[aria-current="true"]::after{width:13px;height:13px;background:#f4c400;border-color:#f4c400}
.home-slideshow[aria-busy="true"] .home-slideshow-controls,.home-slideshow[aria-busy="true"] .home-slideshow-dots{opacity:.72}
.home-slideshow .sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
@media(max-width:800px){
  .home-slideshow{height:clamp(280px,72vw,390px)}
  .home-slideshow-controls{right:10px;bottom:10px}
  .home-slideshow-dots{left:10px;bottom:10px;transform:none;max-width:calc(100% - 164px);overflow-x:auto;justify-content:flex-start;scrollbar-width:none}
  .home-slideshow-dots::-webkit-scrollbar{display:none}
  .home-slideshow-dots button{flex:0 0 38px;width:38px;height:44px}
}
@media(max-width:420px){
  .home-slideshow-controls .slide-toggle{padding:0 10px}
  .home-slideshow-dots{max-width:calc(100% - 150px)}
}
@media(prefers-reduced-motion:reduce){
  .home-slideshow-stage img{transition:none}
}
'''
write(ROOT / "public" / "home-slideshow.css", home_css)

home_js = r'''(()=>{
  const root=document.querySelector('#home-slideshow');
  if(!root)return;

  const image=root.querySelector('#home-slide-image');
  const controls=root.querySelector('.home-slideshow-controls');
  const dots=root.querySelector('.home-slideshow-dots');
  const previous=root.querySelector('[data-slide-prev]');
  const next=root.querySelector('[data-slide-next]');
  const toggle=root.querySelector('[data-slide-toggle]');
  const status=root.querySelector('#home-slide-status');
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const fallback={
    src:root.dataset.fallbackSrc||'/equipe-collectif.webp',
    alt:root.dataset.fallbackAlt||'Une équipe du FC Escalquens réunie avant le match'
  };

  let slides=[];
  let index=0;
  let timer=null;
  let userPaused=false;
  let pointerPaused=false;
  let focusPaused=false;
  let switching=false;

  const normalize=value=>{
    if(!slides.length)return 0;
    return (value%slides.length+slides.length)%slides.length;
  };

  const srcFor=slide=>slide?.object_key
    ?`/media/${encodeURIComponent(slide.object_key).replace(/%2F/g,'/')}`
    :fallback.src;

  const preload=source=>new Promise((resolve,reject)=>{
    const loader=new Image();
    loader.onload=()=>resolve(source);
    loader.onerror=reject;
    loader.src=source;
  });

  const clearTimer=()=>{
    if(timer){window.clearTimeout(timer);timer=null}
  };

  const autoplayAllowed=()=>slides.length>1
    && !userPaused
    && !pointerPaused
    && !focusPaused
    && !reducedMotion.matches
    && !document.hidden;

  const updateToggle=()=>{
    if(!toggle)return;
    const stopped=userPaused||reducedMotion.matches;
    toggle.hidden=slides.length<=1||reducedMotion.matches;
    toggle.setAttribute('aria-pressed',String(userPaused));
    toggle.textContent=userPaused?'Lecture':'Pause';
    toggle.setAttribute('aria-label',userPaused?'Relancer le défilement automatique':'Mettre le diaporama en pause');
    root.dataset.autoplay=stopped?'off':'on';
  };

  const schedule=()=>{
    clearTimer();
    updateToggle();
    if(!autoplayAllowed())return;
    timer=window.setTimeout(async()=>{
      await show(index+1,false);
      schedule();
    },6500);
  };

  const updateDots=()=>{
    [...dots.querySelectorAll('button')].forEach((button,buttonIndex)=>{
      const current=buttonIndex===index;
      button.setAttribute('aria-current',current?'true':'false');
      button.setAttribute('aria-label',`${current?'Photo affichée':'Afficher la photo'} ${buttonIndex+1} sur ${slides.length}`);
    });
  };

  const show=async(nextIndex,announce=true)=>{
    if(!slides.length||switching)return;
    const target=normalize(nextIndex);
    const slide=slides[target];
    const source=srcFor(slide);
    switching=true;
    root.setAttribute('aria-busy','true');
    try{
      await preload(source);
      if(!reducedMotion.matches){
        image.classList.add('is-changing');
        await new Promise(resolve=>window.setTimeout(resolve,110));
      }
      image.src=source;
      image.alt=String(slide.alt_text||fallback.alt).trim()||fallback.alt;
      index=target;
      updateDots();
      if(announce&&status)status.textContent=`Photo ${index+1} sur ${slides.length} : ${image.alt}`;
    }catch{
      const remaining=slides.filter((_,slideIndex)=>slideIndex!==target);
      if(remaining.length){
        slides=remaining;
        index=Math.min(index,slides.length-1);
        renderDots();
      }else{
        image.src=fallback.src;
        image.alt=fallback.alt;
      }
    }finally{
      image.classList.remove('is-changing');
      root.setAttribute('aria-busy','false');
      switching=false;
    }
  };

  const renderDots=()=>{
    dots.innerHTML='';
    if(slides.length<=1){
      dots.hidden=true;
      controls.hidden=true;
      updateToggle();
      return;
    }
    slides.forEach((_,slideIndex)=>{
      const button=document.createElement('button');
      button.type='button';
      button.dataset.slideIndex=String(slideIndex);
      button.addEventListener('click',async()=>{
        userPaused=true;
        clearTimer();
        await show(slideIndex,true);
        updateToggle();
      });
      dots.append(button);
    });
    dots.hidden=false;
    controls.hidden=false;
    updateDots();
    updateToggle();
  };

  previous?.addEventListener('click',async()=>{
    userPaused=true;
    clearTimer();
    await show(index-1,true);
    updateToggle();
  });

  next?.addEventListener('click',async()=>{
    userPaused=true;
    clearTimer();
    await show(index+1,true);
    updateToggle();
  });

  toggle?.addEventListener('click',()=>{
    userPaused=!userPaused;
    if(status)status.textContent=userPaused?'Diaporama en pause.':'Défilement automatique relancé.';
    schedule();
  });

  root.addEventListener('pointerenter',()=>{pointerPaused=true;clearTimer()});
  root.addEventListener('pointerleave',()=>{pointerPaused=false;schedule()});
  root.addEventListener('focusin',()=>{focusPaused=true;clearTimer()});
  root.addEventListener('focusout',event=>{
    if(root.contains(event.relatedTarget))return;
    focusPaused=false;
    schedule();
  });

  root.addEventListener('keydown',async event=>{
    if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
    event.preventDefault();
    userPaused=true;
    clearTimer();
    await show(index+(event.key==='ArrowRight'?1:-1),true);
    updateToggle();
  });

  document.addEventListener('visibilitychange',schedule);
  const onMotionChange=()=>schedule();
  if(reducedMotion.addEventListener)reducedMotion.addEventListener('change',onMotionChange);
  else reducedMotion.addListener(onMotionChange);

  const dataPromise=window.fceHomeData||fetch('/api/page/home').then(response=>response.json());
  Promise.resolve(dataPromise).then(async data=>{
    slides=(data.slides||[])
      .filter(slide=>Number(slide.active??1)!==0&&String(slide.object_key||'').trim())
      .sort((a,b)=>Number(a.display_order||0)-Number(b.display_order||0)||Number(a.id||0)-Number(b.id||0))
      .slice(0,12);

    if(!slides.length){
      root.removeAttribute('aria-busy');
      controls.hidden=true;
      dots.hidden=true;
      return;
    }

    renderDots();
    await show(0,false);
    schedule();
  }).catch(()=>{
    root.removeAttribute('aria-busy');
    controls.hidden=true;
    dots.hidden=true;
  });
})();
'''
write(ROOT / "public" / "home-slideshow.js", home_js)

index_path = ROOT / "src" / "pages" / "index.astro"
index = index_path.read_text(encoding="utf-8")

if "/home-slideshow.css" not in index:
    index = replace_once(
        index,
        '<link rel="stylesheet" href="/home-extra.css">',
        '<link rel="stylesheet" href="/home-extra.css"><link rel="stylesheet" href="/home-slideshow.css">',
        "src/pages/index.astro (CSS)"
    )

if 'id="home-slideshow"' not in index:
    old_photo = '<div class="photo"><img data-media-slot="home_collective" src="/equipe-collectif.webp" alt="Une équipe du FC Escalquens réunie en cercle avant le match"><div class="slash">LE FOOT POUR TOUS</div><i></i><i></i><i></i></div>'
    new_photo = '''<div class="photo home-slideshow" id="home-slideshow" role="region" aria-roledescription="carrousel" aria-label="Photos du FC Escalquens" aria-busy="true" tabindex="0" data-fallback-src="/equipe-collectif.webp" data-fallback-alt="Une équipe du FC Escalquens réunie en cercle avant le match">
          <div class="home-slideshow-stage"><img id="home-slide-image" src="/equipe-collectif.webp" alt="Une équipe du FC Escalquens réunie en cercle avant le match" fetchpriority="high" decoding="async"></div>
          <div class="slash">LE FOOT POUR TOUS</div><i></i><i></i><i></i>
          <div class="home-slideshow-controls" hidden>
            <button type="button" data-slide-prev aria-label="Afficher la photo précédente">←</button>
            <button type="button" class="slide-toggle" data-slide-toggle aria-pressed="false" aria-label="Mettre le diaporama en pause">Pause</button>
            <button type="button" data-slide-next aria-label="Afficher la photo suivante">→</button>
          </div>
          <div class="home-slideshow-dots" role="group" aria-label="Choisir une photo" hidden></div>
          <p class="sr-only" id="home-slide-status" aria-live="polite" aria-atomic="true"></p>
        </div>'''
    if old_photo not in index:
        pattern = re.compile(
            r'<div class="photo">\s*<img[^>]*data-media-slot="home_collective"[^>]*>\s*'
            r'<div class="slash">LE FOOT POUR TOUS</div>\s*<i></i>\s*<i></i>\s*<i></i>\s*</div>'
        )
        index, count = pattern.subn(new_photo, index, count=1)
        if count == 0:
            raise RuntimeError("Impossible de trouver la photo principale de l'accueil dans src/pages/index.astro.")
    else:
        index = index.replace(old_photo, new_photo, 1)

if "/home-slideshow.js" not in index:
    index = replace_once(
        index,
        '    <script is:inline src="/site.js"></script>',
        '    <script is:inline src="/site.js"></script>\n    <script is:inline src="/home-slideshow.js"></script>',
        "src/pages/index.astro (JS)"
    )

index_path.write_text(index, encoding="utf-8")

admin_path = ROOT / "public" / "admin.js"
admin = admin_path.read_text(encoding="utf-8")

if "home_slides:['object_key','alt_text','display_order','active']" not in admin:
    admin = replace_once(
        admin,
        "  site_media:['object_key','alt_text'],",
        "  site_media:['object_key','alt_text'],\n  home_slides:['object_key','alt_text','display_order','active'],",
        "public/admin.js (schéma)"
    )

if "home_slides:'Diaporama accueil'" not in admin:
    admin = replace_once(
        admin,
        "site_media:'Photos du site',",
        "site_media:'Photos du site',home_slides:'Diaporama accueil',",
        "public/admin.js (libellé)"
    )

if "home_slides:'Ajoutez les photos du diaporama" not in admin:
    admin = replace_once(
        admin,
        "    site_media:'Remplacez ici les principales photos éditoriales, notamment la couverture de la boutique. La nouvelle image est mise en ligne dès l’enregistrement.',",
        "    site_media:'Remplacez ici les principales photos éditoriales, notamment la couverture de la boutique. La nouvelle image est mise en ligne dès l’enregistrement.',\n    home_slides:'Ajoutez les photos du diaporama de l’accueil. Renseignez une description utile pour les lecteurs d’écran, choisissez l’ordre d’affichage (10, 20, 30…) et désactivez une photo sans la supprimer si nécessaire.',",
        "public/admin.js (aide)"
    )

if "current==='home_slides'?`Photo ${row.display_order" not in admin:
    admin = replace_once(
        admin,
        "  const recordTitle=row=>",
        "  const recordTitle=row=>current==='home_slides'?`Photo ${row.display_order??row.id}`:",
        "public/admin.js (titre diapositive)"
    )

if "current==='home_slides'?(row.alt_text" not in admin:
    admin = replace_once(
        admin,
        "  const recordDetail=row=>",
        "  const recordDetail=row=>current==='home_slides'?(row.alt_text||'Description à renseigner'):",
        "public/admin.js (détail diapositive)"
    )

admin = admin.replace(
    "(current==='site_media'&&name==='object_key')",
    "(['site_media','home_slides'].includes(current)&&name==='object_key')"
)

if "if(current==='home_slides'){" not in admin:
    marker = "  const slugify=value=>"
    validation = '''  if(current==='home_slides'){
    values.display_order=values.display_order??0;
    if(!String(values.object_key||'').trim()||!String(values.alt_text||'').trim()){
      $('#editor-status').textContent='Ajoutez une photo et une description de l’image avant d’enregistrer.';
      return;
    }
  }
'''
    if marker not in admin:
        raise RuntimeError("Impossible d'ajouter la validation du diaporama dans public/admin.js.")
    admin = admin.replace(marker, validation + marker, 1)

admin_path.write_text(admin, encoding="utf-8")

worker_path = ROOT / "src" / "worker.ts"
worker = worker_path.read_text(encoding="utf-8")

if '"home_slides"' not in worker.split("const editable",1)[0]:
    worker = replace_once(
        worker,
        '  "competition_levels", "seasons", "sponsors", "site_media",\n  "shop_categories", "shop_products", "shop_settings"',
        '  "competition_levels", "seasons", "sponsors", "site_media", "home_slides",\n  "shop_categories", "shop_products", "shop_settings"',
        "src/worker.ts (tables)"
    )

if 'home_slides: ["object_key", "alt_text", "display_order", "active"]' not in worker:
    worker = replace_once(
        worker,
        '  site_media: ["object_key", "alt_text"],',
        '  site_media: ["object_key", "alt_text"],\n  home_slides: ["object_key", "alt_text", "display_order", "active"],',
        "src/worker.ts (champs éditables)"
    )

if 'home_slides: "display_order ASC, id ASC"' not in worker:
    worker = replace_once(
        worker,
        '  site_media: "display_order ASC, id ASC",',
        '  site_media: "display_order ASC, id ASC",\n  home_slides: "display_order ASC, id ASC",',
        "src/worker.ts (ordre)"
    )

api_part = worker[worker.find("async function api"):worker.find("const resultRows")]
if 'table === "home_slides"' not in api_part:
    cache_pattern = re.compile(
        r'(?P<indent>\s*)if \(table\.startsWith\("shop_"\) \|\| table === "site_media"\) \{\n'
        r'(?P=indent)  await caches\.default\.delete\(new Request\(`\$\{url\.origin\}/api/page/shop`\)\);\n'
        r'(?P=indent)\}'
    )
    def add_home_cache(match):
        indent = match.group("indent")
        original = match.group(0)
        return original + f'\n{indent}if (table === "home_slides") {{\n{indent}  await caches.default.delete(new Request(`${{url.origin}}/api/page/home`));\n{indent}}}'
    worker, count = cache_pattern.subn(add_home_cache, worker)
    if count < 3:
        raise RuntimeError(f"Cache : {count} bloc(s) modifié(s), 3 attendus dans src/worker.ts.")

if 'const [teams, matches, results, sponsors, media, slides]' not in worker:
    worker = replace_once(
        worker,
        '    const [teams, matches, results, sponsors, media] = await env.DB.batch<AnyRow>([',
        '    const [teams, matches, results, sponsors, media, slides] = await env.DB.batch<AnyRow>([',
        "src/worker.ts (batch accueil)"
    )

if 'FROM home_slides WHERE active=1' not in worker:
    media_query = '      env.DB.prepare("SELECT slot,object_key,alt_text FROM site_media WHERE slot IN (\'home_collective\',\'home_story\')")'
    slides_query = media_query + ",\n" + \
        "      env.DB.prepare(`SELECT id,object_key,alt_text,display_order,active\n" + \
        "        FROM home_slides WHERE active=1 AND TRIM(COALESCE(object_key,''))<>''\n" + \
        "        ORDER BY display_order,id LIMIT 12`)"
    worker = replace_once(
        worker,
        media_query,
        slides_query,
        "src/worker.ts (requête diaporama)"
    )

if 'slides: resultRows(slides)' not in worker:
    worker = replace_once(
        worker,
        '    return publicJson({ teams: resultRows(teams), matches: resultRows(matches), results: resultRows(results), sponsors: resultRows(sponsors), site_media: resultRows(media) });',
        '    return publicJson({ teams: resultRows(teams), matches: resultRows(matches), results: resultRows(results), sponsors: resultRows(sponsors), site_media: resultRows(media), slides: resultRows(slides) });',
        "src/worker.ts (réponse accueil)"
    )

worker_path.write_text(worker, encoding="utf-8")

print("Diaporama accueil installé.")
print("Fichiers créés/modifiés :")
for item in [
    "migrations/0014_home_slideshow.sql",
    "public/home-slideshow.css",
    "public/home-slideshow.js",
    "public/admin.js",
    "src/pages/index.astro",
    "src/worker.ts",
]:
    print(" -", item)
print()
print("Étapes suivantes :")
print("  npm run build")
print("  git diff --check")
print("  git diff")
print("  git add . && git commit -m \"Ajoute le diaporama accessible de l'accueil\" && git push")
