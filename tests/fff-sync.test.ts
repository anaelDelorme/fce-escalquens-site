import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { browserCollectCalendarFallback, fetchCompleteMatches } from '../scripts/fff-match-coverage.mjs';
import { fetchZenRows, normalizeEpreuves, normalizeEpreuvesFal } from '../scripts/sync-matches.mjs';
import worker from '../src/worker';
import { TestDatabase } from './d1';

const date = '2026-11-15T14:00:00+01:00';
const match = {
  maNo: 100, date,
  recevant: { club: { clNo: 101544, nom: 'Escalquens' }, equipe: { id: '2026_101544_U15F_5', eqCod: 1 } },
  visiteur: { club: { clNo: 215, nom: 'Adversaire' } }
};
const collection = (rows: unknown[], total = rows.length) => ({ 'hydra:member': rows, 'hydra:totalItems': total });
const plateau = {
  epreuve: { epNo: 9833, caCod: 'U13', epNom: 'U13F Foot À 8' },
  equipes: [{ club: { clNo: 101544 }, eqNom: 'Escalquens Labege', eqCod: 1, caCod: 'U13' }],
  phNo: 12, poNo: 45609, joNo: 41646, siNo: 3, joDate: date
};

test('FFF : pagination intégrale, refus HTTP et pages tronquées', async () => {
  const endpoint = 'https://epreuves.fff.fr/api/data/matches?clNo=101544';
  const complete = await fetchCompleteMatches(endpoint, async url =>
    Response.json(collection([new URL(url).searchParams.has('page') ? { maNo: 101 } : match], 2)));
  assert.deepEqual(complete['hydra:member'].map(row => row.maNo), [100, 101]);
  await assert.rejects(fetchCompleteMatches(endpoint, async () => Response.json(collection([match], 2))), /sans nouveaux identifiants/);
  await assert.rejects(fetchCompleteMatches(endpoint, async () => new Response('', { status: 403 })), /HTTP 403/);
});

test('FFF : le calendrier U15F donne des matchs à importer malgré les refus mensuels', async t => {
  const calendarUrl = '/competition/club/550350-f-c-escalquens/equipe/2026_101544_U15F_5/resultat-calendrier';
  const evaluate = new Function('document', 'location', 'fetch', 'state', `
    return (${browserCollectCalendarFallback.toString()})(state, 2026, '101544', true);
  `);
  const request = t.mock.fn(async url => {
    assert.equal(url, calendarUrl);
    const state = [{
      'analog_GET|/api/data/matches?eqId=2026_101544_U15F_5': { status: 200, body: collection([match]) },
      'analog_GET|/api/data/matches?idEquipe=2026_101544_U15F_5&dateDebut=2026-11-01&dateFin=2026-11-30': { status: 200, body: collection([match]) }
    }];
    return new Response(`<script id="ng-state">${JSON.stringify(state)}</script>`);
  });
  const result = await evaluate({ querySelectorAll: () => [] }, { pathname: '/competition/club/550350-f-c-escalquens/club' }, request, []);
  assert.equal(request.mock.callCount(), 1);
  assert.deepEqual(result.results[0].coverage[0], {
    window: undefined, rows: 1, total: 1, next: false, filters: ['eqId'],
    first: '2026-11-15', last: '2026-11-15', count: 1, weekendMatches: undefined
  });
  assert.deepEqual(result.results[0].coverage[1].window, { starts_on: '2026-11-01', ends_before: '2026-11-30', ids: ['100'] });
  const [row] = normalizeEpreuves(result.collections.flatMap(payload => payload['hydra:member']));
  assert.equal(row.source_id, '100');
  assert.equal(row.team_fff_id, '2026_101544_U15F_5');
});

test('FFF : une session principale sans calendriers déclenche une collecte isolée', async t => {
  const originalKey = process.env.ZENROWS_API_KEY;
  process.env.ZENROWS_API_KEY = 'local-test';
  t.after(() => {
    if (originalKey === undefined) delete process.env.ZENROWS_API_KEY;
    else process.env.ZENROWS_API_KEY = originalKey;
  });
  const script = (id: string, status: number, body: unknown) =>
    `<script id="${id}">${JSON.stringify({ status, body })}</script>`;
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: URL) => {
    const instructions = JSON.parse(url.searchParams.get('js_instructions')!);
    const ready = instructions[3].wait_for;
    calls.push(ready);
    assert.doesNotThrow(() => new Function(instructions[2].evaluate));
    if (ready.includes('sync-done')) {
      return new Response(Array.from({ length: 12 }, (_, i) =>
        script('fce-matches-' + i, 403, {}) + script('fce-fal-' + i, 200, { sites: [] })
      ).join(''));
    }
    return new Response(script('fce-calendar-fallback', 200, {
      collections: [collection([match])],
      results: [{ id: '2026_101544_U15F_5', status: 200, collections: 1 }]
    }));
  });
  const result = await fetchZenRows({ matches: [], fal: [], seasonYear: 2026 });
  assert.deepEqual(calls, ['html[data-fce-sync-done="1"]', 'html[data-fce-calendars-done="1"]']);
  assert.equal(result.matchMonths, 0);
  assert.equal(result.falMonths, 12);
  assert.equal(result.monthlyMatches['hydra:totalItems'], 0);
  assert.deepEqual(normalizeEpreuves(result.matches['hydra:member']).map(row => row.source_id), ['100']);
});

