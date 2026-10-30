# V5.2.31 — En-tête et sélection de la boutique 5

À appliquer sur **develop après la V5.2.30**. Retouche limitée à la présentation de `/boutique-5/`, sans migration ni changement des prix ou des commandes.

## Modifications

- Le haut de page est recomposé en un panneau clair : titre et présentation regroupés à gauche, écusson du club dans un médaillon discret à droite. Le titre reste « Le vestiaire FCE. ».
- Le texte devient : « Du match à l’entraînement, trouvez votre équipement aux couleurs du club. » Un lien Explorer la collection mène aux filtres et vestiaires. Une ligne rappelle HelloAsso et la remise au club ou par le coach.
- Sur téléphone, le contenu revient à une colonne et l’écusson devient un filigrane léger en arrière-plan.
- La miniature sélectionnée utilise un fond rosé très clair, une bordure douce et un repère bordeaux sur le côté. Le jaune vif et le double contour sombre disparaissent. Le focus clavier reste distinct et visible.
- Le défilement des miniatures et les vestiaires indépendants par catégorie sont conservés.

## Installation

Enregistrer le travail en cours, vérifier que develop contient la V5.2.30 et placer le patch à la racine du dépôt :

```bash
git switch develop
git status
git apply --check fce-correctif-v5.2.31.patch
git apply fce-correctif-v5.2.31.patch
npm run build
```

Après vérification :

```bash
git add public/shop-studio.css src/components/ShopStorefront.astro docs/CORRECTIF-V5.2.31-DEVELOP.md
git commit -m "Affine l’en-tête et la sélection des articles de boutique-5"
git push origin develop
```

Le workflow existant ne déploie pas develop. Promouvoir ensuite vers staging selon votre procédure habituelle pour la recette distante.

## Vérification

Sur `/boutique-5/`, vérifier le haut de page et le lien vers la collection, puis la miniature sélectionnée, son survol et son focus clavier. Tester sur téléphone et ordinateur. Le défilement, les filtres, les tailles et le panier doivent conserver leur fonctionnement.

Validation : build Astro réussi, trois tests existants des vestiaires passent ; contenu du nouvel en-tête limité à boutique-5 et non-indexation vérifiés dans les pages construites. La suite complète n’a pas été relancée pour cette retouche de présentation. Le rendu reste à vérifier sur vos appareils. Aucun push ni déploiement effectué pour cette livraison.
