# V5.2.6 — bandeau des tournois et libellés du contact

Ce patch s’applique après la V5.2.5. Il ne nécessite aucune migration ni nouvelle configuration.

## Modifications

La page Tournois reprend directement la classe partagée `page-hero wine`, utilisée notamment sur Planning : bandeau bordeaux, titre blanc, motifs jaunes et liseré jaune. Les règles de titre propres à l’ancien en-tête beige sont retirées. Le lien de suivi reste sous le bandeau.

Le formulaire utilise « Coordonnées du contact », « Prénom du contact » et « Nom du contact ». La mention de confidentialité et les actions d’information dans le détail d’une inscription emploient également « contact ». Les noms techniques des champs et les données déjà enregistrées restent identiques.

## Installation dans staging

Placez le patch à la racine du dépôt puis lancez dans Codespaces :

```bash
git switch staging
git pull --ff-only
git apply --check fce-correctif-v5.2.6.patch
git apply fce-correctif-v5.2.6.patch
node --import tsx --test tests/tournament-ui.test.ts
npm run build
git add public/tournament-checkout.css src/components/TournamentLayout.astro src/pages/tournois/index.astro src/scripts/admin-tournaments.js src/scripts/tournaments-checkout.js docs/CORRECTIF-V5.2.6.md
git commit -m "Aligne le bandeau tournois sur le thème et renomme le contact"
git push origin staging
```

Attendez la réussite du déploiement et rechargez `/tournois/`. La feuille de style est référencée avec une nouvelle version pour renouveler le cache navigateur.

Validation locale : les 9 tests d’interface tournois et le build Astro passent. Aucun paiement ni envoi de mail réel n’a été effectué pour ce correctif.
