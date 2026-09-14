(() => {
  const form = document.querySelector('#visual-form');
  const dateInput = document.querySelector('#visual-date');
  const status = document.querySelector('#visual-status');
  const previews = document.querySelector('#visual-previews');

  if (!form || !dateInput || !status || !previews) return;

  const PARIS_TIME_ZONE = 'Europe/Paris';
  const CLUB_PATTERN = /(?:f\.?\s*c\.?\s*)?escalquens/i;
  const ROWS_PER_IMAGE = 6;
  const EDO_FONT = '"Edo SZ", Impact, "Arial Narrow", Arial, sans-serif';
  const TEXT_FONT = 'Arial, sans-serif';

  const collator = new Intl.Collator('fr', {
    numeric: true,
    sensitivity: 'base'
  });

  let matchDataPromise;

  function dateKey(value) {
    const parts = new Intl.DateTimeFormat('fr-FR', {
      timeZone: PARIS_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date(value));

    const map = Object.fromEntries(
      parts.map(part => [part.type, part.value])
    );

    return `${map.year}-${map.month}-${map.day}`;
  }

  function nextSaturday() {
    const now = new Date();

    const paris = new Date(
      new Intl.DateTimeFormat('en-US', {
        timeZone: PARIS_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(now)
    );

    const delta = (6 - paris.getDay() + 7) % 7;

    paris.setDate(paris.getDate() + delta);

    return [
      paris.getFullYear(),
      String(paris.getMonth() + 1).padStart(2, '0'),
      String(paris.getDate()).padStart(2, '0')
    ].join('-');
  }

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /*
   * ------------------------------------------------------------
   * ÉQUIPES FFF / ORDRE DES VISUELS
   * ------------------------------------------------------------
   */

  function entryFor(match, entriesById) {
    if (!match.competition_team_id) return null;

    return entriesById.get(String(match.competition_team_id)) || null;
  }

  function teamNumber(match, entriesById) {
    const entry = entryFor(match, entriesById);

    const number = Number(entry?.team_number);

    return Number.isFinite(number) && number > 0
      ? number
      : 0;
  }  
  function categoryHasSeveralTeams(match, entriesById) {
    const currentEntry = entryFor(match, entriesById);

    if (!currentEntry) {
      return false;
    }

    const category = normalize(
      currentEntry.category_code || ''
    );

    const seasonId = String(
      currentEntry.season_id || ''
    );

    if (!category) {
      return false;
    }

    const numbers = new Set(
      [...entriesById.values()]
        .filter(entry => {
          return (
            normalize(entry.category_code || '') === category &&
            String(entry.season_id || '') === seasonId &&
            Number(entry.active ?? 1) !== 0
          );
        })
        .map(entry => Number(entry.team_number))
        .filter(number =>
          Number.isFinite(number) &&
          number > 0
        )
    );

    return numbers.size > 1;
  } 

  function categorySource(match, entriesById) {
    const entry = entryFor(match, entriesById);

    return String(
      entry?.category_code ||
      match.category ||
      entry?.name ||
      ''
    ).trim();
  }

  function categoryIdentity(match, entriesById) {
    const entry = entryFor(match, entriesById);

    return normalize([
      entry?.category_code,
      entry?.name,
      match.category
    ].filter(Boolean).join(' '));
  }

  function isSenior(match, entriesById) {
    const identity = categoryIdentity(match, entriesById);

    return (
      /\bseniors?\b/.test(identity) ||
      /^sen(?:ior)?s?\b/.test(identity)
    );
  }

  function youthCategory(match, entriesById) {
    const source = normalize(
      categorySource(match, entriesById)
    ).replace(/\s+/g, '');

    /*
     * Exemples reconnus :
     * U8
     * U11
     * U15
     * U15F
     * U18F
     */
    const found = source.match(/^u(\d+)(f)?/i);

    if (!found) return null;

    return {
      age: Number(found[1]),
      female: Boolean(found[2])
    };
  }

  function visualSortKey(match, entriesById) {
    const youth = youthCategory(match, entriesById);

    if (youth) {
      return {
        family: 0,
        age: youth.age,
        female: youth.female ? 1 : 0,
        team: teamNumber(match, entriesById),
        label: categorySource(match, entriesById),
        time: new Date(match.starts_at).getTime()
      };
    }

    /*
     * Les seniors sont placés après les catégories jeunes.
     * Sénior 1 est placé avant Sénior 2.
     */
    if (isSenior(match, entriesById)) {
      return {
        family: 1,
        age: 100,
        female: 0,
        team: teamNumber(match, entriesById) || 99,
        label: categorySource(match, entriesById),
        time: new Date(match.starts_at).getTime()
      };
    }

    /*
     * Toute catégorie exceptionnelle non reconnue est placée
     * après les catégories standard.
     */
    return {
      family: 2,
      age: 999,
      female: 0,
      team: teamNumber(match, entriesById),
      label: categorySource(match, entriesById),
      time: new Date(match.starts_at).getTime()
    };
  }

  function sortMatchesForVisual(matches, entriesById) {
    return [...matches].sort((a, b) => {
      const left = visualSortKey(a, entriesById);
      const right = visualSortKey(b, entriesById);

      return (
        left.family - right.family ||
        left.age - right.age ||

        /*
         * À âge égal :
         * U15 avant U15F.
         */
        left.female - right.female ||

        /*
         * Deux équipes de même catégorie :
         * équipe 1 avant équipe 2.
         */
        left.team - right.team ||

        collator.compare(left.label, right.label) ||

        /*
         * Enfin seulement, ordre chronologique.
         */
        left.time - right.time
      );
    });
  }

 function visualCategoryLabel(match, entriesById) {
    const entry = entryFor(match, entriesById);

    const category = String(
      entry?.category_code ||
      match.category ||
      entry?.name ||
      'ÉQUIPE'
    )
      .trim()
      .toUpperCase();

    const number = teamNumber(
      match,
      entriesById
    );

    /*
    * Seniors :
    * SÉNIOR 1
    * SÉNIOR 2
    */
    if (isSenior(match, entriesById)) {
      return number
        ? `SÉNIOR ${number}`
        : 'SÉNIOR';
    }

    /*
    * Catégories jeunes :
    *
    * U18F 1
    * U18F 2
    *
    * seulement lorsqu'il existe réellement
    * plusieurs team_number pour cette catégorie
    * pendant la même saison.
    *
    * Un U15 unique reste U15, même si son
    * team_number vaut 1.
    */
    if (
      number &&
      categoryHasSeveralTeams(
        match,
        entriesById
      )
    ) {
      return `${category} ${number}`;
    }

    return category;
  }

  /*
   * ------------------------------------------------------------
   * RENCONTRES
   * ------------------------------------------------------------
   */

  function isPlateau(match) {
    return ['plateau', 'animation'].includes(
      String(match.event_type || '').toLowerCase()
    );
  }

  function participantsFor(match, participantsByMatch) {
    return participantsByMatch.get(String(match.id)) || [];
  }

  function isClubMatch(match, participantsByMatch) {
    return (
      CLUB_PATTERN.test(
        `${match.home_team || ''} ${match.away_team || ''}`
      ) ||
      participantsFor(match, participantsByMatch).some(row =>
        CLUB_PATTERN.test(row.team_name || row.name || '')
      )
    );
  }

  function deduplicate(matches, participantsByMatch) {
    const unique = new Map();

    for (const match of matches) {
      const key = [
        dateKey(match.starts_at),
        new Date(match.starts_at).getTime(),

        /*
         * Important :
         * deux équipes FFF différentes ne doivent jamais être
         * fusionnées simplement parce qu'elles sont toutes les
         * deux dans la catégorie "Seniors".
         */
        String(
          match.competition_team_id ||
          match.team_id ||
          ''
        ),

        normalize(match.category),
        normalize(match.competition),

        isPlateau(match)
          ? 'plateau'
          : normalize(match.home_team),

        isPlateau(match)
          ? normalize(match.venue)
          : normalize(match.away_team)
      ].join('|');

      const current = unique.get(key);

      const quality =
        String(match.venue_address || '').length +
        participantsFor(match, participantsByMatch).length * 30;

      const currentQuality = current
        ? String(current.venue_address || '').length +
          participantsFor(current, participantsByMatch).length * 30
        : -1;

      if (!current || quality > currentQuality) {
        unique.set(key, match);
      }
    }

    return [...unique.values()];
  }

  function placeParts(match) {
    const venue = String(match.venue || '')
      .replace(/\s+/g, ' ')
      .trim();

    const address = String(match.venue_address || '')
      .replace(/\s+/g, ' ')
      .trim();

    const joined = `${venue} ${address}`.trim();

    const postal = joined.match(
      /\b\d{5}\s+([^,;|]+)$/i
    );

    let city = postal?.[1]?.trim() || '';

    if (!city) {
      const addressPieces = address
        .split(/[—–|,]/)
        .map(value => value.trim())
        .filter(Boolean);

      city =
        addressPieces
          .at(-1)
          ?.replace(/^\d{5}\s*/, '') ||
        '';
    }

    if (
      !city &&
      !CLUB_PATTERN.test(match.home_team || '')
    ) {
      city = match.home_team || '';
    }

    if (!city) {
      city = 'Lieu à confirmer';
    }

    const stadium =
      venue &&
      normalize(venue) !== normalize(city)
        ? venue
        : '';

    return {
      city,
      stadium
    };
  }

  function timeLabel(match) {
    const state = normalize(match.status);

    if (state.includes('annul')) {
      return 'ANNULÉ';
    }

    if (state.includes('report')) {
      return 'REPORTÉ';
    }

    if (Number(match.time_confirmed) === 0) {
      return 'À CONF.';
    }

    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: PARIS_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    })
      .format(new Date(match.starts_at))
      .replace(':', 'H');
  }

  function opponentLabel(match, participantsByMatch) {
    if (isPlateau(match)) {
      const count =
        participantsFor(
          match,
          participantsByMatch
        ).length;

      return count
        ? `${count} équipe${count > 1 ? 's' : ''} · plateau`
        : 'Plateau';
    }

    const homeIsClub = CLUB_PATTERN.test(
      match.home_team || ''
    );

    const opponent = homeIsClub
      ? match.away_team
      : match.home_team;

    if (
      match.home_score != null &&
      match.away_score != null
    ) {
      const clubScore = homeIsClub
        ? match.home_score
        : match.away_score;

      const opponentScore = homeIsClub
        ? match.away_score
        : match.home_score;

      return `${clubScore} – ${opponentScore} · ${
        opponent || 'Adversaire'
      }`;
    }

    return opponent || 'Adversaire à confirmer';
  }

  function dayLabels(dateValue) {
    const date = new Date(
      `${dateValue}T12:00:00+02:00`
    );

    return {
      weekday: new Intl.DateTimeFormat(
        'fr-FR',
        {
          weekday: 'long',
          timeZone: PARIS_TIME_ZONE
        }
      )
        .format(date)
        .toUpperCase(),

      full: new Intl.DateTimeFormat(
        'fr-FR',
        {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: PARIS_TIME_ZONE
        }
      )
        .format(date)
        .toUpperCase()
    };
  }

  /*
   * ------------------------------------------------------------
   * CANVAS
   * ------------------------------------------------------------
   */

  function fitText(
    ctx,
    text,
    maxWidth,
    startSize,
    minSize,
    weight = 900,
    family = TEXT_FONT
  ) {
    let size = startSize;

    do {
      ctx.font =
        `${weight} ${size}px ${family}`;

      if (
        ctx.measureText(text).width <= maxWidth
      ) {
        return size;
      }

      size -= 2;
    } while (size >= minSize);

    return minSize;
  }

  function drawClock(ctx, x, y) {
    ctx.save();

    ctx.strokeStyle = '#171112';
    ctx.lineWidth = 5;

    ctx.beginPath();
    ctx.arc(
      x,
      y,
      16,
      0,
      Math.PI * 2
    );
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x, y + 1);
    ctx.lineTo(x + 9, y + 7);
    ctx.stroke();

    ctx.restore();
  }

  function drawPin(ctx, x, y) {
    ctx.save();

    ctx.strokeStyle = '#171112';
    ctx.lineWidth = 5;

    ctx.beginPath();
    ctx.arc(
      x,
      y - 5,
      12,
      0,
      Math.PI * 2
    );
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - 10, y + 3);
    ctx.lineTo(x, y + 22);
    ctx.lineTo(x + 10, y + 3);
    ctx.stroke();

    ctx.restore();
  }

  function loadBackground() {
    return new Promise(resolve => {
      const image = new Image();

      image.onload = () =>
        resolve(image);

      image.onerror = () =>
        resolve(null);

      image.src =
        '/fond-insta-fce-v2.png';
    });
  }

  async function loadEdoFont() {
    if (!document.fonts?.load) {
      return;
    }

    try {
      await document.fonts.load(
        '48px "Edo SZ"'
      );
    } catch (_) {
      /*
       * La police de secours reste
       * utilisable.
       */
    }
  }

  async function drawVisual(
    canvas,
    matches,
    dateValue,
    pageIndex,
    pageCount,
    participantsByMatch,
    entriesById
  ) {
    const ctx =
      canvas.getContext('2d');

    const {
      weekday,
      full
    } = dayLabels(dateValue);

    const [background] =
      await Promise.all([
        loadBackground(),
        loadEdoFont()
      ]);

    const width =
      canvas.width = 1080;

    const height =
      canvas.height = 1350;

    if (background) {
      ctx.drawImage(
        background,
        0,
        0,
        width,
        height
      );
    } else {
      ctx.fillStyle = '#171112';
      ctx.fillRect(
        0,
        0,
        width,
        height
      );
    }

    ctx.fillStyle = '#171112';
    ctx.textAlign = 'center';

    ctx.font =
      `400 61px ${EDO_FONT}`;

    ctx.fillText(
      weekday,
      540,
      365
    );

    ctx.font =
      `400 28px ${EDO_FONT}`;

    ctx.fillText(
      full,
      540,
      401
    );

    if (pageCount > 1) {
      ctx.font =
        `400 21px ${EDO_FONT}`;

      ctx.fillText(
        `VISUEL ${pageIndex + 1}/${pageCount}`,
        540,
        430
      );
    }

    const rowsTop =
      pageCount > 1
        ? 475
        : 455;

    const rowHeight = Math.min(
      105,
      (1090 - rowsTop) /
        Math.max(matches.length, 1)
    );

    matches.forEach(
      (match, index) => {
        const y =
          rowsTop +
          index * rowHeight;

        /*
         * Catégorie affichée :
         * U15
         * U15F
         * SÉNIOR 1
         * SÉNIOR 2
         */
        const category =
          visualCategoryLabel(
            match,
            entriesById
          );

        fitText(
          ctx,
          category,
          205,
          38,
          24,
          400,
          EDO_FONT
        );

        ctx.fillStyle = '#171112';
        ctx.textAlign = 'left';

        ctx.fillText(
          category,
          90,
          y + 16
        );

        const opponent =
          opponentLabel(
            match,
            participantsByMatch
          );

        fitText(
          ctx,
          opponent,
          230,
          23,
          15,
          400,
          EDO_FONT
        );

        ctx.fillStyle = '#5b4145';

        ctx.fillText(
          opponent,
          90,
          y + 45
        );

        drawClock(
          ctx,
          365,
          y + 4
        );

        const time =
          timeLabel(match);

        fitText(
          ctx,
          time,
          150,
          36,
          23,
          400,
          EDO_FONT
        );

        ctx.fillStyle = '#171112';

        ctx.fillText(
          time,
          395,
          y + 16
        );

        drawPin(
          ctx,
          590,
          y + 2
        );

        const place =
          placeParts(match);

        const city =
          String(
            place.city
          ).toUpperCase();

        fitText(
          ctx,
          city,
          350,
          34,
          21,
          400,
          EDO_FONT
        );

        ctx.fillStyle = '#171112';

        ctx.fillText(
          city,
          625,
          y + 12
        );

        const stadium =
          place.stadium ||
          'Stade à confirmer';

        fitText(
          ctx,
          stadium,
          350,
          22,
          14,
          400,
          EDO_FONT
        );

        ctx.fillStyle = '#5b4145';

        ctx.fillText(
          stadium,
          625,
          y + 44
        );
      }
    );
  }

  /*
   * ------------------------------------------------------------
   * DONNÉES
   * ------------------------------------------------------------
   */

  async function fetchMatchData() {
    if (!matchDataPromise) {
      matchDataPromise = fetch(
        '/api/page/matches?v=20',
        {
          headers: {
            accept:
              'application/json'
          }
        }
      ).then(async response => {
        if (!response.ok) {
          throw new Error(
            `Le calendrier ne répond pas (${response.status}).`
          );
        }

        return response.json();
      });
    }

    return matchDataPromise;
  }

  /*
   * ------------------------------------------------------------
   * TÉLÉCHARGEMENT
   * ------------------------------------------------------------
   */

  function downloadCanvas(
    canvas,
    filename
  ) {
    canvas.toBlob(blob => {
      if (!blob) return;

      const link =
        document.createElement('a');

      link.href =
        URL.createObjectURL(blob);

      link.download = filename;

      link.click();

      window.setTimeout(
        () =>
          URL.revokeObjectURL(
            link.href
          ),
        1500
      );
    }, 'image/png');
  }

  /*
   * ------------------------------------------------------------
   * GÉNÉRATION
   * ------------------------------------------------------------
   */

  form.addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      const selectedDate =
        dateInput.value;

      if (!selectedDate) {
        return;
      }

      const submit =
        form.querySelector(
          'button[type="submit"]'
        );

      submit.disabled = true;

      previews.replaceChildren();

      status.removeAttribute(
        'data-state'
      );

      status.textContent =
        'Récupération des rencontres…';

      try {
        const data =
          await fetchMatchData();

        /*
         * Participants des plateaux.
         */
        const participantsByMatch =
          new Map();

        for (
          const participant
          of data.participants || []
        ) {
          const key = String(
            participant.match_id
          );

          if (
            !participantsByMatch.has(
              key
            )
          ) {
            participantsByMatch.set(
              key,
              []
            );
          }

          participantsByMatch
            .get(key)
            .push(participant);
        }

        /*
         * Correspondance :
         *
         * match.competition_team_id
         *          ↓
         * team_competitions.id
         *
         * C'est cette table qui connaît
         * le vrai numéro Sénior 1 / Sénior 2.
         */
        const entriesById = new Map(
          (data.entries || []).map(
            entry => [
              String(entry.id),
              entry
            ]
          )
        );

        /*
         * 1. Filtrer la date.
         * 2. Garder uniquement le FCE.
         * 3. Supprimer les doublons.
         * 4. Trier par équipe/catégorie.
         *
         * Le tri n'est donc PLUS fait
         * principalement par heure.
         */
        const filtered =
          (
            data.matches || []
          ).filter(
            match =>
              match.starts_at &&
              dateKey(
                match.starts_at
              ) === selectedDate &&
              isClubMatch(
                match,
                participantsByMatch
              )
          );

        const unique =
          deduplicate(
            filtered,
            participantsByMatch
          );

        const matches =
          sortMatchesForVisual(
            unique,
            entriesById
          );

        if (!matches.length) {
          throw new Error(
            'Aucune rencontre du FC Escalquens n’est enregistrée à cette date.'
          );
        }

        /*
         * Le découpage des PNG est effectué
         * APRÈS le tri.
         *
         * Exemple :
         *
         * U11
         * U12
         * U13
         * U15
         * U15
         * U15F
         *
         * puis sur le visuel suivant :
         *
         * SÉNIOR 1
         * SÉNIOR 2
         */
        const pages = [];

        for (
          let index = 0;
          index < matches.length;
          index += ROWS_PER_IMAGE
        ) {
          pages.push(
            matches.slice(
              index,
              index + ROWS_PER_IMAGE
            )
          );
        }

        for (
          let index = 0;
          index < pages.length;
          index += 1
        ) {
          const figure =
            document.createElement(
              'figure'
            );

          figure.className =
            'visual-preview';

          const canvas =
            document.createElement(
              'canvas'
            );

          canvas.width = 1080;
          canvas.height = 1350;

          const caption =
            document.createElement(
              'figcaption'
            );

          const label =
            document.createElement(
              'span'
            );

          label.textContent =
            pages.length > 1
              ? `Visuel ${index + 1} sur ${pages.length}`
              : `${matches.length} rencontre${
                  matches.length > 1
                    ? 's'
                    : ''
                }`;

          const button =
            document.createElement(
              'button'
            );

          button.type =
            'button';

          button.className =
            'visual-download';

          button.textContent =
            'Télécharger le PNG';

          button.addEventListener(
            'click',
            () =>
              downloadCanvas(
                canvas,
                `${selectedDate}-matchs-fce-${index + 1}.png`
              )
          );

          caption.append(
            label,
            button
          );

          figure.append(
            canvas,
            caption
          );

          previews.append(
            figure
          );

          await drawVisual(
            canvas,
            pages[index],
            selectedDate,
            index,
            pages.length,
            participantsByMatch,
            entriesById
          );
        }

        status.textContent =
          `${matches.length} rencontre${
            matches.length > 1
              ? 's'
              : ''
          } trouvée${
            matches.length > 1
              ? 's'
              : ''
          }. Format 1080 × 1350 px, prêt pour Instagram et Facebook.`;

      } catch (error) {
        status.dataset.state =
          'error';

        status.textContent =
          error instanceof Error
            ? error.message
            : 'Impossible de générer le visuel.';

      } finally {
        submit.disabled =
          false;
      }
    }
  );

  dateInput.value =
    nextSaturday();
})();