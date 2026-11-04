# Coordonnées du payeur et refus HelloAsso

Source officielle consultée le 4 novembre 2026 : [spécification OpenAPI HelloAsso, version 1fe7b01](https://github.com/HelloAsso/helloasso-open-api/blob/1fe7b01be00cce09c7b1a134be27fbcaf87bb43e/helloasso.json). Le [README officiel](https://github.com/HelloAsso/helloasso-open-api/blob/1fe7b01be00cce09c7b1a134be27fbcaf87bb43e/README.MD) explique que cette spécification alimente les SDK et la documentation ReadMe.

## Contraintes publiées et règles du site

Le schéma `HelloAsso.Api.V5.Common.Models.Carts.CheckoutPayer` documente une longueur maximale de 255 caractères pour `firstName`, `lastName` et `email`, avec des valeurs facultatives. Il ne publie pas de motif interdisant les parenthèses, les chiffres ou les accents. Il ne permet donc pas d’attribuer un HTTP 400 à une parenthèse dans un prénom.

Le site conserve ses limites existantes, plus courtes : prénom et nom de 80 caractères, e-mail de 254 caractères et téléphone de 30 caractères. Ces champs sont obligatoires pour le suivi de commande ou d’inscription, même si le schéma HelloAsso les déclare facultatifs. Les règles suivantes sont des contrôles du site, pas une retranscription supposée de contraintes HelloAsso non publiées :

- Prénom et nom : présence d’au moins une lettre, refus des contrôles, retours à la ligne, caractères invisibles de mise en forme et d’une adresse e-mail ou d’un lien à la place du nom. Les noms accentués, composés et internationaux restent acceptés, ainsi que la ponctuation. Les jointures nécessaires à certaines écritures sont conservées. Aucune mention de rôle n’est retirée automatiquement de l’identité.
- E-mail : contrôle de la partie locale, du domaine et des longueurs ; refus des espaces internes, points consécutifs, domaine mal formé ou caractères de contrôle. Les adresses avec un suffixe `+` ou une apostrophe sont acceptées. La casse et les espaces extérieurs sont traités comme auparavant par le serveur.
- Téléphone : présence de 6 à 15 chiffres, `+` seulement au début, séparateurs usuels autorisés. Le téléphone sert au club et n’est pas transmis dans le `payer` Checkout actuel.

Les contrôles sont partagés entre le navigateur et le serveur. Les erreurs apparaissent sous les champs et le premier champ invalide reçoit le focus. Les coordonnées du payeur sont explicitement distinguées des mentions de coach, de club et d’équipe.

`InitCheckoutBody` documente des montants entiers en centimes au format int32. Le serveur vérifie le montant sauvegardé avant toute nouvelle tentative ; les montants ne sont pas recalculés à partir de la saisie du client à cette étape.

## Commandes déjà enregistrées

Les reprises idempotentes conservent le calcul d’empreinte antérieur pour les commandes existantes : les nouvelles règles ne réécrivent pas leur identité, leurs articles, leur prix ou leurs conditions. Une commande déjà payée retourne immédiatement son état ; une demande HelloAsso déjà active garde sa procédure de reprise et de vérification.

La validation du payeur et du montant intervient seulement avant la création d’une nouvelle tentative. Une saisie invalide n’engendre aucune nouvelle commande lors de la validation initiale. Aucune donnée réelle de production n’est corrigée automatiquement par ce changement.

## Diagnostic des refus

Les refus HTTP connus conservent leur statut et, lorsqu’ils sont identifiables dans une réponse structurée, uniquement les identifiants de champs d’une liste autorisée. Les valeurs du payeur, messages libres, jetons et corps bruts du prestataire ne sont jamais conservés ni affichés. La lecture de la réponse d’erreur est limitée à 16 Kio et à une profondeur bornée. Si le format n’est pas reconnu, seul le statut HTTP est retenu.

La boutique et les tournois affichent ces indications dans l’historique administratif. Les anciens `HELLOASSO_REJECTED` restent présentés comme un historique sans détail : leur motif précis ne peut pas être reconstruit. Les réponses incertaines et délais dépassés conservent le blocage des nouvelles tentatives ; aucun paiement n’est relancé automatiquement.

Validation : 220 tests, TypeScript et build. Contrôle dans Chromium des cinq boutiques et du formulaire tournoi, avec la vraie API sur une base locale et un prestataire simulé : erreurs avant création, HTTP 400 affichant un champ reconnu, reprise de la même commande sans doublon, aucun paiement réel.
