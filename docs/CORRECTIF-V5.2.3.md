# Correctif V5.2.3 — boutique et accès tournois

## Boutique

Les champs Couleur et Référence de l’article chez le fournisseur sont retirés des formulaires et du tableau des tailles/modèles. Le fournisseur reste sélectionné dans la liste des fournisseurs.

Un nouveau modèle peut être enregistré sans couleur ni référence fournisseur. Les valeurs historiques restent conservées en base lorsqu’on modifie son prix, sa taille, son fournisseur ou sa visibilité depuis l’interface. Les commandes déjà passées et leurs bons fournisseur restent inchangés. Aucune référence artificielle n’est créée.

## Installation dans staging

Ce patch incrémental s’applique après la V5.2.2. Placez le fichier téléchargé à la racine du dépôt puis, dans Codespaces :

```bash
git switch staging
git pull --ff-only
git apply --check fce-correctif-v5.2.3.patch
git apply fce-correctif-v5.2.3.patch
npm ci
npm test
npm run typecheck:shop
npm run build
```

Aucune nouvelle migration D1 et aucune nouvelle copie des tournois ne sont nécessaires pour ce correctif. Ne remplacez pas vos bindings D1 ou votre configuration par ceux d’un autre environnement.

## Corriger ACCESS_AUDIENCE sur l’administration des tournois

Cette erreur signifie que l’audience du jeton reçu ne correspond pas à `CF_ACCESS_TOURNAMENT_AUD`. Elle peut venir d’un AUD mal renseigné, d’une autre application Access sélectionnée pour l’URL ou d’une ancienne session. Ajouter un administrateur en base ne corrige pas ce décalage.

1. Ouvrez Cloudflare Zero Trust → Access → Applications, puis l’application destinée à l’administration des tournois en staging.
2. Vérifiez le domaine `fce-escalquens-staging.fcescalquens.workers.dev` et la couverture des deux chemins : `/admin-tournois` et `/admin-tournois/*`. Les appels `/admin-tournois/api/*` doivent relever de cette même application.
3. Vérifiez que l’application du site cible `/admin` et `/admin/*`, et celle de la boutique `/admin-boutique` et `/admin-boutique/*`. Évitez une règle ambiguë `/admin*`. S’il existe une application couvrant tout le domaine, vérifiez que l’application tournois et ses chemins plus précis sont bien configurés.
4. Dans l’application tournois, copiez **Application Audience (AUD)**. Ne copiez ni le Policy ID, ni l’AUD de la boutique ou du site. Conservez la politique d’autorisation des e-mails avec code PIN.
5. Dans Codespaces, exécutez la commande suivante en remplaçant la valeur entre guillemets par cet AUD :

```bash
node scripts/configure-shop-access.mjs --scope tournament --env staging \
  --aud 'REMPLACER_PAR_AUD_APPLICATION_TOURNOIS' \
  --origin https://fce-escalquens-staging.fcescalquens.workers.dev

node scripts/configure-shop-access.mjs --scope tournament --env staging --check
```

Le script conserve `CF_ACCESS_ISSUER` déjà configuré. Si celui-ci manque, ajoutez `--issuer 'https://votre-equipe-reelle.cloudflareaccess.com'` avec le domaine réel indiqué dans les paramètres de votre organisation Zero Trust. Ce domaine n’est pas l’adresse du site.

Le contrôle `--check` valide le format des paramètres ; il ne contacte pas Cloudflare et ne vérifie pas quelle application est effectivement sélectionnée.

6. Enregistrez le correctif et la configuration, puis déployez via le workflow staging habituel :

```bash
git add src/scripts/admin-shop-variants.js src/shop/service.ts tests/shop-ui.test.ts tests/shop.test.ts docs/CORRECTIF-V5.2.3.md wrangler.jsonc
git commit -m "Simplifie les variantes boutique et configure Access tournois"
git push origin staging
```

7. Attendez la réussite du déploiement, puis ouvrez :

   https://fce-escalquens-staging.fcescalquens.workers.dev/cdn-cgi/access/logout

   Revenez ensuite sur :

   https://fce-escalquens-staging.fcescalquens.workers.dev/admin-tournois/

8. Reconnectez-vous avec votre e-mail et le PIN. Vérifiez l’ouverture de l’administration et le chargement de ses données. Un éventuel `FORBIDDEN` après cette correction relève des habilitations `tournament_admins` dans la base TOURNAMENTS ; il s’agit d’une vérification distincte, décrite dans `docs/TOURNOIS-V5.2.md`.

Ne désactivez pas la vérification de l’audience ou de la signature pour contourner l’erreur. Ne transmettez pas de jeton `CF_Authorization` ni de cookie de session pour le diagnostic.

Référence officielle : https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/

## Autre point visible sur la capture fournie

La capture montre la configuration HelloAsso de la boutique, et non celle des applications Access. Elle affiche une clé de suivi et un transport mail absents. Ces réglages restent à terminer pour permettre les liens de suivi et l’envoi des e-mails ; voir `docs/BOUTIQUE.md`. Ils n’expliquent pas l’erreur `ACCESS_AUDIENCE`.
