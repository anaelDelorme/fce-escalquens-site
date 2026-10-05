# Synchronisation FFF — version 35

## Architecture et stockage

Le stockage de production reste Cloudflare D1 : binding `DB` existant, tables
`matches`, `match_participants`, `plateau_games`, `standings` et `sync_runs`.
SQLite est utilisé uniquement dans les tests, avec les migrations réelles.

| Module | Responsabilité |
| --- | --- |
| `fff-periods.mjs` | Saison et bornes de dates en Europe/Paris, changement d'heure compris |
| `fff-browser.mjs` | Programme de collecte exécuté dans la session ZenRows |
| `fff-response.mjs` | Décodage des enveloppes et conservation des erreurs par source |
| `fff-normalize.mjs` | Identifiants, conversion des événements et enrichissement des terrains |
| `fff-integrity.mjs` | Totaux, pagination, rapprochement journalier et contrôles de classements |
| `sync-client.mjs` | Appels authentifiés au Worker, retries limités aux pannes transitoires |
| `sync-engine.mjs` | Import et contrôle des matchs et des classements indépendamment |
| `sync-matches.mjs` | Configuration, orchestration, rapports et code de sortie |

## Protection des résultats

La migration additive `0027_persistent_score_lock.sql` mémorise l'acquisition d'un
score, même égal à zéro. Les rencontres et mini-matchs concernés restent protégés
si leurs champs de score sont ensuite effacés manuellement. Le verrou est conservé
par des triggers D1 ; les imports sont protégés également dans la clause SQL.
Les scores présents au moment de la migration sont marqués. Des scores déjà perdus
avant cette migration ne peuvent pas être reconstitués automatiquement.

Un match protégé n'est pas modifié par l'import automatique. Les résultats des
mini-matchs ne sont plus supprimés puis réinsérés. Une absence dans une collecte
n'entraîne jamais une suppression d'événement. Les corrections officielles d'un
résultat acquis doivent être examinées et appliquées manuellement dans l'admin.

## Contrôles de complétude

1. Collecter les 12 mois de matchs et les 12 mois de plateaux. Les matchs sont
   paginés jusqu'au total annoncé, sans recalculer ce total avant vérification.
2. Collecter séparément les 10 jours autour de l'exécution : J−2 à J+7, bornés
   par la saison. Ces requêtes journalières peuvent récupérer des événements
   absents des réponses mensuelles. Les identifiants, dates, adversaires,
   statuts et scores doivent correspondre aux réponses journalières.
3. Vérifier la présence des identifiants exposés dans l'état initial de la page
   FFF. Refuser les identités de mini-match ambiguës et les matchs inexploitables.
4. Importer par lots de 40, puis relire les données dans D1 via l'endpoint
   authentifié `/internal/sync/verify`. Un simple « accepted » ne suffit pas.
5. Signaler les différences avec les résultats protégés dans les logs, sans les
   écraser. Les mini-matchs sont également vérifiés après import.

Les références mensuelles et journalières sont des requêtes distinctes au backend
FFF, et non deux sources administratives indépendantes. Elles ne prouvent pas
qu'un événement absent des deux réponses était absent de l'interface publique.
Le contrôle journalier couvre 10 jours ; la pagination et les schémas couvrent
la saison entière. Une page de détail incomplète conserve l'événement principal
et fait passer le bilan global en échec/partiel.

## Classements indépendants

Un échec des classements ne bloque pas les matchs complets. Le bilan reste
`partial` et le workflow échoue pour déclencher l'alerte. Un échec des matchs
n'empêche pas les classements valides d'être importés.

Chaque phase complète est remplacée atomiquement dans D1, sans effacer les phases
absentes d'une collecte. Les lignes doivent avoir des rangs uniques, positifs et
consécutifs. Ceci détecte des trous et doublons ; une fin de tableau tronquée avec
rangs encore consécutifs demande toujours une comparaison avec le tableau source.
Les états `running`, `success`, `partial`, `error` sont enregistrés dans D1.
Les compteurs reflètent les lots réellement acceptés et vérifiés. Une panne en
cours d'import peut laisser les premiers lots importés ; une relance est sûre.

## Mails depuis GitHub Actions

