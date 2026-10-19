# V5.2 — boutique en tableaux et module tournois indépendant

Ce correctif s’applique **après la V5.1**. Il remplace la gestion éditoriale des tournois dans l’administration du site et leur stockage partagé. La nouvelle D1 est nécessaire : **ne faites pas le commit/push de déploiement avant les étapes de création, migration et copie ci-dessous. Un build ne crée aucune base.**

## Ce qui change

- Les tailles/modèles et personnalisations d’un article sont affichés en **deux tableaux**, avec prix, référence, fournisseur, visibilité et bouton Modifier. Ajouter ouvre un formulaire, sans zone vide d’option. La fiche article ne propose plus de texte libre « Présentation des options » : les personnalisations affichées viennent de celles réellement configurées. Les cases du formulaire client pour choisir ses personnalisations restent nécessaires.
- Lorsqu’il y a plusieurs tarifs, la boutique et le catalogue indiquent **De XX € à YY €**, hors supplément de personnalisation. Le tarif précis reste celui de la taille choisie. Une migration synchronise aussi les anciens libellés enregistrés.
- Les paramètres boutique indiquent la première cause bloquant le paiement. Le panier reprend un message adapté à cette cause, sans masquer les erreurs sous une fermeture générique.
- `/admin-tournois/tournois/` gère noms, dates, catégories, lieu, description, images, affiche, règlement et visibilité. Les anciennes collections Tournois/Participations ne sont plus proposées par `/admin/` et leurs anciennes API répondent 410.
- `/admin-tournois/parametres/` construit le formulaire de chaque tournoi et règle prix par équipe, capacité, échéances et paiement différé. Les liens externes d’inscription sont retirés de la page publique.
- `/admin-tournois/acces/` gère les responsables, en complément de Cloudflare Access. Les erreurs de JWT et les erreurs de base sont distinguées.

## 1. Répartition des trois bases

| Binding | Données actives après migration |
| --- | --- |
| `DB` | Site et catalogue boutique |
| `ORDERS` | Commandes boutique ; configuration technique commune de paiement/mail et cache OAuth chiffré |
| `TOURNAMENTS` | Tournois, formulaires, inscriptions, réponses, paiements, suivis, file mail et responsables des tournois |

La même association HelloAsso, les secrets Worker et le transport mail servent aux deux modules. Les données métier et les droits tournois sont dans leur propre base. Les liens de suivi existants sont conservés grâce à la copie des identifiants, versions et hashes : **ne changez pas `TRACKING_SECRET`**.

Les tables techniques de paiement ont la même structure dans ORDERS et TOURNAMENTS, ce qui permet de réutiliser le moteur vérifié. Une commande boutique n’est jamais copiée dans la base des tournois. Les copies historiques dans les anciennes bases sont conservées à la migration, mais leurs paiements et mails tournois ne sont plus traités par le moteur boutique.

## 2. Appliquer le patch sur staging

Dans Codespaces, à la racine du dépôt, avec vos modifications précédentes enregistrées :

```bash
git switch staging
git status --short
git apply --check fce-boutique-v5.2.patch
git apply fce-boutique-v5.2.patch
npm ci --include=dev
```

Si `git apply --check` échoue, adaptez le correctif à vos changements ; ne forcez pas l’écrasement de `wrangler.jsonc`. Le correctif ne remplace ni vos UUID ni vos secrets.

Utilisez le même jeton API Cloudflare que pour vos commandes D1/Worker dans Codespaces. Il doit autoriser l’accès à la nouvelle D1. Il n’est pas nécessaire de réussir `wrangler login` par navigateur.

## 3. Sauvegarder et fermer les inscriptions pendant la copie

Ne faites pas cette opération pendant des inscriptions actives. Sauvegardez les deux bases existantes dans un dossier privé ignoré par Git :

```bash
mkdir -p backups-tournois
npx wrangler d1 export DB --remote --env staging --output=backups-tournois/site-avant-v52.sql
npx wrangler d1 export ORDERS --remote --env staging --output=backups-tournois/commandes-avant-v52.sql
```

Fermez les inscriptions dans l’ancienne page de paramètres tournois. **Si Access vous bloque**, vous pouvez effectuer cette fermeture depuis D1 :

```bash
npx wrangler d1 execute DB --remote --env staging --command "UPDATE tournament_sales SET enabled=0,version=version+1 WHERE enabled=1"
```

