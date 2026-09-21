const CLUB_NO='101544',CLUB_CODE='550350';

const siteUrl=process.env.FCE_SITE_URL?.replace(/\/$/,'');
const token=process.env.FCE_SYNC_TOKEN;
const zenrowsKey=process.env.ZENROWS_API_KEY;

if(!siteUrl||!token||!zenrowsKey){
  throw new Error(
    'FCE_SITE_URL, FCE_SYNC_TOKEN ou ZENROWS_API_KEY manquant'
  );
}

const endpoint=`${siteUrl}/internal/sync/standings`;

const clubPage=
  `https://epreuves.fff.fr/competition/club/${CLUB_CODE}-f-c-escalquens/club`;

const first=(...v)=>
  v.find(x=>x!==undefined&&x!==null&&x!=='');

const num=v=>{
  if(v===undefined||v===null||v==='')return null;

  const n=Number(
    String(v)
      .replace(',','.')
      .replace(/[^0-9.-]/g,'')
  );

  return Number.isFinite(n)
    ?n
    :null;
};

const txt=v=>
  typeof v==='string'||typeof v==='number'
    ?String(v).trim()
    :v&&typeof v==='object'
      ?txt(
        first(
          v.nomAbr,
          v.short_name,
          v.name,
          v.nom,
          v.label,
          v.libelle,
          v.eqNom
        )
      )
      :'';

const teamName=r=>
  txt(
    first(
      r?.equipe?.club?.nomAbr,
      r?.equipe?.club?.nom,
      r?.equipe?.eqNom,
      r?.equipe?.nom,
      r?.team?.name,
      r?.club?.nomAbr,
      r?.club?.nom,
      r?.team_name,
      r?.teamName,
      r?.eqNom,
      r?.nom,
      r?.name
    )
  );


function rankingArray(payload){

  let best=[];
  let bestScore=-1;

  const seen=new Set();

  const visit=(value,depth=0)=>{

    if(
      !value
      ||depth>10
      ||typeof value!=='object'
      ||seen.has(value)
    ){
      return;
    }

    seen.add(value);

    if(Array.isArray(value)){

      const rows=value.filter(
        row=>
          row
          &&typeof row==='object'
          &&!Array.isArray(row)
          &&teamName(row)
      );

      if(rows.length>=2){

        const score=
          rows.length*10
          +rows.slice(0,5).reduce(
            (total,row)=>{

              const raw=
                JSON.stringify(row);

              return total
                +(/point|pts/i.test(raw)?4:0)
                +(/position|rang|class|clt/i.test(raw)?4:0);

            },
            0
          );

        if(score>bestScore){
          bestScore=score;
          best=rows;
        }
      }

      value.forEach(
        row=>
          visit(row,depth+1)
      );

      return;
    }

    Object.values(value).forEach(
      child=>
        visit(child,depth+1)
    );
  };

  visit(payload);

  return best;
}


function identity(row){

  for(
    const item
    of [
      row?.equipe,
      row?.team,
      row
    ]
  ){

    if(
      !item
      ||typeof item!=='object'
    ){
      continue;
    }

    const id=String(
      first(
        item.id,
        item.eqId,
        item.eq_id,
        item.eqNo,
        item.eq_no,
        item.equipeId,
        item.teamId,
        ''
      )
      ||''
    );

    const parts=
      id.split('_');

    const teamNumber=String(
      first(
        item.eqCod,
        item.team_number,
        item.teamNumber,
        item.numero,
        item.number,
        item.no,
        parts[3],
        ''
      )
      ||''
    );

    const category=String(
      first(
        item.caCod,
        item.category_code,
        item.categoryCode,
        parts[2],
        ''
      )
      ||''
    );

    if(
      id
      ||teamNumber
      ||category
    ){
      return {
        id,
        teamNumber,
        category
      };
    }
  }

  return {
    id:'',
    teamNumber:'',
    category:''
  };
}


