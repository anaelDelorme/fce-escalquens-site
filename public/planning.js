const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const safeHttpUrl=value=>{
  if(!value)return '';
  try{
    const url=new URL(String(value),location.origin);
    return ['http:','https:'].includes(url.protocol)?url.href:'';
  }catch{return ''}
};
let teams=[],sessions=[],venues=[];
const days=['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const mapsLink=(venue,row)=>{
  const configured=safeHttpUrl(venue?.maps_url);
  if(configured)return configured;
  if(venue?.latitude!=null&&venue?.longitude!=null)return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(String(venue.latitude)+','+String(venue.longitude));
  return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(String(venue?.address||row.address||venue?.name||row.venue||''));
};
const planningCollator=
  new Intl.Collator(
    'fr',
    {
      numeric:true,
      sensitivity:'base'
    }
  );

const draw=()=>{
  const section=
    document
      .querySelector('#section-filter')
      .value;

  const teamId=
    document
      .querySelector('#team-filter')
      .value;

  const day=
    document
      .querySelector('#day-filter')
      .value;

  const teamMap=
    Object.fromEntries(
      teams.map(
        item=>[item.id,item]
      )
    );

  const venueMap=
    Object.fromEntries(
      venues.map(
        item=>[item.id,item]
      )
    );

  const rows=sessions
    .filter(item=>
      (!teamId
        ||String(item.team_id)===teamId
      )
      &&(
        !day
        ||String(item.weekday)===day
      )
      &&(
        !section
        ||teamMap[item.team_id]
          ?.group_name===section
      )
    )
    .slice()
    .sort((a,b)=>
      Number(a.weekday||99)
      -Number(b.weekday||99)
      ||String(a.starts_at||'')
        .localeCompare(
          String(b.starts_at||'')
        )
      ||planningCollator.compare(
        teamMap[a.team_id]?.name
          ||a.category
          ||'',
        teamMap[b.team_id]?.name
          ||b.category
          ||''
      )
    );

  const grouped=new Map();

  rows.forEach(row=>{
    const key=
      String(row.weekday||'');

    if(!grouped.has(key)){
      grouped.set(key,[]);
    }

    grouped.get(key).push(row);
  });

  const root=
    document.querySelector(
      '#planning-list'
    );

  root.innerHTML=
    grouped.size
      ?[...grouped.entries()]
        .map(([weekday,dayRows])=>{

          const dayLabel=
            days[Number(weekday)]
            ||'Jour à confirmer';

          return `
            <section class="planning-day">

              <header class="planning-day__header">

                <div>
                  <span class="planning-day__eyebrow">
                    Entraînements
                  </span>

                  <h2>
                    ${esc(dayLabel)}
                  </h2>
                </div>

                <span class="planning-day__count">
                  ${dayRows.length}
                  créneau${
                    dayRows.length>1
                      ?'x'
                      :''
                  }
                </span>

              </header>

              <div class="planning-day__sessions">

                ${dayRows.map(row=>{

                  const team=
                    teamMap[row.team_id];

                  const venue=
                    venueMap[row.venue_id];

                  const venueName=
                    venue?.name
                    ||row.venue
                    ||'Terrain à confirmer';

                  const address=
                    venue?.address
                    ||row.address
                    ||'';

                  return `
                    <article class="planning-session">

                      <time>
                        <strong>
                          ${esc(row.starts_at)}
                        </strong>

                        <span>
                          ${esc(row.ends_at)}
                        </span>
                      </time>

                      <div class="planning-session__team">

                        <small>
                          ${esc(
                            team?.group_name
                            ||'Club'
                          )}
                        </small>

                        <h3>
                          ${esc(
                            team?.name
                            ||row.category
                          )}
                        </h3>

                      </div>

                      <div class="planning-session__venue">

                        <small>
                          Terrain
                        </small>

                        <strong>
                          ${esc(venueName)}
                        </strong>

                        ${
                          address
                            ?`
                              <span>
                                ${esc(address)}
                              </span>
                            `
                            :''
                        }

                      </div>

                      <a
                        class="planning-session__map"
                        href="${esc(
                          mapsLink(
                            venue,
                            row
                          )
                        )}"
                        target="_blank"
                        rel="noopener"
                      >
                        Itinéraire
                        <span>→</span>
                      </a>

                    </article>
                  `;
                }).join('')}

              </div>

            </section>
          `;
        })
        .join('')
      :`
        <div class="empty-state">
          <b>
            Aucun entraînement avec ces filtres.
          </b>
        </div>
      `;
};

fetch('/api/page/planning').then(response=>response.json()).then(data=>{
  teams=(data.teams||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'fr',{numeric:true,sensitivity:'base'}));
  sessions=data.sessions||[];venues=data.venues||[];
  document.querySelector('#team-filter').innerHTML+=teams.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.name)+'</option>').join('');
  draw();
});
document.querySelectorAll('.planning-controls select').forEach(select=>select.addEventListener('change',draw));
