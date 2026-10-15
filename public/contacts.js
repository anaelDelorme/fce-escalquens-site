const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const roleLabels={
  responsable_mecenat:'Responsable mécénat',
  presidence:'Présidence',
  community_manager:'Community Manager',
  secretariat:'Secrétariat',
  tresorerie:'Trésorerie',
  responsable_technique:'Responsable technique',
  communication:'Communication',
  responsable_sportif:'Responsable sportif',
  responsable_boutique:'Responsable boutique',
  referent:'Référent',
  autre:'Autre'
};
const initials=name=>String(name||'?').trim().split(/\s+/).filter(Boolean).map(part=>part[0]).join('').slice(0,2).toUpperCase();
const role=value=>roleLabels[value]||String(value||'').replaceAll('_',' ');
const avatar=row=>row.photo_key
  ?`<img class="contact-photo" src="/media/${esc(row.photo_key)}" alt="Portrait de ${esc(row.name)}" loading="lazy">`
  :`<span class="contact-initials" aria-hidden="true">${esc(initials(row.name))}</span>`;
let contacts=[];
function draw(category=''){
  const rows=contacts.filter(row=>!category||row.category===category);
  const list=document.querySelector('#contact-list');
  list.dataset.count=String(rows.length);
  list.innerHTML=rows.map(row=>`
    <article class="contact-card">
      <div class="contact-card-head">
        <div class="contact-avatar">${avatar(row)}</div>
        <div class="contact-identity">
          <small class="contact-category">${esc(row.category||'Club')}</small>
          <h2>${esc(row.name)}</h2>
          <b class="contact-role">${esc(role(row.role))}</b>
        </div>
      </div>
      ${row.responsibilities?`<p class="contact-responsibilities">${esc(row.responsibilities)}</p>`:''}
      <div class="contact-actions">
        ${row.email?`<a class="contact-action" href="mailto:${encodeURIComponent(row.email)}"><span aria-hidden="true">✉</span><b>Envoyer un e-mail</b><small>${esc(row.email)}</small></a>`:''}
        ${row.phone?`<a class="contact-action" href="tel:${encodeURIComponent(String(row.phone).replace(/\s/g,''))}"><span aria-hidden="true">☎</span><b>Appeler</b><small>${esc(row.phone)}</small></a>`:''}
      </div>
      ${row.availability?`<p class="contact-availability"><span>Disponibilités</span>${esc(row.availability)}</p>`:''}
    </article>`).join('')||'<div class="empty-state"><b>Aucun contact dans cette rubrique.</b><p>Choisissez une autre section ou utilisez l’adresse générale du club.</p></div>';
}
fetch('/api/page/contacts').then(async response=>{
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||`Contacts : ${response.status}`);
  return data;
}).then(data=>{
  contacts=data.contacts||[];
  const categories=[...new Set(contacts.map(row=>row.category).filter(Boolean))];
  const filters=document.querySelector('#contact-filters');
  filters.innerHTML='<button class="active" type="button" data-cat="" aria-pressed="true">Tous</button>'+categories.map(category=>`<button type="button" data-cat="${esc(category)}" aria-pressed="false">${esc(category)}</button>`).join('');
  filters.querySelectorAll('[data-cat]').forEach(button=>button.addEventListener('click',()=>{
    filters.querySelectorAll('[data-cat]').forEach(item=>{
      const active=item===button;
      item.classList.toggle('active',active);
      item.setAttribute('aria-pressed',active?'true':'false');
    });
    draw(button.dataset.cat||'');
  }));
  draw();
}).catch(error=>{
  console.error(error);
  document.querySelector('#contact-list').innerHTML='<div class="empty-state"><b>Les contacts sont momentanément indisponibles.</b><p>Vous pouvez écrire à fcescalquens@gmail.com.</p></div>';
});
