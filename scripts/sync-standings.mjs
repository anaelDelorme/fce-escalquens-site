const CLUB_NO='101544';

const siteUrl=
  process.env.FCE_SITE_URL
    ?.replace(/\/$/,'');

const token=
  process.env.FCE_SYNC_TOKEN;

if(!siteUrl||!token){
  throw new Error(
    'Secrets FCE_SITE_URL ou FCE_SYNC_TOKEN manquants'
  );
}

const endpoint=
  `${siteUrl}/internal/sync/standings`;

const base=
  'https://api-dofa.fff.fr';

const headers={
  accept:
    'application/json, application/ld+json;q=0.9,*/*;q=0.5',

  'accept-language':
    'fr-FR,fr;q=0.9',

  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128 Safari/537.36'
};


const first=
  (...values)=>
    values.find(
      value=>
        value!==undefined
        &&value!==null
        &&value!==''
    );


const list=
  value=>
    Array.isArray(value)
      ?value
      :value?.['hydra:member']
        ||value?.items
        ||value?.data
        ||value?.results
        ||[];


const number=
  value=>{

    if(
      value===undefined
      ||value===null
      ||value===''
    ){
      return null;
    }

    const parsed=
      Number(
        String(value)
          .replace(',','.')
          .replace(
            /[^0-9.-]/g,
            ''
          )
      );

    return Number.isFinite(parsed)
      ?parsed
      :null;
  };


const text=
  value=>{

    if(
      value===undefined
      ||value===null
    ){
      return '';
    }

    if(
      typeof value==='string'
      ||typeof value==='number'
    ){
      return String(value).trim();
    }

    if(
      typeof value!=='object'
    ){
      return '';
    }

    return text(
      first(
        value.nomAbr,
        value.short_name,
        value.shortName,
        value.name,
        value.nom,
        value.label,
        value.libelle
      )
    );
  };


const currentSeasonStart=
  ()=>{

    const now=
      new Date();

    return now.getUTCMonth()>=6
      ?now.getUTCFullYear()
      :now.getUTCFullYear()-1;
  };


async function getJson(path){

  const url=
    path.startsWith('http')
      ?path
      :`${base}${path}`;

  let lastError;


  for(
    let attempt=1;
    attempt<=3;
    attempt++
  ){

    try{

      const response=
        await fetch(
          url,
          {
            headers,
            redirect:'follow'
          }
        );


      const raw=
        await response.text();


      if(!response.ok){

        throw new Error(
          `HTTP ${response.status}${
            raw
              ?` — ${
                raw
                  .replace(
                    /\s+/g,
                    ' '
                  )
                  .slice(
                    0,
                    180
                  )
              }`
              :''
          }`
        );
      }


      return JSON.parse(
        raw
      );

    }catch(error){

      lastError=
        error;


      if(attempt<3){

        await new Promise(
          resolve=>
            setTimeout(
              resolve,
              700*attempt
            )
        );
      }
    }
  }


  throw new Error(
    `${url} — ${
      lastError?.message
      ||lastError
    }`
  );
}


const teamName=
  row=>
    text(
      first(
        row.equipe?.club?.nomAbr,
        row.equipe?.club?.nom,
        row.equipe?.club?.name,

        row.equipe?.nom,
        row.equipe?.name,

        row.team?.club?.name,
        row.team?.name,

        row.club?.nomAbr,
        row.club?.nom,
        row.club?.name,

        row.team_name,
        row.teamName,
        row.nom,
        row.name
      )
    );


