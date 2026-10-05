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

import {normalizeEpreuves,normalizeEpreuvesFal} from './fff-normalize.mjs';
import {parisDay} from './fff-periods.mjs';

export function assertCollection(payloads, rows, reference) {
  if (payloads.matchMonths !== 12 || payloads.falMonths !== 12 || payloads.failedMonthly?.length) throw new Error('Collecte saison incomplète : 24 sous-requêtes mensuelles requises');
  if(!Array.isArray(payloads.daily)||payloads.daily.length!==10||new Set(payloads.daily.map(entry=>entry.day)).size!==10)throw new Error('Contrôle journalier incomplet : 10 jours requis');
  for(const entry of payloads.daily){
    if(!Array.isArray(entry.matches?.['hydra:member'])||entry.matches['hydra:totalItems']!==entry.matches['hydra:member'].length||!Array.isArray(entry.fal?.sites)||!Array.isArray(entry.fal?.sitesWithoutDate))throw new Error(`Référence journalière invalide ${entry.day}`);
    const expected=[...normalizeEpreuves(entry.matches['hydra:member']),...normalizeEpreuvesFal(entry.fal)].filter(row=>parisDay(new Date(row.starts_at))===entry.day);
    const actual=rows.filter(row=>parisDay(new Date(row.starts_at))===entry.day);
    const keys=value=>value.map(row=>`${row.source}/${row.source_id}`).sort();
    if(JSON.stringify(keys(expected))!==JSON.stringify(keys(actual)))throw new Error(`Écart avec le calendrier FFF du ${entry.day}`);
    const fields=['starts_at','home_team','away_team','status','home_score','away_score'];
    for(const row of expected){
      const imported=actual.find(item=>item.source===row.source&&item.source_id===row.source_id);
      if(fields.some(field=>(row[field]??null)!==(imported[field]??null)))throw new Error(`Données FFF divergentes ${row.source}/${row.source_id}`);
    }
  }
  const ids = new Set(rows.map(row => `${row.source}/${row.source_id}`));
  if (ids.size !== rows.length) throw new Error('Identifiants normalisés dupliqués');
  if (!reference || (!reference.matchIds.length && !reference.plateauIds.length)) throw new Error('Référence de la page FFF absente : impossible de certifier la collecte');
  const missing = [...reference.matchIds.map(id => `fff/${id}`), ...reference.plateauIds.map(id => `district_fal/${id}`)].filter(id => !ids.has(id));
  if (missing.length) throw new Error(`Événements visibles sur la page FFF absents de la collecte : ${missing.join(', ')}`);
  for (const row of rows) if (!row.source_id || !row.starts_at || !Number.isFinite(Date.parse(row.starts_at)) || !row.home_team || !row.away_team) throw new Error(`Rencontre invalide ${row.source}/${row.source_id}`);
}

export function assertStandings(payloads){
  const meta=payloads.standingsMeta;
  if(!payloads.standingsMetaPresent||meta?.error||!meta?.detected||meta.parsed!==meta.detected||!Array.isArray(payloads.standings)||!payloads.standings.length)throw new Error('Classements FFF incomplets ou non vérifiés');
  const groups=new Map();
  for(const row of payloads.standings){
    if(row?.source!=='fff'||!row.phase_id||!row.team_name||!Number.isInteger(row.position)||row.position<1)throw new Error('Ligne de classement invalide');
    const key=String(row.phase_id);if(!groups.has(key))groups.set(key,new Set());
    if(groups.get(key).has(row.position))throw new Error(`Rang dupliqué dans le classement ${key}`);
    groups.get(key).add(row.position);
  }
  for(const [phase,positions] of groups){
    if([...positions].some(position=>position>positions.size))throw new Error(`Classement ${phase} tronqué : rangs non consécutifs`);
  }
}
