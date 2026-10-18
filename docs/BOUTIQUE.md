# Guide technique boutique

Pour une installation pas à pas **sans compte HelloAsso**, commencer par [INSTALLATION-STAGING.md](INSTALLATION-STAGING.md). La branche de préproduction s’appelle désormais `staging` ; l’administration boutique est entièrement sous `/admin-boutique/`.

# Boutique FCE : installation, exploitation et recette

Cette évolution conserve les catégories, articles, images et descriptions du site Astro. Elle remplace le formulaire `mailto:` par un panier et un paiement **exclusivement HelloAsso**. Aucun compte client, mot de passe, code PIN client ou validation d’e-mail préalable n’est ajouté.

## Parcours et écrans

- `/boutique/` : choix obligatoire d’une variante (taille/couleur), options propres à l’article, texte de personnalisation, quantité, panier modifiable, coordonnées, remise par coach ou rendez-vous au club, acceptation des CGV et paiement.
- `/boutique/suivi/` : détail de cette seule commande, paiement vérifié, quantités reçues, actualités, reprise du paiement si possible, CGV acceptées et enquête après paiement. Un formulaire permet de recevoir à nouveau le lien avec référence + e-mail. Sa réponse ne révèle pas si la commande existe.
- `/admin-boutique/` : commandes filtrables et paginées, vérification HelloAsso, suivi des quantités, messages publics et notes internes séparés, historique, diagnostic des mails, révocation du lien et bon fournisseur individuel. Onglets catalogue et visuels, tailles et options, paramètres et satisfaction.
- `/cgv/`, `/confidentialite/`, `/cookies/`, `/mentions-legales/` : informations actualisées. Les CGV exactes acceptées sont figées avec la commande et envoyées dans le mail.

Le panier est propre à l’onglet (`sessionStorage`). Il ne stocke pas les coordonnées du formulaire. Une clé d’idempotence et une empreinte de la soumission permettent de reprendre une requête réseau sans créer deux commandes. Une modification après une validation incertaine est bloquée : consulter le suivi avant de recommencer.

## Deux bases par environnement

| Binding | Production | Staging | Contenu |
| --- | --- | --- | --- |
| `DB` | `fce-escalquens` | `fce-escalquens-staging` | Site, catalogue, variantes, options, administrateurs |
| `ORDERS` | `fce-escalquens-orders` | `fce-escalquens-orders-staging` | Commandes, lignes figées, paiements, paramètres, événements, file mail, avis |

Les quatre bases doivent avoir des UUID distincts. Pour installer uniquement le staging maintenant, créez seulement `fce-escalquens-orders-staging` et renseignez son UUID avec `--staging-id` : la base commandes de production peut attendre. **Les UUID des deux nouvelles bases sont volontairement non renseignés** : le script de vérification interdit un déploiement incomplet. Les bases existantes ne sont pas recréées.

```bash
npx wrangler d1 create fce-escalquens-orders --jurisdiction eu
npx wrangler d1 create fce-escalquens-orders-staging --jurisdiction eu
node scripts/configure-orders.mjs --production-id UUID_PRODUCTION --staging-id UUID_STAGING
node scripts/configure-orders.mjs --check staging
node scripts/configure-orders.mjs --check production
```

Vérifier les options de juridiction proposées par votre compte Cloudflare et les contrats applicables. Une localisation de base ne dispense pas d’encadrer les autres traitements du prestataire.

Migrations :

```bash
npx wrangler d1 migrations apply DB --remote --env staging
npx wrangler d1 migrations apply ORDERS --remote --env staging
# Après recette, sur la production :
npx wrangler d1 migrations apply DB --remote --env=""
npx wrangler d1 migrations apply ORDERS --remote --env=""
```

`migrations/0029_shop_checkout.sql` concerne uniquement le catalogue. `migrations-orders/` concerne uniquement les commandes et les habilitations boutique (`0002_shop_admins.sql`). Aucun lien SQL entre bases : les références et prix sont copiés à l’achat. Les workflows de déploiement appliquent les deux séries de migrations.

Le workflow existant production → staging ne manipule que `DB` : ne jamais y ajouter `ORDERS`. Les commandes et leurs liens ne doivent pas être copiés. Les paramètres, clés et données de test sont propres au staging.

## Cloudflare Access : configuration par le club

La boutique dispose de sa propre application Access et de sa propre liste `ORDERS.shop_admins`. Aucun droit n’est repris automatiquement depuis `DB.admins`.