function normalize(page){

  const ranking=
    rankingArray(page);

  if(!ranking.length){
    return [];
  }

  const fce=
    ranking.find(
      row=>
        /escalquens/i.test(
          teamName(row)
        )
    );

  if(!fce){
    return [];
  }

  const match=
    new URL(page.url)
      .pathname
      .match(
        /\/competition\/engagement\/([^/]+)\/phase\/(\d+)\/(\d+)\/classement/
      );

  if(!match){
    return [];
  }

  const [
    ,
    engagement,
    phase,
    pool
  ]=match;

  const fceIdentity=
    identity(fce);

  const teamKey=
    fceIdentity.id
    ||fceIdentity.teamNumber
    ||fceIdentity.category
    ||'fce';

  const competitionName=
    (page.headings||[])
      .find(
        value=>
          /régional|regional|département|departement|senior|u\d|fémin|championnat/i
            .test(value)
      )
    ||engagement
      .replace(/^\d+-/,'')
      .replace(/-/g,' ');

  const poolLabel=
    (page.headings||[])
      .find(
        value=>
          /poule/i.test(value)
      )
    ||`Poule ${pool}`;


  return ranking
    .map(
      (
        row,
        index
      )=>{

        const won=
          num(
            first(
              row.won,
              row.gagnes,
              row.gagne,
              row.victoires,
              row.ga,
              row.g
            )
          );

        const drawn=
          num(
            first(
              row.drawn,
              row.nuls,
              row.nul,
              row.nu,
              row.n
            )
          );

        const lost=
          num(
            first(
              row.lost,
              row.perdus,
              row.perdu,
              row.defaites,
              row.pe
            )
          );

        let played=
          num(
            first(
              row.played,
              row.joues,
              row.joue,
              row.jo,
              row.matches,
              row.matchs,
              row.nb_matchs,
              row.nbMatchs,
              row.mj
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

          source:'fff',

          phase_id:
            `${engagement}:${phase}:${pool}:${teamKey}`,

          team_fff_id:
            fceIdentity.id,

          category_code:
            fceIdentity.category,

          team_number:
            fceIdentity.teamNumber,

          competition_name:
            competitionName,

          pool_label:
            poolLabel,

          source_url:
            page.url,

          team_name:
            teamName(row),

          position:
            num(
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
            num(
              first(
                row.goals_for,
                row.goalsFor,
                row.bp,
                row.buts_pour
              )
            )
            ??0,

          goals_against:
            num(
              first(
                row.goals_against,
                row.goalsAgainst,
                row.bc,
                row.buts_contre
              )
            )
            ??0,

          points:
            num(
              first(
                row.points,
                row.pts,
                row.point,
                row.nbPoints,
                row.nb_points
              )
            )
            ??0,

          raw_json:
            row
        };
      }
    )
    .filter(
      row=>
        row.team_name
    );
}


function embedded(
  html,
  prefix
){

  const result=[];

  const pattern=
    new RegExp(
      `<script[^>]+id=["'](${prefix}[^"']*)["'][^>]*>([\\s\\S]*?)<\\/script>`,
      'gi'
    );

  for(
    const match
    of String(html||'').matchAll(pattern)
  ){

    try{

      result.push({
        id:match[1],
        data:JSON.parse(match[2])
      });

    }catch{}
  }

  return result;
}


async function collect(){

  const now=
    new Date();

  const seasonYear=
    now.getUTCMonth()>=6
      ?now.getUTCFullYear()
      :now.getUTCFullYear()-1;


  /*
   * Même fenêtre annuelle que sync-matches.
   *
   * Ces URLs sont appelées DANS le navigateur ZenRows
   * déjà ouvert : aucun crédit ZenRows supplémentaire.
   */
  const matchUrls=
    Array.from(
      {
        length:12
      },
      (
        _,
        offset
      )=>{

        const start=
          new Date(
            Date.UTC(
              seasonYear,
              6+offset,
              1
            )
          );

        const end=
          new Date(
            Date.UTC(
              seasonYear,
              7+offset,
              0,
              23,
              59,
              59
            )
          );

        const query=
          new URLSearchParams({
            dateDebut:
              start
                .toISOString()
                .replace(
                  '.000Z',
                  '+00:00'
                ),

            dateFin:
              end
                .toISOString()
                .replace(
                  '.000Z',
                  '+00:00'
                ),

            clNo:
              CLUB_NO,

            itemsPerPage:
              '100',

            pagination:
              'true'
          });

        return (
          'https://epreuves.fff.fr'
          +'/api/data/matches?'
          +query
        );
      }
    );


  const browserScript=
    `(async()=>{

      const matchUrls=
        ${JSON.stringify(matchUrls)};

      const urls=
        new Map();


      const addUrl=
        raw=>{

          try{

            const url=
              new URL(
                raw,
                location.href
              );

            const match=
              url.pathname.match(
                /\\/competition\\/engagement\\/([^/]+)\\/phase\\/(\\d+)\\/(\\d+)(?:\\/[^?#]*)?/
              );

            if(!match){
              return;
            }

            const key=
              [
                match[1],
                match[2],
                match[3]
              ].join(':');

            urls.set(
              key,
              new URL(
                '/competition/engagement/'
                +match[1]
                +'/phase/'
                +match[2]
                +'/'
                +match[3]
                +'/classement',
                location.origin
              ).href
            );

          }catch{}
        };


      /*
       * 1. Liens déjà présents sur la page club.
       */
      document
        .querySelectorAll(
          'a[href]'
        )
        .forEach(
          link=>
            addUrl(
              link.getAttribute('href')
            )
        );


      for(
        const match
        of document
          .documentElement
          .innerHTML
          .matchAll(
            /\\/competition\\/engagement\\/[^"'\\s<]+\\/phase\\/\\d+\\/\\d+\\/(?:accueil|classement|resultats-et-calendrier)/g
          )
      ){
        addUrl(
          match[0]
        );
      }


      /*
       * 2. État Angular de la page.
       */
      let state=[];

      try{

        state=
          JSON.parse(
            document
              .querySelector('#ng-state')
              ?.textContent
            ||'[]'
          );

      }catch{}


      const scan=
        value=>{

          if(
            typeof value==='string'
          ){

            if(
              value.includes(
                '/competition/engagement/'
              )
            ){
              addUrl(value);
            }

            return;
          }

          if(
            Array.isArray(value)
          ){

            value.forEach(scan);
            return;
          }

          if(
            value
            &&typeof value==='object'
          ){

            Object
              .values(value)
              .forEach(scan);
          }
        };


      scan(state);


      /*
       * 3. Même jeton X-Competition que le collecteur
       *    de matchs qui fonctionne déjà.
       */
      try{

        const roots=
          Array.isArray(state)
            ?state
            :[state];

        const entries=
          roots.flatMap(
            item=>
              Object.entries(
                item||{}
              )
          );


        const securityToken=
          entries
            .find(
              ([key])=>
                key==='VLJAXE'
            )
            ?.[1]
          ||entries
            .find(
              (
                [
                  key,
                  value
                ]
              )=>
                key.includes(
                  '/api/app-security-token/'
                )
                &&value?.body?.token
            )
            ?.[1]
            ?.body
            ?.token;


        const number=
          value=>{

            const match=
              String(
                value??''
              ).match(
                /\\d+/
              );

            return match
              ?Number(match[0])
              :null;
          };


        const slug=
          value=>
            String(
              value||'competition'
            )
              .normalize('NFD')
              .replace(
                /[\\u0300-\\u036f]/g,
                ''
              )
              .toLowerCase()
              .replace(
                /[^a-z0-9]+/g,
                '-'
              )
              .replace(
                /^-|-$/g,
                ''
              );


        if(securityToken){

          const payloads=
            await Promise.all(
              matchUrls.map(
                async source=>{

                  try{

                    const response=
                      await fetch(
                        source,
                        {
                          credentials:
                            'include',

                          headers:{
                            Accept:
                              'application/json, text/plain, */*',

                            'X-Competition':
                              String(
                                securityToken
                              )
                          }
                        }
                      );


                    return response.ok
                      ?await response.json()
                      :null;

                  }catch{

                    return null;
                  }
                }
              )
            );


          for(
            const payload
            of payloads.filter(Boolean)
          ){

            const matches=
              payload['hydra:member']
              ||payload.items
              ||payload.data
              ||[];


            for(
              const wrapper
              of matches
            ){

              const item=
                wrapper?.donneesFormatees
                ||wrapper
                ||{};

              const competition=
                item.competition
                  ?.donneesFormatees
                ||item.competition
                ||{};

              const group=
                item.groupe
                ||item.poule
                ||{};

              const phase=
                item.phase
                ||group.phase
                ||{};


              const competitionNumber=
                number(
                  competition.cpNo
                  ||competition.cp_no
                  ||competition.id
                  ||competition['@id']
                );


              const phaseNumber=
                number(
                  phase.phNo
                  ||phase.ph_no
                  ||phase.number
                  ||phase.id
                )
                ||1;


              const poolNumber=
                number(
                  group.gpNo
                  ||group.poNo
                  ||group.gp_no
                  ||group.po_no
                  ||group.number
                  ||group.id
                  ||group['@id']
                );


              if(
                competitionNumber
                &&poolNumber
              ){

                addUrl(
                  '/competition/engagement/'
                  +competitionNumber
                  +'-'
                  +slug(
                    competition.nom
                    ||competition.name
                    ||competition.label
                    ||competitionNumber
                  )
                  +'/phase/'
                  +phaseNumber
                  +'/'
                  +poolNumber
                  +'/classement'
                );
              }
            }
          }
        }

      }catch{}


      /*
       * 4. Charge chaque page OFFICIELLE de classement
       *    sur le même domaine epreuves.fff.fr.
       */
      const results=[];

      let index=0;


      for(
        const url
        of urls.values()
      ){

        const result={
          url,
          status:0,
          headings:[],
          entries:[],
          error:''
        };


        try{

          const response=
            await fetch(
              url,
              {
                credentials:
                  'include',

                headers:{
                  Accept:
                    'text/html,application/xhtml+xml'
                }
              }
            );


          result.status=
            response.status;


          const html=
            await response.text();


          const documentPage=
            new DOMParser()
              .parseFromString(
                html,
                'text/html'
              );


          result.headings=
            [
              ...documentPage
                .querySelectorAll(
                  'h1,h2,h3'
                )
            ]
              .map(
                node=>
                  (
                    node.textContent
                    ||''
                  )
                    .replace(
                      /\\s+/g,
                      ' '
                    )
                    .trim()
              )
              .filter(Boolean)
              .slice(
                0,
                12
              );


          const stateText=
            documentPage
              .querySelector(
                '#ng-state'
              )
              ?.textContent
            ||'';


          if(stateText){

            const pageState=
              JSON.parse(
                stateText
              );


            const pageEntries=
              (
                Array.isArray(
                  pageState
                )
                  ?pageState
                  :[pageState]
              )
                .flatMap(
                  item=>
                    Object.entries(
                      item||{}
                    )
                );


            result.entries=
              pageEntries
                .filter(
                  (
                    [
                      name,
                      value
                    ]
                  )=>
                    value?.body
                    &&(
                      value.status===undefined
                      ||value.status===200
                    )
                    &&(
                      name
                        .toLowerCase()
                        .includes('class')
                      ||/"(?:points|pts|classement|rang|position)"\\s*:/
                          .test(
                            JSON.stringify(
                              value.body
                            )
                          )
                    )
                )
                .map(
                  (
                    [
                      name,
                      value
                    ]
                  )=>({
                    name,
                    body:value.body
                  })
                );
          }


          if(
            !result.entries.length
          ){
            result.error=
              'ng-state sans classement';
          }

        }catch(error){

          result.error=
            String(error);
        }


        results.push(
          result
        );


        const output=
          document.createElement(
            'script'
          );

        output.type=
          'application/json';

        output.id=
          'fce-standings-'
          +index++;

        output.textContent=
          JSON.stringify(
            result
          );

        document.body
          .appendChild(
            output
          );
      }


      /*
       * Toujours produire un diagnostic.
       */
      const meta=
        document.createElement(
          'script'
        );

      meta.type=
        'application/json';

      meta.id=
        'fce-standings-meta';

      meta.textContent=
        JSON.stringify({
          discovered:
            urls.size,

          urls:
            [...urls.values()],

          results:
            results.map(
              item=>({
                url:item.url,
                status:item.status,
                entries:
                  item.entries.length,
                error:item.error
              })
            )
        });


      document.body
        .appendChild(meta);


      const keep=
        [
          ...document
            .querySelectorAll(
              'script[id^="fce-standings-"]'
            )
        ];


      document.head
        .replaceChildren();


      document.body
        .replaceChildren(
          ...keep
        );


      document
        .documentElement
        .setAttribute(
          'data-fce-standings-done',
          '1'
        );

    })()`;


  const instructions=[
    {
      wait_for:
        'app-match app-matches-wrapper'
    },
    {
      wait:500
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
      wait:300
    }
  ];


  const zenrowsUrl=
    new URL(
      'https://api.zenrows.com/v1/'
    );


  zenrowsUrl.searchParams.set(
    'apikey',
    zenrowsKey
  );

  zenrowsUrl.searchParams.set(
    'url',
    clubPage
  );

  zenrowsUrl.searchParams.set(
    'js_render',
    'true'
  );

  zenrowsUrl.searchParams.set(
    'premium_proxy',
    'true'
  );

  zenrowsUrl.searchParams.set(
    'proxy_country',
    'fr'
  );

  zenrowsUrl.searchParams.set(
    'json_response',
    'true'
  );

  zenrowsUrl.searchParams.set(
    'js_instructions',
    JSON.stringify(
      instructions
    )
  );


  const response=
    await fetch(
      zenrowsUrl,
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
            220
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
      } crédit(s).`
    );
  }


  if(cost){

    console.log(
      `ZenRows classements : coût ${
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


  const meta=
    embedded(
      html,
      'fce-standings-meta'
    )[0]
      ?.data
    ||{};


  console.log(
    `FFF classements : ${
      meta.discovered||0
    } page(s) officielle(s) détectée(s).`
  );


  for(
    const page
    of meta.results||[]
  ){

    console.log(
      `Page classement : HTTP ${
        page.status||0
      }, ${
        page.entries||0
      } payload(s) — ${
        page.url
      }${
        page.error
          ?` — ${page.error}`
          :''
      }`
    );
  }


  const pages=
    embedded(
      html,
      'fce-standings-'
    )
      .filter(
        item=>
          item.id!==
          'fce-standings-meta'
      )
      .map(
        item=>
          item.data
      );


  if(!pages.length){

    throw new Error(
      `Aucune page de classement capturée. URLs détectées : ${
        JSON.stringify(
          meta.urls||[]
        )
      }`
    );
  }


  return pages;
}


const pages=
  await collect();


const all=[];


for(
  const page
  of pages
){

  const rows=
    normalize(page);


  if(rows.length){

    console.log(
      `Classement OK : ${
        rows.length
      } équipes — ${
        page.url
      }`
    );

    all.push(
      ...rows
    );

  }else{

    console.log(
      `::warning title=Classement ignoré::${
        page.url
      }`
    );
  }
}


const unique=
  new Map();


for(
  const row
  of all
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
    'Aucun classement FFF contenant Escalquens normalisé.'
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
  `FFF classements : ${
    rows.length
  } ligne(s) envoyée(s).`
);

console.log(raw);
