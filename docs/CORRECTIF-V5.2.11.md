# V5.2.11 — envoi des e-mails avec la boîte OVH MX Plan

À appliquer après la V5.2.10. Aucune migration de base ni changement des secrets HelloAsso. Ce correctif ajoute un transport SMTP OVH pour les confirmations et liens personnels de la boutique et des tournois, ainsi qu’un bouton de test dans les paramètres boutique.

La boîte existante `contact@fcescalquens.fr` sert d’expéditeur **et de destinataire des tests**. Tous les mails de staging sont forcés vers cette adresse et préfixés `[TEST]`, y compris quand un formulaire contient une autre adresse. En production les mails métier vont aux clients ; le bouton de test reste limité à `MAIL_TEST_TO`.

## 1. Installer et déployer le code sur staging

Dans Codespaces, placez le patch téléchargé à la racine du dépôt. Vérifiez que la branche affichée est `staging` et que la V5.2.10 est installée. Si `git apply --check` échoue, arrêtez-vous et examinez le message ; ne forcez pas l’application du patch.

```bash
git branch --show-current
git apply --check fce-correctif-v5.2.11.patch
git apply fce-correctif-v5.2.11.patch
node scripts/configure-ovh-mail.mjs --env staging
```

Le script ajoute les variables suivantes **dans `env.staging.vars`** du fichier `wrangler.jsonc`. Il conserve les autres variables, Access, les bindings D1/R2 et la configuration de production :

| Variable | Valeur staging |
| --- | --- |
| `MAIL_PROVIDER` | `ovh` |
| `MAIL_FROM` | `contact@fcescalquens.fr` |
| `MAIL_TEST_TO` | `contact@fcescalquens.fr` |
| `SMTP_HOST` | `ssl0.ovh.net` |
| `SMTP_USER` | `contact@fcescalquens.fr` |

Relisez le diff, puis :

```bash
git diff --stat
npm run typecheck:shop
npm test
npm run build
git add .dev.vars.example docs/BOUTIQUE.md docs/CORRECTIF-V5.2.11.md scripts/configure-ovh-mail.mjs src/shop/smtp.ts src/shop/mail-config.ts src/shop/mail.ts src/shop/service.ts src/tournaments/service.ts src/scripts/admin-shop.js src/pages/confidentialite/index.astro tests/smtp.test.ts tests/shop.test.ts wrangler.jsonc
git commit -m "Ajoute les e-mails SMTP OVH et leur test sécurisé"
git push origin staging
```

Attendez la réussite du déploiement GitHub Actions. L’envoi et l’ouverture du paiement restent indisponibles tant que le secret suivant manque. Le build et le push ne créent pas de compte mail et ne configurent pas son mot de passe.

## 2. Ajouter le secret OVH au Worker staging

Dans Cloudflare : **Workers & Pages → fce-escalquens-staging → Settings / Paramètres → Variables and Secrets → Add**.

- Type : **Secret**.
- Nom : `SMTP_PASSWORD`.
- Valeur : le **mot de passe de la boîte mail** `contact@fcescalquens.fr`, et non celui du compte client OVH.
- Enregistrez et déployez cette modification dans l’interface Cloudflare.

Ne communiquez pas ce mot de passe dans une conversation, un commit, D1 ou un ticket. Il n’existe aucun champ pour lui dans le backoffice. Si vous ne connaissez pas le mot de passe de la boîte, changez-le depuis MX Plan → Emails → menu de `contact` ; cela modifiera aussi l’accès au webmail et aux logiciels déjà configurés.

Alternative Codespaces, uniquement si l’authentification Wrangler est déjà opérationnelle :

```bash
npx wrangler secret put SMTP_PASSWORD --env staging
```

Saisissez la valeur uniquement à l’invite interactive. Ne la mettez jamais dans une commande en clair. Les secrets Cloudflare restent présents lors des déploiements suivants ; les variables non secrètes sont conservées dans `wrangler.jsonc` par le script de l’étape 1.

## 3. Envoyer le mail de test

Ouvrez `/admin-boutique/parametres/`, reconnectez-vous via Cloudflare Access si nécessaire et rechargez la page. Le transport doit indiquer `ovh`, et l’envoi mail « Configuré » signifie que les paramètres requis sont présents, pas que la connexion a déjà réussi.

