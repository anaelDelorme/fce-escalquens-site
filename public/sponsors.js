const sponsorsRoot=document.querySelector('#sponsors-list');
if(sponsorsRoot)(window.fceHomeData||window.fceMecenatData||fetch('/api/page/mecenat').then(response=>response.json())).then(data=>{
  const sponsors=data.sponsors||[];
  sponsorsRoot.innerHTML=sponsors.map(sponsor=>`<a href="${sponsor.website_url||'#'}" ${sponsor.website_url?'target="_blank" rel="noopener"':''} title="${sponsor.name}">${sponsor.logo_key?`<img src="/media/${sponsor.logo_key}" alt="${sponsor.name}" loading="lazy">`:`<b>${sponsor.name}</b>`}<small>${sponsor.tier||'Partenaire'}</small></a>`).join('')||'<p>Les partenaires seront bientôt présentés ici.</p>';
}).catch(()=>{sponsorsRoot.innerHTML='<p>Les partenaires seront bientôt présentés ici.</p>'});
