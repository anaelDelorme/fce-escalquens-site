# FC Escalquens — Astro + Cloudflare

Le dépôt complet du futur site : Astro génère les pages statiques, un Cloudflare Worker sert les assets et l’API, D1 contient les données, R2 les photos/PDF, et le même Worker synchronise les rencontres FFF et les plateaux du District.

## Voir le site en local

Prérequis : Node.js 22 et npm.

```bash
cp .dev.vars.example .dev.vars
npm install
npm run local
```

Ouvrez ensuite :

- site : http://127.0.0.1:8787
- administration : http://127.0.0.1:8787/admin/

Dans l’administration locale, cliquez sur « Connexion locale » et saisissez la valeur `DEV_ADMIN_TOKEN` de `.dev.vars`. En production, ce jeton n’est pas utilisé : Cloudflare Access transmet l’adresse email du bénévole connecté.

## Créer les ressources Cloudflare

```bash
npm run setup:cloudflare
```

La commande crée D1 et R2. Copiez l’identifiant D1 retourné dans `wrangler.jsonc`, à la place de `00000000-0000-0000-0000-000000000000`, puis :

```bash
npm run db:migrate:remote
npm run deploy
```

## Protéger `/admin`

Dans Cloudflare Zero Trust : Access → Applications → Add application → Self-hosted. Protégez `votre-domaine.fr/admin/*` et `votre-domaine.fr/admin-api/*` avec le mode « One-time PIN ». Le compte initial est `anael.delorme@posteo.com`. Le Worker vérifie ensuite l’adresse authentifiée dans la table `admins`, administrable depuis le back-office.

Pour le site public, laissez `/api/*` accessible en lecture. Toutes les opérations du back-office passent par `/admin-api/*` et restent protégées par Access.

Pour verrouiller le site de recette entier, ne mettez jamais le mot de passe dans GitHub. Définissez-le comme secret :

```bash
npx wrangler secret put TEST_SITE_PASSWORD
```

L’identifiant par défaut est `fce`. Une valeur temporaire possible est `FCE-Test-2026!`, à transmettre uniquement aux testeurs et à remplacer avant une ouverture publique.

## GitHub

```bash
git init
git add .
git commit -m "Site FC Escalquens"
git branch -M main
git remote add origin git@github.com:VOTRE-COMPTE/fce-escalquens.git
git push -u origin main
```

Ajoutez ensuite dans GitHub → Settings → Secrets : `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID`. Chaque push sur `main` déclenche le workflow `.github/workflows/deploy.yml`.

## Synchronisation automatique

Les serveurs FFF et District pouvant refuser les appels provenant directement du réseau Cloudflare, la collecte est effectuée par `.github/workflows/sync-matches.yml`. L'action est réveillée chaque heure, puis le script ne travaille qu'aux horaires utiles en heure de Paris : tous les jours à 22 h, puis toutes les quatre heures du vendredi 16 h au lundi 14 h. Cette porte horaire interne gère automatiquement l'heure d'été et l'heure d'hiver.

La synchronisation récupère depuis `epreuves.fff.fr` les calendriers et résultats FFF du club `clNo=101544`, mais aussi les plateaux de football animation (FAL) visibles sur cette même page. Le script essaie d'abord l'accès direct. Si l'adresse IP de GitHub Actions est bloquée, ZenRows ouvre une seule fois la page publique du club dans un navigateur résidentiel français. Le navigateur lit le jeton dynamique fourni dans `ng-state` et le transmet à l'API dans l'en-tête `X-Competition`, comme l'application officielle. Dans cette unique session facturée, il charge les douze réponses mensuelles de matchs et les douze réponses mensuelles de plateaux, de juillet à juin ; le script les regroupe ensuite et les déduplique. Le jeton change à chaque session et n'est jamais enregistré dans GitHub. L'ancienne page du District de Haute-Garonne n'est interrogée qu'en secours si la collecte `epreuves.fff.fr` échoue. Le script met à jour les lignes existantes au lieu de les dupliquer et conserve l'historique des saisons. Les logos domicile et extérieur sont enregistrés sous forme d'URL officielles ; une initiale est affichée lorsqu'un logo n'est pas fourni.

Créez une valeur secrète longue, enregistrez-la dans Cloudflare, puis ajoutez la même valeur dans GitHub → Settings → Secrets and variables → Actions sous le nom `FCE_SYNC_TOKEN` :

```bash
openssl rand -hex 32
npx wrangler secret put FCE_SYNC_TOKEN
```

Ajoutez également ces secrets dans GitHub → Settings → Secrets and variables → Actions :

- `FCE_SITE_URL` : l'origine du site sans barre finale, par exemple `https://fce-escalquens.votre-sous-domaine.workers.dev` ;
- `ZENROWS_API_KEY` : la clé API copiée depuis le tableau de bord ZenRows.

La clé ZenRows reste uniquement dans les secrets GitHub : elle ne doit être ajoutée ni au dépôt, ni à Cloudflare, ni à `.dev.vars`. Après le déploiement, lancez Actions → « Synchroniser les matchs » → Run workflow. Le journal attendu commence par `Collecteur FCE 2026.09.02-12`, affiche `FFF : 12/12 mois de matchs et 12/12 mois de plateaux capturés.`, puis `FFF : … matchs et … plateaux reçus via zenrows-browser.`. Une seule requête ZenRows doit être comptabilisée pour cette exécution.

Instagram sera synchronisé par le même Worker dès que le compte professionnel et le jeton Meta seront disponibles. Les variables sensibles se configurent avec `wrangler secret put`, jamais dans GitHub ou le code.

## Pages et contenus

- `/equipes/` : toutes les équipes, filtre par section et accès aux fiches.
- `/equipes/fiche/?slug=u13f` : photo, effectif, coach, dirigeant, entraînements et galerie.
- `/planning/` : filtres section, équipe et jour, avec itinéraire Google Maps.
- `/matchs/` : matchs à venir, historique et classements lorsqu’ils sont diffusés.
- `/contacts/` : annuaire filtrable avec responsabilités et disponibilités.
- `/mecenat/` : page commerciale partageable aux prospects.

Les champs détaillés sont administrables dans `/admin/`. La migration `0002_team_profiles_and_standings.sql` ajoute l’encadrement, les effectifs, les galeries et les classements.

Le District publie pour chaque phase des indicateurs `diffusion_calendriers`, `diffusion_resultats` et `diffusion_classements`. Le synchroniseur doit respecter ces indicateurs : aucun résultat ou classement ne doit être affiché lorsque sa diffusion est désactivée.

## Commandes utiles

- `npm run local` : site complet + D1 local + administration.
- `npm run build` : construire Astro.
- `npm run db:migrate:local` : appliquer les migrations en local.
- `npm run db:migrate:remote` : appliquer les migrations sur Cloudflare.
- `npm run deploy` : publier le Worker et les assets.
