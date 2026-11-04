# PR vers main : boutique et tournois

Branche de préparation : `release/boutique-tournois-production`. Base de la PR :
`main`. La branche reprend staging et les changements déjà présents sur main.
La fusion déclenche un déploiement réel : compléter les prérequis ci-dessous
avant de fusionner. Le push de la branche exécute uniquement la préparation en lecture ; aucun import ni déploiement production n’est exécuté par ce push.

## Périmètre validé

- Catalogue boutique complet : catégories, articles, textes, tailles, tarifs FCE /
  catalogue / coach, fournisseurs, personnalisations partagées et obligatoires,
  choix activés par article, couverture et réglages de présentation. Les anciens
  articles, tailles, options, catégories et fournisseurs absents de staging sont
  retirés lors de l’import validé : le catalogue n’est pas fusionné avec l’ancien.
- Images boutique et fichiers de catalogue référencés : téléchargement depuis
  R2 staging, puis copie sous `releases/<reprise>/shop/…` dans R2 production.
  Aucun objet existant de production n'est écrasé.
- Tournois configurés : descriptions, dates, catégories, lieux, prix, capacités,
  échéances, formulaires, options de règlement et associations aux équipes.
  Les identifiants sont remappés par slug, y compris les équipes du site. Les
  lieux sont rapprochés par nom/adresse et les saisons par libellé ; le plan
  refuse une correspondance absente pour éviter de lier un autre lieu ou une
  autre saison en production.
- Pas de copie des commandes, inscriptions, réponses de participants, paiements,
  files d'e-mails, comptes administrateurs, secrets ou caches OAuth de staging.
- Pas de copie des médias tournois (photos, affiches, règlements). Les références
  médias sont vidées sur les tournois repris. Les anciens tournois absents de
  staging sont retirés du catalogue production.
- Les montants et données des commandes/inscriptions réelles restent conservés.
  Les ventes et inscriptions reprises restent fermées pendant la validation.

## Préparer les fichiers sans écrire en production

Le push de `release/boutique-tournois-production` lance cette préparation, puis
ouvre une PR brouillon vers **main** avec le jeton GitHub Actions. Si la politique
du dépôt interdit aux Actions de créer une PR, le compte rendu le signale et il
faut l’ouvrir depuis le lien de comparaison GitHub.

On peut aussi lancer manuellement le workflow **Déployer** (`deploy.yml`), en choisissant
la branche de préparation et `prepare_only=true`. Il réutilise les secrets
Cloudflare GitHub Actions existants et ne lance pas de déploiement. Une exécution
sur une branche autre que main ne peut lancer que cette préparation.

Alternative depuis une machine ayant l'accès Cloudflare D1/R2 en lecture :

```bash
npm ci
node scripts/prepare-production.mjs --release boutique-tournois-2026-11
```

Le dossier privé ignoré `.production-preparation/<reprise>/` contient :

- `source.json` : contenus staging sélectionnés, sans transactions de test ;
- `target.json` : état de référence des contenus production ;
- `shop.sql`, `tournaments.sql`, `settings.sql` : imports proposés, à relire ;
- `media/` et `manifest.json` : fichiers téléchargés, clés R2 source/destination,
  sommes SHA-256, tailles, bases cibles et nombres d’articles/tournois.
  Si la lecture directe R2 est refusée, la préparation essaie uniquement les
  URLs publiques des médias du Worker staging, avec HTTPS vérifié et refus
  des redirections/pages de connexion. `retrieved_via` précise la méthode.
  `--media-source r2` interdit ce repli ; `--media-source public` le force.

Un téléchargement incomplet ne produit pas de manifeste final. Les artefacts
Actions expirent après 7 jours. Les garder dans un espace privé du club,
jamais dans un commit. Ce script n’écrit ni D1 ni R2 en production. Le compte rendu sans données
privées (statut, nombres de contenus, empreintes SQL et URL de PR) est publié
sur `release/production-preparation-report`. Les dumps et médias restent dans
l’artefact privé, pas dans Git.

Si la base TOURNAMENTS production n'est pas encore configurée, l'état de
référence des tournois est lu dans l'ancienne DB. Ce premier export permet la
revue ; refaire une préparation après l'initialisation de la vraie destination
avant d'utiliser les SQL pour une bascule.

## Configuration indispensable de la production

`node scripts/check-production.mjs` signale les champs encore absents. Ce contrôle
est aussi exécuté avant les migrations du workflow de déploiement.

1. Renseigner les vrais UUID **distincts** de `ORDERS` et `TOURNAMENTS` production
   dans `wrangler.jsonc`. Les UUID nuls sont des prérequis non remplis, jamais des
   destinations d'import. Ne pas utiliser les UUID staging.
2. Appliquer leurs migrations et initialiser les tournois existants de production
   avec `scripts/copy-tournaments.mjs --env production --apply`, après sauvegarde
   et fermeture des anciennes inscriptions, conformément à `TOURNOIS-V5.2.md`.
   Cette copie concerne l'historique réel de production, pas celui du staging.
