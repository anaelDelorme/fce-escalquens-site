# V5.2.27 — Zoom et présentations boutique

Ce correctif s’applique sur **develop après la V5.2.26**. Il ne modifie ni le serveur, ni les prix, ni les bases de données et ne nécessite aucune migration.

## Installer

Enregistrer vos changements en cours, puis vérifier que develop contient bien la V5.2.26. Si develop est encore l’ancienne branche sans la nouvelle boutique, suivre d’abord la remise à niveau du guide V5.2.26. Ne pas forcer de réinitialisation de branche.

Placer le patch à la racine du dépôt, puis :

```bash
git switch develop
git status
git apply --check fce-correctif-v5.2.27.patch
git apply fce-correctif-v5.2.27.patch
npm test
npm run typecheck:shop
npm run build
```

Après vérification, ajouter uniquement les fichiers du correctif :

```bash
git add public/shop-gallery.js public/shop-layouts.js public/shop-presentations.css scripts/shop-sitemap.mjs src/components/ShopStorefront.astro src/pages/boutique-5/index.astro tests/shop-presentations.test.ts docs/CORRECTIF-V5.2.27-DEVELOP.md
git commit -m "Améliore le zoom et les présentations boutique, ajoute boutique-5"
git push origin develop
```

Le workflow existant ne déploie pas develop. Pour tester sur le Worker de staging, promouvoir ensuite les changements par votre procédure habituelle. Le correctif ne change pas les déclencheurs de déploiement.

## Changements

- **Zoom photo** : suppression d’Ajuster ; molette centrée sur le pointeur, de 100 à 400 %, boutons +/− conservés. L’image tient dans la fenêtre à l’ouverture. Glisser à la souris pour déplacer l’image agrandie ; sur mobile, utiliser + puis faire défiler au doigt. Les flèches du clavier permettent aussi de déplacer la zone de défilement après focus. Échap et fermeture rendent le focus à la photo.
- **À la une** : carte arrondie, image avec marge, colonne de texte plus large, titre et prix mieux espacés. Les boutons ne sont plus étirés sur toute la colonne ; sur mobile, la commande prend toute la largeur et les détails passent dessous.
- **Boutiques 2 et 3** : même en-tête, texte, photo et proportions que la boutique principale. Les différences portent sur le catalogue.
- **Boutique 2** : molette directement sur les cartes, glisser à la souris, geste tactile natif et barre de progression conservée. À l’extrémité d’une rangée, la molette verticale laisse de nouveau défiler la page. Ctrl + molette reste disponible pour le navigateur. Un glisser ne déclenche pas accidentellement le zoom photo.
- **Boutique 4** : suppression du thème noir ; fond habituel du site, cartes claires et composition bento conservée.
- **Boutique 5** : `/boutique-5/`, direction graphique « studio sportif » : typographie XXL, découpes d’image, décalage des cartes, touches jaunes et bordeaux, composition asymétrique. Sur téléphone, la lecture revient à une colonne sans décalage.

Les versions 2 à 5 partagent le catalogue réel, les tarifs, les règles de personnalisation et le panier. Elles ne sont pas dans le menu public ni dans le sitemap et portent `noindex,nofollow`. Elles restent accessibles par leur adresse ; elles ne sont pas privées. Le paiement utilise l’environnement du Worker : faire la recette des commandes en staging sandbox.

## Vérifier après installation

1. Ouvrir une photo : aucune commande Ajuster ; image entièrement visible à 100 %. Zoomer à la molette à plusieurs endroits, déplacer l’image puis revenir à 100 % avec −. Tester +/−, Échap, retour du focus et mobile.
2. Vérifier À la une avec un nom long, avec ou sans prix catalogue et sur téléphone.
3. Comparer les hauts de `/boutique/`, `/boutique-2/` et `/boutique-3/` : même présentation.
4. Sur boutique-2, défiler avec la molette puis par glisser sur une photo. Vérifier qu’un clic simple ouvre encore le zoom, que les boutons de commande fonctionnent et que la page défile aux extrémités. Vérifier aussi les filtres et la progression.
5. Vérifier les cartes claires de boutique-4 et la composition de boutique-5 sur ordinateur et téléphone. Ajouter un article, changer de présentation et retrouver le panier.
6. Vérifier le mode image d’attente si la boutique est fermée.

Validation automatisée : tests de zoom/molette/déplacement, filtres et défilement horizontal, suite complète, TypeScript et build Astro. Les pages construites sont contrôlées pour la non-indexation. La recette visuelle sur vos appareils reste à réaliser après déploiement ; aucun déploiement n’a été effectué pour cette livraison.
