# V5.1 — boutique et inscriptions aux tournois avec HelloAsso Sandbox

Livraison du 18 octobre 2026. **Ce patch remplace la V5 non installée : appliquez-le directement après la V4. N’installez pas la V5 avant.** Il inclut ses fournisseurs, articles simples, prix synchronisés et corrections de mise en page.

## 1. Ce qui est prêt et ce qui reste à configurer

L’authentification réelle avec les identifiants Sandbox communiqués a été testée avec succès. L’association accessible a pour slug **`fce`** et l’API indique `isCashInCompliant=true`. Aucun encaissement, aucune commande de test HelloAsso et aucun mail client n’ont été créés pendant ce contrôle. Ce contrôle ne remplace pas un paiement Sandbox complet.

Les identifiants ne figurent dans aucun fichier, patch ou exemple. Ils doivent être enregistrés comme **secrets du Worker staging**. Ils ne seront pas réutilisés pour la production. Le code et la documentation seuls ne peuvent pas configurer votre compte Cloudflare.

La boutique et les tournois partagent le même moteur HelloAsso et le transport mail. L’espace `/admin-tournois/` a sa propre application Cloudflare Access et sa propre liste de responsables. La base **DB** conserve le site et la configuration publique des tournois ; **ORDERS**, distincte, conserve commandes, inscriptions, paiements, mails et habilitations. Aucune nouvelle base n’est nécessaire pour cette version.

## 2. Appliquer dans Codespaces, sur staging

Déposez `fce-boutique-v5.1.patch` à la racine du dépôt. Enregistrez vos changements locaux avant l’application. Les commandes suivantes supposent que vous avez déjà installé la V4, mais pas la V5.

```bash
git switch staging
git status --short
git apply --check fce-boutique-v5.1.patch
git apply fce-boutique-v5.1.patch
npm ci --include=dev
node scripts/configure-orders.mjs --check staging
node scripts/configure-helloasso.mjs --env staging --slug fce
```

Si `git apply --check` échoue, n’utilisez pas `--reject` et ne remplacez pas votre `wrangler.jsonc` entier. Des modifications locales peuvent nécessiter une adaptation des quelques lignes concernées. Le patch ajoute des chemins à `assets.run_worker_first`, sans remplacer les UUID D1 ni les réglages d’accès.

Le script `configure-helloasso.mjs` conserve les variables et les bindings déjà présents. Il configure uniquement `APP_ENV`, `HELLOASSO_ORGANIZATION_SLUG=fce` et l’origine du staging. Si une ancienne valeur d’association figure déjà dans les paramètres D1 de la boutique, corrigez-la en `fce` dans `/admin-boutique/parametres/` : la valeur enregistrée en D1 reste prioritaire.

## 3. Enregistrer les deux secrets HelloAsso

Utilisez votre jeton API Cloudflare déjà fonctionnel dans Codespaces ; le login Wrangler par navigateur n’est pas nécessaire. Le jeton Cloudflare doit autoriser la modification du Worker staging et l’accès D1 pour les migrations. Les secrets Cloudflare des workflows GitHub restent nécessaires au déploiement automatique.

```bash
npx wrangler secret put HELLOASSO_CLIENT_ID --env staging
npx wrangler secret put HELLOASSO_CLIENT_SECRET --env staging
npx wrangler secret list --env staging
```

Saisissez les valeurs fournies dans les invites Wrangler, sans les mettre dans les commandes, GitHub, `wrangler.jsonc` ou une capture d’écran. `secret list` affiche seulement leurs noms. Si elles existent déjà, `secret put` les remplace uniquement sur le Worker ciblé.

Conservez votre `TRACKING_SECRET` existant : le remplacer invaliderait les liens déjà envoyés et rendrait le cache OAuth chiffré illisible. S’il n’a jamais été installé, créez une valeur aléatoire d’au moins 32 caractères puis utilisez `npx wrangler secret put TRACKING_SECRET --env staging`.

Le transport mail existant doit être opérationnel : `MAIL_PROVIDER`, `MAIL_FROM`, son secret/binding et **`MAIL_TEST_TO`**. Sur staging, tous les mails sont forcés vers `MAIL_TEST_TO` ; aucune adresse client saisie dans un formulaire n’est destinataire. Voir `docs/BOUTIQUE.md` pour le transport. L’inscription aux tournois refuse de s’ouvrir sans la configuration mail et paiement requise, y compris pour « payer plus tard », afin de garantir un suivi utilisable.

## 4. Créer l’application Cloudflare Access des tournois

Dans Zero Trust → Access → Applications, créez une application auto-hébergée distincte pour :

```text
fce-escalquens-staging.fcescalquens.workers.dev/admin-tournois
fce-escalquens-staging.fcescalquens.workers.dev/admin-tournois/*
```