Créer une application Access utilisant le PIN par e-mail et une liste d’adresses autorisées, couvrant **les deux chemins** :

- `/admin-boutique` et `/admin-boutique/*` ;
- les API sont incluses dans `/admin-boutique/api/*`, sans passer par `/admin-api/`.

Les règles du site restent sur `/admin`, `/admin/*` et `/admin-api/*`. Évitez un motif trop large `/admin*`, qui engloberait les deux espaces.

Configurer chaque hôte utilisé, y compris l’éventuel `workers.dev` de staging ; supprimer ou protéger les autres routes d’accès au Worker. Ne pas protéger tout le site avec Access : HelloAsso doit joindre le webhook et le client doit acheter sans compte.

Définir les variables Worker :

```text
CF_ACCESS_ISSUER=https://VOTRE-EQUIPE.cloudflareaccess.com
CF_ACCESS_SHOP_AUD=IDENTIFIANT_AUDIENCE_APPLICATION
SHOP_ORIGIN=https://HOTE_EXACT_DU_SITE
```

Si l’interface et l’API utilisent deux applications Access, séparer les deux audiences par une virgule. L’adresse authentifiée doit aussi exister et être active dans la table `shop_admins` de `ORDERS`. Le Worker boutique vérifie la signature RS256, l’émetteur, l’audience et l’expiration du JWT `Cf-Access-Jwt-Assertion`. Un en-tête `cf-access-authenticated-user-email` forgé ne suffit pas. Le raccourci `DEV_ADMIN_TOKEN` est limité à `APP_ENV=local` sur `localhost`/`127.0.0.1` ; il ne fonctionne ni en staging ni en production.

## HelloAsso : séparation imposée côté serveur

- `APP_ENV=staging` ou `local` → `https://api.helloasso-sandbox.com`.
- `APP_ENV=production` → `https://api.helloasso.com`.
- Une valeur absente ou inconnue reste en sandbox. Pas de bascule modifiable dans le navigateur.

Les paramètres du backoffice contiennent le slug de l’association et l’état de configuration, pas les secrets. Créer un client HelloAsso Sandbox distinct du client réel. L’association doit être vérifiée et le client autorisé pour Checkout et AccessTransactions.

```bash
npx wrangler secret put HELLOASSO_CLIENT_ID --env staging
npx wrangler secret put HELLOASSO_CLIENT_SECRET --env staging
npx wrangler secret put TRACKING_SECRET --env staging
# Mêmes noms sur la production, avec d’autres valeurs : omettre --env staging.
```

Générer une clé `TRACKING_SECRET` aléatoire d’au moins 32 caractères (recommandation : 32 octets aléatoires encodés en hexadécimal). Ne jamais commiter cette clé ni l’afficher dans des logs. Les variables et secrets Cloudflare sont à définir **dans chaque environnement**, car ils ne sont pas tous hérités.

Déclarer dans HelloAsso les notifications `Order` et `Payment` vers :

```text
https://HOTE_EXACT_DU_SITE/api/shop/helloasso/webhook
```

Ce chemin contourne l’ancien verrou Basic-auth du site de test, pas les vérifications de paiement. Les API de suivi, qui utilisent leur propre jeton Authorization, contournent également ce verrou pour éviter un conflit entre les deux en-têtes ; elles restent systématiquement protégées par le jeton propre à la commande. Une règle Access globale bloquerait les notifications : utiliser des règles ciblées. Si votre offre partenaire fournit une `signatureKey`, l’ajouter comme secret `HELLOASSO_WEBHOOK_SECRET`. Le HMAC SHA-256 est vérifié sur les octets exacts du corps. Cette signature n’étant pas proposée à toutes les associations, son absence n’empêche pas l’intégration : **le corps du webhook n’est jamais une preuve de paiement**. Il déclenche une relecture OAuth de l’intention connue. Le montant, l’association, le type Checkout et les paiements autorisés sont vérifiés.

Le retour utilisateur `code=succeeded` ne valide rien. Une notification répétée ne recrée ni ligne de paiement ni confirmation. Une tâche toutes les cinq minutes réconcilie aussi les commandes, même si le navigateur a été fermé ou une notification perdue. La contribution volontaire HelloAsso est distincte du montant boutique ; la recette doit vérifier les montants effectivement renvoyés par le compte Sandbox.

Les états distincts incluent attente, payé, refusé, vérification, remboursement en cours/partiel/complet et contestation. Le remboursement se fait dans HelloAsso puis est synchronisé ; le backoffice ne simule jamais un remboursement ou un paiement manuel.

