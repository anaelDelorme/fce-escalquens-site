import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserCollectCalendarFallback, browserCollectCompetitionMatches } from '../scripts/fff-match-coverage.mjs';

test('FFF : le calendrier U15F découvre une nouvelle phase publiée et transmet sa provenance', async () => {
  const teamId = '2026_101544_U15F_5';
  const firstPool = '/competition/engagement/455739-u15-territoire-f/phase/1/6';
  const laterPool = '/competition/engagement/499999-u15-fem-r1/phase/2/4';
  const competitionPath = (prefix: string) => prefix + '/resultats-et-calendrier';
  const scanTeam = new Function('document', 'location', 'fetch', 'state',
    'return (' + browserCollectCalendarFallback.toString() + ")(state, 2026, '101544', true);");
  const calendar = await scanTeam(
    {querySelectorAll: () => []},
    {pathname: '/competition/club/550350-f-c-escalquens/club'},
    async (url: string) => {
      assert.match(url, new RegExp('/equipe/' + teamId + '/resultat-calendrier$'));
      const state = JSON.stringify({engagement: laterPool + '/classement'}).replaceAll('/', '\\/');
      return new Response('<a href="' + firstPool + '/accueil">Automne</a><script id="ng-state">' + state + '</script>');
    },
    {url: firstPool + '/classement'}
  );
  assert.deepEqual(calendar.poolPaths, [
    {path: competitionPath(firstPool), teamIds: [teamId]},
    {path: competitionPath(laterPool), teamIds: [teamId]}
  ]);

  const scanPool = new Function('document', 'fetch', 'pools',
    'return (' + browserCollectCompetitionMatches.toString() + ")('101544', [], pools);");
  const matches = await scanPool({querySelectorAll: () => [], querySelector: () => null}, async (url: string) => {
    if (url !== competitionPath(laterPool)) return new Response('', {status: 404});
    const body = {'hydra:member': [
      {maNo: 81234567, date: '2027-05-29', recevant: {equipe: {id: teamId}}, visiteur: {club: {clNo: 54}}},
      {maNo: 89999999, date: '2027-06-05', recevant: {club: {clNo: 54}}, visiteur: {club: {clNo: 25}}}
    ]};
    const state = {'analog_GET|/api/data/matches?phase=2': {status: 200, body}};
    return new Response('<script id="ng-state">' + JSON.stringify(state) + '</script>');
  }, calendar.poolPaths);
  assert.equal(matches.targeted, 2);
  assert.equal(matches.answered, 1);
  assert.deepEqual(matches.pools.find((pool: {path: string}) => pool.path === competitionPath(laterPool)), {
    path: competitionPath(laterPool), teamIds: [teamId], status: 200, matchIds: ['81234567'], endpoints: ['/api/data/matches'], publishedWeeks: 0
  });
});

test('FFF : le portail de Ligue découvre une nouvelle compétition et lit les journées imbriquées', async () => {
  const root = '/competition/engagement/499999-u15-fem-r1';
  const pool = root + '/phase/1/2';
  const read = new Function('document', 'fetch', 'organisation',
    'return (' + browserCollectCompetitionMatches.toString() + ")('101544', [], [], {organisation, categories:['U15F']});");
  const requests: string[] = [];
  const result = await read({querySelectorAll: () => [], querySelector: () => null}, async (url: string) => {
    requests.push(url);
    if (url === '/ligue-et-district/14') return new Response(
      `<a href="${root}">U15 Fem R1</a><a href="/competition/engagement/123-u15-district">U15 District</a>`);
    if (url === root) return new Response(`<a href="${pool}/classement">Groupe 2</a>`);
    const state = {
      'analog_GET|/api/data/journees?competition=499999': {status: 200, body: {journees: [{matches: [
        {donneesFormatees: {maNo: 81234567, date: '2027-05-29',
          recevant: {club: {clNo: 101544}}, visiteur: {club: {clNo: 54}}}}
      ]}]}}
    };
    return new Response('<script id="ng-state">' + JSON.stringify(state) + '</script>');
  }, '/ligue-et-district/14');
  assert.deepEqual(requests, ['/ligue-et-district/14', root, pool + '/resultats-et-calendrier']);
  assert.equal(result.answered, 1);
  assert.deepEqual(result.pools[0].matchIds, ['81234567']);
  assert.deepEqual(result.pools[0].endpoints, ['/api/data/journees']);
});
