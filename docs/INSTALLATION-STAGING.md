# Installation détaillée — boutique indépendante en staging

Cette procédure installe la boutique sous **`/admin-boutique/`**, sur la branche Git **`staging`**, sans attendre le compte HelloAsso. Elle ne déploie rien sur la production.

## 1. Ce que l’on installe maintenant

| Élément | Disponible sans HelloAsso ? |
| --- | --- |
| Administration boutique indépendante | Oui |
| Catégories, articles, photos, couverture, catalogue PDF | Oui |
| Variantes, tailles, options, références et tarifs exacts | Oui |
| Catalogue public et préparation du panier | Oui |
| Formulaire de coordonnées et choix coach / rendez-vous | Oui, paiement désactivé |
| Paiement, commande enregistrée et suivi client réel | Non, attendre Sandbox |
| Bons fournisseur pour commandes payées, mails de commande et enquête | Code installé ; recette après paiement Sandbox |

Ne renseignez pas de faux identifiants HelloAsso. Ne cochez pas « Ouvrir la prise de commandes » tant que le compte Sandbox et les mails ne sont pas prêts. Aucun règlement au club ni faux paiement n’est ajouté pour contourner cette étape.

## 2. Nouvelle séparation des espaces

| Fonction | Adresse | Autorisation |
| --- | --- | --- |
| Administration du site | `/admin/` | Application Access et table `DB.admins` existantes |
| Administration boutique | `/admin-boutique/` | Nouvelle application Access + `ORDERS.shop_admins` |
| API boutique et chargement de fichiers | `/admin-boutique/api/*` | Même autorisation boutique |
| Boutique publique | `/boutique/` | Sans connexion |
| Suivi d’une commande | `/boutique/suivi/` | Lien personnel, sans compte |

Les catégories, articles, réglages d’affichage, PDF et la couverture ont quitté l’administration du site. Les anciennes API de boutique sous `/admin-api/` ne fonctionnent plus. La couverture `shop_hero` n’est plus listée ni modifiable dans « Photos du site ». Les fichiers restent dans le bucket R2 du staging et le catalogue dans la D1 du site : ce sont les commandes et habilitations boutique qui utilisent `ORDERS`.

Un administrateur du site n’est **pas** administrateur boutique par défaut. Vous pouvez autoriser la même personne dans les deux listes si vous le souhaitez, mais les droits restent distincts.

## 3. Préparer le dépôt et choisir le bon correctif

Prérequis : un clone local ou GitHub Codespaces du dépôt, Node 24 et des droits d’écriture GitHub. Tous les exemples sont à lancer à la racine du dépôt `fce-escalquens-site`.

```bash
git status
git fetch origin
```

Si des modifications locales sont présentes, les enregistrer ou les mettre de côté avant de continuer. Ne pas écraser un travail en cours.

### Cas A — vous avez uniquement lu la première documentation, sans installer le code

Partir de `develop`, qui servait jusqu’ici à la préproduction :

```bash
git switch develop
git pull --ff-only origin develop
git switch -c staging
```

Si une branche `staging` existe déjà, ne pas la recréer : utiliser `git switch staging` et vérifier son contenu avant d’appliquer le correctif.

Télécharger **`fce-boutique-v2-complet.patch`** puis le placer hors du dépôt ou dans le dossier Téléchargements. Adapter le chemin ci-dessous :

```bash
git apply --check ../fce-boutique-v2-complet.patch
git apply ../fce-boutique-v2-complet.patch
```

Ce correctif inclut la première livraison et la séparation demandée. Il est construit sur la révision `0ff4b9d` du dépôt d’origine. Si `--check` signale un conflit parce que le dépôt a évolué, arrêter avant `git apply` ; ne pas utiliser `--reject` ni écraser les fichiers avec une archive. Il faut adapter le correctif à la version courante.

### Cas B — la première version a déjà été appliquée et enregistrée dans Git

Se placer sur la branche qui contient cette première version, puis créer ou sélectionner `staging`. Utiliser **uniquement** `fce-boutique-v1-vers-v2.patch` :

```bash
git apply --check ../fce-boutique-v1-vers-v2.patch
git apply ../fce-boutique-v1-vers-v2.patch
```

