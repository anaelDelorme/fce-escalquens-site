La boutique propose désormais uniquement le tarif FCE : l’accès par code coach, ses sessions et les champs de prix coach sont retirés. Les commandes déjà enregistrées gardent leur montant et la remise par le coach reste disponible.

Les mails boutique, tournois et notifications club utilisent une présentation commune : en-tête du club, informations principales, récapitulatif lisible et bouton de suivi. Les destinataires et les transports sont conservés. Les conditions acceptées sont jointes au texte des confirmations et ne sont plus répétées dans les simples relances de suivi.

L’administration des inscriptions affiche les effectifs par catégorie et par tournoi, les clubs/équipes concernés et un filtre de catégorie. Les quantités de chaque section sont additionnées ; les inscriptions annulées sont exclues des effectifs. Le récapitulatif porte sur les inscriptions chargées, avec la limite existante de 500 explicitement indiquée.

Une opération dédiée copie tous les articles, variantes, personnalisations et images de staging vers la production, après sauvegardes chiffrées et vérification de chaque média. Seul le catalogue est remplacé ; commandes, paiements, tournois et paramètres HelloAsso restent en production. Les prix coach sont supprimés et la visibilité initiale de la boutique est restaurée après vérification.

Validation : 193 tests, TypeScript, build et vérifications de configuration. Les tests couvrent les anciens cookies coach, les destinataires et le contenu des mails, les effectifs par catégorie et l’isolation de la copie boutique, y compris les échecs et modifications concurrentes. Aucun mail réel ni paiement de test lancé.

La copie du catalogue utilise le workflow « Copier la boutique staging vers production » sur la branche dédiée `ops/sync-shop-production`. Le code de cette PR est déployé lors de sa fusion dans `main`.
