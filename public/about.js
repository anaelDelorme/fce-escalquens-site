const aboutRoot=document.querySelector('#about-root');
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

const bodyHtml=value=>{
  const lines=String(value||'').split(/\r?\n/).map(line=>line.trim());
  const output=[];
  let list=[];

  const flushList=()=>{
    if(!list.length)return;
    output.push(`<ul>${list.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`);
    list=[];
  };

  for(const line of lines){
    if(!line){
      flushList();
      continue;
    }

    const bullet=line.match(/^[•·-]\s*(.+)$/);

    if(bullet){
      list.push(bullet[1]);
      continue;
    }

    flushList();
    output.push(`<p>${esc(line)}</p>`);
  }

  flushList();
  return output.join('');
};

const mediaHtml=(section,className)=>{
  if(section.image_key){
    return `<div class="${className}">
      <img src="/media/${esc(section.image_key)}" alt="${esc(section.image_alt||'')}" loading="lazy">
    </div>`;
  }

  return `<div class="${className} about-visual-fallback">
    <img src="/logo-fce.webp" alt="" aria-hidden="true">
    <strong>FC Escalquens</strong>
    <span>Un maillot. Une famille.</span>
  </div>`;
};

const kicker=section=>section.eyebrow
  ?`<p class="about-kicker">${esc(section.eyebrow)}</p>`
  :'';

const chapterHtml=section=>`<section class="about-chapter about-shell">
  <div class="about-chapter-inner">
    <div>
      ${kicker(section)}
      <h2>${esc(section.title)}</h2>
    </div>
    <div class="about-body">${bodyHtml(section.body)}</div>
  </div>
</section>`;

const timelineHtml=sections=>`<section class="about-shell about-timeline">
  ${sections.map(section=>`<article class="about-timeline-card">
    <div class="about-timeline-copy">
      ${kicker(section)}
      <h3>${esc(section.title)}</h3>
      <div class="about-body">${bodyHtml(section.body)}</div>
    </div>
    ${section.image_key
      ?`<div class="about-card-media"><img src="/media/${esc(section.image_key)}" alt="${esc(section.image_alt||'')}" loading="lazy"></div>`
      :''
    }
  </article>`).join('')}
</section>`;

const featuresHtml=sections=>`<section class="about-shell about-feature-grid">
  ${sections.map(section=>`<article class="about-feature">
    ${section.image_key
      ?`<div class="about-feature-media"><img src="/media/${esc(section.image_key)}" alt="${esc(section.image_alt||'')}" loading="lazy"></div>`
      :''
    }
    <div class="about-feature-copy">
      ${kicker(section)}
      <h3>${esc(section.title)}</h3>
      <div class="about-body">${bodyHtml(section.body)}</div>
    </div>
  </article>`).join('')}
</section>`;

const peopleHtml=section=>`<section class="about-shell about-people">
  ${mediaHtml(section,'about-people-media')}
  <div class="about-people-copy">
    ${kicker(section)}
    <h3>${esc(section.title)}</h3>
    <div class="about-body">${bodyHtml(section.body)}</div>
  </div>
</section>`;

const render=sections=>{
  if(!sections.length){
    aboutRoot.innerHTML='<div class="about-empty">Le contenu de cette page est en cours de préparation.</div>';
    return;
  }

  const hero=sections.find(section=>section.layout==='hero')||sections[0];
  const rest=sections.filter(section=>section!==hero);

  let html=`<section class="about-shell about-hero">
    <div class="about-hero-copy">
      ${kicker(hero)}
      <h1>${esc(hero.title)}</h1>
      <div class="about-body">${bodyHtml(hero.body)}</div>
    </div>
    ${mediaHtml(hero,'about-media')}
  </section>`;

  for(let index=0;index<rest.length;){
    const section=rest[index];

    if(section.layout==='timeline'){
      const group=[];
      while(index<rest.length&&rest[index].layout==='timeline'){
        group.push(rest[index]);
        index++;
      }
      html+=timelineHtml(group);
      continue;
    }

    if(section.layout==='feature'){
      const group=[];
      while(index<rest.length&&rest[index].layout==='feature'){
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
