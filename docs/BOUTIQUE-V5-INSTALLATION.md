# Boutique V5 : fournisseurs, articles simples et corrections UI

Ce correctif s’applique après `fce-boutique-v4.patch`. Il ajoute la migration **`migrations/0030_shop_suppliers.sql` dans DB, la base du site**. Il ne crée aucune base et ne change pas ORDERS, les commandes existantes, les secrets HelloAsso ou les règles Cloudflare.

## Installer sur staging dans Codespaces

Téléchargez `fce-boutique-v5.patch` et déposez-le à la racine du dépôt. Vérifiez votre branche et enregistrez vos éventuelles modifications en cours avant application.

```bash
git branch --show-current
git apply --check fce-boutique-v5.patch
git apply fce-boutique-v5.patch
npm ci --include=dev
npm test
npm run typecheck:shop
npm run build
git add public src migrations tests docs
git commit -m "Ajoute les fournisseurs et simplifie les articles boutique"
git push origin staging
```

Le workflow staging existant applique les migrations de DB, puis déploie le Worker. Attendez sa réussite avant d’ouvrir la nouvelle page Fournisseurs. Si l’application du patch échoue, ne forcez pas : il faut l’adapter à vos changements locaux.

Si vous déployez manuellement, appliquez la migration avant le nouveau Worker :

```bash
npx wrangler d1 migrations apply DB --remote --env staging
npm run build
npx wrangler deploy --env staging
```

Pour tester avec la base locale, appliquez également les migrations de DB avec `--local --env local`. Les tests automatisés utilisent leurs propres bases SQLite en mémoire ; ils ne modifient aucune donnée distante.

## Fournisseurs

Nouvelle page : `/admin-boutique/fournisseurs/`.

Créez ou modifiez le nom, le contact, l’e-mail, le téléphone, l’adresse et les notes internes. Seuls les responsables boutique peuvent consulter ces coordonnées. Le formulaire des articles ne permet plus de saisir un nom de fournisseur libre : il propose uniquement ceux enregistrés dans cette page.

La migration reprend les noms présents dans les variantes existantes et les rattache aux fournisseurs. Une entrée Intersport / Kappa est proposée par défaut si elle n’existe pas déjà. Les prix déjà configurés sont également resynchronisés dans les libellés des articles.

Un fournisseur peut être désactivé, pas supprimé. Il disparaît des nouvelles affectations. Les articles déjà rattachés peuvent être modifiés sans changer de fournisseur ; cette désactivation ne masque pas automatiquement leurs articles. Renommer un fournisseur actualise son nom dans les variantes courantes. Les commandes passées gardent le nom du fournisseur enregistré au moment de l’achat.

Les modifications d’un fournisseur vérifient sa version pour éviter qu’un responsable écrase une modification plus récente.

## Articles simples

Dans la fiche article, la zone Prix et choix propose deux modes.

### Article simple

Pour un mug, un fanion ou un autre article sans taille ni personnalisation :

1. Sélectionnez **Article simple**.
2. Indiquez le prix de vente en euros, la référence chez le fournisseur et le fournisseur.
3. Cochez Disponible à la vente et enregistrez.

Une variante technique **Taille unique** est créée automatiquement. Aucun libellé de taille, couleur ou formulaire d’option n’est à remplir. L’article s’ajoute directement au panier.

Pour convertir un article qui avait plusieurs choix, l’enregistrement en mode simple conserve une variante et désactive les autres variantes et les options. Elles ne sont pas supprimées et restent accessibles en repassant au mode Avec tailles ou personnalisation. Les commandes déjà passées conservent leurs détails.

### Avec tailles ou personnalisation

Créez les tailles avec leurs prix et choisissez le fournisseur de chaque variante. Les options sont facultatives : un bouton **Ajouter une option** ouvre leur formulaire. Les champs de texte personnalisé apparaissent seulement si vous demandez un texte.

La référence fournisseur reste obligatoire pour pouvoir éditer un bon de commande exploitable.

## Un seul prix de référence

Le prix présenté dans la fiche devient un champ en lecture seule, calculé à partir des variantes actives :

- un prix unique si tous les choix ont le même tarif ;
- **À partir de** et le prix minimal si les tarifs diffèrent ;
- tarif à configurer si aucun choix n’est actif.

L’enregistrement d’une variante et la mise à jour du libellé de prix sont réalisés dans la même transaction D1. Une modification générale de l’article ne peut plus remplacer ce libellé par un montant différent lorsque ses variantes sont configurées. Le total du panier reste calculé depuis les variantes et les suppléments d’options, puis vérifié par le serveur.

Les articles hérités sans variante conservent leur ancien texte de présentation en base tant qu’ils ne sont pas configurés. Ce texte n’est jamais transformé en montant encaissable. Leur premier tarif doit être renseigné et vérifié dans la fiche.

## Corrections de mise en page

- Dans le panier, les boutons radio et cases à cocher ont des dimensions fixes ; le texte des modes de remise reste dans son cadre.
- Les astérisques des champs licencié et équipe restent à côté du libellé.
- Le haut de boutique est présenté dans un bandeau encadré, avec un titre plus compact et une signature du club sur le visuel.
- Le bloc final regroupe le panier et les liens utiles dans une carte centrée sur la même largeur que le reste de la boutique.
- Le pied de page utilise un conteneur interne centré, des colonnes qui peuvent rétrécir et des liens qui peuvent revenir à la ligne, pour éviter les débordements.
- Les styles boutique sont versionnés en V5. Rechargez la page après le déploiement si nécessaire.

## Recette staging

1. Ouvrez Fournisseurs et vérifiez la reprise des noms existants.
2. Créez un fournisseur de test et vérifiez sa présence dans la liste d’un article.
3. Configurez un article simple : prix, référence et fournisseur. Vérifiez son ajout direct au panier.
4. Sur un autre article, configurez deux tailles à prix différents et vérifiez le libellé À partir de.
5. Vérifiez les options et leurs suppléments, puis les modes de remise coach / rendez-vous au club dans le panier.
6. Vérifiez sur téléphone et ordinateur le haut de page, le bloc final et le pied de page.
7. Renommez ou désactivez un fournisseur de test : vérifiez le comportement décrit ci-dessus et le maintien de l’historique des commandes.
8. Vérifiez les prix dans la boutique et dans le catalogue PDF généré.

Les tests automatisés couvrent la migration, les contrôles d’accès, les coordonnées fournisseurs non publiques, les doublons, les conflits de version, les prix synchronisés, la conversion atomique en article simple, les instantanés de commande et les parcours DOM du panier et de l’administration. Typage, build Astro et paquet Worker sont vérifiés. La validation visuelle sur appareils réels et les paiements HelloAsso restent à effectuer dans votre staging après installation.
