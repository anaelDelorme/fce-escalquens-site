# État de validation de la livraison

**Version actuelle : V5.1.** Voir la section V5.1 et son guide en fin de document. Les premières sections décrivent les livraisons précédentes.

## Vérifications effectuées

- 24 tests API / SQL SQLite passent : panier et prix serveur, données manquantes, idempotence et concurrence, cloisonnement des bases, absence de jeton en clair, accès par lien, origine étrangère, faux retours de paiement, réconciliation, notifications répétées et signées, récupération après réponse perdue, remboursement, quantités et versions, enquête unique, récupération et révocation du lien, reprises mail et purge.
- Vérification TypeScript des nouveaux modules boutique réussie.
- Syntaxe des scripts front office et backoffice vérifiée avec Node.
- Construction Astro réussie : pages boutique, suivi, backoffice, CGV et confidentialité incluses.
- Compilation et empaquetage Worker vérifiés par un déploiement à blanc (`--dry-run`, aucun envoi sur Cloudflare).
- Toutes les migrations du site, y compris `0029_shop_checkout.sql`, appliquées sur la D1 locale de test ; migration des commandes appliquée sur une deuxième D1 locale distincte.
- Aucun secret local dans les fichiers suivis ; `.dev.vars.*` est exclu du dépôt, à l’exception du modèle.

## Vérifications restant à faire sur staging

Le démarrage du serveur interactif Wrangler est bloqué dans l’environnement de livraison par une erreur système de détection réseau (`uv_interface_addresses`). La recette visuelle en navigateur n’a donc pas été réalisée ici.

Les vrais services externes n’ont pas été appelés pour encaisser ou envoyer un mail. Leur recette nécessite les deux bases distantes à créer, les identifiants Sandbox HelloAsso, l’activation du transport mail, les règles Cloudflare Access et les informations légales du club.

Les mocks API suivent les structures documentées de HelloAsso. Il faut vérifier en Sandbox les retours effectifs du compte de l’association, la contribution volontaire, la disponibilité des notifications et la délivrabilité des mails avant de basculer en production.

Les UUID des nouvelles D1 sont des valeurs de remplacement bloquantes. Les ventes sont fermées par défaut. Ni staging ni production ne sont déployés par cette livraison.

La procédure et les scénarios détaillés de recette figurent dans [BOUTIQUE.md](BOUTIQUE.md).

## Version 2 : séparation des administrations

Page et API boutique déplacées sous `/admin-boutique/`. Les habilitations sont désormais dans `ORDERS.shop_admins`, avec une audience dédiée `CF_ACCESS_SHOP_AUD`. Les catégories, articles, réglages, PDF et couverture disposent d’un éditeur dans cet espace. L’administration du site ne les propose plus et les anciennes API sont fermées. Les workflows de préproduction utilisent la branche `staging`.

Les nouveaux tests vérifient cette séparation, la protection des médias par espace et l’utilisation du catalogue sans HelloAsso avec paiement fermé. La recette visuelle et les vrais services externes restent à vérifier dans votre staging.

## V5.1 : raccordement Sandbox et inscriptions aux tournois

**52 tests réussis**, contrôle TypeScript réussi, construction des 34 pages Astro réussie et Worker empaqueté avec `wrangler deploy --dry-run --env staging` (aucun déploiement distant).

- Authentification OAuth réelle Sandbox et lecture de l’association `fce` réussies le 18 octobre 2026 ; `isCashInCompliant=true`. Aucun checkout externe ni paiement ou mail client créé pour cette vérification.
- Tests ajoutés pour inscription différée sans intention HelloAsso, capacité, prix et conditions figés, versions concurrentes, séparation des audiences et habilitations, paiement ultérieur, absence de secret dans les URL de retour, cache OAuth chiffré et renouvellement, échéance, récupération, révocation et clôture. Des tests DOM couvrent également le formulaire et la conservation du suivi en cas d’erreur.
- Les 31 migrations DB et les 3 migrations ORDERS s’appliquent intégralement sur deux SQLite distinctes ; contrôle d’intégrité des clés étrangères réussi.
- La recette des vrais webhooks, des mails et du paiement dans le navigateur reste à effectuer sur le Worker staging après installation des secrets, des accès et des migrations. Aucun déploiement distant effectué ici.
- Guide et recette : [BOUTIQUE-V5.1-INSTALLATION.md](BOUTIQUE-V5.1-INSTALLATION.md).