Protégez la page racine et tous les sous-chemins/API. Ajoutez votre règle e-mail + PIN. Copiez **Application Audience (AUD)**, pas le Policy ID. Utilisez le même domaine d’équipe Cloudflare que pour la boutique, mais l’AUD de cette nouvelle application.

```bash
node scripts/configure-shop-access.mjs --scope tournament --env staging \
  --issuer https://VOTRE-EQUIPE.cloudflareaccess.com \
  --aud VOTRE_AUD_TOURNOIS \
  --origin https://fce-escalquens-staging.fcescalquens.workers.dev
```

Ce script ajoute `CF_ACCESS_TOURNAMENT_AUD` en conservant `CF_ACCESS_SHOP_AUD` et vos bases. L’AUD est contrôlé par signature JWT côté Worker ; une adresse e-mail envoyée seule dans un en-tête ne donne aucun accès.

Les pages publiques `/tournois/`, `/tournois/suivi/`, `/paiements/retour/` et les API clients ne doivent pas être incluses dans la règle Access de l’administration. Le suivi est autorisé par son propre lien secret. Le webhook ci-dessous doit aussi rester accessible sans PIN ni mot de passe de staging.

## 5. Vérifier, enregistrer et déployer

Utilisez Node **24** comme le workflow GitHub. Les tests tournent sur des bases SQLite en mémoire et ne modifient pas vos données distantes.

```bash
npm test
npm run typecheck:shop
npm run build
git add astro.config.mjs public scripts src migrations migrations-orders tests docs tsconfig.shop.json wrangler.jsonc
git commit -m "Ajoute HelloAsso sandbox et les inscriptions aux tournois en v5.1"
git push origin staging
```

Le workflow staging applique les migrations dans **DB**, puis dans **ORDERS**, puis déploie. Cette version ajoute :

- `DB/0030_shop_suppliers.sql` (V5 incluse) ;
- `DB/0031_tournament_checkout.sql` (tarifs, capacité, dates, conditions) ;
- `ORDERS/0003_tournaments_and_oauth.sql` (inscriptions, responsables tournois, cache OAuth chiffré).

Il ne crée pas les bases. Ne lancez pas les migrations ORDERS sur DB ni l’inverse. Attendez la réussite complète du workflow avant d’utiliser les nouvelles pages.

En déploiement manuel, l’ordre est :

```bash
npx wrangler d1 migrations apply DB --remote --env staging
npx wrangler d1 migrations apply ORDERS --remote --env staging
npm run build
npx wrangler deploy --env staging
```

## 6. Autoriser le premier responsable des tournois

Après les migrations, dans Cloudflare → D1 → **fce-escalquens-orders-staging** → Console, exécutez avec votre propre adresse déjà autorisée dans Access :

```sql
INSERT INTO tournament_admins(email,name,active)
VALUES('votre.adresse@example.fr','Votre nom',1)
ON CONFLICT(email) DO UPDATE SET name=excluded.name,active=1;
```

Ce premier ajout se fait en base puisque l’espace sécurisé doit refuser tout visiteur non habilité. Ensuite, `/admin-tournois/acces/` permet d’ajouter, modifier ou désactiver des responsables, en complément de la règle Cloudflare. Vous ne pouvez pas retirer votre propre accès pendant la session. Les responsables du site et de la boutique ne sont pas automatiquement responsables des tournois.

## 7. URL à donner à HelloAsso

Dans le compte **Sandbox** HelloAsso, **Mon Compte → Intégrations et API → URL de notification**, renseignez :

```text
https://fce-escalquens-staging.fcescalquens.workers.dev/api/shop/helloasso/webhook
```

C’est le **webhook serveur**, commun à la boutique et aux tournois malgré son nom historique. Activez les notifications **Order** et **Payment** si le paramétrage les distingue. N’utilisez pas webhook.site pour de vraies données de vos clients.

La page **de retour du navigateur** est différente :

```text
https://fce-escalquens-staging.fcescalquens.workers.dev/paiements/retour/
```

Le site renseigne automatiquement `returnUrl`, `backUrl` et `errorUrl` pour chaque tentative, avec un identifiant opaque et le contexte boutique/tournois. Vous n’avez pas à saisir ces URL pour chaque achat. Il n’y a **pas de callback OAuth d’autorisation** à créer : les identifiants de votre association utilisent `client_credentials`, puis `refresh_token` côté serveur.

Même si HelloAsso renvoie `code=succeeded`, le site n’en déduit jamais que le paiement est acquis. Le webhook, le suivi et le cron relisent l’intention et les paiements dans l’API OAuth. La signature `x-ha-signature` est proposée par HelloAsso aux partenaires ; n’inventez pas de `HELLOASSO_WEBHOOK_SECRET` pour votre compte associatif. S’il est laissé absent, la relecture authentifiée reste obligatoire. Une signature valide n’exonère pas non plus cette relecture.

