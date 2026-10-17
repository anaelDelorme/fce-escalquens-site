# Boutique V4 : panier, articles et catalogue illustré

Ce correctif s’applique après `fce-boutique-ux-v3.patch`. Il ne change pas les bases D1, les secrets, les règles Cloudflare ni les commandes existantes. Aucune migration supplémentaire n’est nécessaire.

## Installer sur staging dans Codespaces

Téléchargez `fce-boutique-v4.patch` et déposez-le à la racine du dépôt. Sur votre branche `staging`, enregistrez d’abord vos changements en cours.

```bash
git branch --show-current
git apply --check fce-boutique-v4.patch
git apply fce-boutique-v4.patch
npm ci
npm run typecheck:shop
npm test
npm run build
git add package.json package-lock.json public src scripts tests docs
git commit -m "Réorganise la boutique et son catalogue illustré"
git push origin staging
```

Attendez la réussite du workflow staging puis rechargez la boutique et son administration. Si `git apply --check` échoue, ne forcez pas l’application : les fichiers ont évolué et il faut adapter le patch.

## Administration : une adresse par espace

| Espace | Adresse |
| --- | --- |
| Commandes | `/admin-boutique/` |
| Catégories | `/admin-boutique/categories/` |
| Articles et photos, tailles, prix et options | `/admin-boutique/articles/` |
| Couverture, ouverture et visuel de fermeture | `/admin-boutique/couverture/` |
| Paramètres de vente et HelloAsso | `/admin-boutique/parametres/` |
| Responsables boutique | `/admin-boutique/acces/` |
| Satisfaction | `/admin-boutique/satisfaction/` |

La navigation utilise de vraies pages : retour navigateur, favoris et liens directs fonctionnent. Elles utilisent toutes la même application Access et la même vérification de JWT et d’habilitation dans `ORDERS.shop_admins`. Vérifiez que votre règle Cloudflare couvre bien `/admin-boutique` et `/admin-boutique/*`.

La page Articles propose un filtre par catégorie et un filtre Tous / Visibles / Masqués. Chaque ligne propose **Modifier la fiche**, **Masquer / Rendre visible** et la suppression existante. Un article sans photo reste masqué. Si sa catégorie est masquée, ses articles ne sont plus présentés au public ni proposés dans le catalogue de commande ou le PDF. Les commandes déjà passées conservent leurs instantanés.

## Une fiche article complète

Cliquez **Modifier la fiche**. Quatre zones distinguent les contenus :

1. **Article et photo** : nom, catégorie et visuel.
2. **Sur la carte de la boutique** : accroche courte et informations commerciales de présentation.
3. **Dans la fenêtre Détails uniquement** : description complète, composition, entretien et précisions.
4. **Publication et mise en avant** : visibilité et mise en avant.

Les **tailles, tarifs et personnalisations** figurent immédiatement sous ce formulaire, sur la même fiche. Pour un nouvel article, enregistrez d’abord son identité pour accéder à cette configuration. Les boutons d’enregistrement de chaque zone restent distincts pour ne pas perdre les variantes déjà définies.

La description longue n’est plus copiée sur les cartes publiques. Les champs existants `short_description` et `description` sont réutilisés, donc aucun texte n’est supprimé ou déplacé en base.

### Rendre un article commandable

La présence d’un prix libre comme « 25 € » dans la présentation ne crée pas une taille vendable.

- Pour un maillot, créez les tailles une par une avec leur référence fournisseur, leur prix exact en euros et l’option **Variante disponible à la vente** cochée.
- Pour un accessoire, créez une variante **Taille unique** avec sa référence et son prix.
- Ajoutez les options et leur supplément éventuel dans la même fiche.

Les articles importés de l’ancienne production peuvent n’avoir que des textes de présentation. Ils restent consultables ; leur bouton indique alors **Tailles et tarifs bientôt disponibles**, sans promettre un ajout possible. L’application ne devine jamais un montant à encaisser à partir de ces textes.

