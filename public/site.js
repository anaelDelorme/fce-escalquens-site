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
const homeMatchCard=(match,result=false)=>`<article class="${result?'home-result':''}">
  <time>${homeDate(match.starts_at)}</time>
  <div><b>${esc(match.category||match.competition||'FC Escalquens')}</b><span>${esc(match.home_team)} ${result?`<strong>${match.home_score??'–'} : ${match.away_score??'–'}</strong>`:'<em>vs</em>'} ${esc(match.away_team)}</span></div>
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
