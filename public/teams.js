const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let teams=[];
const root=document.querySelector('#all-teams');
function draw(group=''){
  const rows=teams.filter(team=>team.active!==0&&(!group||team.group_name===group));
  root.innerHTML=rows.map((team,index)=>{
    const feminine=team.group_name==='Féminines'||team.gender==='female';
    return `<a class="catalog-card tone-${index%4}" href="/equipes/fiche/?slug=${encodeURIComponent(team.slug)}">
      <div class="catalog-image"><img src="${team.photo_key?`/media/${esc(team.photo_key)}`:'/team-default.webp'}" alt="${team.photo_key?`Photo du groupe ${esc(team.name)}`:'Visuel par défaut du FC Escalquens'}"></div>
      <small>${esc(team.group_name)}</small><h2>${esc(team.name)}</h2><p>${esc(team.level)}</p>
      <div><b>${team.player_count||'—'}</b> ${feminine?'licenciées pratiquantes':'licenciés pratiquants'} <i>Voir la fiche →</i></div>
    </a>`;
  }).join('')||'<p>Aucune équipe dans cette section.</p>';
}
fetch('/api/teams').then(response=>response.json()).then(rows=>{teams=rows;draw()});
document.querySelectorAll('[data-group]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-group]').forEach(item=>item.classList.remove('active'));
  button.classList.add('active');draw(button.dataset.group);
}));
