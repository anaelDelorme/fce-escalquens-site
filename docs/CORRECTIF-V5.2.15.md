# V5.2.15 — prix, tailles et accès coach

À appliquer après la V5.2.14 (`fa6a840`). Les articles, prix existants et commandes sont conservés. La seule nouvelle migration ajoute un ordre facultatif aux tailles dans la base du site.

Le titre d’accueil devient **« Portez les couleurs du FCE. »**, accompagné de la présentation des tenues et accessoires.

## Comparaison des prix sur les fiches publiques

Le prix catalogue et le tarif FCE sont affichés côte à côte. Le tarif appliqué bénéficie d’un fond clair doré et d’une bordure ; la référence catalogue reste plus discrète. Aucun pourcentage, prix barré ou message d’économie n’est ajouté.

La référence catalogue apparaît dès la carte et l’article à la une, même si seules certaines tailles la possèdent. Une précision indique les tailles concernées : les champs laissés vides ne sont pas complétés automatiquement. Dans le choix d’une taille, les montants exacts de celle-ci restent affichés. En l’absence de toute référence, seul le tarif appliqué apparaît.

## Trier les tailles

Dans **Gestion boutique → Articles → Modifier la fiche → Tailles et modèles** :

- Par défaut, les tailles enfant sont triées par âge : 6 ans, 8 ans, 10 ans…
- Les tailles adulte suivent l’ordre XXXS, XXS, XS, S, M, L, XL, 2XL, 3XL… XXL est traité comme l’équivalent de 2XL.
- Les flèches **↑ / ↓** à côté de chaque ligne permettent de personnaliser l’ordre. Chaque déplacement est enregistré.
- **Rétablir le tri automatique** remet toutes les tailles de cet article dans l’ordre naturel.

Cet ordre est utilisé dans la gestion, le formulaire de commande et les détails publics. Une taille ajoutée à un article déjà trié manuellement est placée après les tailles classées ; elle peut ensuite être déplacée.

Les cartes présentent seulement les bornes disponibles, par exemple **Enfant : 6 ans à 14 ans** et **Adulte : XS à 2XL**. Le formulaire et les détails continuent à proposer chaque taille disponible. Les libellés particuliers non reconnus sont conservés, notamment « Taille unique ».

## Appliquer les prix à plusieurs tailles

1. Dans la même fiche, sélectionner les lignes avec leurs cases ou les raccourcis **Toutes les tailles**, **Tailles enfant** et **Tailles adulte**.
2. Pour chacun des trois tarifs, choisir l’action souhaitée :

| Action | Résultat |
| --- | --- |
| Conserver | Aucun changement de ce tarif sur les tailles sélectionnées. |
| Fixer un prix | Saisir le montant en euros, puis l’appliquer à la sélection. |
| Effacer ce prix | Disponible pour le catalogue et le coach. Sans prix catalogue, la référence disparaît ; sans tarif coach, le tarif FCE s’applique. |

3. Vérifier le nombre et les libellés des tailles sélectionnées, puis cliquer sur **Appliquer aux tailles sélectionnées**.

Le bandeau de sélection permet de rejoindre les réglages de prix lorsqu’on est plus bas dans le tableau. Le changement est appliqué en une transaction, seulement aux tailles sélectionnées de cet article. Les autres tarifs, fournisseurs, personnalisations et statuts de visibilité sont conservés. Les montants des commandes déjà enregistrées restent inchangés. Les articles simples gardent leur formulaire habituel, sans sélection multiple.

Exemple : sélectionner **Tailles adulte**, fixer catalogue à **40 €** et FCE à **27 €**, laisser coach sur **Conserver**. Les tailles enfant et les tarifs coach actuels restent identiques.

## Où saisir le code coach ?

Sur **`/boutique/`**, cliquer sur **Tarifs coach** dans la barre supérieure. Le formulaire **Vous êtes coach ? → Saisir mon code** se trouve juste sous le bandeau d’accueil. Le lien supérieur ouvre ce formulaire et place le curseur dans le champ.

Si les tarifs coach ne sont pas activés, une indication invite à contacter le club. Pour les activer : **Gestion boutique → Paramètres → Accès aux tarifs coach → Générer le code coach**.

