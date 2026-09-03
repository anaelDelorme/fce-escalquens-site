const slug=new URLSearchParams(location.search).get('slug');
const set=(selector,value)=>{const node=document.querySelector(selector);if(node)node.textContent=value||'À renseigner'};
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const logo=(url,name)=>url?`<img class="match-logo" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<span class="match-logo fallback" aria-hidden="true">⚽</span>';
const roleLabels={coach_referent:'Coach référent',coach:'Coach',dirigeant:'Dirigeant',arbitre:'Arbitre'};
const api=resource=>fetch(`/api/${resource}`).then(async response=>{if(!response.ok)throw new Error(`${resource}: ${response.status}`);const data=await response.json();return Array.isArray(data)?data:[]});
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

Promise.all([
  api('teams'),api('team_competitions').catch(()=>[]),api('training_sessions').catch(()=>[]),
  api('club_members').catch(()=>[]),api('team_staff').catch(()=>[]),api('venues').catch(()=>[]),
  api('matches').catch(()=>[]),api('seasons').catch(()=>[])
]).then(([teams,entries,sessions,members,assignments,venues,matches,seasons])=>{
  const team=teams.find(item=>item.slug===slug);
  if(!team){document.querySelector('#team-name').textContent='Équipe introuvable';return}
  document.title=`${team.name} - FC Escalquens`;set('#team-name',team.name);set('#team-description',team.description);set('#player-count',team.player_count||'—');
  const activeSeason=seasons.find(item=>item.active===1);
  const teamEntries=entries.filter(item=>item.team_id===team.id&&item.active!==0&&(!activeSeason||!item.season_id||item.season_id===activeSeason.id));
  set('#team-level',teamEntries.map(item=>[item.division||item.competition_name,item.pool].filter(Boolean).join(' · ')).filter(Boolean).join(' / ')||team.level);
  document.querySelector('#player-label').textContent=team.group_name==='Féminines'||team.gender==='female'?'licenciées pratiquantes':'licenciés pratiquants';
  document.querySelector('#team-photo').src=team.photo_key?`/media/${team.photo_key}`:'/team-default.webp';
  const memberMap=Object.fromEntries(members.map(member=>[member.id,member]));
  const staff=assignments.filter(item=>item.team_id===team.id&&item.active!==0).sort((a,b)=>a.display_order-b.display_order).map(item=>({...item,member:memberMap[item.member_id]})).filter(item=>item.member);
  document.querySelector('#team-staff').innerHTML=staff.map(item=>`<article>${item.member.photo_key?`<img src="/media/${esc(item.member.photo_key)}" alt="">`:''}<small>${roleLabels[item.role]||esc(item.role)}</small><h3>${esc(item.member.full_name)}</h3>${item.member.email?`<a href="mailto:${esc(item.member.email)}">${esc(item.member.email)}</a>`:''}${item.member.phone?`<a href="tel:${esc(item.member.phone)}">${esc(item.member.phone)}</a>`:''}</article>`).join('')||'<p>Encadrement à venir.</p>';
  const days=['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'],venueMap=Object.fromEntries(venues.map(venue=>[venue.id,venue]));
  document.querySelector('#team-training').innerHTML=sessions.filter(row=>row.team_id===team.id).map(row=>{const venue=venueMap[row.venue_id],query=venue?.latitude!=null&&venue?.longitude!=null?`${venue.latitude},${venue.longitude}`:venue?.address||row.address||venue?.name||row.venue,link=venue?.maps_url||`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;return `<article><b>${days[row.weekday]}</b><span>${row.starts_at} - ${row.ends_at}</span><small>${esc(venue?.name||row.venue)}</small><a href="${link}" target="_blank" rel="noopener">Itinéraire →</a></article>`}).join('')||'<p>Horaires à venir.</p>';
  const related=matches.filter(match=>(!activeSeason||!match.season_id||match.season_id===activeSeason.id)&&match.team_id===team.id);
  const upcoming=related.filter(match=>match.status!=='finished'&&new Date(match.starts_at)>=new Date()).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)).slice(0,5);
  const results=related.filter(match=>match.status==='finished'||(match.home_score!=null&&match.away_score!=null)).sort((a,b)=>new Date(b.starts_at)-new Date(a.starts_at)).slice(0,5);
  document.querySelector('#team-upcoming').innerHTML=upcoming.map(match=>miniMatch(match,true)).join('')||'<p>Les prochaines rencontres arrivent bientôt.</p>';
  document.querySelector('#team-results').innerHTML=results.map(match=>miniMatch(match,false)).join('')||'<p>Aucun résultat publié pour ce groupe.</p>';
}).catch(error=>{console.error(error);document.querySelector('#team-name').textContent='Informations indisponibles';document.querySelector('#team-description').textContent='La connexion aux données du club a échoué. Merci de réessayer dans quelques instants.'});
