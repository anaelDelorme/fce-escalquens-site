# V5.2.5 — fiche tournoi unique et parcours d’inscription

Ce correctif s’applique après la V5.2.4.

## Présentation et formulaire public

L’en-tête des tournois utilise maintenant un composant distinct du `header` global du site : cela supprime la hauteur imposée, le bandeau parasite et les débordements du titre. Le titre reprend la typographie du thème. Les badges des sections sont agrandis.

Les champs du formulaire ont des styles propres au dialogue (les règles de la boutique ne les couvraient pas). Les coordonnées, équipes, total et paiement sont regroupés, avec des champs larges, un focus visible et une disposition adaptée au téléphone.

Pour chaque section, le responsable saisit directement un nombre d’équipes, initialement **0**. Il n’y a plus de Oui/Non. Au moins une équipe est nécessaire ; le serveur vérifie toujours sections, quantités, capacité et total. Le total reste nombre d’équipes × tarif par équipe.

Les conditions sont repliées par défaut et doivent toujours être acceptées pour confirmer.

## Une seule fiche d’administration

Dans `/admin-tournois/tournois/`, la fiche réunit désormais : présentation, dates, lieu du club, sections, visuels, tarif, capacité, échéances, moyens de paiement, conditions et questions complémentaires.

La case « Activer les inscriptions intégrées » est supprimée. Cette expression désignait le formulaire hébergé sur le site. Désormais, choisissez simplement **Inscriptions ouvertes** dans le statut, après avoir rempli tarif, échéances et conditions. Les autres statuts ferment le formulaire. Les échéances continuent de s’appliquer même si le statut reste ouvert.

La saisie d’un brouillon peut être enregistrée sans encore compléter les modalités d’inscription. Lors d’une fiche complète, la présentation puis les réglages sont enregistrés. Si la seconde étape échoue, le message précise que la présentation est conservée ; les champs restent remplis et une nouvelle tentative réutilise le tournoi existant, sans le recréer. Cette sauvegarde en deux étapes n’est pas une transaction atomique ; les anciens réglages restent applicables jusqu’à la réussite de l’enregistrement.

L’ancienne URL `/admin-tournois/parametres/` renvoie vers la liste des tournois. Le test de connexion HelloAsso reste accessible dans cette liste.

## Moyens de paiement d’un tournoi

- **De suite avec HelloAsso** : redirection vers HelloAsso après enregistrement, confirmation du paiement par vérification API.
- **Plus tard avec HelloAsso** : proposé si le club l’autorise ; accès au règlement depuis le suivi et l’e-mail.
- **Par chèque** : proposé uniquement si activé pour ce tournoi, avec un ordre, une adresse d’envoi et une date limite renseignés. L’échéance doit se situer entre la clôture des inscriptions et la date limite générale de paiement.

Pour autoriser le chèque, cochez « Proposer le paiement par chèque » et renseignez les trois informations. Aucun destinataire ou adresse d’envoi n’est prérempli arbitrairement. Si vous ne l’activez pas, ce choix n’apparaît pas.

L’inscription par chèque reste en attente de paiement. Les instructions et la date sont figées lors de l’inscription, présentes dans le suivi et l’e-mail. Elles ne changent pas quand le club modifie ensuite ses paramètres. Aucun paiement HelloAsso n’est déclenché pour cette inscription, y compris depuis son lien de suivi, afin d’éviter un double règlement. Pour changer ultérieurement de moyen de paiement, contactez le club ; le changement n’est pas automatisé dans cette version.

Dans le détail de l’inscription, un administrateur autorisé peut cliquer sur **Confirmer la réception du chèque et le paiement** après réception et vérification du chèque. Cela confirme le paiement, conserve l’auteur et la date dans l’historique et prépare l’e-mail de confirmation. Cela ne valide pas automatiquement la participation au tournoi. Une inscription annulée ou déjà réglée ne peut pas être confirmée ainsi. Une version périmée est refusée et une nouvelle requête ne crée pas de confirmation en double.

Les réglages chèque concernent uniquement les tournois. La boutique conserve le paiement HelloAsso.

## Explication des paramètres boutique

- **Comment organiser le retrait au club ?** (anciennement « Instructions de rendez-vous ») : indiquez qui contacter, où venir et comment convenir d’un créneau. Il s’agit de consignes pratiques de remise des commandes, pas des instructions d’envoi d’un chèque.
Les champs et aides relatifs au médiateur ont été retirés de l’administration à votre demande, ainsi que la mention générée dans les nouvelles CGV. Les conditions déjà acceptées dans les anciennes commandes restent conservées.

## Installation en staging

Après téléchargement du patch à la racine du dépôt :

```bash
git switch staging
git pull --ff-only
git apply --check fce-correctif-v5.2.5.patch
git apply fce-correctif-v5.2.5.patch
npm ci
npm test
npm run typecheck:shop
npm run build
```

La migration `migrations-tournaments/0003_cheque_payments.sql` ajoute les réglages de chèque, sans supprimer de données. Les inscriptions existantes restent en paiement HelloAsso. Le workflow staging applique cette migration sur TOURNAMENTS avant le déploiement ; aucune migration supplémentaire de DB ou ORDERS et aucune copie initiale ne sont nécessaires.

Si vous déployez manuellement, appliquez-la avant le Worker :

```bash
npx wrangler d1 migrations apply TOURNAMENTS --remote --env staging
```

Puis enregistrez uniquement les fichiers du correctif :

```bash
git add public/tournament-checkout.css src/components/TournamentAdmin.astro src/components/TournamentLayout.astro src/pages/admin-tournois/parametres/index.astro src/pages/tournois/index.astro src/scripts/admin-shop.js src/scripts/admin-tournaments.js src/scripts/tournament-events-editor.js src/scripts/tournament-form-fields.js src/scripts/tournament-sales-fields.js src/scripts/tournament-tracking.js src/scripts/tournaments-checkout.js src/shop/mail.ts src/shop/service.ts src/shop/terms.ts src/tournaments/service.ts tests/shop.test.ts tests/tournament-ui.test.ts migrations-tournaments/0003_cheque_payments.sql docs/CORRECTIF-V5.2.5.md
git commit -m "Unifie la fiche tournoi et améliore les inscriptions et règlements"
git push origin staging
```

Après la réussite du workflow, rechargez la page. Dans la fiche d’un tournoi, vérifiez sections, tarif, statut et échéances, puis renseignez les instructions de chèque si ce moyen est souhaité.

Pour la recette sandbox, vérifiez le calcul avec plusieurs équipes, le choix HelloAsso immédiat/différé, puis une inscription par chèque : aucun checkout ne doit être créé, les instructions doivent apparaître dans le suivi et le mail de test, et la confirmation par le club doit être historisée. Ne confirmez aucun chèque réel pendant une recette fictive.
