# Tester HelloAsso Sandbox avec la boutique FCE

Ce guide correspond à la V5.2.7. Il concerne uniquement staging ; aucune modification de production n’est nécessaire.

## 1. Lire l’état actuel

Votre capture indique :

- HelloAsso Sandbox : bon environnement.
- API HelloAsso « Configurée » : les identifiants sont présents, mais cela ne prouve pas encore qu’une requête OAuth réussit.
- Clé de suivi « À configurer » : le secret `TRACKING_SECRET` manque ou est trop court.
- Transport mail « Absent » et expéditeur/destinataire non définis : il faut configurer l’envoi des liens de suivi.
- `CHECKOUT_DISABLED` : la case d’ouverture des commandes n’est pas encore activée. Attendez d’avoir terminé les autres étapes avant de la cocher.

Appliquez d’abord le patch V5.2.7 selon `docs/CORRECTIF-V5.2.7.md`. Il corrige aussi un ancien contrôle de médiateur resté dans le serveur alors que ces champs avaient été retirés de l’administration.

Ne recréez pas vos bases, ne réinitialisez pas les commandes et ne relancez pas la copie initiale des tournois pour cette configuration.

## 2. Vérifier le compte HelloAsso de test

Connectez-vous sur **https://www.helloasso-sandbox.com/**, et non au compte de production. Dans l’espace de votre association, ouvrez **Mon compte → Intégrations et API**.

Vérifiez :

1. Le client API est bien celui du compte Sandbox.
2. Le slug de l’association de test est bien `fce` (à confirmer dans votre compte).
3. Le client dispose des permissions **Checkout** et **AccessTransactions**.
4. L’association est validée pour l’encaissement Checkout. La présence d’un client API ne suffit pas si HelloAsso refuse l’encaissement.

Vous n’avez pas à créer un formulaire boutique dans HelloAsso. Le site construit une demande Checkout à partir du panier.

## 3. Vérifier l’origine staging dans le dépôt

Dans Codespaces, à la racine du dépôt, sur la branche staging :

```bash
git switch staging
git pull --ff-only
node scripts/configure-helloasso.mjs --env staging --slug fce --origin https://fce-escalquens-staging.fcescalquens.workers.dev
```

Cette commande conserve vos autres variables et bindings. Elle définit `APP_ENV=staging`, l’origine exacte du site et le slug par défaut. Si vous avez déjà enregistré un autre slug dans les paramètres boutique, vérifiez aussi ce champ dans le backoffice : il a priorité sur la valeur par défaut.

N’utilisez pas la configuration de production pour cet essai. L’application choisit l’API Sandbox côté serveur à partir de `APP_ENV`.

## 4. Définir les secrets sur le bon Worker

Dans Cloudflare : **Workers & Pages → fce-escalquens-staging → Settings → Variables and Secrets**. Vérifiez bien le nom du Worker staging, distinct de `fce-escalquens`.

Les trois entrées suivantes doivent être de type **Secret** :

| Nom | Valeur |
| --- | --- |
| `HELLOASSO_CLIENT_ID` | Client ID du compte Sandbox |
| `HELLOASSO_CLIENT_SECRET` | Client secret de ce même compte Sandbox |
| `TRACKING_SECRET` | Clé aléatoire propre à staging, au moins 32 caractères |

Les identifiants HelloAsso sont déjà signalés présents sur votre capture : ne les remplacez que si vous constatez qu’ils ne correspondent pas au compte Sandbox.

Pour créer la clé de suivi manquante directement depuis Codespaces sans l’afficher :

```bash
node --input-type=module -e "import {randomBytes} from 'node:crypto'; process.stdout.write(randomBytes(32).toString('hex'))" | npx wrangler secret put TRACKING_SECRET --env staging
```

