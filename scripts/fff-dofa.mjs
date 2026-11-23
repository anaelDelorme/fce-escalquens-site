const origins = ['https://api-dofa.fff.fr', 'https://api-dofa.prd-aws.fff.fr'];

const numericId = value => String(value ?? '').match(/^\d+$|(?<=\/)\d+$/)?.[0] || '';
const matchId = row => numericId(row?.ma_no ?? row?.id ?? row?.['@id']);
const parisOffset = new Intl.DateTimeFormat('en', {timeZone: 'Europe/Paris', timeZoneName: 'longOffset'});
const label = value => typeof value === 'string' ? value : value?.name || value?.label || value?.short_name || '';

export async function fetchDofaPages(url, request, maxPages = 60) {
  const first = new URL(url);
  const visited = new Set();
  const matches = new Map();
  let expected;
  let next = first;
  while (next) {
    if (next.origin !== first.origin || next.pathname !== first.pathname || visited.has(next.href) || visited.size >= maxPages) {
      throw new Error('Pagination DOFA hors périmètre ou incomplète');
    }
    visited.add(next.href);
    const response = await request(next.href);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const rows = payload?.['hydra:member'] ?? payload?.member;
    if (!Array.isArray(rows)) throw new Error('collection DOFA invalide');
    const total = payload['hydra:totalItems'] ?? payload.totalItems;
    if (Number.isSafeInteger(total)) {
      if (expected !== undefined && total !== expected) throw new Error('total DOFA modifié pendant la pagination');
      expected = total;
    }
    const previousCount = matches.size;
    for (const row of rows) {
      const id = matchId(row);
      if (!id) throw new Error('match DOFA sans identifiant');
      matches.set(id, row);
    }
    const link = (payload['hydra:view'] ?? payload.view)?.['hydra:next'] ?? payload.view?.next;
    next = link ? new URL(link, next) : null;
    if (next) {
      if (matches.size === previousCount) throw new Error('pagination DOFA sans progression');
      // Certains liens Hydra ne répètent que le numéro de page.
      for (const [key, value] of first.searchParams) {
        if (key !== 'page' && !next.searchParams.has(key)) next.searchParams.set(key, value);
      }
    }
  }
  if (expected !== undefined && matches.size !== expected) throw new Error('collection DOFA tronquée');
  return [...matches.values()];
}

function clubSide(side, clubNo, clubCode) {
  const club = side?.club;
  const id = numericId(club?.cl_no ?? club?.clNo ?? club?.id ?? club?.['@id'] ?? club);
  const affiliation = String(club?.cl_cod ?? club?.code ?? club?.number ?? '');
  return id === clubNo || affiliation === clubCode
    || (!id && !affiliation && /\bESCALQUENS\b/i.test([side?.short_name, side?.name, label(club)].join(' ')));
}

