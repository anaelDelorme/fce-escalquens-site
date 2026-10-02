
const aboutRoot=document.querySelector('#about-root');
const esc=value=>String(value ?? '').replace(/[&<>'"]/g,char=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const normalizeBreaks=value=>String(value||'').replace(/\\r\\n/g,'\n').replace(/\\n/g,'\n').replace(/\r\n/g,'\n');

const bodyHtml=value=>{
  const lines=normalizeBreaks(value).split(/\n/).map(line=>line.trim());
  const output=[];
  let list=[];
  const flushList=()=>{
    if(!list.length)return;
    output.push(`<ul>${list.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`);
    list=[];
  };
  for(const line of lines){
    if(!line){ flushList(); continue; }
    const bullet=line.match(/^[•·\-]\s*(.+)$/);
    if(bullet){ list.push(bullet[1]); continue; }
    flushList();
    output.push(`<p>${esc(line)}</p>`);
  }
  flushList();
  return output.join('');
};

const kicker=section=>section.eyebrow?`<p class="about-kicker">${esc(section.eyebrow)}</p>`:'';
const image=(section,className)=>section.image_key?`<div class="${className}"><img src="/media/${esc(section.image_key)}" alt="${esc(section.image_alt||'')}" loading="lazy"></div>`:'';

const heroMedia=section=>section.image_key
  ?image(section,'about-hero-media')
  :`<div class="about-hero-media"><div class="about-hero-fallback"><div class="about-hero-fallback-box"><img src="/logo-fce.webp" alt="" aria-hidden="true"><strong>Un maillot.<br>Une famille.</strong><span>Football Club Escalquens</span></div></div></div>`;

const heroHtml=section=>`<section class="about-hero"><div class="about-shell about-hero-inner"><div class="about-hero-copy">${kicker(section)}<h1>${esc(section.title)}</h1><div class="about-body">${bodyHtml(section.body)}</div></div>${heroMedia(section)}</div></section>`;

const chapterHtml=section=>`<section class="about-chapter"><div class="about-shell"><div class="about-chapter-card"><div class="about-chapter-side"><div class="about-heading-stack">${kicker(section)}<h2>${esc(section.title)}</h2><div class="about-heading-rule"></div></div></div><div class="about-body">${bodyHtml(section.body)}</div></div></div></section>`;

const timelineHtml=sections=>`<section class="about-timeline-band"><div class="about-shell"><div class="about-timeline-wrap">${sections.map(section=>`<article class="about-timeline-item ${section.image_key?'has-media':''}"><div class="about-timeline-date">${esc(section.eyebrow||'')}</div><div class="about-timeline-panel"><div class="about-timeline-copy"><div class="about-heading-stack"><h3>${esc(section.title)}</h3><div class="about-heading-rule"></div></div><div class="about-body">${bodyHtml(section.body)}</div></div>${section.image_key?image(section,'about-timeline-media'):''}</div></article>`).join('')}</div></div></section>`;

const featuresHtml=sections=>`<section class="about-feature-band"><div class="about-shell"><div class="about-feature-grid">${sections.map(section=>`<article class="about-feature ${section.image_key?'has-media':'no-media'}">${section.image_key?image(section,'about-feature-media'):''}<div class="about-feature-copy">${kicker(section)}<div class="about-heading-stack"><h3>${esc(section.title)}</h3><div class="about-heading-rule"></div></div><div class="about-body">${bodyHtml(section.body)}</div></div></article>`).join('')}</div></div></section>`;

const peopleHtml=section=>`<section class="about-people-band"><div class="about-shell"><div class="about-people ${section.image_key?'':'no-media'}">${section.image_key?image(section,'about-people-media'):''}<div class="about-people-copy">${kicker(section)}<h3>${esc(section.title)}</h3><div class="about-heading-rule"></div><div class="about-body">${bodyHtml(section.body)}</div></div></div></div></section>`;

const render=sections=>{
  if(!sections.length){
    aboutRoot.innerHTML='<div class="about-empty">Le contenu de cette page est en cours de préparation.</div>';
    return;
  }
  const hero=sections.find(section=>section.layout==='hero')||sections[0];
  const rest=sections.filter(section=>section!==hero);
  let html=heroHtml(hero);
  for(let index=0; index<rest.length; ){
    const section=rest[index];
    if(section.layout==='timeline'){
      const group=[];
      while(index<rest.length && rest[index].layout==='timeline'){
        group.push(rest[index]);
        index++;
      }
      html+=timelineHtml(group);
      continue;
    }
    if(section.layout==='feature'){
      const group=[];
      while(index<rest.length && rest[index].layout==='feature'){
        group.push(rest[index]);
        index++;
      }
      html+=featuresHtml(group);
      continue;
    }
    if(section.layout==='people'){
      html+=peopleHtml(section);
      index++;
      continue;
    }
    html+=chapterHtml(section);
    index++;
  }
  aboutRoot.innerHTML=html;
};

fetch('/api/page/about?v=1')
  .then(async response=>{
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
    return data;
  })
  .then(data=>render(Array.isArray(data.sections)?data.sections:[]))
  .catch(error=>{
    console.error(error);
    aboutRoot.innerHTML='<div class="about-empty">Cette page est momentanément indisponible.</div>';
  })
  .finally(()=>aboutRoot.setAttribute('aria-busy','false'));
