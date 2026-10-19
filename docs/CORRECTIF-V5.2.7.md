# V5.2.7 — validation des tournois et ouverture Sandbox de la boutique

À appliquer après la V5.2.6. Aucune migration D1 ni copie de données.

## Changements

Les réglages des tournois n’imposent plus un ordre entre clôture des inscriptions, date limite générale de paiement et date limite d’envoi des chèques. Une date déjà passée peut être conservée lors de l’édition d’un tournoi. Le minimum arbitraire de 60 caractères pour les conditions est supprimé. Les champs nécessaires, la validité des valeurs et les limites de taille restent contrôlés.

Les échéances enregistrées restent effectives dans le parcours public : ce correctif ne rouvre pas un tournoi expiré et ne permet pas de régler au-delà de la date applicable à une inscription. Une date de paiement dépassée peut donc fermer les inscriptions publiques même si le statut administratif reste ouvert ; ajustez aussi les échéances si vous souhaitez les rouvrir.

Les champs de médiateur avaient été retirés de l’écran, mais un ancien contrôle les exigeait encore côté serveur. Ils ne bloquent désormais plus l’ouverture des commandes. Les autres informations nécessaires à la vente et au retrait restent contrôlées.

Le guide `docs/HELLOASSO-SANDBOX-PAS-A-PAS.md` décrit le raccordement de staging, les secrets, les e-mails, les URL HelloAsso et la recette complète de la boutique à partir de l’état montré sur votre capture.

## Installation

```bash
git switch staging
git pull --ff-only
git apply --check fce-correctif-v5.2.7.patch
git apply fce-correctif-v5.2.7.patch
npm test
npm run typecheck:shop
npm run build
git add src/tournaments/service.ts src/scripts/tournament-sales-fields.js src/shop/service.ts tests/shop.test.ts docs/CORRECTIF-V5.2.7.md docs/HELLOASSO-SANDBOX-PAS-A-PAS.md docs/BOUTIQUE.md
git commit -m "Assouplit les dates des tournois et débloque la configuration boutique"
git push origin staging
```

Après réussite du déploiement, réenregistrez les réglages de votre tournoi puis suivez le guide Sandbox. Si vous modifiez aussi `wrangler.jsonc` pendant cette installation, relisez ses changements et ajoutez-le explicitement au commit.
