const schemas={
  teams:['name','group_name','level','gender','description','player_count','photo_key','active'],
  club_members:['full_name','email','phone','license_number','photo_key','notes','active'],
  team_staff:['team_id','member_id','role','active'],
  training_sessions:['team_id','weekday','starts_at','ends_at','venue','address','notes','active'],
  contacts:['name','role','category','email','phone','responsibilities','availability','published'],
  tournaments:['name','summary','starts_on','ends_on','venue','categories','registration_url','rules_key','status'],
  matches:['source','source_id','category','competition','starts_at','venue','home_team','away_team','home_score','away_score','status'],
  standings:['source','phase_id','team_id','team_name','position','played','won','drawn','lost','goals_for','goals_against','points'],
  documents:['slug','title','kind','object_key','published'],
  admins:['email','name','active']
};
const collectionLabels={teams:'Équipes',club_members:'Licenciés & encadrants',team_staff:'Affectations aux équipes',training_sessions:'Entraînements',contacts:'Contacts',tournaments:'Tournois',matches:'Matchs',standings:'Classements',documents:'Documents',admins:'Administrateurs'};
const labels={slug:'Identifiant URL',name:'Nom',full_name:'Nom et prénom',category:'Domaine',group_name:'Catégorie du club',level:'Niveau',gender:'Genre',description:'Présentation',player_count:'Nombre de licenciés',photo_key:'Photo',license_number:'Numéro de licence',member_id:'Licencié / encadrant',display_order:'Ordre d’affichage',active:'Actif',team_id:'Équipe',weekday:'Jour',starts_at:'Heure de début',ends_at:'Heure de fin',venue:'Terrain / lieu',address:'Adresse',notes:'Notes',role:'Rôle dans l’équipe',email:'Email',phone:'Téléphone',responsibilities:'Missions / sujets traités',availability:'Disponibilités',published:'Publié',summary:'Résumé',starts_on:'Date de début',ends_on:'Date de fin',categories:'Catégories concernées',registration_url:'Lien d’inscription',rules_key:'Règlement PDF',status:'Statut',source:'Source',source_id:'Identifiant source',competition:'Compétition',home_team:'Équipe à domicile',away_team:'Équipe à l’extérieur',home_score:'Score domicile',away_score:'Score extérieur',phase_id:'Identifiant phase',team_name:'Nom de l’équipe',position:'Position',played:'Matchs joués',won:'Victoires',drawn:'Nuls',lost:'Défaites',goals_for:'Buts pour',goals_against:'Buts contre',points:'Points',title:'Titre',kind:'Type de document',object_key:'Fichier'};
const booleans=new Set(['active','published']);
const numbers=new Set(['team_id','weekday','player_count','display_order','home_score','away_score','position','played','won','drawn','lost','goals_for','goals_against','points']);
const files=new Set(['photo_key','rules_key','object_key']);
const textareas=new Set(['description','summary','notes','responsibilities']);
const clubCategories=['Seniors','Formation','Académie','Féminines'];
const options={group_name:clubCategories.map(value=>[value,value]),level:[['','Non renseigné'],['Football d’animation','Football d’animation'],['Plateaux','Plateaux'],['District','District'],['Départemental','Départemental'],['D1','Départemental 1'],['D2','Départemental 2'],['D3','Départemental 3'],['D4','Départemental 4'],['R1','Régional 1'],['R2','Régional 2'],['R3','Régional 3'],['Loisirs','Loisirs']],gender:[['mixed','Mixte'],['female','Féminin'],['male','Masculin']],weekday:[[1,'Lundi'],[2,'Mardi'],[3,'Mercredi'],[4,'Jeudi'],[5,'Vendredi'],[6,'Samedi'],[7,'Dimanche']],role:[['coach_referent','Coach référent'],['coach','Coach'],['dirigeant','Dirigeant'],['arbitre','Arbitre']],status:[['draft','Brouillon'],['published','Publié'],['open','Ouvert'],['closed','Fermé'],['finished','Terminé']],kind:[['photo','Photo'],['pdf','PDF'],['boutique','Boutique']]};
let current='teams',editing=null,editingRow={},token=sessionStorage.getItem('admin-token')||'',references={teams:[],club_members:[]};
const $=selector=>document.querySelector(selector);
const authHeaders=()=>token?{authorization:`Bearer ${token}`}:{},jsonHeaders=()=>({'content-type':'application/json',...authHeaders()});
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
async function load(){
  if(current==='team_staff'&&(!references.teams.length||!references.club_members.length)){const [teams,members]=await Promise.all([fetch('/admin-api/teams').then(r=>r.json()),fetch('/admin-api/club_members').then(r=>r.json())]);references={teams,club_members:members}}
  $('#status').textContent='Chargement…';
  const response=await fetch(`/admin-api/${current}`,{headers:jsonHeaders()});const rows=await response.json();
  $('#status').textContent=response.ok?'':rows.error;
  const recordTitle=row=>current==='team_staff'?`${references.teams.find(x=>x.id===row.team_id)?.name||`Équipe #${row.team_id}`} — ${references.club_members.find(x=>x.id===row.member_id)?.full_name||`Licencié #${row.member_id}`}`:row.full_name||row.name||row.title||row.category||row.slug||`#${row.id}`;
  $('#records').innerHTML=response.ok?rows.map(row=>`<article><div><b>${esc(recordTitle(row))}</b><small>${esc(options.role?.find(x=>x[0]===row.role)?.[1]||row.role||row.group_name||row.venue||row.starts_at||'')}</small></div><button data-edit='${JSON.stringify(row).replace(/'/g,'&#39;')}'>Modifier</button><button data-delete="${row.id}">Supprimer</button></article>`).join(''):'';
  document.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>open(JSON.parse(button.dataset.edit)));
  document.querySelectorAll('[data-delete]').forEach(button=>button.onclick=()=>remove(button.dataset.delete));
}
function field(name,value){
  const title=`<span>${labels[name]||name}</span><small>${name}</small>`;
  if(booleans.has(name))return `<label class="toggle-field"><span class="field-title">${title}</span><input type="hidden" name="${name}" value="0"><input type="checkbox" name="${name}" value="1" ${Number(value)!==0?'checked':''}><i></i><b>${Number(value)!==0?'Oui':'Non'}</b></label>`;
  if(files.has(name))return `<label class="file-field"><span class="field-title">${title}</span><input type="hidden" name="${name}" value="${esc(value)}"><input type="file" data-upload="${name}" accept="${name==='photo_key'?'image/*':'.pdf,image/*'}"><span class="file-state">${value?`Fichier actuel : ${esc(value)}`:'Choisir un fichier'}</span>${value&&name==='photo_key'?`<img src="/media/${esc(value)}" alt="Aperçu">`:''}</label>`;
  if(name==='team_id'||name==='member_id'){const rows=name==='team_id'?references.teams:references.club_members;return `<label><span class="field-title">${title}</span><select name="${name}"><option value="">Sélectionner…</option>${rows.map(row=>`<option value="${row.id}" ${String(row.id)===String(value)?'selected':''}>${esc(row.name||row.full_name)}</option>`).join('')}</select></label>`}
  if(name==='category'&&current==='contacts'){const choices=['Club',...clubCategories,'Mécénat','Bureau','Technique'];return `<label><span class="field-title">${title}</span><select name="${name}">${choices.map(choice=>`<option value="${choice}" ${choice===value?'selected':''}>${choice}</option>`).join('')}</select></label>`}
  if(name==='categories'&&current==='tournaments'){let selected=[];try{selected=Array.isArray(value)?value:JSON.parse(value||'[]')}catch{}return `<fieldset class="wide multi-field"><legend>${labels[name]} <small>${name}</small></legend>${clubCategories.map(choice=>`<label><input type="checkbox" data-category-choice value="${choice}" ${selected.includes(choice)?'checked':''}><span>${choice}</span></label>`).join('')}</fieldset>`}
  if(options[name]&&(name!=='role'||current==='team_staff'))return `<label><span class="field-title">${title}</span><select name="${name}">${options[name].map(([key,text])=>`<option value="${key}" ${String(key)===String(value)?'selected':''}>${text}</option>`).join('')}</select></label>`;
  if(textareas.has(name))return `<label class="wide"><span class="field-title">${title}</span><textarea name="${name}" rows="4">${esc(value)}</textarea></label>`;
  const type=numbers.has(name)?'number':name.includes('email')?'email':name.includes('phone')?'tel':name.endsWith('_on')?'date':name==='starts_at'||name==='ends_at'?'time':name.includes('url')?'url':'text';
  return `<label><span class="field-title">${title}</span><input type="${type}" name="${name}" value="${esc(value)}"></label>`;
}
async function open(row={}){
  if(!references.teams.length||!references.club_members.length){const [teams,members]=await Promise.all([fetch('/admin-api/teams').then(r=>r.json()),fetch('/admin-api/club_members').then(r=>r.json())]);references={teams,club_members:members}}
  editing=row.id||null;editingRow=row;$('#editor h2').textContent=editing?'Modifier':'Ajouter';$('#editor-status').textContent='';
  $('#fields').innerHTML=schemas[current].map(name=>field(name,row[name]??(booleans.has(name)?1:''))).join('');
  document.querySelectorAll('.toggle-field input[type=checkbox]').forEach(input=>input.onchange=()=>input.closest('label').querySelector('b').textContent=input.checked?'Oui':'Non');
  document.querySelectorAll('[data-upload]').forEach(input=>input.onchange=()=>upload(input));$('#editor').showModal();
}
async function upload(input){
  if(!input.files[0])return;const label=input.closest('label'),state=label.querySelector('.file-state');state.textContent='Envoi en cours…';input.disabled=true;
  const form=new FormData();form.append('file',input.files[0]);const response=await fetch('/admin-api/upload',{method:'POST',headers:authHeaders(),body:form});const result=await response.json();input.disabled=false;
  if(!response.ok){state.textContent=result.error||'Échec de l’envoi';$('#editor-status').textContent=result.error||'Échec de l’envoi';return}label.querySelector(`input[name="${input.dataset.upload}"]`).value=result.key;state.textContent=`Fichier chargé : ${input.files[0].name}`;
  if(input.dataset.upload==='photo_key'){let preview=label.querySelector('img');if(!preview){preview=document.createElement('img');label.append(preview)}preview.src=result.url;preview.alt='Aperçu'}
}
async function save(event){
  event.preventDefault();const form=$('#editor form');if(form.querySelector('[data-upload]:disabled')){$('#editor-status').textContent='Attendez la fin du chargement du fichier.';return}
  const values=Object.fromEntries(new FormData(form));for(const key of numbers)if(key in values&&values[key]!=='')values[key]=Number(values[key]);for(const key of booleans)if(schemas[current].includes(key))values[key]=form.querySelector(`input[type=checkbox][name="${key}"]`)?.checked?1:0;
  const slugify=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if(current==='teams'){values.slug=editingRow.slug||slugify(values.name);values.category=editingRow.category||values.name;values.display_order=editingRow.display_order??0;}
  if(current==='training_sessions'){const team=references.teams.find(item=>String(item.id)===String(values.team_id));values.category=team?.category||team?.name||editingRow.category||'';}
  if(current==='tournaments'){values.slug=editingRow.slug||slugify(values.name);values.categories=JSON.stringify([...form.querySelectorAll('[data-category-choice]:checked')].map(input=>input.value));}
  if(current==='documents')values.slug=editingRow.slug||slugify(values.title);
  const response=await fetch(`/admin-api/${current}${editing?`/${editing}`:''}`,{method:editing?'PUT':'POST',headers:jsonHeaders(),body:JSON.stringify(values)});if(response.ok){$('#editor').close();load()}else{const result=await response.json();$('#editor-status').textContent=result.error||'Enregistrement impossible';}
}
async function remove(id){if(!confirm('Supprimer définitivement ?'))return;await fetch(`/admin-api/${current}/${id}`,{method:'DELETE',headers:jsonHeaders()});load()}
$('#collections').innerHTML=Object.keys(schemas).map(name=>`<button data-name="${name}" class="${name===current?'active':''}">${collectionLabels[name]}</button>`).join('');
document.querySelectorAll('[data-name]').forEach(button=>button.onclick=()=>{current=button.dataset.name;document.querySelectorAll('[data-name]').forEach(item=>item.classList.toggle('active',item===button));$('#title').textContent=collectionLabels[current];load()});
$('#title').textContent=collectionLabels[current];$('#new').onclick=()=>open();$('#save').onclick=save;$('#token-button').onclick=()=>{token=prompt('Jeton DEV_ADMIN_TOKEN (uniquement en local)')||'';sessionStorage.setItem('admin-token',token);load()};load();
