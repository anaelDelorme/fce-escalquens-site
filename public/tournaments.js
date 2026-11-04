const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const date=value=>value?new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):'';
const statusLabels={open:'Inscriptions ouvertes',published:'À venir',finished:'Terminé'};

const richInline=value=>{
  let html=esc(value);
  html=html.replace(/\*\*([^*]+?)\*\*/g,'<strong>$1</strong>');
  html=html.replace(/(^|[^*])\*([^*\n]+?)\*/g,'$1<em>$2</em>');
  return html;
};

const richText=value=>{
  const source=String(value||'').replace(/\r/g,'').trim();
  if(!source)return '';

  return source
    .split(/\n\s*\n/)
    .map(block=>{
      const lines=block.split('\n');
      const isList=lines.length>0&&lines.every(line=>/^\s*-\s+/.test(line));

      if(isList){
        return `<ul>${lines.map(line=>`<li>${richInline(line.replace(/^\s*-\s+/,''))}</li>`).join('')}</ul>`;
      }

      return `<p>${lines.map(line=>richInline(line)).join('<br>')}</p>`;
    })
    .join('');
};

let tournaments=[],links=[],teams=[],venues=[],sales=[];
function categories(row){try{return Array.isArray(row.categories)?row.categories:JSON.parse(row.categories||'[]')}catch{return []}}
function participatingTeams(id){const ids=links.filter(link=>link.tournament_id===id).map(link=>link.team_id);return teams.filter(team=>ids.includes(team.id))}
function visual(row){
  const sale=sales.find(item=>item.id===row.id);
  const badge=row.status==='open'&&!sale?.available?(sale?.enabled?'Inscriptions closes':'Inscriptions à venir'):(statusLabels[row.status]||'Tournoi');
  const source=row.image_key||row.poster_key||'';
  const posterOnly=!row.image_key&&row.poster_key;
  const image=source
    ?`<img class="tournament-cover ${posterOnly?'tournament-cover--poster':'tournament-cover--image'}" src="/media/${esc(source)}" alt="${posterOnly?'Affiche':'Visuel'} du tournoi ${esc(row.name)}" loading="lazy">`
    :`<div class="tournament-cover-placeholder"><img src="/logo-fce.webp" alt=""><span>FC Escalquens</span></div>`;
  const poster=row.poster_key&&row.image_key
    ?`<a class="tournament-poster-peek" href="/media/${esc(row.poster_key)}" target="_blank" rel="noopener"><img src="/media/${esc(row.poster_key)}" alt=""><span>Voir l’affiche</span></a>`
    :'';
  return `<div class="tournament-visual">${image}<span class="tournament-status tournament-status--${esc(row.status)}">${esc(badge)}</span>${poster}</div>`;
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
    const audience=fallbackCategories.length?fallbackCategories:labels;
    const location=venue?.name||row.venue||'Lieu à confirmer';
    let mapUrl='';
    if(venue){
      try{const url=new URL(venue.maps_url);if(url.protocol==='https:')mapUrl=url.href;}catch{}
      if(!mapUrl&&venue.address)mapUrl='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(venue.name+' '+venue.address);
    }
    const sale=sales.find(item=>item.id===row.id);
    const price=sale?.fee_cents?new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(sale.fee_cents/100)+' par équipe':String(row.registration_price||'').trim()||'Tarif à confirmer';
    return `<article class="tournament-card">
      ${visual(row)}
      <div class="tournament-card-body">
        <div class="tournament-kicker">${audience.length?audience.map(item=>`<span>${esc(item)}</span>`).join(''):'<span>Toutes les équipes</span>'}</div>
        <h2>${esc(row.name)}</h2>
        ${row.summary?`<div class="tournament-summary tournament-summary-rich">${richText(row.summary)}</div>`:''}
        <dl class="tournament-facts">
          <div><dt>Date</dt><dd>${esc(date(row.starts_on))}${row.ends_on&&row.ends_on!==row.starts_on?`<small>au ${esc(date(row.ends_on))}</small>`:''}</dd></div>
          <div><dt>Lieu</dt><dd>${esc(location)}${venue?.address?`<small>${esc(venue.address)}</small>`:''}${mapUrl?`<a class="tournament-map-link" href="${esc(mapUrl)}" target="_blank" rel="noopener noreferrer">Itinéraire ↗</a>`:''}</dd></div>
          <div class="tournament-price"><dt>Inscription</dt><dd>${esc(price)}</dd></div>
        </dl>
        ${sale&&!sale.available?`<p class="tournament-registration-state">${esc(sale.unavailable_reason||"Les inscriptions ne sont pas ouvertes.")}</p>`:!sale?'<p class="tournament-registration-state">Les modalités d’inscription seront précisées ici.</p>':''}
        ${row.organizer?`<p class="tournament-organizer">Organisé par <b>${esc(row.organizer)}</b></p>`:''}
        <div class="tournament-actions">
          ${sale?.available?`<button class="tournament-action tournament-action--primary" data-tournament-register="${row.id}">Inscrire mes équipes →</button>`:''}
          ${row.tournify_url?`<a class="tournament-action" href="${esc(row.tournify_url)}" target="_blank" rel="noopener">Tournify →</a>`:''}
          ${row.poster_key?`<a class="tournament-action" href="/media/${esc(row.poster_key)}" target="_blank" rel="noopener">Voir l’affiche</a>`:''}
          ${row.rules_key?`<a class="tournament-action" href="/media/${esc(row.rules_key)}" target="_blank" rel="noopener">Règlement</a>`:''}
        </div>
      </div>
    </article>`;
  }).join('')||'<div class="empty-state"><b>Les prochains tournois arrivent bientôt.</b><p>Les informations seront publiées ici dès leur confirmation.</p></div>';
}
fetch('/api/page/tournaments',{cache:'no-store'}).then(async response=>{
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||`Tournois : ${response.status}`);
  return data;
}).then(async data=>{
  try {
    const result=await fetch("/api/tournaments/catalogue",{cache:"no-store"});
    if(!result.ok)throw new Error("Configuration des inscriptions indisponible");
    sales=(await result.json()).tournaments||[];
  } catch(error) {
    const message=document.createElement('p');message.className='tournament-registration-state';message.setAttribute('role','status');message.textContent='Les informations des tournois sont disponibles, mais les tarifs et inscriptions ne peuvent pas être chargés. Rechargez la page ou contactez le club.';document.querySelector('#tournaments-list').before(message);
  }
  tournaments=data.tournaments||[];
  links=data.links||[];
  teams=data.teams||[];
  venues=data.venues||[];
  draw();
}).catch(error=>{
  console.error(error);
  document.querySelector('#tournaments-list').innerHTML='<div class="empty-state"><b>Les tournois sont momentanément indisponibles.</b><p>Réessayez dans quelques instants.</p></div>';
});