Cliquez **Tester l’envoi d’un e-mail**. Le destinataire est fixé côté serveur à `contact@fcescalquens.fr`. Le bouton n’accepte aucune adresse fournie par le navigateur et n’inclut aucun lien de commande. Il est réservé aux administrateurs boutique, protégé contre les requêtes d’un autre site et limité à trois essais par fenêtre de dix minutes.

Ouvrez le webmail Roundcube depuis OVH. Vérifiez la réception, le dossier indésirable et la lisibilité des accents. Un succès dans l’administration signifie qu’OVH a accepté le mail ; il ne prouve pas son arrivée dans la boîte principale.

## 4. Corriger le diagnostic DKIM

La capture MX Plan indique un diagnostic **DKIM rouge**. Consultez le diagnostic OVH pour obtenir les enregistrements **propres à votre domaine et votre offre**. Si les serveurs DNS autoritaires sont Cloudflare, ajoutez ces valeurs dans Cloudflare DNS, en mode DNS uniquement pour les CNAME demandés ; ne les ajoutez pas seulement dans une zone OVH inactive. N’inventez pas les noms de sélecteurs ou les cibles.

Vérifiez également le SPF existant et la politique DMARC. Ne créez pas un second enregistrement SPF et ne remplacez pas les MX utilisés pour recevoir les messages. L’authentification SMTP et l’authentification du domaine sont distinctes : un test accepté peut encore être filtré si le domaine est mal configuré. Un test vers une boîte externe sera utile ensuite pour vérifier la délivrabilité hors OVH.

## 5. Tester une commande HelloAsso Sandbox

Une fois le mail reçu, vérifiez les coordonnées et CGV dans les paramètres boutique, puis activez la prise de commandes de test. Utilisez uniquement les moyens de paiement de test HelloAsso Sandbox.

Contrôlez le mail de création, le paiement confirmé après vérification HelloAsso et le lien de suivi personnel sans compte. Même avec une adresse de client fictive, staging doit envoyer uniquement à `contact@fcescalquens.fr`. Les tournois utilisent le même transport, mais conservent leur base et leurs habilitations séparées.

## Erreurs et garanties

| Résultat | Action |
| --- | --- |
| OVH refuse l’authentification | Vérifier l’adresse complète `SMTP_USER`, le mot de passe de la boîte et l’absence de blocage SMTP chez OVH. |
| Serveur injoignable / délai dépassé | Réessayer puis vérifier `SMTP_HOST`. Les deux hôtes autorisés sont `ssl0.ovh.net` et `smtp.mail.ovh.net`, toujours sur 465 avec TLS. |
| Configuration incomplète | Vérifier les cinq variables et le secret du Worker **staging**. |
| Accepté mais absent | Vérifier les indésirables, le diagnostic DKIM/SPF, le webmail et les éventuels rejets OVH. |
| Échec d’un mail métier | La file D1 reprend automatiquement les envois ; les échecs définitifs restent visibles et relançables dans l’administration. |

Les connexions utilisent les sockets natifs Cloudflare avec TLS dès l’ouverture ; aucun repli en clair, aucun port 25, aucune désactivation de vérification du certificat. Les délais et la taille des réponses SMTP sont bornés. Les en-têtes sont validés et les contenus texte/HTML encodés en MIME UTF-8. Les messages d’erreur stockés ne contiennent ni mot de passe, ni réponse brute SMTP, ni lien personnel. Un identifiant de message stable aide au diagnostic ; SMTP ne garantit pas l’absence absolue de doublon si une connexion est perdue après acceptation et avant confirmation.

Le transport n’utilise pas le service d’envoi Cloudflare Email Sending ni son binding. Les quotas de votre offre MX Plan et les limites Workers continuent de s’appliquer : ce n’est pas un service d’envoi illimité. Il n’y a pas de retour automatique des bounces SMTP dans les états de commande ; surveillez les notifications reçues dans la boîte OVH.

La page de confidentialité précise le rôle d’OVHcloud pour ces envois. Vérifiez les documents de sous-traitance applicables à votre compte et les droits d’accès à la boîte, qui reçoit des liens personnels de suivi pendant les tests.

## Sources techniques

- OVH MX Plan, serveur sortant et TLS : https://docs.ovhcloud.com/fr/guides/web-cloud/email-and-collaborative-solutions/mx-plan/email-creation
- Cloudflare, sockets TCP/TLS et restriction du port 25 : https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/