function categoryCode(value) {
  const words = label(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
  const age = words.match(/\bU\s?(\d{1,2})(F)?\b/);
  const female = /\b(?:F|FEM[A-Z]*)\b/.test(words);
  if (age) return `U${age[1]}${age[2] || female ? 'F' : ''}`;
  if (/\b(?:SEM|SEF)\b/.test(words)) return words.match(/\b(?:SEM|SEF)\b/)[0];
  if (/\bSENIORS?\b/.test(words)) return female ? 'SEF' : 'SEM';
  return '';
}

function teamNumber(side) {
  const explicit = side?.team_number ?? side?.number ?? side?.eq_cod;
  if (/^\d+$/.test(String(explicit ?? ''))) return String(explicit);
  if (/^\d+$/.test(String(side?.code ?? ''))) return String(Number(side.code) % 10 || '');
  return '';
}

function kickoff(date, time) {
  const value = String(date || '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const clock = String(time || '').match(/^([01]?\d|2[0-3])[:h]([0-5]\d)(?::[0-5]\d)?$/i);
  if (clock) {
    const day = value.slice(0, 10);
    const noon = new Date(day + 'T12:00:00Z');
    if (!Number.isFinite(noon.getTime())) return null;
    const offset = parisOffset.formatToParts(noon).find(part => part.type === 'timeZoneName')?.value.slice(3);
    return {date: `${day}T${clock[1].padStart(2, '0')}:${clock[2]}:00${offset || ''}`, confirmed: true};
  }
  const hasTime = /T(?!00:00)\d{2}:\d{2}/.test(value);
  return {date: hasTime ? value : value.slice(0, 10) + 'T12:00:00', confirmed: hasTime};
}

export function dofaMatchCollections(rows, {clubNo, clubCode, seasonYear}, referenceRows = []) {
  const references = new Map();
  const byCategoryAndNumber = new Map();
  for (const row of referenceRows) {
    references.set(String(row.source_id), row);
    if (!row.team_fff_id || !row.official_team?.team_number) continue;
    const code = row.team_fff_id.split('_')[2];
    const key = code + '/' + row.official_team.team_number;
    if (!byCategoryAndNumber.has(key)) byCategoryAndNumber.set(key, new Set());
    byCategoryAndNumber.get(key).add(row.team_fff_id);
  }
  const members = [];
  for (const item of rows) {
    const id = matchId(item);
    const home = item.home;
    const away = item.away;
    const homeClub = clubSide(home, clubNo, clubCode);
    const awayClub = clubSide(away, clubNo, clubCode);
    const reference = references.get(id);
    if (!id || homeClub === awayClub || !label(home) || !label(away)) continue;
    const status = String(item.status_label || '');
    const postponed = /report|remis/i.test(status) || item.seems_postponed === true;
    const cancelled = /annul|supprim/i.test(status);
    const usingInitialDate = !item.date;
    const start = kickoff(item.date || item.initial_date, usingInitialDate ? null : item.time);
    if (start && !Number.isFinite(Date.parse(start.date))) continue;
    if (!start || start.date < `${seasonYear}-07-01` || start.date >= `${seasonYear+1}-07-01`) continue;
    const side = homeClub ? home : away;
    const competition = item.competition ?? item.compet ?? item.poule?.competition ?? item.poule?.compet;
    const explicitId = [side.id, side.eq_id, side.equipe?.id].find(value =>
      typeof value === 'string' && new RegExp(`^${seasonYear}_${clubNo}_[A-Z0-9]+_\\d+$`).test(value));
    const category = explicitId?.split('_')[2] || reference?.team_fff_id?.split('_')[2]
      || categoryCode(side.category) || categoryCode(competition) || categoryCode(item.category);
    const number = teamNumber(side);
    const candidates = byCategoryAndNumber.get(category + '/' + number);
    const teamId = explicitId || reference?.team_fff_id || (candidates?.size === 1 ? [...candidates][0] : '');
    const score = value => /^\d+$/.test(String(value ?? '')) ? Number(value) : null;
    const homeScore = score(item.home_score), awayScore = score(item.away_score);
    const sideData = (team, isClub, goals) => ({
      club: {clNo: isClub ? clubNo : numericId(team.club?.cl_no ?? team.club?.id ?? team.club?.['@id']),
        nom: label(team), logo: team.club?.logo || team.logo},
      equipe: {id: isClub ? teamId : '', eqCod: teamNumber(team)},
      buts: goals
    });
    const terrain = item.terrain;
    members.push({
      donneesFormatees: {
        maNo: id, date: start.date, heureCommuniquee: start.confirmed,
        recevant: sideData(home, homeClub, homeScore), visiteur: sideData(away, awayClub, awayScore),
        joue: !postponed && !cancelled && homeScore !== null && awayScore !== null,
        maStatutLib: postponed || (usingInitialDate && !cancelled) ? 'Reporté' : status,
        competition: {nom: label(competition) || reference?.official_team?.competition_name, lcLib: category},
        groupe: {nom: label(item.poule) || reference?.official_team?.pool},
        terrain: terrain ? {nom: label(terrain), adresse: [label(terrain.address), terrain.zip_code, label(terrain.city)].filter(Boolean).join(' '),
          latitude: terrain.latitude, longitude: terrain.longitude} : undefined
      },
      cachedAt: item.updated_at || item.modified_at,
      dofa: item
    });
  }
  return {'hydra:member': members};
}

async function tryDofaPath(path, query, request, errors) {
  for (const origin of origins) {
    try {
      const rows = await fetchDofaPages(origin + path + '?' + query, request);
      if (rows.length) return rows;
      errors.push(`${new URL(origin).hostname}${path}: réponse vide`);
    } catch (error) {
      errors.push(`${new URL(origin).hostname}${path}: ${error.message}`);
    }
  }
  return [];
}

export async function fetchDofaSeason({clubNo, seasonYear}, request) {
  const seasonQuery = new URLSearchParams({
    'ma_dat[after]': `${seasonYear}-07-01`, 'ma_dat[before]': `${seasonYear+1}-06-30`, page: '1'
  });
  const club = '/api/clubs/' + clubNo;
  const errors = [];
  const clubMatches = await tryDofaPath(club + '/matchs', seasonQuery, request, errors);
  if (clubMatches.length) return {rows: clubMatches, origin: 'club /matchs', complete: true, errors};
  const [schedule, results] = await Promise.all([
    tryDofaPath(club + '/calendrier', seasonQuery, request, errors),
    tryDofaPath(club + '/resultat', seasonQuery, request, errors)
  ]);
  return {
    rows: [...new Map([...schedule, ...results].map(row => [matchId(row), row])).values()],
    origin: 'club /calendrier et /resultat', complete: false, errors
  };
}

export async function fetchDofaPools(clubNo, poolPaths, request) {
  const pools = [...new Set(poolPaths.flatMap(path => {
    const match = String(path).match(/\/engagement\/(\d+)(?:-[^/]+)?\/phase\/(\d+)\/(\d+)(?:\/|$)/);
    return match ? [`/api/compets/${match[1]}/phases/${match[2]}/poules/${match[3]}/matchs`] : [];
  }))];
  const attempted = [];
  const query = new URLSearchParams({clNo: clubNo, page: '1'});
  if (pools.length) {
    const errors = [];
    const rows = await tryDofaPath(pools[0], query, request, errors);
    attempted.push({rows, errors});
    // Un refus sur le même hôte et la même ressource ne justifie pas
    // une rafale de requêtes vers toutes les autres poules.
    if (errors.length && errors.every(error => error.endsWith('HTTP 403'))) {
      return {rows, errors, targeted: pools.length, answered: 0};
    }
  }
  const pending = pools.slice(1).values();
  await Promise.all(Array.from({length: Math.min(4, pools.length)}, async () => {
    for (const path of pending) {
      const errors = [];
      const rows = await tryDofaPath(path, query, request, errors);
      attempted.push({rows, errors});
    }
  }));
  const rows = [...new Map(attempted.flatMap(result => result.rows).map(row => [matchId(row), row])).values()];
  return {rows, errors: attempted.flatMap(result => result.errors), targeted: pools.length,
    answered: attempted.filter(result => result.rows.length > 0).length};
}
