# V5.2.22 — couleurs de la carte d’actualité

À appliquer après la V5.2.21.

La partie texte de la carte utilise un fond jaune pâle avec un léger dégradé doré, en rappel du jaune du club. Le titre et le bouton restent bordeaux. Les bandes grisées autour des images sont remplacées par du blanc, pour mieux accueillir les photos et visuels qui possèdent déjà un fond blanc. Le contour de carte est supprimé, avec une ombre légère. Le contenu et le fonctionnement restent identiques.

## Installation staging

```bash
git apply --check fce-correctif-v5.2.22.patch
git apply fce-correctif-v5.2.22.patch
npm run build
```

Enregistrer les fichiers du correctif, puis commit et push sur `staging` selon votre procédure habituelle. Aucune migration ni modification de configuration.

Après déploiement, vérifier la carte d’actualité sur ordinateur et téléphone. La version du lien CSS est actualisée pour charger les nouvelles couleurs.

Vérification : build Astro validé. Changement limité aux styles de l’accueil et à leur version de chargement.
