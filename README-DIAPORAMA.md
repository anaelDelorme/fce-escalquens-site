# Diaporama accessible — accueil FC Escalquens

Ce paquet ajoute un petit diaporama à la place de la photo principale de la page d'accueil, administrable depuis **Administration → Diaporama accueil**.

## Fonctionnement

Chaque diapositive possède :
- une photo chargée dans R2 ;
- une description alternative ;
- un ordre d'affichage ;
- un état Actif / Inactif.

Conseil pour l'ordre : utiliser 10, 20, 30… afin de pouvoir insérer facilement une photo entre deux autres.

## Smartphone

Le diaporama conserve la zone photo existante et adapte sa hauteur sur petits écrans. Les boutons précédent / pause / suivant ont des cibles tactiles d'au moins 44 px et les indicateurs restent accessibles même lorsqu'il y a plusieurs photos.

## Accessibilité

- bouton Pause disponible dès qu'il y a plusieurs photos ;
- arrêt temporaire au survol et à la prise de focus ;
- toute navigation manuelle arrête le défilement automatique ;
- aucune lecture automatique lorsque `prefers-reduced-motion: reduce` est activé ;
- flèches gauche/droite utilisables au clavier ;
- annonces `aria-live` uniquement après une action manuelle ;
- description alternative configurable photo par photo ;
- fallback vers l'ancienne photo si aucune diapositive n'est active.

## Installation

Décompresse le ZIP à la racine du dépôt, puis lance :

```bash
python3 install-home-slideshow.py
npm run build
git diff --check
git diff
```

Si tout est bon :

```bash
git add .
git commit -m "Ajoute le diaporama accessible de l'accueil"
git push
```

Le workflow de déploiement applique ensuite la migration D1.

Le script préserve les autres modifications locales du dépôt : il ne remplace pas en bloc `public/admin.js` ou `src/worker.ts`, il ajoute seulement les éléments nécessaires au diaporama.
