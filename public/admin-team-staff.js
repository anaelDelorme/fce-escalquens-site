(()=>{
  const collator=new Intl.Collator('fr',{numeric:true,sensitivity:'base'});
  const roleLabels={coach_referent:'Coach référent',coach:'Coach',dirigeant:'Dirigeant',arbitre:'Arbitre'};
  const filters={group:'',team:'',member:'',role:'',search:''};
  let staffRows=[];
  const text=value=>String(value??'');
  const norm=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim();
  const teamFor=row=>references.teams.find(team=>String(team.id)===String(row.team_id));
  const memberFor=row=>references.club_members.find(member=>String(member.id)===String(row.member_id));
  const teamName=row=>teamFor(row)?.name||`Groupe #${row.team_id}`;
  const memberName=row=>memberFor(row)?.full_name||`Licencié #${row.member_id}`;
  const roleName=row=>roleLabels[row.role]||row.role||'Rôle non renseigné';
  const sortedRows=rows=>[...rows].sort((a,b)=>collator.compare(teamName(a),teamName(b))||((a.role==='coach_referent'?0:1)-(b.role==='coach_referent'?0:1))||collator.compare(memberName(a),memberName(b)));
  const option=(value,label,selected)=>`<option value="${esc(value)}" ${String(value)===String(selected)?'selected':''}>${esc(label)}</option>`;
  const filteredRows=()=>sortedRows(staffRows).filter(row=>{
    const team=teamFor(row),member=memberFor(row);
    if(filters.group&&team?.group_name!==filters.group)return false;
    if(filters.team&&String(row.team_id)!==filters.team)return false;
    if(filters.member&&String(row.member_id)!==filters.member)return false;
    if(filters.role&&row.role!==filters.role)return false;
    if(filters.search){const haystack=norm([team?.name,team?.group_name,member?.full_name,roleName(row)].filter(Boolean).join(' '));if(!haystack.includes(norm(filters.search)))return false}
    return true;
  });
  const choices=()=>{
    const groups=[...new Set(staffRows.map(row=>teamFor(row)?.group_name).filter(Boolean))].sort(collator.compare);
    const allowedTeams=[...new Map(staffRows.filter(row=>!filters.group||teamFor(row)?.group_name===filters.group).map(row=>[String(row.team_id),teamFor(row)])).values()].filter(Boolean).sort((a,b)=>collator.compare(a.name,b.name));
    if(filters.team&&!allowedTeams.some(team=>String(team.id)===filters.team))filters.team='';
    const allowedMembers=[...new Map(staffRows.filter(row=>(!filters.group||teamFor(row)?.group_name===filters.group)&&(!filters.team||String(row.team_id)===filters.team)).map(row=>[String(row.member_id),memberFor(row)])).values()].filter(Boolean).sort((a,b)=>collator.compare(a.full_name,b.full_name));
    if(filters.member&&!allowedMembers.some(member=>String(member.id)===filters.member))filters.member='';
    return {groups,teams:allowedTeams,members:allowedMembers};
  };
  function bindCards(){
    document.querySelectorAll('[data-staff-edit]').forEach(button=>button.onclick=()=>open(JSON.parse(decodeURIComponent(button.dataset.staffEdit))));
    document.querySelectorAll('[data-staff-delete]').forEach(button=>button.onclick=()=>remove(button.dataset.staffDelete));
  }
  function render(focusSearch=false){
    const root=document.querySelector('#records');if(!root||current!=='team_staff')return;
    const {groups,teams,members}=choices(),rows=filteredRows(),byTeam=new Map();
    rows.forEach(row=>{const key=String(row.team_id);if(!byTeam.has(key))byTeam.set(key,[]);byTeam.get(key).push(row)});
    const teamBlocks=[...byTeam.entries()].sort((a,b)=>collator.compare(teamName(a[1][0]),teamName(b[1][0]))).map(([,items])=>{
      const team=teamFor(items[0]),name=team?.name||teamName(items[0]);
      return `<section class="staff-team-group" aria-labelledby="staff-team-${esc(team?.id||items[0].team_id)}"><header class="staff-team-heading"><h2 id="staff-team-${esc(team?.id||items[0].team_id)}">${esc(name)}</h2><small>${items.length} encadrant${items.length>1?'s':''}${team?.group_name?` · ${esc(team.group_name)}`:''}</small></header><div class="staff-team-list">${items.map(row=>`<article class="staff-assignment ${row.role==='coach_referent'?'is-referent':''}"><div class="staff-assignment-copy"><b>${esc(memberName(row))}</b><span class="staff-role">${esc(roleName(row))}</span>${Number(row.active)===0?'<small>Inactif</small>':''}</div><button type="button" data-staff-edit="${encodeURIComponent(JSON.stringify(row))}">Modifier</button><button type="button" data-staff-delete="${esc(row.id)}">Supprimer</button></article>`).join('')}</div></section>`;
    }).join('');
    root.innerHTML=`<div class="staff-admin"><div class="staff-toolbar" role="search" aria-label="Filtrer les affectations aux équipes"><label>Groupe<select id="staff-group-filter"><option value="">Tous les groupes</option>${groups.map(value=>option(value,value,filters.group)).join('')}</select></label><label>Équipe<select id="staff-team-filter"><option value="">Toutes les équipes</option>${teams.map(team=>option(team.id,team.name,filters.team)).join('')}</select></label><label>Coach / encadrant<select id="staff-member-filter"><option value="">Tous les encadrants</option>${members.map(member=>option(member.id,member.full_name,filters.member)).join('')}</select></label><label>Rôle<select id="staff-role-filter"><option value="">Tous les rôles</option>${Object.entries(roleLabels).map(([key,label])=>option(key,label,filters.role)).join('')}</select></label><label>Recherche<input id="staff-search" type="search" value="${esc(filters.search)}" placeholder="Nom, équipe, groupe…"></label><div class="staff-toolbar-actions"><p id="staff-filter-count" role="status" aria-live="polite">${rows.length} affectation${rows.length>1?'s':''} · ${byTeam.size} équipe${byTeam.size>1?'s':''}</p><button class="staff-reset" id="staff-reset" type="button">Réinitialiser les filtres</button></div></div>${teamBlocks||'<p class="staff-empty">Aucune affectation ne correspond à ces filtres.</p>'}</div>`;
    const rerender=(name,value,focus=false)=>{filters[name]=value;render(focus)};
    document.querySelector('#staff-group-filter').onchange=e=>{filters.team='';filters.member='';rerender('group',e.target.value)};
    document.querySelector('#staff-team-filter').onchange=e=>{filters.member='';rerender('team',e.target.value)};
    document.querySelector('#staff-member-filter').onchange=e=>rerender('member',e.target.value);
    document.querySelector('#staff-role-filter').onchange=e=>rerender('role',e.target.value);
    document.querySelector('#staff-search').oninput=e=>rerender('search',e.target.value,true);
    document.querySelector('#staff-reset').onclick=()=>{Object.keys(filters).forEach(key=>filters[key]='');render()};
    bindCards();
    if(focusSearch){const search=document.querySelector('#staff-search');search?.focus();const end=search?.value.length||0;search?.setSelectionRange?.(end,end)}
  }
  function collectRenderedRows(){
    return [...document.querySelectorAll('#records [data-edit]')].map(button=>{try{return JSON.parse(button.dataset.edit)}catch{return null}}).filter(Boolean);
  }
  function syncCollectionState(){document.querySelectorAll('#collections [data-name]').forEach(button=>button.setAttribute('aria-pressed',String(button.classList.contains('active'))))}
  function enhance(){
    syncCollectionState();
    document.querySelector('#sync-health')?.classList.toggle('is-compact',current==='team_staff');
    if(current!=='team_staff')return;
    staffRows=collectRenderedRows();
    render();
  }
  if(typeof load==='function'){
    const baseLoad=load;
    load=async function(){const result=await baseLoad.apply(this,arguments);enhance();return result};
  }
  document.querySelectorAll('#collections [data-name]').forEach(button=>button.addEventListener('click',()=>setTimeout(syncCollectionState,0)));
  syncCollectionState();
})();