function rankingArray(payload){

  let best=[];
  let bestScore=-1;

  const seen=
    new Set();


  const visit=
    (
      value,
      depth=0
    )=>{

      if(
        !value
        ||depth>8
        ||typeof value!=='object'
        ||seen.has(value)
      ){
        return;
      }


      seen.add(value);


      if(
        Array.isArray(value)
      ){

        const objects=
          value.filter(
            item=>
              item
              &&typeof item==='object'
              &&!Array.isArray(item)
          );


        if(objects.length){

          const named=
            objects.filter(
              row=>
                teamName(row)
            );


          if(named.length){

            const score=
              named.length*10
              +named
                .slice(0,4)
                .reduce(
                  (
                    sum,
                    row
                  )=>{

                    const raw=
                      JSON.stringify(row)
                        .toLowerCase();

                    return (
                      sum
                      +Number(
                        /point|pts/.test(raw)
                      )*2
                      +Number(
                        /position|rang|class|clt/.test(raw)
                      )*2
                    );
                  },
                  0
                );


            if(
              score>bestScore
            ){
              bestScore=score;
              best=named;
            }
          }
        }


        value.forEach(
          item=>
            visit(
              item,
              depth+1
            )
        );

        return;
      }


      Object
        .values(value)
        .forEach(
          child=>
            visit(
              child,
              depth+1
            )
        );
    };


  visit(payload);

  return best;
}


function normalizeRanking(
  payload,
  meta
){

  return rankingArray(payload)
    .map(
      (
        row,
        index
      )=>{

        const won=
          number(
            first(
              row.won,
              row.gagnes,
              row.gagne,
              row.victoires,
              row.v,
              row.g
            )
          );


        const drawn=
          number(
            first(
              row.drawn,
              row.nuls,
              row.nul,
              row.n,
              row.d
            )
          );


        const lost=
          number(
            first(
              row.lost,
              row.perdus,
              row.perdu,
              row.defaites,
              row.defaite,
              row.p
            )
          );


        let played=
          number(
            first(
              row.played,
              row.joues,
              row.joue,
              row.matches,
              row.matchs,
              row.nb_matchs,
              row.nombre_matchs,
              row.j,
              row.jo
            )
          );


        if(
          played===null
          &&won!==null
          &&drawn!==null
          &&lost!==null
        ){
          played=
            won+drawn+lost;
        }


        const name=
          teamName(row);


        if(!name){
          return null;
        }


        return {

          source:
            'fff',

          phase_id:
            `${
              meta.cpNo
            }:${
              meta.phaseNo
            }:${
              meta.poolNo
            }`,

          team_fff_id:
            meta.teamFffId,

          category_code:
            meta.categoryCode,

          team_number:
            meta.teamNumber,

          competition_name:
            meta.competitionName,

          pool_label:
            meta.poolLabel,

          source_url:
            `https://epreuves.fff.fr/competition/engagement/${
              meta.cpNo
            }/phase/${
              meta.phaseNo
            }/${
              meta.poolNo
            }/classement`,

          team_name:
            name,

          position:
            number(
              first(
                row.position,
                row.rank,
                row.rang,
                row.place,
                row.classement,
                row.clt
              )
            )
            ??index+1,

          played:
            played??0,

          won:
            won??0,

          drawn:
            drawn??0,

          lost:
            lost??0,

          goals_for:
            number(
              first(
                row.goals_for,
                row.goalsFor,
                row.bp,
                row.buts_pour,
                row.butsPour,
                row.buts_marques,
                row.butsMarques
              )
            )
            ??0,

          goals_against:
            number(
              first(
                row.goals_against,
                row.goalsAgainst,
                row.bc,
                row.buts_contre,
                row.butsContre,
                row.buts_encaisses,
                row.butsEncaisses
              )
            )
            ??0,

          points:
            number(
              first(
                row.points,
                row.pts,
                row.point
              )
            )
            ??0,

          raw_json:
            row
        };
      }
    )
    .filter(Boolean);
}


const containsFce=
  rows=>
    rows.some(
      row=>
        /escalquens/i.test(
          row.team_name
          ||''
        )
    );


async function rankingAt(
  meta
){

  const payload=
    await getJson(
      `/api/compets/${
        meta.cpNo
      }/phases/${
        meta.phaseNo
      }/poules/${
        meta.poolNo
      }/classement_journees`
    );


  const rows=
    normalizeRanking(
      payload,
      meta
    );


  return containsFce(rows)
    ?rows
    :[];
}


