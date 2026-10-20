# V5.2.12 — parcours boutique et espaces de gestion

Correctif à appliquer après la V5.2.11 SMTP OVH. Aucune migration, aucun changement de secret ni de binding D1. Le code HelloAsso et la validation serveur des montants et paiements restent ceux de la V5.2.11. Les protections Cloudflare Access des deux administrations restent nécessaires.

## Boutique publique

- Introduction plus compacte, conservant les couleurs et les visuels du club.
- Recherche par nom ou texte court, insensible aux accents ; filtres par catégorie combinables avec la recherche, compteur et réinitialisation.
- Barre de panier unique sous le menu du site, quantité et total connu du catalogue. La hauteur du menu est prise en compte quand le navigateur dispose de ResizeObserver.
- Fiches d’articles et boutons hiérarchisés ; vignettes dans le panier, total et remise gratuite regroupés.
- Panier en deux étapes : vérifier les articles, puis renseigner les coordonnées et accéder au paiement HelloAsso. Une erreur ou un paiement fermé ne supprime pas le panier.
- Retour au panier et modifications sans perte des coordonnées en cours de saisie : elles restent uniquement dans la mémoire de la page, jamais ajoutées au stockage de session du panier. Un rechargement de page efface ces coordonnées ; ce choix minimise leur conservation.
- Mise en page mobile dédiée aux fenêtres, cibles tactiles, focus visible, états vides et nouvelle tentative de chargement du catalogue.

## Administration boutique

Navigation latérale sur ordinateur, navigation horizontale sur mobile, titre propre à chaque écran, lien d’évitement clavier et hiérarchie typographique cohérente. Les en-têtes de gestion sont isolés des règles globales prévues pour l’en-tête public du site.

Les commandes disposent de raccourcis « Toutes », « Payées, à préparer » et « À remettre », de filtres réinitialisables, d’un état vide explicite et d’un résumé **limité aux commandes de la page**. Ce résumé ne représente pas le total de la boutique. Les listes de commandes deviennent des cartes sur petit écran et les fiches se ferment avec retour au lien de la commande.

Une recherche est ajoutée aux articles et catégories, en complément des filtres de catégorie et visibilité existants. Les paramètres mail distinguent la présence de configuration d’un envoi réellement accepté, et rappellent le destinataire imposé en staging.

## Administration tournois

Même structure visuelle de gestion, avec ses propres pages et droits. Les inscriptions se filtrent par recherche, tournoi, paiement et état d’acceptation. Les filtres sont conservés pendant les mises à jour de fiches au sein de la page. Le compteur et l’export concernent uniquement la sélection des inscriptions **chargées** (limite serveur : 500), sans prétendre couvrir toutes les inscriptions historiques.

La liste des tournois dispose d’une recherche, d’un filtre de publication et affiche le tarif par équipe et l’activation de la prise d’inscriptions. Cette activation est un réglage : l’ouverture réelle dépend aussi du statut et des échéances du tournoi. La présentation, les modalités de paiement et le formulaire restent dans une seule fiche.

## Diagnostic des e-mails

Les deux administrations expliquent les états de la file d’envoi :

| État | Signification |
| --- | --- |
| En attente | Message placé dans la file, pas encore accepté par le transport. |
| En cours | Une tentative d’envoi est en cours ou attend la reprise de son verrou. |
| Accepté par le serveur | Le transport a confirmé la prise en charge ; cela ne prouve pas la réception en boîte principale. |
| Échec à traiter | Reprises automatiques épuisées ; corriger la configuration puis relancer depuis la fiche. |

Les erreurs SMTP connues sont accompagnées d’une action concrète. Seuls les codes d’erreur contrôlés sont affichés, sans réponse brute du serveur ou contenu de lien personnel. En staging, tous les mails vont à `MAIL_TEST_TO`, y compris si la commande contient une autre adresse.

### Commande créée mais mail absent

1. Dans `/admin-boutique/parametres/`, vérifier le transport `ovh`, l’expéditeur et le destinataire de test. Utiliser **Tester l’envoi d’un e-mail**. Conserver le texte de l’erreur ou sa référence, jamais le mot de passe.
2. Ouvrir la fiche de commande et consulter « Envois de mails ». Noter l’état et le code éventuel :
   - `MAIL_SMTP_AUTH` : vérifier `SMTP_USER` et `SMTP_PASSWORD` ; il s’agit du mot de passe de la boîte mail.
   - `MAIL_SMTP_NETWORK` / `MAIL_SMTP_TIMEOUT` : vérifier `SMTP_HOST` et réessayer.
   - `MAIL_SMTP_CONFIG` : hôte autorisé, adresse d’expédition identique au compte SMTP et secret requis.
   - `MAIL_SMTP_RECIPIENT` : destinataire refusé par le serveur.
