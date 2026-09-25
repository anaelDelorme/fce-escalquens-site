const sponsorsEsc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const sponsorSafeUrl=value=>{try{const url=new URL(value,location.origin);return ['http:','https:'].includes(url.protocol)?url.href:'';}catch{return '';}};
const sponsorsRoot=document.querySelector('#sponsors-list');

const sponsorTier=value=>{
  const tier=String(value||'partenaire').toLowerCase();
  return tier==='majeur'||tier==='premium'?tier:'partenaire';
};

const sponsorCard=(sponsor,kind)=>{
  const url=sponsorSafeUrl(sponsor.website_url);
  const media=sponsor.logo_key
    ?`<img src="/media/${encodeURIComponent(sponsor.logo_key).replace(/%2F/g,'/')}" alt="${sponsorsEsc(sponsor.name)}" loading="lazy">`
    :`<strong>${sponsorsEsc(sponsor.name)}</strong>`;
  const content=`<span class="sponsor-logo-box">${media}</span>`;
  return url
    ?`<a class="sponsor-card sponsor-card--${kind}" href="${sponsorsEsc(url)}" target="_blank" rel="noopener" title="${sponsorsEsc(sponsor.name)}">${content}</a>`
    :`<div class="sponsor-card sponsor-card--${kind}" title="${sponsorsEsc(sponsor.name)}">${content}</div>`;
};

const sponsorGrid=(items,kind)=>items.length
  ?`<div class="sponsor-grid sponsor-grid--${kind}">${items.map(item=>sponsorCard(item,kind)).join('')}</div>`
  :'';

if(sponsorsRoot){
  Promise.resolve(
    window.fceHomeData
    ||window.fceMecenatData
    ||fetch('/api/page/mecenat').then(response=>response.json())
  ).then(data=>{
    const sponsors=data.sponsors||[];
    const majors=sponsors.filter(item=>sponsorTier(item.tier)==='majeur');
    const premiums=sponsors.filter(item=>sponsorTier(item.tier)==='premium');
    const partners=sponsors.filter(item=>sponsorTier(item.tier)==='partenaire');

    sponsorsRoot.innerHTML=sponsors.length?`
      ${majors.length?`
        <section class="sponsor-group sponsor-group--major">
          <div class="sponsor-group__heading">
            <h3>Nos partenaires majeurs</h3>
          </div>
          ${sponsorGrid(majors,'major')}
        </section>
      `:''}

      ${(premiums.length||partners.length)?`
        <section class="sponsor-group sponsor-group--support">
          <div class="sponsor-group__heading sponsor-group__heading--support">
            <h3>Ils nous accompagnent</h3>
          </div>

          ${premiums.length?`
            <div class="sponsor-subgroup sponsor-subgroup--premium">
              <h4>Partenaires premium</h4>
              ${sponsorGrid(premiums,'premium')}
            </div>
          `:''}

          ${partners.length?`
            <div class="sponsor-subgroup sponsor-subgroup--partner">
              <h4>Partenaires</h4>
              ${sponsorGrid(partners,'partner')}
            </div>
          `:''}
        </section>
      `:''}
    `:'<p>Les partenaires seront bientôt présentés ici.</p>';
  }).catch(()=>{
    sponsorsRoot.innerHTML='<p>Les partenaires seront bientôt présentés ici.</p>';
  });
}
