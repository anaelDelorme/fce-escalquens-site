const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const date=value=>value?new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):'';
let tournaments=[],links=[],teams=[],venues=[],filter='';
function categories(row){try{return Array.isArray(row.categories)?row.categories:JSON.parse(row.categories||'[]')}catch{return []}}
function participatingTeams(id){const ids=links.filter(link=>link.tournament_id===id).map(link=>link.team_id);return teams.filter(team=>ids.includes(team.id))}
function draw(){
  const rows=tournaments.filter(row=>['published','open','finished'].includes(row.status)&&(!filter||participatingTeams(row.id).some(team=>team.group_name===filter||team.name===filter)||categories(row).includes(filter)));
  document.querySelector('#tournaments-list').innerHTML=rows.map(row=>{
    const participants=participatingTeams(row.id),venue=venues.find(item=>item.id===row.venue_id);
    return `<article class="tournament-card"><div class="tournament-date"><b>${date(row.starts_on)}</b>${row.ends_on&&row.ends_on!==row.starts_on?`<span>au ${date(row.ends_on)}</span>`:''}</div><div><small>${participants.map(team=>esc(team.name)).join(' · ')||categories(row).map(esc).join(' · ')||'Toutes les équipes'}</small><h2>${esc(row.name)}</h2><p>${esc(row.summary)}</p><span class="tournament-place">${esc(venue?.name||row.venue)}${row.organizer?` · organisé par ${esc(row.organizer)}`:''}</span><div class="tournament-actions">${row.tournify_url?`<a href="${esc(row.tournify_url)}" target="_blank" rel="noopener">Suivre sur Tournify →</a>`:''}${row.registration_url?`<a href="${esc(row.registration_url)}" target="_blank" rel="noopener">S’inscrire →</a>`:''}${row.rules_key?`<a href="/media/${esc(row.rules_key)}" target="_blank">Voir le règlement</a>`:''}</div></div></article>`;
  }).join('')||'<div class="empty-state"><b>Les prochains tournois arrivent bientôt.</b><p>Les informations seront publiées ici dès leur confirmation.</p></div>';
}
Promise.all(['tournaments','tournament_teams','teams','venues'].map(resource=>fetch(`/api/${resource}`).then(response=>response.json()))).then(data=>{
  [tournaments,links,teams,venues]=data;
  const choices=[...new Set(teams.filter(team=>links.some(link=>link.team_id===team.id)).flatMap(team=>[team.group_name,team.name]).filter(Boolean))];
  document.querySelector('#tournament-filters').innerHTML=`<button class="active" data-category="">Tous</button>`+choices.map(choice=>`<button data-category="${esc(choice)}">${esc(choice)}</button>`).join('');
  document.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>{filter=button.dataset.category;document.querySelectorAll('[data-category]').forEach(item=>item.classList.toggle('active',item===button));draw()});
  draw();
});
