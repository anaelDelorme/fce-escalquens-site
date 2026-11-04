Le test HelloAsso de production cherchait l’association `fce`. L’URL publique confirmée par le club est https://www.helloasso.com/associations/fc-escalquens : son identifiant réel est `fc-escalquens`.

La valeur par défaut de production est corrigée dans `wrangler.jsonc`. Le staging utilise toujours son association Sandbox `fce`. La préparation des prochaines archives utilise également cet identifiant de production pour ses paramètres métier.

Pour une base déjà configurée, le champ enregistré dans D1 a priorité sur cette valeur par défaut : dans **Boutique → Paramètres**, renseigner `fc-escalquens` dans **Identifiant de l’association HelloAsso**, enregistrer puis relancer **Tester HelloAsso sans paiement**. Ce réglage commun sert aussi aux tournois et prend effet immédiatement.

Le contrôle réel du rattachement à l’association se fait avec ce bouton après sauvegarde du paramètre. Le diagnostic obtient un jeton OAuth et effectue uniquement des lectures d’associations.

Validation : tests des paramètres et transferts de production, sélection d’environnement HelloAsso et diagnostic limité à OAuth/GET ; configuration statique et workflow vérifiés.
