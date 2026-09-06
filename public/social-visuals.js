(() => {
  const form = document.querySelector('#visual-form');
  const dateInput = document.querySelector('#visual-date');
  const status = document.querySelector('#visual-status');
  const previews = document.querySelector('#visual-previews');
  if (!form || !dateInput || !status || !previews) return;

  const PARIS_TIME_ZONE = 'Europe/Paris';
  const CLUB_PATTERN = /(?:f\.?\s*c\.?\s*)?escalquens/i;
  const ROWS_PER_IMAGE = 6;
  let matchDataPromise;

  function dateKey(value) {
    const parts = new Intl.DateTimeFormat('fr-FR', {
      timeZone: PARIS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(value));
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }

  function nextSaturday() {
    const now = new Date();
    const paris = new Date(new Intl.DateTimeFormat('en-US', {
      timeZone: PARIS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(now));
    const delta = (6 - paris.getDay() + 7) % 7;
    paris.setDate(paris.getDate() + delta);
    return `${paris.getFullYear()}-${String(paris.getMonth() + 1).padStart(2, '0')}-${String(paris.getDate()).padStart(2, '0')}`;
  }

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function isPlateau(match) {
    return ['plateau', 'animation'].includes(String(match.event_type || '').toLowerCase());
  }

  function participantsFor(match, participantsByMatch) {
    return participantsByMatch.get(String(match.id)) || [];
  }

  function isClubMatch(match, participantsByMatch) {
    return CLUB_PATTERN.test(`${match.home_team || ''} ${match.away_team || ''}`)
      || participantsFor(match, participantsByMatch).some(row => CLUB_PATTERN.test(row.team_name || row.name || ''));
  }

  function deduplicate(matches, participantsByMatch) {
    const unique = new Map();
    for (const match of matches) {
      const key = [
        dateKey(match.starts_at),
        new Date(match.starts_at).getTime(),
        normalize(match.category),
        normalize(match.competition),
        isPlateau(match) ? 'plateau' : normalize(match.home_team),
        isPlateau(match) ? normalize(match.venue) : normalize(match.away_team)
      ].join('|');
      const current = unique.get(key);
      const quality = String(match.venue_address || '').length + participantsFor(match, participantsByMatch).length * 30;
      const currentQuality = current
        ? String(current.venue_address || '').length + participantsFor(current, participantsByMatch).length * 30
        : -1;
      if (!current || quality > currentQuality) unique.set(key, match);
    }
    return [...unique.values()].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  }

  function placeParts(match) {
    const venue = String(match.venue || '').replace(/\s+/g, ' ').trim();
    const address = String(match.venue_address || '').replace(/\s+/g, ' ').trim();
    const joined = `${venue} ${address}`.trim();
    const postal = joined.match(/\b\d{5}\s+([^,;|]+)$/i);
    let city = postal?.[1]?.trim() || '';
    if (!city) {
      const addressPieces = address.split(/[—–|,]/).map(value => value.trim()).filter(Boolean);
      city = addressPieces.at(-1)?.replace(/^\d{5}\s*/, '') || '';
    }
    if (!city && !CLUB_PATTERN.test(match.home_team || '')) city = match.home_team || '';
    if (!city) city = 'Lieu à confirmer';
    const stadium = venue && normalize(venue) !== normalize(city) ? venue : '';
    return { city, stadium };
  }

  function timeLabel(match) {
    const state = normalize(match.status);
    if (state.includes('annul')) return 'ANNULÉ';
    if (state.includes('report')) return 'REPORTÉ';
    if (Number(match.time_confirmed) === 0) return 'À CONF.';
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: PARIS_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(new Date(match.starts_at)).replace(':', 'H');
  }

  function opponentLabel(match, participantsByMatch) {
    if (isPlateau(match)) {
      const count = participantsFor(match, participantsByMatch).length;
      return count ? `${count} équipe${count > 1 ? 's' : ''} · plateau` : 'Plateau';
    }
    const homeIsClub = CLUB_PATTERN.test(match.home_team || '');
    const opponent = homeIsClub ? match.away_team : match.home_team;
    if (match.home_score != null && match.away_score != null) {
      const clubScore = homeIsClub ? match.home_score : match.away_score;
      const opponentScore = homeIsClub ? match.away_score : match.home_score;
      return `${clubScore} – ${opponentScore} · ${opponent || 'Adversaire'}`;
    }
    return opponent || 'Adversaire à confirmer';
  }

  function dayLabels(dateValue) {
    const date = new Date(`${dateValue}T12:00:00+02:00`);
    return {
      weekday: new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: PARIS_TIME_ZONE }).format(date).toUpperCase(),
      full: new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: PARIS_TIME_ZONE }).format(date).toUpperCase()
    };
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function fitText(ctx, text, maxWidth, startSize, minSize, weight = 900) {
    let size = startSize;
    do {
      ctx.font = `${weight} ${size}px Arial, sans-serif`;
      if (ctx.measureText(text).width <= maxWidth) return size;
      size -= 2;
    } while (size >= minSize);
    return minSize;
  }

  function drawClock(ctx, x, y) {
    ctx.save();ctx.strokeStyle = '#171112';ctx.lineWidth = 5;ctx.beginPath();ctx.arc(x, y, 16, 0, Math.PI * 2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x, y - 10);ctx.lineTo(x, y + 1);ctx.lineTo(x + 9, y + 7);ctx.stroke();ctx.restore();
  }

  function drawPin(ctx, x, y) {
    ctx.save();ctx.strokeStyle = '#171112';ctx.lineWidth = 5;ctx.beginPath();ctx.arc(x, y - 5, 12, 0, Math.PI * 2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x - 10, y + 3);ctx.lineTo(x, y + 22);ctx.lineTo(x + 10, y + 3);ctx.stroke();ctx.restore();
  }

  function loadLogo() {
    return new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = '/logo-fce.png';
    });
  }

  async function drawVisual(canvas, matches, dateValue, pageIndex, pageCount, participantsByMatch) {
    const ctx = canvas.getContext('2d');
    const { weekday, full } = dayLabels(dateValue);
    const logo = await loadLogo();
    const width = canvas.width = 1080;
    const height = canvas.height = 1350;

    ctx.fillStyle = '#171112';ctx.fillRect(0, 0, width, height);
    const redGlow = ctx.createRadialGradient(85, 100, 0, 85, 100, 620);
    redGlow.addColorStop(0, '#b51531');redGlow.addColorStop(.48, '#5f0b27');redGlow.addColorStop(1, '#171112');
    ctx.fillStyle = redGlow;ctx.fillRect(0, 0, width, 350);
    ctx.fillStyle = '#8b1047';ctx.beginPath();ctx.moveTo(1080, 150);ctx.lineTo(1080, 620);ctx.lineTo(880, 490);ctx.closePath();ctx.fill();
    ctx.fillStyle = '#ffd000';
    for (let index = 0; index < 4; index += 1) {
      ctx.save();ctx.translate(825, 70 + index * 42);ctx.rotate(-.16);ctx.fillRect(0, 0, 205, 10);ctx.restore();
    }
    ctx.globalAlpha = .12;ctx.strokeStyle = '#fff';ctx.lineWidth = 2;
    for (let index = -200; index < 1250; index += 55) {ctx.beginPath();ctx.moveTo(index, 0);ctx.lineTo(index + 300, 1350);ctx.stroke();}
    ctx.globalAlpha = 1;

    ctx.textAlign = 'left';ctx.fillStyle = '#ffd000';ctx.font = '900 38px Arial, sans-serif';ctx.fillText('CE', 60, 78);
    ctx.fillStyle = '#fff';ctx.font = '900 74px Impact, Arial Narrow, Arial, sans-serif';ctx.fillText('WEEK-END', 60, 146);
    ctx.fillStyle = '#ffd000';ctx.fillRect(62, 171, 280, 12);

    const panelGradient = ctx.createLinearGradient(45, 245, 1025, 1110);
    panelGradient.addColorStop(0, '#ffe26b');panelGradient.addColorStop(.52, '#ffd000');panelGradient.addColorStop(1, '#e9ad00');
    roundedRect(ctx, 45, 235, 990, 890, 50);ctx.fillStyle = panelGradient;ctx.fill();
    ctx.fillStyle = '#171112';ctx.textAlign = 'center';ctx.font = '900 55px Impact, Arial Narrow, Arial, sans-serif';ctx.fillText(weekday, 540, 310);
    ctx.font = '800 23px Arial, sans-serif';ctx.fillText(full, 540, 345);
    if (pageCount > 1) {ctx.font = '800 17px Arial, sans-serif';ctx.fillText(`VISUEL ${pageIndex + 1}/${pageCount}`, 540, 373);}

    const rowsTop = pageCount > 1 ? 410 : 390;
    const rowHeight = Math.min(116, (1090 - rowsTop) / Math.max(matches.length, 1));
    matches.forEach((match, index) => {
      const y = rowsTop + index * rowHeight;
      if (index) {ctx.strokeStyle = '#17111233';ctx.lineWidth = 2;ctx.beginPath();ctx.moveTo(85, y - 17);ctx.lineTo(995, y - 17);ctx.stroke();}

      const category = String(match.category || 'ÉQUIPE').toUpperCase();
      fitText(ctx, category, 205, 33, 21);ctx.fillStyle = '#171112';ctx.textAlign = 'left';ctx.fillText(category, 90, y + 16);
      const opponent = opponentLabel(match, participantsByMatch);
      fitText(ctx, opponent, 230, 17, 13, 700);ctx.fillStyle = '#5b4145';ctx.fillText(opponent, 90, y + 43);

      drawClock(ctx, 365, y + 4);
      const time = timeLabel(match);fitText(ctx, time, 150, 31, 20);ctx.fillStyle = '#171112';ctx.fillText(time, 395, y + 16);

      drawPin(ctx, 590, y + 2);
      const place = placeParts(match);
      fitText(ctx, String(place.city).toUpperCase(), 350, 29, 18);ctx.fillStyle = '#171112';ctx.fillText(String(place.city).toUpperCase(), 625, y + 12);
      const stadium = place.stadium || 'Stade à confirmer';
      fitText(ctx, stadium, 350, 16, 12, 700);ctx.fillStyle = '#5b4145';ctx.fillText(stadium, 625, y + 41);
    });

    ctx.fillStyle = '#fff';ctx.textAlign = 'left';ctx.font = '900 24px Arial, sans-serif';ctx.fillText('@FCESCALQUENS', 65, 1265);
    ctx.fillStyle = '#ffd000';ctx.fillRect(65, 1282, 220, 7);
    ctx.fillStyle = '#fff';ctx.textAlign = 'right';ctx.font = '700 19px Arial, sans-serif';ctx.fillText('INSTAGRAM  ·  FACEBOOK', 1015, 1265);
    if (logo) {
      const ratio = Math.min(175 / logo.width, 175 / logo.height);
      const logoWidth = logo.width * ratio;const logoHeight = logo.height * ratio;
      ctx.drawImage(logo, 540 - logoWidth / 2, 1138, logoWidth, logoHeight);
    } else {
      ctx.fillStyle = '#fff';ctx.textAlign = 'center';ctx.font = '900 34px Arial, sans-serif';ctx.fillText('FC ESCALQUENS', 540, 1205);
    }
  }

  async function fetchMatchData() {
    if (!matchDataPromise) {
      matchDataPromise = fetch('/api/page/matches?v=20', { headers: { accept: 'application/json' } }).then(async response => {
        if (!response.ok) throw new Error(`Le calendrier ne répond pas (${response.status}).`);
        return response.json();
      });
    }
    return matchDataPromise;
  }

  function downloadCanvas(canvas, filename) {
    canvas.toBlob(blob => {
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);link.download = filename;link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1500);
    }, 'image/png');
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const selectedDate = dateInput.value;
    if (!selectedDate) return;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;previews.replaceChildren();status.removeAttribute('data-state');status.textContent = 'Récupération des rencontres…';
    try {
      const data = await fetchMatchData();
      const participantsByMatch = new Map();
      for (const participant of data.participants || []) {
        const key = String(participant.match_id);
        if (!participantsByMatch.has(key)) participantsByMatch.set(key, []);
        participantsByMatch.get(key).push(participant);
      }
      const matches = deduplicate((data.matches || []).filter(match => match.starts_at
        && dateKey(match.starts_at) === selectedDate
        && isClubMatch(match, participantsByMatch)), participantsByMatch);
      if (!matches.length) throw new Error('Aucune rencontre du FC Escalquens n’est enregistrée à cette date.');

      const pages = [];
      for (let index = 0; index < matches.length; index += ROWS_PER_IMAGE) pages.push(matches.slice(index, index + ROWS_PER_IMAGE));
      for (let index = 0; index < pages.length; index += 1) {
        const figure = document.createElement('figure');figure.className = 'visual-preview';
        const canvas = document.createElement('canvas');canvas.width = 1080;canvas.height = 1350;
        const caption = document.createElement('figcaption');
        const label = document.createElement('span');label.textContent = pages.length > 1 ? `Visuel ${index + 1} sur ${pages.length}` : `${matches.length} rencontre${matches.length > 1 ? 's' : ''}`;
        const button = document.createElement('button');button.type = 'button';button.className = 'visual-download';button.textContent = 'Télécharger le PNG';
        button.addEventListener('click', () => downloadCanvas(canvas, `${selectedDate}-matchs-fce-${index + 1}.png`));
        caption.append(label, button);figure.append(canvas, caption);previews.append(figure);
        await drawVisual(canvas, pages[index], selectedDate, index, pages.length, participantsByMatch);
      }
      status.textContent = `${matches.length} rencontre${matches.length > 1 ? 's' : ''} trouvée${matches.length > 1 ? 's' : ''}. Format 1080 × 1350 px, prêt pour Instagram et Facebook.`;
    } catch (error) {
      status.dataset.state = 'error';status.textContent = error instanceof Error ? error.message : 'Impossible de générer le visuel.';
    } finally {submit.disabled = false;}
  });

  dateInput.value = nextSaturday();
})();
