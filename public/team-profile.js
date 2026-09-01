const slug=new URLSearchParams(location.search).get('slug');
const set=(id,value)=>{const node=document.querySelector(id);if(node)node.textContent=value||'À renseigner'};
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const roleLabels={coach_referent:'Coach référent',coach:'Coach',dirigeant:'Dirigeant',arbitre:'Arbitre'};
Promise.all(['teams','training_sessions','club_members','team_staff'].map(resource=>fetch(`/api/${resource}`).then(response=>response.json()))).then(([teams,sessions,members,assignments])=>{
  const team=teams.find(item=>item.slug===slug);if(!team){document.querySelector('#team-name').textContent='Équipe introuvable';return}
  document.title=`${team.name} - FC Escalquens`;set('#team-name',team.name);set('#team-description',team.description);set('#player-count',team.player_count||'—');set('#team-level',team.level);
  if(team.photo_key)document.querySelector('#team-photo').src=`/media/${team.photo_key}`;
  const memberMap=Object.fromEntries(members.map(member=>[member.id,member]));
  const staff=assignments.filter(item=>item.team_id===team.id&&item.active!==0).sort((a,b)=>a.display_order-b.display_order).map(item=>({...item,member:memberMap[item.member_id]})).filter(item=>item.member);
  document.querySelector('#team-staff').innerHTML=staff.map(item=>`<article>${item.member.photo_key?`<img src="/media/${esc(item.member.photo_key)}" alt="">`:''}<small>${roleLabels[item.role]||esc(item.role)}</small><h3>${esc(item.member.full_name)}</h3>${item.member.email?`<a href="mailto:${esc(item.member.email)}">${esc(item.member.email)}</a>`:''}${item.member.phone?`<a href="tel:${esc(item.member.phone)}">${esc(item.member.phone)}</a>`:''}</article>`).join('')||'<p>Encadrement à venir.</p>';
  const days=['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  document.querySelector('#team-training').innerHTML=sessions.filter(row=>row.team_id===team.id||row.category===team.category).map(row=>`<article><b>${days[row.weekday]}</b><span>${row.starts_at} - ${row.ends_at}</span><small>${esc(row.venue)}</small><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.address||row.venue)}" target="_blank">Itinéraire →</a></article>`).join('')||'<p>Horaires à venir.</p>';
});
