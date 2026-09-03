const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const logo=(url,name)=>url
  ?`<img class="match-logo" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
  :`<span class="match-logo fallback" aria-hidden="true">${esc(String(name||'?').trim().charAt(0))}</span>`;
const dateFormat=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long',year:'numeric'});
const timeFormat=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
const statusLabels={postponed:'Reporté',cancelled:'Annulé'};
let matches=[],participants=[],standings=[],tab='upcoming',competition='';const now=new Date();

const mapsUrl=row=>row.latitude!=null&&row.longitude!=null
  ?`https://www.google.com/maps/search/?api=1&query=${row.latitude},${row.longitude}`
  :row.venue||row.venue_address
    ?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([row.venue,row.venue_address].filter(Boolean).join(' '))}`
    :'';
const matchParticipants=id=>participants.filter(item=>item.match_id===id).sort((a,b)=>a.display_order-b.display_order);
const scoreOrTime=row=>{
  if(statusLabels[row.status])return `<span class="match-status ${esc(row.status)}">${statusLabels[row.status]}</span>`;
  if(row.status==='finished'||(row.home_score!=null&&row.away_score!=null))return `<strong class="score">${row.home_score??'–'}<i>:</i>${row.away_score??'–'}</strong>`;
  if(Number(row.time_confirmed)===0)return '<strong class="kickoff unconfirmed">À confirmer</strong>';
  return `<strong class="kickoff">${timeFormat.format(new Date(row.starts_at))}</strong>`;
};
const participantList=row=>{
  const rows=matchParticipants(row.id);
  if(!rows.length)return '';
  return `<div class="plateau-participants"><small>Équipes participantes</small><div>${rows.map(item=>`<span class="${item.is_club?'our-team':''}">${logo(item.logo_url,item.name)}<b>${esc(item.name)}</b></span>`).join('')}</div></div>`;
};
const matchCard=row=>{
  const plateau=row.event_type==='plateau'||row.event_type==='animation';
  const place=esc(row.venue||row.venue_address||'Lieu à confirmer');
  const map=mapsUrl(row);
  return `<article class="match-card ${plateau?'event-card':''} ${esc(row.status)}">
    <header>
      <time datetime="${esc(row.starts_at)}">${dateFormat.format(new Date(row.starts_at))}</time>
      <span>${plateau?'Plateau':row.event_type==='friendly'?'Match amical':'Match'}</span>
    </header>
    <p class="competition-name">${esc(row.competition||row.category||'Rencontre du club')}</p>
    ${plateau?`
      <div class="event-summary"><div><b>FC Escalquens</b><span>${esc(row.category)}</span></div>${scoreOrTime(row)}</div>
      ${participantList(row)}
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

function draw(){
  document.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===tab));
  document.querySelector('#standings-page').hidden=tab!=='standings';
  document.querySelector('#matches-page').hidden=tab==='standings';
  if(tab==='standings'){
    const rows=standings.filter(row=>!competition||row.phase_id===competition);
    document.querySelector('#standings-page').innerHTML=rows.length?`<table><thead><tr><th>#</th><th>Équipe</th><th>J</th><th>G</th><th>N</th><th>P</th><th>Pts</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${row.position}</td><td>${esc(row.team_name)}</td><td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td><b>${row.points}</b></td></tr>`).join('')}</tbody></table>`:'<p>Aucun classement n’est actuellement diffusé pour cette compétition.</p>';
    return;
  }
  const rows=matches.filter(row=>{
    const finished=row.status==='finished'||(row.home_score!=null&&row.away_score!=null);
    const inTab=tab==='upcoming'?!finished&&new Date(row.starts_at)>=new Date(now.getTime()-86400000):finished||new Date(row.starts_at)<now;
    return inTab&&(!competition||row.competition===competition);
  }).sort((a,b)=>tab==='upcoming'?new Date(a.starts_at)-new Date(b.starts_at):new Date(b.starts_at)-new Date(a.starts_at));
  document.querySelector('#matches-page').innerHTML=rows.map(matchCard).join('')||'<div class="empty-state"><b>Aucune rencontre dans cette vue.</b></div>';
}

Promise.all([
  fetch('/api/matches').then(response=>response.json()),
  fetch('/api/match_participants').then(response=>response.json()).catch(()=>[]),
  fetch('/api/standings').then(response=>response.json()),
  fetch('/api/match-sync').then(response=>response.json()).catch(()=>({}))
]).then(data=>{
  [matches,participants,standings]=data;
  const sync=data[3];
  const node=document.querySelector('#matches-updated');
  if(node&&sync.finished_at)node.textContent=new Date(sync.finished_at+'Z').toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'long',timeStyle:'short'});
  const competitions=[...new Set(matches.map(row=>row.competition).filter(Boolean))];
  document.querySelector('#competition-filter').innerHTML=`<button class="active" data-comp="">Toutes</button>`+competitions.map(value=>`<button data-comp="${esc(value)}">${esc(value)}</button>`).join('');
  document.querySelectorAll('[data-comp]').forEach(button=>button.onclick=()=>{competition=button.dataset.comp;document.querySelectorAll('[data-comp]').forEach(item=>item.classList.toggle('active',item===button));draw()});
  draw();
});
document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.tab;draw()});
