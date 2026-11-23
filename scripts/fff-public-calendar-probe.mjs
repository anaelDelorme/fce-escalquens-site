// Sérialisé dans le navigateur. Le diagnostic ne publie ni réponse de match
// complète, ni état Angular, ni contenu brut des bundles.
export async function browserProbePublicCalendar(teamPath) {
  const path = new URL(teamPath || location.pathname, location.origin);
  if (path.origin !== location.origin || !/\/(?:equipe\/[\w-]+\/resultat-calendrier|engagement\/[\w-]+\/phase\/\d+\/\d+\/resultats-et-calendrier)\/?$/.test(path.pathname)) {
    throw new Error('Page publique de calendrier d’équipe requise');
  }

  let status = 200;
  let page = document;
  if (path.pathname !== location.pathname) {
    const response = await fetch(path.pathname, {
      headers: {Accept: 'text/html'}, credentials: 'include', signal: AbortSignal.timeout(6500)
    });
    status = response.status;
    if (!response.ok) return {path: path.pathname, status};
    page = new DOMParser().parseFromString(await response.text(), 'text/html');
  }

  const safeHref = href => {
    if (!href) return undefined;
    try {
      const link = new URL(href, path);
      if (link.origin !== path.origin || !link.pathname.startsWith('/competition/')) return undefined;
      const query = new URLSearchParams();
      for (const [key, value] of link.searchParams) {
        if (/^(?:date|day|month|year|mois|annee|week|semaine|page|dateDebut|dateFin|journee)$/i.test(key)
          && /^(?:\d{1,4}|\d{4}-\d\d(?:-\d\d)?)$/.test(value)) query.set(key, value);
      }
      return link.pathname + (query.size ? '?' + query : '') + (/^#[\w-]{1,40}$/.test(link.hash) ? link.hash : '');
    } catch {
      return undefined;
    }
  };
  const safeText = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  const controls = [...page.querySelectorAll('button, a[href], select, input[type="date"], input[type="month"], [role=button]')]
    .flatMap(element => {
      const text = safeText(element.textContent), aria = safeText(element.getAttribute('aria-label'));
      const title = safeText(element.getAttribute('title'));
      const href = safeHref(element.getAttribute('href'));
      const type = element.getAttribute('type');
      if (!/(?:calendrier|r[ée]sultats|pr[ée]c[ée]d|suivant|journ[ée]e|mois|saison|today|next|previous|date|week)/i.test([text, aria, title, href, type].join(' '))) return [];
      return [{text, aria, title, href}];
    }).slice(0, 35);

  let transferState = [];
  try { transferState = JSON.parse(page.querySelector('#ng-state')?.textContent || '[]'); } catch {}
  const windows = (Array.isArray(transferState) ? transferState : [transferState])
    .flatMap(root => Object.entries(root || {}))
    .flatMap(([key, state]) => {
      const query = key.match(/\/api\/(?:data\/)?matches\?([^|]+)/)?.[1];
      if (!query) return [];
      const params = new URLSearchParams(query);
      const names = [...new Set(params.keys())].filter(value => /^[a-z][\w[\]-]{0,30}$/i.test(value));
      const date = value => /^\d{4}-\d\d-\d\d(?:T[\d:.+-]+Z?)?$/.test(value || '') ? value : undefined;
      return [{names, start: date(params.get('dateDebut')), end: date(params.get('dateFin')),
        status: Number(state?.status) || 0, total: Number.isSafeInteger(state?.body?.['hydra:totalItems']) ? state.body['hydra:totalItems'] : undefined}];
    });

  const weeks = (Array.isArray(transferState) ? transferState : [transferState])
    .flatMap(root => Object.entries(root || {}))
    .flatMap(([key, state]) => {
      if (!/\/api\/data\/competitions\/\d+\/semaines/.test(key) || state.status !== 200) return [];
      const dates = JSON.stringify(state.body).match(/20\d\d-\d\d-\d\d/g) || [];
      return [{keys: Object.keys(state.body || {}).slice(0, 12),
        dates: [...new Set(dates)].sort(), count: dates.length}];
    });
  const assets = new Set();
  const addAsset = raw => {
    try {
      const asset = new URL(raw, path);
      if (asset.origin === path.origin && /^[\w./-]+\.m?js$/.test(asset.pathname)) assets.add(asset.pathname);
    } catch {}
  };
  for (const element of page.querySelectorAll('script[src], link[rel=modulepreload][href]')) addAsset(element.getAttribute('src') || element.getAttribute('href'));
  if (page === document) for (const asset of performance.getEntriesByType('resource')) addAsset(asset.name);
  const bundles = await Promise.all([...assets].slice(0, 20).map(async asset => {
    try {
      const response = await fetch(asset, {signal: AbortSignal.timeout(5000)});
      if (!response.ok) return null;
      const script = await response.text();
      const calendarRoute = /resultat-calendrier|resultats-et-calendrier/.test(script);
      const setsDateWindow = script.includes('dateDebut') && script.includes('dateFin');
      const dateQueryKeys = [...new Set([...script.matchAll(/(?:queryParamMap|queryParams|searchParams)(?:\.get\(\s*["']|\[\s*["']|\.|\s*:\s*\{\s*)(dateDebut|dateFin|date|month|mois|year|annee|journee|page|semaine|week)(?=["'\]\s,;)]|$)/gi)]
        .map(match => match[1]))].sort();
      return calendarRoute || setsDateWindow || dateQueryKeys.length ? {asset, calendarRoute, setsDateWindow, dateQueryKeys} : null;
    } catch {
      return null;
    }
  }));
  const navigation = [];
  if (page === document) {
    const next = [...document.querySelectorAll('button, [role="button"]')].find(button =>
      /^navigation suivante$/i.test(safeText(button.textContent || button.getAttribute('aria-label'))));
    if (next && !next.disabled) {
      const targetUrl = request => {
        try {
          const target = new URL(request, location.origin);
          return target.origin === location.origin && target.pathname === '/api/data/matches' ? target : null;
        } catch { return null; }
      };
      const collect = (target, http, payload) => {
        const allowed = ['cpNo','phNo','gpNo','dateDebut','dateFin','itemsPerPage','pagination','page'];
        const query = Object.fromEntries([...target.searchParams].filter(([key]) => allowed.includes(key)));
        const own = (payload?.['hydra:member'] || []).flatMap(wrapper => {
          const match = wrapper.donneesFormatees || wrapper;
          return [match.recevant, match.visiteur].some(side => String(side?.club?.clNo) === '101544')
            ? [{id: match.maNo, date: match.date}] : [];
        });
        const members = payload?.['hydra:member'];
        navigation.push({query, http, total: payload?.['hydra:totalItems'], own,
          keys: Object.keys(payload || {}).slice(0, 12),
          memberCount: Array.isArray(members) ? members.length : null,
          next: Boolean(payload?.['hydra:view']?.['hydra:next']),
          matches: Array.isArray(members) ? members.slice(0, 20).map(wrapper => {
            const match = wrapper.donneesFormatees || wrapper;
            return {id: match.maNo ?? wrapper.id, date: match.date};
          }) : []});
      };
      const originalFetch = window.fetch;
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      const targets = new WeakMap();
      window.fetch = async function(resource, options) {
        const response = await originalFetch.call(this, resource, options);
        const target = targetUrl(resource?.url || resource);
        if (target) {
          let body;
          try { if (response.ok) body = await response.clone().json(); } catch {}
          collect(target, response.status, body);
        }
        return response;
      };
      XMLHttpRequest.prototype.open = function(method, request, ...args) {
        const target = targetUrl(request);
        if (target) targets.set(this, target);
        return originalOpen.call(this, method, request, ...args);
      };
      XMLHttpRequest.prototype.send = function(...args) {
        const target = targets.get(this);
        if (target) this.addEventListener('loadend', () => {
          let body;
          try { body = this.responseType === 'json' ? this.response : JSON.parse(this.responseText); } catch {}
          collect(target, this.status, body);
        }, {once: true});
        return originalSend.apply(this, args);
      };
      try {
        next.click();
        for (let attempt = 0; attempt < 25 && !navigation.length; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } finally {
        window.fetch = originalFetch;
        XMLHttpRequest.prototype.open = originalOpen;
        XMLHttpRequest.prototype.send = originalSend;
      }
    }
  }
  return {path: path.pathname, status, controls, windows, weeks, bundles: bundles.filter(Boolean),
    navigation, urlAfter: safeHref(location.href)};
}
