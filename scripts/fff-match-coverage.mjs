// Self-contained: serialized into the authenticated ZenRows browser session.
export async function fetchCompleteMatches(url, request, maxPages = 50) {
  const members = new Map(), visited = new Set();
  let next = url, expected = null;
  while (next) {
    const target = new URL(next, url);
    if (target.origin !== new URL(url).origin || !target.pathname.startsWith('/api/data/matches')) throw new Error('Pagination FFF hors périmètre');
    if (visited.has(target.href) || visited.size >= maxPages) throw new Error('Pagination FFF cyclique ou trop longue');
    visited.add(target.href);
    const before=members.size;
    const response = await request(target.href);
    if (!response.ok) throw new Error(`Pagination FFF HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload['hydra:member']) || !Number.isInteger(payload['hydra:totalItems']) || payload['hydra:totalItems'] < 0) throw new Error('Collection FFF invalide ou total absent');
    if (expected !== null && expected !== payload['hydra:totalItems']) throw new Error('Total FFF modifié pendant la pagination');
    expected = payload['hydra:totalItems'];
    for (const row of payload['hydra:member']) {
      const id = String(row?.donneesFormatees?.maNo || row?.maNo || row?.id || row?.['@id'] || '');
      if (!id) throw new Error('Match FFF sans identifiant');
      members.set(id, row);
    }
    if(members.size===before&&members.size<expected)throw new Error('Pagination FFF sans nouveaux identifiants');
    next = payload['hydra:view']?.['hydra:next'] || null;
    if (!next && members.size < expected) {
      if (!payload['hydra:member'].length) throw new Error('Page FFF vide avant le total annoncé');
      const fallback = new URL(url);
      fallback.searchParams.set('page', String(visited.size + 1));
      next = fallback.href;
    }
  }
  if (members.size !== expected) throw new Error(`FFF annonce ${expected} matchs, ${members.size} identifiants uniques reçus`);
  return { 'hydra:totalItems': expected, 'hydra:member': [...members.values()] };
}

export function isCompleteMatchCollection(payload) {
  const rows = payload?.['hydra:member'];
  if (!Array.isArray(rows) || payload['hydra:totalItems'] !== rows.length || payload['hydra:view']?.['hydra:next']) return false;
  const ids = rows.map(row => String(row?.donneesFormatees?.maNo || row?.maNo || row?.id || row?.['@id'] || ''));
  return ids.every(Boolean) && new Set(ids).size === rows.length;
}

// Serialized into the browser session. SSR responses supply positive evidence
// even when requests to the competition API fail inside that session.
export async function browserCollectCalendarFallback(initialState, seasonYear, clubNo, fetchTeamCalendars, knownTeams = []) {
  const stateEntries = state => (Array.isArray(state) ? state : [state])
    .flatMap(root => Object.entries(root || {}));
  const matchCollections = state => stateEntries(state)
    .filter(([key, value]) => /\/api\/(?:data\/)?matches\?/.test(key) && value?.status === 200
      && Array.isArray(value.body?.['hydra:member']))
    .map(([key, value]) => ({key, body: value.body}));
  const collections = matchCollections(initialState).map(entry => entry.body);
  if (!fetchTeamCalendars) return {collections, results: []};
  const calendars = new Set();
  const teamIdPattern = new RegExp('^' + seasonYear + '_' + clubNo + '_[A-Z0-9]+_\\d+$');
  const addTeam = id => {
    if (teamIdPattern.test(id)) calendars.add(id);
  };

  // This published team calendar is a known fallback for the 2026 season.
  addTeam('2026_101544_U15F_5');
  for (const link of document.querySelectorAll('a[href*="/equipe/"]')) {
    addTeam(link.getAttribute('href')?.match(/\/equipe\/([^/?#]+)/)?.[1]);
  }
  for (const [key, value] of stateEntries(initialState)) {
    if (!key.includes('/api/') || !value?.body) continue;
    const teamIds = JSON.stringify(value.body).matchAll(new RegExp('\\b' + seasonYear + '_' + clubNo + '_[A-Z0-9]+_\\d+\\b', 'g'));
    for (const [id] of teamIds) addTeam(id);
  }
  knownTeams.forEach(addTeam);
  const ordered = [...calendars].sort((a, b) => Number(!a.includes('F_')) - Number(!b.includes('F_')));
  const pending = ordered.values();
  const results = [];
  await Promise.all(Array.from({length: Math.min(4, ordered.length)}, async () => {
    for (const id of pending) {
      try {
        const url = location.pathname.replace(/\/club\/?$/, '') + '/equipe/' + id + '/resultat-calendrier';
        const response = await fetch(url, {headers: {Accept: 'text/html'}, credentials: 'include', signal: AbortSignal.timeout(8000)});
        if (!response.ok) {
          results.push({id, status: response.status, collections: 0});
          continue;
        }
        const stateText = (await response.text()).match(/<script[^>]+id=["']ng-state["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
        const captured = stateText ? matchCollections(JSON.parse(stateText)) : [];
        collections.push(...captured.map(entry => entry.body));
        const coverage = captured.map(({key, body}) => {
          const params = new URLSearchParams(key.slice(key.indexOf('?') + 1).split('|')[0]);
          const ownMatches = body['hydra:member'].flatMap(wrapper => {
            const match = wrapper?.donneesFormatees || wrapper;
            const sides = [match?.recevant, match?.visiteur];
            if (!sides.some(side => side?.equipe?.id === id)) return [];
            const matchId = String(match.maNo || wrapper.id || '');
            const day = String(match.date || '').slice(0, 10);
            return /^\d+$/.test(matchId) && /^\d{4}-\d{2}-\d{2}$/.test(day)
              ? [{matchId, day}] : [];
          }).sort((a, b) => a.day.localeCompare(b.day));
          const start = params.get('dateDebut') || '';
          const end = params.get('dateFin') || '';
          const dateBound = value => /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && Number.isFinite(Date.parse(value));
          const ids = [...new Set(ownMatches.map(match => match.matchId))];
          const starts_on = start.slice(0, 10), ends_before = end.slice(0, 10);
          const verified = params.getAll('idEquipe').length === 1 && params.get('idEquipe') === id
            && params.getAll('dateDebut').length === 1 && params.getAll('dateFin').length === 1
            && [...params.keys()].every(name => ['idEquipe','dateDebut','dateFin','itemsPerPage','pagination','page'].includes(name))
            && ['1', null].includes(params.get('page'))
            && dateBound(start) && dateBound(end) && starts_on < ends_before
            && ids.length > 0 && ids.length === body['hydra:member'].length && ids.length === body['hydra:totalItems']
            && !body['hydra:view']?.['hydra:next']
            && ownMatches.every(match => match.day >= starts_on && match.day <= ends_before);
          return {
            window: verified ? {starts_on, ends_before, ids} : undefined,
            rows: body['hydra:member'].length,
            total: Number.isSafeInteger(body['hydra:totalItems']) ? body['hydra:totalItems'] : null,
            next: Boolean(body['hydra:view']?.['hydra:next']),
            filters: [...new Set([...params.keys()])].filter(name => /^[a-z0-9_]+$/i.test(name)),
            first: ownMatches[0]?.day,
            last: ownMatches.at(-1)?.day,
            count: new Set(ownMatches.map(match => match.matchId)).size,
            weekendMatches: id.includes('_U18F_')
              ? ownMatches.filter(match => ['2026-11-07','2026-11-08','2026-11-14','2026-11-15'].includes(match.day))
              : undefined
          };
        });
        results.push({id, status: response.status, collections: captured.length, coverage});
      } catch {
        results.push({id, status: 0, collections: 0});
      }
    }
  }));
  return {collections, results, teamIds: [...calendars]};
}

// Sérialisé dans une session dédiée pour éviter la limite de la collecte principale.
export async function browserCollectTeamMonths(targets, fetchComplete) {
  let state = [];
  try { state = JSON.parse(document.querySelector('#ng-state')?.textContent || '[]'); } catch {}
  const entries = (Array.isArray(state) ? state : [state]).flatMap(root => Object.entries(root || {}));
  const token = entries.find(([key]) => key === 'VLJAXE')?.[1]
    || entries.find(([key, value]) => key.includes('/api/app-security-token/') && value?.body?.token)?.[1]?.body?.token;
  const pending = targets.values();
  const results = [];
  await Promise.all(Array.from({ length: Math.min(4, targets.length) }, async () => {
    for (const { team, month, url } of pending) {
      try {
        if (!token) throw new Error('contexte FFF indisponible');
        const payload = await fetchComplete(url, target => fetch(target, {
          credentials: 'include', signal: AbortSignal.timeout(6000),
          headers: { Accept: 'application/json', 'X-Competition': String(token) }
        }));
        if (!payload['hydra:member'].length) throw new Error('collection FFF vide');
        const relevant = payload['hydra:member'].every(wrapper => {
          const row = wrapper?.donneesFormatees || wrapper;
          return String(row?.date || '').slice(0, 7) === month
            && [row?.recevant, row?.visiteur].some(side => side?.equipe?.id === team);
        });
        if (!relevant) throw new Error('réponse hors équipe ou hors mois');
        results.push({ team, month, payload });
      } catch (error) {
        results.push({ team, month, error: error?.message === 'collection FFF vide' || /^Pagination FFF HTTP [0-9]{3}$/.test(error?.message)
          ? error.message : 'réponse non vérifiée' });
      }
    }
  }));
  return results;
}

export function missingTeamMonthTargets(teamIds, periods, calendars, seasonYear, clubNo) {
  const pattern = new RegExp('^' + seasonYear + '_' + clubNo + '_[A-Z0-9]+_\\d+$');
  const teams = [...new Set(teamIds.filter(id => typeof id === 'string' && pattern.test(id)))].sort();
  const covered = new Set(calendars.flatMap(result => (result.coverage || []).flatMap(({window}) =>
    window ? [result.id + '/' + window.starts_on + '/' + window.ends_before] : [])));
  return periods.flatMap(({start,end}) => {
    const first = start.toISOString().slice(0,10), last = end.toISOString().slice(0,10);
    return teams.flatMap(team => {
      if (covered.has(team + '/' + first + '/' + last)) return [];
      const query = new URLSearchParams({ idEquipe: team, dateDebut: start.toISOString(),
        dateFin: end.toISOString(), itemsPerPage: '100', pagination: 'true' });
      return [{team, month:first.slice(0,7), url:'https://epreuves.fff.fr/api/data/matches?' + query}];
    });
  });
}

// Les calendriers de poule utilisent le rendu public de la FFF. Les lignes
// récupérées sont des ajouts et ne constituent pas une preuve de couverture.
export async function browserCollectCompetitionMatches(clubNo, knownCompetitions) {
  const paths = new Set();
  const addPath = raw => {
    const path = String(raw || '').match(/\/competition\/engagement\/[\w-]+\/phase\/\d+\/\d+/)?.[0];
    if (path) paths.add(path + '/resultats-et-calendrier');
  };
  for (const link of document.querySelectorAll('a[href*="/competition/engagement/"]')) {
    addPath(link.getAttribute('href'));
  }
  const stateText = document.querySelector('#ng-state')?.textContent || '';
  for (const path of stateText.matchAll(/\/competition\/engagement\/[\w-]+\/phase\/\d+\/\d+/g)) addPath(path[0]);
  knownCompetitions.forEach(addPath);
  const pending = paths.values();
  const collections = [];
  let answered = 0;
  await Promise.all(Array.from({length: Math.min(6, paths.size)}, async () => {
    for (const path of pending) {
      try {
        const response = await fetch(path, {
          credentials: 'include', headers: {Accept: 'text/html'}, signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) continue;
        const html = await response.text();
        const raw = html.match(/<script[^>]+id=["']ng-state["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
        if (!raw) continue;
        const state = JSON.parse(raw);
        answered++;
        for (const root of Array.isArray(state) ? state : [state]) {
          for (const [key, value] of Object.entries(root || {})) {
            if (!/\/api\/(?:data\/)?matches\?/.test(key) || value?.status !== 200) continue;
            const members = value.body?.['hydra:member'];
            if (!Array.isArray(members)) continue;
            const own = members.filter(wrapper => {
              const match = wrapper?.donneesFormatees || wrapper;
              return [match?.recevant, match?.visiteur].some(side =>
                String(side?.club?.clNo) === clubNo || side?.equipe?.id?.split('_')[1] === clubNo);
            });
            if (own.length) collections.push({'hydra:member': own});
          }
        }
      } catch {
        // Les autres poules restent exploitables.
      }
    }
  }));
  return {collections, targeted: paths.size, answered};
}
