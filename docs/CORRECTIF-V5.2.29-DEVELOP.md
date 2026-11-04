# V5.2.29 — Vestiaires par catégorie et délai estimé

À appliquer sur **develop après la V5.2.28**. Aucune migration ni modification des prix, des commandes ou de la configuration.

## Modifications

- **Boutique 5 recentrée** : recherche, filtres et vestiaires occupent une colonne centrée de 1 180 px maximum, alignée sur l’en-tête. Les marges restent adaptées aux téléphones.
- **Un vestiaire par catégorie** : chaque catégorie possède son titre, son article sélectionné, ses boutons précédent/suivant, son compteur et sa vue d’ensemble. Passer à l’article suivant ne change jamais de catégorie. Les sélections et vues sont indépendantes entre les vestiaires.
- **Quatre miniatures maximum à la fois** : pagination locale, sans longue liste à faire défiler sur le côté. La navigation entre articles et au clavier affiche automatiquement la bonne page de miniatures. Sur téléphone, les quatre miniatures restent au-dessus de la fiche.
- **Recherche et filtres conservés** : les compteurs et les pages de miniatures s’adaptent aux résultats. Les catégories sans résultat disparaissent selon le comportement existant. La remise à zéro de la recherche reste disponible.
- **Vocabulaire** : « Remise indicative » devient **« Délai estimé »** sur les cartes et l’article à la une, dans toutes les présentations de la boutique. Le délai saisi dans l’administration est conservé.

Les photos, prix, tailles, personnalisations, zoom et boutons de commande utilisent toujours les composants et données existants. La présentation de l’article à la une de la V5.2.28 reste conservée.

## Installation

Enregistrer vos changements en cours, vérifier que develop contient la V5.2.28, puis placer le patch à la racine du dépôt :

```bash
git switch develop
git status
git apply --check fce-correctif-v5.2.29.patch
git apply fce-correctif-v5.2.29.patch
npm test
npm run typecheck:shop
npm run build
```

Après vérification :

```bash
git add public/shop-studio.js public/shop-studio.css public/shop.js src/components/ShopStorefront.astro tests/shop-studio.test.ts docs/CORRECTIF-V5.2.29-DEVELOP.md
git commit -m "Centre boutique-5 et sépare les vestiaires par catégorie"
git push origin develop
```

Le workflow existant ne déploie pas develop. Pour la recette distante, promouvoir ensuite develop vers staging selon votre procédure habituelle. Aucun changement de workflow dans ce correctif.

## Recette après déploiement

1. Sur `/boutique-5/`, vérifier l’alignement du haut, de la recherche, des filtres et des vestiaires sur ordinateur et téléphone.
2. Dans Tout voir, vérifier la présence d’un vestiaire par catégorie. Parcourir une catégorie : l’autre doit rester sur son article. Le compteur repart à 01 dans chaque catégorie.
3. Pour une catégorie de plus de quatre articles, vérifier les pages de miniatures, les boutons précédent/suivant et la navigation au clavier avec les flèches et Début/Fin.
4. Basculer une catégorie en Vue d’ensemble : les autres restent en vue immersive.
5. Rechercher un article, changer de catégorie, provoquer zéro résultat et réinitialiser. Vérifier les compteurs, l’absence de pagination inutile et le retour des catégories.
6. Ouvrir le zoom puis commander avec tailles/personnalisation. Vérifier le panier commun.
7. Vérifier « Délai estimé » sur `/boutique/` et les autres présentations.

Boutique-5 reste hors du menu public et du sitemap, avec `noindex,nofollow`. Les essais de commande doivent utiliser le Worker de staging configuré en sandbox HelloAsso.

Validation : tests DOM de l’indépendance des catégories, de la pagination, du clavier, des filtres, du rechargement et du maintien des vrais boutons de commande ; 154 tests passent, TypeScript et build Astro validés. Le rendu reste à vérifier sur vos appareils après déploiement. Aucun push ni déploiement n’a été effectué pour cette livraison.
