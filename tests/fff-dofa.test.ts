import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dofaMatchCollections, fetchDofaPages, fetchDofaPools, fetchDofaSeason } from '../scripts/fff-dofa.mjs';
import { mergeMatchPayloads, normalizeEpreuves } from '../scripts/sync-matches.mjs';

const scope = { clubNo: '101544', clubCode: '550350', seasonYear: 2026 };
const team = '2026_101544_U15F_5';
const home = { id: team, short_name: 'Escalquens', code: 1, club: { cl_no: 101544 } };
const away = { short_name: 'Adversaire', club: { cl_no: 25 } };
const autumn = { ma_no: 79070701, home, away, date: '2026-09-19', time: '15h00',
  home_score: 0, away_score: 2, competition: { name: 'U15 Territoire F' } };
const spring = { ...autumn, ma_no: 999001, home: {...home, id: undefined}, date: '2027-05-29T00:00:00+02:00',
  time: '14H30', home_score: null, away_score: null, competition: { name: 'U15 Fem R1' } };
const collection = (rows: unknown[], total = rows.length, next?: string) => Response.json({
  'hydra:member': rows, 'hydra:totalItems': total, 'hydra:view': {'hydra:next': next}
});

test('DOFA : les pages du club rapprochent septembre et mai pour la même équipe U15F', async () => {
  const pages: URL[] = [];
  const result = await fetchDofaSeason(scope, async (href: string) => {
    const url = new URL(href);
    pages.push(url);
    assert.equal(url.pathname, '/api/clubs/101544/matchs');
    assert.equal(url.searchParams.get('ma_dat[after]'), '2026-07-01');
    assert.equal(url.searchParams.get('ma_dat[before]'), '2027-06-30');
    return url.searchParams.get('page') === '1'
      ? collection([autumn], 2, '?page=2')
      : collection([spring], 2);
  });
  assert.equal(pages.length, 2);
  assert.equal(result.complete, true);
  const reference = normalizeEpreuves(dofaMatchCollections([autumn], scope)['hydra:member']);
  const additions = dofaMatchCollections(result.rows, scope, reference);
  const rows = normalizeEpreuves(mergeMatchPayloads([additions, dofaMatchCollections([autumn], scope)])['hydra:member']);
  assert.deepEqual(rows.map(row => [row.source_id, row.category, row.team_fff_id, row.starts_at, row.status, row.home_score, row.away_score]), [
    ['79070701', 'U15F', team, '2026-09-19T15:00:00+02:00', 'finished', 0, 2],
    ['999001', 'U15F', team, '2027-05-29T14:30:00+02:00', 'scheduled', null, null]
  ]);
});

test('DOFA : une page incomplète, un changement de route ou une boucle ne prouvent aucune couverture', async () => {
  const url = 'https://api-dofa.fff.fr/api/clubs/101544/matchs?page=1';
  await assert.rejects(fetchDofaPages(url, async () => collection([autumn], 2)), /tronquée/);
  await assert.rejects(fetchDofaPages(url, async () => collection([autumn], 2, '/api/clubs/2/matchs?page=2')), /hors périmètre/);
  await assert.rejects(fetchDofaPages(url, async () => collection([autumn], 2, '?page=1')), /hors périmètre/);
});

test('DOFA : le calendrier d’une nouvelle phase complète la liste et écarte les autres clubs et saisons', async () => {
  const paths = [
    '/competition/engagement/17-u15f/phase/1/3/resultats-et-calendrier',
    '/competition/engagement/17-u15f/phase/2/4/resultats-et-calendrier'
  ];
  const attempted: string[] = [];
  const result = await fetchDofaPools(scope.clubNo, paths, async (href: string) => {
    const url = new URL(href);
    assert.equal(url.searchParams.get('clNo'), scope.clubNo);
    attempted.push(url.pathname);
    return url.pathname.includes('/phases/2/')
      ? collection([spring, {...spring, ma_no: 3, home: away}, {...spring, ma_no: 4, date: '2027-07-01'}])
      : collection([autumn]);
  });
  assert.equal(result.answered, 2);
  assert.equal(attempted.length, 2);
  const rows = normalizeEpreuves(dofaMatchCollections(result.rows, scope)['hydra:member']);
  assert.deepEqual(rows.map(row => row.source_id), ['79070701', '999001']);
});
