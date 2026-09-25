const esc=value=>String(value??'').replace(/[<>"'&]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

const cleanHomeTeamName=value=>String(value||'')
  .replace(/\s*\((?=[^)]*(?:19|20)\d{2})[^)]*\)\s*$/,'')
  .trim();

const displayHomeTeamName=value=>cleanHomeTeamName(value)
  .replace(/(U\s*\d{1,2}F?)\s*(?:-|–|—|à|À)\s*(U\s*\d{1,2}F?)/gi,'$1 – $2')
  .replace(/\s{2,}/g,' ');

const homeSeasonEndYear=label=>{
  const years=String(label||'').match(/\d{4}/g)||[];
  const year=Number(years[years.length-1]);
  return Number.isInteger(year)?year:null;
};

const homeTeamAges=name=>{
  const ages=[...new Set(
    [...cleanHomeTeamName(name).matchAll(/U\s*(\d{1,2})/gi)]
      .map(match=>Number(match[1]))
      .filter(age=>Number.isInteger(age)&&age>=5&&age<=20)
  )];

  if(!ages.length)return [];

  if(ages.length===2&&Math.abs(ages[0]-ages[1])>1){
    const start=Math.min(...ages);
    const end=Math.max(...ages);
    return Array.from({length:end-start+1},(_,index)=>start+index);
  }

  return ages;
};

const homeTeamBirthYears=team=>{
  const endYear=homeSeasonEndYear(team.season_label);
  if(!endYear)return [];

  return [...new Set(
    homeTeamAges(team.name).map(age=>endYear-age)
  )].sort((a,b)=>a-b);
};

const homeTeamBirthLabel=(team,years)=>{
  if(!years.length)return '';

  const feminine=
    team.group_name==='Féminines'
    ||team.gender==='female';

  const born=feminine?'Nées':'Nés';

  if(years.length===1)return `${born} en ${years[0]}`;
  if(years.length===2)return `${born} en ${years[0]} · ${years[1]}`;

  return `${born} de ${years[0]} à ${years[years.length-1]}`;
};

const homeTeamCard=(team,index)=>{
  const name=displayHomeTeamName(team.name);
  const years=homeTeamBirthYears(team);
  const yearsText=homeTeamBirthLabel(team,years);

  return `<a class="team-card tone-${index%4}" href="/equipes/fiche/?slug=${encodeURIComponent(team.slug)}">
    <span>${esc(team.group_name)}</span>
    <b>${esc(name)}</b>
    ${yearsText?`<p class="team-card-birthyears">${esc(yearsText)}</p>`:''}
    <small class="team-card-level">${esc(team.level||team.category||'')}</small>
    <i>→</i>
  </a>`;
};
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
  const address=String(match.venue_address||'').trim();
  const cityMatch=address.match(/\b\d{5}\s+([a-zà-öø-ÿ][a-zà-öø-ÿ'’ -]*)$/i),city=cityMatch?cityCase(cityMatch[1]):'';
  return city?`<small class="home-match-location">📍 <b>${esc(city)}</b></small>`:'';
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
  if(rail)rail.innerHTML=teams.map(homeTeamCard).join('');
  const kicker=document.querySelector('#home-match-kicker');
  if(kicker&&matches[0])kicker.textContent=relativeKickoff(matches[0].starts_at);
  const root=document.querySelector('#matches-list');
  if(root){
    root.classList.add('home-match-feed');
    root.classList.toggle('no-results',!results.length);
    root.innerHTML=`<div class="home-match-block"><h3>Prochaines rencontres</h3>${matches.map(match=>homeMatchCard(match)).join('')||'<p>Les prochaines rencontres arrivent bientôt.</p>'}</div>${results.length?`<div class="home-match-block"><h3>Derniers résultats</h3>${results.map(match=>homeMatchCard(match,true)).join('')}</div>`:''}`;
  }
});
