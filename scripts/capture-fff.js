/* Paste in the browser console on the FFF club page showing the affected date.
   Reads page data only. Does not export the X-Competition token, cookies or storage. */
(() => {
  const node = document.querySelector('#ng-state');
  if (!node) throw new Error('État FFF introuvable : ouvrir la page du club sur epreuves.fff.fr.');
  const state = JSON.parse(node.textContent);
  const entries = (Array.isArray(state) ? state : [state]).flatMap(root => Object.entries(root || {}));
  const responses = entries.filter(([key, value]) =>
    (key.includes('/api/data/matches?') || key.includes('/api/fal/cdg/86/club/101544/sites?')) &&
    value?.status === 200 && value?.body
  ).map(([key, value]) => ({ route: key, body: value.body }));
  const visibleEvents = [...document.querySelectorAll('app-match, app-fal-site')]
    .filter(element => element.getClientRects().length)
    .map(element => ({ text: element.innerText, links: [...element.querySelectorAll('a[href]')].map(link => link.href) }));
  const capture = { captured_at: new Date().toISOString(), page: location.origin + location.pathname, responses, visibleEvents };
  const url = URL.createObjectURL(new Blob([JSON.stringify(capture, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'fce-fff-capture.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  console.info('Capture des données FFF créée, sans jeton de session.');
})();
