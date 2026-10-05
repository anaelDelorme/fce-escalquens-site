import {buildBrowserProgram} from './fff-browser.mjs';
import {epreuvesPayloadFromZenRows} from './fff-response.mjs';
import {normalizeFalGames} from './fff-normalize.mjs';
const CLUB_CODE='550350';
export async function fetchZenRows(targetUrls,{apiKey=process.env.ZENROWS_API_KEY,request=fetch,onSnapshot=()=>{}}={}){
  if(!apiKey)throw new Error('ZENROWS_API_KEY absent');
  const clubPage=`https://epreuves.fff.fr/competition/club/${CLUB_CODE}-f-c-escalquens/club`;
  // L'application Angular lit un jeton dynamique dans ng-state et l'envoie
  // dans X-Competition. Sans cet en-tête, l'API répond 200 avec des listes vides.
  const fetchScript=buildBrowserProgram(targetUrls);
  const instructions=[
    {wait_for:'app-match app-matches-wrapper'},
    {wait:500},
    {evaluate:fetchScript},
    {wait_for:'html[data-fce-sync-done="1"]'},
    {wait:500}
  ];
  const url=new URL('https://api.zenrows.com/v1/');
  url.searchParams.set('apikey',apiKey);
  url.searchParams.set('url',clubPage);
  url.searchParams.set('js_render','true');
  url.searchParams.set('premium_proxy','true');
  url.searchParams.set('proxy_country','fr');
  url.searchParams.set('json_response','false');
  url.searchParams.set('js_instructions',JSON.stringify(instructions));
  const response=await request(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(180000),redirect:'follow'});
  const body=await response.text();
  if(!response.ok)throw new Error(`ZenRows HTTP ${response.status}${body?` — ${body.replace(/\s+/g,' ').slice(0,180)}`:''}`);
  const credits=response.headers.get('x-request-credits');
  const cost=response.headers.get('x-request-cost');
  if(credits)console.log(`ZenRows : ${credits} crédit(s) consommé(s).`);
  if(cost)console.log(`ZenRows : coût indiqué ${cost}.`);
  const html=(()=>{try{return JSON.parse(body)?.html||body}catch{return body}})();
  onSnapshot({captured_at:new Date().toISOString(),scripts:[...String(html).matchAll(/<script[^>]+id=["']fce-[^"']+["'][^>]*>[\s\S]*?<\/script>/gi)].map(match=>match[0])});
  let payloads;
  try{payloads=epreuvesPayloadFromZenRows(body)}catch(error){throw new Error(`Validation réponse ZenRows : ${error.message}`)}
  console.log(`FFF : ${payloads.matchMonths}/12 mois de matchs et ${payloads.falMonths}/12 mois de plateaux capturés.`);
  console.log(`FFF : ${payloads.detailCount} détail(s) de match reçu(s), dont ${payloads.venueDetailCount} avec un terrain.`);
  const plateauGameCount=payloads.falGamePayloads.reduce((total,entry)=>total+normalizeFalGames(entry.payload).length,0);
  const plateauDetailTargeted=Number(payloads.falGameMeta?.targeted||payloads.falGamePayloads.length);
  const plateauDetailSucceeded=Number(payloads.falGameMeta?.succeeded||payloads.falGamePayloads.length);
  console.log(
    `FFF : détails de plateau — ${plateauDetailTargeted} ciblé(s), `+
    `${plateauDetailSucceeded} réussi(s), ${plateauGameCount} mini-match(s) trouvé(s), `+
    `sans crédit ZenRows supplémentaire.`
  );
  if(Array.isArray(payloads.falGameMeta?.failed)&&payloads.falGameMeta.failed.length){
    console.log(
      `::warning title=Détails plateaux FFF::`+
      payloads.falGameMeta.failed
        .map(item=>`${item.key} HTTP ${item.status||'réseau'} (${item.attempts||1} essai(s))`)
        .join(', ')
    );
  }
  if(!payloads.standingsMetaPresent){
    console.log('Warning: le collecteur classements n’a pas produit ses métadonnées dans la session ZenRows.');
  }
  if(payloads.falGamePayloads.length)console.log(`FFF : rattachement des mini-matchs — ${payloads.falGamePayloads.map(entry=>`${entry.payload?.site_key||'clé inconnue'}=${normalizeFalGames(entry.payload).length}`).join(', ')}.`);
  if(payloads.failedMonthly?.length){
    console.log(
      `::warning title=FFF partiel::Sous-requêtes mensuelles encore en échec après retry : `+
      payloads.failedMonthly.map(item=>`${item.id} HTTP ${item.status||'réseau'}`).join(', ')
    );
  }
  return payloads;
}
