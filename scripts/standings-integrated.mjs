export async function browserCollectStandings(_saved, clubNo, seasonStartYear) {
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
   * Découverte dynamique.
   *
   * On inspecte d'abord le DOM déjà rendu, puis on recharge le HTML
   * de la page club dans LA MÊME session navigateur ZenRows.
   *
   * Cela permet de détecter automatiquement de nouveaux engagements
   * au fil de la saison sans modifier ce script.
   */
  const scanDocument=doc=>{
    doc
      .querySelectorAll('a[href]')
      .forEach(
        link=>addTarget(
          link.getAttribute('href')
        )
      );
  };


  const scanHtml=html=>{
    if(!html)return;

    try{
      const doc=
        new DOMParser()
          .parseFromString(
            html,
            'text/html'
          );

      scanDocument(doc);
    }catch{}


    for(
      const match
      of String(html).matchAll(
        /\/competition\/engagement\/[^"'\\s<]+\/phase\/\d+\/\d+\/(?:accueil|classement|resultats-et-calendrier)/g
      )
    ){
      addTarget(match[0]);
    }
  };


  const discovery={
    dom:0,
    fetched:0,
    fallback:0
  };


  /*
   * Angular peut encore terminer le rendu de la page club.
   * On attend au maximum 2,5 secondes, sans faire échouer
   * la collecte si aucun lien n'apparaît.
   */
  for(
    let attempt=0;
    attempt<10
    && !document.querySelector(
      'a[href*="/competition/engagement/"]'
    );
    attempt++
  ){
    await new Promise(
      resolve=>setTimeout(resolve,250)
    );
  }


  scanDocument(document);
  scanHtml(
    document.documentElement.innerHTML
  );

  discovery.dom=
    targets.size;


  /*
   * Le DOM visible par ZenRows n'est pas toujours aussi complet
   * que celui d'un navigateur classique. Le HTML de la page club
   * est donc relu explicitement sans nouveau crédit ZenRows.
   */
  try{

    const response=
      await fetch(
        location.href,
        {
          credentials:'include',
          headers:{
            Accept:
              'text/html,application/xhtml+xml'
          }
        }
      );

    if(response.ok){

      const before=
        targets.size;

      scanHtml(
        await response.text()
      );

      discovery.fetched=
        targets.size-before;
    }

  }catch{}


  /*
   * Filet de sécurité temporaire pour la saison 2026-2027.
   *
   * Ces engagements ont été vérifiés manuellement sur la page FFF.
   * Ils complètent la découverte dynamique mais ne la remplacent pas.
   *
   * À partir de la saison suivante ce fallback n'est plus utilisé.
   */
  if(Number(seasonStartYear)===2026){

    const verified2026=[
      '/competition/engagement/454584-coupe-du-district-u14/phase/1/3/classement',
      '/competition/engagement/455739-u15-territoire-f/phase/1/6/classement',
      '/competition/engagement/454583-coupe-du-district-u15/phase/1/11/classement',
      '/competition/engagement/454576-coupe-du-conseil-departemental-nord/phase/1/1/classement',
      '/competition/engagement/454557-coupe-feminines-u15f-foot-a-8/phase/1/1/classement',
      '/competition/engagement/455737-u18-territoire-f/phase/1/8/classement',
      '/competition/engagement/454541-u15-district-b/phase/1/3/classement',
      '/competition/engagement/454537-u15-territoire/phase/1/2/classement',
      '/competition/engagement/454545-u14-district-a/phase/1/2/classement',
      '/competition/engagement/454552-feminines-u18-a-8-ca-tlse-31/phase/1/1/classement',
      '/competition/engagement/454408-senior-departemental-4-11teamsports/phase/1/3/classement',
      '/competition/engagement/454409-senior-departemental-5-11teamsports/phase/1/5/classement'
    ];


    const before=
      targets.size;

    verified2026
      .forEach(addTarget);

    discovery.fallback=
      targets.size-before;
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


      /*
       * La ligne Escalquens contient un lien du type :
       *
       * /competition/club/.../equipe/2026_101544_U15F_5
       *
       * Cet identifiant est exactement celui enregistré dans
       * team_competitions. Il permet donc de rattacher le
       * classement à la bonne équipe, y compris pour les coupes.
       */
      const clubRow=[
        ...selected.table.querySelectorAll(
          'tbody tr'
        )
      ].find(
        tr=>
          /escalquens/i.test(
            tr.textContent||''
          )
      );


      const clubTeamHref=
        clubRow
          ?.querySelector(
            'a[href*="/equipe/"]'
          )
          ?.getAttribute('href')
        ||'';


      const clubTeamFffId=
        clubTeamHref.match(
          /\/equipe\/([^/?#]+)/
        )?.[1]
        ||'';


      diagnostic.team_fff_id=
        clubTeamFffId;


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
              team_fff_id:
                clubTeamFffId,

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
        body:data
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

      discovery,

      results:diagnostics
    }
  );
}
