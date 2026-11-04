# Boutique, mails et inscriptions

La boutique applique uniquement le tarif FCE. Les anciens cookies coach n’activent plus de remise et les endpoints de génération et de connexion sont retirés. Les colonnes de la base restent compatibles avec l’historique ; les migrations effacent les prix coach du catalogue et révoquent le code. Les montants des commandes existantes restent conservés.

Les messages client et club utilisent le même gabarit HTML avec une version texte complète. Les messages boutique présentent les articles, tailles, personnalisations, quantités et montants. Les messages tournois présentent les catégories et leurs quantités, le paiement, la validation de l’inscription et les modalités de règlement. Les conditions acceptées restent présentes dans les confirmations de création et de paiement. Les liens personnels sont réservés aux clients ; les notifications club renvoient à l’administration sécurisée. Les destinataires de production et la redirection de staging vers MAIL_TEST_TO sont conservés. Le bouton de test mail utilise le même gabarit.

Lors d’un changement d’état, l’objet et l’introduction du mail annoncent explicitement la confirmation ou l’annulation de l’inscription, ou le nouvel état de préparation de la commande. La confirmation par le club n’annonce pas un paiement reçu. Une inscription annulée ne comporte plus d’instructions de règlement par chèque ni de date limite de paiement ; si elle a déjà été réglée, le message invite à contacter le club pour les modalités de remboursement, sans promettre de remboursement automatique.

Dans l’administration des inscriptions, un sélecteur permanent ouvre le suivi d’un seul tournoi. Le tournoi est conservé dans l’URL et le filtrage SQL intervient avant la limite de 500 inscriptions par tournoi. Les liens directs vers une fiche ouvrent son tournoi. Les cartes de catégories affichent le total d’équipes, les équipes validées et à valider, ainsi que les clubs et les noms d’équipes lorsqu’ils sont renseignés. Un clic ouvre la fiche. Les cartes suivent la recherche et les filtres, avec un filtre de catégorie supplémentaire. Les inscriptions annulées sont exclues des effectifs. La vue couvre les 500 inscriptions du tournoi chargé au maximum ; elle ne prétend pas totaliser les éventuelles lignes plus anciennes non chargées.

Une fiche annulée propose « Retirer du suivi » pour nettoyer les essais. Elle disparaît de la liste et du CSV habituels. Le filtre « Afficher aussi les inscriptions retirées du suivi » permet de la retrouver, puis « Remettre dans le suivi » rétablit sa visibilité sans réactiver son inscription. Les paiements et l’historique sont conservés ; ces actions sont tracées et n’envoient pas de mail. La migration Tournois `0005_registration_archive.sql` est appliquée automatiquement au déploiement.

Pour les règlements HelloAsso, « Vérifier chez HelloAsso » affiche le résultat près du bouton et actualise le paiement dans la fiche et la liste. Une vérification déjà en cours ou une référence absente est signalée explicitement. Cette action ne lance pas de nouveau paiement. Le bouton est absent pour les chèques et la vérification conserve leur paiement manuel.

L’export CSV contient une ligne par catégorie pour chaque inscription, avec `nb_equipes`. Par exemple, deux U11 et une U13F donnent deux lignes : U11 / 2 et U13F / 1. Le tournoi et les filtres sélectionnés restent appliqués. Les catégories non participantes sont exclues. `total_cents` correspond au montant de la catégorie, calculé à partir du tarif par équipe de l’inscription ; `registration_total_cents` indique le total de l’inscription et se répète comme information de référence. Si le tarif par équipe ne peut pas être déduit en centimes entiers d’une ancienne inscription, le montant de catégorie reste vide et le total original est conservé.

## Exports des commandes boutique

Dans la liste des commandes, appliquer la recherche et les filtres, puis utiliser « Exporter les commandes CSV » ou « Télécharger les bons fournisseur en un PDF ». Les deux exports portent sur tous les résultats de la recherche appliquée, même depuis une autre page de la liste. Une saisie non validée par « Appliquer » ne modifie pas leur périmètre. « Toutes les commandes » et « Effacer » permettent de retirer les filtres ; le raccourci « Payées, à préparer » permet de préparer le PDF des commandes à passer au fournisseur.

Le CSV comporte une ligne par commande et 15 colonnes en français : référence, date de commande, nom, prénom, e-mail, téléphone, licencié, équipe, état de préparation, état du paiement, détail de la commande, quantité totale, montant en euros, mode de remise et fournisseurs. Le détail conserve les articles, tailles, couleurs, personnalisations et leurs textes, les quantités et les montants. Format UTF-8 avec marqueur pour Excel, séparateur point-virgule et décimales françaises. Les cellules sont protégées contre l’interprétation d’un texte comme formule.

Le PDF regroupe les bons des commandes payées et non annulées répondant aux mêmes critères. Chaque commande client commence sur une nouvelle page et peut se poursuivre sur plusieurs pages. Les coordonnées privées du client et les prix de vente restent exclus, comme dans le bon individuel. La pagination du fichier est globale. Le téléchargement individuel est conservé ; aucun téléchargement ne marque les commandes comme transmises au fournisseur et aucun mail n’est envoyé.

Les endpoints d’export sont réservés à l’administration boutique et renvoient des réponses non mises en cache. Les résultats sont parcourus par lots avec un curseur de date et d’identifiant pour couvrir toutes les commandes sans être limité aux 50 lignes visibles. Une erreur empêche le téléchargement d’un fichier partiel. Aucune migration ni secret supplémentaire n’est nécessaire.

## Protection avant chaque déploiement production

Le workflow de déploiement prépare des points de restauration **D1 Time Travel** pour DB, ORDERS et TOURNAMENTS, avec un instant de reprise commun, avant toute migration et avant de publier le Worker. Il utilise uniquement `wrangler d1 time-travel info`, qui lit les repères de la sauvegarde native Cloudflare. L’export SQL complet est réservé à la maintenance, car Wrangler indique qu’il peut rendre D1 temporairement indisponible.

Les trois repères et les identifiants des bases sont chiffrés avec le secret existant `PRODUCTION_ARCHIVE_PASSWORD`. Le workflow vérifie le déchiffrement, l’intégrité, les destinations et le rattachement à son exécution, puis conserve l’archive dans l’artefact `points-restauration-avant-deploiement-NUMERO_RUN-TENTATIVE`. Le lien est indiqué dans son résumé. Toute erreur avant la conservation du fichier bloque les migrations et le déploiement.

L’artefact est conservé 7 jours et contient des points de reprise, pas une copie SQL indépendante. La durée de restauration effective dépend de la rétention D1 Time Travel de l’offre Cloudflare (7 ou 30 jours) ; conserver les repères plus longtemps ne prolonge pas cette rétention. La capture réelle se fait dans GitHub Actions au déploiement, pas pendant la préparation de la PR.

Une restauration de base ne se déclenche jamais automatiquement : elle pourrait supprimer des commandes ou paiements arrivés après le point de reprise. Pour cette PR sans modification de schéma, revenir au Worker précédent préserve ces nouvelles données. La reprise d’une base nécessite d’abord d’identifier et de protéger les transactions postérieures.

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
