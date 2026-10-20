# V5.2.13 — bandeau boutique, bon fournisseur PDF et notifications du club

À appliquer après la V5.2.12. Cette version ajoute **une migration dans ORDERS et une dans TOURNAMENTS**, sans modification de la base du site. Conserver les identifiants D1, les règles Access et les secrets existants.

## Haut de la boutique et boutons tournois

Le grand bandeau est remplacé par un composant indépendant des anciennes classes « hero » : titre plus court et moins grand, une action principale, visuel contenu et engagements compacts. Il conserve le visuel de couverture configuré dans l’administration et son image de secours. La fermeture de la boutique reste prioritaire sur ce bandeau.

Les boutons d’inscription aux tournois passent à 18 px, avec une hauteur minimale de 58 px sur ordinateur et 60 px sur mobile. Le bouton principal occupe une ligne entière sur mobile. Les actions secondaires, le formulaire d’inscription et le suivi de paiement ont aussi des zones tactiles agrandies. Les anciennes règles à 10 px avec `!important`, qui empêchaient une surcharge normale, sont corrigées à la source.

## Bon fournisseur PDF

Le bouton de la fiche d’une commande payée télécharge directement un **PDF**, sans passer par l’impression d’un document HTML. Le navigateur génère le document à partir de données minimales fournies par l’API privée, pour éviter le coût CPU de génération PDF sur un Worker gratuit.

- Logo du FC Escalquens, date, référence de commande et nom du client.
- Licencié et équipe si renseignés ; coordonnées de contact du club.
- Articles, tailles/modèles, quantités et personnalisations exactes, regroupés par fournisseur.
- Pagination automatique avec répétition de l’en-tête ; les articles tiennent sur une seule page quand leur hauteur le permet, et les très longues personnalisations se poursuivent si nécessaire.
- Suppression de l’ancienne référence produit et du paragraphe « Prix d’achat fournisseur et délai à confirmer… ».
- Aucun prix de vente, e-mail ou téléphone du client. Le nom du client figure désormais dans les informations de confidentialité relatives au bon fournisseur.

L’API de préparation du bon reste protégée par Cloudflare Access, les droits boutique et la vérification d’une commande payée et non annulée. Sa réponse contient uniquement les données nécessaires au document, sans téléphone ni e-mail du client et sans secret de suivi. L’historique note la préparation des données ; il n’atteste pas que le fichier a été enregistré sur l’ordinateur. Le PDF est téléchargé uniquement ; il n’est pas envoyé automatiquement au fournisseur. Le logo utilise l’asset PNG du club présent dans le dépôt.

## Mails clients et notifications club

L’envoi existant fonctionne : en staging, il est normal que les messages clients arrivent sur `MAIL_TEST_TO`. Cette redirection est **conservée**.

La nouvelle version crée des notifications club indépendantes :

| Événement | Notification club |
| --- | --- |
| Nouvelle commande boutique | Référence, nom du client, montant et lien vers la fiche admin. |
| Nouvelle inscription tournoi | Référence, tournoi, club/équipe, nom du contact et lien vers la fiche admin. |
| Paiement confirmé | Référence et état du paiement ; le montant indiqué est celui de la commande ou inscription. |
| Autre changement de paiement | Notification de changement d’état, notamment remboursement ou montant à vérifier. |
| Nouvel avis de satisfaction | Notes et commentaire facultatif, avec lien vers la commande dans l’administration. |

Les notifications club portent `[CLUB]` dans leur objet. Elles vont à **l’e-mail de contact renseigné dans les paramètres boutique** (`settings.contact_email`) en production. Vérifier que cette adresse est bien `contact@fcescalquens.fr`, avec l’orthographe exacte du domaine. Les tournois utilisent ces mêmes coordonnées de contact partagées pour les paiements et e-mails.

Les mails clients conservent le lien personnel de suivi. Les mails club contiennent uniquement un lien vers l’administration protégée par Cloudflare Access, jamais le lien magique du client.

### Staging et production

| Environnement | Messages clients | Notifications club |
| --- | --- | --- |
| Staging | Redirigés vers `MAIL_TEST_TO`, préfixe `[TEST]`. | Redirigées vers `MAIL_TEST_TO`, préfixes `[TEST] [CLUB]`. |
| Production | Adresse de la commande ou de l’inscription. | Adresse de contact configurée dans les paramètres. |

En staging, une nouvelle commande peut donc produire **deux messages dans la même boîte de test** : un exemplaire client et un exemplaire club. Un paiement confirmé produit également les deux notifications correspondantes. Le bouton « Tester l’envoi d’un e-mail » envoie seulement son message de test ; il ne représente pas ces notifications métier.

### Fiabilité et confidentialité

La migration ajoute `audience` et `recipient` dans la file D1. Les notifications club sont créées par des triggers SQLite dans la même transaction que les événements d’envoi ou le nouvel avis. Une répétition de la même création ou du même événement de paiement ne crée pas de deuxième notification club.

