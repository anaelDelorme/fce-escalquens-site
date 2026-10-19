# V5.2.9 — compatibilité des appels HelloAsso avec Cloudflare Workers

## Cause identifiée

Les appels OAuth et API HelloAsso utilisaient `redirect: "error"`. Le runtime Cloudflare Workers refuse cette option avec une TypeError avant d’émettre la requête. La V5.2.8 signalait donc un échec à l’étape réseau, même si aucune connexion n’avait été tentée.

Le comportement a été reproduit localement dans le runtime workerd via Miniflare, avec la date de compatibilité du site. Le mode `manual` a été accepté dans le même test.

## Correction

Les deux appels utilisent maintenant `redirect: "manual"`. Toute réponse HTTP 3xx est refusée explicitement avec le code `HELLOASSO_REDIRECT`. Aucune redirection n’est suivie et aucun secret, bearer token ou corps de paiement n’est transféré à une autre URL. Cette correction concerne aussi bien l’authentification que les appels API suivants, pour la boutique et les tournois.

Les délais, le cache OAuth chiffré, les vérifications de paiement et la séparation Sandbox/Production restent en place. Aucune migration ni modification des secrets n’est nécessaire.

## Étape à effectuer maintenant

Après la V5.2.8, téléchargez le patch à la racine du dépôt et appliquez-le depuis la branche staging :

```bash
git apply --check fce-correctif-v5.2.9.patch
git apply fce-correctif-v5.2.9.patch
git add src/shop/helloasso-auth.ts src/shop/helloasso.ts tests/shop.test.ts docs/CORRECTIF-V5.2.9.md
git commit -m "Corrige les appels HelloAsso dans Cloudflare Workers"
git push origin staging
```

Attendez la réussite du déploiement avant de poursuivre le raccordement. Le test à effectuer ensuite sera de recharger les paramètres boutique puis de cliquer sur « Tester la connexion HelloAsso ».

Cette correction résout l’incompatibilité de construction de requête observée. Le prochain test distant doit encore confirmer les identifiants, le slug et l’accès à l’association ; aucun encaissement réel n’a été réalisé pendant la validation locale.

## Validation

Les tests couvrent la connexion et les appels Checkout avec le mode compatible. Ils vérifient également qu’une redirection OAuth/API est refusée après un seul appel, sans suivre la destination et sans révéler son URL ou des données confidentielles dans le message d’erreur.

Référence officielle : https://developers.cloudflare.com/workers/runtime-apis/request/
