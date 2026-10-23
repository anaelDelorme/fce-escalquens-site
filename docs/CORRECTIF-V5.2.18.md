# V5.2.18 — annonces sur l’accueil

À appliquer après la V5.2.17 (`e883caf`). Une rubrique **Annonces de l’accueil** est ajoutée dans l’administration du site. Les annonces apparaissent directement dans **À la une**, sous le bandeau principal de l’accueil. Aucune page publique d’actualité, archive ou fenêtre automatique n’est créée.

## Créer une annonce

1. Ouvrir `/admin/`, puis **Annonces de l’accueil** dans les rubriques.
2. Cliquer sur **Ajouter une annonce**.
3. Renseigner le titre et le texte. Les boutons **Gras** et **Liste** facilitent la mise en forme. Une ligne vide sépare les paragraphes.
4. Ajouter éventuellement une image. Elle apparaît immédiatement dans l’aperçu après son envoi. Une description de l’image est nécessaire pour publier avec une photo.
5. Ajouter éventuellement un lien et un texte de bouton descriptif, par exemple **Inscrire mon équipe**, **Découvrir le nouveau maillot** ou **Voir les résultats**. Les raccourcis Tournois, Boutique et Matchs préremplissent ces champs ; ils restent modifiables pour viser une page ou un tournoi précis.
6. Vérifier l’aperçu, puis **Enregistrer en brouillon** ou **Publier sur l’accueil**.

Le texte est affiché intégralement dans le bloc, sans page « Lire la suite ». Un maximum de 3 000 caractères favorise les messages courts. Titre, texte, image et lien restent modifiables après publication. Les brouillons ne sont jamais exposés dans le flux public.

### Période et ordre

La section facultative **Période et ordre d’affichage** permet de définir un début et une fin. Les heures utilisent le fuseau de l’appareil qui saisit le formulaire.

- Sans dates : visible dès la publication, jusqu’à son retrait.
- Avec un début : l’annonce est réservée jusqu’à cette date.
- Avec une fin : elle cesse d’apparaître à partir de cette date, sans intervention ni tâche planifiée.
- Les numéros d’ordre les plus petits passent en premier ; à ordre égal, les nouvelles annonces passent avant les anciennes.
- Six annonces au maximum s’affichent. La liste d’administration distingue les annonces en attente quand cette limite est atteinte.

Le filtre de dates est appliqué côté serveur à chaque lecture. Une page déjà ouverte est actualisée lorsqu’on revient dans son onglet ; on peut également la recharger. Sans annonce active, la section est entièrement masquée. Une panne du flux d’annonces ne bloque pas le reste de l’accueil.

Pour retirer une annonce sans perdre son contenu, ouvrir sa fiche et **Enregistrer en brouillon**. **Supprimer** la retire définitivement après confirmation.

## Accès sécurisé du site

La gestion se trouve sous `/admin/actualites/`, ses API sous `/admin/actualites/api/`. Elle utilise l’application Cloudflare Access de **l’administration du site**, et la liste des administrateurs actifs de la base `DB`.

En plus de la protection Cloudflare des chemins `/admin` et `/admin/*`, le Worker vérifie lui-même la signature du JWT, son émetteur, son expiration, l’adresse et l’audience. Un simple en-tête d’e-mail ne suffit pas. Les droits boutique et tournois ne donnent pas de droits sur ces annonces.

Deux variables sont utilisées :

| Variable | Valeur |
| --- | --- |
| `CF_ACCESS_ISSUER` | Domaine d’équipe Cloudflare déjà utilisé, par exemple `https://votre-equipe.cloudflareaccess.com`. |
| `CF_ACCESS_SITE_AUD` | **Application Audience (AUD)** de l’application qui protège l’administration du site. Ce n’est ni son Policy ID, ni l’audience boutique ou tournois. |

### Renseigner l’audience en staging

1. Ouvrir l’application Cloudflare Access qui protège l’administration du site et copier son **Application Audience (AUD)**.
2. Depuis Codespaces, dans le dépôt :

