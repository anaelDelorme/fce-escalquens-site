# V5.2.8 — diagnostic du test de connexion HelloAsso

Le message « La connexion HelloAsso n’a pas répondu » masquait aussi les erreurs de lecture de réponse, de chiffrement et de stockage. Un retour en 1 à 3 secondes ne permettait donc pas de conclure à une panne ou à des identifiants incorrects.

Ce correctif distingue ces étapes sans exposer de secret, de jeton, de réponse fournisseur ni de message natif susceptible de contenir des données privées. Il ne prétend pas résoudre la cause distante avant identification.

## Installation après V5.2.7

Placez le patch à la racine du dépôt puis lancez dans Codespaces :

```bash
git switch staging
git pull --ff-only
git apply --check fce-correctif-v5.2.8.patch
git apply fce-correctif-v5.2.8.patch
node --import tsx --test tests/shop.test.ts
npm run typecheck:shop
npm run build
git add src/shop/helloasso-auth.ts tests/shop.test.ts docs/CORRECTIF-V5.2.8.md
git commit -m "Précise le diagnostic de connexion HelloAsso"
git push origin staging
```

Aucune migration, aucun nouveau secret et aucun changement de configuration ne sont nécessaires.

## Une seule vérification après déploiement

Attendez la réussite du workflow staging, rechargez les paramètres boutique et cliquez une fois sur **Tester la connexion HelloAsso**. Relevez le nouveau message et sa référence, sans transmettre les identifiants.

| Code | Étape identifiée |
| --- | --- |
| HELLOASSO_NETWORK | Échec de l’appel au serveur OAuth avant réponse exploitable |
| HELLOASSO_TIMEOUT | Délai de la requête OAuth dépassé |
| HELLOASSO_AUTH | Rejet explicite HTTP ou réponse sans jeton valide |
| HELLOASSO_AUTH_RESPONSE | Lecture JSON de la réponse OAuth impossible |
| HELLOASSO_TOKEN_ENCRYPTION | Échec du chiffrement des jetons reçus |
| HELLOASSO_TOKEN_STORAGE | Échec de lecture/enregistrement du cache dans le bloc de renouvellement |

La libération du verrou est conservée après un échec. Aucun jeton en clair n’est enregistré en remplacement du cache chiffré. Ne changez pas les secrets au hasard et ne supprimez pas les commandes pour ce diagnostic.