Ne mettez pas Cloudflare Access, un CAPTCHA interactif ou une redirection de connexion devant le webhook. Un GET peut répondre « Méthode non autorisée » : il attend des notifications POST JSON, pas une visite dans le navigateur.

## 8. Ouvrir un tournoi et tester le parcours

1. Dans l’administration du site, créez/vérifiez la présentation du tournoi : nom, dates, catégories, affiche, règlement. Le statut doit être **Inscriptions ouvertes**. La présentation éditoriale reste dans cette administration ; les coordonnées privées et paiements des inscrits sont uniquement dans `/admin-tournois/`.
2. Dans `/admin-tournois/parametres/`, sélectionnez le tournoi. Indiquez le prix **par équipe**, le nombre de places (`0` = sans limite), la clôture des inscriptions et la date limite de paiement. Cette dernière doit être au moins égale à la date de clôture.
3. Rédigez les conditions propres au tournoi : confirmation de la place, paiement, désistement, annulation par le club et remboursement. Faites vérifier ces conditions par les responsables du club avant l’ouverture. Une clause boutique de retrait par coach ne s’applique pas aux inscriptions.
4. Choisissez si « Payer plus tard » est proposé et activez les inscriptions. Sans cette activation, l’ancien lien externe éventuel reste utilisable ; dès qu’une configuration intégrée activée existe, elle remplace ce lien, y compris lorsque ses inscriptions sont closes.
5. Cliquez **Tester la connexion HelloAsso**. Le résultat doit afficher `sandbox`, `fce` et l’encaissement autorisé. Le même bouton existe dans les paramètres boutique.
6. Sur `/tournois/`, cliquez **Inscrire mon équipe**. Vérifiez le tarif exact, les informations du responsable adulte et les conditions. Aucune liste de joueurs ni donnée médicale n’est demandée.
7. Testez **Plus tard** : l’inscription est enregistrée sans intention de paiement, le mail de suivi va vers `MAIL_TEST_TO`. Le suivi affiche séparément la validation par le club et l’état du paiement.
8. Depuis le lien personnel, cliquez **Payer avec HelloAsso**, utilisez les moyens de paiement de test proposés par le Sandbox, puis revenez sur le site. Ne saisissez pas une carte réelle pour cette recette.
9. Vérifiez la contribution volontaire HelloAsso : elle est distincte du montant demandé par le club et peut être modifiée/retirée sur la page HelloAsso. Vérifiez le webhook, le statut payé et le mail de confirmation.
10. Fermez l’onglet avant le retour, puis utilisez l’e-mail : le paiement doit quand même être reconnu par webhook/cron. Refaites le scénario avec abandon/refus ; aucun succès ne doit être affiché sans preuve API.
11. Testez une place limitée à une équipe : double clic/double envoi = une inscription ; seconde équipe = complet. Une inscription non payée occupe aussi une place jusqu’à son annulation par un responsable.
12. Dans `/admin-tournois/`, filtrez/recherchez les inscriptions, exportez la sélection, validez une équipe et envoyez un message public. Vérifiez l’e-mail et le suivi. Les notes internes ne doivent jamais apparaître au responsable de l’équipe.
13. Testez le renvoi du suivi avec uniquement l’e-mail, sans référence. La réponse est identique pour une adresse inconnue. Testez la révocation du lien puis l’invalidation de l’ancien.
14. Vérifiez une adresse absente des responsables et une session boutique seule : refus d’accès aux inscriptions tournois. Testez aussi en navigation privée sur smartphone.

Pour la boutique, vérifiez également `/admin-boutique/fournisseurs/`, l’article simple sans taille, le tarif unique affiché, les tailles à tarifs différents et le panier mobile. Les nouvelles corrections V5 sont incluses.

## 9. Incidents et limites connues

