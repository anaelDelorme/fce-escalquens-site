const sponsorPackagesRoot=document.querySelector('#sponsor-packages');
const packageEsc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const packageLines=value=>String(value||'').split(/\n+/).map(line=>line.trim()).filter(Boolean);
if(sponsorPackagesRoot){
  Promise.resolve(window.fceMecenatData||fetch('/api/page/mecenat?v=2').then(response=>response.json())).then(data=>{
    const packages=data.packages||[];
    sponsorPackagesRoot.innerHTML=packages.length?packages.map(item=>`<article class="${Number(item.featured)===1?'featured':''}"><small>${packageEsc(item.name)}</small><strong>${packageEsc(item.price_label||'Sur mesure')}</strong><ul>${packageLines(item.benefits).map(line=>`<li>${packageEsc(line)}</li>`).join('')}</ul></article>`).join(''):'<p class="legal-note">Les formules de mécénat seront bientôt disponibles.</p>';
  }).catch(()=>{sponsorPackagesRoot.innerHTML='<p class="legal-note">Les formules de mécénat sont momentanément indisponibles.</p>'});
}
