# Boutique, mails et inscriptions

La boutique applique uniquement le tarif FCE. Les anciens cookies coach n’activent plus de remise et les endpoints de génération et de connexion sont retirés. Les colonnes de la base restent compatibles avec l’historique ; les migrations effacent les prix coach du catalogue et révoquent le code. Les montants des commandes existantes restent conservés.

Les messages client et club utilisent le même gabarit HTML avec une version texte complète. Les messages boutique présentent les articles, tailles, personnalisations, quantités et montants. Les messages tournois présentent les catégories et leurs quantités, le paiement, la validation de l’inscription et les modalités de règlement. Les conditions acceptées restent présentes dans les confirmations de création et de paiement. Les liens personnels sont réservés aux clients ; les notifications club renvoient à l’administration sécurisée. Les destinataires de production et la redirection de staging vers MAIL_TEST_TO sont conservés. Le bouton de test mail utilise le même gabarit.

Dans l’administration des inscriptions, un sélecteur permanent ouvre le suivi d’un seul tournoi. Le tournoi est conservé dans l’URL et le filtrage SQL intervient avant la limite de 500 inscriptions par tournoi. Les liens directs vers une fiche ouvrent son tournoi. Les cartes de catégories affichent le total d’équipes, les équipes validées et à valider, ainsi que les clubs et les noms d’équipes lorsqu’ils sont renseignés. Un clic ouvre la fiche. Les cartes suivent la recherche et les filtres, avec un filtre de catégorie supplémentaire. Les inscriptions annulées sont exclues des effectifs. La vue couvre les 500 inscriptions du tournoi chargé au maximum ; elle ne prétend pas totaliser les éventuelles lignes plus anciennes non chargées.

## Copie du catalogue staging vers production

Le workflow « Copier la boutique staging vers production » s’exécute uniquement sur la branche `ops/sync-shop-production`, lors d’un push intentionnel vers cette branche ou d’une relance manuelle sur celle-ci. Un push ordinaire sur main, staging ou une branche de PR ne lance pas cette copie.

1. Vérifier les tests, les destinations distinctes et la clé PRODUCTION_ARCHIVE_PASSWORD.
2. Préparer une archive avec `prepare-production.mjs --scope shop`, les articles, catégories, fournisseurs, tailles, personnalisations et médias boutique.
3. Sauvegarder les trois bases et publier les sauvegardes ainsi que la préparation uniquement sous forme chiffrée.
4. Vérifier l’intégrité du manifeste et régénérer le SQL pour garantir son périmètre.
5. Copier les médias vers de nouvelles clés R2, puis relire et comparer leurs empreintes.
6. Vérifier une seconde fois que le catalogue production n’a pas changé depuis la préparation, fermer temporairement la boutique et importer uniquement shop.sql dans DB.
7. Vérifier les contenus, prix et références, puis restaurer la visibilité précédente de la boutique. En cas d’échec après le début de l’import, la boutique reste fermée pour permettre une reprise depuis la sauvegarde.

La copie remplace le catalogue production, y compris les articles supprimés de staging. Les variantes, personnalisations et leurs associations suivent staging ; les tarifs coach sont laissés à NULL conformément à leur retrait. Les images et visuels sont copiés à l’identique sous un préfixe de reprise. Les commandes, paiements, inscriptions, tournois, destinataires de mails et réglages HelloAsso ne sont pas modifiés.

Le résultat expurgé est publié dans le résumé du workflow et dans `release/production-preparation-report:status.json`, avec les quantités, le nombre de médias vérifiés et le lien de sauvegarde chiffrée. Les archives privées sont conservées sept jours. Les anciennes clés R2 restent disponibles pour restaurer le catalogue précédent.