Ne jamais appliquer les deux correctifs. L’archive complète `fce-boutique-v2.zip` est fournie pour consultation ou installation dans un dossier neuf ; elle ne doit pas être décompressée par-dessus un dépôt comportant vos modifications.

Le workflow de préproduction livré est désormais déclenché par un push sur **`staging`**, et les workflows de synchronisation de préproduction utilisent aussi cette branche. `main` reste la branche de production. Tant que l’ancienne branche `develop` contient son ancien workflow, un push sur cette branche peut encore réécrire le Worker de préproduction : ne plus l’utiliser pour déployer ce Worker pendant cette recette. Le nom d’environnement Wrangler reste **`staging`** : ce sont deux réglages différents.

## 4. Installer les dépendances et tester le code

```bash
node --version
npm ci
npm test
npm run typecheck:shop
npm run build
```

Résultats attendus : Node 24, 24 tests réussis, contrôle TypeScript et build réussis. Ces tests n’appellent ni HelloAsso ni un service d’e-mail réel.

## 5. Se connecter à Cloudflare

Depuis votre machine ou Codespaces :

```bash
npx wrangler login
npx wrangler whoami
```

Vérifier que le compte affiché contient bien le Worker `fce-escalquens-staging`, la D1 `fce-escalquens-staging` et le bucket `fce-escalquens-media-staging` existants.

Ne pas utiliser `scripts/setup-cloudflare.sh` pour cette mise à jour : ce script historique concerne la création des ressources du site principal.

## 6. Créer uniquement la base commandes du staging

La base catalogue/site existe déjà. Créer une **nouvelle** base réservée aux commandes de test :

```bash
npx wrangler d1 create fce-escalquens-orders-staging --jurisdiction eu
```

Si elle existe déjà, ne pas la recréer. Retrouver son UUID dans le tableau de bord D1. Copier l’UUID retourné puis remplacer `UUID_STAGING` :

```bash
node scripts/configure-orders.mjs --staging-id UUID_STAGING
node scripts/configure-orders.mjs --check staging
```

Vérifier dans `wrangler.jsonc`, section `env.staging.d1_databases` :

- `DB` → `fce-escalquens-staging`, UUID existant ;
- `ORDERS` → `fce-escalquens-orders-staging`, nouvel UUID et `migrations_dir: "migrations-orders"`.

Ces UUID doivent être différents et ne doivent désigner aucune base de production. **La nouvelle D1 commandes de production peut attendre** ; son UUID de remplacement n’empêche pas le déploiement staging. Ne pas exécuter la vérification `--check production` à ce stade.

## 7. Définir l’adresse du staging et les variables non secrètes

Utiliser l’adresse de staging déjà configurée si vous disposez d’un domaine adapté aux règles Access par chemin. Pour une installation propre, un sous-domaine tel que **`staging.fcescalquens.fr`** est recommandé.

Si vous choisissez ce sous-domaine : ajouter dans `env.staging` de `wrangler.jsonc`, au même niveau que `vars` et `d1_databases` :

```json
"workers_dev": false,
"routes": [
  { "pattern": "staging.fcescalquens.fr", "custom_domain": true }
]
```

Ne pas ajouter ces lignes à la racine, qui concerne la production. Si vous utilisez un autre hôte déjà configuré, conserver votre routage et remplacer l’hôte dans les exemples. Un hôte `workers.dev` doit aussi être protégé ; si vos règles Access ne permettent pas la séparation par chemin sur cet hôte, configurer le sous-domaine du club avant la recette.

Dans `env.staging.vars`, conserver les valeurs existantes et compléter :

```json
"APP_ENV": "staging",
"GITHUB_REPOSITORY": "anaelDelorme/fce-escalquens-site",
"STAGING_WORKFLOW_REF": "staging",
"SHOP_ORIGIN": "https://staging.fcescalquens.fr",
"CF_ACCESS_ISSUER": "https://VOTRE-EQUIPE.cloudflareaccess.com",
"CF_ACCESS_SHOP_AUD": "AUDIENCE_APPLICATION_BOUTIQUE"
```