3. Configurer Cloudflare Access sur les URLs de production : issuer et audiences
   boutique/tournois vérifiées, puis responsables autorisés dans les bases cibles.
4. Sur le Worker **fce-escalquens**, vérifier les secrets `TRACKING_SECRET`,
   `HELLOASSO_CLIENT_ID`, `HELLOASSO_CLIENT_SECRET`, `SMTP_PASSWORD`.
   Les identifiants HelloAsso doivent être ceux du compte de production.
   Ne pas remplacer une clé TRACKING_SECRET déjà utilisée en production.
5. Le slug réel HelloAsso confirmé par le club est `fce` :

```bash
node scripts/configure-helloasso.mjs --env production --slug fce --origin https://fcescalquens.fr
node scripts/configure-ovh-mail.mjs --env production
node scripts/check-production.mjs
```

Ne pas copier intégralement `ORDERS.settings` de staging. `settings.sql` reprend
uniquement vendeur, contact du club, lieu/consignes et délais de retrait, via une
liste explicite de champs. Il impose le slug production confirmé `fce` et laisse
paiement et validation juridique fermés pour revue. Aucun jeton, secret ou réglage
Sandbox n’est repris. Les deux modules utilisent ces paramètres communs de
ORDERS production.

## Bascule des contenus après revue

Cette section décrit des écritures réelles, à effectuer seulement après validation
du manifeste, des réglages et de la PR. Ne pas automatiser l'import dans chaque
déploiement : cela écraserait les modifications ultérieures faites en production.

1. Fermer les ventes et inscriptions concernées. Sauvegarder DB, ORDERS,
   TOURNAMENTS production et conserver les sauvegardes privées hors Git.
2. Vérifier/apppliquer les migrations, initialiser les bases, puis refaire la
   préparation à partir de l'état réel des destinations. Comparer slugs, quantités,
   tarifs, champs de formulaires et indicateurs obligatoires.
3. Vérifier chaque SHA-256 du manifeste avant l’envoi des médias. Pour chaque
   entrée média, envoyer le fichier local vers **exactement** `target_bucket /
   target_key` avec `wrangler r2 object put --remote --file`, en conservant le type
   MIME approprié. Vérifier le fichier relu depuis la destination. Ne pas remplacer
   les anciennes clés R2 du site.
4. Exécuter `shop.sql` uniquement sur DB production, et `tournaments.sql`
   uniquement sur TOURNAMENTS production. `settings.sql` s’exécute uniquement sur
   ORDERS et ne touche que les champs métier de configuration, pas les commandes.
   Garder les services fermés si une étape
   échoue : vérifier/restaurer la sauvegarde concernée avant toute reprise.
5. Vérifier `PRAGMA foreign_key_check`, quantités et tarifs dans les destinations,
   ainsi que le chargement HTTP des images. Vérifier que les données réelles de
   commandes/inscriptions et leurs états de paiement n'ont pas changé.
6. Fusionner la PR dans main, vérifier le déploiement, tester les parcours sur le
   domaine réel, puis seulement rétablir les états d’ouverture de staging enregistrés dans
   `desired_shop_enabled` et `desired_tournament_sales` du manifeste.

## Tester HelloAsso production sans transfert d'argent

Dans `/admin-boutique/parametres/`, utiliser **Tester HelloAsso sans paiement**.
Le même test est disponible dans l'administration des tournois.

Le serveur choisit `https://api.helloasso.com` avec `APP_ENV=production`, obtient
un jeton OAuth via `/oauth2/token`, puis effectue uniquement les lectures
`GET /v5/users/me/organizations` et `GET /v5/organizations/<slug>`.
Il vérifie l'association accessible et l'indicateur d'autorisation d'encaissement.
Aucune intention de paiement, commande HelloAsso ou transaction n'est créée.
Le test peut écrire un jeton **chiffré** dans le cache OAuth du Worker.

Ce résultat ne teste pas le parcours bancaire, les droits Checkout jusqu'à leur
utilisation, la réception des webhooks ou un encaissement effectif. La transaction
complète se teste en Sandbox avec les moyens de test HelloAsso. Ne pas utiliser
une vraie carte en production pour ce contrôle de connexion.

## Envoi aux vrais destinataires

En production, `mailRecipient` adresse le suivi à l'e-mail du client et les
notifications club au `contact_email` vérifié dans les paramètres. `MAIL_TEST_TO`
ne détourne pas ces messages ; il ne sert qu'au bouton d'envoi de test explicite.
En staging, tous les messages restent dirigés vers le destinataire de test.

Vérifier le contact de production, l'expéditeur OVH, SMTP_PASSWORD et la réception
sur une boîte contrôlée par le club avant ouverture. Pour activer ce bouton :

```bash
node scripts/configure-ovh-mail.mjs --env production --test-to ADRESSE_CONTROLEE_PAR_LE_CLUB
```

Après déploiement de cette variable, le club peut cliquer **Tester l'envoi d'un
e-mail**. Vérifier la réception effective (et les indésirables), puis les états
des files mail boutique et tournois. Une acceptation SMTP n'est pas une preuve de
réception en boîte. Aucun message à des clients n'est envoyé par la préparation.