La copie refuse de démarrer si une configuration d’inscription est encore activée. Les paiements déjà ouverts chez HelloAsso peuvent toujours se terminer ; ils seront relus par le nouveau moteur après bascule. Ne modifiez plus les descriptions, prix ou responsables pendant cette opération.

## 4. Créer la D1 dédiée au staging et son binding

```bash
npx wrangler d1 create fce-escalquens-tournaments-staging
```

Copiez le `database_id` retourné, puis remplacez `UUID_RETOURNE` dans :

```bash
node scripts/configure-tournaments.mjs --env staging --id UUID_RETOURNE
node scripts/configure-tournaments.mjs --env staging --check
npx wrangler d1 migrations apply TOURNAMENTS --remote --env staging
```

Ce script ajoute le binding **uniquement dans staging**, conserve DB/ORDERS et vos variables Access, et refuse de réutiliser une base d’un autre module ou environnement. Ne mettez pas les UUID de DB ou ORDERS à la place du nouvel UUID.

La migration `migrations-tournaments/0001_tournaments.sql` s’applique uniquement sur TOURNAMENTS. N’exécutez pas ce fichier sur DB ou ORDERS.

## 5. Copier les tournois et inscriptions existants

Même si vous n’avez aucune inscription, lancez la copie initiale : elle copie les tournois existants et marque la destination comme initialisée.

```bash
node scripts/copy-tournaments.mjs --env staging --apply
node scripts/copy-tournaments.mjs --env staging --check
```

Le script copie les contenus, associations aux équipes existantes, paramètres fermés, responsables, inscriptions, lignes, tentatives, paiements, historique et états mail. Il vérifie les identifiants et les nombres de lignes avant de marquer l’opération terminée. Les anciens liens externes d’inscription ne sont pas repris comme liens utilisables. Les fichiers images/PDF restent dans le même R2 : il n’y a pas de copie de médias à refaire.

La destination doit être neuve au premier lancement. Une copie interrompue peut être relancée tant qu’elle n’est pas terminée, sans dupliquer ses lignes ; la source reste conservée. Après succès, le script refuse une nouvelle copie pour ne pas remplacer des données désormais actives. Les fichiers SQL temporaires privés sont supprimés à la fin de chaque lancement ; les sauvegardes de l’étape 3 restent à conserver par le club.

Les écritures du nouveau module sont bloquées tant que cette initialisation n’est pas validée. Les workflows vérifient également ce marqueur avant de déployer. Ne recréez pas manuellement le marqueur pour contourner une erreur de copie.

## 6. Corriger Cloudflare Access et créer le premier responsable

L’ancien message `ACCESS_INVALID` ne prouve pas à lui seul que la session a expiré : il regroupait plusieurs erreurs. Dans la V5.2 :

| Code | Vérification à faire |
| --- | --- |
| `ACCESS_AUDIENCE` | L’AUD du Worker ne correspond pas à l’application Cloudflare qui couvre cette URL |
| `ACCESS_ISSUER` | Le domaine d’équipe ne correspond pas à `CF_ACCESS_ISSUER` |
| `ACCESS_EXPIRED` | Se déconnecter puis recevoir un nouveau PIN |
| `ACCESS_KEYS` | Domaine d’équipe ou accès aux clés publiques Cloudflare à vérifier |
| `ACCESS_DATABASE` | Binding ou migration de la table des responsables manquant |
| `FORBIDDEN` | JWT valide, mais adresse absente des responsables actifs |
| `ACCESS_INVALID` | Jeton/signature non vérifiable ; vérifier la session et la configuration |

Dans Zero Trust → Access → Applications, l’application **Tournois staging** doit couvrir les deux chemins :

```text
fce-escalquens-staging.fcescalquens.workers.dev/admin-tournois
fce-escalquens-staging.fcescalquens.workers.dev/admin-tournois/*
```

Vérifiez aussi les chemins de l’application du site : `/admin` et `/admin/*`, sans règle large `/admin*` qui engloberait d’autres administrations. L’application boutique conserve `/admin-boutique` et `/admin-boutique/*`. Le chemin `/admin-tournois/api/*` doit appartenir à la même application que les pages tournois.

Copiez **Application Audience (AUD)** de l’application Tournois, et non le Policy ID, l’AUD de la boutique ou celui du site. Renseignez les valeurs réelles :

