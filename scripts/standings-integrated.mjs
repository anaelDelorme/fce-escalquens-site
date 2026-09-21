export async function browserCollectStandings(_saved, clubNo) {
  const targets=new Map();

  const addTarget=raw=>{
    try{
      const url=new URL(raw,location.origin);

      const match=url.pathname.match(
        /\/competition\/engagement\/([^/]+)\/phase\/(\d+)\/(\d+)(?:\/[^?#]*)?/
      );

      if(!match)return;

      const [,engagement,phase,pool]=match;

      const cpNo=Number(
        engagement.match(/^\d+/)?.[0]||0
      );

      if(!cpNo)return;

      const competitionSlug=
        engagement.replace(/^\d+-?/,'');

      const classementUrl=
        `${location.origin}/competition/engagement/`+
        `${engagement}/phase/${phase}/${pool}/classement`;

      targets.set(
        `${engagement}:${phase}:${pool}`,
        {
          url:classementUrl,
          engagement,
          cpNo,
          phase:Number(phase),
          pool:Number(pool),
          competitionSlug
        }
      );

    }catch{}
  };


  /*
   * Source fiable vérifiée dans le navigateur :
   * les engagements sont présents dans le DOM
   * de la page club FFF.
   */
  document
    .querySelectorAll('a[href]')
    .forEach(
      link=>addTarget(
        link.getAttribute('href')
      )
    );


  for(
    const match
    of document.documentElement.innerHTML.matchAll(
      /\/competition\/engagement\/[^"'\\s<]+\/phase\/\d+\/\d+\/(?:accueil|classement|resultats-et-calendrier)/g
    )
  ){
    addTarget(match[0]);
  }


  const normalizeHeader=value=>
    String(value||'')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g,'');


  const asNumber=value=>{
    const found=
      String(value??'')
        .replace(',','.')
        .match(/-?\d+/);

    return found
      ?Number(found[0])
      :0;
  };


  const titleFromSlug=slug=>
    String(slug||'')
      .replace(/-/g,' ')
      .replace(/\s+/g,' ')
      .trim()
      .toUpperCase();


  const rows=[];
  const diagnostics=[];


  for(const target of targets.values()){

    const diagnostic={
      url:target.url,
      status:0,
      rows:0,
      error:''
    };


    try{

      const response=await fetch(
        target.url,
        {
          credentials:'include',
          headers:{
            Accept:'text/html,application/xhtml+xml'
          }
        }
      );


      diagnostic.status=response.status;

      const html=await response.text();

      if(!response.ok){
        throw new Error(
          `HTTP ${response.status}`
        );
      }


      const doc=
        new DOMParser()
          .parseFromString(
            html,
            'text/html'
          );


      /*
       * La FFF fournit actuellement :
       * - un tableau mobile
       * - un tableau détaillé
       *
       * On garde celui avec le plus de colonnes.
       */
      const candidates=[
        ...doc.querySelectorAll('table')
      ]
        .map(table=>({
          table,

          headers:[
            ...table.querySelectorAll(
              'thead th'
            )
          ].map(
            th=>
              normalizeHeader(
                th.textContent
              )
          )
        }))
        .filter(
          candidate=>
            candidate.headers.includes('equipe')
            &&candidate.headers.includes('pts')
        )
        .sort(
          (a,b)=>
            b.headers.length-a.headers.length
        );


      const selected=candidates[0];

      if(!selected){
        diagnostic.error=
          'Pas de tableau de classement';

        diagnostics.push(diagnostic);
        continue;
      }


      const headers=selected.headers;


      const teamIndex=
        headers.indexOf('equipe');

      const pointsIndex=
        headers.indexOf('pts');

      const playedIndex=
        headers.indexOf('j');

      const wonIndex=
        headers.indexOf('g');

      const drawnIndex=
        headers.indexOf('n');

      const lostIndex=
        headers.indexOf('p');

      const goalsForIndex=
        headers.indexOf('bp');

      const goalsAgainstIndex=
        headers.indexOf('bc');


      /*
       * Exemple vérifié :
       * POULE F
       */
      let poolLabel=
        (
          doc.querySelector(
            'select option[selected]'
          )
          ||doc.querySelector(
            'select option:checked'
          )
        )
          ?.textContent
          ?.replace(/\s+/g,' ')
          ?.trim()
        ||'';


      if(!poolLabel){

        const possible=[
          ...doc.querySelectorAll(
            'h1,h2,h3,h4,label,strong'
          )
        ]
          .map(
            node=>
              (
                node.textContent
                ||''
              )
                .replace(/\s+/g,' ')
                .trim()
          )
          .find(
            value=>
              /^poule\b/i.test(value)
          );

        poolLabel=
          possible||`Poule ${target.pool}`;
      }


      /*
       * Le slug officiel de l'URL correspond
       * au nom de compétition.
       */
      const competitionName=
        titleFromSlug(
          target.competitionSlug
        );


      const tableRows=[
        ...selected.table.querySelectorAll(
          'tbody tr'
        )
      ]
        .map(
          (tr,index)=>{

            const cells=[
              ...tr.querySelectorAll('td')
            ].map(
              td=>
                (
                  td.textContent
                  ||''
                )
                  .replace(/\s+/g,' ')
                  .trim()
            );


            const teamName=
              cells[teamIndex]
              ||'';


            if(!teamName){
              return null;
            }


            return {
              source:'fff',

              phase_id:
                `${target.engagement}:`+
                `${target.phase}:`+
                `${target.pool}`,

              /*
               * Le rattachement à notre équipe
               * sera fait côté Worker via
               * compétition + poule.
               */
              team_fff_id:'',
              category_code:'',
              team_number:'',

              competition_name:
                competitionName,

              pool_label:
                poolLabel,

              source_url:
                target.url,

              team_name:
                teamName,

              position:
                asNumber(cells[0])
                ||index+1,

              played:
                playedIndex>=0
                  ?asNumber(cells[playedIndex])
                  :0,

              won:
                wonIndex>=0
                  ?asNumber(cells[wonIndex])
                  :0,

              drawn:
                drawnIndex>=0
                  ?asNumber(cells[drawnIndex])
                  :0,

              lost:
                lostIndex>=0
                  ?asNumber(cells[lostIndex])
                  :0,

              goals_for:
                goalsForIndex>=0
                  ?asNumber(cells[goalsForIndex])
                  :0,

              goals_against:
                goalsAgainstIndex>=0
                  ?asNumber(cells[goalsAgainstIndex])
                  :0,

              points:
                pointsIndex>=0
                  ?asNumber(cells[pointsIndex])
                  :0,

              raw_json:{
                headers,
                cells
              }
            };
          }
        )
        .filter(Boolean);


      /*
       * Les pages de coupe peuvent avoir
       * une URL /classement sans classement
       * utile pour Escalquens.
       */
      if(
        !tableRows.some(
          row=>
            /escalquens/i.test(
              row.team_name
            )
        )
      ){
        diagnostic.error=
          'FC Escalquens absent';

      }else{

        diagnostic.rows=
          tableRows.length;

        rows.push(
          ...tableRows
        );
      }


    }catch(error){

      diagnostic.error=
        String(
          error?.message
          ||error
        );
    }


    diagnostics.push(
      diagnostic
    );
  }


  const append=(id,data)=>{

    const output=
      document.createElement('script');

    output.type=
      'application/json';

    output.id=id;

    output.textContent=
      JSON.stringify({
        status:200,
        body:JSON.stringify(data)
      });

    document.body.appendChild(
      output
    );
  };


  append(
    'fce-standings',
    rows
  );


  append(
    'fce-standings-meta',
    {
      detected:targets.size,

      parsed:
        diagnostics.filter(
          item=>item.rows>0
        ).length,

      rows:
        rows.length,

      results:diagnostics
    }
  );
}
