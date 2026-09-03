const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const logo=(url,name)=>url
  ?`<img class="match-logo" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
  :`<span class="match-logo fallback" aria-hidden="true">${esc(String(name||'?').trim().charAt(0))}</span>`;
const dateFormat=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long',year:'numeric'});
const timeFormat=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
const statusLabels={postponed:'Reporté',cancelled:'Annulé'};
let matches=[],participants=[],standings=[],teams=[],entries=[],tab='upcoming';
let filters={section:'',group:'',entry:''};
const now=new Date();

const mapsUrl=row=>row.latitude!=null&&row.longitude!=null
  ?`https://www.google.com/maps/search/?api=1&query=${row.latitude},${row.longitude}`
  :row.venue||row.venue_address
    ?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([row.venue,row.venue_address].filter(Boolean).join(' '))}`
    :'';
const rawParticipants=row=>{
  let raw={};
  try{raw=typeof row.raw_json==='string'?JSON.parse(row.raw_json||'{}'):row.raw_json||{}}catch{}
  const source=raw.site||raw;
  return (source.equipes||source.participants||[]).map(item=>({
    name:item.eqNom||item.name||item.label||item.club?.clNom||item.club?.nom||item.club_name||'',
    club_number:item.club?.clNo||item.cl_no||'',team_number:item.eqCod||item.eqNo||item.team_number||'',
    logo_url:item.logo||item.club?.logo||'',
    is_club:String(item.club?.clNo||item.cl_no||'')==='101544'||/escalquens/i.test(item.eqNom||item.name||item.club?.clNom||item.club?.nom||'')
  })).filter(item=>item.name);
};
const labelParticipants=row=>{
  const value=String(row.away_team||'');
  if(!value.includes('·')||/confirmer/i.test(value))return [];
  return value.split('·').slice(1).join('·').split(',').map(name=>name.trim()).filter(Boolean).map(name=>({name,club_number:'',team_number:'',logo_url:'',is_club:/escalquens/i.test(name)}));
};
const matchParticipants=row=>{
  const saved=participants.filter(item=>String(item.match_id)===String(row.id));
  // Les données normalisées sont prioritaires. Le JSON brut ne sert que de
  // secours pour les anciens plateaux afin d'éviter les doublons de libellés
  // (par exemple « Cugnaux Js » et « J.S. CUGNAUX »).
  const all=saved.length?saved:[...rawParticipants(row),...labelParticipants(row)];
  if(!all.some(item=>Number(item.is_club)===1)&&row.event_type!=='match')all.unshift({name:'FC Escalquens',club_number:'101544',team_number:'',logo_url:row.home_logo_url||'',is_club:1});
  const unique=new Map();
  all.forEach((item,index)=>{const key=`${String(item.name).trim().toLocaleLowerCase('fr')}|${item.team_number||''}`;if(item.name&&!unique.has(key))unique.set(key,{...item,display_order:item.display_order??index})});
  return [...unique.values()].sort((a,b)=>a.display_order-b.display_order);
};
const scoreOrTime=row=>{
  if(statusLabels[row.status])return `<span class="match-status ${esc(row.status)}">${statusLabels[row.status]}</span>`;
  if(row.status==='finished'||(row.home_score!=null&&row.away_score!=null))return `<strong class="score">${row.home_score??'–'}<i>:</i>${row.away_score??'–'}</strong>`;
  if(Number(row.time_confirmed)===0)return '<strong class="kickoff unconfirmed">À confirmer</strong>';
  return `<strong class="kickoff">${timeFormat.format(new Date(row.starts_at))}</strong>`;
};
const participantList=(row,rows=matchParticipants(row))=>{
  return `<div class="plateau-participants"><small>Équipes participantes</small>${rows.length
    ?`<div>${rows.map(item=>`<span class="${Number(item.is_club)===1?'our-team':''}">${logo(item.logo_url,item.name)}<b>${esc(item.name)}</b></span>`).join('')}</div>`
    :'<p class="participant-empty">La liste complète des équipes sera publiée dès sa confirmation par le District.</p>'}</div>`;
};
const matchCard=row=>{
  const plateau=row.event_type==='plateau'||row.event_type==='animation';
  const plateauTeams=plateau?matchParticipants(row):[];
  const place=esc(row.venue||row.venue_address||'Lieu à confirmer');
  const map=mapsUrl(row);
  return `<article class="match-card ${plateau?'event-card':''} ${esc(row.status)}">
    <header>
      <time datetime="${esc(row.starts_at)}">${dateFormat.format(new Date(row.starts_at))}</time>
      <span>${plateau?'Plateau':row.event_type==='friendly'?'Match amical':'Match'}</span>
    </header>
    <p class="competition-name">${esc(row.competition||row.category||'Rencontre du club')}</p>
    ${plateau?`
      <div class="event-summary">${scoreOrTime(row)}<div><b>${plateauTeams.length?`${plateauTeams.length} équipes annoncées`:'Équipes à confirmer'}</b><span>${esc(row.category||'Football animation')}</span></div></div>
      ${participantList(row,plateauTeams)}
    `:`
      <div class="scoreboard">
        <div class="match-team">${logo(row.home_logo_url,row.home_team)}<b>${esc(row.home_team)}</b></div>
        ${scoreOrTime(row)}
        <div class="match-team">${logo(row.away_logo_url,row.away_team)}<b>${esc(row.away_team)}</b></div>
      </div>
    `}
    <footer>
      ${map?`<a href="${map}" target="_blank" rel="noopener">📍 ${place}</a>`:`<span>📍 ${place}</span>`}
      ${row.source_url?`<a href="${esc(row.source_url)}" target="_blank" rel="noopener">Source officielle →</a>`:''}
    </footer>
  </article>`;
};

const teamForMatch=row=>{
  const entry=entries.find(item=>String(item.id)===String(row.competition_team_id));
  return teams.find(item=>String(item.id)===String(row.team_id||entry?.team_id));
};
const filtered=row=>{
  const team=teamForMatch(row);
  return (!filters.section||team?.group_name===filters.section)
    &&(!filters.group||String(team?.id)===filters.group)
    &&(!filters.entry||String(row.competition_team_id)===filters.entry);
};
const entryLabel=row=>{
  const number=row.team_number?` n°${row.team_number}`:'';
  const competition=row.competition_name?` — ${row.competition_name}`:'';
  const team=teams.find(item=>String(item.id)===String(row.team_id));
  return `${row.category_code||row.name}${number}${competition}${team?.active===0?' (à affecter)':''}`;
};
function refreshFilterChoices(){
  const activeTeams=teams.filter(team=>Number(team.active)!==0);
  const sectionSelect=document.querySelector('#section-filter');
  const groupSelect=document.querySelector('#group-filter');
  const entrySelect=document.querySelector('#entry-filter');
  const sections=[...new Set(activeTeams.map(team=>team.group_name).filter(Boolean))];
  sectionSelect.innerHTML='<option value="">Toutes les sections</option>'+sections.map(value=>`<option value="${esc(value)}" ${value===filters.section?'selected':''}>${esc(value)}</option>`).join('');
  const groups=activeTeams.filter(team=>!filters.section||team.group_name===filters.section);
  if(filters.group&&!groups.some(team=>String(team.id)===filters.group))filters.group='';
  groupSelect.innerHTML='<option value="">Tous les groupes sportifs</option>'+groups.map(team=>`<option value="${team.id}" ${String(team.id)===filters.group?'selected':''}>${esc(team.name)}</option>`).join('');
  const visibleTeamIds=new Set(groups.map(team=>String(team.id)));
  const visibleEntries=entries.filter(entry=>Number(entry.active)!==0&&(
    filters.group?String(entry.team_id)===filters.group:!filters.section||visibleTeamIds.has(String(entry.team_id))
  ));
  if(filters.entry&&!visibleEntries.some(entry=>String(entry.id)===filters.entry))filters.entry='';
  entrySelect.innerHTML='<option value="">Toutes les équipes engagées</option>'+visibleEntries.map(entry=>`<option value="${entry.id}" ${String(entry.id)===filters.entry?'selected':''}>${esc(entryLabel(entry))}</option>`).join('');
}
function draw(){
  document.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===tab));
  document.querySelector('#standings-page').hidden=tab!=='standings';
  document.querySelector('#matches-page').hidden=tab==='standings';
  if(tab==='standings'){
    const rows=standings.filter(row=>filtered(row));
    document.querySelector('#standings-page').innerHTML=rows.length?`<table><thead><tr><th>#</th><th>Équipe</th><th>J</th><th>G</th><th>N</th><th>P</th><th>Pts</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${row.position}</td><td>${esc(row.team_name)}</td><td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td><b>${row.points}</b></td></tr>`).join('')}</tbody></table>`:'<p>Aucun classement n’est actuellement diffusé pour cette sélection.</p>';
    return;
  }
  const rows=matches.filter(row=>{
    const finished=row.status==='finished'||(row.home_score!=null&&row.away_score!=null);
    const inTab=tab==='upcoming'?!finished&&new Date(row.starts_at)>=new Date(now.getTime()-86400000):finished||new Date(row.starts_at)<now;
    return inTab&&filtered(row);
  }).sort((a,b)=>tab==='upcoming'?new Date(a.starts_at)-new Date(b.starts_at):new Date(b.starts_at)-new Date(a.starts_at));
  document.querySelector('#matches-page').innerHTML=rows.map(matchCard).join('')||'<div class="empty-state"><b>Aucune rencontre dans cette vue.</b></div>';
}

Promise.all([
  fetch('/api/matches').then(response=>response.json()),
  fetch('/api/match_participants').then(response=>response.json()).catch(()=>[]),
  fetch('/api/standings').then(response=>response.json()),
  fetch('/api/match-sync').then(response=>response.json()).catch(()=>({})),
  fetch('/api/teams').then(response=>response.json()),
  fetch('/api/team_competitions').then(response=>response.json()).catch(()=>[])
]).then(data=>{
  [matches,participants,standings]=data;teams=data[4];entries=data[5];
  const sync=data[3];
  const node=document.querySelector('#matches-updated');
  if(node&&sync.finished_at)node.textContent=new Date(sync.finished_at+'Z').toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'long',timeStyle:'short'});
  refreshFilterChoices();draw();
});
document.querySelector('#section-filter').onchange=event=>{filters={section:event.target.value,group:'',entry:''};refreshFilterChoices();draw()};
document.querySelector('#group-filter').onchange=event=>{filters.group=event.target.value;filters.entry='';refreshFilterChoices();draw()};
document.querySelector('#entry-filter').onchange=event=>{filters.entry=event.target.value;draw()};
document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.tab;draw()});
