# Boutique : améliorations et installation sur staging

Ce correctif fait suite à `fce-correctif-acces-affichage.patch`. Il ne modifie aucun UUID D1 ni variable Access. Il ne crée aucune base et ne nécessite aucune nouvelle migration. Il n’a pas été déployé depuis cet environnement.

## Installer le correctif

Dans Codespaces, sur la branche `staging`, enregistrez vos changements en cours avant l’application. Téléchargez `fce-boutique-ux-v3.patch` et déposez-le à la racine du dépôt.

```bash
git branch --show-current
git apply --check fce-boutique-ux-v3.patch
git apply fce-boutique-ux-v3.patch
npm ci
npm run typecheck:shop
npm test
npm run build
git add package.json package-lock.json public src scripts tests docs
# .gitignore est lui-même ignoré dans l’ancien dépôt.
git add -f .gitignore
git commit -m "Améliore les parcours boutique et la gestion des responsables"
git push origin staging
```

Attendez la réussite du workflow staging. Rechargez les pages (Ctrl+Maj+R). Si `git apply --check` échoue, n’utilisez pas `--reject` : les fichiers ont évolué, il faut adapter le correctif à votre version.

## Prix par taille et ajout au panier

Un article visible n’est pas automatiquement vendable. Ses anciens champs de prix sont des textes de présentation ; ils ne doivent jamais devenir des montants encaissés automatiquement.

Dans `/admin-boutique/` → **Tailles et options** :

1. Sélectionnez l’article.
2. Dans **Tailles / modèles**, créez une variante active par combinaison vendue : taille, couleur si nécessaire, référence fournisseur et prix exact en euros. Exemple : `Enfant - 6 ans`, taille `6 ans`, 20 € ; puis `Adulte - M`, taille `M`, 25 €.
3. Enregistrez chaque variante. L’article sélectionné reste sélectionné après l’enregistrement.
4. Créez les options éventuelles, leur supplément et, si nécessaire, les règles du texte personnalisé.
5. Vérifiez la fiche publique puis son panier avant l’ouverture des paiements.

La carte affiche le prix exact si tous les tarifs sont identiques, sinon **À partir de**. Le choix de taille indique chaque prix, et le total options comprises est recalculé avant ajout. Une seule variante sans option permet l’ajout direct ; plusieurs variantes proposent **Choisir ma taille**, et les personnalisations sont nommées explicitement. Sans variante active, la commande est annoncée bientôt disponible et les détails restent consultables.

Le bouton **Détails de l’article** ouvre une fenêtre adaptée au mobile, avec description, composition si renseignée dans la description, tailles, prix et options. Aucune composition n’est inventée.

## Catalogue PDF automatique et panier

Le lien de la collection télécharge `/api/shop/catalogue.pdf`. Le PDF daté est produit à la demande depuis les articles actifs avec image et les variantes/options actives. Il contient descriptions, tailles, tarifs exacts et délais renseignés. Les articles présentés sans variante sont signalés non commandables. Cette première édition est textuelle, sans photos. Les anciens PDF manuels ne remplacent plus ce catalogue.

Le panier reste accessible dans une barre fixe au bas de l’écran, avec compteur mis à jour et accès au suivi. Les conditions de vente, la confidentialité et la récupération de commande sont des liens identifiés séparément. Le formulaire et les contrôles de paiement HelloAsso restent ceux de la boutique sécurisée.

## Récupérer le suivi sans référence

Sur `/boutique/suivi/`, seule l’adresse e-mail est obligatoire. La référence est un filtre facultatif. Au maximum les dix dernières commandes correspondantes reçoivent chacune leur lien à l’adresse de commande. L’API ne révèle ni leur existence, ni leur référence, ni leur contenu dans la réponse affichée. Les limites par adresse et par IP restent actives. Les liens existants ne sont pas révoqués par cette récupération ; leur stockage reste uniquement sous forme de hash.

