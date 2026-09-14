# Édition temporaire avant génération des PNG

Ce paquet transforme la page de génération des visuels en deux étapes :

1. **Charger les rencontres** pour la date choisie.
2. Corriger le tableau puis cliquer sur **Générer les PNG**.

Dans le tableau on peut :
- inclure / exclure une rencontre ;
- modifier le libellé d'équipe ;
- modifier l'adversaire / plateau ;
- modifier l'heure ;
- modifier la ville ;
- modifier le stade ;
- déplacer une rencontre vers le haut ou le bas.

Les changements sont **uniquement en mémoire dans le navigateur**.  
Aucun `POST`, `PUT` ou `PATCH` n'est envoyé : D1 et les données FFF restent intactes.

Le découpage en visuels de 6 rencontres est fait **après** les exclusions et les
changements d'ordre.

## Installation dans Codespaces

Décompresse à la racine du dépôt :

```bash
unzip -o fce-visuels-insta-edition-temporaire.zip
python3 install-social-visual-editor.py
```

Puis vérifie :

```bash
node --check public/social-visuals.js
git diff --check
git diff -- public/social-visuals.js public/social-visuals-editor.css
npm run build
```

Si tout est bon :

```bash
git add public/social-visuals.js public/social-visuals-editor.css
git commit -m "Ajoute la préparation manuelle des visuels sociaux"
git push
```

Le script crée également une sauvegarde locale :

`public/social-visuals.js.before-editor`

Elle n'a pas besoin d'être commitée.
