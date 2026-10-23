# V5.2.21 — actualités plus légères et mise en attente de la boutique

À appliquer après la V5.2.20.

## Présentation des actualités

Le bandeau sous le menu utilise maintenant un fond clair, un titre sombre et des accents bordeaux discrets. Le grand bloc bordeaux et la ligne jaune sont retirés. Le titre reste visible avant le visuel d’ouverture.

La carte de l’annonce utilise une bordure neutre fine, des angles légèrement arrondis et une ombre légère. Le cadre rouge au clic sur **Découvrir** était lié au focus de l’ancre : il est supprimé. Un repère de focus reste disponible pour la navigation au clavier.

## Mettre la boutique en attente

Un bloc **Mettre la boutique en pause** apparaît en haut de toutes les pages de `/admin-boutique/`.

1. Vérifier la miniature de l’image d’attente.
2. Cliquer sur **Afficher uniquement l’image d’attente**.
3. Ouvrir ou recharger `/boutique/` pour vérifier l’affichage public.

Le catalogue et la barre panier sont masqués au profit de la page d’attente avec l’image configurée. L’en-tête et le pied de page du site sont conservés.

Pour rouvrir, utiliser le même bloc et cliquer sur **Réafficher la boutique**. Les articles, tailles, prix, personnalisations, commandes et paramètres de paiement sont conservés.

### Choisir l’image

Si aucune image n’est enregistrée, le bouton de mise en attente est désactivé et indique où l’ajouter :

1. Ouvrir **Couverture et affichage**.
2. Dans **Image de la page d’attente**, cliquer sur **Modifier la fiche**.
3. Importer l’image, vérifier l’aperçu puis enregistrer la fiche.
4. Le bloc de mise en attente s’actualise après la sauvegarde.

L’ancienne case **Afficher la boutique publique** est remplacée par ce bouton commun : il n’y a plus deux contrôles concurrents dans l’éditeur.

### Fonctionnement et erreurs

Le bouton utilise l’API protégée existante de l’administration boutique et ne modifie que `shop_settings.shop_enabled` dans la base du site. Il ne change pas les paramètres de paiement. Réafficher le catalogue ne réactive donc pas un paiement désactivé dans les paramètres.

Les doubles clics sont bloqués pendant l’enregistrement. Une erreur d’accès ou de réseau est affichée dans le bloc et permet une nouvelle tentative. Une requête répétée applique le même état sans supprimer de données.

Le changement public est visible au prochain chargement de la page ; une page déjà ouverte n’est pas remplacée automatiquement. Les nouvelles commandes sont refusées côté serveur lorsque la boutique est masquée. Les commandes existantes, leur suivi et leurs paiements en cours restent gérés normalement.

## Installation staging

Depuis la branche `staging` avec la V5.2.20 installée :

```bash
git status
git apply --check fce-correctif-v5.2.21.patch
git apply fce-correctif-v5.2.21.patch
npm test
npm run typecheck:shop
npm run build
```

Enregistrer tous les fichiers du correctif, puis commit et push sur `staging` selon votre procédure habituelle.

**Aucune migration ni variable à ajouter.** Le visuel de fermeture déjà configuré est réutilisé. Si le staging n’a pas encore son image, l’ajouter une seule fois dans **Couverture et affichage**.

## Vérification après déploiement

- Cliquer sur **Découvrir** dans le bandeau de l’accueil : vérifier la carte sans cadre rouge, sur ordinateur et téléphone.
- Depuis l’admin boutique, passer en attente : vérifier l’image et l’absence de catalogue/panier public après rechargement.
- Vérifier que les commandes restent accessibles dans l’administration et par leurs liens de suivi.
- Réafficher la boutique et vérifier le retour du catalogue.
- Essayer sans image configurée et vérifier le lien vers son réglage.

Les tests couvrent la bascule dans les deux sens, la conservation des autres champs, les doubles clics, la reprise après erreur, l’image requise, l’actualisation du visuel, le rendu du mode d’attente et le refus serveur d’une nouvelle commande pendant la fermeture. La recette visuelle reste à effectuer sur le staging après déploiement.

Validation avant livraison : **147 tests passent**, TypeScript et build Astro validés. Aucun déploiement distant effectué.
