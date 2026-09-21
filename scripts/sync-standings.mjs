const CLUB_NO='101544';

const siteUrl=
  process.env.FCE_SITE_URL
    ?.replace(/\/$/,'');

const token=
  process.env.FCE_SYNC_TOKEN;

const zenrowsKey=
  process.env.ZENROWS_API_KEY;

if(!siteUrl||!token){
  throw new Error(
    'Secrets FCE_SITE_URL ou FCE_SYNC_TOKEN manquants'
  );
}

const endpoint=
  `${siteUrl}/internal/sync/standings`;

const DOFA=
  'https://api-dofa.fff.fr';


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


      if(Array.isArray(value)){

        const rows=
          value.filter(
            item=>
              item
              &&typeof item==='object'
              &&!Array.isArray(item)
              &&teamName(item)
          );


        if(rows.length){

          const score=
            rows.length*10
            +rows
              .slice(0,4)
              .reduce(
                (
                  total,
                  row
                )=>{

                  const raw=
                    JSON.stringify(row)
                      .toLowerCase();

                  return total
                    +Number(
                      /point|pts/.test(raw)
                    )*3
                    +Number(
                      /position|rang|class|clt/.test(raw)
                    )*3;

                },
                0
              );


          if(score>bestScore){
            bestScore=score;
            best=rows;
          }
        }


        value.forEach(
          child=>
            visit(
              child,
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

  const teamKey=
    meta.teamNumber
    ||meta.teamFffId
    ||meta.categoryCode
    ||'team';


  return rankingArray(payload)
    .map(
      (
        row,
        index
      )=>{

        const name=
          teamName(row);


        if(!name){
          return null;
        }


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


        return {

          source:
            'fff',

          /*
           * teamKey permet d'éviter un conflit
           * si deux équipes FCE sont dans
           * la même poule.
           */
          phase_id:
            `${
              meta.cpNo
            }:${
              meta.phaseNo
            }:${
              meta.poolNo
            }:${
              teamKey
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


const containsEscalquens=
  rows=>
    rows.some(
      row=>
        /escalquens/i.test(
          row.team_name
          ||''
        )
    );


async function directJson(url){

  const response=
    await fetch(
      url,
      {
        headers:{
          accept:
            'application/json, application/ld+json;q=0.9,*/*;q=0.5',

          'accept-language':
            'fr-FR,fr;q=0.9',

          'user-agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128 Safari/537.36'
        },

        redirect:
          'follow'
      }
    );


  const raw=
    await response.text();


  if(!response.ok){

    throw new Error(
      `HTTP ${
        response.status
      } — ${
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
    );
  }


  return JSON.parse(
    raw
  );
}


/*
 * Collecte directe.
 *
 * Elle est conservée pour le jour où la FFF
 * réautorise les appels serveur-à-serveur.
 */
async function collectDirect(){

  const clubPayload=
    await directJson(
      `${DOFA}/api/clubs/${
        CLUB_NO
      }/equipes.json?filter=`
    );


  const teams=
    list(
      clubPayload
    );


  const entries=[];


  for(const team of teams){

    const categoryCode=
      String(
        first(
          team.category_code,
          team.categoryCode,
          ''
        )
      );


    const teamNumber=
      String(
        first(
          team.number,
          team.team_number,
          team.teamNumber,
          ''
        )
      );


    const teamFffId=
      String(
        first(
          team.id,
          team.eq_no,
          team.eqNo,
          ''
        )
      );


    for(
      const engagement
      of list(team.engagements)
    ){

      const competition=
        engagement.competition
        ||{};


      const type=
        String(
          competition.type
          ||''
        )
          .toLowerCase();


      if(
        type
        &&type!=='ch'
        &&!type.includes('champ')
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


      const phaseNo=
        number(
          first(
            engagement.phase?.number,
            engagement.phase?.ph_no,
            engagement.phase?.phNo,
            1
          )
        )
        ||1;


      const poolNo=
        number(
          first(
            engagement.poule?.stage_number,
            engagement.poule?.number,
            engagement.poule?.po_no,
            engagement.poule?.poNo,
            1
          )
        )
        ||1;


      const payload=
        await directJson(
          `${DOFA}/api/compets/${
            cpNo
          }/phases/${
            phaseNo
          }/poules/${
            poolNo
          }/classement_journees`
        );


      const meta={
        cpNo,
        phaseNo,
        poolNo,
        categoryCode,
        teamNumber,
        teamFffId,

        competitionName:
          text(
            first(
              competition.name,
              competition.nom,
              competition.label,
              `Compétition ${cpNo}`
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


      const rows=
        normalizeRanking(
          payload,
          meta
        );


      if(
        containsEscalquens(rows)
      ){
        entries.push(
          ...rows
        );
      }
    }
  }


  return entries;
}


/*
 * Une seule session navigateur ZenRows.
 *
 * La page cible est api-dofa.fff.fr elle-même,
 * ce qui permet ensuite au navigateur de faire
 * les autres fetch() sur le même domaine.
 */
async function collectZenRows(){

  if(!zenrowsKey){

    throw new Error(
      'ZENROWS_API_KEY absent'
    );
  }


  const target=
    `${DOFA}/api/clubs/${
      CLUB_NO
    }/equipes.json?filter=`;


  const browserScript=
    `(async()=>{

      const first=(...values)=>
        values.find(
          value=>
            value!==undefined
            &&value!==null
            &&value!==''
        );

      const list=value=>
        Array.isArray(value)
          ?value
          :value?.['hydra:member']
            ||value?.items
            ||value?.data
            ||value?.results
            ||[];

      const number=value=>{
        if(
          value===undefined
          ||value===null
          ||value===''
        )return null;

        const parsed=Number(
          String(value)
            .replace(',','.')
            .replace(/[^0-9.-]/g,'')
        );

        return Number.isFinite(parsed)
          ?parsed
          :null;
      };

      const txt=value=>{
        if(
          value===undefined
          ||value===null
        )return '';

        if(
          typeof value==='string'
          ||typeof value==='number'
        )return String(value).trim();

        if(
          typeof value!=='object'
        )return '';

        return txt(
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

      const rankingNames=payload=>{
        const names=[];
        const visit=(value,depth=0)=>{
          if(!value||depth>8)return;

          if(Array.isArray(value)){
            for(const row of value){
              if(
                row
                &&typeof row==='object'
              ){
                const name=txt(
                  first(
                    row.equipe?.club?.nomAbr,
                    row.equipe?.club?.nom,
                    row.equipe?.nom,
                    row.team?.name,
                    row.club?.nomAbr,
                    row.club?.nom,
                    row.team_name,
                    row.teamName,
                    row.nom,
                    row.name
                  )
                );

                if(name)names.push(name);
              }

              visit(row,depth+1);
            }

            return;
          }

          if(typeof value==='object'){
            Object
              .values(value)
              .forEach(
                child=>
                  visit(
                    child,
                    depth+1
                  )
              );
          }
        };

        visit(payload);

        return names;
      };

      const fetchJson=async path=>{
        const response=await fetch(
          path,
          {
            credentials:'include',
            headers:{
              Accept:
                'application/json, application/ld+json, text/plain, */*'
            }
          }
        );

        const raw=
          await response.text();

        if(!response.ok){
          throw new Error(
            'HTTP '
            +response.status
            +' '
            +path
          );
        }

        return JSON.parse(raw);
      };


      let clubPayload;

      try{
        clubPayload=
          JSON.parse(
            document.body.innerText
          );
      }catch{
        clubPayload=
          await fetchJson(
            '/api/clubs/${CLUB_NO}/equipes.json?filter='
          );
      }


      let teams=
        list(clubPayload);


      const now=
        new Date();

      const season=
        now.getUTCMonth()>=6
          ?now.getUTCFullYear()
          :now.getUTCFullYear()-1;


      const current=
        teams.filter(
          team=>
            number(team.season)===season
        );


      if(current.length){
        teams=current;
      }


      const entries=[];
      const errors=[];


      for(const team of teams){

        const categoryCode=
          String(
            first(
              team.category_code,
              team.categoryCode,
              ''
            )
          );


        const teamNumber=
          String(
            first(
              team.number,
              team.team_number,
              team.teamNumber,
              ''
            )
          );


        const teamFffId=
          String(
            first(
              team.id,
              team.eq_no,
              team.eqNo,
              ''
            )
          );


        for(
          const engagement
          of list(team.engagements)
        ){

          const competition=
            engagement.competition
            ||{};


          const type=
            String(
              competition.type
              ||''
            )
              .toLowerCase();


          if(
            type
            &&type!=='ch'
            &&!type.includes('champ')
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


          const preferredPhase=
            number(
              first(
                engagement.phase?.number,
                engagement.phase?.ph_no,
                engagement.phase?.phNo,
                1
              )
            )
            ||1;


          const preferredPool=
            number(
              first(
                engagement.poule?.stage_number,
                engagement.poule?.number,
                engagement.poule?.po_no,
                engagement.poule?.poNo,
                1
              )
            )
            ||1;


          const competitionName=
            txt(
              first(
                competition.name,
                competition.nom,
                competition.label,
                'Compétition '+cpNo
              )
            );


          const defaultPoolLabel=
            txt(
              first(
                engagement.poule?.name,
                engagement.poule?.nom,
                engagement.poule?.label,
                ''
              )
            );


          const candidates=[];


          candidates.push({
            phaseNo:
              preferredPhase,

            poolNo:
              preferredPool,

            poolLabel:
              defaultPoolLabel
          });


          /*
           * Si l'engagement ne suffit pas,
           * on découvre les autres poules
           * dans la même session navigateur.
           */
          try{

            const poolsPayload=
              await fetchJson(
                '/api/compets/'
                +cpNo
                +'/phases/'
                +preferredPhase
                +'/poules.json?filter='
              );


            for(
              const pool
              of list(poolsPayload)
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
                candidates.some(
                  item=>
                    item.phaseNo===preferredPhase
                    &&item.poolNo===poolNo
                )
              ){
                continue;
              }


              candidates.push({
                phaseNo:
                  preferredPhase,

                poolNo,

                poolLabel:
                  txt(
                    first(
                      pool.name,
                      pool.nom,
                      pool.label,
                      ''
                    )
                  )
              });
            }

          }catch{}


          let found=null;


          for(
            const candidate
            of candidates
          ){

            try{

              const payload=
                await fetchJson(
                  '/api/compets/'
                  +cpNo
                  +'/phases/'
                  +candidate.phaseNo
                  +'/poules/'
                  +candidate.poolNo
                  +'/classement_journees'
                );


              const names=
                rankingNames(payload);


              if(
                names.some(
                  name=>
                    /escalquens/i.test(name)
                )
              ){

                found={
                  meta:{
                    cpNo,
                    phaseNo:
                      candidate.phaseNo,
                    poolNo:
                      candidate.poolNo,
                    categoryCode,
                    teamNumber,
                    teamFffId,
                    competitionName,
                    poolLabel:
                      candidate.poolLabel
                      ||defaultPoolLabel
                  },
                  payload
                };

                break;
              }

            }catch(error){

              errors.push(
                String(
                  error?.message
                  ||error
                )
              );
            }
          }


          if(found){
            entries.push(found);
          }else{
            errors.push(
              competitionName
              +' : classement non trouvé pour '
              +categoryCode
              +' '
              +teamNumber
            );
          }
        }
      }


      const output=
        document.createElement(
          'script'
        );

      output.type=
        'application/json';

      output.id=
        'fce-standings-data';

      output.textContent=
        JSON.stringify({
          entries,
          errors
        });


      document.head
        .replaceChildren();

      document.body
        .replaceChildren(output);

      document.documentElement
        .setAttribute(
          'data-fce-standings-done',
          '1'
        );

    })()`;


  const instructions=[
    {
      wait:
        500
    },

    {
      evaluate:
        browserScript
    },

    {
      wait_for:
        'html[data-fce-standings-done="1"]'
    },

    {
      wait:
        300
    }
  ];


  const url=
    new URL(
      'https://api.zenrows.com/v1/'
    );


  url.searchParams.set(
    'apikey',
    zenrowsKey
  );

  url.searchParams.set(
    'url',
    target
  );

  url.searchParams.set(
    'js_render',
    'true'
  );

  url.searchParams.set(
    'premium_proxy',
    'true'
  );

  url.searchParams.set(
    'proxy_country',
    'fr'
  );

  url.searchParams.set(
    'json_response',
    'true'
  );

  url.searchParams.set(
    'js_instructions',
    JSON.stringify(
      instructions
    )
  );


  const response=
    await fetch(
      url,
      {
        headers:{
          accept:
            'application/json'
        },

        redirect:
          'follow'
      }
    );


  const body=
    await response.text();


  if(!response.ok){

    throw new Error(
      `ZenRows HTTP ${
        response.status
      } — ${
        body
          .replace(
            /\s+/g,
            ' '
          )
          .slice(
            0,
            250
          )
      }`
    );
  }


  const credits=
    response.headers.get(
      'x-request-credits'
    );


  const cost=
    response.headers.get(
      'x-request-cost'
    );


  if(credits){
    console.log(
      `ZenRows classements : ${
        credits
      } crédit(s) consommé(s).`
    );
  }


  if(cost){
    console.log(
      `ZenRows classements : coût indiqué ${
        cost
      }.`
    );
  }


  let envelope;

  try{
    envelope=
      JSON.parse(body);
  }catch{
    envelope={
      html:body
    };
  }


  const html=
    envelope?.html
    ||'';


  const match=
    html.match(
      /<script[^>]+id=["']fce-standings-data["'][^>]*>([\s\S]*?)<\/script>/i
    );


  if(!match){

    throw new Error(
      'ZenRows : données de classement absentes de la page rendue'
    );
  }


  const data=
    JSON.parse(
      match[1]
    );


  for(
    const error
    of data.errors
    ||[]
  ){
    console.log(
      `::warning title=Classement FFF::${
        String(error)
          .replace(
            /\r?\n/g,
            ' '
          )
      }`
    );
  }


  const rows=[];


  for(
    const entry
    of data.entries
    ||[]
  ){

    const normalized=
      normalizeRanking(
        entry.payload,
        entry.meta
      );


    if(
      containsEscalquens(
        normalized
      )
    ){
      rows.push(
        ...normalized
      );
    }
  }


  return rows;
}


async function main(){

  let rows=[];


  try{

    rows=
      await collectDirect();


    console.log(
      `FFF classements : accès direct OK, ${
        rows.length
      } ligne(s).`
    );

  }catch(error){

    console.log(
      `Accès FFF classements direct indisponible, essai via ZenRows : ${
        String(
          error?.message
          ||error
        )
          .replace(
            /\r?\n/g,
            ' '
          )
      }`
    );


    rows=
      await collectZenRows();
  }


  const unique=
    new Map();


  for(
    const row of rows
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


  rows=[
    ...unique.values()
  ];


  if(!rows.length){

    throw new Error(
      'Aucun classement FFF contenant le FC Escalquens n’a été récupéré.'
    );
  }


  console.log(
    `FFF classements : ${
      rows.length
    } ligne(s) prêtes pour import.`
  );


  const response=
    await fetch(
      endpoint,
      {
        method:
          'POST',

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


  console.log(raw);
}


await main();