async function discoverRanking(
  baseMeta
){

  const attempts=[];


  const preferredPhase=
    number(
      first(
        baseMeta.engagement
          ?.phase
          ?.number,

        baseMeta.engagement
          ?.phase
          ?.ph_no,

        baseMeta.engagement
          ?.phase
          ?.phNo,

        1
      )
    )
    ||1;


  /*
   * Sur les engagements FFF,
   * poule.stage_number est actuellement
   * le numéro utilisé par les URLs
   * de poule.
   */
  const preferredPool=
    number(
      first(
        baseMeta.engagement
          ?.poule
          ?.stage_number,

        baseMeta.engagement
          ?.poule
          ?.number,

        baseMeta.engagement
          ?.poule
          ?.po_no,

        baseMeta.engagement
          ?.poule
          ?.poNo
      )
    )
    ||1;


  /*
   * Première tentative :
   * on utilise directement
   * l'engagement du club.
   */
  try{

    const rows=
      await rankingAt({
        ...baseMeta,
        phaseNo:
          preferredPhase,
        poolNo:
          preferredPool
      });


    if(rows.length){
      return rows;
    }


    attempts.push(
      `phase ${
        preferredPhase
      }, poule ${
        preferredPool
      }: FC Escalquens absent`
    );

  }catch(error){

    attempts.push(
      `phase ${
        preferredPhase
      }, poule ${
        preferredPool
      }: ${
        error.message
      }`
    );
  }


  /*
   * Secours :
   * découverte des phases / poules.
   */
  let phases=[];


  try{

    phases=
      list(
        await getJson(
          `/api/compets/${
            baseMeta.cpNo
          }/phases`
        )
      );

  }catch(error){

    attempts.push(
      `phases: ${
        error.message
      }`
    );
  }


  if(!phases.length){

    phases=[
      {
        number:
          preferredPhase
      }
    ];
  }


  const found=[];


  for(
    const phase of phases
  ){

    const phaseNo=
      number(
        first(
          phase.number,
          phase.ph_no,
          phase.phNo,
          phase.id
        )
      )
      ||preferredPhase;


    let pools=[];


    try{

      pools=
        list(
          await getJson(
            `/api/compets/${
              baseMeta.cpNo
            }/phases/${
              phaseNo
            }/poules.json?filter=`
          )
        );

    }catch(error){

      attempts.push(
        `poules phase ${
          phaseNo
        }: ${
          error.message
        }`
      );
    }


    for(
      const pool of pools
    ){

      const poolNo=
        number(
          first(
            pool.number,
            pool.stage_number,
            pool.po_no,
            pool.poNo,
            pool.id
          )
        );


      if(!poolNo){
        continue;
      }


      if(
        phaseNo===preferredPhase
        &&poolNo===preferredPool
      ){
        continue;
      }


      try{

        const poolLabel=
          text(
            first(
              pool.name,
              pool.nom,
              pool.label,
              baseMeta.poolLabel
            )
          );


        const rows=
          await rankingAt({
            ...baseMeta,
            phaseNo,
            poolNo,
            poolLabel
          });


        if(rows.length){

          found.push(
            rows
          );
        }

      }catch(error){

        attempts.push(
          `phase ${
            phaseNo
          }, poule ${
            poolNo
          }: ${
            error.message
          }`
        );
      }
    }
  }


  if(
    found.length===1
  ){
    return found[0];
  }


  if(
    found.length>1
  ){

    throw new Error(
      `plusieurs poules contenant FC Escalquens ont été trouvées pour ${
        baseMeta.competitionName
      } ; l'engagement FFF n'a pas permis de choisir automatiquement`
    );
  }


  throw new Error(
    `aucun classement trouvé pour ${
      baseMeta.competitionName
    }. ${
      attempts
        .slice(-4)
        .join(' | ')
    }`
  );
}


