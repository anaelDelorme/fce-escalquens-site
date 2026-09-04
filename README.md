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

## Administration et Cloudflare Access

Cloudflare Access ne doit plus contenir la liste nominative des administrateurs.
Il sert uniquement à **authentifier une adresse e-mail** ; la table
« Administrateurs » du site décide ensuite si cette adresse est autorisée.

Dans l'application Access qui protège le site :

1. ajoutez les deux destinations `/admin/*` et `/admin-api/*` ;
2. créez une politique `Allow` ;
3. dans `Include`, choisissez `Login Methods` puis `One-time PIN` ;
4. retirez de cette politique la règle limitée à une liste d'adresses e-mail.

Attention : `Authentication Method` → `Pin` est une autre règle et ne convient
pas ici. Après avoir corrigé la politique, utilisez
`/cdn-cgi/access/logout`, puis reconnectez-vous à `/admin/`.

Cette modification Access n'est à faire qu'une fois. Ensuite, ajouter ou
désactiver une adresse dans `/admin/` → « Administrateurs » prend effet
immédiatement, même si la personne possède encore une session Cloudflare. Une
adresse authentifiée mais absente de cette liste reçoit une page d'accès refusé.
Il n'est donc ni nécessaire ni souhaitable de donner au site un jeton capable de
modifier Cloudflare Access.

Le bouton « Se déconnecter » ferme la session Cloudflare Access. « Connexion
locale » reste réservé au développement sur l'ordinateur.

## Import des coachs et photos

Dans « Licenciés & encadrants », le bouton « Importer un CSV » accepte le modèle
téléchargeable depuis l'administration. Les colonnes reconnues sont : nom,
email, téléphone, numéro de licence, groupe sportif, rôle et notes. Le rôle peut
être `coach référent`, `coach`, `dirigeant` ou `arbitre`. Un licencié déjà connu
par son numéro de licence, son e-mail ou son nom est mis à jour au lieu d'être
dupliqué.

« Photos du site » permet de remplacer les principales images de l'accueil, du
mécénat et la photo par défaut des pages d'équipe. Les photos propres à chaque
groupe sportif restent modifiables dans « Groupes sportifs ».

La grille publique des équipes utilise elle aussi cette photo par défaut et
classe les groupes par ordre alphabétique (avec tri numérique naturel : U8,
U9, U10…).

## Performances du site public

Les données nécessaires à chaque page sont regroupées dans une seule réponse
HTTP. Les requêtes D1 ne lisent que les lignes utiles : saison active, éléments
publiés, équipe demandée et nombre limité de rencontres sur une fiche. Par
exemple, une fiche d'équipe ne télécharge plus neuf tables complètes.

Ces réponses sont conservées 30 secondes dans le navigateur et 2 minutes sur le
réseau Cloudflare, avec possibilité de servir une version périmée pendant une
actualisation. Après une modification dans l'administration, il peut donc
falloir jusqu'à deux minutes pour voir le changement sur le site public. Les
images téléversées ont une adresse unique et peuvent être mises en cache un an.

La migration `0013_public_page_performance.sql` ajoute les index correspondant
aux lectures fréquentes, sans modifier les données existantes.

Les optimisations suivantes à envisager, par ordre d'intérêt, sont :

1. créer automatiquement une vignette WebP/AVIF lors de l'envoi d'une photo ;
2. purger précisément le cache de la page concernée après un enregistrement si
   l'affichage immédiat devient indispensable ;
3. paginer les archives de matchs lorsqu'elles couvriront plusieurs saisons ;
4. suivre les temps réels avec Cloudflare Web Analytics avant d'ajouter d'autres
   index ou services payants.

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
Collecteur FCE 2026.09.03-16
```

## Groupes sportifs et équipes engagées

Un **groupe sportif** correspond à une page publique, un staff, une photo et des
entraînements communs : par exemple `U9`.

Les **équipes FFF récupérées** décrivent les inscriptions en compétition :
`U9 1 — D1`, `U9 2 — D3`, `U9 3 — D3`. La synchronisation les crée
automatiquement avec leur numéro, leur catégorie, leur compétition et leur
identifiant exact. Dans l'administration, il reste seulement à ouvrir les lignes
« À affecter » et à choisir leur groupe sportif. Aucune affectation n'est déduite
du seul libellé de catégorie : un `U15` masculin ne peut donc plus être rattaché
automatiquement au groupe `U15F`.

Après le premier déploiement de cette version, lancez une fois manuellement
l'action GitHub « Synchroniser les matchs ». Elle initialise la liste des équipes
FFF et remet à jour les participants des plateaux. Les affectations suivantes
s'appliquent immédiatement aux matchs déjà enregistrés.

En fin de saison :

1. créer la nouvelle saison ;
2. lancer la synchronisation pour découvrir les équipes engagées ;
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