```bash
node scripts/configure-shop-access.mjs --scope tournament --env staging \
  --issuer https://VOTRE-EQUIPE.cloudflareaccess.com \
  --aud AUD_APPLICATION_TOURNOIS \
  --origin https://fce-escalquens-staging.fcescalquens.workers.dev
```

Le domaine d’équipe est le sous-domaine `….cloudflareaccess.com` de la page de connexion. L’AUD et le domaine d’équipe sont des paramètres de configuration ; ne copiez pas un JWT ni un PIN dans le dépôt.

Ajoutez votre adresse exacte à la règle e-mail/PIN de cette application. Si vous aviez déjà créé des responsables tournois en V5.1, la copie les a repris. Sinon, dans **la console de la nouvelle D1 TOURNAMENTS staging**, exécutez avec votre propre adresse :

```sql
INSERT INTO tournament_admins(email,name,active)
VALUES('votre.adresse@example.fr','Votre nom',1)
ON CONFLICT(email) DO UPDATE SET name=excluded.name,active=1;
```

Ce premier ajout évite d’ouvrir une procédure publique de création d’administrateur. Après connexion, **Responsables** permet d’ajouter ou de désactiver les autres adresses. Chaque responsable doit figurer à la fois dans D1 et dans la règle Cloudflare ; les accès du site ou de la boutique ne donnent aucun droit implicite aux tournois. Vous ne pouvez pas désactiver votre propre accès depuis cette session.

Après le déploiement, ouvrez `/cdn-cgi/access/logout`, puis `/admin-tournois/` et reconnectez-vous. Si l’erreur persiste, le nouveau code donne la cause technique précise à vérifier. Le correctif ne peut pas modifier les règles de votre compte Cloudflare depuis ce patch.

## 7. Tests et déploiement

```bash
npm test
npm run typecheck:shop
npm run build
git add .github/workflows .gitignore public scripts src migrations migrations-tournaments tests docs wrangler.jsonc
git commit -m "Réorganise la boutique et isole les tournois en v5.2"
git push origin staging
```

Le workflow applique les migrations DB/ORDERS, vérifie le nouveau binding, applique les migrations TOURNAMENTS, vérifie la copie, puis déploie. La migration DB `0032_shop_price_ranges.sql` actualise les fourchettes de prix existantes. Aucun secret HelloAsso n’est modifié et l’URL du webhook reste :

```text
https://fce-escalquens-staging.fcescalquens.workers.dev/api/shop/helloasso/webhook
```

Le serveur distribue les notifications aux deux bases, avec relecture HelloAsso. Le cron vérifie les paiements et envoie les mails de chaque module dans sa base. Les anciennes copies tournois dans ORDERS ne déclenchent plus de mails ni de réconciliation depuis la boutique.

Un commit/push sans création du binding ou sans copie initiale échouera volontairement avant le déploiement. Cela protège les inscriptions existantes contre une bascule vers une base vide.

## 8. Utiliser le nouveau module

1. **Tournois et visuels** : créez ou modifiez un tournoi. Vous pouvez saisir lieu, dates et catégories ; importer photo, affiche et règlement PDF. « Brouillon » le masque, « À venir » le publie, « Inscriptions ouvertes » autorise l’inscription si la configuration est activée.
2. **Formulaires et tarifs** : choisissez le tournoi, son prix par équipe, la capacité, les échéances et le paiement différé. La copie initiale garde les inscriptions fermées ; vérifiez le tout puis activez-les.
3. **Construire le formulaire** : les champs structurels du responsable adulte et de l’équipe sont conservés. Ajoutez jusqu’à 12 questions complémentaires : texte court (200 caractères), texte long (1 000), liste de choix (20 choix maximum) ou case à cocher. Définissez les champs obligatoires et réordonnez-les. Les questions sont destinées à l’organisation, sans données médicales ni listes de joueurs.
4. **Enregistrer le tarif et le formulaire** : un même numéro de version protège les réglages contre un écrasement concurrent. Une modification concerne les inscriptions suivantes ; les anciennes conservent leur formulaire, leurs réponses, leur prix, leurs conditions et leur échéance.
5. **Page publique** : le bouton ouvre le formulaire du club, sans lien de formulaire externe. Le règlement PDF et Tournify restent des liens distincts utiles. Le paiement immédiat ou différé fonctionne comme en V5.1, exclusivement avec HelloAsso.
6. **Inscriptions et paiements** : le détail montre les réponses enregistrées. Le responsable les retrouve dans son suivi et son mail. L’export CSV de la sélection inclut aussi les réponses complémentaires. Les cases booléennes sont exportées sous « Oui/Non » et les cellules à risque de formule sont neutralisées.