`SHOP_ORIGIN` doit être l’origine HTTPS exacte, **sans slash final**. Remplacer les valeurs Access à l’étape suivante. Ces variables ne sont pas des secrets : les enregistrer dans la configuration du dépôt évite qu’un déploiement ultérieur supprime une valeur ajoutée uniquement dans le tableau de bord.

## 8. Créer l’application Cloudflare Access de la boutique

Dans Cloudflare One / Zero Trust :

1. Ouvrir **Access → Applications**, puis ajouter une application **Self-hosted**.
2. Nom : `FCE — Boutique — Staging`.
3. Configurer l’hôte réel de staging et les chemins **`/admin-boutique`** et **`/admin-boutique/*`** dans cette même application, afin de couvrir la page, ses variantes et toutes les API.
4. Choisir une durée de session adaptée, par exemple huit heures.
5. Créer une politique **Allow** avec une liste explicite des adresses e-mail des responsables boutique.
6. Activer le fournisseur **One-time PIN** (code reçu par e-mail). Ne pas autoriser « tout le monde » et ne pas se limiter au critère « utilise un PIN » : il faut aussi restreindre les adresses.
7. Copier l’**Application Audience (AUD)** dans `CF_ACCESS_SHOP_AUD` et le domaine d’équipe dans `CF_ACCESS_ISSUER`.
8. Conserver les règles du site sur `/admin`, `/admin/*` et `/admin-api/*`. Vérifier qu’elles n’utilisent pas un motif trop large `/admin*`, qui engloberait la boutique.

Ne pas protéger toute la boutique publique ou `/api/shop/helloasso/webhook` avec cette application. Ne pas réutiliser l’audience de l’administration du site pour la boutique.

Le Worker vérifie lui-même le JWT signé, sa validité et sa bonne audience. Même sans règle Access encore opérationnelle, les API boutique restent fermées en l’absence de jeton valide. L’autorisation finale dépend également de `ORDERS.shop_admins`.

Si l’ancien verrou Basic-auth du staging est encore actif, il peut demander une seconde authentification avant le PIN. Le conserver si vous voulez protéger tout le site de test ; la règle Access ciblée reste nécessaire pour les gestionnaires.

## 9. Appliquer les migrations sur le staging uniquement

```bash
npx wrangler d1 migrations apply DB --remote --env staging
npx wrangler d1 migrations apply ORDERS --remote --env staging
```

La seconde commande applique `0001_orders.sql` puis **`0002_shop_admins.sql`**. Si la version 1 était déjà installée, seule la nouvelle migration sera ajoutée ; les commandes existantes sont conservées.

Vérification :

