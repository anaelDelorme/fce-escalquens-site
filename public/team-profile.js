const slug=new URLSearchParams(location.search).get('slug');
const set=(selector,value)=>{const node=document.querySelector(selector);if(node)node.textContent=value||'À renseigner'};
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const logo=(url,name)=>url?`<img class="match-logo" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<span class="match-logo fallback" aria-hidden="true">⚽</span>';
const roleLabels={coach_referent:'Coach référent',coach:'Coach',dirigeant:'Dirigeant',arbitre:'Arbitre'};
const dateFormat=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long'});
const timeFormat=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
const displayDate=value=>{const label=dateFormat.format(new Date(value));return label.charAt(0).toLocaleUpperCase('fr')+label.slice(1)};
let savedParticipants=[];
const plateauGamesCache=new Map();
const rawSource=match=>{try{const raw=typeof match.raw_json==='string'?JSON.parse(match.raw_json||'{}'):match.raw_json||{};return raw.site||raw}catch{return {}}};
const canonical=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').replace(/[^a-z0-9]+/g,' ').trim();
const plateauParticipants=match=>{
  const saved=savedParticipants.filter(item=>String(item.match_id)===String(match.id));
  const source=rawSource(match);
  const raw=(source.equipes||source.participants||[]).map(item=>({
    name:item.eqNom||item.name||item.label||item.club?.clNom||item.club?.nom||'',
    club_number:item.club?.clNo||item.cl_no||'',logo_url:item.logo||item.club?.logo||'',
    is_club:String(item.club?.clNo||item.cl_no||'')==='101544'||/escalquens/i.test(item.eqNom||item.name||item.club?.clNom||'')
  })).filter(item=>item.name);
  const unique=new Map();
  (saved.length?saved:raw).forEach(item=>{const key=String(item.club_number||'')||canonical(item.name);if(item.name&&!unique.has(key))unique.set(key,item)});
  const organizer=String(source.organisateur?.clNo||'');
  return [...unique.values()].map(item=>({...item,is_host:Boolean(organizer&&String(item.club_number||'')===organizer)}));
};
const participantList=(match,rows=plateauParticipants(match))=>`<div class="plateau-participants"><small>${rows.length===1?'Équipe participante':'Équipes participantes'}</small>${rows.length
  ?`<div>${rows.map(item=>`<span class="${[Number(item.is_club)===1?'our-team':'',item.is_host?'host-team':''].filter(Boolean).join(' ')}">${logo(item.logo_url,item.name)}<span class="participant-copy"><b>${esc(item.name)}</b>${item.is_host?'<small>Organisateur</small>':''}</span></span>`).join('')}</div>`
  :'<p class="participant-empty">Participants à confirmer.</p>'}</div>`;
const plateauGameScore=game=>game.status==='cancelled'?'<span class="plateau-game-status">Annulé</span>':game.home_score!=null&&game.away_score!=null?`<strong class="plateau-game-score">${esc(game.home_score)}<i>:</i>${esc(game.away_score)}</strong>`:'<span class="plateau-game-status">À venir</span>';
const plateauGamesHtml=games=>games.length?`<div class="plateau-games-list">${games.map((game,index)=>`<div class="plateau-game-row"><small>Match ${index+1}</small><div class="plateau-game-team">${logo(game.home_logo_url,game.home_team)}<b>${esc(game.home_team)}</b></div>${plateauGameScore(game)}<div class="plateau-game-team">${logo(game.away_logo_url,game.away_team)}<b>${esc(game.away_team)}</b></div></div>`).join('')}</div>`:'<p class="participant-empty">Programme détaillé non communiqué par la FFF.</p>';
const plateauProgram=match=>{const count=Number(match.plateau_game_count||0);return count?`<div class="plateau-program"><button type="button" data-plateau-games="${esc(match.id)}" aria-expanded="false">Voir ${count===1?'le match':`les ${count} matchs`} d’Escalquens <span>↓</span></button><div class="plateau-games-detail" data-plateau-detail="${esc(match.id)}" hidden></div></div>`:'<div class="plateau-program-empty">Programme détaillé non communiqué</div>'};
const plateauCard=match=>`<article class="team-plateau-card match-card">
  <header><div><time>${displayDate(match.starts_at)}</time><small>Plateau</small></div><strong>${Number(match.time_confirmed)===0?'À confirmer':timeFormat.format(new Date(match.starts_at))}</strong></header>
  <p class="competition-name">${esc(match.competition||'Football animation')}</p>
  ${participantList(match)}${plateauProgram(match)}
  <footer><span>📍 ${esc(match.venue||match.venue_address||'Lieu à confirmer')}</span>${match.source_url?`<a href="${esc(match.source_url)}" target="_blank" rel="noopener">Source officielle →</a>`:''}</footer>
