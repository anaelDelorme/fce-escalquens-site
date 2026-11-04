# V5.2.19 — accès et images des annonces

À appliquer après la V5.2.18. Compatible avec ou sans le petit correctif du journal du test de duplication : ce fichier de test n’est pas inclus dans cette livraison.

## Changements

- **Annonces de l’accueil**, dans le menu de `/admin/`, utilise maintenant la même fonction d’autorisation que les autres rubriques du site. Il n’est plus nécessaire de renseigner `CF_ACCESS_SITE_AUD` ou d’exécuter `configure-news-access.mjs` pour y accéder. Les variables déjà présentes peuvent rester en place.
- Le contrôle des administrateurs actifs du site et le contrôle d’origine des écritures restent appliqués. Les administrateurs boutique ou tournois ne reçoivent pas de nouveaux droits.
- Le chargement d’une image ouvre le même outil de recadrage que les autres rubriques : déplacement, zoom, cadre paysage 1600 × 900 et conversion WebP. L’aperçu de l’annonce est actualisé après l’envoi.
- Annuler conserve l’image précédente. Un échec réseau laisse le recadrage ouvert pour réessayer. Les boutons du dialogue sont bloqués pendant l’envoi pour éviter un double envoi ou une fermeture en cours de traitement.
- L’outil de recadrage est partagé avec les anciennes rubriques ; leurs formats restent conservés.

## Installation dans staging

Placer `fce-correctif-v5.2.19.patch` à la racine du dépôt, sur la branche `staging`, avec la V5.2.18 déjà installée :

```bash
git status
git apply --check fce-correctif-v5.2.19.patch
git apply fce-correctif-v5.2.19.patch
npm test
npm run typecheck:shop
npm run build
```

Enregistrer les fichiers du correctif, puis faire le commit et le push sur `staging` selon votre procédure habituelle. Le workflow déploiera les changements.

**Aucune nouvelle migration, base, variable ou modification HelloAsso/mail.** La table `news` de la V5.2.18 doit déjà exister. Les annonces restent protégées par l’application Cloudflare Access existante du site, qui doit couvrir `/admin` et `/admin/*`, API comprises. Comme les autres rubriques, elles reposent sur l’identité transmise par Cloudflare et sur la liste `admins` ; les mêmes chemins ne doivent pas être accessibles via une URL sans cette protection. Le jeton d’administration existant reste utilisable selon les mêmes règles que dans les autres rubriques.

## Vérification après déploiement

1. Ouvrir `/admin/`, puis **Annonces de l’accueil** : plus de demande de configuration d’audience propre aux annonces.
2. Ajouter une annonce et choisir une photo. Déplacer la photo, régler le zoom, puis **Recadrer et charger**.
3. Vérifier l’aperçu, enregistrer en brouillon ou publier.
4. Essayer un nouvel import et l’annuler : la photo précédente doit rester affichée.
5. Vérifier un import d’image dans une autre rubrique de l’administration.

Validation avant livraison : 141 tests passent, TypeScript et build Astro validés. La vérification visuelle sur vos appareils reste à effectuer après déploiement.
