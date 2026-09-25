const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let teams=[];
const root=document.querySelector('#all-teams');

const cleanTeamName=value=>String(value||'')
  .replace(/\s*\((?=[^)]*(?:19|20)\d{2})[^)]*\)\s*$/,'')
  .trim();

const displayTeamName=value=>cleanTeamName(value)
  .replace(/(U\s*\d{1,2}F?)\s*(?:-|–|—|à|À)\s*(U\s*\d{1,2}F?)/gi,'$1 – $2')
  .replace(/\s{2,}/g,' ');

const seasonEndYear=label=>{
  const years=String(label||'').match(/\d{4}/g)||[];
  const year=Number(years[years.length-1]);
  return Number.isInteger(year)?year:null;
};

const teamAgeBounds=name=>{
  const ages=[...new Set(
    [...cleanTeamName(name).matchAll(/U\s*(\d{1,2})/gi)]
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

const teamBirthYears=team=>{
  const endYear=seasonEndYear(team.season_label);
  if(!endYear)return [];
  return [...new Set(teamAgeBounds(team.name).map(age=>endYear-age))].sort((a,b)=>a-b);
};

const birthLabel=(team,years)=>{
  if(!years.length)return '';
  const feminine=team.group_name==='Féminines'||team.gender==='female';
  const born=feminine?'Nées':'Nés';
  if(years.length===1)return `${born} en ${years[0]}`;
  if(years.length===2)return `${born} en ${years[0]} · ${years[1]}`;
  return `${born} de ${years[0]} à ${years[years.length-1]}`;
};

function draw(group=''){
  const rows=teams.filter(team=>!group||team.group_name===group);
  root.innerHTML=rows.map((team,index)=>{
    const feminine=team.group_name==='Féminines'||team.gender==='female';
    const years=teamBirthYears(team);
    const name=displayTeamName(team.name);
    const yearsText=birthLabel(team,years);

    return `<a class="catalog-card tone-${index%4}" href="/equipes/fiche/?slug=${encodeURIComponent(team.slug)}">
      <div class="catalog-image"><img src="${esc(team.photo_url||'/team-default.webp')}" alt="${esc(team.photo_alt||`Photo du groupe ${name}`)}" loading="lazy" decoding="async"></div>
      <small>${esc(team.group_name)}</small>
      <h2>${esc(name)}</h2>
      ${yearsText?`<p class="catalog-birthyears">${esc(yearsText)}</p>`:''}
      <p class="catalog-level">${esc(team.level||'')}</p>
      <div class="catalog-card__footer"><span><b>${team.player_count||'—'}</b> ${feminine?'licenciées pratiquantes':'licenciés pratiquants'}</span><i>Voir la fiche →</i></div>
    </a>`;
  }).join('')||'<p>Aucune équipe dans cette section.</p>';
}

fetch('/api/page/teams?v=4').then(response=>response.json()).then(data=>{
  teams=(data.teams||[]).sort((a,b)=>String(a.name).localeCompare(String(b.name),'fr',{numeric:true,sensitivity:'base'}));
  draw();
});

document.querySelectorAll('[data-group]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-group]').forEach(item=>{
    const active=item===button;
    item.classList.toggle('active',active);
    item.setAttribute('aria-pressed',String(active));
  });
  draw(button.dataset.group);
}));
