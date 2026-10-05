(() => {
  const form=document.querySelector('#result-form');
  const dateInput=document.querySelector('#result-weekend-date');
  const defaultBackground=document.querySelector('#result-default-background');
  const status=document.querySelector('#result-status');
  const editor=document.querySelector('#result-editor');
  const previews=document.querySelector('#result-previews');
  const library=document.querySelector('#visual-library');
  const libraryStatus=document.querySelector('#social-library-status');
  const libraryAssets=document.querySelector('#social-library-assets');
  const logoFolder=document.querySelector('#social-logo-folder');
  const uploadLogosButton=document.querySelector('#social-upload-logos');
  const backgroundName=document.querySelector('#social-background-name');
  const backgroundFile=document.querySelector('#social-background-file');
  const uploadBackgroundButton=document.querySelector('#social-upload-background');

  if(!form||!dateInput||!defaultBackground||!status||!editor||!previews)return;

  const PARIS='Europe/Paris';
  const CLUB=/(?:f\.?\s*c\.?\s*)?escalquens/i;
  const EDO='"Edo SZ",Impact,"Arial Narrow",Arial,sans-serif';
  const TEXT='Arial,sans-serif';
  const FCE={id:'fce',name:'FC Escalquens',url:'/logo-fce.png',kind:'team_logo'};
  const BUILTIN_BG={id:'',name:'Fond résultats FCE',url:'',kind:'background'};

  let publicAssets=[];
  let adminAssets=[];
  let state=null;
  let matchDataPromise=null;

  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\btlse\b/g,'toulouse').replace(/\bst\b/g,'saint').replace(/[^a-z0-9]+/g,' ').trim();
  const compact=value=>normalize(value).split(' ').filter(Boolean).filter(t=>!['fc','fce','football','club','us','as','ent','entente','de','du','des','la','le','les'].includes(t)).filter(t=>!/^\d+$/.test(t)).join(' ');

  function dateKey(value){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:PARIS,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
    const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }
  function addDays(key,days){
    const [y,m,d]=key.split('-').map(Number);
    const date=new Date(Date.UTC(y,m-1,d+days,12));
    return [date.getUTCFullYear(),String(date.getUTCMonth()+1).padStart(2,'0'),String(date.getUTCDate()).padStart(2,'0')].join('-');
  }
  function nextSaturday(){
    const [y,m,d]=dateKey(new Date()).split('-').map(Number);
    const date=new Date(Date.UTC(y,m-1,d,12));
    date.setUTCDate(date.getUTCDate()+((6-date.getUTCDay()+7)%7));
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
    return `/media/${key.replace(/^\/+/,'')}`;
  }
  const logos=()=>publicAssets.filter(a=>a.kind==='team_logo'&&a.object_key);
  const backgrounds=()=>publicAssets.filter(a=>a.kind==='background'&&a.object_key);

  function tokenScore(a,b){
    if(!a||!b)return 0;
    if(a===b)return 1;
    if(a.includes(b)||b.includes(a))return .92;
    const aa=new Set(a.split(' ')),bb=new Set(b.split(' '));
    const common=[...aa].filter(x=>bb.has(x)).length;
    return common/(new Set([...aa,...bb]).size||1);
  }
  function autoLogo(name){
    if(CLUB.test(name||''))return FCE;
    const target=compact(name);
    let best=null,score=0;
    for(const asset of logos()){
      for(const variant of [asset.name,...String(asset.aliases||'').split(/[\n;,|]+/)].map(compact).filter(Boolean)){
        const s=tokenScore(target,variant);
        if(s>score){score=s;best=asset;}
      }
    }
    return score>=.56?best:null;
  }
  function chosenLogo(name){
    const value=state?.logoOverrides?.get(name)||'auto';
    if(value==='none')return null;
    if(value==='fce')return FCE;
    if(value!=='auto')return logos().find(a=>String(a.id)===String(value))||null;
    return autoLogo(name);
  }
  function chosenBackground(item){
    const id=String(item?.backgroundId||state?.defaultBackground||'');
    return id?(backgrounds().find(a=>String(a.id)===id)||BUILTIN_BG):BUILTIN_BG;
  }
  function backgroundOptions(value=''){
    return `<option value="" ${!value?'selected':''}>Fond résultats FCE</option>`+
      backgrounds().map(a=>`<option value="${a.id}" ${String(a.id)===String(value)?'selected':''}>${esc(a.name)}</option>`).join('');
  }
  function fillBackgroundSelect(){
    const selected=state?.defaultBackground||defaultBackground.value||'';
    defaultBackground.innerHTML=backgroundOptions(selected);
    defaultBackground.value=selected;
  }

  async function fetchPublicAssets(){
    const response=await fetch(`/api/page/social-assets?v=1&t=${Date.now()}`,{headers:{accept:'application/json'}});
    if(!response.ok)throw new Error(`Bibliothèque logos/fonds indisponible (${response.status}).`);
    const data=await response.json();
    publicAssets=Array.isArray(data.assets)?data.assets:[];
    fillBackgroundSelect();
  }
  async function fetchMatchData(){
    if(!matchDataPromise){
      matchDataPromise=fetch('/api/page/matches?v=20',{headers:{accept:'application/json'}}).then(async r=>{
        if(!r.ok)throw new Error(`Les rencontres ne répondent pas (${r.status}).`);
        return r.json();
      });
    }
    return matchDataPromise;
  }
  async function fetchPlateauGames(id){
    const r=await fetch(`/api/plateau-games?plateau_id=${encodeURIComponent(id)}&v=1`,{headers:{accept:'application/json'}});
    if(!r.ok)return [];
    const data=await r.json();
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
  const isPlateau=m=>['plateau','animation'].includes(String(m.event_type||'').toLowerCase());
  const isClubMatch=(m,p)=>CLUB.test(`${m.home_team||''} ${m.away_team||''}`)||(p.get(String(m.id))||[]).some(x=>CLUB.test(x.team_name||x.name||''));

  function categoryLabel(match,entries){
    const e=entries.get(String(match.competition_team_id||''));
    const category=String(e?.category_code||match.category||e?.name||'ÉQUIPE').trim().toUpperCase();
    const n=Number(e?.team_number||0);
    if(/SENIOR/i.test(category))return n?`SÉNIOR ${n}`:'SÉNIOR';
    const numbers=new Set([...entries.values()].filter(x=>String(x.category_code||'').trim().toUpperCase()===category&&Number(x.active??1)!==0).map(x=>Number(x.team_number||0)).filter(Boolean));
    return n&&numbers.size>1?`${category} ${n}`:category;
  }
  function resultLabel(item){
    if(item.type!=='match')return 'RÉSULTATS DU PLATEAU';
    const h=CLUB.test(item.home_team),a=CLUB.test(item.away_team);
    if(h===a)return 'RÉSULTAT';
    const club=h?Number(item.home_score):Number(item.away_score);
    const opp=h?Number(item.away_score):Number(item.home_score);
    return club>opp?'VICTOIRE':club<opp?'DÉFAITE':'MATCH NUL';
  }

  async function prepareWeekend(key){
    const [data]=await Promise.all([fetchMatchData(),fetchPublicAssets()]);
    const participants=participantsMap(data);
    const entries=new Map((data.entries||[]).map(e=>[String(e.id),e]));
    const days=new Set([key,addDays(key,1)]);
    const matches=(data.matches||[]).filter(m=>m.starts_at&&days.has(dateKey(m.starts_at))&&isClubMatch(m,participants)).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
    const items=[];

    for(const m of matches.filter(x=>!isPlateau(x))){
      if(m.home_score==null||m.away_score==null)continue;
      items.push({type:'match',id:String(m.id),category:categoryLabel(m,entries),competition:String(m.competition||''),starts_at:m.starts_at,home_team:String(m.home_team||''),away_team:String(m.away_team||''),home_score:Number(m.home_score),away_score:Number(m.away_score),included:true,backgroundId:''});
    }

    for(const m of matches.filter(isPlateau)){
      const all=(await fetchPlateauGames(m.id)).filter(g=>g.home_score!=null&&g.away_score!=null);
      const club=all.filter(g=>CLUB.test(`${g.home_team||''} ${g.away_team||''}`));
      const games=(club.length?club:all).map(g=>({home_team:String(g.home_team||''),away_team:String(g.away_team||''),home_score:Number(g.home_score),away_score:Number(g.away_score)}));
      if(games.length)items.push({type:'plateau',id:String(m.id),category:categoryLabel(m,entries),competition:String(m.competition||'Plateau'),starts_at:m.starts_at,games,included:true,backgroundId:''});
    }

    const teams=new Set();
    for(const item of items){
      if(item.type==='match'){teams.add(item.home_team);teams.add(item.away_team);}
      else item.games.forEach(g=>{teams.add(g.home_team);teams.add(g.away_team);});
    }
    state={weekend:key,items,logoOverrides:new Map([...teams].filter(Boolean).map(n=>[n,'auto'])),defaultBackground:defaultBackground.value||''};
    renderEditor();
  }

  function logoOptions(name){
    const current=state?.logoOverrides?.get(name)||'auto';
    return [['auto','Automatique'],['fce','Logo FC Escalquens'],['none','Sans logo'],...logos().map(a=>[String(a.id),a.name])]
      .map(([v,l])=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(l)}</option>`).join('');
  }
  function teamNames(){
    const names=new Set();
    for(const item of state?.items||[]){
      if(item.type==='match'){names.add(item.home_team);names.add(item.away_team);}
      else item.games.forEach(g=>{names.add(g.home_team);names.add(g.away_team);});
    }
    return [...names].filter(Boolean).sort((a,b)=>a.localeCompare(b,'fr',{numeric:true,sensitivity:'base'}));
  }

  function renderEditor(){
    if(!state?.items?.length){editor.innerHTML='';return;}
    editor.innerHTML=`<section class="result-editor">
      <div class="result-editor__toolbar"><p><strong>${state.items.length}</strong> résultat${state.items.length>1?'s':''} détecté${state.items.length>1?'s':''}.</p><button type="button" data-generate>Générer les PNG</button></div>
      <section class="result-logo-map"><h3>Logos</h3><p>Matching automatique nom/alias, modifiable pour cette génération.</p><div class="result-logo-map__grid">${teamNames().map(n=>`<label><span>${esc(n)}</span><select data-logo="${esc(n)}">${logoOptions(n)}</select></label>`).join('')}</div></section>
      <div class="result-list">${state.items.map((item,i)=>item.type==='match'
        ?`<article class="result-card" data-i="${i}" data-included="${item.included}"><div class="result-card__head"><div><small>${esc(item.category)} · ${esc(resultLabel(item))}</small><h3>${esc(item.home_team)} — ${esc(item.away_team)}</h3></div><label class="result-card__include"><input type="checkbox" data-include="${i}" checked> Inclure</label></div><div class="result-card__match"><label>Domicile<input data-field="home_team" data-i="${i}" value="${esc(item.home_team)}"></label><label>Score<div class="result-card__score"><input type="number" data-field="home_score" data-i="${i}" value="${item.home_score}"><input type="number" data-field="away_score" data-i="${i}" value="${item.away_score}"></div></label><label>Extérieur<input data-field="away_team" data-i="${i}" value="${esc(item.away_team)}"></label></div><label>Fond<select data-bg="${i}">${backgroundOptions(item.backgroundId)}</select></label></article>`
        :`<article class="result-card" data-i="${i}" data-included="${item.included}"><div class="result-card__head"><div><small>Plateau · ${esc(item.category)}</small><h3>${item.games.length} résultat${item.games.length>1?'s':''}</h3></div><label class="result-card__include"><input type="checkbox" data-include="${i}" checked> Inclure</label></div><div class="result-plateau-games">${item.games.map((g,j)=>`<div class="result-plateau-game"><input data-game-field="home_team" data-i="${i}" data-j="${j}" value="${esc(g.home_team)}"><input type="number" data-game-field="home_score" data-i="${i}" data-j="${j}" value="${g.home_score}"><input type="number" data-game-field="away_score" data-i="${i}" data-j="${j}" value="${g.away_score}"><input data-game-field="away_team" data-i="${i}" data-j="${j}" value="${esc(g.away_team)}"></div>`).join('')}</div><label>Fond<select data-bg="${i}">${backgroundOptions(item.backgroundId)}</select></label></article>`).join('')}</div>
    </section>`;
  }

  function loadImage(url,timeoutMs=3500){
    return new Promise(resolve=>{
      if(!url){resolve(null);return;}
      const image=new Image();let done=false;
      const finish=value=>{if(done)return;done=true;clearTimeout(timer);image.onload=null;image.onerror=null;resolve(value);};
      const timer=setTimeout(()=>finish(null),timeoutMs);
      image.onload=()=>finish(image);image.onerror=()=>finish(null);image.src=url;
    });
  }
  function drawCover(ctx,image,x,y,w,h){const s=Math.max(w/image.naturalWidth,h/image.naturalHeight),dw=image.naturalWidth*s,dh=image.naturalHeight*s;ctx.drawImage(image,x+(w-dw)/2,y+(h-dh)/2,dw,dh);}
  function drawContain(ctx,image,x,y,w,h){const s=Math.min(w/image.naturalWidth,h/image.naturalHeight),dw=image.naturalWidth*s,dh=image.naturalHeight*s;ctx.drawImage(image,x+(w-dw)/2,y+(h-dh)/2,dw,dh);}
  function roundedRect(ctx,x,y,w,h,r){const q=Math.max(0,Math.min(r,w/2,h/2));ctx.beginPath();ctx.moveTo(x+q,y);ctx.arcTo(x+w,y,x+w,y+h,q);ctx.arcTo(x+w,y+h,x,y+h,q);ctx.arcTo(x,y+h,x,y,q);ctx.arcTo(x,y,x+w,y,q);ctx.closePath();}
  async function ensureFont(){try{if(document.fonts?.load)await Promise.race([document.fonts.load('80px "Edo SZ"'),new Promise(r=>setTimeout(r,1800))]);}catch(_){}}
  function fitText(ctx,text,max,start,min,family=TEXT,weight=900){let size=start;const value=String(text||'');while(size>min){ctx.font=`${weight} ${size}px ${family}`;if(ctx.measureText(value).width<=max)return size;size-=2;}ctx.font=`${weight} ${min}px ${family}`;return min;}
  function displayDate(value){try{return new Intl.DateTimeFormat('fr-FR',{timeZone:PARIS,weekday:'long',day:'numeric',month:'long'}).format(new Date(value)).toUpperCase();}catch(_){return '';}}
  function initials(name){const w=String(name||'').trim().split(/\s+/).filter(Boolean);return w.length?w.slice(0,2).map(x=>x[0]?.toUpperCase()||'').join(''):'?';}

  async function drawTeamLogo(ctx,name,x,y,size){
    const image=await loadImage(assetUrl(chosenLogo(name)));
    if(image){drawContain(ctx,image,x,y,size,size);return;}
    ctx.save();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x+size/2,y+size/2,size*.43,0,Math.PI*2);ctx.fill();ctx.fillStyle='#8b1047';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${Math.round(size*.22)}px ${TEXT}`;ctx.fillText(initials(name),x+size/2,y+size/2);ctx.restore();
  }

  async function paintBackground(ctx,item){
    const image=await loadImage(assetUrl(chosenBackground(item)));
    const gradient=ctx.createLinearGradient(0,0,1080,1350);
    gradient.addColorStop(0,'#1a0508');gradient.addColorStop(.18,'#43070f');gradient.addColorStop(.48,'#09090b');gradient.addColorStop(.78,'#2c0308');gradient.addColorStop(1,'#7d0a10');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,1080,1350);
    if(image){ctx.save();ctx.globalAlpha=.25;drawCover(ctx,image,0,0,1080,1350);ctx.restore();}
    const glow=ctx.createRadialGradient(90,70,20,90,70,520);glow.addColorStop(0,'rgba(255,35,20,.92)');glow.addColorStop(.4,'rgba(215,16,14,.52)');glow.addColorStop(1,'rgba(215,16,14,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,1080,500);
    ctx.save();ctx.strokeStyle='rgba(255,255,255,.10)';ctx.lineWidth=2;for(const o of [-160,-70,20,120,210,320]){ctx.beginPath();ctx.moveTo(o,170);ctx.lineTo(o+620,-10);ctx.stroke();}ctx.restore();
    const card=ctx.createLinearGradient(40,285,1035,1110);card.addColorStop(0,'#f6d840');card.addColorStop(.55,'#f4d648');card.addColorStop(1,'#eccd40');ctx.fillStyle=card;roundedRect(ctx,14,255,1052,915,88);ctx.fill();
  }
  function drawHeader(ctx,item){
    ctx.textAlign='center';ctx.fillStyle='#f4cc14';ctx.font=`400 82px ${EDO}`;ctx.fillText('RÉSULTATS',540,120);ctx.fillRect(415,150,250,7);
    ctx.fillStyle='#111';ctx.font=`400 50px ${EDO}`;ctx.fillText(item.category||'ÉQUIPE',540,330);ctx.font=`900 20px ${TEXT}`;ctx.fillText(displayDate(item.starts_at),540,365);
  }
  async function drawFooter(ctx){
    const crest=await loadImage('/logo-fce.png',2500);
    ctx.fillStyle='rgba(9,9,11,.91)';ctx.fillRect(0,1170,1080,180);
    ctx.textAlign='left';ctx.fillStyle='#f4cc14';ctx.font=`900 26px ${TEXT}`;ctx.fillText('@FCEscalquens',68,1288);
    if(crest)drawContain(ctx,crest,390,1138,300,175);
    ctx.fillStyle='#3159d5';roundedRect(ctx,796,1218,72,72,17);ctx.fill();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 54px Arial`;ctx.fillText('f',832,1256);
    const ig=ctx.createLinearGradient(900,1215,980,1295);ig.addColorStop(0,'#5b51d8');ig.addColorStop(.46,'#c13584');ig.addColorStop(.73,'#e1306c');ig.addColorStop(1,'#feda75');ctx.fillStyle=ig;roundedRect(ctx,904,1218,72,72,18);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=5;roundedRect(ctx,921,1235,38,38,10);ctx.stroke();ctx.beginPath();ctx.arc(940,1254,10,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(956,1238,3.5,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.textBaseline='alphabetic';
  }

  async function drawMatch(canvas,item){
    canvas.width=1080;canvas.height=1350;const ctx=canvas.getContext('2d');
    await Promise.all([ensureFont(),paintBackground(ctx,item)]);drawHeader(ctx,item);
    await Promise.all([drawTeamLogo(ctx,item.home_team,108,430,215),drawTeamLogo(ctx,item.away_team,756,430,215)]);
    ctx.fillStyle='#151214';ctx.textAlign='center';fitText(ctx,String(item.home_team).toUpperCase(),320,32,19,EDO,400);ctx.fillText(String(item.home_team).toUpperCase(),215,692);fitText(ctx,String(item.away_team).toUpperCase(),320,32,19,EDO,400);ctx.fillText(String(item.away_team).toUpperCase(),864,692);
    ctx.fillStyle='#8b1047';roundedRect(ctx,278,735,524,160,28);ctx.fill();ctx.fillStyle='#f4cc14';ctx.font=`400 112px ${EDO}`;ctx.fillText(`${item.home_score} - ${item.away_score}`,540,850);
    ctx.fillStyle='#121214';ctx.font=`400 44px ${EDO}`;ctx.fillText(resultLabel(item),540,965);
    if(item.competition){fitText(ctx,String(item.competition).toUpperCase(),720,22,14,TEXT,900);ctx.fillStyle='#4b4144';ctx.fillText(String(item.competition).toUpperCase(),540,1015);}
    await drawFooter(ctx);
  }
  async function drawPlateau(canvas,item,games,page,pages){
    canvas.width=1080;canvas.height=1350;const ctx=canvas.getContext('2d');await Promise.all([ensureFont(),paintBackground(ctx,item)]);drawHeader(ctx,item);
    if(pages>1){ctx.fillStyle='#161214';ctx.font=`900 16px ${TEXT}`;ctx.textAlign='center';ctx.fillText(`VISUEL ${page+1}/${pages}`,540,397);}
    let y=430;
    for(const g of games){
      ctx.fillStyle='rgba(255,255,255,.48)';roundedRect(ctx,55,y-25,970,125,22);ctx.fill();
      await Promise.all([drawTeamLogo(ctx,g.home_team,70,y-15,94),drawTeamLogo(ctx,g.away_team,916,y-15,94)]);
      ctx.fillStyle='#141214';ctx.textAlign='left';fitText(ctx,g.home_team,275,22,14,TEXT,900);ctx.fillText(g.home_team,182,y+40);ctx.textAlign='right';fitText(ctx,g.away_team,275,22,14,TEXT,900);ctx.fillText(g.away_team,894,y+40);
      ctx.fillStyle='#8b1047';roundedRect(ctx,438,y-4,204,78,18);ctx.fill();ctx.textAlign='center';ctx.fillStyle='#f4cc14';ctx.font=`400 47px ${EDO}`;ctx.fillText(`${g.home_score} - ${g.away_score}`,540,y+52);y+=138;
    }
    await drawFooter(ctx);
  }

  function download(canvas,filename){canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);},'image/png');}
  async function generate(){
    const selected=state?.items?.filter(x=>x.included!==false)||[];
    if(!selected.length){status.dataset.state='error';status.textContent='Aucun résultat sélectionné.';return;}
    previews.replaceChildren();status.removeAttribute('data-state');let produced=0;
    try{
      for(const [idx,item] of selected.entries()){
        const groups=item.type==='plateau'?Array.from({length:Math.ceil(item.games.length/5)},(_,p)=>item.games.slice(p*5,p*5+5)):[null];
        for(let p=0;p<groups.length;p++){
          status.textContent=`Génération ${produced+1}…`;
          const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption'),label=document.createElement('span'),button=document.createElement('button');
          figure.className='visual-preview';button.type='button';button.className='visual-download';button.textContent='Télécharger le PNG';
          label.textContent=item.type==='plateau'?`${item.category} · plateau${groups.length>1?` · ${p+1}/${groups.length}`:''}`:`${item.category} · ${item.home_team} - ${item.away_team}`;
          const safe=String(item.category||'resultat').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();
          button.onclick=()=>download(canvas,`${state.weekend}-resultat-${safe}-${idx+1}${groups.length>1?`-${p+1}`:''}.png`);
          caption.append(label,button);figure.append(canvas,caption);previews.append(figure);
          if(item.type==='plateau')await drawPlateau(canvas,item,groups[p],p,groups.length);else await drawMatch(canvas,item);
          produced++;
        }
      }
      status.textContent=`${produced} visuel${produced>1?'s':''} généré${produced>1?'s':''} en 1080 × 1350 px.`;previews.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){console.error(error);status.dataset.state='error';status.textContent=`Erreur pendant la génération : ${error?.message||'erreur inconnue'}`;}
  }

  async function uploadFile(file){const fd=new FormData();fd.append('file',file);const r=await fetch('/admin-api/upload',{method:'POST',headers:{'x-requested-with':'XMLHttpRequest'},body:fd});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`Upload impossible (${r.status}).`);return data;}
  async function assetRequest(path,method,body){const r=await fetch(path,{method,headers:{'content-type':'application/json','x-requested-with':'XMLHttpRequest'},body:body?JSON.stringify(body):undefined});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`Opération impossible (${r.status}).`);return data;}
  const createAsset=body=>assetRequest('/admin-api/social_visual_assets','POST',body);
  const updateAsset=(id,body)=>assetRequest(`/admin-api/social_visual_assets/${id}`,'PUT',body);
  const deleteAsset=id=>assetRequest(`/admin-api/social_visual_assets/${id}`,'DELETE');
  const fileLabel=file=>String(file?.name||'Logo').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();

  async function fetchAdminAssets(){
    const r=await fetch('/admin-api/social_visual_assets',{headers:{'x-requested-with':'XMLHttpRequest'}});
    const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.error||`Administration indisponible (${r.status}).`);
    adminAssets=Array.isArray(data)?data:[];publicAssets=adminAssets.filter(a=>Number(a.active)!==0);fillBackgroundSelect();renderLibrary();if(state)renderEditor();
  }
  function renderLibrary(){
    if(!libraryAssets)return;
    libraryAssets.innerHTML=adminAssets.length?adminAssets.map(a=>`<article class="visual-library-asset" data-id="${a.id}"><div class="visual-library-asset__preview"><img src="${esc(assetUrl(a))}" alt=""></div><label>Type<select data-kind><option value="team_logo" ${a.kind==='team_logo'?'selected':''}>Logo</option><option value="background" ${a.kind==='background'?'selected':''}>Fond</option></select></label><label>Nom<input data-name value="${esc(a.name)}"></label><label>Alias<textarea data-aliases>${esc(a.aliases||'')}</textarea></label><label class="visual-library-asset__active"><input type="checkbox" data-active ${Number(a.active)!==0?'checked':''}> Actif</label><div class="visual-library-asset__actions"><button type="button" data-save>Enregistrer</button><button type="button" data-delete>Supprimer</button></div></article>`).join(''):'<p>Aucun logo ou fond enregistré.</p>';
  }

  uploadLogosButton?.addEventListener('click',async()=>{
    const files=[...(logoFolder?.files||[])].filter(f=>String(f.type||'').startsWith('image/'));if(!files.length){libraryStatus.dataset.state='error';libraryStatus.textContent='Sélectionnez au moins une image.';return;}
    uploadLogosButton.disabled=true;libraryStatus.removeAttribute('data-state');
    try{let n=0;for(const file of files){libraryStatus.textContent=`Import ${n+1}/${files.length}…`;const up=await uploadFile(file);await createAsset({kind:'team_logo',name:fileLabel(file),aliases:'',object_key:up.key,display_order:0,active:1});n++;}await fetchAdminAssets();logoFolder.value='';libraryStatus.textContent=`${n} logo${n>1?'s':''} importé${n>1?'s':''}.`;}catch(e){libraryStatus.dataset.state='error';libraryStatus.textContent=e.message;}finally{uploadLogosButton.disabled=false;}
  });
  uploadBackgroundButton?.addEventListener('click',async()=>{
    const file=backgroundFile?.files?.[0];if(!file){libraryStatus.dataset.state='error';libraryStatus.textContent='Choisissez une image de fond.';return;}
    uploadBackgroundButton.disabled=true;libraryStatus.removeAttribute('data-state');
    try{const up=await uploadFile(file),name=String(backgroundName?.value||'').trim()||fileLabel(file);await createAsset({kind:'background',name,aliases:'',object_key:up.key,display_order:0,active:1});await fetchAdminAssets();backgroundFile.value='';backgroundName.value='';libraryStatus.textContent=`Fond « ${name} » ajouté.`;}catch(e){libraryStatus.dataset.state='error';libraryStatus.textContent=e.message;}finally{uploadBackgroundButton.disabled=false;}
  });
  library?.addEventListener('toggle',()=>{if(library.open&&!adminAssets.length)fetchAdminAssets().catch(e=>{libraryStatus.dataset.state='error';libraryStatus.textContent=e.message;});});
  libraryAssets?.addEventListener('click',async event=>{
    const card=event.target.closest('[data-id]');if(!card)return;const id=card.dataset.id;
    if(event.target.closest('[data-save]')){try{const existing=adminAssets.find(a=>String(a.id)===String(id));await updateAsset(id,{kind:card.querySelector('[data-kind]').value,name:card.querySelector('[data-name]').value.trim(),aliases:card.querySelector('[data-aliases]').value.trim(),object_key:existing?.object_key||'',display_order:Number(existing?.display_order||0),active:card.querySelector('[data-active]').checked?1:0});await fetchAdminAssets();libraryStatus.textContent='Bibliothèque mise à jour.';}catch(e){libraryStatus.dataset.state='error';libraryStatus.textContent=e.message;}}
    if(event.target.closest('[data-delete]')&&confirm('Supprimer cette référence ?')){try{await deleteAsset(id);await fetchAdminAssets();libraryStatus.textContent='Référence supprimée.';}catch(e){libraryStatus.dataset.state='error';libraryStatus.textContent=e.message;}}
  });

  defaultBackground.onchange=()=>{if(state)state.defaultBackground=defaultBackground.value||'';};
  editor.addEventListener('change',event=>{
    if(!state)return;
    const logo=event.target.closest('[data-logo]');if(logo){state.logoOverrides.set(logo.dataset.logo,logo.value);return;}
    const include=event.target.closest('[data-include]');if(include){const i=Number(include.dataset.include);state.items[i].included=include.checked;include.closest('.result-card').dataset.included=String(include.checked);return;}
    const bg=event.target.closest('[data-bg]');if(bg)state.items[Number(bg.dataset.bg)].backgroundId=bg.value||'';
  });
  editor.addEventListener('input',event=>{
    if(!state)return;
    const input=event.target.closest('[data-field]');if(input){const item=state.items[Number(input.dataset.i)],field=input.dataset.field;item[field]=input.type==='number'?Number(input.value):input.value;return;}
    const g=event.target.closest('[data-game-field]');if(g){const game=state.items[Number(g.dataset.i)].games[Number(g.dataset.j)],field=g.dataset.gameField;game[field]=g.type==='number'?Number(g.value):g.value;}
  });
  editor.addEventListener('click',e=>{if(e.target.closest('[data-generate]'))generate();});
  form.addEventListener('submit',async e=>{
    e.preventDefault();const key=dateInput.value;if(!key)return;const button=form.querySelector('button[type="submit"]');button.disabled=true;editor.replaceChildren();previews.replaceChildren();status.removeAttribute('data-state');status.textContent='Récupération des résultats du week-end…';
    try{await prepareWeekend(key);if(!state.items.length)throw new Error('Aucun résultat disponible pour ce week-end.');status.textContent=`${state.items.length} résultat${state.items.length>1?'s':''} chargé${state.items.length>1?'s':''}. Vérifiez les logos, scores et fonds.`;}catch(error){state=null;status.dataset.state='error';status.textContent=error.message||'Impossible de préparer les résultats.';}finally{button.disabled=false;}
  });

  dateInput.value=nextSaturday();
  fetchPublicAssets().catch(()=>{});
})();