3. Si le message est accepté, vérifier le webmail, les indésirables, la réception depuis une adresse externe et les éventuels retours de non-distribution.
4. Si le message reste en attente, vérifier que le cron du Worker staging est déployé et s’exécute. La file reprend les envois automatiquement, dans la limite des tentatives configurées.
5. Après correction, relancer le suivi depuis la fiche. Ne pas recréer une commande ni repayer pour tester un e-mail.

### Roundcube répond HTTP 401

Le 401 du webmail ne permet pas de conclure à une erreur SMTP du site. SPF, DKIM et DMARC n’authentifient pas la connexion du navigateur à Roundcube.

- Repartir de https://www.ovhcloud.com/fr/mail/ plutôt que d’un ancien lien de session Roundcube.
- Saisir `contact@fcescalquens.fr` et le mot de passe de cette boîte (pas celui du compte client OVH). OVH indique qu’une seconde saisie des mêmes identifiants peut être demandée dans Roundcube.
- Si le 401 persiste, essayer un autre navigateur ou une nouvelle session pour isoler un problème de cookies. Cela constitue un diagnostic, pas une cause établie du 401.
- Si le mot de passe est inconnu ou refusé, le changer dans OVH → MX Plan → Emails → menu de la boîte. **Mettre ensuite à jour le secret `SMTP_PASSWORD` sur le Worker staging** ; sinon l’envoi SMTP utilisera l’ancien mot de passe.
- Si le refus continue avec une session neuve et des identifiants vérifiés, relever l’URL sans paramètres de session, l’heure et le message pour le support OVH. Ne jamais transmettre de cookie, jeton ou mot de passe.

Référence OVH : https://docs.ovhcloud.com/fr/guides/web-cloud/email-and-collaborative-solutions/mx-plan/email-roundcube

## Installation sur staging

Télécharger le patch à la racine du dépôt, après avoir installé la V5.2.11 :

```bash
git branch --show-current
git apply --check fce-correctif-v5.2.12.patch
git apply fce-correctif-v5.2.12.patch
npm test
npm run typecheck:shop
npm run build
git add public/commerce-ux.css public/shop-commerce.js public/shop-common.js public/shop.js src/components/ShopAdminLayout.astro src/components/TournamentAdmin.astro src/components/TournamentLayout.astro src/pages/boutique/index.astro src/scripts/admin-shop-content.js src/scripts/admin-shop.js src/scripts/admin-tournaments.js src/scripts/tournament-events-editor.js tests/shop-ui.test.ts tests/tournament-ui.test.ts docs/CORRECTIF-V5.2.12.md
git commit -m "Améliore les parcours boutique et administrations"
git push origin staging
```

Ne pas forcer l’application si `git apply --check` échoue. Le patch n’inclut aucun fichier de configuration Cloudflare : conserver vos paramètres et secrets de la V5.2.11.

## Recette visuelle et fonctionnelle en staging

Les tests DOM automatisés ne remplacent pas la vérification visuelle dans vos navigateurs. Après déploiement, contrôler au clavier et aux largeurs 390, 768 et 1440 pixels :

- Boutique : recherche avec/sans accent, combinaison catégorie/recherche, réinitialisation, fiche détails, taille/prix/personnalisation, panier et retour au catalogue.
- Panier : progression, retour, modification/retrait avec coordonnées en cours de saisie, obligation équipe/licencié uniquement pour le coach, CGV et erreur HelloAsso sans double commande.
- Administration boutique : filtres serveur, page suivante/précédente, écran vide, ouverture/fermeture d’une fiche, enregistrement d’une préparation, bon individuel et états mail.
- Catalogue administré : filtres et recherche, visibilité, accès à la même fiche pour photo/textes et tarifs.
- Tournois : filtres combinés et export de la sélection, distinction acceptation/paiement, fermeture de fiche, tarif par équipe dans la liste, édition et sauvegarde d’un tournoi existant.
- Mobile : aucune superposition du panier sur le pied de page, navigation des administrations défilable, tableaux de gestion lisibles, champs et boutons utilisables.

La connexion au compte OVH, la délivrabilité réelle et la confirmation des paiements Sandbox doivent être vérifiées dans l’environnement du club : aucun envoi réel n’est attesté par les tests locaux.
