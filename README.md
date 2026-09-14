# Correctif FFF / ZenRows HTTP 413 — version 2

Cette version corrige l'installateur précédent, qui cherchait une ligne de code
trop exactement et pouvait donc répondre « bloc introuvable ».

Le nouvel installateur utilise des ancres simples présentes dans le collecteur
actuel :

- `await Promise.all([...details].flatMap(`
- `await Promise.all([...plateauSites.values()].map(fetchPlateau));`

Il :
1. conserve une seule réponse de détail réussie par match ;
2. supprime le DOM Angular de la FFF avant le retour ZenRows ;
3. ne renvoie que les blocs JSON `fce-*` utiles ;
4. vérifie le résultat avec `node --check`.

## Codespaces

Depuis la racine du dépôt :

```bash
unzip -o fce-fix-sync-fff-413-v2.zip
python3 fix-fff-sync-413-v2.py
git diff -- scripts/sync-matches.mjs
```

Puis :

```bash
git add scripts/sync-matches.mjs
git commit -m "Réduit la réponse ZenRows de la synchronisation FFF"
git push
```

Relancer ensuite l'action GitHub **Synchroniser les matchs**.