```bash
npx wrangler d1 execute ORDERS --remote --env staging --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

On doit notamment trouver `orders`, `order_items`, `checkout_attempts`, `outbox`, `surveys` et `shop_admins`.

## 10. Autoriser le premier gestionnaire boutique

Remplacer l’adresse de test ci-dessous par l’adresse exacte autorisée dans Access :

```bash
npx wrangler d1 execute ORDERS --remote --env staging --command "INSERT INTO shop_admins(email,name,active) VALUES('vous@example.org','Responsable boutique',1) ON CONFLICT(email) DO UPDATE SET name=excluded.name,active=1;"
npx wrangler d1 execute ORDERS --remote --env staging --command "SELECT email,name,active FROM shop_admins;"
```

Cette liste est indépendante de celle du site. Ajouter chaque gestionnaire boutique dans Access **et** dans `shop_admins`. Pour retirer un droit, le désactiver dans cette table et dans la règle Access :

```bash
npx wrangler d1 execute ORDERS --remote --env staging --command "UPDATE shop_admins SET active=0 WHERE email='vous@example.org';"
```

La désactivation D1 s’applique aux prochains appels API, même si une session Access existe encore.

## 11. Ajouter la clé des liens de suivi

Générer une clé aléatoire :

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copier la valeur dans la saisie masquée de :

```bash
npx wrangler secret put TRACKING_SECRET --env staging
```

Conserver cette clé dans votre gestionnaire de secrets. Ne pas la mettre dans `wrangler.jsonc`, un commit ou une capture partagée. Ne pas la régénérer à chaque déploiement.

**Ne pas encore créer** `HELLOASSO_CLIENT_ID`, `HELLOASSO_CLIENT_SECRET` ou `HELLOASSO_WEBHOOK_SECRET` : ils ne sont pas nécessaires pour la phase catalogue. Les variables mail et le binding d’envoi peuvent également attendre l’étape 15.

## 12. Déployer une première fois, ventes fermées

Vérifier que la branche courante est `staging` :

```bash
git branch --show-current
node scripts/configure-orders.mjs --check staging
npx wrangler deploy --dry-run --env staging
npx wrangler deploy --env staging
```

La dernière commande déploie uniquement `fce-escalquens-staging`. Ne pas utiliser `npm run deploy` ici : cette commande historique cible la configuration principale.

Ouvrir votre hôte de staging, puis `/admin-boutique/`. L’authentification doit demander le PIN Cloudflare. Les paramètres doivent afficher **Sandbox**, sans identifiants HelloAsso configurés. « Commandes » sera vide si aucune commande de test n’a été créée auparavant.

## 13. Préparer le catalogue sans HelloAsso

Dans **Catalogue et visuels** :

1. Vérifier ou créer les catégories.
2. Vérifier les articles et descriptions ; charger une photo pour chaque article à publier.
3. Régler l’article à la une, les articles phares et l’ordre d’affichage.
4. Charger la couverture de la boutique et, si souhaité, le catalogue PDF.
5. Dans **Affichage et PDF**, cocher « Afficher la boutique publique » pour tester le catalogue. Ce réglage n’ouvre pas les paiements.

Dans **Tailles et options** : créer les variantes exactes, références fournisseur, couleurs, tailles et prix numériques. Ajouter les personnalisations et leurs suppléments. Les prix historiques affichés sous forme de texte ne sont pas utilisés pour encaisser.

Dans **Paramètres** : compléter les informations déjà connues du club et le contact. Laisser le slug HelloAsso vide et **« Ouvrir la prise de commandes » décoché**. Il est possible d’enregistrer les informations incomplètes tant que les ventes restent fermées. La confirmation juridique ne doit être cochée qu’après vérification des mentions.

S’il manque les données du catalogue en staging, commencer par les créer ici ou utiliser votre processus de copie existant avec précaution. Le workflow `sync-prod-to-staging.yml` recharge **toute la D1 du site** et efface les modifications de catalogue de staging ; il ne touche pas `ORDERS`. Ne pas le lancer après avoir préparé des variantes de test sans sauvegarde. La copie D1 ne copie pas les fichiers R2 : vérifier les images sur le bucket staging ou les recharger dans l’interface.

## 14. Recette possible dès aujourd’hui et enregistrement Git

Vérifier :

- `/admin/` n’affiche plus les collections boutique ; la couverture n’apparaît plus dans « Photos du site ».
- `/admin-boutique/` permet de gérer toutes les fonctions boutique.
- Un e-mail autorisé au site seulement n’accède pas à la boutique ; un responsable boutique n’a pas besoin de droit site.
- Une adresse non autorisée est refusée, y compris lors d’un accès direct à une API.
- Le catalogue, les tailles, les options et le panier fonctionnent en mobile et au clavier.
- Le paiement est désactivé avec un message explicite. Aucun clic ne crée de commande ou d’encaissement sans HelloAsso.

Puis enregistrer les changements **sans les secrets** :

```bash
git status
git add .
git diff --cached --check
git commit -m "Installe la boutique indépendante en staging"
git push -u origin staging
```

Vérifier auparavant la liste des fichiers ajoutés : aucun `.dev.vars.local`, aucune clé, aucun export de données personnelles. Le workflow **Déployer la préproduction** teste, migre et déploie sur `staging`. Il doit disposer des secrets GitHub `CLOUDFLARE_ACCOUNT_ID` et `CLOUDFLARE_API_TOKEN` existants, avec les droits sur la nouvelle D1 également. Les secrets HelloAsso sont des **secrets Worker**, pas des secrets à recopier en clair dans GitHub.

En cas de refus de push GitHub, la connexion utilisée doit avoir les droits d’écriture au dépôt. La livraison précédente n’a pas créé de branche distante pour vous.

## 15. Quand HelloAsso sera prêt : seconde phase

La création du compte réel peut continuer en parallèle. Pour tester les paiements, HelloAsso propose un **environnement Sandbox distinct** : créer une association fictive sur `https://www.helloasso-sandbox.com/`. La documentation HelloAsso demande une validation avec des documents fictifs avant le premier paiement de test. Si la validation n’avance pas, contacter leur support API ; ne pas utiliser de clés réelles pour débloquer le staging.