Si Wrangler n’est pas authentifié dans Codespaces, utilisez un `CLOUDFLARE_API_TOKEN` enregistré dans vos secrets Codespaces avec les droits nécessaires au Worker. Les secrets GitHub Actions ne deviennent pas automatiquement des variables dans Codespaces. Vous pouvez aussi générer la clé localement puis la saisir dans le tableau de bord Cloudflare. Ne mettez pas les secrets dans Git ou dans `wrangler.jsonc`.

**Cette création est prévue lorsque la clé manque, comme sur votre capture. Ne remplacez pas une clé de suivi existante à chaque test : elle protège aussi les anciens liens et le cache OAuth chiffré.**

Alternatives CLI pour les identifiants, si nécessaire :

```bash
npx wrangler secret put HELLOASSO_CLIENT_ID --env staging
npx wrangler secret put HELLOASSO_CLIENT_SECRET --env staging
```

Saisissez les valeurs dans les invites de Wrangler. Ne les mettez pas directement dans les commandes.

## 5. Configurer les e-mails de suivi avec Cloudflare

Le code sait déjà envoyer avec Cloudflare Email Service. Pour ce chemin, procédez ainsi :

1. Dans Cloudflare, ouvrez **Compute → Email Service → Email Sending**.
2. Choisissez **Onboard Domain** et le domaine `fcescalquens.fr`.
3. Suivez la vérification du domaine et des enregistrements d’envoi SPF/DKIM/DMARC proposés. Conservez les réglages de réception existants du club ; ne remplacez pas les MX de réception d’une boîte OVH pour ce test.
4. Attendez que le domaine soit indiqué prêt pour l’envoi. Une adresse telle que `boutique@fcescalquens.fr` pourra servir d’expéditeur. Le service d’envoi et la boîte qui reçoit les réponses sont deux réglages distincts.

Si Email Sending n’est pas proposé dans votre compte, passez à l’alternative Resend ci-dessous. N’ajoutez pas un binding d’envoi pour un service qui n’est pas disponible.

Dans `wrangler.jsonc`, **dans l’objet `env.staging` existant**, ajoutez les variables à son objet `vars`, sans supprimer vos variables Access/GitHub ni les bindings D1/R2 :

```json
"APP_ENV": "staging",
"SHOP_ORIGIN": "https://fce-escalquens-staging.fcescalquens.workers.dev",
"HELLOASSO_ORGANIZATION_SLUG": "fce",
"MAIL_PROVIDER": "cloudflare",
"MAIL_FROM": "boutique@fcescalquens.fr",
"MAIL_TEST_TO": "fcescalquens@gmail.com"
```

`MAIL_TEST_TO` peut être remplacé par votre propre adresse de test. Tous les messages du site en staging sont redirigés vers cette adresse, même si le formulaire contient un autre e-mail.

Toujours dans `env.staging`, au même niveau que `vars`, ajoutez ou complétez :

```json
"send_email": [{ "name": "EMAIL" }]
```

Si une liste `send_email` existe déjà, conservez les autres bindings et ajoutez seulement celui nommé `EMAIL` s’il manque. Il n’est pas nécessaire d’ajouter ce binding en production pour cette recette.

Le tableau de bord permet aussi de saisir des variables, mais les valeurs non secrètes et le binding doivent rester dans le fichier de configuration pour être conservés au prochain déploiement GitHub.

### Alternative si l’envoi Cloudflare n’est pas disponible

Le transport HTTPS Resend est déjà implémenté. Dans Resend, vérifiez votre domaine d’envoi et créez une clé API d’envoi. Définissez :

- `MAIL_PROVIDER=resend` ;
- `MAIL_FROM=boutique@fcescalquens.fr` sur le domaine vérifié ;
- `MAIL_TEST_TO=fcescalquens@gmail.com` ou votre adresse de test ;
- `RESEND_API_KEY` comme secret Worker staging.

```bash
npx wrangler secret put RESEND_API_KEY --env staging
```

