# V5.2.25 — boutique compacte, zoom et deux présentations à comparer

Correctif préparé sur la branche staging du dépôt, révision `66e6b44b6fa554b3492b7f84bed091bec3d435d6`, le 30 octobre 2026. Cette révision contient les évolutions d’affichage jusqu’à la V5.2.22. Les correctifs Node V5.2.23 et indexation V5.2.24 restent indépendants et doivent être conservés s’ils sont déjà installés : cette livraison ne les remplace pas.

## Boutique actuelle : `/boutique/`

- Les fourchettes deviennent **13 – 14 €**, avec des espaces autour du tiret, pour les tarifs FCE et les prix catalogue.
- Les visuels des cartes sont moins hauts et les espaces sont resserrés. Le nom reste visible sur deux lignes au maximum et l’accroche sur deux lignes ; les textes complets restent dans la fiche de détail et le choix de l’article.
- Les résumés des tailles enfant/adulte et la mention **Personnalisable** sont présentés en petites puces sur l’image. Les listes de tailles et de personnalisations ne rallongent plus les cartes.
- Le délai indicatif tient sur une ligne. Les deux boutons sont placés côte à côte, avec un intitulé principal adapté : choix d’une taille, personnalisation ou ajout direct pour un article simple.
- Le grand article à la une est lui aussi resserré.

La hauteur n’est pas fixée artificiellement : les textes restent adaptables au téléphone et au zoom du navigateur. Sur les écrans très bas ou avec une forte augmentation de taille de texte, un défilement peut encore être nécessaire.

## Détails et photo

Les tailles partageant exactement les mêmes tarifs sont regroupées. Par exemple, cinq tailles enfant à 26 € donnent un seul bloc **Enfant : 6 ans à 14 ans — 26 €**, puis un autre bloc pour les tailles adultes à 30 €. Les différences de prix catalogue, tarif coach/FCE ou couleur sont conservées dans des groupes distincts.

Le sélecteur de commande garde **toutes les tailles individuelles** et leurs prix exacts. La composition et les précisions de l’article restent accessibles. Le bouton de choix/commande reste dans un pied de fiche collant pendant le défilement.

Les photos du catalogue, de l’article à la une et des détails sont cliquables. Elles ouvrent une visionneuse avec :

- image agrandie et nom de l’article ;
- boutons + / − et **Ajuster**, jusqu’à 300 % du cadrage initial ;
- défilement natif pour examiner une image agrandie ;
- fermeture par le bouton, Échap ou clic à l’extérieur ;
- retour du focus sur la photo qui a ouvert la visionneuse ;
- message explicite si une image ne charge pas.

## Deux pages cachées

Après déploiement, ouvrir ces chemins sur le domaine de staging :

| Chemin | Présentation |
| --- | --- |
| `/boutique-2/` | **Défilement horizontal** par catégorie, cartes alignées, flèches précédent/suivant et défilement natif au doigt ou au clavier. Sur téléphone, une partie de la carte suivante donne le sens de navigation. |
| `/boutique-3/` | **Catalogue éditorial**, avec une ouverture bordeaux plus courte et de grandes lignes image/texte, une catégorie après l’autre. Sur téléphone, les colonnes s’adaptent puis s’empilent sur les écrans les plus étroits. |

Les variantes ne sont pas ajoutées au menu public ou au pied de page. Elles comportent `noindex,nofollow` et sont exclues du sitemap. Ce sont des pages non référencées, accessibles à quiconque connaît leur adresse ; elles n’ajoutent pas une protection par mot de passe.

Le bandeau de comparaison apparaît seulement sur les variantes et permet de revenir à la boutique actuelle ou de passer d’une variante à l’autre.

**Même catalogue, mêmes images, mêmes tarifs, même panier et même configuration HelloAsso.** Ce sont des présentations fonctionnelles, pas des maquettes figées. Utiliser le staging pour les commandes de test : ces pages n’imposent pas un environnement de paiement sandbox par elles-mêmes. Le mode « image d’attente » de la boutique est respecté dans les trois présentations.

Le défilement horizontal est manuel, sans rotation automatique. Les flèches ont des libellés accessibles et se désactivent aux extrémités. La recherche et les filtres restent communs. Les animations tiennent compte de la préférence de réduction des mouvements.

## Installation dans staging

Placer le patch à la racine du dépôt, sur la branche `staging` :

```bash
git status
git apply --check fce-correctif-v5.2.25.patch
git apply fce-correctif-v5.2.25.patch
npm test
npm run typecheck:shop
npm run build
```

Si vous avez installé la V5.2.23, lancer `nvm use` avant ces commandes comme indiqué dans son guide.

Enregistrer tous les fichiers modifiés et nouveaux, puis commit et push sur `staging` selon votre procédure habituelle. **Aucune migration, nouvelle base, variable ou modification de prix à effectuer.** Les commandes existantes et leurs montants restent inchangés.

L’intégration du sitemap est enveloppée par `scripts/shop-sitemap.mjs` pour ajouter l’exclusion des deux pages sans supprimer vos filtres existants, notamment celui des fiches d’équipe de la V5.2.24. Les trois pages utilisent un composant partagé `ShopStorefront.astro` : les futures corrections communes se font à un seul endroit.

## Recette après déploiement

1. Sur `/boutique/`, vérifier une carte avec un tarif unique, puis une fourchette FCE/catalogue et un article personnalisable.
2. Ouvrir les détails d’un article comportant de nombreuses tailles : vérifier les groupes de prix et le bouton de commande, puis retrouver toutes les tailles dans le sélecteur.
3. Cliquer une photo dans une carte, puis dans les détails. Vérifier + / −, Ajuster, Échap et le retour au point de départ.
4. Sur `/boutique-2/`, tester les flèches, le défilement au doigt et les filtres. Les boutons de chaque carte doivent rester accessibles.
5. Sur `/boutique-3/`, comparer les grandes lignes sur ordinateur et leur adaptation sur téléphone.
6. Ajouter un article au panier sur une version, puis ouvrir une autre version et retrouver le panier. Ne pas effectuer de paiement réel pour cette recette.
7. Tester le mode image d’attente : il doit masquer le catalogue dans les trois versions.

Validation avant livraison sur le code staging récupéré : **151 tests passent**, TypeScript et build Astro validés. Les fichiers construits des deux variantes contiennent bien la balise de non-indexation, et les variantes sont absentes du sitemap. Le navigateur de recette distant ne peut pas joindre le serveur local ; la vérification visuelle sur vos écrans et avec les vrais articles reste à effectuer après déploiement.

Aucun déploiement distant ni envoi d’e-mail effectué pendant la préparation du correctif.
