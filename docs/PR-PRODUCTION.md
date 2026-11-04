La production utilise encore l’ancien catalogue. Cette PR reprend le code staging et prépare le remplacement complet du catalogue boutique et des tournois par ceux configurés en staging.

- Boutique : articles, catégories, fournisseurs, tailles, tarifs, personnalisations et images associées. Les articles propres à l’ancien catalogue production sont retirés lors de la reprise validée.
- Tournois : événements, formulaires, tarifs et équipes configurés en staging. Les anciens tournois absents de staging sont retirés ; les médias tournois ne sont pas repris.
- Les commandes, inscriptions, paiements réels et leurs instantanés restent conservés. Aucune transaction, file mail ou authentification Sandbox n’est importée.
- L’export et le téléchargement des médias utilisent les secrets Cloudflare existants de GitHub Actions. Le push de cette branche ne déploie pas en production. Le diff reprend aussi les annonces et correctifs du site déjà présents dans staging.
- Deux opérations manuelles distinctes préparent la bascule : initialisation avec sauvegarde des trois bases et copie de l'historique réel, puis import d'une archive relue avec son SHA-256. Les médias sont vérifiés dans R2 avant les SQL ; un export périmé ou modifié est refusé. Les ventes restent fermées pour la recette.
- Le dépôt étant public, les archives de préparation et sauvegardes D1 sont chiffrées avant publication (AES-256-GCM, secret GitHub Actions `PRODUCTION_ARCHIVE_PASSWORD`). Les anciennes préparations en clair générées par ce travail sont retirées après remplacement chiffré ; les commandes et inscriptions ne sont jamais publiées en clair.
- En production, les mails gardent leurs destinataires client/club ; le test HelloAsso effectue OAuth et des lectures sans créer de paiement.

Le slug HelloAsso de production est confirmé : `fce`.

Les UUID ORDERS/TOURNAMENTS et les paramètres Cloudflare Access (site, boutique, tournois) sont renseignés. La présence des quatre secrets Worker production a été vérifiée après configuration par le club ; leur fonctionnement reste à tester après déploiement. Avant fusion : configurer la clé d'archivage GitHub, exécuter l'initialisation avec le premier responsable explicite, relire puis importer l'archive, contrôler les politiques Access et les réglages de mail. La fusion dans main déclenche le déploiement réel ; aucun import de catalogue n'est relancé automatiquement par les déploiements suivants.

Procédure et limites : `docs/MISE-EN-PRODUCTION-BOUTIQUE-TOURNOIS.md`.

Validation locale : 184 tests, dont les transferts/opérations manuelles sur SQLite réel, les sauvegardes incomplètes, l'export périmé, les médias corrompus, le chiffrement/restauration, les déclenchements des workflows, les destinataires mail et l'absence de création de paiement par le diagnostic HelloAsso. TypeScript, compilation et workflow vérifiés.
