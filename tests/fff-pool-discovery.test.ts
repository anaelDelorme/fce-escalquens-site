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
      {maNo: 81234567, date: '2027-05-29', recevant: {equipe: {id: teamId}}},
      {maNo: 89999999, date: '2027-06-05', recevant: {club: {clNo: 54}}}
    ]};
    const state = {'analog_GET|/api/data/matches?phase=2': {status: 200, body}};
    return new Response('<script id="ng-state">' + JSON.stringify(state) + '</script>');
  }, calendar.poolPaths);
  assert.equal(matches.targeted, 2);
  assert.equal(matches.answered, 1);
  assert.deepEqual(matches.pools.find((pool: {path: string}) => pool.path === competitionPath(laterPool)), {
    path: competitionPath(laterPool), teamIds: [teamId], status: 200, matchIds: ['81234567']
  });
});
