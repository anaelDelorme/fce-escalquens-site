(() => {
  const form=document.querySelector('#result-form');
  const dateInput=document.querySelector('#result-weekend-date');
  const defaultBackground=document.querySelector('#result-default-background');
  const status=document.querySelector('#result-status');
  const editor=document.querySelector('#result-editor');
  const previews=document.querySelector('#result-previews');
  const logoFolder=document.querySelector('#social-logo-folder');
  const uploadLogosButton=document.querySelector('#social-upload-logos');
  const backgroundName=document.querySelector('#social-background-name');
  const backgroundFile=document.querySelector('#social-background-file');
  const uploadBackgroundButton=document.querySelector('#social-upload-background');
  const library=document.querySelector('#visual-library');
  const libraryStatus=document.querySelector('#social-library-status');
  const libraryAssets=document.querySelector('#social-library-assets');

  if(!form||!dateInput||!defaultBackground||!status||!editor||!previews)return;

  const PARIS='Europe/Paris';
  const CLUB=/(?:f\.?\s*c\.?\s*)?escalquens/i;
  const EDO='"Edo SZ",Impact,"Arial Narrow",Arial,sans-serif';
  const TEXT='Arial,sans-serif';
  const FCE_ASSET={id:'fce',name:'FC Escalquens',url:'/logo-fce.png',kind:'team_logo'};
  const BUILTIN_BACKGROUND={id:'',name:'Fond FCE intégré',url:'/fond-insta-fce-v2.png',kind:'background'};

  let publicAssets=[];
  let adminAssets=[];
  let state=null;
  let matchDataPromise=null;

  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const compact=value=>normalize(value).split(' ').filter(Boolean).filter(token=>!['fc','fce','football','club','us','as','entente','de','du','des','la','le','les'].includes(token)).filter(token=>!/^\d+$/.test(token)).join(' ');

  function dateKey(value){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:PARIS,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
    const map=Object.fromEntries(parts.map(part=>[part.type,part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }

  function addDays(key,days){
    const [year,month,day]=key.split('-').map(Number);
    const date=new Date(Date.UTC(year,month-1,day+days,12));
    return [date.getUTCFullYear(),String(date.getUTCMonth()+1).padStart(2,'0'),String(date.getUTCDate()).padStart(2,'0')].join('-');
  }

  function nextSaturday(){
    const todayKey=dateKey(new Date());
    const [year,month,day]=todayKey.split('-').map(Number);
    const date=new Date(Date.UTC(year,month-1,day,12));
    const delta=(6-date.getUTCDay()+7)%7;
    date.setUTCDate(date.getUTCDate()+delta);
    return [date.getUTCFullYear(),String(date.getUTCMonth()+1).padStart(2,'0'),String(date.getUTCDate()).padStart(2,'0')].join('-');
  }

  function assetUrl(asset){
    if(!asset)return '';
    if(asset.url)return asset.url;
    const key=String(asset.object_key||'').trim();
    if(!key)return '';
    if(/^https?:\/\//i.test(key))return key;
    if(key.startsWith('/media/'))return key;
    if(key.startsWith('media/'))return `/${key}`;
    return `/media/${key.replace(/^\/+/, '')}`;
  }

  const logoAssets=()=>publicAssets.filter(asset=>asset.kind==='team_logo'&&asset.object_key);
  const backgroundAssets=()=>publicAssets.filter(asset=>asset.kind==='background'&&asset.object_key);
  const variants=asset=>[asset.name,...String(asset.aliases||'').split(/[\n;,|]+/)].map(compact).filter(Boolean);

  function tokenScore(left,right){
    if(!left||!right)return 0;
    if(left===right)return 1;
    if(left.includes(right)||right.includes(left))return .9;
    const a=new Set(left.split(' '));
    const b=new Set(right.split(' '));
    const common=[...a].filter(token=>b.has(token)).length;
    const union=new Set([...a,...b]).size||1;
    return common/union;
  }

  function automaticLogo(teamName){
    if(CLUB.test(teamName||''))return FCE_ASSET;
    const target=compact(teamName);
    let best=null;
    let bestScore=0;
    for(const asset of logoAssets()){
      for(const alias of variants(asset)){
        const score=tokenScore(target,alias);
        if(score>bestScore){best=asset;bestScore=score;}
      }
    }
    return bestScore>=.62?best:null;
  }

  function chosenLogo(teamName){
    const override=state?.logoOverrides?.get(teamName)||'auto';
    if(override==='none')return null;
    if(override==='fce')return FCE_ASSET;
    if(override!=='auto')return logoAssets().find(asset=>String(asset.id)===String(override))||null;
    return automaticLogo(teamName);
  }

  function backgroundFor(item){
    const requested=String(item?.backgroundId||state?.defaultBackground||'');
    if(!requested)return BUILTIN_BACKGROUND;
    return backgroundAssets().find(asset=>String(asset.id)===requested)||BUILTIN_BACKGROUND;
  }

  function backgroundOptions(value=''){
    return `<option value="" ${!value?'selected':''}>Fond FCE intégré</option>`+
      backgroundAssets().map(asset=>`<option value="${asset.id}" ${String(asset.id)===String(value)?'selected':''}>${esc(asset.name)}</option>`).join('');
  }

  function fillDefaultBackground(){
    const selected=state?.defaultBackground||defaultBackground.value||'';
    defaultBackground.innerHTML=backgroundOptions(selected);
    defaultBackground.value=selected;
  }

  async function fetchPublicAssets(){
    const response=await fetch(`/api/page/social-assets?v=1&t=${Date.now()}`,{headers:{accept:'application/json'}});
    if(!response.ok)throw new Error(`Bibliothèque logos/fonds indisponible (${response.status}).`);
    const data=await response.json();
    publicAssets=Array.isArray(data.assets)?data.assets:[];
    fillDefaultBackground();
    return publicAssets;
  }

  async function fetchAdminAssets(){
    const response=await fetch('/admin-api/social_visual_assets',{headers:{'x-requested-with':'XMLHttpRequest'}});
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(data?.error||`Administration des visuels indisponible (${response.status}).`);
    adminAssets=Array.isArray(data)?data:[];
    publicAssets=adminAssets.filter(asset=>Number(asset.active)!==0);
    fillDefaultBackground();
    renderLibraryAssets();
    if(state)renderEditor();
    return adminAssets;
  }

  async function fetchMatchData(){
    if(!matchDataPromise){
      matchDataPromise=fetch('/api/page/matches?v=20',{headers:{accept:'application/json'}}).then(async response=>{
        if(!response.ok)throw new Error(`Les rencontres ne répondent pas (${response.status}).`);
        return response.json();
      });
    }
    return matchDataPromise;
  }

  async function fetchPlateauGames(id){
    const response=await fetch(`/api/plateau-games?plateau_id=${encodeURIComponent(id)}&v=1`,{headers:{accept:'application/json'}});
    if(!response.ok)return [];
    const data=await response.json();
    return Array.isArray(data.games)?data.games:[];
  }

  function participantsMap(data){
    const map=new Map();
    for(const row of data.participants||[]){
      const key=String(row.match_id);
      if(!map.has(key))map.set(key,[]);
      map.get(key).push(row);
    }
    return map;
  }

  const isPlateau=match=>['plateau','animation'].includes(String(match.event_type||'').toLowerCase());
  const isClubMatch=(match,participants)=>CLUB.test(`${match.home_team||''} ${match.away_team||''}`)||(participants.get(String(match.id))||[]).some(row=>CLUB.test(row.team_name||row.name||''));

  function categoryLabel(match,entries){
    const entry=entries.get(String(match.competition_team_id||''));
    const category=String(entry?.category_code||match.category||entry?.name||'ÉQUIPE').trim().toUpperCase();
    const teamNumber=Number(entry?.team_number||0);
    if(/SENIOR/i.test(category))return teamNumber?`SÉNIOR ${teamNumber}`:'SÉNIOR';
    return teamNumber>1?`${category} ${teamNumber}`:category;
  }

  function resultLabel(item){
    if(item.type!=='match')return 'RÉSULTATS DU PLATEAU';
    const homeClub=CLUB.test(item.home_team);
    const awayClub=CLUB.test(item.away_team);
    if(homeClub===awayClub)return 'RÉSULTAT';
    const clubScore=homeClub?item.home_score:item.away_score;
    const opponentScore=homeClub?item.away_score:item.home_score;
    if(clubScore>opponentScore)return 'VICTOIRE';
    if(clubScore<opponentScore)return 'DÉFAITE';
    return 'MATCH NUL';
  }

  async function prepareWeekend(key){
    const data=await fetchMatchData();
    await fetchPublicAssets();
    const participants=participantsMap(data);
    const entries=new Map((data.entries||[]).map(entry=>[String(entry.id),entry]));
    const weekendKeys=new Set([key,addDays(key,1)]);
    const weekend=(data.matches||[]).filter(match=>match.starts_at&&weekendKeys.has(dateKey(match.starts_at))&&isClubMatch(match,participants)).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
    const items=[];

    for(const match of weekend.filter(row=>!isPlateau(row))){
      if(match.home_score==null||match.away_score==null)continue;
      items.push({type:'match',id:String(match.id),category:categoryLabel(match,entries),competition:String(match.competition||''),starts_at:match.starts_at,home_team:String(match.home_team||''),away_team:String(match.away_team||''),home_score:Number(match.home_score),away_score:Number(match.away_score),included:true,backgroundId:''});
    }

    const plateauRows=weekend.filter(isPlateau);
    const plateauDetails=await Promise.all(plateauRows.map(async match=>{
      const allGames=(await fetchPlateauGames(match.id)).filter(game=>game.home_score!=null&&game.away_score!=null);
      const clubGames=allGames.filter(game=>CLUB.test(`${game.home_team||''} ${game.away_team||''}`));
      return {match,games:clubGames.length?clubGames:allGames};
    }));

    for(const {match,games} of plateauDetails){
      if(!games.length)continue;
      items.push({type:'plateau',id:String(match.id),category:categoryLabel(match,entries),competition:String(match.competition||'Plateau'),starts_at:match.starts_at,games:games.map(game=>({home_team:String(game.home_team||''),away_team:String(game.away_team||''),home_score:Number(game.home_score),away_score:Number(game.away_score)})),included:true,backgroundId:''});
    }

    items.sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)||String(a.category).localeCompare(String(b.category),'fr',{numeric:true,sensitivity:'base'}));
    const teams=new Set();
    for(const item of items){
      if(item.type==='match'){teams.add(item.home_team);teams.add(item.away_team);}
      else item.games.forEach(game=>{teams.add(game.home_team);teams.add(game.away_team);});
    }

    state={weekend:key,items,logoOverrides:new Map([...teams].filter(Boolean).map(name=>[name,'auto'])),defaultBackground:defaultBackground.value||''};
    renderEditor();
  }

  function logoOptions(teamName){
    const current=state?.logoOverrides?.get(teamName)||'auto';
    const rows=[['auto','Automatique'],['fce','Logo FC Escalquens'],['none','Sans logo'],...logoAssets().map(asset=>[String(asset.id),asset.name])];
    return rows.map(([value,label])=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(label)}</option>`).join('');
  }

  function collectTeamNames(){
    const teams=new Set();
    for(const item of state?.items||[]){
      if(item.type==='match'){teams.add(item.home_team);teams.add(item.away_team);}
      else item.games.forEach(game=>{teams.add(game.home_team);teams.add(game.away_team);});
    }
    return [...teams].filter(Boolean).sort((a,b)=>a.localeCompare(b,'fr',{numeric:true,sensitivity:'base'}));
  }

  function renderEditor(){
    if(!state?.items?.length){editor.innerHTML='';return;}
    const teams=collectTeamNames();
    editor.innerHTML=`<section class="result-editor">
      <div class="result-editor__toolbar"><p><strong>${state.items.length}</strong> résultat${state.items.length>1?'s':''} détecté${state.items.length>1?'s':''} sur le week-end.</p><button type="button" data-result-generate>Générer les PNG</button></div>
      <section class="result-logo-map"><h3>Logos des équipes</h3><p>Le rapprochement est automatique à partir du nom et des alias de la bibliothèque R2. Vous pouvez forcer un autre logo uniquement pour cette génération.</p><div class="result-logo-map__grid">${teams.map(name=>`<label><span>${esc(name)}</span><select data-logo-team="${esc(name)}">${logoOptions(name)}</select></label>`).join('')}</div></section>
      <div class="result-list">${state.items.map((item,index)=>item.type==='match'
        ?`<article class="result-card" data-result-index="${index}" data-included="${item.included}"><div class="result-card__head"><div><small>${esc(item.category)} · ${esc(resultLabel(item))}</small><h3>${esc(item.home_team)} — ${esc(item.away_team)}</h3></div><label class="result-card__include"><input type="checkbox" data-item-included="${index}" ${item.included?'checked':''}> Inclure</label></div><div class="result-card__match"><label>Équipe domicile<input data-item-field="home_team" data-item-index="${index}" value="${esc(item.home_team)}"></label><label>Score<div class="result-card__score"><input type="number" data-item-field="home_score" data-item-index="${index}" value="${item.home_score}"><input type="number" data-item-field="away_score" data-item-index="${index}" value="${item.away_score}"></div></label><label>Équipe extérieure<input data-item-field="away_team" data-item-index="${index}" value="${esc(item.away_team)}"></label></div><label class="result-card__background">Fond<select data-item-background="${index}">${backgroundOptions(item.backgroundId)}</select></label></article>`
        :`<article class="result-card" data-result-index="${index}" data-included="${item.included}"><div class="result-card__head"><div><small>Plateau · ${esc(item.category)}</small><h3>${item.games.length} résultat${item.games.length>1?'s':''}</h3></div><label class="result-card__include"><input type="checkbox" data-item-included="${index}" ${item.included?'checked':''}> Inclure</label></div><div class="result-plateau-games">${item.games.map((game,g)=>`<div class="result-plateau-game"><input data-game-field="home_team" data-game-item="${index}" data-game-index="${g}" value="${esc(game.home_team)}"><input type="number" data-game-field="home_score" data-game-item="${index}" data-game-index="${g}" value="${game.home_score}"><input type="number" data-game-field="away_score" data-game-item="${index}" data-game-index="${g}" value="${game.away_score}"><input data-game-field="away_team" data-game-item="${index}" data-game-index="${g}" value="${esc(game.away_team)}"></div>`).join('')}</div><label class="result-card__background">Fond<select data-item-background="${index}">${backgroundOptions(item.backgroundId)}</select></label></article>`).join('')}</div>
    </section>`;
  }

  function loadImage(url){return new Promise(resolve=>{if(!url){resolve(null);return;}const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src=url;});}
  function drawCover(ctx,image,x,y,w,h){const scale=Math.max(w/image.naturalWidth,h/image.naturalHeight);const drawW=image.naturalWidth*scale,drawH=image.naturalHeight*scale;ctx.drawImage(image,x+(w-drawW)/2,y+(h-drawH)/2,drawW,drawH);}
  function drawContain(ctx,image,x,y,w,h){const scale=Math.min(w/image.naturalWidth,h/image.naturalHeight);const drawW=image.naturalWidth*scale,drawH=image.naturalHeight*scale;ctx.drawImage(image,x+(w-drawW)/2,y+(h-drawH)/2,drawW,drawH);}
  function initials(value){const words=String(value||'').trim().split(/\s+/).filter(Boolean);return words.length?words.slice(0,2).map(word=>word[0]?.toUpperCase()||'').join(''):'?';}

  async function drawTeamLogo(ctx,teamName,x,y,size){
    const asset=chosenLogo(teamName);const image=await loadImage(assetUrl(asset));
    if(image){drawContain(ctx,image,x,y,size,size);return;}
    ctx.save();ctx.fillStyle='rgba(255,255,255,.94)';ctx.beginPath();ctx.arc(x+size/2,y+size/2,size*.43,0,Math.PI*2);ctx.fill();ctx.fillStyle='#8b1047';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${Math.round(size*.22)}px ${TEXT}`;ctx.fillText(initials(teamName),x+size/2,y+size/2);ctx.restore();
  }

  async function paintBackground(ctx,item){
    const image=await loadImage(assetUrl(backgroundFor(item)));
    const gradient=ctx.createLinearGradient(0,0,1080,1350);gradient.addColorStop(0,'#160d10');gradient.addColorStop(.58,'#090708');gradient.addColorStop(1,'#5d0c25');ctx.fillStyle=gradient;ctx.fillRect(0,0,1080,1350);
    if(image){ctx.save();ctx.globalAlpha=.7;drawCover(ctx,image,0,0,1080,1350);ctx.restore();ctx.fillStyle='rgba(10,5,8,.47)';ctx.fillRect(0,0,1080,1350);}
    ctx.save();ctx.fillStyle='rgba(139,16,71,.72)';ctx.transform(1,0,-.26,1,0,0);ctx.fillRect(790,-50,190,1500);ctx.restore();
    ctx.save();ctx.fillStyle='rgba(255,208,0,.11)';ctx.beginPath();ctx.arc(90,1160,260,0,Math.PI*2);ctx.fill();ctx.restore();
  }

  async function ensureFont(){try{await document.fonts?.load?.('80px "Edo SZ"');}catch(_){}}
  function fitText(ctx,text,maxWidth,start,min,family=TEXT,weight=900){let size=start;while(size>=min){ctx.font=`${weight} ${size}px ${family}`;if(ctx.measureText(text).width<=maxWidth)return size;size-=2;}return min;}
  const displayDate=value=>new Intl.DateTimeFormat('fr-FR',{timeZone:PARIS,weekday:'long',day:'numeric',month:'long'}).format(new Date(value)).toUpperCase();

  async function drawMatchResult(canvas,item){
    canvas.width=1080;canvas.height=1350;const ctx=canvas.getContext('2d');await Promise.all([ensureFont(),paintBackground(ctx,item)]);
    ctx.textAlign='center';ctx.fillStyle='#ffd000';ctx.font=`400 92px ${EDO}`;ctx.fillText('RÉSULTATS',540,145);
    ctx.fillStyle='#fff';ctx.font=`400 47px ${EDO}`;ctx.fillText(item.category||'ÉQUIPE',540,220);
    ctx.fillStyle='#f2e8eb';ctx.font=`900 20px ${TEXT}`;ctx.fillText(displayDate(item.starts_at),540,262);
    await Promise.all([drawTeamLogo(ctx,item.home_team,105,335,255),drawTeamLogo(ctx,item.away_team,720,335,255)]);
    ctx.fillStyle='#fff';fitText(ctx,item.home_team.toUpperCase(),390,41,23,EDO,400);ctx.fillText(item.home_team.toUpperCase(),235,645);fitText(ctx,item.away_team.toUpperCase(),390,41,23,EDO,400);ctx.fillText(item.away_team.toUpperCase(),845,645);
    ctx.fillStyle='#ffd000';ctx.font=`400 156px ${EDO}`;ctx.fillText(`${item.home_score} - ${item.away_score}`,540,870);
    ctx.fillStyle='#fff';ctx.font=`400 44px ${EDO}`;ctx.fillText(resultLabel(item),540,965);
    if(item.competition){fitText(ctx,item.competition.toUpperCase(),800,23,15,TEXT,900);ctx.fillStyle='#eadde1';ctx.fillText(item.competition.toUpperCase(),540,1020);}
    const crest=await loadImage('/logo-fce.png');if(crest)drawContain(ctx,crest,455,1080,170,160);
    ctx.fillStyle='#ffd000';ctx.font=`900 22px ${TEXT}`;ctx.fillText('@FCEscalquens',540,1300);
  }

  function roundedRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

  async function drawPlateauResult(canvas,item,games,page,pageCount){
    canvas.width=1080;canvas.height=1350;const ctx=canvas.getContext('2d');await Promise.all([ensureFont(),paintBackground(ctx,item)]);
    ctx.textAlign='center';ctx.fillStyle='#ffd000';ctx.font=`400 82px ${EDO}`;ctx.fillText('RÉSULTATS',540,128);ctx.fillStyle='#fff';ctx.font=`400 46px ${EDO}`;ctx.fillText(item.category||'PLATEAU',540,198);ctx.fillStyle='#eadde1';ctx.font=`900 19px ${TEXT}`;ctx.fillText(displayDate(item.starts_at),540,238);
    let y=300;
    for(const game of games){
      ctx.save();ctx.fillStyle='rgba(255,255,255,.95)';roundedRect(ctx,55,y,970,160,20);ctx.fill();ctx.restore();
      await Promise.all([drawTeamLogo(ctx,game.home_team,75,y+30,98),drawTeamLogo(ctx,game.away_team,907,y+30,98)]);
      ctx.fillStyle='#211719';ctx.textAlign='left';fitText(ctx,game.home_team,300,25,15,TEXT,900);ctx.fillText(game.home_team,190,y+86);ctx.textAlign='right';fitText(ctx,game.away_team,300,25,15,TEXT,900);ctx.fillText(game.away_team,890,y+86);ctx.textAlign='center';ctx.fillStyle='#8b1047';ctx.font=`400 54px ${EDO}`;ctx.fillText(`${game.home_score} - ${game.away_score}`,540,y+96);y+=174;
    }
    if(pageCount>1){ctx.fillStyle='#eadde1';ctx.font=`900 17px ${TEXT}`;ctx.fillText(`${page+1}/${pageCount}`,540,1195);}
    const crest=await loadImage('/logo-fce.png');if(crest)drawContain(ctx,crest,470,1180,140,115);ctx.fillStyle='#ffd000';ctx.font=`900 20px ${TEXT}`;ctx.fillText('@FCEscalquens',540,1310);
  }

  function downloadCanvas(canvas,filename){canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);},'image/png');}

  async function generate(){
    if(!state)return;previews.replaceChildren();status.removeAttribute('data-state');status.textContent='Génération des visuels résultats…';const selected=state.items.filter(item=>item.included!==false);let produced=0;
    for(const [itemIndex,item] of selected.entries()){
      const pageGroups=item.type==='plateau'?Array.from({length:Math.ceil(item.games.length/5)},(_,index)=>item.games.slice(index*5,index*5+5)):[null];
      for(let page=0;page<pageGroups.length;page++){
        const figure=document.createElement('figure');figure.className='visual-preview';const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const caption=document.createElement('figcaption');const label=document.createElement('span');label.textContent=item.type==='plateau'?`${item.category} · plateau${pageGroups.length>1?` · ${page+1}/${pageGroups.length}`:''}`:`${item.category} · ${item.home_team} - ${item.away_team}`;const button=document.createElement('button');button.type='button';button.className='visual-download';button.textContent='Télécharger le PNG';const safeCategory=String(item.category||'resultat').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();const filename=`${state.weekend}-resultat-${safeCategory}-${itemIndex+1}${pageGroups.length>1?`-${page+1}`:''}.png`;button.addEventListener('click',()=>downloadCanvas(canvas,filename));caption.append(label,button);figure.append(canvas,caption);previews.append(figure);if(item.type==='plateau')await drawPlateauResult(canvas,item,pageGroups[page],page,pageGroups.length);else await drawMatchResult(canvas,item);produced++;
      }
    }
    status.textContent=`${produced} visuel${produced>1?'s':''} généré${produced>1?'s':''} en 1080 × 1350 px.`;previews.scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function uploadFile(file){const data=new FormData();data.append('file',file);const response=await fetch('/admin-api/upload',{method:'POST',headers:{'x-requested-with':'XMLHttpRequest'},body:data});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||`Upload impossible (${response.status}).`);return result;}
  async function createAsset(asset){const response=await fetch('/admin-api/social_visual_assets',{method:'POST',headers:{'content-type':'application/json','x-requested-with':'XMLHttpRequest'},body:JSON.stringify(asset)});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||`Enregistrement impossible (${response.status}).`);return result;}
  async function updateAsset(id,asset){const response=await fetch(`/admin-api/social_visual_assets/${encodeURIComponent(id)}`,{method:'PUT',headers:{'content-type':'application/json','x-requested-with':'XMLHttpRequest'},body:JSON.stringify(asset)});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||`Modification impossible (${response.status}).`);return result;}
  async function deleteAsset(id){const response=await fetch(`/admin-api/social_visual_assets/${encodeURIComponent(id)}`,{method:'DELETE',headers:{'x-requested-with':'XMLHttpRequest'}});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||`Suppression impossible (${response.status}).`);return result;}
  const fileLabel=file=>String(file?.name||'Logo').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();

  function renderLibraryAssets(){
    if(!libraryAssets)return;
    if(!adminAssets.length){libraryAssets.innerHTML='<p>Aucun logo ou fond enregistré.</p>';return;}
    libraryAssets.innerHTML=adminAssets.map(asset=>`<article class="visual-library-asset" data-asset-id="${asset.id}"><div class="visual-library-asset__preview"><img src="${esc(assetUrl(asset))}" alt=""></div><label>Type<select data-asset-kind><option value="team_logo" ${asset.kind==='team_logo'?'selected':''}>Logo</option><option value="background" ${asset.kind==='background'?'selected':''}>Fond</option></select></label><label>Nom<input data-asset-name value="${esc(asset.name)}"></label><label>Alias<textarea data-asset-aliases placeholder="Un alias par ligne ou séparé par ;">${esc(asset.aliases||'')}</textarea></label><label class="visual-library-asset__active"><input type="checkbox" data-asset-active ${Number(asset.active)!==0?'checked':''}> Actif</label><div class="visual-library-asset__actions"><button type="button" data-save>Enregistrer</button><button type="button" data-delete>Supprimer</button></div></article>`).join('');
  }

  uploadLogosButton?.addEventListener('click',async()=>{
    const files=[...(logoFolder?.files||[])].filter(file=>String(file.type||'').startsWith('image/'));
    if(!files.length){libraryStatus.textContent='Sélectionnez un dossier contenant au moins une image.';libraryStatus.dataset.state='error';return;}
    uploadLogosButton.disabled=true;libraryStatus.removeAttribute('data-state');
    try{let done=0;for(const file of files){libraryStatus.textContent=`Import des logos : ${done+1}/${files.length}…`;const uploaded=await uploadFile(file);await createAsset({kind:'team_logo',name:fileLabel(file),aliases:'',object_key:uploaded.key,display_order:0,active:1});done++;}await fetchAdminAssets();logoFolder.value='';libraryStatus.textContent=`${done} logo${done>1?'s':''} importé${done>1?'s':''} dans R2.`;}catch(error){libraryStatus.dataset.state='error';libraryStatus.textContent=error.message||'Import impossible.';}finally{uploadLogosButton.disabled=false;}
  });

  uploadBackgroundButton?.addEventListener('click',async()=>{
    const file=backgroundFile?.files?.[0];if(!file){libraryStatus.textContent='Choisissez une image de fond.';libraryStatus.dataset.state='error';return;}
    uploadBackgroundButton.disabled=true;libraryStatus.removeAttribute('data-state');
    try{const uploaded=await uploadFile(file);const name=String(backgroundName?.value||'').trim()||fileLabel(file);await createAsset({kind:'background',name,aliases:'',object_key:uploaded.key,display_order:0,active:1});await fetchAdminAssets();backgroundFile.value='';backgroundName.value='';libraryStatus.textContent=`Fond « ${name} » ajouté dans R2.`;}catch(error){libraryStatus.dataset.state='error';libraryStatus.textContent=error.message||'Ajout impossible.';}finally{uploadBackgroundButton.disabled=false;}
  });

  library?.addEventListener('toggle',()=>{if(library.open&&!adminAssets.length){fetchAdminAssets().catch(error=>{libraryStatus.dataset.state='error';libraryStatus.textContent=error.message||'Bibliothèque administrateur inaccessible.';});}});

  libraryAssets?.addEventListener('click',async event=>{
    const card=event.target.closest('[data-asset-id]');if(!card)return;const id=card.dataset.assetId;
    if(event.target.closest('[data-save]')){const button=event.target.closest('[data-save]');button.disabled=true;libraryStatus.removeAttribute('data-state');try{const existing=adminAssets.find(asset=>String(asset.id)===String(id));await updateAsset(id,{kind:card.querySelector('[data-asset-kind]').value,name:card.querySelector('[data-asset-name]').value.trim(),aliases:card.querySelector('[data-asset-aliases]').value.trim(),object_key:existing?.object_key||'',display_order:Number(existing?.display_order||0),active:card.querySelector('[data-asset-active]').checked?1:0});await fetchAdminAssets();libraryStatus.textContent='Bibliothèque mise à jour.';}catch(error){libraryStatus.dataset.state='error';libraryStatus.textContent=error.message||'Modification impossible.';}finally{button.disabled=false;}return;}
    if(event.target.closest('[data-delete]')){if(!confirm('Supprimer cette référence de la bibliothèque ? Le fichier R2 n’est pas effacé.'))return;const button=event.target.closest('[data-delete]');button.disabled=true;try{await deleteAsset(id);await fetchAdminAssets();libraryStatus.textContent='Référence supprimée.';}catch(error){libraryStatus.dataset.state='error';libraryStatus.textContent=error.message||'Suppression impossible.';}}
  });

  defaultBackground.addEventListener('change',()=>{if(state)state.defaultBackground=defaultBackground.value||'';});
  editor.addEventListener('change',event=>{
    if(!state)return;const logo=event.target.closest('[data-logo-team]');if(logo){state.logoOverrides.set(logo.dataset.logoTeam,logo.value);return;}const included=event.target.closest('[data-item-included]');if(included){const index=Number(included.dataset.itemIncluded);state.items[index].included=included.checked;included.closest('.result-card').dataset.included=String(included.checked);return;}const background=event.target.closest('[data-item-background]');if(background)state.items[Number(background.dataset.itemBackground)].backgroundId=background.value||'';
  });
  editor.addEventListener('input',event=>{
    if(!state)return;const input=event.target.closest('[data-item-field]');if(input){const item=state.items[Number(input.dataset.itemIndex)];const field=input.dataset.itemField;item[field]=input.type==='number'?Number(input.value):input.value;return;}const gameInput=event.target.closest('[data-game-field]');if(gameInput){const item=state.items[Number(gameInput.dataset.gameItem)];const game=item.games[Number(gameInput.dataset.gameIndex)];const field=gameInput.dataset.gameField;game[field]=gameInput.type==='number'?Number(gameInput.value):gameInput.value;}
  });
  editor.addEventListener('click',event=>{if(event.target.closest('[data-result-generate]'))generate();});

  form.addEventListener('submit',async event=>{
    event.preventDefault();const key=dateInput.value;if(!key)return;const button=form.querySelector('button[type="submit"]');button.disabled=true;previews.replaceChildren();editor.replaceChildren();status.removeAttribute('data-state');status.textContent='Récupération des résultats du week-end…';
    try{await prepareWeekend(key);if(!state.items.length)throw new Error('Aucun résultat de match ou de plateau n’est disponible pour ce week-end.');status.textContent=`${state.items.length} résultat${state.items.length>1?'s':''} chargé${state.items.length>1?'s':''}. Vérifiez scores, logos et fonds puis générez les PNG.`;editor.scrollIntoView({behavior:'smooth',block:'start'});}catch(error){state=null;status.dataset.state='error';status.textContent=error.message||'Impossible de préparer les résultats.';}finally{button.disabled=false;}
  });

  dateInput.value=nextSaturday();
  fetchPublicAssets().catch(error=>{if(libraryStatus)libraryStatus.textContent=error.message||'';});
})();
