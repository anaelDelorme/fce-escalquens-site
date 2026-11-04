# PR vers main : boutique et tournois

Branche de préparation : `release/boutique-tournois-production`. Base de la PR :
`main`. La branche reprend staging et les changements déjà présents sur main.
La fusion déclenche un déploiement réel : compléter les prérequis ci-dessous
avant de fusionner. Le push de la branche exécute uniquement la préparation en lecture ; aucun import ni déploiement production n’est exécuté par ce push.

La reprise de production a été effectuée et contrôlée :
[initialisation et migrations](https://github.com/anaelDelorme/fce-escalquens-site/actions/runs/41818523633),
puis [import](https://github.com/anaelDelorme/fce-escalquens-site/actions/runs/41833330766).
Le résultat est de 38 articles, 365 déclinaisons, 6 personnalisations, 1 tournoi et
40 médias, avec sauvegardes chiffrées, transactions conservées et ventes fermées.
Les procédures d'initialisation/import ci-dessous documentent cette opération ;
la prochaine étape est la fusion de la PR, puis les diagnostics après déploiement.

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

Un téléchargement incomplet ne produit pas de manifeste final. Le dépôt étant
public, les artefacts GitHub Actions contiennent uniquement une archive `.fce`
chiffrée (AES-256-GCM, clé dérivée par scrypt). La clé d'au moins 32 caractères
est fournie par le secret **GitHub Actions** `PRODUCTION_ARCHIVE_PASSWORD`,
distinct des quatre secrets du Worker. La conserver dans l'espace sécurisé du
club ; elle est nécessaire pour relire/restaurer les archives. Sans cette clé,
aucune archive en clair n'est publiée. Les anciennes préparations en clair
générées avant le chiffrement sont retirées après conservation de leur
remplacement chiffré, sans toucher aux autres artefacts du dépôt.

Les artefacts de préparation expirent après 7 jours. Les garder dans un espace
privé du club, jamais dans un commit. Ce script n’écrit ni D1 ni R2 en production. Le compte rendu sans données
privées (statut, nombres de contenus, empreintes SQL et URL de PR) est publié
sur `release/production-preparation-report`. Les dumps et médias restent dans
l’archive chiffrée, pas dans Git.

Après téléchargement de l'artefact et extraction du ZIP GitHub, relire son
contenu localement depuis cette branche avec la clé conservée par le club :

```bash
read -rs -p "Clé d'archivage : " PRODUCTION_ARCHIVE_PASSWORD
export PRODUCTION_ARCHIVE_PASSWORD
node scripts/production-archive.mjs --action decrypt --file preparation-NUMERO_RUN.fce --out .production-preparation/relecture-NUMERO_RUN
```

La même commande fonctionne pour `backup-NUMERO_RUN.fce`, en choisissant un
dossier privé de restauration distinct. Une mauvaise clé ou une archive
modifiée est refusée sans conserver de fichier déchiffré partiel.

Si la base TOURNAMENTS production n'est pas encore configurée ou initialisée
(migrations et marqueur de copie `v5.2`), l'état de référence des tournois est lu
dans l'ancienne DB. Le manifeste et le compte rendu indiquent
`production_tournaments_initialized=false` et
`production_tournament_snapshot_from=DB`. Ce premier export permet la revue ;
refaire une préparation après l'initialisation de la vraie destination avant
d'utiliser les SQL pour une bascule.

## Configuration indispensable de la production

`node scripts/check-production.mjs` signale les champs encore absents. Ce contrôle
est aussi exécuté avant les migrations du workflow de déploiement.

1. Les bases production créées par le club sont renseignées dans `wrangler.jsonc` :
   `ORDERS` : `d0ce5147-4c85-43ca-83ca-ef84df8b5626` ;
   `TOURNAMENTS` : `dd0b1d97-3858-4e61-96c9-1e2735d362d0`.
   La préparation vérifie leur existence sans les modifier. Leur création ne
   remplace pas l'application des migrations ni la copie initiale des tournois.
2. Appliquer leurs migrations et initialiser les tournois existants de production
   avec `scripts/copy-tournaments.mjs --env production --apply`, après sauvegarde
   et fermeture des anciennes inscriptions, conformément à `TOURNOIS-V5.2.md`.
   Cette copie concerne l'historique réel de production, pas celui du staging.
3. Les paramètres Cloudflare Access de production fournis par le club sont
   renseignés dans `wrangler.jsonc` : domaine d'équipe
   `https://cold-flower-98c5.cloudflareaccess.com` et audiences distinctes pour
   le site, la boutique et les tournois. Vérifier les chemins et politiques des
   applications dans Zero Trust, puis les responsables autorisés dans les bases
   cibles. L'application site doit couvrir `/admin` et `/admin/*`, sans règle
   large `/admin*` qui recouvrirait les applications boutique et tournois.
   Les applications métier couvrent chacune leur chemin racine et ses enfants :
   `/admin-boutique` et `/admin-boutique/*`, puis `/admin-tournois` et
   `/admin-tournois/*`. Ces valeurs ne déploient ni ne modifient les politiques
   Cloudflare ; la connexion réelle reste à vérifier après déploiement.
4. Sur le Worker **fce-escalquens**, vérifier les secrets `TRACKING_SECRET`,
   `HELLOASSO_CLIENT_ID`, `HELLOASSO_CLIENT_SECRET`, `SMTP_PASSWORD`.
   Les identifiants HelloAsso doivent être ceux du compte de production.
   Ne pas remplacer une clé TRACKING_SECRET déjà utilisée en production.
   Leur présence a été vérifiée après configuration par le club dans le
   [run de préparation 41802970302](https://github.com/anaelDelorme/fce-escalquens-site/actions/runs/41802970302).
   Ce contrôle ne vérifie ni la validité des identifiants HelloAsso ni le mot
   de passe SMTP ; ces diagnostics restent à effectuer sur le Worker déployé.
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

## Opérations manuelles dans GitHub Actions

Le workflow **Déployer** possède un champ `operation`. La valeur par défaut
`preparer` et le push de la branche de préparation restent en lecture.
`initialiser` et `importer` sont des lancements manuels qui écrivent en
production ; ils ne déploient pas le Worker. Les opérations et déploiements du
workflow sont sérialisés. Ne pas modifier les contenus depuis l'administration
pendant leur exécution.

Prérequis commun : le secret GitHub Actions `PRODUCTION_ARCHIVE_PASSWORD` doit
être configuré. Les sauvegardes et préparations sont chiffrées avant leur envoi
dans les artefacts du dépôt public ; les fichiers en clair restent dans le runner
éphémère pour l'opération demandée.

### Initialiser les bases

1. Ouvrir **Actions → Déployer → Run workflow**, sélectionner la branche
   `release/boutique-tournois-production`, puis `operation=initialiser`.
2. Renseigner `admin_email` avec l'adresse du premier responsable **à la fois**
   boutique et tournois, déjà autorisée dans les deux politiques Cloudflare Access.
   Aucune adresse de staging ni aucun administrateur du site n'est repris
   automatiquement. Les responsables existants désactivés ne sont pas réactivés.
3. Lancer le workflow. Il vérifie les bases et les noms des quatre secrets,
   sauvegarde les trois D1, puis conserve leurs sauvegardes chiffrées dans l'artefact
   `sauvegarde-production-<run>` **avant toute écriture**. Elles expirent après
   30 jours : les conserver aussi dans un espace privé du club.
4. Le workflow ferme les ventes/inscriptions, applique les migrations du bon
   module sur chaque base, copie l'historique réel des tournois depuis les anciennes
   bases production et crée les deux habilitations explicites. Une copie déjà
   validée n'est pas relancée. Aucun historique de staging n'est importé.
5. Après succès, une nouvelle préparation est créée dans
   `preparation-production-<run>`. Son compte rendu sur
   `release/production-preparation-report` doit indiquer
   `production_tournaments_initialized=true`, avec un `manifest_sha256`.

La case `prepare_only` ne concerne que `operation=preparer` ; la conserver cochée.
Les champs `preparation_run_id` et `manifest_sha256` restent vides pour cette
initialisation. Le catalogue staging n'est pas encore importé à ce stade.

### Importer l'archive relue

1. Télécharger, déchiffrer localement et relire la nouvelle archive après initialisation :
   articles, prix, suppléments obligatoires, tournoi/formulaire, coordonnées du
   vendeur et destinataire club. Vérifier les valeurs du manifeste.
2. Relancer **Déployer** sur la même branche avec `operation=importer`,
   `preparation_run_id=<run de l'archive relue>` et
   `manifest_sha256=<empreinte publiée dans son compte rendu>`.
3. L'import refuse une archive antérieure à l'initialisation, une destination
   différente, un manifeste/SQL/média modifié ou des contenus production changés
   depuis l'export. Les services doivent être fermés. Le SQL est régénéré depuis
   les seules tables autorisées et comparé aux fichiers relus.
4. Les trois bases sont à nouveau sauvegardées et l'artefact est conservé avant
   les écritures. Les images sont envoyées dans leur espace R2 dédié, puis relues
   et comparées par SHA-256 **avant l'import SQL**. Le jeton Cloudflare de GitHub
   Actions doit permettre la lecture et l'écriture des objets R2 production
   (permission de compte **Workers R2 Storage: Edit**). Le repli sur les médias
   publics utilisé pour préparer l'archive ne donne pas de droit d'écriture R2.
5. Les trois SQL sont exécutés sur leurs bases respectives. Le contrôle vérifie
   les références, les articles/tailles, les tarifs boutique/personnalisations,
   les formulaires/tarifs tournois, les médias et l'absence de changement des
   tables de transactions. Les ventes restent fermées pour les diagnostics.

Si une étape d'écriture échoue, une partie des écritures peut avoir eu lieu.
Le compte rendu le signale sans prétendre qu'il n'y a eu aucune modification.
Garder les services fermés et contrôler les sauvegardes avant de reprendre ;
aucune restauration automatique n'écrase d'éventuels paiements arrivés entre-temps.
La procédure de fusion et les diagnostics après déploiement restent ci-dessous.

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
sur une boîte contrôlée par le club avant ouverture. Le bouton de test production
est configuré vers `contact@fcescalquens.fr`. Cette variable sert uniquement au
test explicite ; elle ne redirige pas les messages de commande production.
Pour choisir une autre boîte contrôlée par le club :

```bash
node scripts/configure-ovh-mail.mjs --env production --test-to ADRESSE_CONTROLEE_PAR_LE_CLUB
```

Après déploiement de cette variable, le club peut cliquer **Tester l'envoi d'un
e-mail**. Vérifier la réception effective (et les indésirables), puis les états
des files mail boutique et tournois. Une acceptation SMTP n'est pas une preuve de
réception en boîte. Aucun message à des clients n'est envoyé par la préparation.