Ensuite seulement :

1. Obtenir les identifiants API Sandbox et le slug de l’association fictive, avec les droits Checkout et AccessTransactions.
2. Ajouter les secrets :

```bash
npx wrangler secret put HELLOASSO_CLIENT_ID --env staging
npx wrangler secret put HELLOASSO_CLIENT_SECRET --env staging
```

3. Configurer dans HelloAsso les notifications `Order` et `Payment` vers `https://VOTRE-HOTE-STAGING/api/shop/helloasso/webhook`. La clé de signature webhook est facultative pour les comptes qui ne disposent pas de cette fonctionnalité partenaire ; les paiements sont toujours relus par l’API.
4. Activer Cloudflare Email Service ou le transport Resend, vérifier le domaine expéditeur et remplir `MAIL_PROVIDER`, `MAIL_FROM` et **`MAIL_TEST_TO`** dans `env.staging.vars`. Avec Cloudflare, ajouter également `"send_email": [{"name":"EMAIL"}]` dans `env.staging`. Avec Resend, ajouter son secret API à cet environnement. La configuration détaillée est dans `BOUTIQUE.md`.
5. Redéployer : `npx wrangler deploy --env staging`.
6. Dans `/admin-boutique/`, compléter le slug Sandbox, les coordonnées légales, le médiateur, l’adresse de rendez-vous et le délai maximal réellement tenable. Vérifier les CGV et la confidentialité, puis ouvrir les commandes **de test**.
7. Faire une première commande avec une carte de test recommandée par HelloAsso. Vérifier le retour, le mail reçu par le testeur, le suivi, le bon individuel, les réceptions et l’enquête.
8. Tester refus/abandon, fermeture du navigateur, doublon de notification et mail en échec. Ne pas tester avec une vraie carte ou une commande client réelle.

L’activation en production constituera une étape séparée : autre D1 commandes, autre application Access, identifiants HelloAsso réels et configuration mail réelle. **Ne pas fusionner sur `main` pour cette première installation.**

## Dépannage rapide

| Symptôme | Vérification |
| --- | --- |
| « Cloudflare Access doit être configuré » | `CF_ACCESS_ISSUER`, audience dédiée `CF_ACCESS_SHOP_AUD` et déploiement sur le bon environnement |
| Session Access invalide | Audience de l’application boutique, domaine d’équipe, expiration ; se déconnecter puis redemander un PIN |
| Adresse sans droits boutique | Présence active dans `ORDERS.shop_admins`, pas seulement dans `DB.admins` |
| ORDERS introuvable / table manquante | UUID et migrations `--env staging`, binding `ORDERS` correctement déclaré |
| Page introuvable | Nouvelle URL `/admin-boutique/`, routage Worker et déploiement de la version 2 |
| Articles absents | Affichage boutique ouvert, catégorie et article actifs, photo renseignée |
| Article visible mais non commandable | Variante active absente ou paiement encore fermé : normal avant HelloAsso |
| Images absentes après copie D1 | Fichiers R2 staging non copiés ; recharger les visuels |
| L’ouverture du paiement est refusée | Normal sans compte Sandbox, mail, mentions légales et clé de suivi configurés |
| La CI échoue sur la base commandes | UUID staging encore à zéro ou jeton Cloudflare sans droit sur la nouvelle base |

Références officielles consultées :

- Cloudflare D1 : https://developers.cloudflare.com/d1/wrangler-commands/
- Cloudflare Access et chemins : https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/
- Politiques Access : https://developers.cloudflare.com/cloudflare-one/access-controls/policies/common-policies/
- HelloAsso Sandbox : https://dev.helloasso.com/docs/environnements-production-et-sandbox-test