### Paiement interrompu ou réponse incertaine

Une seule tentative active par commande est permise par un index SQL. Un retour en arrière peut reprendre l’intention existante. Après 45 minutes et une relecture API sans commande associée, une tentative peut être expirée et une nouvelle créée. L’ancienne reste suivie : un encaissement tardif ou multiple est détecté.

Si la création a expiré côté réseau **sans identifiant d’intention reçu**, la tentative est marquée `uncertain`. Aucun deuxième encaissement automatique n’est lancé. Rechercher la référence dans HelloAsso, récupérer l’identifiant puis le renseigner dans le détail de commande, rubrique « Tentatives de paiement ». Le serveur vérifie les metadata `order_id` et `attempt_id` avant de rattacher l’intention. Si une notification fournit entre-temps les références nécessaires, cette récupération est tentée automatiquement, avec les mêmes vérifications API. Ne pas effacer une tentative incertaine pour débloquer un client sans vérification HelloAsso.

## Mails : choix conseillé et configuration

**Cloudflare Email Service** permet maintenant l’envoi transactionnel depuis un Worker. Il est distinct du simple transfert d’e-mails Email Routing. Utiliser une adresse du domaine, par exemple `boutique@fcescalquens.fr`, après vérification du domaine d’envoi et de SPF/DKIM/DMARC.

Le transport Cloudflare est implémenté avec le builder `env.EMAIL.send({from,to,subject,text,html,replyTo})`. Après activation du service, ajouter le binding dans la configuration, à la racine **et dans `env.staging`** :

```json
"send_email": [{ "name": "EMAIL" }]
```

Variables par environnement :

```text
MAIL_PROVIDER=cloudflare
MAIL_FROM=boutique@fcescalquens.fr
MAIL_TEST_TO=ADRESSE_DU_TESTEUR
```

`MAIL_TEST_TO` est obligatoire hors production. **Tous** les mails de staging sont redirigés vers ce destinataire et préfixés `[TEST]`, même si le formulaire contient une vraie adresse de client. Les réponses aux mails vont au contact boutique configuré dans les paramètres.

Une alternative HTTPS est implémentée :

```text
MAIL_PROVIDER=resend
MAIL_FROM=boutique@fcescalquens.fr
RESEND_API_KEY=secret_worker
```

Déclarer et contractualiser le prestataire choisi, vérifier ses limites et sa délivrabilité. Le binding `EMAIL` n’est pas ajouté tant que le service n’est pas activé ; l’absence de transport configuré empêche l’ouverture des ventes.

**OVH** : une boîte du domaine peut servir au contact et à la réception des réponses, tout en envoyant les confirmations via Cloudflare. Cela permet de garder une identité `@fcescalquens.fr`. Le transport SMTP OVH direct n’est pas implémenté dans cette version.

**Gmail** : l’API Gmail permet techniquement l’envoi avec OAuth et le droit `gmail.send`, mais impose la gestion des autorisations, du renouvellement des jetons et des quotas. Ce transport n’est pas implémenté ici. Une adresse Gmail peut servir de contact de réponse, pas d’expéditeur Cloudflare non vérifié. Éviter le mot de passe personnel d’une boîte dans le site.

### File d’envoi et erreurs

Les confirmations de commande, paiement, préparation et récupération sont mises dans une outbox D1. Les transactions de création et de mise à jour ajoutent les événements et mails ensemble. Chaque mail métier a une clé unique. Le traitement immédiat est doublé par le cron : reprise exponentielle jusqu’à huit tentatives, puis état `failed` visible dans le backoffice. Le gestionnaire peut relancer les échecs. Les erreurs stockées sont des codes, jamais le contenu du mail ou le jeton.

Un prestataire peut avoir accepté un mail juste avant une panne réseau : la livraison est « au moins une fois », un doublon exceptionnel reste possible. Le transport Resend utilise en plus une clé d’idempotence. L’état `sent` signifie accepté par le transport, pas une preuve que le mail a été lu ou est arrivé en boîte principale. Surveiller aussi les rejets et suppressions dans le tableau de bord du prestataire.

## Ouverture de la boutique

