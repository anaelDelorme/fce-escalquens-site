const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const safeHttpUrl=value=>{
  if(!value)return '';
  try{
    const url=new URL(String(value),location.origin);
    return ['http:','https:'].includes(url.protocol)?url.href:'';
  }catch{return ''}
};
let teams=[],sessions=[],venues=[];
const days=['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const mapsLink=(venue,row)=>{
  const configured=safeHttpUrl(venue?.maps_url);
  if(configured)return configured;
  if(venue?.latitude!=null&&venue?.longitude!=null)return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(String(venue.latitude)+','+String(venue.longitude));
  return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(String(venue?.address||row.address||venue?.name||row.venue||''));
};
const draw=()=>{
  const section=document.querySelector('#section-filter').value,teamId=document.querySelector('#team-filter').value,day=document.querySelector('#day-filter').value;
  const teamMap=Object.fromEntries(teams.map(item=>[item.id,item])),venueMap=Object.fromEntries(venues.map(item=>[item.id,item]));
  const rows=sessions.filter(item=>(!teamId||String(item.team_id)===teamId)&&(!day||String(item.weekday)===day)&&(!section||teamMap[item.team_id]?.group_name===section));
  document.querySelector('#planning-list').innerHTML=rows.map(row=>{
    const team=teamMap[row.team_id],venue=venueMap[row.venue_id];
    return '<article><time><b>'+esc(days[row.weekday]||'')+'</b><span>'+esc(row.starts_at)+' - '+esc(row.ends_at)+'</span></time><div><small>'+esc(team?.group_name||'Club')+'</small><h3>'+esc(team?.name||row.category)+'</h3></div><div><b>'+esc(venue?.name||row.venue)+'</b><span>'+esc(venue?.address||row.address)+'</span></div><a href="'+esc(mapsLink(venue,row))+'" target="_blank" rel="noopener">Voir sur Maps →</a></article>';
  }).join('')||'<p>Aucun entraînement avec ces filtres.</p>';
};
fetch('/api/page/planning').then(response=>response.json()).then(data=>{
  teams=(data.teams||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'fr',{numeric:true,sensitivity:'base'}));
  sessions=data.sessions||[];venues=data.venues||[];
  document.querySelector('#team-filter').innerHTML+=teams.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.name)+'</option>').join('');
  draw();
});
document.querySelectorAll('.planning-controls select').forEach(select=>select.addEventListener('change',draw));
