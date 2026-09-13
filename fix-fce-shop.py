#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path.cwd()
js_path = ROOT / "public" / "shop.js"
css_path = ROOT / "public" / "shop.css"

if not js_path.exists() or not css_path.exists():
    sys.exit("Erreur : lance ce script depuis la racine du dépôt (public/shop.js introuvable).")

js = js_path.read_text(encoding="utf-8")
css = css_path.read_text(encoding="utf-8")

# 1) Ajoute la fonction de préchargement si elle n'existe pas déjà.
if "const revealShopHero=" not in js:
    marker = "async function loadShop(){"
    if marker not in js:
        sys.exit("Erreur : impossible de trouver 'async function loadShop(){' dans public/shop.js.")
    helper = """const revealShopHero=media=>{
  const hero=document.querySelector('#shop-hero-image');
  if(!hero)return;
  const fallback=hero.dataset.fallbackSrc||'/hero-foot.webp';
  const custom=media?.object_key?`/media/${encodeURIComponent(media.object_key).replace(/%2F/g,'/')}`:'';
  const source=custom||fallback;
  if(media?.alt_text)hero.alt=media.alt_text;
  const load=(candidate,allowFallback)=>{
    const loader=new Image();
    loader.onload=()=>{hero.src=candidate;hero.classList.add('is-ready')};
    loader.onerror=()=>{if(allowFallback&&candidate!==fallback)load(fallback,false)};
    loader.src=candidate;
  };
  load(source,true);
};
"""
    js = js.replace(marker, helper + marker, 1)

# 2) Remplace l'ancien bloc heroMedia, même si l'indentation diffère légèrement.
old_block = re.compile(
    r"""(?P<indent>[ \t]*)if\s*\(\s*heroMedia\s*\)\s*\{\s*
[ \t]*const hero=document\.querySelector\('#shop-hero-image'\);\s*
[ \t]*if\s*\(\s*heroMedia\.alt_text\s*\)\s*hero\.alt=heroMedia\.alt_text;\s*
[ \t]*if\s*\(\s*hero\s*&&\s*heroMedia\.object_key\s*\)\s*\{\s*
[ \t]*const source=`/media/\$\{encodeURIComponent\(heroMedia\.object_key\)\.replace\(/%2F/g,'/'\)\}`,loader=new Image\(\);\s*
[ \t]*loader\.onload=\(\)=>\{hero\.src=source\};\s*
[ \t]*loader\.src=source;\s*
[ \t]*\}\s*
[ \t]*\}""",
    re.VERBOSE
)

if "revealShopHero(heroMedia);" not in js:
    js, count = old_block.subn(lambda m: m.group("indent") + "revealShopHero(heroMedia);", js, count=1)
    if count == 0:
        # Variante plus tolérante : remplace tout le bloc situé juste après const heroMedia.
        anchor = "const heroMedia=(data.site_media||[]).find(item=>item.slot==='shop_hero');"
        pos = js.find(anchor)
        if pos == -1:
            sys.exit("Erreur : impossible de trouver le bloc heroMedia dans public/shop.js.")
        after = pos + len(anchor)
        if_pos = js.find("if(heroMedia)", after)
        if if_pos == -1:
            sys.exit("Erreur : impossible de trouver 'if(heroMedia)' dans public/shop.js.")
        brace = js.find("{", if_pos)
        depth = 0
        end = None
        for i in range(brace, len(js)):
            if js[i] == "{":
                depth += 1
            elif js[i] == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end is None:
            sys.exit("Erreur : bloc if(heroMedia) mal formé dans public/shop.js.")
        line_start = js.rfind("\n", 0, if_pos) + 1
        indent = js[line_start:if_pos]
        js = js[:if_pos] + "revealShopHero(heroMedia);" + js[end:]

# 3) En cas d'erreur API, révèle le fallback plutôt que de laisser un vide définitif.
if "revealShopHero(null);" not in js:
    js = js.replace(
        "  }catch(error){\n",
        "  }catch(error){\n    revealShopHero(null);\n",
        1
    )

# 4) CSS : image invisible jusqu'à ce que la bonne source ait fini de charger.
css_rules = """
/* Ne révèle la couverture boutique qu'une fois la bonne image chargée. */
.shop-hero-visual>img{opacity:0;transition:opacity .2s ease}
.shop-hero-visual>img.is-ready{opacity:1}
"""
if ".shop-hero-visual>img.is-ready" not in css:
    if not css.endswith("\n"):
        css += "\n"
    css += "\n" + css_rules.lstrip()

js_path.write_text(js, encoding="utf-8")
css_path.write_text(css, encoding="utf-8")

print("OK : public/shop.js et public/shop.css ont été corrigés.")
print("Vérifie maintenant avec : git diff -- public/shop.js public/shop.css")