- **Une modification de tarif n’altère pas une inscription déjà enregistrée.** Son montant, ses conditions et sa date limite sont des instantanés conservés dans ORDERS. Les modifications simultanées de gestion sont contrôlées par version.
- **Paiement différé = HelloAsso plus tard**, pas de paiement en espèces dans ce parcours. La place peut rester en attente de validation par le club. Aucun compte client ni validation préalable de l’e-mail n’est nécessaire.
- **Échéance dépassée :** le site refuse d’ouvrir une nouvelle intention. Une page HelloAsso déjà ouverte peut encore aboutir ; le paiement sera conservé et signalé, même pour une inscription annulée. Le club décide alors de la suite.
- **Paiement incertain après coupure réseau :** le site conserve l’inscription et bloque une seconde création tant que la tentative est incertaine. Le webhook peut la rattacher après relecture API. Dans le détail de gestion, « Récupérer une réponse HelloAsso perdue » permet d’entrer l’identifiant d’une intention retrouvée avec HelloAsso ; les métadonnées doivent correspondre exactement. Aucune case « marqué payé » manuelle ne remplace la preuve HelloAsso. Si aucune intention ne peut être retrouvée, contactez HelloAsso avant toute autre tentative.
- **Annulation/remboursement :** annuler dans l’administration ne rembourse pas automatiquement. Faites le remboursement dans HelloAsso, puis « Vérifier chez HelloAsso ». Une inscription annulée ne peut pas être réactivée ; créez-en une nouvelle si nécessaire.
- **Mails :** file persistante, reprise des erreurs, états d’envoi dans le détail. En cas de problème, les données de l’inscription restent disponibles et le message d’erreur comporte un incident, sans exposer un jeton ou une réponse brute du prestataire.
- **Archivage :** marquez les équipes accueillies après le tournoi ou annulez les inscriptions abandonnées. Les inscriptions impayées sans tentative restant à vérifier sont purgées 90 jours après leur échéance. Les inscriptions closes suivent la conservation maximale de 10 ans des justificatifs ; les liens sont alors limités à 90 jours. Les cas litigieux/incertains restent à traiter par le club.
- **Exports CSV :** limités à la sélection chargée dans l’administration (500 inscriptions les plus récentes). Ils contiennent des données de contact réservées à l’organisation ; ne les publiez pas. Les cellules pouvant déclencher une formule sont neutralisées.
- **Notifications :** un seul webhook doit être installé, pour les deux parcours. Si un autre logiciel utilise déjà l’URL unique du compte associatif, prévoyez un relais qui distribue les notifications, plutôt que remplacer son URL sans coordination.

## 10. Sécurité du raccordement

Les identifiants restent dans les secrets Worker. Les jetons OAuth access/refresh sont chiffrés en AES-GCM dans ORDERS, avec une clé dérivée par HKDF du secret de suivi et de l’environnement. Un verrou D1 évite les renouvellements simultanés ; un access token encore valable est réutilisé, puis le refresh token est utilisé. Une réponse 401 autorise un seul renouvellement ; une coupure lors de la création d’un checkout ne déclenche jamais un nouveau POST automatique.

Les liens personnels sont stockés uniquement sous forme de hash en base. Le jeton n’est pas transmis à HelloAsso, ni placé dans ses métadonnées : le retour navigateur s’appuie sur la session de l’onglet, ou sur la récupération par mail. Les pages de suivi/retour ont des en-têtes sans cache, sans referrer et ne sont pas dans le sitemap. Les écritures vérifient l’origine ; les entrées, montants, références et destinations de paiement sont validés côté serveur. Le contrôle des places et la création des lignes/mails se font dans une transaction ORDERS.

Les conditions de tournoi sont acceptées avec leur version et figées au moment de l’inscription. La page confidentialité et les formulaires expliquent finalités, destinataires, caractère nécessaire des champs et droits. Le club reste responsable de la vérification de ses conditions, de ses prestataires et de son registre.

## 11. Passer ensuite en production

Effectuez d’abord la recette complète sur staging. Le slug et l’habilitation Sandbox n’impliquent pas qu’un compte réel soit prêt. Obtenez les identifiants de production, vérifiez le slug et la possibilité réelle d’encaisser dans cet environnement, puis configurez les secrets **sans `--env staging`** sur le Worker de production.

Utilisez `node scripts/configure-helloasso.mjs --env production --slug SLUG_PRODUCTION_VERIFIE`, protégez les nouvelles routes Access du domaine de production avec leurs propres AUD, ajoutez les responsables dans **ORDERS production**, configurez le transport mail réel et appliquez les migrations sur les deux bases production avant le déploiement. Le script refuse de choisir automatiquement un slug de production.

Webhook de production :

```text
https://fcescalquens.fr/api/shop/helloasso/webhook
```

Les clés Sandbox, les mails de test, les inscriptions et les jetons de staging ne sont pas copiés en production. La base ORDERS de production doit être créée/configurée si son UUID est encore la valeur de remplacement ; ne réutilisez jamais celle de staging.

## Documentation officielle consultée le 18 octobre 2026

- [Vue d’ensemble API et environnements](https://dev.helloasso.com/docs/api-overview)
- [Création d’un checkout](https://dev.helloasso.com/reference/post_organizations-organizationslug-checkout-intents)
- [Renouvellement du jeton OAuth](https://dev.helloasso.com/reference/rafraichir-un-access_token)
- [Validation des paiements et abandon](https://dev.helloasso.com/docs/validation-de-vos-paiements)
- [Installation des notifications](https://dev.helloasso.com/docs/notifications-webhook)
- [Authenticité des notifications, fonctionnalité partenaire](https://dev.helloasso.com/docs/secure-webhook)
- [Guide d’intégration](https://dev.helloasso.com/docs/guide-dint%C3%A9gration)
