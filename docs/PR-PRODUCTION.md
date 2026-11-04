Cette PR déploie la boutique et les tournois configurés en staging. Le catalogue et les médias ont déjà été repris dans les bases et le stockage de production ; les ventes et inscriptions restent fermées pendant les vérifications après déploiement.

- Boutique : affichage mobile/ordinateur, prix harmonisés, catalogue de personnalisations partagé entre articles et écussons obligatoires. Les anciens articles propres à la production ont été retirés.
- Tournois : événements, formulaires, tarifs et équipes repris dans la base dédiée, sans leurs médias. Les anciens tournois absents de staging ont été retirés.
- Commandes, inscriptions et paiements réels conservés et contrôlés pendant l'import. Aucune transaction ni authentification Sandbox importée.
- Accès Cloudflare distincts pour le site, la boutique et les tournois. HelloAsso utilise l'association de production `fce` ; les mails de commande gardent leurs destinataires client/club. Le bouton de test mail est configuré vers `contact@fcescalquens.fr`.
- Le diff reprend également les annonces et autres correctifs déjà présents sur staging.

Reprise vérifiée : **38 articles, 365 déclinaisons, 6 personnalisations, 1 tournoi et 40 médias**. Les médias ont été relus dans R2 et comparés par SHA-256 avant les imports SQL. Les sauvegardes sont chiffrées, y compris dans les artefacts du dépôt public.

Exécutions validées : [initialisation et migrations](https://github.com/anaelDelorme/fce-escalquens-site/actions/runs/41818523633), puis [import et contrôle des données](https://github.com/anaelDelorme/fce-escalquens-site/actions/runs/41833330766).

La fusion dans `main` déploie le Worker avec les bindings et paramètres de production. Les déploiements suivants conservent les contenus de production : aucun import de catalogue n'est lancé automatiquement.

Après déploiement, vérifier les accès admin, utiliser **Tester HelloAsso sans paiement** (OAuth et lectures uniquement), puis **Tester l'envoi d'un e-mail** et contrôler la réception effective dans la boîte du club. Vérifier les coordonnées vendeur/contact et l'affichage avant de rétablir les ouvertures. La présence des secrets a été contrôlée ; la connexion HelloAsso et la réception SMTP réelles restent à confirmer sur le Worker déployé.

Validation : 184 tests locaux, TypeScript, compilation et workflow vérifiés ; migrations et import distants réussis. Procédure complète : `docs/MISE-EN-PRODUCTION-BOUTIQUE-TOURNOIS.md`.
