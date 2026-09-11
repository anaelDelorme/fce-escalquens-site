const sponsorsEsc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const sponsorSafeUrl=value=>{try{const url=new URL(value,location.origin);return ['http:','https:'].includes(url.protocol)?url.href:'#';}catch{return '#';}};
const sponsorsRoot=document.querySelector('#sponsors-list');
if(sponsorsRoot)(window.fceHomeData||window.fceMecenatData||fetch('/api/page/mecenat').then(response=>response.json())).then(data=>{
  const sponsors=data.sponsors||[];
  sponsorsRoot.innerHTML=sponsors.map(sponsor=>`<a href="${sponsor.website_url?sponsorSafeUrl(sponsor.website_url):'#'}" ${sponsor.website_url?'target="_blank" rel="noopener"':''} title="${sponsorsEsc(sponsor.name)}">${sponsor.logo_key?`<img src="/media/${encodeURIComponent(sponsor.logo_key).replace(/%2F/g,'/')}" alt="${sponsorsEsc(sponsor.name)}" loading="lazy">`:`<b>${sponsorsEsc(sponsor.name)}</b>`}<small>${sponsorsEsc(sponsor.tier||'Partenaire')}</small></a>`).join('')||'<p>Les partenaires seront bientôt présentés ici.</p>';
}).catch(()=>{sponsorsRoot.innerHTML='<p>Les partenaires seront bientôt présentés ici.</p>'});