Pour cette alternative, n’ajoutez pas de binding `send_email`. OVH/Gmail peuvent servir au contact et à la réception des réponses ; l’envoi direct par leur SMTP n’est pas implémenté dans cette version. Ne renseignez pas un mot de passe Gmail/OVH dans le site.

## 6. Déployer cette configuration

Depuis Codespaces :

```bash
npm run build
git diff -- wrangler.jsonc
git add wrangler.jsonc
git commit -m "Configure HelloAsso Sandbox et les mails de staging"
git push origin staging
```

Vérifiez la réussite du workflow GitHub Actions, puis rechargez :

https://fce-escalquens-staging.fcescalquens.workers.dev/admin-boutique/parametres/

Les indicateurs doivent maintenant montrer : clé de suivi configurée, transport mail Cloudflare (ou Resend), envoi configuré et origine staging exacte. Ces indicateurs vérifient la présence des réglages ; l’envoi réel sera vérifié lors de la commande de test.

## 7. Tester la connexion HelloAsso

Dans les paramètres boutique :

1. Vérifiez le slug `fce`.
2. Enregistrez les paramètres si vous venez de modifier le slug.
3. Cliquez sur **Tester la connexion HelloAsso**.
4. Le résultat doit annoncer Sandbox, le bon slug et l’encaissement autorisé.

Ce test n’encaisse rien. S’il échoue, ne multipliez pas les commandes : corrigez d’abord les identifiants, le slug ou la validation de l’association dans HelloAsso.

## 8. Déclarer l’URL de notification dans HelloAsso Sandbox

Dans **Mon compte → Intégrations et API**, renseignez l’URL de notification :

```text
https://fce-escalquens-staging.fcescalquens.workers.dev/api/shop/helloasso/webhook
```

Si le compte propose un choix d’événements, activez **Order** et **Payment**. S’il n’offre qu’une URL globale, elle convient également.

Les URL n’ont pas le même rôle :

| Usage | Adresse |
| --- | --- |
| Notification serveur HelloAsso | `/api/shop/helloasso/webhook`, URL complète ci-dessus |
| Retour du navigateur après tentative de paiement | `https://fce-escalquens-staging.fcescalquens.workers.dev/paiements/retour/` |
| Suivi de la commande | `https://fce-escalquens-staging.fcescalquens.workers.dev/boutique/suivi/` |

Le site transmet automatiquement les paramètres de retour propres à chaque commande. Ne collez pas une URL de suivi personnelle contenant un jeton dans HelloAsso. Ce client utilise OAuth client_credentials : aucun callback d’autorisation utilisateur n’est nécessaire pour ce raccordement.

Gardez les règles Cloudflare Access sur les administrations uniquement. Une protection globale ou une page de challenge sur le webhook empêcherait HelloAsso de le joindre. Le code contourne le verrou Basic de staging pour cette route, mais ne peut pas contourner une règle Access/WAF qui bloque la requête avant le Worker.

L’option de signature webhook peut rester absente si votre compte ne fournit pas de clé partenaire : le serveur vérifie le paiement en relisant l’intention via l’API OAuth. Ne créez pas une clé de signature inventée. Ouvrir cette URL dans le navigateur en GET n’est pas un test de notification POST.

## 9. Préparer un article et ouvrir les commandes de test

Dans `/admin-boutique/` :

1. Dans **Fournisseurs**, vérifiez qu’au moins un fournisseur est actif.
2. Dans **Catégories**, vérifiez qu’une catégorie est visible.
3. Dans **Articles et photos**, vérifiez qu’un article visible appartient à cette catégorie, avec une variante disponible, un prix positif et un fournisseur sélectionné. Pour un accessoire simple, une seule variante suffit.
4. Dans **Couverture et affichage**, activez l’affichage de la boutique.
5. Dans **Paramètres**, complétez les coordonnées du vendeur, RNA/SIRET ou mentions applicables, téléphone, adresse du club pour le retrait, délai et consignes de remise. Relisez les CGV et informations de confidentialité.
6. Cochez la case attestant la vérification des informations de vente par le club.
7. Cochez **Ouvrir la prise de commandes et le paiement de test**, puis enregistrez.

