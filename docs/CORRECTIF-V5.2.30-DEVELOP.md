# V5.2.30 — Boutique 5 plus lumineuse et défilement direct

À appliquer sur **develop après la V5.2.29**. Aucune migration ni modification du catalogue, des prix ou du paiement.

## Changements

- Fond plus lumineux, blanc chaud avec touches de jaune et de rose léger. Scènes produit plus fraîches, miniatures blanches, sélection jaune plus nette.
- Suppression des numéros de catégorie à l’affichage, des numéros sur les photos et miniatures, et des compteurs de position.
- Suppression des flèches de navigation et de pagination. Le bouton Vue d’ensemble prend une forme de pastille avec un pictogramme de grille.
- Les miniatures de chaque catégorie défilent directement : verticalement à droite sur ordinateur, horizontalement au-dessus de la fiche sur téléphone. La liste conserve une hauteur limitée ; la page ne s’allonge pas avec chaque miniature.
- Défilement à la molette et au pavé tactile, au doigt ou par glisser à la souris. Une barre de défilement visible permet aussi un accès direct.
- Sur mobile, la molette verticale au-dessus de la liste peut faire défiler horizontalement celle-ci ; aux extrémités, elle laisse de nouveau défiler la page. Ctrl + molette reste réservé au navigateur. Le défilement vertical sur ordinateur reste natif.
- Un glisser ne sélectionne pas accidentellement un article. Cliquer une miniature affiche sa fiche. Les flèches du clavier et Début/Fin permettent aussi de sélectionner un article ; seule la liste de miniatures se déplace pour le rendre visible.

Les vestiaires restent indépendants par catégorie. Les filtres, la recherche, la vue d’ensemble, le zoom et les vrais boutons de commande sont conservés. Les autres présentations de la boutique restent inchangées.

## Installer

Enregistrer votre travail en cours, vérifier que develop contient la V5.2.29, puis placer le patch à la racine du dépôt :

```bash
git switch develop
git status
git apply --check fce-correctif-v5.2.30.patch
git apply fce-correctif-v5.2.30.patch
npm test
npm run typecheck:shop
npm run build
```

Après vérification :

```bash
git add public/shop-studio.js public/shop-studio.css src/components/ShopStorefront.astro tests/shop-studio.test.ts docs/CORRECTIF-V5.2.30-DEVELOP.md
git commit -m "Éclaire boutique-5 et simplifie le défilement des miniatures"
git push origin develop
```

Le workflow existant ne déploie pas develop. Promouvoir ensuite les changements vers staging selon votre procédure habituelle pour les tester à distance. Aucun changement des workflows.

## Recette après déploiement

1. Vérifier le fond et l’absence de numéros ou flèches dans les vestiaires de `/boutique-5/`.
2. Sur ordinateur, parcourir les miniatures à la molette, au pavé tactile, avec la barre de défilement et par glisser. Un glisser ne doit pas changer l’article ; un clic doit le changer.
3. Sur téléphone, faire défiler les miniatures au doigt. Sur fenêtre étroite avec souris, essayer aussi la molette.
4. Au clavier, sélectionner une miniature puis utiliser les flèches et Début/Fin. La miniature sélectionnée doit devenir visible sans saut de page.
5. Vérifier recherche, catégories, aucun résultat et réinitialisation, puis Vue d’ensemble et Vue immersive.
6. Vérifier le zoom et l’ajout au panier avec taille/personnalisation. Les essais de commande doivent se faire sur staging avec HelloAsso sandbox.

Boutique-5 reste hors du menu public et du sitemap et garde ses métadonnées de non-indexation.

Validation : tests DOM pour le défilement, le glisser, le clavier, les filtres et l’indépendance des catégories ; 154 tests passent, TypeScript et build Astro validés. Le rendu reste à vérifier sur vos appareils. Aucun push ni déploiement effectué pour cette livraison.