Le nouveau format contient 8 caractères aléatoires, par exemple **FCE-7K3M-9R2A**. Les caractères 0, 1, I et O sont exclus. La saisie accepte :

- `FCE-7K3M-9R2A`
- `fce 7k3m 9r2a`
- `7K3M9R2A`

Le bouton **Afficher le code** aide à vérifier la saisie. Le code réel n’est affiché dans la gestion qu’à sa génération. Un ancien code long reste valable jusqu’à son renouvellement ; cliquer sur **Renouveler le code coach** pour obtenir un code court. Cela révoque immédiatement l’ancien code et les accès précédents.

## Accès sans expiration de 8 heures

Le code et l’autorisation n’ont plus d’expiration automatique. L’accès reste utilisable jusqu’à **Quitter les tarifs coach**, au renouvellement du code ou à sa désactivation par le club.

La conservation sur l’appareil dépend du cookie du navigateur : celui-ci est signé, HttpOnly, Secure sur staging/production, SameSite=Strict et renouvelé à chaque lecture du catalogue pour au maximum 400 jours. Le navigateur peut le supprimer plus tôt. Dans ce cas, la saisie du même code actif rétablit l’accès ; le code n’a pas expiré. Les anciennes sessions signées sont acceptées puis mises à niveau sans imposer de ressaisie.

Le code reste conservé uniquement sous forme de hash avec le secret serveur. Les tentatives sont limitées à 5 par fenêtre de 15 minutes et par adresse IP ; les changements exigent la même origine. Le cookie ne contient pas le code. Les prix coach sont toujours exclus du catalogue sans accès valide et le prix est recalculé côté serveur au moment de créer la commande.

Le code commun donne accès au tarif à toute personne qui le connaît ; il ne vérifie pas son identité et ne donne aucun accès administratif. Le PDF de collection conserve les tarifs FCE publics.

## Installation staging

### Appliquer le patch

Depuis le dépôt sur la branche `staging`, après installation et enregistrement de la V5.2.14 :

```bash
git status
git apply --check fce-correctif-v5.2.15.patch
git apply fce-correctif-v5.2.15.patch
npm test
npm run typecheck:shop
npm run build
```

Si la vérification du patch échoue, ne pas forcer : vérifier la version de départ.

### Déployer

Enregistrer et pousser les fichiers du correctif sur `staging`. Le workflow existant applique les migrations D1 avant le déploiement.

Nouvelle migration : **`migrations/0034_shop_variant_order.sql`**, dans **DB** uniquement. Elle ajoute la colonne nullable `display_order` aux variantes. Elle ne change aucun montant, ne supprime aucune taille et ne crée aucune base. Pas de nouvelle migration ORDERS ou TOURNAMENTS, ni de nouvelle configuration HelloAsso ou mail.

Pour un déploiement manuel, avec l’authentification Cloudflare déjà configurée :

```bash
npx wrangler d1 migrations apply DB --remote --env staging
npx wrangler deploy --env staging
```

### Vérifier après installation

- Renseigner le prix catalogue pour une seule taille : vérifier sa présence sur la carte et la précision des tailles concernées.
- Vérifier les bornes enfant/adulte sur les cartes et la liste complète dans le choix d’une taille.
- Déplacer une taille, recharger, puis rétablir le tri automatique.
- Appliquer les tarifs catalogue et FCE à un groupe adulte ; contrôler que l’enfant et le tarif coach sont conservés.
- Effacer un prix catalogue ou coach sur une sélection et vérifier le résultat public.
- Générer un code court et l’essayer en minuscules et sans préfixe via le lien supérieur **Tarifs coach**.
- Renouveler le code puis vérifier le refus de l’ancien accès. Confirmer que les commandes existantes restent accessibles avec leurs montants figés.
- Faire un paiement HelloAsso Sandbox et comparer le panier au montant payé. Les mails staging restent dirigés vers `MAIL_TEST_TO`.

## Vérifications réalisées

122 tests automatisés passent, dont les commandes existantes, les tarifs groupés et leur isolation, le tri naturel/personnalisé, la comparaison partielle des prix et les codes coach. La conservation de l’accès après 90 jours, la révocation et la compatibilité des anciens codes et cookies sont testées. TypeScript et build Astro validés. La recette visuelle sur vos appareils et le paiement Sandbox restent à effectuer après déploiement.