test('FFF : l’épreuve 9833 garde son identifiant FAL et corrige sa catégorie', () => {
  const [row] = normalizeEpreuvesFal({ sitesWithoutDate: [plateau] },
    [{ payload: { site_key: '9833:41646:3', api_payloads: [] } }]);
  assert.equal(row.category, 'U13F');
  assert.equal(row.team_fff_id, 'FAL:9833:U13:1');
  assert.equal(row.starts_at, date);
  assert.equal(row.time_confirmed, false);
  assert.equal(row.plateau_games, undefined);
  assert.match(row.source_url, /poule\/45609\/journee\/41646\/site\/3/);
});

test('D1 : import partiel sans suppression, puis retrait des seuls matchs FFF absents du calendrier complet', async t => {
  const DB = new TestDatabase();
  t.after(() => DB.close());
  const migrations = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
    await DB.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  await DB.exec(`
    INSERT INTO teams(slug,name,category,group_name,gender) VALUES ('u13f-test','U12F-U13F (2014-2015)','Football','Féminines','female');
    INSERT INTO teams(slug,name,category,group_name,gender) VALUES ('u15f-test','U14F-U15F','Football','Féminines','female');
    INSERT INTO team_competitions(team_id,season_id,name,fff_team_id)
    SELECT id,1,'U18F n°2','2026_101544_U18F_12' FROM teams WHERE slug='fff-equipes-a-affecter';
    INSERT INTO matches(source,source_id,season_id,starts_at,home_team,away_team,status,home_score,away_score,manually_created,event_type)
    VALUES ('fff','201',1,'2026-11-14','Escalquens','Pyrénées','scheduled',NULL,NULL,0,'match'),
           ('fff','202',1,'2026-11-15','Escalquens','Roques','finished',0,0,0,'match'),
           ('fff','203',1,'2026-11-15','Escalquens','Manuel','scheduled',NULL,NULL,1,'match'),
           ('district_fal','ancien',1,'2026-11-15','Escalquens','Plateau','scheduled',NULL,NULL,0,'plateau'),
           ('fff','204',1,'2026-11-15','Escalquens','Équipe non couverte','scheduled',NULL,NULL,0,'match');
    UPDATE matches SET competition_team_id=(SELECT id FROM team_competitions WHERE fff_team_id='2026_101544_U18F_12')
    WHERE source='fff' AND source_id IN ('201','202','203');
  `);
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: { delete: async () => true } } });
  t.after(() => Reflect.deleteProperty(globalThis, 'caches'));
  const env = { DB, FCE_SYNC_TOKEN: 'test-sync' } as any;
  const ctx = { waitUntil() {} } as any;
  const [row] = normalizeEpreuves([match]);
  const [fal] = normalizeEpreuvesFal({ sites: [plateau] });
  const u18 = { ...row, source_id: '200', team_fff_id: '2026_101544_U18F_12', category: 'U18F',
    official_team: { ...row.official_team, category_code: 'U18F', team_number: '2' } };
  const snapshot = { starts_on: '2026-07-01', ends_before: '2027-07-01', ids: ['100', '200'] };
  const ingest = async (rows: unknown[], status: string, final = true, coverage: object = snapshot) => {
    const response = await worker.fetch(new Request('https://test.example/internal/sync/matches', {
      method: 'POST', headers: { authorization: 'Bearer test-sync', 'content-type': 'application/json' },
      body: JSON.stringify({ rows, sources: [{ source: 'fff', status }], batch: { final, match_snapshot: coverage } })
    }), env, ctx);
    const data = await response.json() as any;
    assert.equal(response.status, 200, JSON.stringify(data));
    return data;
  };
  const score = { source_game_id: '1', home_team: 'Escalquens', away_team: 'Adversaire', home_score: 0, away_score: 2, status: 'finished' };
  const result = await ingest([row, { ...fal, plateau_games: [score] }], 'error');
  assert.equal(result.status, 'partial');
  assert.equal(result.removed_stale_matches, 0);
  assert.equal((await ingest([{ ...fal, plateau_games: [] }], 'ok', false)).removed_stale_matches, 0);
  const teamCoverage = {
    ...snapshot, ids: [], seen_ids: ['100', '200'],
    team_windows: [{ team_fff_id: u18.team_fff_id, starts_on: '2026-11-01', ends_before: '2026-11-30', ids: ['200'] }]
  };
  assert.equal((await ingest([], 'error', true, teamCoverage)).removed_stale_matches, 0);
  assert.equal((await ingest([u18], 'error', false, teamCoverage)).removed_stale_matches, 0);
  const reconciled = await ingest([], 'error', true, teamCoverage);
  assert.equal(reconciled.status, 'partial');
  assert.equal(reconciled.removed_stale_matches, 1);
  assert.equal((await ingest([], 'error', true, teamCoverage)).removed_stale_matches, 0);
  assert.deepEqual(DB.db.prepare('SELECT source_id FROM matches ORDER BY source_id').all().map(item => item.source_id),
    ['100', '200', '202', '203', '204', '9833:12:41646:3', 'ancien']);
  assert.equal(DB.db.prepare(`SELECT t.slug FROM matches m JOIN teams t ON t.id=m.team_id WHERE m.source_id='9833:12:41646:3'`).get()?.slug, 'u13f-test');
  assert.equal(DB.db.prepare(`SELECT t.slug FROM matches m JOIN teams t ON t.id=m.team_id WHERE m.source_id='100'`).get()?.slug, 'u15f-test');
  assert.equal(DB.db.prepare('SELECT home_score FROM plateau_games').get()?.home_score, 0);
});