async function main(){

  const payload=
    await getJson(
      `/api/clubs/${
        CLUB_NO
      }/equipes.json?filter=`
    );


  let teams=
    list(payload);


  const currentSeason=
    currentSeasonStart();


  const current=
    teams.filter(
      team=>
        number(
          team.season
        )===currentSeason
    );


  if(current.length){
    teams=current;
  }


  if(!teams.length){

    throw new Error(
      `Aucune équipe FFF trouvée pour le club ${
        CLUB_NO
      }.`
    );
  }


  console.log(
    `FFF classements : ${
      teams.length
    } équipe(s) du club à analyser.`
  );


  const allRows=[];
  const failures=[];


  for(
    const team of teams
  ){

    const categoryCode=
      String(
        first(
          team.category_code,
          team.categoryCode,
          ''
        )
      ).trim();


    const teamNumber=
      String(
        first(
          team.number,
          team.team_number,
          team.teamNumber,
          ''
        )
      ).trim();


    const teamFffId=
      String(
        first(
          team.id,
          team.eq_no,
          team.eqNo,
          team.equipe?.id,
          ''
        )
      ).trim();


    for(
      const engagement
      of list(
        team.engagements
      )
    ){

      const competition=
        engagement.competition
        ||{};


      const type=
        String(
          first(
            competition.type,
            competition.type_code,
            competition.typeCode,
            ''
          )
        )
          .toLowerCase();


      /*
       * Pas de classement général
       * pour les coupes.
       */
      if(
        type
        &&!(
          type==='ch'
          ||type.includes(
            'champ'
          )
        )
      ){
        continue;
      }


      const cpNo=
        number(
          first(
            competition.cp_no,
            competition.cpNo,
            competition.number,
            competition.id
          )
        );


      if(!cpNo){
        continue;
      }


      const meta={

        cpNo,

        categoryCode,

        teamNumber,

        teamFffId,

        engagement,

        competitionName:
          text(
            first(
              competition.name,
              competition.nom,
              competition.label,
              `Compétition ${
                cpNo
              }`
            )
          ),

        poolLabel:
          text(
            first(
              engagement.poule?.name,
              engagement.poule?.nom,
              engagement.poule?.label,
              ''
            )
          )
      };


      try{

        const rows=
          await discoverRanking(
            meta
          );


        allRows.push(
          ...rows
        );


        console.log(
          `FFF classements : ${
            categoryCode
          }${
            teamNumber
              ?` ${teamNumber}`
              :''
          } — ${
            meta.competitionName
          } : ${
            rows.length
          } ligne(s).`
        );

      }catch(error){

        const message=
          String(
            error?.message
            ||error
          );


        failures.push(
          message
        );


        console.log(
          `::warning title=Classement FFF indisponible::${
            message.replace(
              /\r?\n/g,
              ' '
            )
          }`
        );
      }
    }
  }


  const unique=
    new Map();


  for(
    const row of allRows
  ){

    unique.set(
      `${
        row.phase_id
      }|${
        row.team_name
      }`,
      row
    );
  }


  const rows=[
    ...unique.values()
  ];


  if(!rows.length){

    throw new Error(
      `Aucun classement FFF récupéré. ${
        failures
          .slice(-5)
          .join(' | ')
      }`
    );
  }


  const response=
    await fetch(
      endpoint,
      {
        method:'POST',

        headers:{
          authorization:
            `Bearer ${token}`,

          'content-type':
            'application/json'
        },

        body:
          JSON.stringify({
            rows
          })
      }
    );


  const raw=
    await response.text();


  if(!response.ok){

    throw new Error(
      `Import Cloudflare HTTP ${
        response.status
      }: ${
        raw
      }`
    );
  }


  console.log(
    raw
  );


  console.log(
    `FFF classements : ${
      rows.length
    } ligne(s) envoyée(s), ${
      failures.length
    } engagement(s) sans classement.`
  );
}


await main();
