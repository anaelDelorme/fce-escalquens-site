# Correctif d’accès boutique, confidentialité et pied de page

Ce correctif est basé sur votre branche `staging`, commit `0c947ec` (« Corrige les bindings D1 du staging »). Il ne modifie aucune référence D1 ou R2, ne crée aucune base et ne nécessite pas de compte HelloAsso.

## Diagnostic des captures

L’erreur `ACCESS_CONFIG` vient du Worker : `CF_ACCESS_ISSUER` et/ou `CF_ACCESS_SHOP_AUD` sont absents ou invalides. La création de l’application Access et de sa politique e-mail/PIN ne renseigne pas automatiquement ces variables dans le Worker. Votre fichier de configuration staging publié sur GitHub ne les contient pas.

Le correctif rend le message plus précis et tolère les espaces et le slash final lors de la copie du domaine d’équipe. Il conserve toutes les vérifications de signature, d’émetteur, d’audience, d’expiration et d’habilitation.

## 1. Appliquer le correctif dans Codespaces

Télécharger `fce-correctif-acces-affichage.patch`, puis adapter son chemin :

```bash
git switch staging
git status
git pull --ff-only origin staging
git apply --check ../fce-correctif-acces-affichage.patch
git apply ../fce-correctif-acces-affichage.patch
```

Si des modifications locales sont en cours ou si `--check` signale un conflit, ne pas écraser les fichiers : enregistrer le travail et adapter le correctif avant de continuer.

## 2. Retrouver les deux valeurs Access

Dans Cloudflare Zero Trust :

- **Domaine d’équipe** : `https://VOTRE-EQUIPE.cloudflareaccess.com`. Ce n’est pas l’adresse `workers.dev` du site ni `fcescalquens.fr`.
- **Application Audience (AUD)** de l’application **fce-escalquens boutique Staging**. Ouvrir l’application, puis ses informations/configurations d’audience. Copier la valeur AUD de l’application, généralement une chaîne de 64 caractères hexadécimaux.

Le `Policy ID` de la règle « Login Boutique » visible dans la capture est un UUID : **il ne convient pas** comme audience. La règle peut être partagée par deux applications, mais les audiences de l’application staging et de l’application production restent distinctes.

Ces valeurs ne sont pas des clés secrètes, mais elles doivent être exactes.

## 3. Renseigner les variables staging sans modifier les bases

Remplacer les deux valeurs d’exemple ci-dessous, puis lancer :

```bash
node scripts/configure-shop-access.mjs \
  --env staging \
  --issuer https://VOTRE-EQUIPE.cloudflareaccess.com \
  --aud AUD_DE_L_APPLICATION_BOUTIQUE_STAGING \
  --origin https://fce-escalquens-staging.fcescalquens.workers.dev
```

Le script met à jour uniquement ces trois variables dans `env.staging.vars` de `wrangler.jsonc` :

```text
CF_ACCESS_ISSUER
CF_ACCESS_SHOP_AUD
SHOP_ORIGIN
```

Les bases DB/ORDERS, leurs UUID et les buckets restent inchangés. Vérifier :

```bash
node scripts/configure-shop-access.mjs --env staging --check
node scripts/configure-orders.mjs --check staging
git diff -- wrangler.jsonc
```

Les valeurs sont enregistrées dans la configuration du dépôt pour être présentes au prochain déploiement. Ne pas simplement les ajouter dans le tableau de bord puis les perdre lors d’un push ultérieur.

## 4. Ajuster les destinations des applications Access

Dans l’application **boutique Staging**, pour le même hôte `fce-escalquens-staging.fcescalquens.workers.dev`, garder :

```text
/admin-boutique
/admin-boutique/*
```

L’API est située sous `/admin-boutique/api/*`, donc déjà couverte. Les destinations `/admin-boutique-api` et `/admin-boutique-api/*` visibles dans la capture ne correspondent à aucune API de cette version : les retirer pour éviter la confusion.

Dans l’application **du site staging**, remplacer le motif trop large `/admin*` par :

```text
/admin
/admin/*
/admin-api/*
```

Cela évite que la règle du site englobe également `/admin-boutique`. La politique « Login Boutique » de la capture combine une liste d’e-mails avec le PIN obligatoire : ce principe est correct ; aucun élargissement de la liste n’est nécessaire pour résoudre `ACCESS_CONFIG`.

Ne pas changer les règles de production pour corriger le staging. Ne pas protéger le site public entier ni le webhook HelloAsso avec l’application boutique.

## 5. Vérifier l’habilitation boutique D1

```bash
npx wrangler d1 execute ORDERS --remote --env staging \
  --command "SELECT email,name,active FROM shop_admins;"
```

L’adresse utilisée pour recevoir le PIN doit être active dans cette liste. Si elle n’y figure pas, ajouter votre adresse explicite :

```bash
npx wrangler d1 execute ORDERS --remote --env staging \
  --command "INSERT INTO shop_admins(email,name,active) VALUES('vous@example.org','Responsable boutique',1) ON CONFLICT(email) DO UPDATE SET active=1;"
```

Remplacer `vous@example.org` avant exécution. Être administrateur du site ne donne pas automatiquement les droits boutique.

## 6. Construire puis pousser

```bash
npm ci
npm test
npm run typecheck:shop
npm run build
git add src/components/Footer.astro src/components/LegalPage.astro public/legal.css src/shop/security.ts scripts/configure-shop-access.mjs tests/access-configuration.test.ts docs/CORRECTIF-ACCES-ET-AFFICHAGE.md wrangler.jsonc
git commit -m "Corrige l’accès boutique et la lisibilité des pages légales"
git push origin staging
```

Attendre la réussite du workflow de déploiement. Un build seul ne met pas le site en ligne.

## 7. Recette après déploiement

- Ouvrir `/confidentialite/` : les intertitres utilisent une police de lecture, sans Impact ni capitales forcées ; paragraphes et listes sont espacés et lisibles sur mobile.
- En bas de page, rubrique « Le club » : présence des liens « Administration du site » et « Administration boutique ».
- Ouvrir `/admin-boutique/` dans une fenêtre privée et demander un nouveau PIN si nécessaire.
- Si `ACCESS_CONFIG` persiste, le Worker indique maintenant les noms des variables manquantes/invalides : vérifier le déploiement et les variables du Worker **staging**, pas celles de production.
- Si le message devient « session invalide », vérifier l’AUD de la bonne application et le domaine d’équipe.
- Si le message devient « adresse sans droits », vérifier `shop_admins` et l’adresse réellement utilisée.

Le rendu en navigateur et l’authentification sur votre compte Cloudflare restent à vérifier après déploiement ; les captures ne contiennent pas le domaine d’équipe ni l’AUD permettant de compléter votre configuration à votre place.

Référence officielle : https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
