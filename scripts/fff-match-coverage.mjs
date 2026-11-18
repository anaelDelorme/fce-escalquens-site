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
export async function browserCollectCalendarFallback(initialState, seasonYear, clubNo, fetchTeamCalendars) {
  const stateEntries = state => (Array.isArray(state) ? state : [state])
    .flatMap(root => Object.entries(root || {}));
  const matchCollections = state => stateEntries(state)
    .filter(([key, value]) => /\/api\/(?:data\/)?matches\?/.test(key) && value?.status === 200
      && Array.isArray(value.body?.['hydra:member']))
    .map(([, value]) => value.body);
  const collections = matchCollections(initialState);
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
  const ordered = [...calendars].sort((a, b) => Number(!a.includes('F_')) - Number(!b.includes('F_')));
  const pending = ordered.slice(0, 16).values();
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
        collections.push(...captured);
        results.push({id, status: response.status, collections: captured.length});
      } catch {
        results.push({id, status: 0, collections: 0});
      }
    }
  }));
  return {collections, results};
}
