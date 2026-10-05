const CLUB_NO='101544',CLUB_CODE='550350',DISTRICT_NO='86';
const first=(...values)=>values.find(value=>value!==undefined&&value!==null&&value!=='');
const text=value=>typeof value==='string'?value:value?.name||value?.nom||value?.label||value?.short_name||value?.libelle||'';
const iso=(date,time='')=>{if(!date)return '';const raw=String(date);if(raw.includes('T'))return raw;const normalized=String(time||'12:00').replace('h',':').padEnd(5,'0');return `${raw}T${/^\d{1,2}:\d{2}$/.test(normalized)?normalized:'12:00'}:00`};
const cleanUrl=value=>{const raw=String(value||''),markdown=raw.match(/^\[[^\]]+\]\((https?:\/\/[^)]+)\)$/);return markdown?markdown[1]:raw};
const numberOrNull=value=>value===undefined||value===null||value===''?null:Number(value);
const addressText=value=>{
  if(Array.isArray(value))return value.filter(Boolean).join(' · ');
  if(typeof value==='string')return value;
  if(!value||typeof value!=='object')return '';
  return first(
    value.formatted,value.libelle,value.label,value.adresseComplete,value.fullAddress,
    [value.adresse1,value.adresse2,value.codePostal||value.cp,value.ville].filter(Boolean).join(' · ')
  )||'';
};
const payloadItems=payload=>Array.isArray(payload)?payload:payload?.['hydra:member']||payload?.items||payload?.data||payload?.matches||[];
export const mergeMatchPayloads=payloads=>{
  const unique=new Map();
  for(const payload of payloads){
    const members=payloadItems(payload),wrappers=members.length?members:(payload?.donneesFormatees||payload?.maNo?[payload]:[]);
    for(const wrapper of wrappers){
    const item=wrapper?.donneesFormatees||wrapper;
    const id=String(item?.maNo||wrapper?.id||wrapper?.['@id']||'');
    if(id){
      unique.set(id,wrapper);
    }
    }
  }
  return {'@context':'/api/contexts/Match','@id':'/api/matches','@type':'hydra:Collection','hydra:totalItems':unique.size,'hydra:member':[...unique.values()]};
};
export const mergeFalPayloads=payloads=>{
  const sites=new Map(),epreuves=new Map(),sitesWithoutDate=new Map();
  for(const payload of payloads){
    for(const item of payload?.epreuves||[])epreuves.set(String(item.epNo||item['@id']),item);
    for(const site of payload?.sites||[])sites.set(`${site.epreuve?.epNo}:${site.phNo}:${site.joNo}:${site.siNo}`,site);
    for(const site of payload?.sitesWithoutDate||[])sitesWithoutDate.set(`${site.epreuve?.epNo}:${site.phNo}:${site.joNo}:${site.siNo}`,site);
  }
  const sample=payloads.find(Boolean)||{};
  return {...sample,epreuves:[...epreuves.values()],sites:[...sites.values()],sitesWithoutDate:[...sitesWithoutDate.values()]};
};
const teamCategory=id=>{
  const code=String(id||'').split('_')[2]||'';
  if(code==='SEM')return 'Seniors';
  if(code==='SEF')return 'Seniors F';
  return code;
};
export function normalizeEpreuves(items){
  const matches=new Map();
  for(const wrapper of items){
    const item=wrapper.donneesFormatees||wrapper;
    const competition=item.competition?.donneesFormatees||item.competition||{};
    const home=item.recevant||{},away=item.visiteur||{};
    const clubSide=(String(home.club?.clNo)===CLUB_NO||String(home.equipe?.id||'').includes(`_${CLUB_NO}_`))?home:(String(away.club?.clNo)===CLUB_NO||String(away.equipe?.id||'').includes(`_${CLUB_NO}_`))?away:null;
    const sourceId=String(item.maNo||wrapper.id||'');
    const played=Boolean(item.joue);
    const statusLabel=String(item.maStatutLib||'').toLowerCase();
    const venueData=first(
      item.terrain,item.installation,item.stade,item.site?.terrain,item.site?.installation,
      item.rencontre?.terrain,item.rencontre?.installation,item.match?.terrain,item.match?.installation,
      item.donnees?.terrain,item.donnees?.installation
    )||{};
    const venue=text(first(venueData,item.lieu,item.site?.nom));
    const venueAddress=addressText(first(venueData.adresse,venueData.address,item.adresse,item.site?.adresse));
    const participants=[
      {name:home.club?.nomAbr||home.club?.nom||'',club_number:home.club?.clNo||'',team_number:home.equipe?.eqCod||home.equipe?.eqNo||home.equipe?.id||'',logo_url:cleanUrl(home.club?.logo),is_club:String(home.club?.clNo)===CLUB_NO},
      {name:away.club?.nomAbr||away.club?.nom||'',club_number:away.club?.clNo||'',team_number:away.equipe?.eqCod||away.equipe?.eqNo||away.equipe?.id||'',logo_url:cleanUrl(away.club?.logo),is_club:String(away.club?.clNo)===CLUB_NO}
    ];
    const row={
      source:'fff',source_id:sourceId,
      team_fff_id:clubSide?.equipe?.id||'',
      official_team:{
        name:clubSide?.club?.nomAbr||clubSide?.club?.nom||'',
        team_number:String(clubSide?.equipe?.eqCod||''),
        category_code:teamCategory(clubSide?.equipe?.id),
        competition_name:competition.nom||'',
        division:competition.lcLib||competition.niveau||'',
        pool:item.groupe?.nom||''
      },
      category:teamCategory(clubSide?.equipe?.id)||competition.lcLib||'',
      competition:[competition.nom,item.groupe?.nom].filter(Boolean).join(' · '),
      starts_at:item.date,venue,venue_address:venueAddress,
      latitude:numberOrNull(first(venueData.latitude,venueData.lat,item.latitude)),
      longitude:numberOrNull(first(venueData.longitude,venueData.lng,venueData.lon,item.longitude)),
      home_team:home.club?.nomAbr||home.club?.nom||'',
      away_team:away.club?.nomAbr||away.club?.nom||'',
      home_score:played?home.buts:null,away_score:played?away.buts:null,
      status:played?'finished':statusLabel.includes('report')?'postponed':statusLabel.includes('annul')?'cancelled':'scheduled',
      event_type:'match',
      source_url:`https://epreuves.fff.fr/competition/club/${CLUB_CODE}-escalquens-fc/club`,
      external_updated_at:wrapper.cachedAt||null,
      home_logo_url:cleanUrl(home.club?.logo),away_logo_url:cleanUrl(away.club?.logo),
      time_confirmed:item.heureCommuniquee!==false,
      participants,
      raw_json:wrapper
    };
    if(!row.source_id||!row.starts_at||!row.home_team||!row.away_team||!clubSide)throw new Error(`Match FFF inexploitable : ${sourceId||'sans identifiant'}`);
    matches.set(row.source_id,row);
  }
  return [...matches.values()];
}
const falTeamName=team=>typeof team==='string'?team:text(first(
  team?.eqNom,team?.nom,team?.name,team?.label,team?.club?.clNom,
  team?.club?.nom,team?.club?.name
));
const falTeamLogo=team=>cleanUrl(first(team?.logo,team?.logoUrl,team?.club?.logo,team?.club?.logoUrl));
const falClubTeam=(team,name)=>String(first(team?.club?.clNo,team?.clNo,team?.club_number))===CLUB_NO||/escalquens/i.test(String(name||''));
const falScore=(game,team,side)=>{
  const home=side==='home';
  const value=first(
    team?.buts,team?.score,team?.nbButs,
    home?game.home_score:game.away_score,
    home?game.homeScore:game.awayScore,
    home?game.scoreEquipe1:game.scoreEquipe2,
    home?game.score1:game.score2,
    home?game.butsEquipe1:game.butsEquipe2,
    home?game.butsRecevant:game.butsVisiteur,
    home?game.scoreRecevant:game.scoreVisiteur
  );
  const number=numberOrNull(value);
  return Number.isFinite(number)?number:null;
};
const falPair=game=>[
  [game?.recevant,game?.visiteur],
  [game?.equipe1,game?.equipe2],
  [game?.equipeA,game?.equipeB],
  [game?.home,game?.away],
  [game?.domicile,game?.exterieur],
  [game?.homeTeam,game?.awayTeam]
].find(([home,away])=>falTeamName(home)&&falTeamName(away));
export function normalizeFalGames(detail){
  const found=new Map();
  const visit=(value,depth=0)=>{
    if(!value||depth>8)return;
    if(Array.isArray(value)){for(const item of value)visit(item,depth+1);return}
    if(typeof value!=='object')return;
    const pair=falPair(value);
    if(pair){
      const [home,away]=pair,homeTeam=falTeamName(home),awayTeam=falTeamName(away);
      // Le programme FFF contient aussi les rencontres entre les autres clubs.
      // Le site du FCE ne conserve que celles où Escalquens participe.
      if(!falClubTeam(home,homeTeam)&&!falClubTeam(away,awayTeam))return;
      const homeScore=falScore(value,home,'home'),awayScore=falScore(value,away,'away');
      const officialId=first(value.maNo,value.matchId,value.match_id,value.mrNo,value.id,value['@id']);
      const key=String(officialId||`${homeTeam}|${awayTeam}|${home.eqCod??home.eqNo??''}|${away.eqCod??away.eqNo??''}|${first(value.ordre,value.numero,value.heure,value.time,'')}`);
      if(found.has(key)&&JSON.stringify(found.get(key).raw_json)!==JSON.stringify(value))throw new Error(`Identité de mini-match ambiguë : ${key}`);
      if(!found.has(key))found.set(key,{
        source_game_id:key,home_team:homeTeam,away_team:awayTeam,
        home_score:homeScore,away_score:awayScore,
        status:homeScore!==null&&awayScore!==null?'finished':value.isCancelled||value.annule?'cancelled':'scheduled',
        home_logo_url:falTeamLogo(home),away_logo_url:falTeamLogo(away),raw_json:value
      });
      return;
    }
    for(const child of Object.values(value))visit(child,depth+1);
  };
  for(const entry of detail?.api_payloads||[])visit(entry?.body);
  return [...found.values()];
}
export function normalizeEpreuvesFal(payload,falGamePayloads=[]){
  const rows=new Map();
  const gameDetails=new Map(falGamePayloads.map(entry=>[String(entry?.payload?.site_key||''),entry?.payload||{}]));
  for(const site of [...(payload?.sites||[]),...(payload?.sitesWithoutDate||[])]){
    const epreuve=site.epreuve||{};
    const clubTeam=(site.equipes||[]).find(team=>String(team.club?.clNo)===CLUB_NO);
    if(!clubTeam)continue;
    if(!(site.date||site.joDate))throw new Error(`Plateau sans date : ${site.epreuve?.epNo}/${site.siNo}`);
    const falTeamId=clubTeam.id||clubTeam.eqId||`FAL:${epreuve.epNo}:${epreuve.caCod||clubTeam.caCod||'categorie'}:${clubTeam.eqCod||1}`;
    // siNo évite d'écraser deux plateaux de la même journée organisés sur
    // des sites différents (cas fréquent lorsqu'un groupe engage U9-1/2/3).
    const segments=[epreuve.epNo,site.phNo,site.joNo,site.siNo];
    if(segments.some(value=>value===undefined||value===null||value===''))throw new Error('Identifiant de plateau incomplet');
    const sourceId=segments.join(':');
    const sourceUrl=`https://epreuves.fff.fr/animation-loisir/cdg/${DISTRICT_NO}/club/${CLUB_NO}/epreuve/${epreuve.epNo}/poule/${site.poNo}/journee/${site.joNo}/site/${site.siNo}/matchs`;
    const gameDetailKey=[epreuve.epNo,site.joNo,site.siNo].join(':');
    const plateauGames=gameDetails.has(gameDetailKey)?normalizeFalGames(gameDetails.get(gameDetailKey)):[];
    const organizer=site.organisateur?.clNom||'';
    const participants=(site.equipes||[]).map(team=>({
      name:team.eqNom||team.club?.clNom||team.club?.nom||'Équipe',
      club_number:team.club?.clNo||'',team_number:team.eqCod||team.eqNo||team.id||'',
      logo_url:cleanUrl(team.logo||team.club?.logo),
      is_club:String(team.club?.clNo)===CLUB_NO
    }));
    const opponents=participants.filter(team=>!team.is_club).map(team=>team.name);
    const terrain=site.terrain?.nom||'';
    const venueAddress=addressText(site.terrain?.adresse);
    const competition=[epreuve.epNom,site.phLib,site.seLib,site.poLib].filter(Boolean).join(' · ');
    const organizerIsClub=String(site.organisateur?.clNo)===CLUB_NO;
    const awayLabel=organizerIsClub
      ?`Plateau · ${opponents.length?opponents.join(', '):'participants à confirmer'}`
      :`Plateau à ${organizer||'confirmer'}`;
    const row={
      source:'district_fal',source_id:sourceId,
      team_fff_id:falTeamId,
      official_team:{
        name:clubTeam.eqNom||clubTeam.club?.clNom||clubTeam.club?.nom||'',
        team_number:String(clubTeam.eqCod||''),
        category_code:epreuve.caCod||clubTeam.caCod||'',
        competition_name:epreuve.epNom||'',
        division:site.phLib||'',
        pool:site.poLib||site.seLib||''
      },
      category:epreuve.caCod||clubTeam.caCod||'',competition,
      starts_at:site.date||site.joDate,venue:terrain||organizer,venue_address:venueAddress,
      latitude:numberOrNull(first(site.terrain?.latitude,site.terrain?.lat,site.latitude)),
      longitude:numberOrNull(first(site.terrain?.longitude,site.terrain?.lng,site.terrain?.lon,site.longitude)),
      home_team:'FC Escalquens',away_team:awayLabel,
      status:site.isCancelled?'cancelled':'scheduled',event_type:'plateau',
      source_url:sourceUrl,
      external_updated_at:null,
      home_logo_url:cleanUrl(payload?.logo),
      away_logo_url:organizerIsClub?'':cleanUrl(site.organisateur?.logo),
      time_confirmed:site.heureCommuniquee!==false,
      participants,
      // Toujours transmettre le tableau, même vide, afin qu'une collecte
      // puisse supprimer d'anciens mini-matchs qui ne concernent pas le FCE.
      plateau_games:
        gameDetails.has(gameDetailKey)
          ?plateauGames
          :undefined,
      raw_json:site
    };
    if(sourceId)rows.set(sourceId,row);
  }
  return [...rows.values()];
}

export function enrichMatchPayloads(primary,details){
  const candidates=new Map(details.map(wrapper=>[String(wrapper?.donneesFormatees?.maNo||wrapper?.maNo||wrapper?.id||''),wrapper?.donneesFormatees||wrapper]));
  return {...primary,'hydra:member':primary['hydra:member'].map(wrapper=>{
    const item=wrapper.donneesFormatees||wrapper;
    const detail=candidates.get(String(item.maNo||wrapper.id||''));
    if(!detail)return wrapper;
    const enriched={...item};
    for(const field of ['terrain','installation','stade','lieu','adresse','latitude','longitude'])if(detail[field]!==undefined&&detail[field]!==null&&detail[field]!=='')enriched[field]=detail[field];
    return wrapper.donneesFormatees?{...wrapper,donneesFormatees:enriched}:enriched;
  })};
}
