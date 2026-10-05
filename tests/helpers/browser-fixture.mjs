import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {buildBrowserProgram} from '../../scripts/lib/fff-browser.mjs';
import {makeTargets} from '../../scripts/lib/fff-periods.mjs';
import {epreuvesPayloadFromZenRows} from '../../scripts/lib/fff-response.mjs';
export const published=JSON.parse(readFileSync(new URL('../fixtures/october-03-published.json',import.meta.url)));
export const standings=[{source:'fff',phase_id:'fixture-phase',team_name:'FCE',position:1},{source:'fff',phase_id:'fixture-phase',team_name:'Club',position:2}];
// Inject only the ranking dependency: the real primary browser collection program is executed.
async function collectStandings(){
 for(const [id,body] of [['fce-standings',[{source:'fff',phase_id:'fixture-phase',team_name:'FCE',position:1},{source:'fff',phase_id:'fixture-phase',team_name:'Club',position:2}]],['fce-standings-meta',{detected:1,parsed:1,rows:2}]]){
  const node=document.createElement('script');node.id=id;node.textContent=JSON.stringify({status:200,body});document.body.appendChild(node);
 }
}
export async function replayBrowser({mutateResponse=value=>value,standingsCollector=collectStandings}={}){
 const clock=Date.parse('2026-10-02T18:00:00Z'),nodes=[];
 const matchPayload={'hydra:totalItems':published.matches.length,'hydra:member':published.matches};
 const falPayload={epreuves:[],sites:published.sites,sitesWithoutDate:[]};
 const state={VLJAXE:'synthetic-session-token','analog_GET|/api/data/matches?fixture':{status:200,body:matchPayload},'GET|/api/fal/cdg/86/club/101544/sites?fixture':{status:200,body:falPayload}};
 const document={
  querySelector:selector=>selector==='#ng-state'?{textContent:JSON.stringify(state)}:null,
  querySelectorAll:()=>nodes,
  createElement:()=>({}),
  head:{replaceChildren(){}},
  body:{appendChild:node=>nodes.push(node),replaceChildren(){}},
  documentElement:{setAttribute(){}}
 };
 const request=async raw=>{
  const url=new URL(raw,'https://epreuves.fff.fr');
  let body,status=200;
  if(url.pathname==='/api/data/matches'){
   const start=url.searchParams.get('dateDebut').slice(0,10),end=url.searchParams.get('dateFin').slice(0,10);
   const rows=published.matches.filter(row=>row.donneesFormatees.date.slice(0,10)>=start&&row.donneesFormatees.date.slice(0,10)<=end);
   body={'hydra:totalItems':rows.length,'hydra:member':rows};
  }else if(url.pathname.includes('/sites')){
   const start=url.searchParams.get('dateDebut'),end=url.searchParams.get('dateFin');
   body={epreuves:[],sites:published.sites.filter(site=>site.date.slice(0,10)>=start&&site.date.slice(0,10)<=end),sitesWithoutDate:[]};
  }else if(url.pathname.includes('/animation-loisir/')){
   body='<script id="ng-state">'+JSON.stringify({'GET|/api/fal/detail':{status:200,body:{games:[]}}})+'</script>';
  }else body=published.matches.find(row=>url.pathname.endsWith('/'+row.donneesFormatees.maNo))||{};
  const changed=mutateResponse({url,body,status});body=changed.body;status=changed.status;
  return {ok:status===200,status,json:async()=>structuredClone(body),text:async()=>typeof body==='string'?body:JSON.stringify(body)};
 };
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 await vm.runInNewContext(buildBrowserProgram(makeTargets(new Date(clock)),{collectStandings:standingsCollector}),{document,fetch:request,URL,AbortSignal,Date:FixedDate,setTimeout:fn=>queueMicrotask(fn)});
 const html=nodes.map(node=>`<script id="${node.id}" type="application/json">${node.textContent}</script>`).join('');
 return {html,payloads:epreuvesPayloadFromZenRows(html)};
}