## Parcours panier

Le panier est placé dans un bandeau sous le menu du club, maintenu accessible pendant le défilement. Il ne recouvre plus le pied de page. Le haut de boutique comporte un titre plus compact, une image moins assombrie, un accès à la collection et des repères sur la remise, le paiement et l’absence de compte.

Une variante unique sans option est ajoutée directement. Un article à plusieurs tailles ou personnalisable ouvre son formulaire. Après validation, le panier s’ouvre et montre la ligne ajoutée. **Continuer mes achats** referme le panier. Modification des choix, quantités et retrait restent disponibles. Les boutons sont bloqués pendant le chargement pour éviter plusieurs ajouts issus d’un double clic.

Les scripts boutique sont maintenant assemblés et versionnés par Astro. La page ne dépend plus d’un mélange de scripts publics conservés en cache entre les versions.

## Catalogue PDF illustré

Le PDF est généré depuis le navigateur au clic sur **Télécharger le catalogue PDF**. Il relit le catalogue actuel puis prépare le logo et les photos depuis le même site. Les images WebP, AVIF et autres formats pris en charge par le navigateur sont converties en PNG pour le PDF ; aucun service tiers de conversion n’est utilisé et aucune configuration Cloudflare supplémentaire n’est requise.

Le catalogue comporte :

- logo FC Escalquens, couleurs du club, date et pagination ;
- catégories, deux fiches illustrées par page A4 et photos non déformées ;
- nom, accroche, tailles, tarifs, options et délais renseignés ;
- mise en page qui garde chaque fiche sur sa page, et rappel du parcours de commande en fin de catalogue lorsque la dernière page ne contient qu’un article.

Si les prix de commande ne sont pas encore configurés, les tarifs de présentation existants sont conservés comme informations indicatives et la commande en ligne est annoncée prochainement. Ils ne deviennent pas des prix d’encaissement. Une photo manquante est remplacée par le logo, avec un message indiquant le nombre de visuels indisponibles après génération.

Les descriptions longues restent consultables dans les détails en ligne ; le PDF privilégie les informations synthétiques. Si un article a trop de variantes pour sa fiche, le catalogue renvoie vers les choix complets en ligne. Le paiement affiche toujours le total exact avant validation.

Il n’y a plus de PDF manuel dans les écrans d’administration. L’ancienne adresse `/api/shop/catalogue.pdf` redirige vers `/boutique/catalogue/`, où le bouton lance la génération illustrée. Le téléchargement nécessite JavaScript et une connexion pour lire le catalogue et ses photos.

## Recette staging

1. Ouvrez Articles et photos et filtrez une catégorie, puis les articles masqués.
2. Modifiez une fiche : vérifiez la séparation entre texte court et détails.
3. Créez deux tailles avec des prix différents et une option à texte facultative.
4. Dans la boutique, vérifiez l’accroche courte et la fenêtre Détails.
5. Choisissez une taille et une personnalisation, puis ajoutez : le panier doit s’ouvrir avec le bon total et le texte saisi.
6. Modifiez la quantité, retirez la ligne, puis ajoutez un accessoire à taille unique.
7. Vérifiez le bandeau panier sur téléphone et ordinateur.
8. Masquez l’article puis sa catégorie : vérifiez la disparition publique et la réapparition après réactivation.
9. Téléchargez le PDF, vérifiez les visuels et les prix des articles visibles.
10. Vérifiez les commandes et les accès existants ; un compte HelloAsso n’est pas nécessaire pour ces essais de catalogue/panier.

Les tests automatisés couvrent les parcours DOM du panier, les filtres, le masquage, l’éditeur intégré, la séparation des textes et le PDF avec images. La compilation Astro, le typage et le paquet Worker sont vérifiés. La mise en page sur de vrais appareils et les paiements HelloAsso Sandbox restent à contrôler dans votre staging après déploiement. L’aperçu PDF fourni utilise les articles actuels du staging ; il ne modifie aucune donnée.
