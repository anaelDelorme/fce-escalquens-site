# V5.2.16 — présentation des prix et formulaire coach

À appliquer après la V5.2.15 (`ef01081`). Ce correctif concerne uniquement l’affichage et le formulaire public. **Aucune migration D1.** Les tarifs, variantes, commandes et règles d’accès restent identiques.

## Prix des articles

- Nom de l’article en premier, sur les cartes et l’article à la une.
- Tarif FCE bien visible sur toute la largeur, accompagné d’un petit libellé souligné d’or.
- Fourchette compacte, par exemple **25–27 €**, au lieu d’une phrase coupée sur plusieurs lignes.
- Prix catalogue sur une ligne secondaire, par exemple **Prix catalogue 40 € · Adulte 2XL** si la référence ne concerne que cette taille.
- Suppression du pavé doré et de la phrase « Référence catalogue renseignée pour certaines tailles ».
- Sans prix catalogue, seul le tarif FCE apparaît. Les prix historiques libres utilisent la même présentation, sans conversion automatique ni ouverture supplémentaire à la commande.

Le nouveau format retire les décimales inutiles pour les montants entiers. Les centimes renseignés sont conservés. La comparaison reste présente dans les détails et lors du choix du modèle.

## Formulaire coach

Le bouton principal **Activer mes tarifs coach** adopte le bordeaux du club, une hauteur de 48 px, des angles arrondis et un état de focus visible. La commande **Afficher / Masquer** est intégrée au champ du code, avec un libellé accessible actualisé. Sur téléphone, le champ et le bouton principal occupent chacun la largeur disponible.

La validation, la limitation des tentatives, le code hashé et la révocation restent inchangés.

## Installer en staging

Dans le dépôt sur `staging`, après la V5.2.15 :

```bash
git status
git apply --check fce-correctif-v5.2.16.patch
git apply fce-correctif-v5.2.16.patch
npm run build
```

Enregistrer et pousser le correctif pour lancer le déploiement staging habituel. Aucun script de migration ou de configuration supplémentaire n’est nécessaire.

Vérifier sur ordinateur et téléphone un article avec fourchette, un prix catalogue partiel et un article sans référence. Vérifier également l’ouverture du formulaire coach, le bouton Afficher/Masquer, une erreur de saisie et un code valide.

Les 19 tests d’interface boutique passent, dont le panier, les comparaisons de prix et le formulaire coach. Le build Astro est vérifié avant livraison. La recette visuelle sur vos appareils reste à faire après déploiement.