La création d’un avis et son envoi club sont atomiques. Les deux destinataires ont leurs propres états et reprises : un refus de la boîte club ne marque pas le mail client comme échoué. La fiche de commande affiche l’audience et le destinataire réellement utilisé pour chaque tentative ; les paramètres affichent des compteurs séparés client/club. L’état « Accepté par le serveur » reste une confirmation du transport, pas une preuve d’arrivée en boîte principale.

Les traitements HTTP en arrière-plan prennent un petit lot de messages avec deux envois simultanés, pour éviter l’accumulation d’envois SMTP séquentiels au-delà de la durée de `waitUntil`. Le cron traite un lot plus important. Les verrous, les reprises exponentielles et la limitation du nombre d’essais restent actifs. SMTP peut exceptionnellement produire un doublon lors d’une perte de connexion après acceptation ; l’identifiant stable du message ne constitue pas une garantie d’unicité de livraison.

Les nouveaux triggers sont limités au module concerné et restent inactifs pendant la copie initiale des tournois : les anciennes inscriptions conservées dans ORDERS ne déclenchent pas de notifications boutique. Il n’y a **aucun renvoi massif des événements historiques** lors de la migration. Les destinataires effectifs restent des données privées d’administration et suivent la purge des traces d’envoi.

## Installation sur la branche staging

Télécharger le patch à la racine du dépôt, après la V5.2.12 :

```bash
git branch --show-current
git apply --check fce-correctif-v5.2.13.patch
git apply fce-correctif-v5.2.13.patch
npm test
npm run typecheck:shop
npm run build
```

Si `git apply --check` échoue, ne pas forcer le patch : vérifier les versions installées et les modifications locales.

Le workflow staging existant applique déjà toutes les migrations de `ORDERS` et `TOURNAMENTS` avant le déploiement. Il suffit donc de commiter **les deux nouveaux fichiers SQL avec le code** puis de pousser :

```bash
git add migrations-orders/0004_mail_audiences.sql migrations-tournaments/0004_mail_audiences.sql public/commerce-ux.css public/contacts-tournaments.css public/tournament-checkout.css public/shop-common.js src/components/ShopAdminLayout.astro src/components/TournamentLayout.astro src/pages/boutique/index.astro src/pages/tournois/index.astro src/pages/confidentialite/index.astro src/scripts/admin-shop.js src/scripts/admin-tournaments.js src/shop/mail.ts src/shop/service.ts src/shop/purchase-order-pdf.ts tests/shop.test.ts tests/purchase-order.test.ts tests/tournament-copy-cli.test.ts docs/BOUTIQUE.md docs/CORRECTIF-V5.2.13.md
git commit -m "Ajoute les notifications club et le bon fournisseur PDF"
git push origin staging
```

Pour un déploiement manuel uniquement, appliquer d’abord les deux migrations distantes :

```bash
npx wrangler d1 migrations apply ORDERS --remote --env staging
npx wrangler d1 migrations apply TOURNAMENTS --remote --env staging
npx wrangler deploy --env staging
```

Ne pas appliquer ces migrations sur `DB`. Pour la production, utiliser la racine de la configuration Wrangler (`--env=""`) et les bases de production déjà configurées. Ne pas déployer le nouveau code avant l’application des migrations de l’environnement concerné.

## Recette staging

1. Recharger la boutique : bandeau compact, image correctement contenue et actions lisibles sur ordinateur et smartphone.
2. Vérifier les grands boutons de la page tournois, la confirmation du formulaire et le paiement depuis le suivi.
3. Créer une nouvelle commande : deux lignes d’envoi « Client » / « Club », deux messages dans `MAIL_TEST_TO`, aucun envoi à l’adresse fictive saisie.
4. Payer dans HelloAsso Sandbox : mail client de confirmation et notification `[CLUB]`. Rafraîchir le suivi ou répéter le webhook ne doit pas créer une nouvelle notification pour le même état de paiement.
5. Télécharger le PDF depuis une commande payée. Vérifier le logo, le nom du client, les tailles et personnalisations, l’absence de référence produit et des mentions supprimées, puis tester une commande longue.
6. Envoyer un nouvel avis : une notification club avec les notes et le commentaire, aucun lien magique client dans son contenu.
7. Créer une inscription tournoi, puis la payer : les notifications doivent figurer dans la base et l’administration des tournois, jamais dans la liste des commandes boutique.
8. Vérifier que le lien admin d’un mail club demande bien Cloudflare Access et les droits propres à son module.

Aucun secret SMTP, identifiant HelloAsso ni règle Cloudflare Access n’est modifié par ce patch.

Références techniques :
- Cloudflare `waitUntil` : https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- Durées des Workers et crons : https://developers.cloudflare.com/workers/platform/limits/
