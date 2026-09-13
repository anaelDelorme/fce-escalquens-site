# Correction transition du diaporama

Cette version remplace uniquement les deux fichiers du module diaporama.

Modifications :
- photo affichée 5 secondes complètes ;
- fondu croisé de 800 ms entre deux images ;
- aucune transition au premier chargement de la page ;
- préchargement de la photo suivante avant le fondu ;
- maintien de `prefers-reduced-motion` ;
- comportement tactile inchangé sur smartphone.

Installation depuis la racine du dépôt :

```bash
unzip -o fce-diaporama-transition-smooth.zip
npm run build
```

Les fichiers remplacés sont :
- `public/home-slideshow.js`
- `public/home-slideshow.css`
