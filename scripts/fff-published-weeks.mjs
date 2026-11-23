// La FFF ne précharge que la semaine sélectionnée. Les autres collections
// proviennent des requêtes déclenchées par ses boutons de navigation publics.
export async function browserCollectPublishedWeeks(clubNo, maxDuration = 55000) {
  const collections = [], expectedWeeks = [], verifiedWeeks = [], failures = [];
  const result = {collections, expectedWeeks, verifiedWeeks, failures};
  const pool = location.pathname.match(/\/engagement\/(\d+)(?:-[\w-]+)?\/phase\/(\d+)\/(\d+)\/resultats-et-calendrier\/?$/);
  if (!pool) {
    failures.push('Page de poule non reconnue.');
    return result;
  }
  const [, competition, phase, group] = pool;
  let state;
  try { state = JSON.parse(document.querySelector('#ng-state')?.textContent || 'null'); } catch {}
  const entries = (Array.isArray(state) ? state : [state]).flatMap(root => Object.entries(root || {}));
  const weeksPath = '/api/data/competitions/' + competition + '/semaines';
  const weekData = entries.find(([key, entry]) =>
    key.split('|').some(part => part.split('?')[0] === weeksPath) && Number(entry?.status) === 200)?.[1]?.body;
  const rows = weekData?.['hydra:member'];
  if (!Array.isArray(rows) || weekData['hydra:totalItems'] !== rows.length || weekData['hydra:view']?.['hydra:next']) {
    failures.push('Liste officielle des semaines absente ou incomplète.');
    return result;
  }

  const dates = new Map();
  for (const row of rows) {
    const days = [...new Set(JSON.stringify(row).match(/20\d\d-\d\d-\d\d/g) || [])].sort();
    const [start, end] = days;
    if (days.length !== 2 || Date.parse(end) - Date.parse(start) !== 6 * 86400000 || dates.has(start)) {
      failures.push('Semaine officielle non reconnue.');
      return result;
    }
    dates.set(start, end);
  }
  expectedWeeks.push(...[...dates.keys()].sort());
  if (expectedWeeks.length === 0) return result;

  const matchPath = '/api/data/matches';
  const matchWeek = resource => {
    try {
      const url = new URL(resource?.url || resource, location.origin);
      const params = url.searchParams;
      const start = params.get('dateDebut')?.slice(0, 10);
      if (url.origin !== location.origin || url.pathname !== matchPath
        || ![['cpNo', competition], ['phNo', phase], ['gpNo', group]].every(([key, value]) =>
          params.getAll(key).length === 1 && params.get(key) === value)
        || params.getAll('dateDebut').length !== 1 || params.getAll('dateFin').length !== 1
        || !start || dates.get(start) !== params.get('dateFin')?.slice(0, 10)
        || ![null, '1'].includes(params.get('page'))) return null;
      return start;
    } catch { return null; }
  };
  const verify = (week, payload) => {
    const members = payload?.['hydra:member'];
    if (!Array.isArray(members) || payload['hydra:totalItems'] !== members.length || payload['hydra:view']?.['hydra:next']) return false;
    const ids = new Set(), own = [];
    for (const wrapper of members) {
      const match = wrapper?.donneesFormatees || wrapper;
      const id = String(match?.maNo || wrapper?.id || '');
      const day = String(match?.date || '').slice(0, 10);
      if (!/^\d+$/.test(id) || ids.has(id) || (day && (day < week || day > dates.get(week)))) return false;
      ids.add(id);
      if ([match?.recevant, match?.visiteur].some(side =>
        String(side?.club?.clNo) === String(clubNo) || side?.equipe?.id?.split('_')[1] === String(clubNo))) own.push(wrapper);
    }
    if (!verifiedWeeks.includes(week)) {
      verifiedWeeks.push(week);
      if (own.length) collections.push({'hydra:member': own});
    }
    return true;
  };

  let current = -1;
  for (const [key, entry] of entries) {
    const request = key.split('|').find(part => part.startsWith(matchPath + '?'));
    const week = request && matchWeek(request);
    if (week) {
      if (Number(entry?.status) === 200) verify(week, entry.body);
      current = expectedWeeks.indexOf(week);
    }
  }
  if (current === -1) {
    failures.push('Semaine initiale absente de la page publique.');
    return result;
  }

  const deadline = Date.now() + maxDuration;
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const targets = new WeakMap();
  let receive = () => {};
  window.fetch = async function(resource, options) {
    const response = await originalFetch.call(this, resource, options);
    const week = matchWeek(resource);
    if (week) {
      const onResponse = receive;
      if (!response.ok) onResponse(week, response.status);
      else response.clone().json().then(body => onResponse(week, response.status, body), () => onResponse(week, response.status));
    }
    return response;
  };
  XMLHttpRequest.prototype.open = function(method, resource, ...args) {
    const week = matchWeek(resource);
    if (week) targets.set(this, week);
    else targets.delete(this);
    return originalOpen.call(this, method, resource, ...args);
  };
  XMLHttpRequest.prototype.send = function(...args) {
    const week = targets.get(this);
    if (week) {
      const onResponse = receive;
      this.addEventListener('loadend', () => {
        let body;
        try { body = this.responseType === 'json' ? this.response : JSON.parse(this.responseText); } catch {}
        onResponse(week, this.status, body);
      }, {once: true});
    }
    return originalSend.apply(this, args);
  };

  const move = async direction => {
    const week = expectedWeeks[current + direction];
    const expectedLabel = direction === 1 ? 'navigation suivante' : 'navigation précédente';
    const button = [...document.querySelectorAll('button, [role="button"]')].find(element =>
      [element.textContent, element.getAttribute('aria-label'), element.getAttribute('title')].some(value =>
        String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('fr') === expectedLabel)
      && !element.disabled && element.getAttribute('aria-disabled') !== 'true');
    if (!button) {
      failures.push(week + ' : navigation indisponible.');
      return false;
    }
    const remaining = Math.min(4500, deadline - Date.now());
    if (remaining <= 0) {
      failures.push(week + ' : budget de temps épuisé.');
      return false;
    }
    const response = await new Promise(resolve => {
      const timeout = setTimeout(() => resolve(null), remaining);
      receive = (receivedWeek, status, body) => {
        if (receivedWeek !== week) return;
        clearTimeout(timeout);
        resolve({status, body});
      };
      button.click();
    });
    receive = () => {};
    if (!response || response.status !== 200 || !verify(week, response.body)) {
      failures.push(week + (response ? response.status === 200 ? ' : collection incomplète.' : ' : HTTP ' + response.status + '.'
        : ' : aucune réponse de la navigation.'));
      return false;
    }
    current += direction;
    await new Promise(resolve => setTimeout(resolve, 50));
    return true;
  };

  try {
    // Parcourir d'abord l'extrémité la plus proche limite les allers-retours.
    const last = expectedWeeks.length - 1;
    const closest = current <= last - current ? 0 : last;
    for (const target of [closest, last - closest]) {
      while (current !== target && verifiedWeeks.length < expectedWeeks.length) {
        if (!await move(Math.sign(target - current))) return result;
      }
    }
  } finally {
    window.fetch = originalFetch;
    XMLHttpRequest.prototype.open = originalOpen;
    XMLHttpRequest.prototype.send = originalSend;
    verifiedWeeks.sort();
  }
  return result;
}
