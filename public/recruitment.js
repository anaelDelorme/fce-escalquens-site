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

let posts=[];
let filter='';

const safeUrl=value=>{
  try{
    const url=new URL(
      String(value||''),
      location.origin
    );

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
    const subject=
      `Candidature — ${post.title}`;

    actions.push(`
      <a
        class="recruitment-action primary"
        href="mailto:${esc(post.contact_email)}?subject=${encodeURIComponent(subject)}"
      >
        Écrire au club →
      </a>
    `);
  }

  if(post.contact_phone){
    actions.push(`
      <a
        class="recruitment-action"
        href="tel:${esc(
          String(post.contact_phone)
            .replace(/\s+/g,'')
        )}"
      >
        Appeler
      </a>
    `);
  }

  const apply=safeUrl(post.apply_url);

  if(apply){
    actions.push(`
      <a
        class="recruitment-action"
        href="${esc(apply)}"
        target="_blank"
        rel="noopener"
      >
        Candidater →
      </a>
    `);
  }

  return actions.join('');
};

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

  return `
    <article
      class="recruitment-card status-${esc(post.status)}"
    >

      <header class="recruitment-card__header">

        <div>
          <span class="recruitment-type">
            ${esc(
              audienceLabels[post.audience]
              ||post.audience
              ||'FC Escalquens'
            )}
          </span>

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
          ${esc(
            statusLabels[post.status]
            ||post.status
          )}
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
          post.profile
          ||post.commitment
          ||post.location
            ?`
              <div class="recruitment-details">

                ${
                  post.profile
                    ?`
                      <div>
                        <small>Profil</small>
                        <p>${esc(post.profile)}</p>
                      </div>
                    `
                    :''
                }

                ${
                  post.commitment
                    ?`
                      <div>
                        <small>Disponibilités</small>
                        <p>${esc(post.commitment)}</p>
                      </div>
                    `
                    :''
                }

                ${
                  post.location
                    ?`
                      <div>
                        <small>Lieu</small>
                        <p>${esc(post.location)}</p>
                      </div>
                    `
                    :''
                }

              </div>
            `
            :''
        }

      </div>

      <footer>

        ${
          post.contact_name
            ?`
              <span>
                Contact :
                <strong>${esc(post.contact_name)}</strong>
              </span>
            `
            :'<span>FC Escalquens</span>'
        }

        <div>
          ${
            post.status==='filled'
              ?`
                <span class="recruitment-filled">
                  Besoin pourvu
                </span>
              `
              :contactActions(post)
          }
        </div>

      </footer>

    </article>
  `;
};

const draw=()=>{
  const rows=posts.filter(
    post=>
      !filter
      ||post.audience===filter
  );

  document
    .querySelector('#recruitment-list')
    .innerHTML=
      rows.length
        ?rows.map(card).join('')
        :`
          <div class="empty-state">
            <b>
              Aucune annonce dans cette catégorie actuellement.
            </b>
          </div>
        `;
};

fetch('/api/page/recruitment')
  .then(async response=>{
    const data=await response.json();

    if(!response.ok){
      throw new Error(
        data.error
        ||`HTTP ${response.status}`
      );
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

    const filters=
      document.querySelector(
        '#recruitment-filters'
      );

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
      `
      +audiences.map(value=>`
        <button
          type="button"
          data-recruitment-filter="${esc(value)}"
          aria-pressed="false"
        >
          ${esc(
            audienceLabels[value]
            ||value
          )}
        </button>
      `).join('');

    document
      .querySelectorAll(
        '[data-recruitment-filter]'
      )
      .forEach(button=>{
        button.onclick=()=>{
          filter=
            button.dataset
              .recruitmentFilter;

          document
            .querySelectorAll(
              '[data-recruitment-filter]'
            )
            .forEach(item=>{
              const active=
                item===button;

              item.classList.toggle(
                'active',
                active
              );

              item.setAttribute(
                'aria-pressed',
                String(active)
              );
            });

          draw();
        };
      });

    draw();
  })
  .catch(error=>{
    console.error(error);

    document
      .querySelector('#recruitment-list')
      .innerHTML=`
        <div class="empty-state">
          <b>
            Les annonces sont momentanément indisponibles.
          </b>
        </div>
      `;
  });
