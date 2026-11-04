# V5.2.4 — inscriptions par tournoi, sections et lieux du club

## Changements

- Un seul en-tête « Les tournois du club », plus compact. L’inscription démarre depuis la carte de chaque tournoi.
- Une inscription regroupe les équipes d’un club pour un tournoi. Pour chaque section proposée, une réponse Oui/Non est obligatoire. « Oui » ouvre la saisie du nombre d’équipes ; « Non » ne compte aucune équipe.
- Le montant affiché et envoyé au paiement est le nombre total d’équipes multiplié par le tarif par équipe. Exemple : U11 = 2 équipes et U13 = 1 équipe, à 25 € : total 75 €.
- Le serveur contrôle les sections, quantités, tarif, version et capacité. La capacité est un nombre d’équipes, pas un nombre de formulaires. Les inscriptions annulées libèrent leurs places.
- Le détail des sections et quantités est conservé avec l’inscription et affiché dans le suivi et le backoffice. Il est également présent dans les conditions figées et l’export CSV.
- Une mise à jour des tarifs ou du formulaire n’altère pas les inscriptions déjà enregistrées. Les anciennes inscriptions restent comptées pour une équipe.
- Le brouillon technique est propre à chaque tournoi ; un échec incertain ne doit pas provoquer de doublon.
- Le lieu se sélectionne dans les lieux du club, gérés dans l’administration du site. L’adresse et l’itinéraire s’affichent sur la carte publique.

## Installation après V5.2.3

Placez le patch à la racine du dépôt puis lancez dans Codespaces :

```bash
git switch staging
git pull --ff-only
git apply --check fce-correctif-v5.2.4.patch
git apply fce-correctif-v5.2.4.patch
npm ci
npm test
npm run typecheck:shop
npm run build
```

Cette version ajoute `migrations-tournaments/0002_registration_sections.sql`, uniquement dans la base TOURNAMENTS. Les bases DB et ORDERS ne changent pas. Le workflow staging existant applique cette migration avant de déployer le Worker. Il ne faut pas relancer la copie initiale des tournois.

Si vous déployez manuellement, appliquez d’abord la migration :

```bash
npx wrangler d1 migrations apply TOURNAMENTS --remote --env staging
```

Pour la procédure habituelle par GitHub Actions :

```bash
git add public/tournament-checkout.css public/tournaments.js src/pages/tournois/index.astro src/scripts/admin-tournaments.js src/scripts/tournament-events-editor.js src/scripts/tournament-form-fields.js src/scripts/tournament-tracking.js src/scripts/tournaments-checkout.js src/shop/service.ts src/tournaments/events.ts src/tournaments/forms.ts src/tournaments/service.ts src/worker.ts tests/shop.test.ts tests/tournament-ui.test.ts migrations-tournaments/0002_registration_sections.sql docs/CORRECTIF-V5.2.4.md
git commit -m "Inscriptions tournois par sections et lieux du club"
git push origin staging
```

Attendez la réussite du workflow et rechargez `/tournois/`.

## Réglages d’un tournoi

1. Dans `/admin-tournois/tournois/`, modifiez le tournoi.
2. Sélectionnez son lieu dans « Lieu du club ». L’adresse apparaît sous la liste. Un ancien lieu saisi en texte doit être rattaché une fois au lieu correspondant.
3. Dans « Sections à inscrire », indiquez les sections séparées par une virgule, par exemple `U11, U13, U15`. Chacune devient une question Oui/Non obligatoire. Sans section renseignée, le formulaire propose une ligne générique « Équipes ».
4. Pour ouvrir les inscriptions, choisissez le statut « Inscriptions ouvertes » et enregistrez.
5. Dans `/admin-tournois/parametres/`, sélectionnez ce même tournoi. Réglez son tarif par équipe, sa capacité en équipes (0 signifie sans limite), les dates et les conditions. Ajoutez les questions complémentaires souhaitées ; il n’est pas nécessaire de recréer les sections dans ces questions.
6. Cochez « Activer les inscriptions intégrées ». Autorisez le paiement plus tard si vous le souhaitez, puis enregistrez.
7. Sur le site, vérifiez le tarif et cliquez sur « Inscrire mes équipes ». Répondez à chaque section et vérifiez le calcul du total avant de confirmer.

Le montant est limité à 10 000 € par inscription, avec au maximum 50 équipes par section et 100 au total. Aucun nom ou renseignement individuel de joueur n’est demandé.

## Affichage public des tarifs et formulaires

Le tarif enregistré reste maintenant visible même si les inscriptions sont fermées. Un message précise alors pourquoi le bouton d’inscription n’est pas proposé : inscriptions non activées, statut du tournoi ou dates dépassées.

La page de données des tournois n’utilise plus le cache public intermédiaire. Les paramètres d’inscription sont chargés sans cache. Une erreur de chargement des inscriptions laisse désormais les cartes tournoi visibles avec un message d’erreur explicite.

Si le formulaire ne s’ouvre pas, vérifiez d’abord les deux conditions d’ouverture (statut et activation), les échéances et la réussite du déploiement. Les API `/api/page/tournaments` et `/api/tournaments/catalogue` doivent répondre correctement. Les réglages HelloAsso et mail restent nécessaires à l’enregistrement d’une inscription ; leur absence produit une erreur explicite, sans confirmer une inscription inexistante.

## Lieux et séparation des bases

La base DB reste la source des lieux et de leurs adresses. TOURNAMENTS conserve l’identifiant du lieu et un libellé de secours. Aucune copie supplémentaire des lieux n’est créée. Un lieu inconnu ou désactivé ne peut pas être affecté à un nouveau tournoi. Un tournoi déjà rattaché à un lieu ensuite désactivé peut conserver ce rattachement, avec le libellé historique en secours.

Les lieux actifs liés aux tournois affichent l’adresse courante de la fiche du club. Le lien d’itinéraire utilise le lien HTTPS enregistré, ou un lien Google Maps calculé depuis l’adresse. Aucun widget de carte tiers n’est chargé automatiquement.
