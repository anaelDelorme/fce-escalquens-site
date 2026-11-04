La production utilise encore l’ancien catalogue. Cette PR reprend le code staging et prépare le remplacement complet du catalogue boutique et des tournois par ceux configurés en staging.

- Boutique : articles, catégories, fournisseurs, tailles, tarifs, personnalisations et images associées. Les articles propres à l’ancien catalogue production sont retirés lors de la reprise validée.
- Tournois : événements, formulaires, tarifs et équipes configurés en staging. Les anciens tournois absents de staging sont retirés ; les médias tournois ne sont pas repris.
- Les commandes, inscriptions, paiements réels et leurs instantanés restent conservés. Aucune transaction, file mail ou authentification Sandbox n’est importée.
- L’export et le téléchargement des médias utilisent les secrets Cloudflare existants de GitHub Actions. Le push de cette branche ne déploie pas en production. Le diff reprend aussi les annonces et correctifs du site déjà présents dans staging.
- En production, les mails gardent leurs destinataires client/club ; le test HelloAsso effectue OAuth et des lectures sans créer de paiement.

Le slug HelloAsso de production est confirmé : `fce`.

Les UUID des deux nouvelles bases ORDERS/TOURNAMENTS et les paramètres Cloudflare Access de production (site, boutique, tournois) sont renseignés avec les valeurs fournies par le club. Avant fusion : appliquer les migrations et la copie initiale des tournois, configurer les responsables et les secrets Worker de production ; contrôler les politiques Access, l’artefact de reprise et les réglages de mail. La fusion dans main déclenche le déploiement réel, l’import de contenus reste une opération distincte après validation.

Procédure et limites : `docs/MISE-EN-PRODUCTION-BOUTIQUE-TOURNOIS.md`.

Validation locale : 174 tests réussis, dont les transferts exécutés sur SQLite réel, les destinataires mail et l’absence de création de paiement par le diagnostic HelloAsso ; TypeScript et compilation validés.