Les questions complémentaires n’ajoutent pas de supplément au tarif : le prix reste celui par équipe configuré pour le tournoi. Les conditions d’inscription/annulation demeurent obligatoires et doivent être vérifiées par les responsables du club.

## 9. Pourquoi la boutique indiquait-elle une fermeture ?

L’ancien catalogue renvoyait seulement `checkout_available=false` quelle que soit la cause. Désormais, **Boutique → Paramètres** indique le premier blocage :

- `SHOP_CLOSED` : affichage public désactivé dans Couverture et affichage ;
- `CHECKOUT_DISABLED` : case **Ouvrir la prise de commandes et le paiement** non cochée ;
- `LEGAL_CONFIG` : informations légales/coordonnées encore incomplètes ;
- `PAYMENT_CONFIG` : association, secrets HelloAsso ou clé de suivi manquants ;
- `MAIL_CONFIG` : transport/expéditeur/destinataire de test incomplet ;
- `CONFIG_ORIGIN` : origine HTTPS du site incorrecte.

Corrigez le blocage indiqué, enregistrez, puis rechargez la boutique. Les ventes ne sont pas activées automatiquement par un déploiement. Le message du panier suit cette cause ; il n’est pas nécessaire d’attendre une « réouverture » si c’est une configuration à terminer.

## 10. Recette sur staging et limites de migration

- Vérifier les tableaux boutique avec deux tailles à prix différents et une personnalisation ; modifier une ligne puis contrôler la fourchette publique et le prix précis du panier.
- Vérifier les trois administrations avec des adresses différentes : aucun droit ne doit se propager entre elles. Tester aussi une mauvaise audience et une session expirée.
- Comparer les tournois/inscriptions copiés, ouvrir un ancien lien de suivi et contrôler que les paiements, tentatives et statuts ont été conservés.
- Ajouter une question obligatoire et une liste, tester les erreurs, puis inscrire une équipe. Modifier le libellé d’une question et vérifier que l’ancienne inscription conserve son ancien formulaire.
- Tester paiement immédiat, différé, retour navigateur, webhook et mail, toujours en Sandbox. Les secrets et le webhook de V5.1 restent inchangés ; `MAIL_TEST_TO` continue à imposer le destinataire de test.
- Vérifier le nouveau tournoi public sur smartphone. Les données de présentation peuvent rester en cache jusqu’à deux minutes ; le formulaire et le tarif sont revérifiés à l’ouverture/validation.

Les scripts locaux de copie et les API sont vérifiés par des tests SQL/DOM, mais la copie distante et les vraies règles Access nécessitent votre compte Cloudflare. Aucun déploiement distant n’est effectué par la livraison de ce patch.

Les anciennes tables DB/ORDERS sont conservées comme source de secours et restent soumises aux durées de conservation ; les anciennes commandes closes sont également purgées à leur échéance maximale. Elles ne sont plus les données actives du module. Après recette et sauvegarde validées, leur nettoyage pourra être planifié : n’exécutez pas de suppression globale de commandes. Une remise de DB staging à partir de la production ne doit pas écraser la D1 TOURNAMENTS ; les données privées ne sont pas copiées automatiquement entre environnements.

Pour un retour arrière après des inscriptions dans le nouveau module, ne redéployez pas simplement la V5.1 : il faut d’abord réconcilier les données nouvelles et leurs paiements. Les sauvegardes initiales ne contiennent pas les inscriptions postérieures à la bascule.

## Production ultérieure

Créez une autre base `fce-escalquens-tournaments`, configurez-la avec `--env production`, appliquez sa migration puis faites une copie initiale des données de production avec le même script. Les responsables et AUD de production sont à configurer séparément. N’utilisez pas l’UUID staging en production. Le workflow production vérifie également le binding et le marqueur de copie avant de déployer.

## Références officielles

- [Cloudflare : validation des JWT Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Cloudflare : jeton d’application et AUD](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)
- [Cloudflare : commandes D1, exports et migrations](https://developers.cloudflare.com/d1/wrangler-commands/)
