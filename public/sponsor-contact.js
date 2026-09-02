const root=document.querySelector('#sponsor-contact-details'),action=document.querySelector('#sponsor-contact-action'),heroAction=document.querySelector('#sponsor-hero-action');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
fetch('/api/contacts').then(response=>response.json()).then(contacts=>{
  const contact=contacts.filter(item=>item.published!==0).sort((a,b)=>(a.display_order||0)-(b.display_order||0)).find(item=>item.role==='responsable_mecenat'||String(item.role).toLocaleLowerCase('fr').includes('responsable mécénat'));
  if(!contact){root.innerHTML='<b>FC Escalquens</b><span>Contact mécénat à venir</span><a href="mailto:fcescalquens@gmail.com">fcescalquens@gmail.com</a>';return}
  root.innerHTML=`<b>${esc(contact.name)}</b><span>Responsable mécénat</span>${contact.email?`<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>`:''}${contact.phone?`<a href="tel:${esc(contact.phone.replace(/\s/g,''))}">${esc(contact.phone)}</a>`:''}`;
  if(contact.email){const href=`mailto:${encodeURIComponent(contact.email)}?subject=Projet%20de%20mécénat%20FC%20Escalquens`;action.href=href;heroAction.href=href}
}).catch(()=>{root.innerHTML='<b>FC Escalquens</b><span>Contact mécénat à venir</span><a href="mailto:fcescalquens@gmail.com">fcescalquens@gmail.com</a>'});
