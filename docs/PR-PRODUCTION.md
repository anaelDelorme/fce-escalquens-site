Le test de connexion HelloAsso réussit pour `fc-escalquens`, mais la création du paiement d’une inscription est refusée avec un message générique. Le test effectue seulement OAuth et des lectures d’associations : son succès ne démontre pas l’autorisation Checkout de l’application API.

Les refus de création affichent désormais leur statut HTTP avec une indication adaptée : droits Checkout pour un 403, authentification pour un 401, informations de la demande pour un 400/422, association ou service pour un 404 et conflit pour un 409. Les messages sont fixes et ne reprennent aucune réponse brute du prestataire. Les deux administrations précisent la portée du test de connexion.

Les paramètres partagés boutique/tournois et le traitement des paiements sont conservés : une réponse explicitement refusée marque la tentative en échec ; une expiration réseau reste incertaine et bloque une seconde création automatique. Ce changement permet d’identifier le refus réel ; il ne modifie pas les autorisations du compte HelloAsso.

Validation : tests simulant le compte commun, une connexion réussie suivie d’un refus Checkout 403, les refus 400/422 et l’absence de seconde création après expiration réseau ; suite complète, TypeScript, build et workflow vérifiés. Aucun appel réel de création de paiement.

Après déploiement, reprendre le paiement depuis le suivi de l’inscription existante et relever le nouveau statut si le refus persiste. Ne pas finaliser le règlement pour ce simple contrôle.
