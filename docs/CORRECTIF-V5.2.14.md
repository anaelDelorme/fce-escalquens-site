# V5.2.14 — tarifs boutique et aperçus des photos

Correctif cumulatif sur la V5.2.13 (commit de référence `2d1d9ba`). Aucun changement d’identifiant D1, de compte HelloAsso ou de configuration SMTP.

## Tarifs par article, taille et modèle

Dans **Gestion boutique → Articles → Modifier la fiche**, chaque taille/modèle propose :

| Champ | Utilisation |
| --- | --- |
| Tarif FCE | Prix de vente obligatoire appliqué au public. Le champ existant est conservé et les anciens prix restent valides. |
| Prix catalogue | Prix public du catalogue fournisseur, facultatif. Le laisser vide supprime la référence affichée. Renseigner une référence réelle correspondant au même article et au même modèle. |
| Tarif coach | Prix facultatif appliqué seulement après saisie du code coach. À défaut, le tarif FCE s’applique. |

Les articles simples disposent des trois mêmes champs, avec une seule variante. Les suppléments de personnalisation restent identiques pour tous.

L’affichage est volontairement sobre : **Tarif FCE** en premier et prix catalogue plus petit. Aucun badge « promotion », pourcentage ou message « vous économisez ». Ce prix catalogue désigne la référence fournisseur, pas un ancien prix FCE. Si seules certaines tailles ont une référence, celle-ci apparaît après sélection de la taille et dans ses détails ; aucune comparaison entre des tailles différentes. Les cartes présentent une fourchette lorsque les prix varient.

Le panier, le paiement HelloAsso et la commande utilisent le prix réellement appliqué, recalculé par le serveur. Les commandes déjà enregistrées conservent leurs montants. Le PDF de collection conserve les **tarifs FCE publics**, même s’il est téléchargé par un coach, pour éviter de partager les prix privés. Les prix catalogue renseignés y figurent dans les lignes des tailles/modèles.

## Activer le tarif coach

1. Renseigner les tarifs coach souhaités dans les fiches articles, puis enregistrer.
2. Ouvrir **Gestion boutique → Paramètres → Accès aux tarifs coach**.
3. Cliquer sur **Générer le code coach**. Copier le code affiché une seule fois et le transmettre aux coachs par un canal choisi par le club.
4. Sur la boutique, ouvrir **Vous êtes coach ?**, saisir le code et valider.
5. Les prix sont actualisés et l’accès reste valable 8 heures sur le navigateur utilisé. Le panier reste conservé ; ses montants suivent le tarif actif. Un article sans prix coach reste au tarif FCE.
6. **Quitter les tarifs coach** supprime l’accès sur ce navigateur. Renouveler ou désactiver le code depuis les paramètres révoque tous les accès précédents.

Il s’agit d’un **code commun donnant accès au tarif**, sans compte ni vérification de l’identité de son porteur. Toute personne à qui il est transmis peut l’utiliser. Renouveler le code en cas de diffusion involontaire. Il ne donne aucun droit d’administration.

Le code généré est aléatoire (128 bits), conservé uniquement sous forme de hash avec le secret serveur. Le cookie est signé, HttpOnly, Secure sur staging/production, SameSite=Strict, limité à 8 heures et révocable. Les tentatives sont limitées ; les mutations vérifient l’origine. Le code ne passe ni dans l’URL ni dans le stockage navigateur. Les réponses publiques sans accès valide ne contiennent pas le prix coach. La génération est réservée aux administrateurs boutique existants.

Le secret `TRACKING_SECRET` déjà utilisé pour le suivi reste nécessaire. Ne pas le modifier pour installer cette version : cela affecterait les liens de suivi existants.

## Présentation et photos

- Haut de boutique plus lumineux : fond crème/doré, photo plus présente, logo du club et bouton vers la collection ; disposition adaptée au mobile.
- Les zones d’envoi de photos boutique montrent le visuel actuel et actualisent l’aperçu après un envoi réussi, avant l’enregistrement de la fiche.
- Même fonctionnement pour la photo et l’affiche du tournoi. Le règlement reste un fichier PDF, sans aperçu photo.
- La clé média peut toujours être modifiée manuellement ; un message précise si l’aperçu échoue. Il faut enregistrer la fiche pour publier la modification.
- Les pages Confidentialité et Cookies décrivent l’accès coach.

## Installation staging

### 1. Appliquer le correctif

Se placer dans le dépôt sur la branche `staging`, avec les modifications précédentes enregistrées. Copier le patch à la racine du dépôt :

```bash
git status
git apply --check fce-correctif-v5.2.14.patch
git apply fce-correctif-v5.2.14.patch
```

Si `git apply --check` échoue, ne pas forcer : vérifier que la V5.2.13 est installée. Ne pas appliquer les fichiers `.rej` ou refaire des modifications à la main à l’aveugle.

### 2. Vérifier le code

```bash
npm ci
npm test
npm run typecheck:shop
npm run build
```

### 3. Migrer et déployer

Le workflow staging existant applique les migrations **DB** et **ORDERS** avant de déployer. Enregistrer et pousser les fichiers de ce correctif sur `staging`, puis vérifier la réussite de GitHub Actions. Le build seul ne migre pas les bases.

Pour un déploiement manuel, avec le jeton Cloudflare déjà configuré dans Codespaces :

```bash
npx wrangler d1 migrations apply DB --remote --env staging
npx wrangler d1 migrations apply ORDERS --remote --env staging
npx wrangler deploy --env staging
```

Nouvelles migrations : `migrations/0033_shop_reference_coach_prices.sql` et `migrations-orders/0005_coach_access.sql`. Les appliquer avant le nouveau Worker. Aucun SQL à copier dans la base de production, aucune nouvelle base à créer, aucune nouvelle migration tournois dans ce correctif.

### 4. Recette rapide

1. Article simple : tarif FCE 25 €, prix catalogue 35 €, tarif coach 20 €.
2. Vérifier en navigation publique : 25 €, référence catalogue 35 €, aucune mention ni valeur du tarif coach dans les réponses réseau.
3. Laisser le prix catalogue vide sur un autre article : seule la valeur FCE apparaît.
4. Article avec tailles : vérifier deux tarifs différents et leur référence propre dans la sélection et les détails.
5. Générer un code puis activer les tarifs coach : le prix passe à 20 €. Le montant du panier et celui envoyé à HelloAsso sont identiques. En staging, les mails vont toujours à `MAIL_TEST_TO`.
6. Vérifier le retour FCE d’un article sans prix coach et le catalogue PDF aux tarifs FCE publics.
7. Renouveler le code : l’ancien accès ne permet plus de créer une commande coach. Le panier reste récupérable ; une commande déjà créée conserve son montant et son suivi.
8. Modifier une photo boutique, une photo et une affiche de tournoi : aperçu avant publication, puis affichage après sauvegarde.
9. Vérifier le haut de page sur téléphone et ordinateur, avec la photo par défaut puis un visuel de couverture personnalisé.

La production reste inchangée tant que cette version n’est pas déployée sur sa branche.

## Vérification

115 tests automatisés passent, dont le calcul serveur des tarifs, le refus d’un montant modifié, la confidentialité des prix coach, les cookies, la révocation et les aperçus des deux administrations. TypeScript et build Astro validés. La recette visuelle sur vos appareils et le paiement Sandbox restent à effectuer après déploiement.