1. Protéger Access et configurer les variables/secrets ; appliquer les migrations sur les bonnes bases.
2. Dans `/admin-boutique/`, onglet « Catalogue et visuels », conserver et vérifier catégories, articles, images, couverture, PDF, délais et descriptifs. L’affichage de la boutique et l’ouverture des paiements sont deux réglages distincts.
3. Dans « Tailles et options », saisir les variantes exactes : libellé, taille, couleur, référence fournisseur, fournisseur et prix numérique. Ajouter les options et leur supplément, ainsi que la longueur du texte autorisé. Les prix indicatifs historiques ne sont **pas** utilisés pour encaisser.
4. Vérifier les références et tarifs avec Intersport/Kappa. Les variantes ne sont pas inventées ni activées automatiquement. Le prix de vente affiché sur la fiche historique doit être cohérent avec les variantes.
5. Dans « Paramètres », compléter vendeur, adresse, identifiant légal/mentions fiscales, téléphone, contact, adresse de retrait, délai maximal **réellement tenable** et médiateur compétent. Faire vérifier les CGV et informations RGPD par le club. Ne pas inventer un médiateur.
6. Confirmer la vérification légale puis ouvrir les commandes de test. L’ouverture est refusée si la configuration requise manque.
7. Effectuer la recette Sandbox ci-dessous. La mise en production nécessite des clés réelles distinctes et sa propre configuration.

## Gestion quotidienne et fournisseur

Le paiement et la préparation sont indépendants. Préparation : `new` → `ordered` → `partial` → `ready` → `delivered`, ou `cancelled`. Une commande doit être payée pour être préparée/remise. Les quantités reçues sont comprises entre 0 et la quantité commandée ; les quantités remises ne dépassent pas les reçues. L’état « disponible » exige réception complète, l’état « remis » exige remise complète. Les modifications concurrentes sont détectées par version ; recharger avant de réessayer.

L’export **unitaire**, disponible uniquement pour une commande payée et non annulée, est un document HTML imprimable (enregistrement PDF possible depuis le navigateur). Il contient référence fournisseur, article/couleur/taille, quantité et personnalisations exactes. Il ne contient ni téléphone ni e-mail du client, ni prix de vente utilisé à tort comme prix d’achat. Le bon est téléchargé ; il n’est jamais envoyé automatiquement au fournisseur. Marquer séparément la commande comme commandée après transmission.

Les notes internes restent privées. Le message public apparaît sur le suivi et dans les prochains mails. Une annulation n’effectue pas de remboursement ; traiter celui-ci dans HelloAsso.

L’enquête après paiement comprend trois notes 1–5 (facilité de commande, qualité du catalogue et expérience globale), plus un commentaire facultatif. Une réponse par commande ; aucun avis public. Elle ne prétend pas mesurer la qualité physique d’un article non reçu.

## Sécurité et conservation

Le jeton du lien est un HMAC-SHA-256 de l’identifiant et de sa version avec une clé serveur aléatoire. Il est imprévisible sans la clé, reproductible pour l’envoi des mails sans stocker son texte, et **seul son SHA-256 figure en base**. Modifier la version révoque le lien précédent. Une rotation globale de `TRACKING_SECRET` doit être planifiée : régénérer les hashes et renvoyer les liens pour les commandes concernées, ne pas simplement remplacer la clé en exploitation.

Le lien utilise un fragment `#id.jeton`, absent des requêtes HTTP et des referers. Le navigateur le retire de la barre d’adresse et l’utilise dans l’en-tête Authorization, sans cookie de compte client. Les retours HelloAsso ne transmettent pas l’accès par un identifiant devinable. Le suivi expose le prénom et les informations utiles, pas le téléphone, l’e-mail, le nom de famille ou les notes internes. Réponses privées non mises en cache et `Referrer-Policy: no-referrer`.

Expiration initiale de 180 jours ; prolongation pendant le traitement d’une commande payée ; clôture = 90 jours de suivi supplémentaires. Le client peut demander un nouveau lien. Ce lien est un secret porteur : le transmettre donne accès à son suivi. Ne jamais le copier dans un ticket public, un outil d’analyse ou des logs. La collecte des corps de requêtes et des en-têtes Authorization doit rester désactivée dans vos outils de diagnostic.

Le cron purge les commandes sans paiement/tentative à vérifier après 30 jours, les avis après 12 mois, les métadonnées de mails envoyés après 90 jours et les commandes closes après 10 ans. Les commandes incertaines nécessitent une résolution ; elles ne sont pas supprimées aveuglément. Les commandes closes restent réservées aux responsables pour l’archivage et les obligations applicables. Désactiver l’export de corps de requêtes et évaluer les durées des logs Cloudflare séparément.

