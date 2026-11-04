# V5.2.10 — enregistrer les paramètres boutique avant l’ouverture

À appliquer après la V5.2.9. Aucune migration, aucun changement de secret.

## Problème corrigé

La sauvegarde appelait le contrôle d’ouverture dès que la case « Ouvrir la prise de commandes » était cochée. Si une information du vendeur, du retrait ou du transport mail manquait, toutes les modifications étaient rejetées, y compris un changement de contact sans rapport avec ce manque.

Les paramètres valides s’enregistrent désormais indépendamment de la disponibilité effective du paiement. Le backoffice confirme la sauvegarde et liste les éléments à compléter. Les contrôles de format, le verrouillage du slug après une tentative de paiement et la protection contre les modifications concurrentes restent actifs.

La case exprime la demande d’ouverture du club. Le paiement ne devient effectivement disponible que si l’affichage boutique, les informations requises, les secrets et le transport mail sont prêts. La vérification est toujours faite côté serveur au moment d’une commande : cette correction ne permet pas de contourner la fermeture du paiement.

La liste détaillée des éléments manquants est réservée à l’administration. Le catalogue public conserve un message adapté aux acheteurs.

## Étape à effectuer

Téléchargez le patch à la racine du dépôt, sur la branche staging, puis :

```bash
git apply --check fce-correctif-v5.2.10.patch
git apply fce-correctif-v5.2.10.patch
git add src/shop/service.ts src/scripts/admin-shop.js tests/shop.test.ts tests/shop-ui.test.ts docs/CORRECTIF-V5.2.10.md
git commit -m "Permet la sauvegarde progressive des paramètres boutique"
git push origin staging
```

Attendez le déploiement, rechargez les paramètres boutique et réessayez d’enregistrer votre contact ou votre e-mail. Les changements doivent rester présents après rechargement. Si le paiement n’est pas prêt, le bandeau indique précisément les éléments à compléter, sans transformer la sauvegarde en erreur.

La connexion HelloAsso ayant déjà répondu « sandbox · fce · Encaissement autorisé », il n’y a pas à remplacer ses identifiants pour corriger cette sauvegarde.
