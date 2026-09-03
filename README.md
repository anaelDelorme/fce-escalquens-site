# FC Escalquens — Astro + Cloudflare

Site du club construit avec Astro, Cloudflare Workers, D1 pour les données,
R2 pour les photos et PDF, Cloudflare Access pour l'administration et GitHub
Actions pour le déploiement et les synchronisations.

## Lancer le site en local

Prérequis : Node.js 24 et npm.

```bash
cp .dev.vars.example .dev.vars
npm install
npm run local
```

- site : http://127.0.0.1:8787
- administration : http://127.0.0.1:8787/admin/

En local, utilisez « Connexion locale » puis la valeur `DEV_ADMIN_TOKEN` du
fichier `.dev.vars`. En production, Cloudflare Access transmet l'adresse email
et le Worker vérifie qu'elle est active dans la table `admins`.

## Base D1 et médias R2

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

Les migrations sont additives : elles ne suppriment pas les informations saisies
en ligne. Ne lancez jamais `db:seed:local` sur la base distante. Les photos et
PDF chargés dans l'administration restent dans R2.

## Protection du site de test

```bash
npx wrangler secret put TEST_SITE_PASSWORD
```

L'identifiant par défaut est `fce`. Pour le changer :

```bash
npx wrangler secret put TEST_SITE_USER
```

Protégez séparément `/admin/*` et `/admin-api/*` dans Cloudflare Access avec
le mode One-time PIN. Les autres administrateurs s'ajoutent ensuite dans
`/admin/` → « Administrateurs ».

## GitHub et déploiement automatique

Le dépôt de référence est :
`https://github.com/anaelDelorme/fce-escalquens-site`.
La bonne origine étant déjà configurée, ne relancez pas `git remote add origin`.

```bash
git remote -v
git add .
git commit -m "Amélioration du site du FC Escalquens"
git push origin main
```

Dans GitHub → Settings → Secrets and variables → Actions, ajoutez :

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `FCE_SITE_URL`
- `FCE_SYNC_TOKEN`
- `ZENROWS_API_KEY`

Chaque push sur `main` lance `.github/workflows/deploy.yml` : installation,
build, application des nouvelles migrations D1 puis déploiement du Worker et des
assets. Une image ajoutée dans `public/` sera donc publiée au prochain push.
Les médias déjà présents dans R2 ne sont pas affectés.

## Synchronisation des matchs et plateaux

Le workflow `.github/workflows/sync-matches.yml` utilise ZenRows uniquement
aux six horaires suivants, en heure de Paris :

- mercredi à 21 h ;
- vendredi à 16 h ;
- samedi à 9 h et 20 h ;
- dimanche à 20 h ;
- lundi à 20 h.

Les deux décalages UTC possibles sont programmés dans GitHub, puis le script ne
conserve que l'heure de Paris correcte. Le passage heure d'été/heure d'hiver est
automatique.

Le collecteur charge les douze mois de la saison dans une seule session ZenRows.
Il récupère les matchs et les plateaux de football animation, les logos, les
participants aux plateaux, les terrains, les adresses et les coordonnées GPS
lorsqu'ils sont fournis par la FFF. Les détails des rencontres proches sont lus
dans cette même session : cela ne crée pas une deuxième requête ZenRows.

Le journal attendu commence par :

```text
Collecteur FCE 2026.09.03-13
```

## Groupes sportifs et équipes engagées

Un **groupe sportif** correspond à une page publique, un staff, une photo et des
entraînements communs : par exemple `U9`.

Les **équipes engagées** décrivent les inscriptions en compétition :
`U9 1 — D1`, `U9 2 — D3`, `U9 3 — D3`. Chacune possède son identifiant
FFF, mais toutes peuvent être rattachées au même groupe sportif. Les matchs
remontent alors sur la bonne page sans dupliquer le staff ou le planning.

En fin de saison :

1. créer la nouvelle saison ;
2. créer ou recopier ses équipes engagées ;
3. marquer la nouvelle saison comme active.

Les anciennes saisons et leurs résultats restent conservés dans D1.

## Matchs amicaux et tournois

Les rencontres officielles de l'administration sont en lecture seule car elles
sont synchronisées. Le bouton « Ajouter » permet de saisir un match amical.

Un tournoi peut être relié à plusieurs groupes via « Participations aux
tournois ». Le lien Tournify, le terrain, l'organisateur, l'inscription et le
règlement sont gérés séparément.

## Actualités Instagram

Pour activer les actualités :

1. passer le compte Instagram en compte professionnel Business ou Creator ;
2. le relier à la page Facebook officielle du club ;
3. créer une application Meta et autoriser la lecture des médias Instagram ;
4. récupérer l'identifiant du compte et un jeton longue durée ;
5. enregistrer les secrets dans Cloudflare :

```bash
npx wrangler secret put INSTAGRAM_USER_ID
npx wrangler secret put INSTAGRAM_ACCESS_TOKEN
```

`.github/workflows/sync-instagram.yml` actualise ensuite les publications chaque
matin. Tant que les secrets ne sont pas configurés, il s'arrête sans casser le
déploiement. Aucun jeton Meta ne doit être commité.

## Commandes utiles

- `npm run local` : site complet, D1 local et administration.
- `npm run build` : construction Astro.
- `npm run db:migrate:local` : migrations locales.
- `npm run db:migrate:remote` : migrations Cloudflare.
- `npm run deploy` : publication du Worker et des assets.