Les textes RGPD indiquent finalités, bases légales, destinataires, droits et durées. Le club doit compléter son registre, ses contrats de sous-traitance, les garanties de transfert et la procédure d’accès/rectification/effacement. Pour un litige ou une obligation de conservation exceptionnelle, suspendre la purge de la commande concernée avant l’échéance. La sauvegarde et la restauration de `ORDERS` sont à organiser séparément de `DB` ; tester D1 Time Travel selon les capacités de votre offre.

## Tests automatisés et recette de staging

Prérequis : Node 24, `npm ci`.

```bash
npm test
npm run typecheck:shop
npm run build
npx wrangler deploy --dry-run --env local
```

Les 24 tests exécutent les API et le SQL de production sur deux vraies bases SQLite en mémoire via un adaptateur D1 de test. Ils couvrent prix/options, idempotence, origines interdites, minimisation, faux retours de paiement, notifications répétées, remboursements, quantités/concurrence, enquête, rotation/expiration, récupération, reprise des mails, purge et paiement incertain. Les appels HelloAsso et le transport mail sont simulés. Cela ne remplace pas une recette avec HelloAsso Sandbox, la vraie D1 et Cloudflare Access.

En staging, vérifier au minimum :

- Mobile/desktop, navigation clavier, choix de taille, option sans texte refusée, deux personnalisations distinctes, retrait/modification du panier, changement de prix et article retiré du catalogue.
- Réception et lisibilité du mail chez le testeur, lien sans compte, lien invalide/expiré/révoqué, récupération avec bonne et mauvaise adresse ; aucune information d’existence dans la réponse.
- Paiement Sandbox accepté/refusé/abandonné, retour arrière, fermeture de la page après encaissement, notification différée et répétée, contribution volontaire, panne de création et reprise sans doublon.
- JWT absent/expiré/mauvaise audience, email non autorisé, tentative d’accès direct aux API et au fichier `index.html` du backoffice.
- Bon fournisseur individuel, références et personnalisation, réception/remise partielles, conflit de modification entre deux gestionnaires, annulation et remboursement.
- Mail indisponible puis rétabli, épuisement des reprises et relance depuis le backoffice.
- Trois notes, commentaire facultatif, second avis refusé, statistiques et absence d’avis publics.
- Aucune commande réelle ou clé de production en staging ; vérifier que le cron tourne toutes les cinq minutes.

## Développement local

```bash
cp .dev.vars.example .dev.vars.local
# Remplir les valeurs Sandbox ; ne jamais utiliser de clés de production.
npm run db:migrate:local
npm run db:migrate:orders:local
npm run build
npx wrangler dev --env local
```

Utiliser `http://localhost:8787` comme `SHOP_ORIGIN`. En local, la page de gestion demande `DEV_ADMIN_TOKEN` puis l’envoie uniquement aux API locales. Importer un catalogue de test et ses images si nécessaire. La base locale est volontairement distincte du site distant. Aucun mail factice n’est marqué « envoyé » si aucun transport n’est branché.

## Références vérifiées

- HelloAsso Checkout : https://dev.helloasso.com/docs/int%C3%A9grer-le-paiement-sur-votre-site
- Validation et réconciliation : https://dev.helloasso.com/docs/validation-de-vos-paiements
- Environnements et OAuth : https://dev.helloasso.com/docs/api-overview
- Signature partenaire : https://dev.helloasso.com/docs/secure-webhook
- États de paiement : https://dev.helloasso.com/reference/get_payments-paymentid
- Cloudflare Email Service : https://developers.cloudflare.com/email-service/
- API Worker d’envoi : https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
- Validation Access JWT : https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- Gmail API : https://developers.google.com/workspace/gmail/api/guides/sending
- CNIL, exemple d’information clients : https://www.cnil.fr/fr/exemple-dinformation-clients-dun-site-de-vente-en-ligne-prospection-par-courriel-et-transmission-de
- CNIL, durées : https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees
- CGV : https://entreprendre.service-public.gouv.fr/vosdroits/F33527

## V5.1 : HelloAsso Sandbox et tournois

La procédure cumulative depuis la V4, la configuration réelle du compte Sandbox `fce`, les URL webhook/retour, les secrets Worker et la recette des inscriptions figurent dans [BOUTIQUE-V5.1-INSTALLATION.md](BOUTIQUE-V5.1-INSTALLATION.md). Elle remplace l’installation séparée de la V5 si celle-ci n’a pas été appliquée. Les inscriptions privées et paiements sont administrés dans `/admin-tournois/`, avec `CF_ACCESS_TOURNAMENT_AUD` et la liste distincte `ORDERS.tournament_admins`. La présentation éditoriale des tournois reste gérée par l’administration du site.
