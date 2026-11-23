import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Window} from 'happy-dom';
import {browserCollectPublishedWeeks} from '../scripts/fff-published-weeks.mjs';

const origin = 'https://epreuves.fff.fr';
const page = origin + '/competition/engagement/461480-u15-fem-r1/phase/1/3/resultats-et-calendrier';
const weeksPath = '/api/data/competitions/461480/semaines';
const weekStarts = ['2026-11-23', '2026-11-30', '2027-05-24'];
const weekEnds = ['2026-11-29', '2026-12-06', '2027-05-30'];
const fixtureIds = [81659248, 81659252, 81659303];
const requestFor = (index: number, pool = '3') => '/api/data/matches?' + new URLSearchParams({
  cpNo: '461480', phNo: '1', gpNo: pool, page: '1',
  dateDebut: weekStarts[index] + 'T00:00:00+00:00',
  dateFin: weekEnds[index] + 'T00:00:00+00:00'
});
const match = (index: number) => ({donneesFormatees: {
  maNo: fixtureIds[index], date: weekEnds[index] + 'T13:00:00+01:00',
  recevant: {club: {clNo: 101544}}
}});
const collection = (index: number) => ({
  'hydra:totalItems': 2,
  'hydra:member': [match(index), {...match(index).donneesFormatees, maNo: 123, recevant: {club: {clNo: 54}}}]
});

function calendarDocument(window: Window, total = weekStarts.length) {
  const state = {
    ['analog_GET|' + weeksPath]: {status: 200, body: {
      'hydra:totalItems': total, 'hydra:member': weekStarts.map((start, index) => ({
        dateDebut: start + 'T00:00:00Z', dateFin: weekEnds[index] + 'T00:00:00Z'
      }))
    }},
    ['analog_GET|' + requestFor(0)]: {status: 200, body: collection(0)}
  };
  window.document.body.innerHTML = '<button>navigation suivante</button><script id="ng-state"></script>';
  window.document.querySelector('#ng-state')!.textContent = JSON.stringify(state);
}

test('FFF : le contrôle natif lit toutes les semaines publiées, même si mai suit une interruption', async t => {
  const window = new Window({url: page});
  t.after(() => window.close());
  calendarDocument(window);
  const evaluate = new Function('window', 'document', 'location', 'XMLHttpRequest',
    "return (" + browserCollectPublishedWeeks.toString() + ")('101544');");
  let index = 0;
  const requests: string[] = [];
  const request = async (resource: string) => {
    requests.push(resource);
    const target = new URL(resource, origin);
    const targetIndex = weekStarts.indexOf(target.searchParams.get('dateDebut')!.slice(0, 10));
    return Response.json(collection(targetIndex));
  };
  const browser = {fetch: request};
  class Xhr {}
  window.document.querySelector('button')!.onclick = () => {
    index++;
    void browser.fetch(requestFor(index, '2'));
    void browser.fetch(requestFor(index));
  };
  const result = await evaluate(browser, window.document, window.location, Xhr);
  assert.deepEqual(result.expectedWeeks, weekStarts);
  assert.deepEqual(result.verifiedWeeks, weekStarts);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.collections.flatMap((row: {'hydra:member': ReturnType<typeof match>[]}) =>
    row['hydra:member'].map(wrapper => wrapper.donneesFormatees.maNo)), fixtureIds);
  assert.deepEqual(requests, [requestFor(1, '2'), requestFor(1), requestFor(2, '2'), requestFor(2)]);
  assert.equal(browser.fetch, request);
});

test('FFF : une semaine incomplète arrête la navigation et conserve les données déjà vérifiées', async t => {
  const window = new Window({url: page});
  t.after(() => window.close());
  calendarDocument(window);
  const evaluate = new Function('window', 'document', 'location', 'XMLHttpRequest',
    "return (" + browserCollectPublishedWeeks.toString() + ")('101544');");
  const request = async () => Response.json({...collection(1), 'hydra:totalItems': 3});
  const browser = {fetch: request};
  let clicks = 0;
  window.document.querySelector('button')!.onclick = () => {
    clicks++;
    void browser.fetch(requestFor(1));
  };
  const result = await evaluate(browser, window.document, window.location, class Xhr {});
  assert.deepEqual(result.verifiedWeeks, [weekStarts[0]]);
  assert.equal(result.collections.length, 1);
  assert.match(result.failures[0], /2026-11-30.*incomplète/);
  assert.equal(clicks, 1);
});

test('FFF : la liste tronquée des semaines ne valide aucune couverture', async t => {
  const window = new Window({url: page});
  t.after(() => window.close());
  calendarDocument(window, weekStarts.length + 1);
  const evaluate = new Function('document', 'location',
    "return (" + browserCollectPublishedWeeks.toString() + ")('101544');");
  const result = await evaluate(window.document, window.location);
  assert.deepEqual(result.expectedWeeks, []);
  assert.deepEqual(result.verifiedWeeks, []);
  assert.match(result.failures[0], /semaines absente ou incomplète/);
});
