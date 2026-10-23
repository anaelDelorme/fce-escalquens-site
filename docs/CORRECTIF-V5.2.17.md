# V5.2.17 — dupliquer un article de boutique

À appliquer après la V5.2.16 (`e50a6e3`). Aucune migration D1 ni configuration supplémentaire.

## Utilisation

1. Ouvrir **Gestion boutique → Articles**.
2. Cliquer sur **Dupliquer** à côté de l’article souhaité.
3. La fiche de la copie s’ouvre automatiquement. Son nom porte le suffixe **(copie)** et le champ est sélectionné pour faciliter le renommage.
4. Modifier la fiche et ses tarifs si nécessaire, puis enregistrer.
5. Cocher **Visible** et enregistrer pour publier la copie.

La copie est créée **masquée**, sans être « à la une » ni « article phare ». Les autres réglages sont repris :

| Élément | Copié |
| --- | --- |
| Catégorie, textes de carte et de détails, délai | Oui |
| Photo | Même visuel, réutilisé sans nouveau fichier R2 |
| Tailles et modèles | Tous, y compris les tailles masquées et leur ordre personnalisé |
| Tarifs | FCE, catalogue et coach, y compris les prix facultatifs vides |
| Fournisseurs | Mêmes fournisseurs associés, sans recréer leurs fiches |
| Personnalisations | Libellés, suppléments, saisie demandée, limite de caractères et visibilité |
| Informations historiques | Couleur, ancienne référence et textes de prix conservés |

Les tailles et personnalisations reçoivent de nouveaux identifiants. Modifier leurs prix ou leurs textes dans la copie ne change pas l’original. La photo utilise la même clé média ; importer une autre photo dans la copie remplace seulement cette association.

Les articles simples et les fiches anciennes sans variantes peuvent également être dupliqués. Aucun montant historique libre n’est converti automatiquement en tarif de commande.

## Fiabilité et accès

La duplication est réservée aux administrateurs boutique, avec vérification de l’origine. Fiche, tailles et personnalisations sont copiées dans une seule transaction : si une étape échoue, rien n’est créé.

La même demande est conservée lors d’une relance après une réponse réseau perdue. Elle retrouve la copie existante plutôt que d’en créer une seconde. Après une duplication confirmée, un nouveau clic crée volontairement une nouvelle copie.

Les commandes et paiements existants restent inchangés. La duplication ne crée aucune commande et n’envoie aucun mail client ou club.

## Installation staging

Dans le dépôt sur `staging`, après la V5.2.16 :

```bash
git status
git apply --check fce-correctif-v5.2.17.patch
git apply fce-correctif-v5.2.17.patch
npm test
npm run typecheck:shop
npm run build
```

Enregistrer et pousser les fichiers du correctif pour lancer le déploiement staging habituel. Aucun script SQL à lancer.

## Recette

Dupliquer un article avec plusieurs tailles, un prix catalogue, un tarif coach et une personnalisation texte. Vérifier que la copie est masquée et que tous les choix sont présents, avec leur visibilité et leur ordre. Changer un prix et une personnalisation dans la copie : l’original doit rester identique. Renommer et publier ensuite la copie.

Des tests automatisés couvrent la copie complète, l’indépendance des identifiants, les commandes préservées, les accès refusés, la reprise et les demandes concurrentes, ainsi que l’annulation complète après un échec d’écriture. Le parcours du bouton et l’ouverture de la copie masquée sont également testés dans l’interface.

Vérification avant livraison : 127 tests passent, TypeScript et build Astro validés. Aucun déploiement distant n’est effectué par la préparation de ce correctif.
