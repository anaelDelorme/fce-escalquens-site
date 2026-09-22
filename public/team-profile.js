const slug=new URLSearchParams(location.search).get('slug');
const set=(selector,value)=>{const node=document.querySelector(selector);if(node)node.textContent=value||'À renseigner'};
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const logo=(url,name)=>url?`<img class="match-logo" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<span class="match-logo fallback" aria-hidden="true">⚽</span>';

const safeHttpUrl=value=>{
  try{
    const url=
      new URL(
        String(value??''),
        location.origin
      );

    return ['http:','https:'].includes(
      url.protocol
    )
      ?url.href
      :'';
  }catch{
    return '';
  }
};
const roleLabels={coach_referent:'Coach référent',coach:'Coach',dirigeant:'Dirigeant',arbitre:'Arbitre'};
const staffCollator=new Intl.Collator('fr',{sensitivity:'base'});
const dateFormat=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long'});
const timeFormat=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
const displayDate=value=>{const label=dateFormat.format(new Date(value));return label.charAt(0).toLocaleUpperCase('fr')+label.slice(1)};

const statusLabels={
  postponed:'Reporté',
  cancelled:'Annulé'
};

const teamScoreOrTime=match=>{
  if(statusLabels[match.status]){
    return `
      <span class="match-status ${esc(match.status)}">
        ${statusLabels[match.status]}
      </span>
    `;
  }

  if(
    match.status==='finished'
    ||(
      match.home_score!=null
      &&match.away_score!=null
    )
  ){
    return `
      <strong class="score">
        ${match.home_score??'–'}
        <i>:</i>
        ${match.away_score??'–'}
      </strong>
    `;
  }

  if(Number(match.time_confirmed)===0){
    return `
      <strong class="kickoff unconfirmed">
        À confirmer
      </strong>
    `;
  }

  return `
    <strong class="kickoff">
      ${timeFormat.format(
        new Date(match.starts_at)
      )}
    </strong>
  `;
};

const mapsUrl=match=>match.latitude!=null&&match.longitude!=null?`https://www.google.com/maps/search/?api=1&query=${match.latitude},${match.longitude}`:[match.venue,match.venue_address].some(Boolean)?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([match.venue,match.venue_address].filter(Boolean).join(' '))}`:'';
const cityCase=value=>String(value||'').trim().toLocaleLowerCase('fr').replace(/(^|[\s'’-])([a-zà-öø-ÿ])/g,(_,before,letter)=>before+letter.toLocaleUpperCase('fr'));
const matchLocation=match=>{const venue=String(match.venue||'').trim(),address=String(match.venue_address||'').trim(),cityMatch=address.match(/\b\d{5}\s+([a-zà-öø-ÿ][a-zà-öø-ÿ'’ -]*)$/i),city=cityMatch?cityCase(cityMatch[1]):'',stadium=venue||(!city?address:'')||'Lieu à confirmer',map=stadium!=='Lieu à confirmer'?mapsUrl(match):'';return `<span class="match-location">📍 ${city?`<b>${esc(city)}</b><i>,</i> `:''}${map?`<a href="${esc(map)}" target="_blank" rel="noopener">${esc(stadium)}</a>`:`<span>${esc(stadium)}</span>`}</span>`};
let savedParticipants=[];
const plateauGamesCache=new Map();

const wireStandingsToggles=root=>{
  if(!root)return;

  const mobile=
    window.matchMedia(
      '(max-width:720px)'
    ).matches;

  [...root.querySelectorAll('.standings-card')]
    .forEach((card,index)=>{
      const button=
        card.querySelector('.standings-toggle');

      if(!button)return;

      const setCollapsed=collapsed=>{
        card.classList.toggle(
          'is-collapsed',
          collapsed
        );

        button.setAttribute(
          'aria-expanded',
          String(!collapsed)
        );

        button.setAttribute(
          'aria-label',
          collapsed
            ?'Afficher ce classement'
            :'Réduire ce classement'
        );

        button.textContent=
          collapsed
            ?'+'
            :'−';
      };

      /*
       * Smartphone :
       * premier classement ouvert,
       * les suivants repliés.
       */
      setCollapsed(
        mobile && index>0
      );

      button.onclick=()=>{
        setCollapsed(
          !card.classList.contains(
            'is-collapsed'
          )
        );
      };
    });
};


const rawSource=match=>{try{const raw=typeof match.raw_json==='string'?JSON.parse(match.raw_json||'{}'):match.raw_json||{};return raw.site||raw}catch{return {}}};
const canonical=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').replace(/[^a-z0-9]+/g,' ').trim();
const plateauParticipants=match=>{
  const saved=savedParticipants.filter(item=>String(item.match_id)===String(match.id));
  const source=rawSource(match);
  const raw=(source.equipes||source.participants||[]).map(item=>({
    name:item.eqNom||item.name||item.label||item.club?.clNom||item.club?.nom||'',
    club_number:item.club?.clNo||item.cl_no||'',logo_url:item.logo||item.club?.logo||'',
    is_club:String(item.club?.clNo||item.cl_no||'')==='101544'||/escalquens/i.test(item.eqNom||item.name||item.club?.clNom||'')
  })).filter(item=>item.name);
  const unique=new Map();
  (saved.length?saved:raw).forEach(item=>{const key=String(item.club_number||'')||canonical(item.name);if(item.name&&!unique.has(key))unique.set(key,item)});
  const organizer=String(source.organisateur?.clNo||'');
  return [...unique.values()].map(item=>({...item,is_host:Boolean(organizer&&String(item.club_number||'')===organizer)}));
};
const participantList=(match,rows=plateauParticipants(match))=>`<div class="plateau-participants"><small>${rows.length===1?'Équipe participante':'Équipes participantes'}</small>${rows.length
  ?`<div>${rows.map(item=>`<span class="${[Number(item.is_club)===1?'our-team':'',item.is_host?'host-team':''].filter(Boolean).join(' ')}">${logo(item.logo_url,item.name)}<span class="participant-copy"><b>${esc(item.name)}</b>${item.is_host?'<small>Organisateur</small>':''}</span></span>`).join('')}</div>`
  :'<p class="participant-empty">Participants à confirmer.</p>'}</div>`;
const plateauGameScore=game=>game.status==='cancelled'?'<span class="plateau-game-status">Annulé</span>':game.home_score!=null&&game.away_score!=null?`<strong class="plateau-game-score">${esc(game.home_score)}<i>:</i>${esc(game.away_score)}</strong>`:'<span class="plateau-game-status">À venir</span>';
const plateauGamesHtml=games=>games.length?`<div class="plateau-games-list">${games.map((game,index)=>`<div class="plateau-game-row"><small>Match ${index+1}</small><div class="plateau-game-team">${logo(game.home_logo_url,game.home_team)}<b>${esc(game.home_team)}</b></div>${plateauGameScore(game)}<div class="plateau-game-team">${logo(game.away_logo_url,game.away_team)}<b>${esc(game.away_team)}</b></div></div>`).join('')}</div>`:'<p class="participant-empty">Programme détaillé non communiqué par la FFF.</p>';
const plateauProgram=match=>{const count=Number(match.plateau_game_count||0);return count?`<div class="plateau-program"><button type="button" data-plateau-games="${esc(match.id)}" aria-expanded="false">Voir ${count===1?'le match':`les ${count} matchs`} d’Escalquens <span>↓</span></button><div class="plateau-games-detail" data-plateau-detail="${esc(match.id)}" hidden></div></div>`:'<div class="plateau-program-empty">Programme détaillé non communiqué</div>'};
const plateauCard=match=>`<article class="team-plateau-card match-card">
  <header><div><time>${displayDate(match.starts_at)}</time><small>Plateau</small></div><strong>${Number(match.time_confirmed)===0?'À confirmer':timeFormat.format(new Date(match.starts_at))}</strong></header>
  <p class="competition-name">${esc(match.competition||'Football animation')}</p>
  ${participantList(match)}${plateauProgram(match)}
  <footer>${matchLocation(match)}${match.source_url?`<a href="${esc(match.source_url)}" target="_blank" rel="noopener">Source officielle →</a>`:''}</footer>
</article>`;
const miniMatch=match=>
  match.event_type==='plateau'
  ||match.event_type==='animation'
    ?plateauCard(match)
    :`
      <article class="match-card ${esc(match.status||'')}">

        <header>
          <time datetime="${esc(match.starts_at)}">
            ${displayDate(match.starts_at)}
          </time>

          <span>
            ${
              match.event_type==='friendly'
                ?'Match amical'
                :'Match'
            }
          </span>
        </header>

        <p class="competition-name">
          ${esc(
            match.competition
            ||'Rencontre du club'
          )}
        </p>

        <div class="scoreboard">

          <div class="match-team">
            ${logo(
              match.home_logo_url,
              match.home_team
            )}
            <b>${esc(match.home_team)}</b>
          </div>

          ${teamScoreOrTime(match)}

          <div class="match-team">
            ${logo(
              match.away_logo_url,
              match.away_team
            )}
            <b>${esc(match.away_team)}</b>
          </div>

        </div>

        <footer>
          ${matchLocation(match)}

          ${
            safeHttpUrl(match.source_url)
              ?`
                <a
                  href="${esc(
                    safeHttpUrl(
                      match.source_url
                    )
                  )}"
                  target="_blank"
                  rel="noopener"
                >
                  Source officielle →
                </a>
              `
              :''
          }
        </footer>

      </article>
    `;

const wirePlateauDetails=()=>document.querySelectorAll('[data-plateau-games]').forEach(button=>button.onclick=async()=>{
  const id=button.dataset.plateauGames,detail=document.querySelector(`[data-plateau-detail="${id}"]`),opening=button.getAttribute('aria-expanded')!=='true';
  button.setAttribute('aria-expanded',String(opening));button.querySelector('span').textContent=opening?'↑':'↓';detail.hidden=!opening;
  if(!opening||detail.dataset.loaded==='1')return;
  detail.innerHTML='<p class="plateau-games-loading">Chargement du programme…</p>';
  try{if(!plateauGamesCache.has(id)){const response=await fetch(`/api/plateau-games?plateau_id=${encodeURIComponent(id)}`),data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);plateauGamesCache.set(id,data.games||[])}detail.innerHTML=plateauGamesHtml(plateauGamesCache.get(id));detail.dataset.loaded='1'}catch(error){console.error(error);detail.innerHTML='<p class="participant-empty">Le détail est momentanément indisponible.</p>'}
});
fetch(`/api/page/team-profile?slug=${encodeURIComponent(slug||'')}&v=26`).then(async response=>{
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||`Fiche équipe : ${response.status}`);
  return data;
}).then(({team,entries=[],sessions=[],staff=[],upcoming=[],results=[],participants=[],standings=[],standing_logos=[]})=>{
  savedParticipants=participants;
  document.title=`${team.name} - FC Escalquens`;set('#team-name',team.name);set('#team-description',team.description);set('#player-count',team.player_count||'—');
  const engagementRows=entries.map((item,index)=>({
    teamLabel:item.name||item.category_code||[team.name,item.team_number].filter(Boolean).join(' ')||`Équipe ${index+1}`,
    competition:[item.division||item.competition_name,item.pool].filter(Boolean).join(' · ')
  }));
  const levelNode=document.querySelector('#team-level');
  if(levelNode)levelNode.innerHTML=(engagementRows.length?engagementRows:[{teamLabel:team.level||'À renseigner',competition:''}]).map(item=>`<span class="engagement-chip"><strong>${esc(item.teamLabel)}</strong>${item.competition?`<small>${esc(item.competition)}</small>`:''}</span>`).join('');
  document.querySelector('#player-label').textContent=team.group_name==='Féminines'||team.gender==='female'?'licenciées pratiquantes':'licenciés pratiquants';
  const defaultPhoto='/team-default.webp',teamPhoto=team.photo_url||defaultPhoto;
  const photo=document.querySelector('#team-photo'),visual=photo.closest('.team-visual');
  const revealPhoto=(source,fallback)=>{const loader=new Image();loader.onload=()=>{photo.src=source;photo.alt=team.photo_alt||`Photo du groupe ${team.name}`;photo.classList.add('is-ready');visual.setAttribute('aria-busy','false')};loader.onerror=()=>{if(source!==fallback)revealPhoto(fallback,fallback);else visual.setAttribute('aria-busy','false')};loader.src=source};
  revealPhoto(teamPhoto,defaultPhoto);
  const sortedStaff=[...staff].sort((a,b)=>((a.role==='coach_referent'?0:1)-(b.role==='coach_referent'?0:1))||staffCollator.compare(a.member?.full_name||'',b.member?.full_name||''));
  const staffNode=document.querySelector('#team-staff');
  staffNode.innerHTML=sortedStaff.map(item=>`<article class="${item.role==='coach_referent'?'is-referent':''}">${item.member.photo_key?`<img src="/media/${esc(item.member.photo_key)}" alt="">`:''}<small>${roleLabels[item.role]||esc(item.role)}</small><h3>${esc(item.member.full_name)}</h3>${item.member.email?`<a href="mailto:${esc(item.member.email)}">${esc(item.member.email)}</a>`:''}${item.member.phone?`<a href="tel:${esc(item.member.phone)}">${esc(item.member.phone)}</a>`:''}</article>`).join('')||'<p>Encadrement à venir.</p>';
  staffNode.setAttribute('aria-busy','false');
  const days=['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  document.querySelector('#team-training').innerHTML=sessions.map(row=>{const query=row.venue_latitude!=null&&row.venue_longitude!=null?`${row.venue_latitude},${row.venue_longitude}`:row.venue_full_address||row.address||row.venue_name||row.venue,link=row.venue_maps_url||`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;return `<article><b>${days[row.weekday]}</b><span>${row.starts_at} - ${row.ends_at}</span><small>${esc(row.venue_name||row.venue)}</small><a href="${link}" target="_blank" rel="noopener">Itinéraire →</a></article>`}).join('')||'<p>Horaires à venir.</p>';
  document.querySelector('#team-upcoming').innerHTML=upcoming.map(match=>miniMatch(match,true)).join('')||'<p>Les prochaines rencontres arrivent bientôt.</p>';
  document.querySelector('#team-results').innerHTML=results.map(match=>miniMatch(match,false)).join('')||'<p>Aucun résultat publié pour ce groupe.</p>';


  const standingKey=value=>
    String(value||'')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLocaleLowerCase('fr')
      .replace(/[^a-z0-9]+/g,' ')
      .trim()
      .split(/\s+/)
      .filter(token=>
        token
        && ![
          'a','c','e','f','j','o','s','t','u',
          'ao','es','fc','js','ts','us',
          'club','football'
        ].includes(token)
      )
      .join(' ');

  const standingLogoUrl=name=>{
    if(/escalquens/i.test(String(name||''))){
      return '/logo-fce.webp';
    }

    const target=standingKey(name);

    const found=standing_logos.find(item=>{
      const candidate=standingKey(item.team_name);

      return candidate && (
        candidate===target
        || candidate.includes(target)
        || target.includes(candidate)
      );
    });

    return found?.logo_url||'';
  };

  const standingsNode=document.querySelector('#team-standings');

  const standingsGroups=new Map();

  standings.forEach(row=>{
    const key=String(
      row.phase_id
      ||row.competition_team_id
      ||'classement'
    );

    if(!standingsGroups.has(key)){
      standingsGroups.set(key,[]);
    }

    standingsGroups
      .get(key)
      .push(row);
  });

  standingsNode.innerHTML=
    standingsGroups.size
      ?[...standingsGroups.values()]
        .map(rows=>{

          const firstRow=rows[0]||{};

          const title=[
            firstRow.competition_name,
            firstRow.pool_label
          ]
            .filter(Boolean)
            .join(' · ')
            ||'Classement';

          const ordered=[
            ...rows
          ].sort(
            (a,b)=>
              Number(a.position||999)
              -Number(b.position||999)
          );

          return `
            <section class="team-standing-card standings-card">

              <div class="team-standing-head standings-card__header">

                <div>
                  <span class="standings-card__eyebrow">Classement FFF</span>
                  <h3>${esc(title)}</h3>
                </div>

                ${
                  firstRow.source_url
                    ?`<a
                        href="${esc(firstRow.source_url)}"
                        target="_blank"
                        rel="noopener"
                      >Source FFF →</a>`
                    :''
                }

                <button
                  type="button"
                  class="standings-toggle"
                  aria-expanded="true"
                  aria-label="Réduire ce classement"
                >−</button>

              </div>

              <div class="standings">

                <div class="standings-table-wrap" tabindex="0">
<table class="standings-table">
  <thead>
    <tr>
      <th scope="col">#</th>
      <th scope="col">Équipe</th>
      <th scope="col">J</th>
      <th scope="col">G</th>
      <th scope="col">N</th>
      <th scope="col">P</th>
      <th scope="col">Bp.</th>
      <th scope="col">Bc.</th>
      <th scope="col">Diff.</th>
      <th scope="col">Pts</th>
    </tr>
  </thead>

  <tbody>
    ${ordered.map(row=>{
      const diff=
        Number(row.goals_for||0)
        -Number(row.goals_against||0);

      const club=
        /escalquens/i.test(
          String(row.team_name||'')
        );

      const rank=
        Number(row.position||0);

      const rankClass=
        [1,2,3].includes(rank)
          ?` standings-rank--${rank}`
          :'';

      const diffClass=
        diff>0
          ?' standings-diff--positive'
          :diff<0
            ?' standings-diff--negative'
            :'';

      return `
        <tr class="${club?'is-club':''}">
          <td>
            <span class="standings-rank${rankClass}">
              ${esc(row.position??'')}
            </span>
          </td>

          <td class="standings-team-cell">
            <span class="standings-team-identity">
              ${logo(
                standingLogoUrl(row.team_name),
                row.team_name
              )}
              <span class="standings-team">
                ${esc(row.team_name??'')}
              </span>
              ${club
                ?'<span class="standings-club-badge">FCE</span>'
                :''
              }
            </span>
            <span class="standings-mobile-stats" aria-hidden="true">
              <span><small>J</small><b>${esc(row.played??0)}</b></span>
              <span><small>G</small><b>${esc(row.won??0)}</b></span>
              <span><small>N</small><b>${esc(row.drawn??0)}</b></span>
              <span><small>P</small><b>${esc(row.lost??0)}</b></span>
              <span><small>Bp</small><b>${esc(row.goals_for??0)}</b></span>
              <span><small>Bc</small><b>${esc(row.goals_against??0)}</b></span>
              <span>
                <small>Diff</small>
                <b class="${diffClass.trim()}">
                  ${diff>0?'+':''}${diff}
                </b>
              </span>
            </span>

          </td>

          <td>${esc(row.played??0)}</td>
          <td>${esc(row.won??0)}</td>
          <td>${esc(row.drawn??0)}</td>
          <td>${esc(row.lost??0)}</td>
          <td>${esc(row.goals_for??0)}</td>
          <td>${esc(row.goals_against??0)}</td>

          <td>
            <span class="standings-diff${diffClass}">
              ${diff>0?'+':''}${diff}
            </span>
          </td>

          <td>
            <strong class="standings-points">
              ${esc(row.points??0)}
            </strong>
          </td>
        </tr>
      `;
    }).join('')}
  </tbody>
</table>
</div>

              </div>

            </section>
          `;
        })
        .join('')
      :'<p>Aucun classement FFF disponible pour ce groupe.</p>';

  wireStandingsToggles(standingsNode);

  wirePlateauDetails();
}).catch(error=>{console.error(error);const staffNode=document.querySelector('#team-staff');if(staffNode)staffNode.setAttribute('aria-busy','false');document.querySelector('#team-name').textContent='Informations indisponibles';document.querySelector('#team-description').textContent='La connexion aux données du club a échoué. Merci de réessayer dans quelques instants.'});