En staging, les mails sont toujours redirigés vers `MAIL_TEST_TO`. Il faut avoir configuré le transport mail et `TRACKING_SECRET` pour tester leur réception. Si le client a perdu l’accès à son e-mail, il contacte le club ; aucune procédure publique ne permet de remplacer arbitrairement le destinataire.

Les CGV actualisées conservent leurs sections et titres. La confidentialité du suivi est expliquée dans un encart dépliable, avec un lien explicite vers la politique de confidentialité.

## Ajouter des administrateurs boutique

Dans **Accès administrateurs**, ajoutez le nom et l’adresse du responsable puis activez son accès. Autorisez également cette adresse dans la règle de votre application Cloudflare Access boutique, avec PIN par e-mail. Les deux contrôles sont nécessaires.

Les droits sont enregistrés uniquement dans `ORDERS.shop_admins`. Un administrateur boutique peut gérer les autres responsables boutique. Il peut réactiver ou désactiver un autre responsable ; il ne peut pas désactiver sa propre adresse. Une désactivation bloque les nouvelles actions sur l’API même si la session Access est encore valide. Pour un départ, retirez également l’adresse de la règle Cloudflare.

## Reprendre catégories et articles de production

Le script importe uniquement `shop_categories` et `shop_products`. La production est lue ; seul le catalogue staging est modifié. Les correspondances utilisent les **slugs**, et non les identifiants numériques : les variantes/options déjà configurées sur staging restent rattachées à leurs articles. Les articles propres au staging ne sont pas supprimés. Si vous avez changé des slugs, harmonisez-les avant d’importer pour éviter les doublons.

Commencez par un aperçu, sans écriture distante :

```bash
npx wrangler whoami
node scripts/import-shop-prod-to-staging.mjs
```

Le résumé et le SQL de prévisualisation sont enregistrés sous `backups/boutique-…/`. Après vérification, appliquez :

```bash
node scripts/import-shop-prod-to-staging.mjs --apply
```

Le script :

1. Relit les deux tables de production.
2. Exporte une sauvegarde SQL de la base **site staging**, avant modification.
3. Copie les images référencées vers un préfixe unique dans R2 staging, sans écraser les médias déjà présents. Une image absente ou une erreur de copie interrompt l’import avant l’écriture D1.
4. Ajoute ou actualise les catégories/articles par slug, avec remappage des catégories et des chemins d’image.

Les variantes/prix de paiement ne sont pas importés depuis les anciennes descriptions : configurez-les après l’import. Ni les commandes, ni les responsables, ni les secrets, ni les paramètres HelloAsso ne sont copiés. L’image de couverture de la boutique n’est pas incluse dans cet import d’articles.

La commande exige une session Wrangler disposant de droits de lecture sur D1/R2 production et d’écriture sur D1/R2 staging, ainsi que l’utilitaire `file` présent dans Codespaces. Les sauvegardes restent locales, sont ignorées par Git et doivent être conservées avant de nettoyer le dossier. En cas d’erreur, ne relancez pas en inversant les environnements : examinez le message et la sauvegarde. Si l’écriture D1 échoue, contrôlez les tables avant de relancer ; l’import par slug peut être répété. Les images déjà copiées mais non référencées pourront être nettoyées séparément.

## Vérifications

Tests automatisés : signature/autorisation Access, indépendance des droits, ajout/désactivation des responsables, interdiction de désactiver sa propre adresse, refus d’origine étrangère, récupération sans référence sans énumération, PDF valide et multipage, import avec slugs et identifiants staging différents, prix serveur, idempotence et paiements HelloAsso existants.

Les essais locaux utilisent des données fictives. Les paiements HelloAsso Sandbox, la réception effective des e-mails, les règles Cloudflare et la copie des bases/médias réels restent à vérifier dans votre environnement staging après installation. Aucun compte HelloAsso n’est nécessaire pour consulter le catalogue ou configurer les variantes.
