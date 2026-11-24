import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { fetchZenRows } from '../scripts/sync-matches.mjs';

test('FFF : une requête ZenRows regroupe matchs, plateaux et classements', async t => {
  t.mock.method(globalThis, 'fetch', async (url: URL) => {
    assert.equal(url.hostname, 'api.zenrows.com');
    const options = JSON.parse(url.searchParams.get('js_instructions')!);
    const calendar = '/competition/engagement/461480-u15-fem-r1/phase/1/3/classement';
    const window = new Window({url: 'https://epreuves.fff.fr/competition/club/550350-f-c-escalquens/club'});
    try {
      window.document.body.innerHTML = '<a href="' + calendar + '">Classement</a><script id="ng-state"></script>';
      window.document.querySelector('#ng-state')!.textContent = JSON.stringify({VLJAXE: 'test'});
      const matches = {
        'hydra:totalItems': 1,
        'hydra:member': [{
          maNo: 81659252, date: '2026-12-06T13:00:00+01:00',
          recevant: {club: {clNo: 101544, nom: 'FC Escalquens'}, equipe: {id: '2026_101544_U15F_5'}},
          visiteur: {club: {clNo: 22, nom: 'Lunel'}}
        }]
      };
      const request = async (href: string) => {
        if (href.endsWith('/api/data/matches?clNo=101544')) return Response.json(matches);
        if (href.endsWith('/api/fal/test')) return Response.json({sites: []});
        if (href.endsWith(calendar)) return new Response(
          '<table><thead><tr><th>Pos</th><th>Équipe</th><th>Pts</th></tr></thead>' +
          '<tbody><tr><td>1</td><td>FC Escalquens</td><td>9</td></tr></tbody></table>'
        );
        return new Response('', {status: 404});
      };
      const run = new Function('document', 'location', 'fetch', 'DOMParser', 'return ' + options[2].evaluate);
      await run(window.document, window.location, request, window.DOMParser);
      return new Response(window.document.documentElement.outerHTML);
    } finally {
      await window.close();
    }
  });
  const originalKey = process.env.ZENROWS_API_KEY;
  const originalBudget = process.env.FCE_ZENROWS_MAX_REQUESTS;
  process.env.ZENROWS_API_KEY = 'test';
  process.env.FCE_ZENROWS_MAX_REQUESTS = '1';
  t.after(() => {
    if (originalKey === undefined) delete process.env.ZENROWS_API_KEY;
    else process.env.ZENROWS_API_KEY = originalKey;
    if (originalBudget === undefined) delete process.env.FCE_ZENROWS_MAX_REQUESTS;
    else process.env.FCE_ZENROWS_MAX_REQUESTS = originalBudget;
  });

  const result = await fetchZenRows({
    seasonYear: 2026,
    matches: ['https://epreuves.fff.fr/api/data/matches?clNo=101544'],
    fal: ['https://epreuves.fff.fr/api/fal/test']
  });
  assert.equal(result.matches['hydra:member'][0].maNo, 81659252);
  assert.equal(result.falMonths, 1);
  assert.equal(result.standings[0].points, 9);
  assert.equal((globalThis.fetch as any).mock.callCount(), 1);
});