</article>`;
const miniMatch=(match,future=false)=>match.event_type==='plateau'||match.event_type==='animation'?plateauCard(match):`<article class="team-match-row">
  <time>${displayDate(match.starts_at)}</time>
  <small>${esc(match.event_type==='plateau'?'Plateau':match.competition)}</small>
  <div class="match-team">${logo(match.home_logo_url,match.home_team)}<b>${esc(match.home_team)}</b></div>
  <strong>${future?(Number(match.time_confirmed)===0?'À confirmer':timeFormat.format(new Date(match.starts_at))):`${match.home_score??'–'} : ${match.away_score??'–'}`}</strong>
  <div class="match-team">${logo(match.away_logo_url,match.away_team)}<b>${esc(match.away_team)}</b></div>
  <span>${esc(match.venue||match.venue_address||'Lieu à confirmer')}</span>
</article>`;
const wirePlateauDetails=()=>document.querySelectorAll('[data-plateau-games]').forEach(button=>button.onclick=async()=>{
  const id=button.dataset.plateauGames,detail=document.querySelector(`[data-plateau-detail="${id}"]`),opening=button.getAttribute('aria-expanded')!=='true';
  button.setAttribute('aria-expanded',String(opening));button.querySelector('span').textContent=opening?'↑':'↓';detail.hidden=!opening;
  if(!opening||detail.dataset.loaded==='1')return;
  detail.innerHTML='<p class="plateau-games-loading">Chargement du programme…</p>';
  try{if(!plateauGamesCache.has(id)){const response=await fetch(`/api/plateau-games?plateau_id=${encodeURIComponent(id)}`),data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);plateauGamesCache.set(id,data.games||[])}detail.innerHTML=plateauGamesHtml(plateauGamesCache.get(id));detail.dataset.loaded='1'}catch(error){console.error(error);detail.innerHTML='<p class="participant-empty">Le détail est momentanément indisponible.</p>'}
});

fetch(`/api/page/team-profile?slug=${encodeURIComponent(slug||'')}&v=22`).then(async response=>{
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||`Fiche équipe : ${response.status}`);
  return data;
}).then(({team,entries=[],sessions=[],staff=[],upcoming=[],results=[],participants=[]})=>{
  savedParticipants=participants;
  document.title=`${team.name} - FC Escalquens`;set('#team-name',team.name);set('#team-description',team.description);set('#player-count',team.player_count||'—');
  set('#team-level',entries.map(item=>[item.division||item.competition_name,item.pool].filter(Boolean).join(' · ')).filter(Boolean).join(' / ')||team.level);
  document.querySelector('#player-label').textContent=team.group_name==='Féminines'||team.gender==='female'?'licenciées pratiquantes':'licenciés pratiquants';
  const defaultPhoto='/team-default.webp',teamPhoto=team.photo_url||defaultPhoto;
  const photo=document.querySelector('#team-photo'),visual=photo.closest('.team-visual');
  const revealPhoto=(source,fallback)=>{const loader=new Image();loader.onload=()=>{photo.src=source;photo.alt=team.photo_alt||`Photo du groupe ${team.name}`;photo.classList.add('is-ready');visual.setAttribute('aria-busy','false')};loader.onerror=()=>{if(source!==fallback)revealPhoto(fallback,fallback);else visual.setAttribute('aria-busy','false')};loader.src=source};
  revealPhoto(teamPhoto,defaultPhoto);
  document.querySelector('#team-staff').innerHTML=staff.map(item=>`<article>${item.member.photo_key?`<img src="/media/${esc(item.member.photo_key)}" alt="">`:''}<small>${roleLabels[item.role]||esc(item.role)}</small><h3>${esc(item.member.full_name)}</h3>${item.member.email?`<a href="mailto:${esc(item.member.email)}">${esc(item.member.email)}</a>`:''}${item.member.phone?`<a href="tel:${esc(item.member.phone)}">${esc(item.member.phone)}</a>`:''}</article>`).join('')||'<p>Encadrement à venir.</p>';
  const days=['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  document.querySelector('#team-training').innerHTML=sessions.map(row=>{const query=row.venue_latitude!=null&&row.venue_longitude!=null?`${row.venue_latitude},${row.venue_longitude}`:row.venue_full_address||row.address||row.venue_name||row.venue,link=row.venue_maps_url||`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;return `<article><b>${days[row.weekday]}</b><span>${row.starts_at} - ${row.ends_at}</span><small>${esc(row.venue_name||row.venue)}</small><a href="${link}" target="_blank" rel="noopener">Itinéraire →</a></article>`}).join('')||'<p>Horaires à venir.</p>';
  document.querySelector('#team-upcoming').innerHTML=upcoming.map(match=>miniMatch(match,true)).join('')||'<p>Les prochaines rencontres arrivent bientôt.</p>';
  document.querySelector('#team-results').innerHTML=results.map(match=>miniMatch(match,false)).join('')||'<p>Aucun résultat publié pour ce groupe.</p>';
  wirePlateauDetails();
}).catch(error=>{console.error(error);document.querySelector('#team-name').textContent='Informations indisponibles';document.querySelector('#team-description').textContent='La connexion aux données du club a échoué. Merci de réessayer dans quelques instants.'});