```bash
node scripts/configure-news-access.mjs --env staging --aud VOTRE_AUD_SITE
```

Le script reprend `CF_ACCESS_ISSUER` déjà présent dans le fichier. S’il n’y figure pas :

```bash
node scripts/configure-news-access.mjs --env staging --issuer https://VOTRE-EQUIPE.cloudflareaccess.com --aud VOTRE_AUD_SITE
```

3. Vérifier :

```bash
node scripts/configure-news-access.mjs --env staging --check
git diff -- wrangler.jsonc
```

Le script conserve les bases D1, R2, les audiences boutique et tournois, les mails et les variables de production. L’AUD est un identifiant de configuration ; aucun identifiant HelloAsso ou mot de passe n’est nécessaire.

L’erreur `NEWS_ACCESS_CONFIG` signifie que ces variables manquent. `ACCESS_INVALID` indique notamment une audience différente de l’application qui a authentifié le navigateur. `FORBIDDEN` signifie que l’adresse n’est pas active parmi les administrateurs du site.

En local, la rubrique reprend le jeton `DEV_ADMIN_TOKEN` saisi via **Connexion locale** dans l’administration principale. Ce mode n’est accepté que pour `APP_ENV=local` sur localhost/127.0.0.1.

## Installation staging

1. Installer la V5.2.17, puis appliquer le correctif :

```bash
git status
git apply --check fce-correctif-v5.2.18.patch
git apply fce-correctif-v5.2.18.patch
```

2. Configurer l’audience du site comme ci-dessus.
3. Vérifier :

```bash
npm test
npm run typecheck:shop
npm run build
```

4. Enregistrer et pousser **tous les fichiers du correctif et le fichier `wrangler.jsonc` configuré** sur `staging`. Le workflow applique la nouvelle migration **`migrations/0035_news.sql`** sur **DB**, puis déploie le Worker.

La migration crée uniquement la table `news` et son index. Les articles boutique, commandes et inscriptions restent inchangés. Aucune migration ORDERS ou TOURNAMENTS, aucune nouvelle base et aucun réglage HelloAsso/mail à effectuer.

Pour un déploiement manuel, après les vérifications :

```bash
npx wrangler d1 migrations apply DB --remote --env staging
npx wrangler deploy --env staging
```

## Fiabilité et rendu

- Le formulaire conserve les saisies lors d’une erreur de validation ou d’envoi.
- Les créations utilisent une clé d’idempotence : une réponse réseau perdue suivie d’une relance identique ne crée pas de doublon.
- Une modification ou suppression vérifie la version enregistrée : deux administrateurs ne peuvent pas écraser silencieusement leurs modifications.
- Le texte est échappé avant la mise en forme ; HTML et scripts ne sont pas interprétés. Les liens dangereux et les images externes sont refusés.
- L’import réutilise le stockage R2 du site et vérifie le type réel des fichiers. SVG et PDF ne sont pas acceptés pour les annonces.
- Les images ont une description, des dimensions réservées et un chargement différé. Le bloc et l’éditeur s’adaptent au téléphone.
- Les données restent dans DB ; aucun cookie publicitaire, prestataire d’envoi ou newsletter n’est ajouté.

## Recette

Créer une annonce Tournoi avec image et lien, l’enregistrer en brouillon puis vérifier son absence sur l’accueil. La publier et vérifier l’image, le texte complet et le bouton sur téléphone et ordinateur. Essayer un lien Boutique et un résultat. Tester une fin passée, une date future, le retour en brouillon et une modification simultanée dans deux onglets.

Les tests couvrent le rendu sûr, les dates, les brouillons, le contrôle JWT propre au site, les reprises réseau, les versions concurrentes, l’import d’images, l’aperçu et le formulaire. La recette visuelle sur vos appareils reste à effectuer après déploiement.

Vérification avant livraison : 138 tests passent ; TypeScript et build Astro validés. Aucun déploiement distant n’est effectué pendant la préparation du correctif.
