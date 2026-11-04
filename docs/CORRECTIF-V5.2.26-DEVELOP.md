# V5.2.26 — retouches boutique et version futuriste, sur develop

Branche de travail demandée : **`develop`**. À appliquer sur la boutique V5.2.25. Aucun push ni déploiement distant n’a été effectué pendant la préparation.

## Point de départ : remettre develop à niveau

Vérification du dépôt le 30 octobre 2026 :

| Branche | Révision observée | État |
| --- | --- | --- |
| `develop` | `0ff4b9dc479f3364d80ad50c93dfaff5567ae075` | Ancienne version, sans la nouvelle boutique HelloAsso et ses variantes. |
| `staging` | `706544f0f20a9ae88ebb2b6742a88464b5fa3ace` | Contient la boutique V5.2.25, avec 28 commits supplémentaires. |

À cette date, `develop` est un ancêtre de `staging` : une **avance rapide** permet de reprendre l’historique existant sans créer de conflit de fusion. Cette opération locale ne modifie ni `staging` ni `main` et ne déploie rien. Elle reprend l’ensemble des évolutions déjà présentes dans staging, dont la boutique, les tournois et les annonces.

Depuis le dépôt, vérifier et enregistrer vos modifications en cours avant de changer de branche, puis :

```bash
git status
git fetch origin
git switch develop
git merge --ff-only origin/staging
```

Si Git refuse l’avance rapide, ne pas utiliser `reset --hard` ou de push forcé : l’écart doit être réexaminé pour conserver les éventuels nouveaux commits de develop. Le petit correctif visuel ne doit pas être appliqué sur l’ancienne version de develop dépourvue de la boutique.

## Changements de présentation

### Boutique commune

- Les photos sont dégagées : suppression des pastilles de tailles/personnalisation et du libellé visible **Agrandir**. Le clic sur l’image et le curseur loupe ouvrent toujours le zoom. Le nom accessible du bouton est conservé pour les lecteurs d’écran.
- Une courte ligne sous le prix indique seulement l’essentiel, par exemple **Enfant & adulte · Personnalisable**. Les tailles précises restent dans le choix de l’article et dans les détails regroupés.
- **Voir les détails** devient un contrôle de type lien, sans cadre, avec un libellé accessible propre à chaque article. Le bouton de commande reste l’action principale.
- L’espace réservé sous les noms courts est réduit.

### Boutique-2 : défilement horizontal

Les flèches au-dessus des cartes sont supprimées. Le défilement reste natif au doigt, au pavé tactile et au clavier. Une progression fine sous les articles permet de parcourir la rangée directement ; elle indique sa position, le nombre d’articles et disparaît si la rangée n’a pas besoin de défiler.

Les extrémités présentent un léger fondu pour suggérer les articles hors champ. Les filtres remettent la rangée au début et actualisent le nombre d’articles. Aucun défilement automatique n’est ajouté.

### Boutique-3 : haut de page

Le grand bloc sombre et son dégradé sont remplacés par une ouverture claire, sans cadre massif, intitulée **La collection FCE.** Les textes bordeaux sur fond clair rétablissent le contraste et le titre est plus court. Les grandes lignes de produits sont conservées.

### Boutique-4 : collection immersive

Nouvelle page **`/boutique-4/`** : fond sombre, accents bordeaux et or, panneaux légèrement translucides et composition asymétrique des articles. Le premier article de chaque catégorie occupe davantage de largeur sur ordinateur ; la grille se simplifie sur téléphone.

L’ouverture **L’esprit FCE. Nouvelle dimension.** utilise des couleurs de texte explicitement contrastées, avec la photo de couverture existante. Les filtres, prix, boutons et informations sont adaptés au thème sombre. Les fenêtres de choix, détails et panier conservent leur présentation claire.

Les versions 2, 3 et 4 utilisent le **même catalogue, les mêmes tarifs, le même panier et les mêmes règles de paiement**. La version 4 est ajoutée au bandeau de comparaison présent uniquement sur les pages expérimentales.

## Installer le correctif sur develop

Après la remise à niveau ci-dessus, placer le patch à la racine du dépôt :

```bash
git branch --show-current
git apply --check fce-correctif-v5.2.26.patch
git apply fce-correctif-v5.2.26.patch
npm test
npm run typecheck:shop
npm run build
```

La branche affichée doit être **develop**. Si la V5.2.23 de sécurité Node est installée, lancer `nvm use` avant npm selon son guide.

Enregistrer tous les fichiers du correctif, puis faire le commit et le push vers **develop**, selon votre procédure habituelle :

```bash
git commit -m "Améliore les présentations boutique et ajoute boutique-4"
git push origin develop
```

La commande de commit suppose que les fichiers modifiés et nouveaux ont été ajoutés à l’index Git auparavant. Vérifier notamment la nouvelle page `src/pages/boutique-4/index.astro` et ce guide.

Le workflow existant déploie automatiquement **staging**, pas develop. Un push sur develop ne publie donc pas ces pages sur le site de staging. Pour la recette distante, il faudra ensuite promouvoir develop vers staging par votre procédure habituelle, après revue. Aucune modification de workflow n’est incluse dans cette livraison.

**Aucune migration ni modification des bases, des commandes, des prix ou des secrets.**

## Pages à comparer après déploiement de test

| Chemin | Style |
| --- | --- |
| `/boutique/` | Boutique principale, photos dégagées et lien de détails sans cadre. |
| `/boutique-2/` | Collection horizontale avec progression discrète sous les cartes. |
| `/boutique-3/` | Catalogue éditorial et en-tête clair. |
| `/boutique-4/` | Collection immersive sombre, bordeaux et or. |

Les trois variantes restent absentes du menu public et du sitemap, avec `noindex,nofollow`. Elles sont accessibles à quiconque connaît leur adresse ; elles ne constituent pas des espaces privés. Le paiement utilise l’environnement configuré pour le Worker, donc effectuer la recette sur le staging sandbox.

## Recette

1. Vérifier les photos sans pastilles ni texte Agrandir, puis cliquer pour tester le zoom et sa fermeture au clavier.
2. Vérifier l’ouverture des détails avec **Voir les détails** et le choix de taille/personnalisation.
3. Sur boutique-2, faire défiler au doigt/pavé tactile, puis déplacer la progression et la manipuler au clavier. Vérifier les filtres et une catégorie dont tous les articles tiennent à l’écran.
4. Sur boutique-3, vérifier le titre, les textes et le bouton du haut sur ordinateur et téléphone.
5. Sur boutique-4, vérifier la grille asymétrique sur ordinateur, son adaptation sur téléphone et la lisibilité des prix, du catalogue et du panier.
6. Vérifier le panier en changeant de présentation et le mode image d’attente de la boutique.

Validation : 151 tests passent, TypeScript et build Astro validés. La présence des métadonnées de non-indexation et l’absence des variantes dans le sitemap sont vérifiées sur les fichiers construits. La recette visuelle sur vos appareils reste à effectuer après déploiement.
