# V5.2.32 — Nouvelle hiérarchie visuelle de boutique-5

À appliquer sur **develop après la V5.2.31**. Aucune migration, nouvelle configuration ou modification des prix et paiements.

## Présentation

La page de staging a été consultée dans le navigateur pour examiner la présentation précédente. Cette livraison reprend le haut, le fond et les sections de `/boutique-5/`.

- **Un bandeau aux couleurs du club** : partie bordeaux, titre clair « Le vestiaire. Version FCE. », bouton jaune « Explorer les vestiaires » et texte de présentation regroupé.
- **Le catalogue dans l’en-tête** : jusqu’à trois photos réelles d’articles composent une scène à droite. Le script privilégie un visuel par catégorie, complète si nécessaire, évite les images identiques et utilise le catalogue déjà chargé. Aucun nouvel appel à l’API catalogue.
- **Un repli prévu** : en l’absence de photos utilisables, ou si toutes les images du bandeau échouent, le logo du club reste affiché. Les images de ce bandeau sont décoratives et ne dupliquent pas les boutons de commande.
- **Un fond plus structuré** : blanc chaud et tons rosés très légers, qui détachent les zones de contenu.
- **Des catégories mieux identifiées** : chacune occupe un panneau blanc, avec un liseré bordeaux ou or, un titre plus visible et un séparateur. Les espaces entre catégories sont réduits et réguliers.
- **Recherche et filtres regroupés** dans un panneau blanc distinct.

Le défilement des miniatures, leur sélection rosée, les vestiaires indépendants, les vues d’ensemble, les filtres, le zoom et le panier sont conservés. Les autres boutiques gardent leur présentation.

Sur téléphone, le bandeau passe en une colonne et la composition de photos devient une bande plus courte sous le texte. Les sections conservent des marges adaptées.

## Installation

Enregistrer vos changements en cours. Vérifier que develop contient la V5.2.31, puis placer le patch à la racine du dépôt :

```bash
git switch develop
git status
git apply --check fce-correctif-v5.2.32.patch
git apply fce-correctif-v5.2.32.patch
npm test
npm run typecheck:shop
npm run build
```

Après vérification :

```bash
git add public/shop-studio.css public/shop-studio.js src/components/ShopStorefront.astro tests/shop-studio.test.ts docs/CORRECTIF-V5.2.32-DEVELOP.md
git commit -m "Renforce l’identité visuelle et les catégories de boutique-5"
git push origin develop
```

Le workflow existant ne déploie pas develop. Pour tester sur le Worker de staging, promouvoir les changements selon votre procédure habituelle. Aucun changement des workflows n’est inclus.

## Recette après déploiement

1. Vérifier le titre, le contraste et les photos du bandeau sur ordinateur et téléphone. Le bouton doit mener aux filtres et vestiaires.
2. Vérifier la lecture des catégories et leur séparation visuelle, avec des noms courts et longs.
3. Faire défiler et sélectionner les miniatures ; ouvrir le zoom, changer de catégorie et essayer la vue d’ensemble.
4. Rechercher un article, obtenir zéro résultat puis réinitialiser. Vérifier que les vestiaires reprennent leur fonctionnement.
5. Ajouter un article avec taille/personnalisation et vérifier le panier. Faire les essais de commande sur staging sandbox.
6. Vérifier le mode image d’attente lorsque la boutique est fermée.

Boutique-5 reste hors du menu public et du sitemap, avec `noindex,nofollow`. Les règles de paiement et de confidentialité restent celles de la boutique.

Validation : 155 tests passent, TypeScript et build Astro validés ; test ajouté pour les photos du bandeau, l’absence de doublons, le rechargement et le repli vers le logo. La version précédente a été examinée en ligne ; le nouveau rendu n’a pas été déployé et reste à vérifier sur vos appareils. Aucun push ni déploiement effectué pour cette livraison.
