export async function browserCollectStandings(saved, clubNo) {
  const first=(...values)=>
    values.find(
      value=>
        value!==undefined
        &&value!==null
        &&value!==''
    );

  const items=value=>
    Array.isArray(value)
      ?value
      :value?.['hydra:member']
        ||value?.items
        ||value?.data
        ||value?.matches
        ||[];

  const number=value=>{
    const match=
      String(value??'')
        .match(/[0-9]+/);

    return match
      ?Number(match[0])
      :null;
  };

  const slug=value=>
    String(value||'competition')
      .normalize('NFD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g,'-')
      .replace(/^-|-$/g,'');

  const targets=
    new Map();


  /*
   * Les 12 réponses "matches" ont déjà été
   * chargées dans cette même session ZenRows.
   *
   * On en déduit compétition / phase / poule
   * ainsi que l'identifiant exact de l'équipe FCE.
   */
  for(
    const result
    of saved.filter(
      item=>
        item.id.startsWith('fce-matches-')
        &&item.status===200
    )
  ){
    try{
      const payload=
        JSON.parse(result.body);

      for(
        const wrapper
        of items(payload)
      ){
        const item=
          wrapper?.donneesFormatees
          ||wrapper
          ||{};

        const competition=
          item.competition?.donneesFormatees
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

        const home=
          item.recevant||{};

        const away=
          item.visiteur||{};

        const clubSide=
          String(
            home.club?.clNo
          )===String(clubNo)
            ?home
            :String(
              away.club?.clNo
            )===String(clubNo)
              ?away
              :null;

        if(!clubSide){
          continue;
        }

        const cpNo=
          number(
            first(
              competition.cpNo,
              competition.cp_no,
              competition.id,
              competition['@id']
            )
          );

        const phNo=
          number(
            first(
              phase.phNo,
              phase.ph_no,
              phase.number,
              phase.id
            )
          )
          ||1;

        const gpNo=
          number(
            first(
              group.gpNo,
              group.poNo,
              group.gp_no,
              group.po_no,
              group.number,
              group.id,
              group['@id']
            )
          );

        if(
          !cpNo
          ||!gpNo
        ){
          continue;
        }

        const competitionName=
          String(
            first(
              competition.nom,
              competition.name,
              competition.label,
              cpNo
            )
          );

        const poolLabel=
          String(
            first(
              group.nom,
              group.name,
              group.label,
              ''
            )
          );

        const teamFffId=
          String(
            first(
              clubSide.equipe?.id,
              clubSide.equipe?.eqId,
              clubSide.equipe?.eqNo,
              ''
            )
          );

        const teamNumber=
          String(
            first(
              clubSide.equipe?.eqCod,
              clubSide.equipe?.number,
              ''
            )
          );

        const categoryCode=
          teamFffId.split('_')[2]
          ||String(
            first(
              clubSide.equipe?.caCod,
              ''
            )
          );

        const url=
          new URL(
            '/competition/engagement/'
            +cpNo
            +'-'
            +slug(competitionName)
            +'/phase/'
            +phNo
            +'/'
            +gpNo
            +'/classement',
            location.origin
          ).href;

        /*
         * Deux équipes du club peuvent théoriquement
         * partager une même poule : garder l'identité
         * FFF dans la clé évite de les fusionner.
         */
        const key=
          url
          +'|'
          +(
            teamFffId
            ||teamNumber
            ||categoryCode
            ||'fce'
          );

        targets.set(
          key,
          {
            url,
            cpNo,
            phNo,
            gpNo,
            competitionName,
            poolLabel,
            teamFffId,
            teamNumber,
            categoryCode
          }
        );
      }

    }catch{}
  }


  const normalizeHeader=value=>
    String(value||'')
      .normalize('NFD')
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        ''
      );


  const asNumber=value=>{
    const match=
      String(value??'')
        .replace(',','.')
        .match(/-?[0-9]+/);

    return match
      ?Number(match[0])
      :0;
  };


  const rows=[];
  const results=[];


  /*
   * Ces fetch() sont exécutés DANS le navigateur
   * de la requête ZenRows déjà facturée.
   */
  for(
    const target
    of targets.values()
  ){
    const diagnostic={
      url:target.url,
      status:0,
      rows:0,
      error:''
    };

    try{
      const response=
        await fetch(
          target.url,
          {
            credentials:'include',

            headers:{
              Accept:
                'text/html,application/xhtml+xml'
            }
          }
        );

      diagnostic.status=
        response.status;

      const html=
        await response.text();

      if(!response.ok){
        throw new Error(
          'HTTP '
          +response.status
        );
      }

      const doc=
        new DOMParser()
          .parseFromString(
            html,
            'text/html'
          );

      /*
       * La FFF rend actuellement deux tableaux :
       * mobile et détaillé.
       *
       * On prend celui contenant le plus de colonnes.
       */
      const candidates=
        [
          ...doc.querySelectorAll(
            'table'
          )
        ]
          .map(
            table=>({
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
            })
          )
          .filter(
            item=>
              item.headers.includes(
                'equipe'
              )
              &&item.headers.includes(
                'pts'
              )
          )
          .sort(
            (a,b)=>
              b.headers.length
              -a.headers.length
          );

      const selected=
        candidates[0];

      if(!selected){
        throw new Error(
          'tableau de classement introuvable'
        );
      }


      const headers=
        selected.headers;

      const teamIndex=
        headers.indexOf(
          'equipe'
        );

      const pointsIndex=
        headers.indexOf(
          'pts'
        );

      const playedIndex=
        headers.indexOf(
          'j'
        );

      const wonIndex=
        headers.indexOf(
          'g'
        );

      const drawnIndex=
        headers.indexOf(
          'n'
        );

      const lostIndex=
        headers.indexOf(
          'p'
        );

      const goalsForIndex=
        headers.indexOf(
          'bp'
        );

      const goalsAgainstIndex=
        headers.indexOf(
          'bc'
        );


      const tableRows=
        [
          ...selected.table
            .querySelectorAll(
              'tbody tr'
            )
        ]
          .map(
            (
              tr,
              index
            )=>{

              const cells=
                [
                  ...tr.querySelectorAll(
                    'td'
                  )
                ].map(
                  td=>
                    (
                      td.textContent
                      ||''
                    )
                      .replace(
                        /\s+/g,
                        ' '
                      )
                      .trim()
                );

              const teamName=
                cells[teamIndex]
                ||'';

              if(!teamName){
                return null;
              }

              const teamKey=
                target.teamFffId
                ||target.teamNumber
                ||target.categoryCode
                ||'fce';


              return {
                source:'fff',

                phase_id:[
                  target.cpNo,
                  target.phNo,
                  target.gpNo,
                  teamKey
                ].join(':'),

                team_fff_id:
                  target.teamFffId,

                category_code:
                  target.categoryCode,

                team_number:
                  target.teamNumber,

                competition_name:
                  target.competitionName,

                pool_label:
                  target.poolLabel
                  ||(
                    'Poule '
                    +target.gpNo
                  ),

                source_url:
                  target.url,

                team_name:
                  teamName,

                /*
                 * Sur le tableau détaillé FFF,
                 * la première cellule contient
                 * bien le rang.
                 */
                position:
                  asNumber(
                    cells[0]
                  )
                  ||index+1,

                played:
                  playedIndex>=0
                    ?asNumber(
                      cells[playedIndex]
                    )
                    :0,

                won:
                  wonIndex>=0
                    ?asNumber(
                      cells[wonIndex]
                    )
                    :0,

                drawn:
                  drawnIndex>=0
                    ?asNumber(
                      cells[drawnIndex]
                    )
                    :0,

                lost:
                  lostIndex>=0
                    ?asNumber(
                      cells[lostIndex]
                    )
                    :0,

                goals_for:
                  goalsForIndex>=0
                    ?asNumber(
                      cells[goalsForIndex]
                    )
                    :0,

                goals_against:
                  goalsAgainstIndex>=0
                    ?asNumber(
                      cells[goalsAgainstIndex]
                    )
                    :0,

                points:
                  pointsIndex>=0
                    ?asNumber(
                      cells[pointsIndex]
                    )
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
       * Les coupes peuvent produire une URL
       * /classement mais sans classement
       * correspondant à Escalquens.
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
          'FC Escalquens absent du tableau';

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


    results.push(
      diagnostic
    );
  }


  const append=
    (
      id,
      data
    )=>{

      const output=
        document.createElement(
          'script'
        );

      output.type=
        'application/json';

      output.id=
        id;

      /*
       * Même enveloppe que les autres payloads
       * du collecteur.
       */
      output.textContent=
        JSON.stringify({
          status:200,
          body:JSON.stringify(
            data
          )
        });

      document.body
        .appendChild(
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
      detected:
        targets.size,

      parsed:
        results.filter(
          item=>
            item.rows>0
        ).length,

      rows:
        rows.length,

      results
    }
  );
}