Le job `notify-failure` est séparé du job de collecte et s'exécute à chaque échec,
y compris après un timeout. Il utilise un compte SMTP ; GitHub Actions n'est pas
le serveur mail. Ajouter dans Settings → Secrets and variables → Actions :

| Secret | Valeur |
| --- | --- |
| `SYNC_SMTP_HOST` | Serveur SMTP |
| `SYNC_SMTP_PORT` | 587 STARTTLS, défaut ; ou 465 TLS direct |
| `SYNC_SMTP_USER` | Compte SMTP |
| `SYNC_SMTP_PASSWORD` | Mot de passe SMTP ou mot de passe d'application |
| `SYNC_MAIL_FROM` | Expéditeur autorisé par le fournisseur |
| `SYNC_MAIL_TO` | Destinataire(s), séparés par des virgules |

Le mail contient le bilan, l'environnement et le lien vers l'exécution Actions.
Un refus SMTP fait échouer le job de notification. Les tests vérifient le TLS,
les destinataires, le contenu et les refus avec un serveur simulé. La livraison
réelle reste à tester avec le compte SMTP retenu.

## Preuves et diagnostic de l'incident du 3 octobre

La capture publique du site faite le 2 octobre contient **9 événements** pour le
3 octobre et **84 lignes de classement**. Ces données sont conservées dans
`tests/fixtures` et testées de bout en bout. Elles ne contiennent pas les cinq
événements absents et ne permettent pas de déterminer leurs identifiants.
Le dernier workflow ancien avait signalé succès sur 111 matchs et 56 plateaux.

L'accès direct et le navigateur de cette session sont refusés par la FFF.
La clé ZenRows du dépôt est inaccessible ici et les droits GitHub disponibles
refusent la publication du correctif. Aucun déploiement ni envoi mail réel n'a
été effectué. La nouvelle collecte réelle doit donc être vérifiée avant promotion.

### Recette sans écriture

1. Appliquer le patch sur une branche du dépôt, puis le pousser.
2. Lancer « Synchroniser les matchs — préproduction » sur cette branche avec
   `dry_run=true`, `verify_date=2026-10-03`, `verify_count=14`.
3. Télécharger l'artefact `fff-sync-<run_id>-<run_attempt>` et comparer les
   identifiants et catégories avec les 14 événements affichés sur la FFF.
   Distinguer un plateau partagé par plusieurs équipes d'événements distincts.
4. Les rapports `zenrows.json` et `source.json` conservent les réponses avant
   normalisation ; `collection.json` les événements ; `events.jsonl` les logs
   structurés ; `result.json` le bilan. Ils sont conservés 30 jours dans Actions
   et ne sont pas commités. Les clés API et le jeton d'import sont masqués.
5. Rejouer le contrôle hors ligne avec
   `node scripts/replay-fff.mjs /chemin/source.json`.

Une alternative pour identifier les cinq événements consiste à afficher la page
FFF concernée et exécuter `scripts/capture-fff.js` dans la console du navigateur.
Ce script télécharge les données embarquées et les libellés visibles, sans jeton,
cookie ni stockage de session. Une capture d'écran de la liste complète peut
également fournir les événements à confronter aux neuf déjà publiés.

### Import de préproduction puis production

1. Déployer le Worker et appliquer la migration D1 **avant** d'exécuter le nouveau
   collecteur avec `dry_run=false`.
2. Vérifier les données affichées et les conflits de résultats protégés.
3. Configurer SMTP et provoquer un échec d'audit (par exemple un nombre attendu
   incorrect) pour vérifier un vrai mail et son lien Actions.
4. Contrôler plusieurs collectes successives, puis promouvoir en production.

Les exécutions manuelles sont des audits par défaut ; les crons importent.
L'action de synchronisation de l'admin staging transmet explicitement
`dry_run=false`, pour conserver son comportement d'import.

## Validation de développement

La suite exécute le véritable programme de collecte sur les fixtures publiques,
parse son HTML, utilise les vrais endpoints du Worker puis relit SQLite.
Elle couvre les pages mensuelles incomplètes, les réponses journalières en échec,
les résultats 0–0, l'historique des scores, les mini-matchs de plusieurs équipes,
les erreurs de lots, les faux accusés d'import, les relances, les classements
partiels et le job SMTP simulé.

`npm run test:sync`, `npm run build` et
`npx wrangler deploy --dry-run --env=""` ne déploient rien.
