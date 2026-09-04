const slug=new URLSearchParams(location.search).get('slug');
const set=(selector,value)=>{const node=document.querySelector(selector);if(node)node.textContent=value||'À renseigner'};
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const logo=(url,name)=>url?`<img class="match-logo" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<span class="match-logo fallback" aria-hidden="true">⚽</span>';
const roleLabels={coach_referent:'Coach référent',coach:'Coach',dirigeant:'Dirigeant',arbitre:'Arbitre'};
const dateFormat=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long'});
const timeFormat=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
const displayDate=value=>{const label=dateFormat.format(new Date(value));return label.charAt(0).toLocaleUpperCase('fr')+label.slice(1)};
const miniMatch=(match,future=false)=>`<article class="team-match-row">
  <time>${displayDate(match.starts_at)}</time>
  <small>${esc(match.event_type==='plateau'?'Plateau':match.competition)}</small>
  <div class="match-team">${logo(match.home_logo_url,match.home_team)}<b>${esc(match.home_team)}</b></div>
  <strong>${future?(Number(match.time_confirmed)===0?'À confirmer':timeFormat.format(new Date(match.starts_at))):`${match.home_score??'–'} : ${match.away_score??'–'}`}</strong>
  <div class="match-team">${logo(match.away_logo_url,match.away_team)}<b>${esc(match.away_team)}</b></div>
  <span>${esc(match.venue||match.venue_address||'Lieu à confirmer')}</span>
</article>`;

fetch(`/api/page/team-profile?slug=${encodeURIComponent(slug||'')}`).then(async response=>{
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||`Fiche équipe : ${response.status}`);
  return data;
}).then(({team,entries=[],sessions=[],staff=[],upcoming=[],results=[]})=>{
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
}).catch(error=>{console.error(error);document.querySelector('#team-name').textContent='Informations indisponibles';document.querySelector('#team-description').textContent='La connexion aux données du club a échoué. Merci de réessayer dans quelques instants.'});
