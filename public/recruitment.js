const esc=value=>
  String(value??'').replace(
    /[&<>"']/g,
    char=>({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[char])
  );

const statusLabels={
  new:'Nouveau',
  open:'Ouvert',
  soon:'Bientôt',
  filled:'Pourvu',
  paused:'En pause'
};

const audienceLabels={
  players:'Joueurs / joueuses',
  youth:'Jeunes',
  seniors:'Seniors',
  coach:'Encadrement',
  staff:'Vie du club',
  apprentice:'Alternance / stage',
  other:'Autre'
};

const audienceIcons={
  players:'⚽',
  youth:'🧒',
  seniors:'🏆',
  coach:'🧢',
  staff:'🤝',
  apprentice:'🎓',
  other:'📣'
};

const detailIcons={
  profile:'👤',
  commitment:'📅',
  location:'📍'
};

let posts=[];
let filter='';

const safeUrl=value=>{
  const raw=String(value||'').trim();
  if(!raw) return '';

  try{
    const url=new URL(raw);
    return ['http:','https:'].includes(url.protocol)
      ?url.href
      :'';
  }catch{
    return '';
  }
};

const contactActions=post=>{
  const actions=[];

  if(post.contact_email){
    const subject=`Candidature — ${post.title}`;
    actions.push(`
      <a
        class="recruitment-action primary"
        href="mailto:${esc(post.contact_email)}?subject=${encodeURIComponent(subject)}"
      >
        ✉️ Contacter le club
      </a>
    `);
  }

  if(post.contact_phone){
    actions.push(`
      <a
        class="recruitment-action"
        href="tel:${esc(String(post.contact_phone).replace(/\s+/g,''))}"
      >
        📞 Appeler
      </a>
    `);
  }

  const apply=safeUrl(post.apply_url);

  if(apply){
    actions.push(`
      <a
        class="recruitment-action secondary"
        href="${esc(apply)}"
        target="_blank"
        rel="noopener"
      >
        Envoyer sa candidature →
      </a>
    `);
  }

  return actions.join('');
};

const detailBlock=(icon,label,value)=>`
  <div class="recruitment-detail">
    <div class="recruitment-detail__label">
      <span class="recruitment-detail__icon">${icon}</span>
      <small>${label}</small>
    </div>
    <p>${esc(value)}</p>
  </div>
`;

const card=post=>{
  const image=post.image_key
    ?`
      <div class="recruitment-card__visual">
        <img
          src="/media/${esc(post.image_key)}"
          alt=""
          loading="lazy"
        >
      </div>
    `
    :'';

  const icon=audienceIcons[post.audience]||'📣';
  const type=audienceLabels[post.audience]||post.audience||'FC Escalquens';

  const actions=post.status==='filled'
    ?`
      <span class="recruitment-filled">
        Besoin pourvu
      </span>
    `
    :contactActions(post);

  return `
    <article class="recruitment-card status-${esc(post.status)}">

      <header class="recruitment-card__header">
        <div class="recruitment-card__header-main">
          <div class="recruitment-card__eyebrow">
            <span class="recruitment-card__eyebrow-icon">${icon}</span>
            <span>${esc(type)}</span>
          </div>

          <h2>${esc(post.title)}</h2>

          ${
            post.target
              ?`
                <p class="recruitment-target">
                  ${esc(post.target)}
                </p>
              `
              :''
          }
        </div>

        <span class="recruitment-status">
          ${esc(statusLabels[post.status]||post.status)}
        </span>
      </header>

      ${image}

      <div class="recruitment-card__body">

        ${
          post.summary
            ?`
              <p class="recruitment-summary">
                ${esc(post.summary)}
              </p>
            `
            :''
        }

        ${
          post.description
            ?`
              <p class="recruitment-description">
                ${esc(post.description)}
              </p>
            `
            :''
        }

        ${
          post.profile || post.commitment || post.location
            ?`
              <div class="recruitment-details">
                ${post.profile ? detailBlock(detailIcons.profile,'Profil',post.profile) : ''}
                ${post.commitment ? detailBlock(detailIcons.commitment,'Disponibilités',post.commitment) : ''}
                ${post.location ? detailBlock(detailIcons.location,'Lieu',post.location) : ''}
              </div>
            `
            :''
        }

      </div>

      <footer class="recruitment-card__footer">

        <div class="recruitment-contact">
          <span class="recruitment-contact__label">Contact</span>
          <strong>${esc(post.contact_name||'FC Escalquens')}</strong>
        </div>

        <div class="recruitment-card__actions">
          ${actions}
        </div>

      </footer>

    </article>
  `;
};

const draw=()=>{
  const rows=posts.filter(
    post=>!filter || post.audience===filter
  );

  document.querySelector('#recruitment-list').innerHTML=
    rows.length
      ?rows.map(card).join('')
      :`
        <div class="empty-state">
          <b>Aucune annonce dans cette catégorie actuellement.</b>
        </div>
      `;
};

fetch('/api/page/recruitment')
  .then(async response=>{
    const data=await response.json();

    if(!response.ok){
      throw new Error(data.error||`HTTP ${response.status}`);
    }

    return data;
  })
  .then(data=>{
    posts=data.posts||[];

    const audiences=[
      ...new Set(
        posts
          .map(post=>post.audience)
          .filter(Boolean)
      )
    ];

    const filters=document.querySelector('#recruitment-filters');

    filters.innerHTML=
      `
        <button
          type="button"
          class="active"
          data-recruitment-filter=""
          aria-pressed="true"
        >
          Tous les besoins
        </button>
      `+
      audiences.map(value=>`
        <button
          type="button"
          data-recruitment-filter="${esc(value)}"
          aria-pressed="false"
        >
          ${esc(audienceIcons[value]||'📣')} ${esc(audienceLabels[value]||value)}
        </button>
      `).join('');

    document
      .querySelectorAll('[data-recruitment-filter]')
      .forEach(button=>{
        button.onclick=()=>{
          filter=button.dataset.recruitmentFilter;

          document
            .querySelectorAll('[data-recruitment-filter]')
            .forEach(item=>{
              const active=item===button;
              item.classList.toggle('active',active);
              item.setAttribute('aria-pressed',String(active));
            });

          draw();
        };
      });

    draw();
  })
  .catch(error=>{
    console.error(error);

    document.querySelector('#recruitment-list').innerHTML=`
      <div class="empty-state">
        <b>Les annonces sont momentanément indisponibles.</b>
      </div>
    `;
  });