Avec la V5.2.7, aucun champ de médiateur retiré de l’écran ne bloque cette ouverture.

## 10. Faire le premier paiement Sandbox

1. Ouvrez https://fce-escalquens-staging.fcescalquens.workers.dev/boutique/.
2. Ajoutez l’article, choisissez taille/personnalisation si proposées, puis ouvrez le panier.
3. Vérifiez article, quantité, options et total.
4. Saisissez les coordonnées de test et acceptez les conditions.
5. Lancez le paiement : vous devez être redirigé vers **HelloAsso Sandbox**, jamais vers un paiement de production.
6. Utilisez le moyen de paiement fictif fourni pour l’environnement Sandbox par HelloAsso. Consultez ses indications de test ; n’utilisez pas votre carte réelle.
7. Terminez le paiement et revenez sur le site.
8. Le suivi doit passer à « payé » après vérification serveur. Un retour avec `code=succeeded` ne suffit pas à valider le paiement.
9. Retrouvez la même commande et le même montant dans **Commandes** côté boutique et dans HelloAsso Sandbox.
10. Vérifiez l’e-mail `[TEST]`, ouvrez son lien de suivi puis testez la récupération du lien par e-mail depuis la page Suivi, sans compte client.

La contribution volontaire HelloAsso est présentée séparément sur sa page ; vérifiez le montant de la boutique indépendamment de cette contribution.

## 11. Vérifier les cas interrompus et les erreurs

Faites ensuite un essai en quittant HelloAsso sans payer : la commande doit rester en attente, et son suivi doit permettre de reprendre le paiement. Ne supprimez pas une commande ou une tentative « incertaine » pour tenter de débloquer un nouveau paiement.

Si le paiement paraît réussi mais reste en attente :

1. Ouvrez la commande dans l’administration et utilisez **Vérifier chez HelloAsso**.
2. Vérifiez que l’URL de notification est bien renseignée sur le compte Sandbox et accessible sans challenge Cloudflare.
3. Vérifiez le paiement et l’intention sur le même compte et le même slug Sandbox.
4. Consultez les tentatives et l’historique. Le cron de réconciliation est configuré toutes les cinq minutes ; confirmez que le déploiement staging l’a conservé.

Si le mail ne vient pas, ouvrez le détail de commande et son état d’envoi. `sent` signifie accepté par le transport, pas lu ni garanti arrivé en boîte principale. Vérifiez indésirables, domaine d’envoi et journaux du service mail. Les échecs restent visibles et peuvent être relancés depuis la gestion de commande.

| Code ou état | Vérification principale |
| --- | --- |
| `CHECKOUT_DISABLED` | Case d’ouverture du paiement de test |
| `SHOP_CLOSED` | Affichage boutique activé |
| `LEGAL_CONFIG` | Informations du vendeur/retrait et case de vérification |
| `PAYMENT_CONFIG` | Slug, identifiants Sandbox et clé de suivi |
| `MAIL_CONFIG` | Transport, expéditeur et destinataire de test |
| `HELLOASSO_REJECTED` | Droits Checkout et validation de l’association |
| `PAYMENT_UNCERTAIN` | Ouvrir la commande et vérifier la tentative avant de recommencer |

## Documentation officielle consultée

- API et environnements HelloAsso : https://dev.helloasso.com/docs/api-overview
- Checkout : https://dev.helloasso.com/reference/post_organizations-organizationslug-checkout-intents
- Notifications : https://dev.helloasso.com/docs/notifications-webhook
- Vérification des paiements : https://dev.helloasso.com/docs/validation-de-vos-paiements
- Cloudflare Email Sending : https://developers.cloudflare.com/email-service/get-started/send-emails/
- Binding d’envoi : https://developers.cloudflare.com/email-service/configuration/send-bindings/
