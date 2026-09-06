const esc=value=>String(value??'').replace(/[<>"'&]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const homeDate=value=>new Date(value).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short'});
const relativeKickoff=value=>{
  const days=Math.max(0,Math.round((new Date(value).getTime()-Date.now())/86400000));
  if(days===0)return 'Aujourd’hui';
  if(days===1)return 'Demain';
  if(days<7)return 'Cette semaine';
  const weeks=Math.max(1,Math.round(days/7));
  return weeks===1?'La semaine prochaine':`Dans ${weeks} semaines`;
};
const cityCase=value=>String(value||'').trim().toLocaleLowerCase('fr').replace(/(^|[\s'’-])([a-zà-öø-ÿ])/g,(_,before,letter)=>before+letter.toLocaleUpperCase('fr'));
const homeLocation=match=>{
  const venue=String(match.venue||'').trim(),address=String(match.venue_address||'').trim();
  const cityMatch=address.match(/\b\d{5}\s+([a-zà-öø-ÿ][a-zà-öø-ÿ'’ -]*)$/i),city=cityMatch?cityCase(cityMatch[1]):'',stadium=venue||(!city?address:'');
  if(!stadium&&!city)return '';
  const map=match.latitude!=null&&match.longitude!=null?`https://www.google.com/maps/search/?api=1&query=${match.latitude},${match.longitude}`:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([venue,address].filter(Boolean).join(' '))}`;
  return `<small class="home-match-location">📍 ${city?`<b>${esc(city)}</b>${stadium?', ':''}`:''}${stadium?`<a href="${esc(map)}" target="_blank" rel="noopener">${esc(stadium)}</a>`:''}</small>`;
};
const homeMatchCard=(match,result=false)=>`<article class="${result?'home-result':''}">
  <time>${homeDate(match.starts_at)}</time>
  <div><b>${esc(match.category||match.competition||'FC Escalquens')}</b><span>${esc(match.home_team)} ${result?`<strong>${match.home_score??'–'} : ${match.away_score??'–'}</strong>`:'<em>vs</em>'} ${esc(match.away_team)}</span>${homeLocation(match)}</div>
</article>`;

window.fceHomeData=window.fceHomeData||fetch('/api/page/home').then(async response=>{
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||`Accueil : ${response.status}`);
  return data;
});

window.fceHomeData.then(data=>{
  const teams=(data.teams||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'fr',{numeric:true,sensitivity:'base'}));
  const matches=data.matches||[],results=data.results||[];
  const rail=document.querySelector('#teams-list');
  if(rail)rail.innerHTML=teams.map((team,index)=>`<a class="team-card tone-${index%4}" href="/equipes/fiche/?slug=${encodeURIComponent(team.slug)}"><span>${esc(team.group_name)}</span><b>${esc(team.name)}</b><small>${esc(team.level||team.category)}</small><i>→</i></a>`).join('');
  const kicker=document.querySelector('#home-match-kicker');
  if(kicker&&matches[0])kicker.textContent=relativeKickoff(matches[0].starts_at);
  const root=document.querySelector('#matches-list');
  if(root){
    root.classList.add('home-match-feed');
    root.classList.toggle('no-results',!results.length);
    root.innerHTML=`<div class="home-match-block"><h3>Prochaines rencontres</h3>${matches.map(match=>homeMatchCard(match)).join('')||'<p>Les prochaines rencontres arrivent bientôt.</p>'}</div>${results.length?`<div class="home-match-block"><h3>Derniers résultats</h3>${results.map(match=>homeMatchCard(match,true)).join('')}</div>`:''}`;
  }
});
