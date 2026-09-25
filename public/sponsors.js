const sponsorsEsc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const sponsorSafeUrl=value=>{try{const url=new URL(value,location.origin);return ['http:','https:'].includes(url.protocol)?url.href:'';}catch{return '';}};
const sponsorsRoot=document.querySelector('#sponsors-list');
const sponsorTierLabels={majeur:'Partenaire majeur',premium:'Partenaire premium',partenaire:'Partenaire',soutien:'Soutien'};
const sponsorCard=sponsor=>{
  const tier=String(sponsor.tier||'partenaire').toLowerCase();
  const label=sponsorTierLabels[tier]||'Partenaire';
  const logo=sponsor.logo_key
    ?`<img src="/media/${encodeURIComponent(sponsor.logo_key).replace(/%2F/g,'/')}" alt="${sponsorsEsc(sponsor.name)}" loading="lazy">`
    :`<b>${sponsorsEsc(sponsor.name)}</b>`;
  const cardContent=`<span class="sponsor-card__logo">${logo}</span><small>${sponsorsEsc(label)}</small>`;
  const url=sponsor.website_url?sponsorSafeUrl(sponsor.website_url):'';
  return url
    ?`<a class="sponsor-card" href="${sponsorsEsc(url)}" target="_blank" rel="noopener" title="${sponsorsEsc(sponsor.name)}">${cardContent}</a>`
    :`<div class="sponsor-card" title="${sponsorsEsc(sponsor.name)}">${cardContent}</div>`;
};
const sponsorSection=(key,title,items)=>items.length
  ?`<section class="sponsor-tier sponsor-tier--${key}"><div class="sponsor-tier__heading"><h3>${title}</h3><span>${items.length}</span></div><div class="sponsor-tier__grid">${items.map(sponsorCard).join('')}</div></section>`
  :'';
if(sponsorsRoot)Promise.resolve(window.fceHomeData||window.fceMecenatData||fetch('/api/page/mecenat').then(response=>response.json())).then(data=>{
  const sponsors=(data.sponsors||[]).map((sponsor,index)=>({...sponsor,_index:index}));
  const rank={majeur:0,premium:1,partenaire:2,soutien:3};
  sponsors.sort((a,b)=>(rank[String(a.tier||'partenaire').toLowerCase()]??4)-(rank[String(b.tier||'partenaire').toLowerCase()]??4)||a._index-b._index);
  const majors=sponsors.filter(sponsor=>String(sponsor.tier||'').toLowerCase()==='majeur');
  const premiums=sponsors.filter(sponsor=>String(sponsor.tier||'').toLowerCase()==='premium');
  const partners=sponsors.filter(sponsor=>!['majeur','premium'].includes(String(sponsor.tier||'').toLowerCase()));
  sponsorsRoot.innerHTML=[
    sponsorSection('major','Partenaires majeurs',majors),
    sponsorSection('premium','Partenaires premium',premiums),
    sponsorSection('partner','Partenaires',partners)
  ].join('')||'<p>Les partenaires seront bientôt présentés ici.</p>';
}).catch(()=>{sponsorsRoot.innerHTML='<p>Les partenaires seront bientôt présentés ici.</p>'});
