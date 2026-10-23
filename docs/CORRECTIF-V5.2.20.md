# V5.2.20 — actualités intégrées à l’administration et visibles sur l’accueil

À appliquer après la V5.2.19.

## Administration

La rubrique **Annonces de l’accueil** est désormais un bouton du menu commun de `/admin/`. Elle s’affiche dans le même panneau de contenu que les autres rubriques, sans changer de page. Le bouton **+ Ajouter**, l’en-tête, la navigation, les styles et les droits sont ceux de l’administration existante.

L’éditeur conserve les fonctions précédentes : brouillon/publication, titre, texte, image avec recadrage et aperçu, lien facultatif, dates et ordre d’affichage. Un changement de rubrique demande de confirmer l’abandon d’une saisie non enregistrée. Pendant un envoi ou un enregistrement, ce changement est bloqué.

L’adresse `/admin/#news` ouvre directement la rubrique. Les anciens liens `/admin/actualites/` redirigent vers cette adresse. Les chemins d’API restent inchangés et protégés sous `/admin/*`.

Les styles de l’éditeur sont intégrés à `public/admin.css`. Les styles publics sont regroupés dans `public/home-extra.css`. La feuille séparée `public/news.css` est supprimée.

## Accueil

Le grand visuel d’ouverture masquait les annonces au premier regard. Un bandeau compact est maintenant placé **juste sous le menu, avant le grand visuel** :

- repère **À la une**, miniature facultative, titre de la première annonce active et lien **Découvrir** ;
- le lien mène au contenu complet de l’annonce, sur la même page ;
- si plusieurs annonces sont actives, un lien indique combien d’autres sont disponibles ;
- la priorité utilise l’ordre déjà défini dans l’administration, puis la date de création ;
- sans annonce active ou si le flux est indisponible, le bandeau et la section d’annonces sont masqués ;
- le retour dans l’onglet actualise le bandeau et vérifie à nouveau les dates.

Le bandeau utilise le bordeaux et le jaune du site. Son contenu se répartit sur plusieurs lignes sur téléphone. Il ne défile pas automatiquement et n’ouvre aucune fenêtre. Les liens sont accessibles au clavier et les ancres des annonces peuvent recevoir le focus. Le flux de données existant est réutilisé sans requête supplémentaire.

## Installation staging

Après la V5.2.19, placer le fichier de correctif à la racine du dépôt :

```bash
git status
git apply --check fce-correctif-v5.2.20.patch
git apply fce-correctif-v5.2.20.patch
npm test
npm run typecheck:shop
npm run build
```

Enregistrer tous les fichiers modifiés et la suppression de `public/news.css`, puis commit et push sur `staging` selon votre procédure habituelle. Le workflow déploiera le résultat.

**Aucune nouvelle migration ni configuration.** Les annonces déjà enregistrées sont conservées. Les bases boutique/commandes/tournois, les paramètres de paiement et les mails restent inchangés.

## Recette après déploiement

1. Dans `/admin/`, ouvrir **Annonces de l’accueil** : la barre latérale et l’en-tête doivent rester présents.
2. Utiliser **+ Ajouter**, vérifier le recadrage d’une photo, puis enregistrer une annonce.
3. Modifier du texte et choisir une autre rubrique : vérifier la confirmation d’abandon.
4. Publier une annonce et ouvrir l’accueil sur ordinateur et téléphone : son titre doit apparaître dans le bandeau avant le grand visuel.
5. Cliquer **Découvrir** : vérifier l’arrivée sur le contenu complet.
6. Publier une deuxième annonce, vérifier le nombre et l’ordre ; remettre toutes les annonces en brouillon pour vérifier la disparition du bandeau.

Vérifications réalisées avant livraison : **143 tests passent**, TypeScript et build Astro validés. L’accueil de staging a été examiné dans le navigateur avant modification ; les nouveaux parcours sont couverts par les tests DOM. La recette visuelle du résultat reste à effectuer après déploiement.
