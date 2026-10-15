const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const date=value=>value?new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):'';
const statusLabels={open:'Inscriptions ouvertes',published:'À venir',finished:'Terminé'};
let tournaments=[],links=[],teams=[],venues=[];
function categories(row){try{return Array.isArray(row.categories)?row.categories:JSON.parse(row.categories||'[]')}catch{return []}}
function participatingTeams(id){const ids=links.filter(link=>link.tournament_id===id).map(link=>link.team_id);return teams.filter(team=>ids.includes(team.id))}
function visual(row){
  const source=row.image_key||row.poster_key||'';
  const posterOnly=!row.image_key&&row.poster_key;
  const image=source
    ?`<img class="tournament-cover${posterOnly?' tournament-cover--poster':''}" src="/media/${esc(source)}" alt="${posterOnly?'Affiche':'Visuel'} du tournoi ${esc(row.name)}" loading="lazy">`
    :`<div class="tournament-cover-placeholder"><img src="/logo-fce.webp" alt=""><span>FC Escalquens</span></div>`;
  const poster=row.poster_key&&row.image_key
    ?`<a class="tournament-poster-peek" href="/media/${esc(row.poster_key)}" target="_blank" rel="noopener"><img src="/media/${esc(row.poster_key)}" alt=""><span>Voir l’affiche</span></a>`
    :'';
  return `<div class="tournament-visual">${image}<span class="tournament-status tournament-status--${esc(row.status)}">${esc(statusLabels[row.status]||'Tournoi')}</span>${poster}</div>`;
}
function draw(){
  const rows=tournaments.filter(row=>['published','open','finished'].includes(row.status));
  const list=document.querySelector('#tournaments-list');
  list.dataset.count=String(Math.min(rows.length,3));
  list.innerHTML=rows.map(row=>{
    const participants=participatingTeams(row.id);
    const venue=venues.find(item=>item.id===row.venue_id);
    const labels=participants.map(team=>team.name).filter(Boolean);
    const fallbackCategories=categories(row);
    const audience=labels.length?labels:fallbackCategories;
    const location=venue?.name||row.venue||'Lieu à confirmer';
    const price=String(row.registration_price||'').trim()||'Tarif à confirmer';
    return `<article class="tournament-card">
      ${visual(row)}
      <div class="tournament-card-body">
        <div class="tournament-kicker">${audience.length?audience.map(item=>`<span>${esc(item)}</span>`).join(''):'<span>Toutes les équipes</span>'}</div>
        <h2>${esc(row.name)}</h2>
        ${row.summary?`<p class="tournament-summary">${esc(row.summary)}</p>`:''}
        <dl class="tournament-facts">
          <div><dt>Date</dt><dd>${esc(date(row.starts_on))}${row.ends_on&&row.ends_on!==row.starts_on?`<small>au ${esc(date(row.ends_on))}</small>`:''}</dd></div>
          <div><dt>Lieu</dt><dd>${esc(location)}</dd></div>
          <div class="tournament-price"><dt>Inscription</dt><dd>${esc(price)}</dd></div>
        </dl>
        ${row.organizer?`<p class="tournament-organizer">Organisé par <b>${esc(row.organizer)}</b></p>`:''}
        <div class="tournament-actions">
          ${row.registration_url?`<a class="tournament-action tournament-action--primary" href="${esc(row.registration_url)}" target="_blank" rel="noopener">S’inscrire →</a>`:''}
          ${row.tournify_url?`<a class="tournament-action" href="${esc(row.tournify_url)}" target="_blank" rel="noopener">Tournify →</a>`:''}
          ${row.poster_key?`<a class="tournament-action" href="/media/${esc(row.poster_key)}" target="_blank" rel="noopener">Voir l’affiche</a>`:''}
          ${row.rules_key?`<a class="tournament-action" href="/media/${esc(row.rules_key)}" target="_blank" rel="noopener">Règlement</a>`:''}
        </div>
      </div>
    </article>`;
  }).join('')||'<div class="empty-state"><b>Les prochains tournois arrivent bientôt.</b><p>Les informations seront publiées ici dès leur confirmation.</p></div>';
}
fetch('/api/page/tournaments').then(async response=>{
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||`Tournois : ${response.status}`);
  return data;
}).then(data=>{
  tournaments=data.tournaments||[];
  links=data.links||[];
  teams=data.teams||[];
  venues=data.venues||[];
  draw();
}).catch(error=>{
  console.error(error);
  document.querySelector('#tournaments-list').innerHTML='<div class="empty-state"><b>Les tournois sont momentanément indisponibles.</b><p>Réessayez dans quelques instants.</p></div>';
});
