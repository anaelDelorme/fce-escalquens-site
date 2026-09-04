const schemas={
  teams:['name','group_name','level_id','gender','description','player_count','photo_key','active'],
  team_competitions:['team_id','season_id','name','team_number','fff_team_id','category_code','competition_name','division','pool','level_id','active'],
  competition_levels:['name','short_name','description','active'],
  venues:['name','address','latitude','longitude','maps_url','notes','active'],
  club_members:['full_name','email','phone','license_number','photo_key','notes','active'],
  team_staff:['team_id','member_id','role','active'],
  seasons:['label','starts_on','ends_on','active'],
  training_sessions:['team_id','season_id','weekday','starts_at','ends_at','venue_id','notes','active'],
  contacts:['name','role','category','email','phone','responsibilities','availability','published'],
  tournaments:['name','season_id','summary','starts_on','ends_on','venue_id','organizer','categories','registration_url','tournify_url','rules_key','status'],
  tournament_teams:['tournament_id','team_id','notes'],
  sponsors:['name','logo_key','website_url','tier','description','active','display_order'],
  site_media:['object_key','alt_text'],
  matches:['season_id','team_id','competition','starts_at','venue','venue_address','latitude','longitude','home_team','away_team','home_score','away_score','status'],
  standings:['source','phase_id','season_id','team_id','team_name','position','played','won','drawn','lost','goals_for','goals_against','points'],
  documents:['slug','title','kind','object_key','published'],
  admins:['email','name','active']
};
const collectionLabels={teams:'Groupes sportifs',team_competitions:'Équipes FFF récupérées',seasons:'Saisons',competition_levels:'Niveaux',venues:'Terrains',club_members:'Licenciés & encadrants',team_staff:'Affectations aux équipes',training_sessions:'Entraînements',contacts:'Contacts',tournaments:'Tournois',tournament_teams:'Participations aux tournois',sponsors:'Partenaires',site_media:'Photos du site',matches:'Matchs',standings:'Classements',documents:'Documents',admins:'Administrateurs'};
const labels={slug:'Identifiant URL',label:'Libellé de la saison',season_id:'Saison',name:'Nom FFF',team_number:'Numéro d’équipe',full_name:'Nom et prénom',category:'Domaine',category_code:'Code catégorie FFF',group_name:'Section du club',level:'Niveau',level_id:'Niveau',short_name:'Nom court',gender:'Genre',description:'Présentation',player_count:'Nombre de licenciés',photo_key:'Photo',logo_key:'Logo',license_number:'Numéro de licence',member_id:'Licencié / encadrant',display_order:'Ordre d’affichage',active:'Actif',team_id:'Groupe sportif',competition_team_id:'Équipe engagée',fff_team_id:'Identifiant équipe FFF',competition_name:'Nom de la compétition',division:'Division',pool:'Poule',weekday:'Jour',starts_at:'Date et heure / heure de début',ends_at:'Heure de fin',venue:'Terrain / lieu',venue_id:'Terrain',venue_address:'Adresse du lieu',address:'Adresse complète',latitude:'Latitude GPS',longitude:'Longitude GPS',maps_url:'Lien Google Maps',notes:'Notes',role:'Rôle dans l’équipe',email:'Email',phone:'Téléphone',responsibilities:'Missions / sujets traités',availability:'Disponibilités',published:'Publié',summary:'Résumé',starts_on:'Date de début',ends_on:'Date de fin',categories:'Sections concernées',registration_url:'Lien d’inscription',tournify_url:'Lien Tournify',organizer:'Organisateur',tournament_id:'Tournoi',rules_key:'Règlement PDF',status:'Statut',source:'Source',source_id:'Identifiant source',competition:'Compétition',home_team:'Équipe à domicile',away_team:'Équipe à l’extérieur',home_score:'Score domicile',away_score:'Score extérieur',phase_id:'Identifiant phase',team_name:'Nom de l’équipe',position:'Position',played:'Matchs joués',won:'Victoires',drawn:'Nuls',lost:'Défaites',goals_for:'Buts pour',goals_against:'Buts contre',points:'Points',title:'Titre',kind:'Type de document',object_key:'Photo',alt_text:'Description de l’image',website_url:'Site internet',tier:'Type de partenariat'};
const booleans=new Set(['active','published']);
const numbers=new Set(['team_id','competition_team_id','tournament_id','season_id','member_id','venue_id','level_id','latitude','longitude','weekday','player_count','display_order','home_score','away_score','position','played','won','drawn','lost','goals_for','goals_against','points']);
const files=new Set(['photo_key','logo_key','rules_key','object_key']);
const textareas=new Set(['description','summary','notes','responsibilities']);
const clubCategories=['Seniors','Formation','Académie','Féminines'];
const options={group_name:clubCategories.map(value=>[value,value]),gender:[['mixed','Mixte'],['female','Féminin'],['male','Masculin']],weekday:[[1,'Lundi'],[2,'Mardi'],[3,'Mercredi'],[4,'Jeudi'],[5,'Vendredi'],[6,'Samedi'],[7,'Dimanche']],role:[['coach_referent','Coach référent'],['coach','Coach'],['dirigeant','Dirigeant'],['arbitre','Arbitre']],status:[['scheduled','Programmé'],['finished','Terminé'],['postponed','Reporté'],['cancelled','Annulé'],['draft','Brouillon'],['published','Publié'],['open','Ouvert'],['closed','Fermé']],tier:[['majeur','Partenaire majeur'],['premium','Partenaire premium'],['partenaire','Partenaire'],['soutien','Soutien']],kind:[['photo','Photo'],['pdf','PDF'],['boutique','Boutique']]};
const contactRoles=[['responsable_mecenat','Responsable mécénat'],['presidence','Présidence'],['secretariat','Secrétariat'],['tresorerie','Trésorerie'],['responsable_technique','Responsable technique'],['referent','Référent'],['autre','Autre']];
let current='teams',editing=null,editingRow={},token=sessionStorage.getItem('admin-token')||'',references={teams:[],club_members:[],venues:[],competition_levels:[],seasons:[],tournaments:[],team_competitions:[]},referencesLoaded=false;
const $=selector=>document.querySelector(selector);
const authHeaders=()=>({'x-requested-with':'XMLHttpRequest',...(token?{authorization:`Bearer ${token}`}:{})}),jsonHeaders=()=>({'content-type':'application/json',...authHeaders()});
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
async function ensureReferences(){if(referencesLoaded)return;const [teams,members,venues,levels,seasons,tournaments,entries]=await Promise.all(['teams','club_members','venues','competition_levels','seasons','tournaments','team_competitions'].map(resource=>fetch(`/admin-api/${resource}`).then(response=>response.json())));references={teams,club_members:members,venues,competition_levels:levels,seasons,tournaments,team_competitions:entries};referencesLoaded=true;}
async function load(){
  $('#new').hidden=['team_competitions','site_media'].includes(current);
  $('#import-coaches').hidden=current!=='club_members';
  if(['team_staff','training_sessions','teams','team_competitions','tournament_teams','tournaments','matches'].includes(current))await ensureReferences();
  $('#status').textContent='Chargement…';
  const response=await fetch(`/admin-api/${current}`,{headers:jsonHeaders()});const rows=await response.json();
  const help={
    teams:'Un groupe sportif réunit le même staff, les mêmes entraînements et une seule photo (par exemple U9).',
    team_competitions:'Cette liste est remplie automatiquement par la FFF. Ouvrez chaque ligne « À affecter », puis choisissez son groupe sportif. Le numéro et l’identifiant FFF restent en lecture seule.',
    matches:'Les rencontres officielles sont récupérées automatiquement et ne sont pas modifiables ici. Vous pouvez ajouter un match amical.',
    tournament_teams:'Associez un ou plusieurs groupes sportifs à un tournoi.',
    sponsors:'Les partenaires actifs seront affichés sur le site.',
    site_media:'Remplacez ici les principales photos éditoriales. La nouvelle image est mise en ligne dès l’enregistrement.',
    club_members:'Ajoutez une personne ou importez une liste de coachs au format CSV.',
    admins:'Cloudflare vérifie l’adresse par code e-mail ; cette liste décide ensuite qui peut réellement administrer le site.'
  };
  $('#status').textContent=response.ok?(help[current]||''):rows.error;
  const dayName=value=>options.weekday.find(item=>String(item[0])===String(value))?.[1]||'';
  const teamName=id=>references.teams.find(x=>x.id===id)?.name||`Groupe #${id}`;
  const assignedTeam=row=>references.teams.find(x=>String(x.id)===String(row.team_id)&&Number(x.active)!==0);
  const recordTitle=row=>current==='team_staff'?`${teamName(row.team_id)} — ${references.club_members.find(x=>x.id===row.member_id)?.full_name||`Licencié #${row.member_id}`}`:current==='training_sessions'?`${teamName(row.team_id)} — ${dayName(row.weekday)}`:current==='team_competitions'?`${assignedTeam(row)?.name||'À affecter'} — ${row.category_code||row.name}${row.team_number?` n°${row.team_number}`:''}`:current==='tournament_teams'?`${references.tournaments.find(x=>x.id===row.tournament_id)?.name||`Tournoi #${row.tournament_id}`} — ${teamName(row.team_id)}`:current==='matches'?`${row.home_team} — ${row.away_team}`:row.full_name||row.name||row.title||row.label||row.category||row.slug||`#${row.id}`;
  const recordDetail=row=>current==='training_sessions'?`${references.venues.find(x=>x.id===row.venue_id)?.name||row.venue||'Terrain non renseigné'} · ${row.starts_at||''}–${row.ends_at||''}`:current==='team_competitions'?`${row.competition_name||row.division||'Compétition à préciser'}${row.pool?` · ${row.pool}`:''} · ${row.fff_team_id}`:current==='matches'?`${new Date(row.starts_at).toLocaleString('fr-FR')} · ${row.competition||'Match amical'} · ${[row.venue,row.venue_address].filter((value,index,list)=>value&&list.indexOf(value)===index).join(' — ')||'lieu à confirmer'}`:current==='site_media'?(row.alt_text||'Description à renseigner'):options.role?.find(x=>x[0]===row.role)?.[1]||row.role||row.group_name||row.venue||row.starts_at||'';
  $('#records').innerHTML=response.ok?rows.map(row=>{const automatic=current==='matches'&&row.source!=='manual';return `<article class="${automatic?'automatic':''}"><div><b>${esc(recordTitle(row))}</b><small>${esc(recordDetail(row))}</small>${automatic?'<em>Synchronisé automatiquement</em>':''}</div>${automatic?'':`<button data-edit='${JSON.stringify(row).replace(/'/g,'&#39;')}'>Modifier</button><button data-delete="${row.id}">Supprimer</button>`}</article>`}).join(''):'';
  document.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>open(JSON.parse(button.dataset.edit)));
  document.querySelectorAll('[data-delete]').forEach(button=>button.onclick=()=>remove(button.dataset.delete));
}
function field(name,value){
  const title=`<span>${labels[name]||name}</span><small>${name}</small>`;
  if(current==='team_competitions'&&Number(editingRow.discovered_automatically)===1&&['name','team_number','fff_team_id','category_code','competition_name','division','pool'].includes(name))return `<label><span class="field-title">${title}</span><input type="text" name="${name}" value="${esc(value)}" readonly></label>`;
  if(booleans.has(name))return `<label class="toggle-field"><span class="field-title">${title}</span><input type="hidden" name="${name}" value="0"><input type="checkbox" name="${name}" value="1" ${Number(value)!==0?'checked':''}><i></i><b>${Number(value)!==0?'Oui':'Non'}</b></label>`;
  if(files.has(name)){const imageField=['photo_key','logo_key'].includes(name)||(current==='site_media'&&name==='object_key');return `<label class="file-field"><span class="field-title">${title}</span><input type="hidden" name="${name}" value="${esc(value)}"><input type="file" data-upload="${name}" data-image="${imageField?'1':'0'}" accept="${imageField?'image/*':'.pdf,image/*'}"><span class="file-state">${value?`Fichier actuel : ${esc(value)}`:'Choisir un fichier'}</span>${value&&imageField?`<img src="/media/${esc(value)}" alt="Aperçu">`:''}</label>`}
  if(['team_id','competition_team_id','tournament_id','member_id','venue_id','level_id','season_id'].includes(name)){const rows=name==='team_id'?references.teams:name==='competition_team_id'?references.team_competitions:name==='tournament_id'?references.tournaments:name==='member_id'?references.club_members:name==='venue_id'?references.venues:name==='season_id'?references.seasons:references.competition_levels;const required=current==='team_competitions'&&name==='team_id'?'required':'';return `<label><span class="field-title">${title}</span><select name="${name}" ${required}><option value="">Sélectionner…</option>${rows.filter(row=>row.active!==0).map(row=>`<option value="${row.id}" ${String(row.id)===String(value)?'selected':''}>${esc(row.name||row.full_name||row.label)}</option>`).join('')}</select></label>`}
  if(name==='category'&&current==='contacts'){const choices=['Club',...clubCategories,'Mécénat','Bureau','Technique'];return `<label><span class="field-title">${title}</span><select name="${name}">${choices.map(choice=>`<option value="${choice}" ${choice===value?'selected':''}>${choice}</option>`).join('')}</select></label>`}
  if(name==='role'&&current==='contacts')return `<label><span class="field-title">${title}</span><select name="${name}">${contactRoles.map(([key,text])=>`<option value="${key}" ${key===value?'selected':''}>${text}</option>`).join('')}</select></label>`;
  if(name==='categories'&&current==='tournaments'){let selected=[];try{selected=Array.isArray(value)?value:JSON.parse(value||'[]')}catch{}return `<fieldset class="wide multi-field"><legend>${labels[name]} <small>${name}</small></legend>${clubCategories.map(choice=>`<label><input type="checkbox" data-category-choice value="${choice}" ${selected.includes(choice)?'checked':''}><span>${choice}</span></label>`).join('')}</fieldset>`}
  if(options[name]&&(name!=='role'||current==='team_staff'))return `<label><span class="field-title">${title}</span><select name="${name}">${options[name].map(([key,text])=>`<option value="${key}" ${String(key)===String(value)?'selected':''}>${text}</option>`).join('')}</select></label>`;
  if(textareas.has(name))return `<label class="wide"><span class="field-title">${title}</span><textarea name="${name}" rows="4">${esc(value)}</textarea></label>`;
  const type=numbers.has(name)?'number':name.includes('email')?'email':name.includes('phone')?'tel':name.endsWith('_on')?'date':name==='starts_at'&&current==='matches'?'datetime-local':name==='starts_at'||name==='ends_at'?'time':name.includes('url')?'url':'text';
  return `<label><span class="field-title">${title}</span><input type="${type}" ${['latitude','longitude'].includes(name)?'step="any"':''} name="${name}" value="${esc(value)}"></label>`;
}
async function open(row={}){
  await ensureReferences();
  editing=row.id||null;editingRow=row;$('#editor h2').textContent=editing?'Modifier':'Ajouter';$('#editor-status').textContent='';
  $('#fields').innerHTML=schemas[current].map(name=>field(name,row[name]??(booleans.has(name)?1:''))).join('');
  document.querySelectorAll('.toggle-field input[type=checkbox]').forEach(input=>input.onchange=()=>input.closest('label').querySelector('b').textContent=input.checked?'Oui':'Non');
  document.querySelectorAll('[data-upload]').forEach(input=>input.onchange=()=>upload(input));$('#editor').showModal();
}
async function upload(input){
  if(!input.files[0])return;const label=input.closest('label'),state=label.querySelector('.file-state');state.textContent='Envoi en cours…';input.disabled=true;
  const form=new FormData();form.append('file',input.files[0]);const response=await fetch('/admin-api/upload',{method:'POST',headers:authHeaders(),body:form});const result=await response.json();input.disabled=false;
  if(!response.ok){state.textContent=result.error||'Échec de l’envoi';$('#editor-status').textContent=result.error||'Échec de l’envoi';return}label.querySelector(`input[name="${input.dataset.upload}"]`).value=result.key;state.textContent=`Fichier chargé : ${input.files[0].name}`;
  if(input.dataset.image==='1'){let preview=label.querySelector('img');if(!preview){preview=document.createElement('img');label.append(preview)}preview.src=result.url;preview.alt='Aperçu'}
}
async function save(event){
  event.preventDefault();const form=$('#editor form');if(form.querySelector('[data-upload]:disabled')){$('#editor-status').textContent='Attendez la fin du chargement du fichier.';return}
  const values=Object.fromEntries(new FormData(form));for(const key of numbers)if(key in values)values[key]=values[key]===''?null:Number(values[key]);for(const key of booleans)if(schemas[current].includes(key))values[key]=form.querySelector(`input[type=checkbox][name="${key}"]`)?.checked?1:0;
  const slugify=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if(current==='teams'){const level=references.competition_levels.find(item=>String(item.id)===String(values.level_id));values.slug=editingRow.slug||slugify(values.name);values.category=editingRow.category||values.name;values.level=level?.name||'';values.display_order=editingRow.display_order??0;}
  if(current==='training_sessions'){const team=references.teams.find(item=>String(item.id)===String(values.team_id));const venue=references.venues.find(item=>String(item.id)===String(values.venue_id));values.category=team?.category||team?.name||editingRow.category||'';values.venue=venue?.name||'';values.address=venue?.address||'';}
  if(current==='tournaments'){const venue=references.venues.find(item=>String(item.id)===String(values.venue_id));values.slug=editingRow.slug||slugify(values.name);values.venue=venue?.name||editingRow.venue||'';values.categories=JSON.stringify([...form.querySelectorAll('[data-category-choice]:checked')].map(input=>input.value));}
  if(current==='matches'){const team=references.teams.find(item=>String(item.id)===String(values.team_id));values.source=editingRow.source||'manual';values.source_id=editingRow.source_id||`manual-${Date.now()}`;values.category=team?.category||team?.name||'';values.event_type='friendly';values.manually_created=1;values.time_confirmed=1;values.raw_json='{}';}
  if(current==='documents')values.slug=editingRow.slug||slugify(values.title);
  const response=await fetch(`/admin-api/${current}${editing?`/${editing}`:''}`,{method:editing?'PUT':'POST',headers:jsonHeaders(),body:JSON.stringify(values)});if(response.ok){if(['teams','club_members','venues','competition_levels','seasons','tournaments','team_competitions'].includes(current))referencesLoaded=false;$('#editor').close();load()}else{let result={};try{result=await response.json()}catch{}$('#editor-status').textContent=result.error||'Enregistrement impossible. Vérifiez qu’une affectation identique n’existe pas déjà.';}
}
function parseCsv(text){
  const source=String(text||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  const firstLine=source.split('\n')[0]||'';
  const delimiter=(firstLine.match(/;/g)||[]).length>=(firstLine.match(/,/g)||[]).length?';':',';
  const rows=[];let row=[],cell='',quoted=false;
  for(let index=0;index<source.length;index++){
    const char=source[index],next=source[index+1];
    if(char==='"'&&quoted&&next==='"'){cell+='"';index++;continue}
    if(char==='"'){quoted=!quoted;continue}
    if(char===delimiter&&!quoted){row.push(cell.trim());cell='';continue}
    if(char==='\n'&&!quoted){row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';continue}
    cell+=char;
  }
  row.push(cell.trim());if(row.some(Boolean))rows.push(row);
  return rows;
}
const csvKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const csvAliases={nom:'full_name',nom_prenom:'full_name',nom_et_prenom:'full_name',full_name:'full_name',email:'email',mail:'email',telephone:'phone',tel:'phone',phone:'phone',licence:'license_number',numero_licence:'license_number',license_number:'license_number',groupe:'team',groupe_sportif:'team',equipe:'team',team:'team',role:'role',notes:'notes'};
async function importCsv(){
  const file=$('#csv-file').files[0],status=$('#csv-status'),button=$('#csv-submit');
  if(!file){status.textContent='Choisissez d’abord un fichier CSV.';return}
  button.disabled=true;status.textContent='Lecture et import en cours…';
  try{
    const lines=parseCsv(await file.text());
    if(lines.length<2)throw new Error('Le fichier ne contient aucune ligne à importer.');
    const headers=lines[0].map(value=>csvAliases[csvKey(value)]||'');
    if(!headers.includes('full_name'))throw new Error('La première ligne doit contenir une colonne « nom » ou « nom et prénom ».');
    const rows=lines.slice(1).map(values=>Object.fromEntries(headers.map((key,index)=>[key,values[index]||'']).filter(([key])=>key))).filter(row=>row.full_name);
    if(!rows.length)throw new Error('Aucun nom de coach n’a été trouvé.');
    const response=await fetch('/admin-api/import/coaches',{method:'POST',headers:jsonHeaders(),body:JSON.stringify({rows})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Import impossible.');
    const details=[`${result.created} créé(s)`,`${result.updated} mis à jour`,`${result.assigned} affectation(s)`];
    status.textContent=`Import terminé : ${details.join(' · ')}.${result.errors?.length?` À vérifier : ${result.errors.join(' ')}`:''}`;
    referencesLoaded=false;await load();
  }catch(error){status.textContent=error.message||'Import impossible.'}finally{button.disabled=false}
}
async function remove(id){if(!confirm('Supprimer définitivement ?'))return;await fetch(`/admin-api/${current}/${id}`,{method:'DELETE',headers:jsonHeaders()});load()}
$('#collections').innerHTML=Object.keys(schemas).map(name=>`<button data-name="${name}" class="${name===current?'active':''}">${collectionLabels[name]}</button>`).join('');
document.querySelectorAll('[data-name]').forEach(button=>button.onclick=()=>{current=button.dataset.name;document.querySelectorAll('[data-name]').forEach(item=>item.classList.toggle('active',item===button));$('#title').textContent=collectionLabels[current];load()});
$('#title').textContent=collectionLabels[current];$('#new').onclick=()=>open();$('#save').onclick=save;$('#token-button').onclick=()=>{token=prompt('Jeton DEV_ADMIN_TOKEN (uniquement en local)')||'';sessionStorage.setItem('admin-token',token);load()};
$('#import-coaches').onclick=()=>{$('#csv-file').value='';$('#csv-status').textContent='';$('#csv-importer').showModal()};
$('#csv-file').onchange=event=>{event.target.closest('label').querySelector('.file-state').textContent=event.target.files[0]?.name||'Choisir un fichier CSV'};
$('#csv-submit').onclick=importCsv;
$('#sync-matches').onclick=async()=>{const button=$('#sync-matches');button.disabled=true;button.textContent='Actualisation…';$('#status').textContent='Récupération FFF et District en cours…';try{const response=await fetch('/admin-api/sync/matches',{method:'POST',headers:jsonHeaders()}),raw=await response.text();let result;try{result=JSON.parse(raw)}catch{const type=response.headers.get('content-type')||'réponse inconnue';throw new Error(`le serveur a renvoyé ${response.status} (${type}) au lieu de JSON. Redéployez le Worker et vérifiez Cloudflare Access.`)}if(!response.ok)throw new Error(result.error||`Synchronisation impossible (HTTP ${response.status})`);const errors=(result.result||[]).filter(item=>item.status==='error');$('#status').textContent=errors.length?`Actualisation partielle : ${errors.map(item=>`${item.source} — ${item.error}`).join(' ; ')}`:'Matchs, résultats, plateaux et logos actualisés.';if(current==='matches')load()}catch(error){$('#status').textContent=`Échec : ${error.message}`}finally{button.disabled=false;button.textContent='Actualiser les matchs'}};load();
$('#sync-instagram').onclick=async()=>{const button=$('#sync-instagram');button.disabled=true;$('#status').textContent='Actualisation des publications Instagram…';try{const response=await fetch('/admin-api/sync/instagram',{method:'POST',headers:jsonHeaders()}),result=await response.json();if(!response.ok)throw new Error(result.error||'Synchronisation impossible');$('#status').textContent=`${result.imported} publication(s) Instagram actualisée(s).`}catch(error){$('#status').textContent=`Instagram : ${error.message}`}finally{button.disabled=false}};load();
