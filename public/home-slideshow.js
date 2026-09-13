(()=>{
  const root=document.querySelector('#home-slideshow');
  if(!root)return;

  const image=root.querySelector('#home-slide-image');
  const controls=root.querySelector('.home-slideshow-controls');
  const dots=root.querySelector('.home-slideshow-dots');
  const previous=root.querySelector('[data-slide-prev]');
  const next=root.querySelector('[data-slide-next]');
  const toggle=root.querySelector('[data-slide-toggle]');
  const status=root.querySelector('#home-slide-status');
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const fallback={
    src:root.dataset.fallbackSrc||'/equipe-collectif.webp',
    alt:root.dataset.fallbackAlt||'Une équipe du FC Escalquens réunie avant le match'
  };

  let slides=[];
  let index=0;
  let timer=null;
  let userPaused=false;
  let pointerPaused=false;
  let focusPaused=false;
  let switching=false;

  const normalize=value=>{
    if(!slides.length)return 0;
    return (value%slides.length+slides.length)%slides.length;
  };

  const srcFor=slide=>slide?.object_key
    ?`/media/${encodeURIComponent(slide.object_key).replace(/%2F/g,'/')}`
    :fallback.src;

  const preload=source=>new Promise((resolve,reject)=>{
    const loader=new Image();
    loader.onload=()=>resolve(source);
    loader.onerror=reject;
    loader.src=source;
  });

  const clearTimer=()=>{
    if(timer){window.clearTimeout(timer);timer=null}
  };

  const autoplayAllowed=()=>slides.length>1
    && !userPaused
    && !pointerPaused
    && !focusPaused
    && !reducedMotion.matches
    && !document.hidden;

  const updateToggle=()=>{
    if(!toggle)return;
    const stopped=userPaused||reducedMotion.matches;
    toggle.hidden=slides.length<=1||reducedMotion.matches;
    toggle.setAttribute('aria-pressed',String(userPaused));
    toggle.textContent=userPaused?'Lecture':'Pause';
    toggle.setAttribute('aria-label',userPaused?'Relancer le défilement automatique':'Mettre le diaporama en pause');
    root.dataset.autoplay=stopped?'off':'on';
  };

  const schedule=()=>{
    clearTimer();
    updateToggle();
    if(!autoplayAllowed())return;
    timer=window.setTimeout(async()=>{
      await show(index+1,false);
      schedule();
    },6500);
  };

  const updateDots=()=>{
    [...dots.querySelectorAll('button')].forEach((button,buttonIndex)=>{
      const current=buttonIndex===index;
      button.setAttribute('aria-current',current?'true':'false');
      button.setAttribute('aria-label',`${current?'Photo affichée':'Afficher la photo'} ${buttonIndex+1} sur ${slides.length}`);
    });
  };

  const show=async(nextIndex,announce=true)=>{
    if(!slides.length||switching)return;
    const target=normalize(nextIndex);
    const slide=slides[target];
    const source=srcFor(slide);
    switching=true;
    root.setAttribute('aria-busy','true');
    try{
      await preload(source);
      if(!reducedMotion.matches){
        image.classList.add('is-changing');
        await new Promise(resolve=>window.setTimeout(resolve,110));
      }
      image.src=source;
      image.alt=String(slide.alt_text||fallback.alt).trim()||fallback.alt;
      index=target;
      updateDots();
      if(announce&&status)status.textContent=`Photo ${index+1} sur ${slides.length} : ${image.alt}`;
    }catch{
      const remaining=slides.filter((_,slideIndex)=>slideIndex!==target);
      if(remaining.length){
        slides=remaining;
        index=Math.min(index,slides.length-1);
        renderDots();
      }else{
        image.src=fallback.src;
        image.alt=fallback.alt;
      }
    }finally{
      image.classList.remove('is-changing');
      root.setAttribute('aria-busy','false');
      switching=false;
    }
  };

  const renderDots=()=>{
    dots.innerHTML='';
    if(slides.length<=1){
      dots.hidden=true;
      controls.hidden=true;
      updateToggle();
      return;
    }
    slides.forEach((_,slideIndex)=>{
      const button=document.createElement('button');
      button.type='button';
      button.dataset.slideIndex=String(slideIndex);
      button.addEventListener('click',async()=>{
        userPaused=true;
        clearTimer();
        await show(slideIndex,true);
        updateToggle();
      });
      dots.append(button);
    });
    dots.hidden=false;
    controls.hidden=false;
    updateDots();
    updateToggle();
  };

  previous?.addEventListener('click',async()=>{
    userPaused=true;
    clearTimer();
    await show(index-1,true);
    updateToggle();
  });

  next?.addEventListener('click',async()=>{
    userPaused=true;
    clearTimer();
    await show(index+1,true);
    updateToggle();
  });

  toggle?.addEventListener('click',()=>{
    userPaused=!userPaused;
    if(status)status.textContent=userPaused?'Diaporama en pause.':'Défilement automatique relancé.';
    schedule();
  });

  root.addEventListener('pointerenter',()=>{pointerPaused=true;clearTimer()});
  root.addEventListener('pointerleave',()=>{pointerPaused=false;schedule()});
  root.addEventListener('focusin',()=>{focusPaused=true;clearTimer()});
  root.addEventListener('focusout',event=>{
    if(root.contains(event.relatedTarget))return;
    focusPaused=false;
    schedule();
  });

  root.addEventListener('keydown',async event=>{
    if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
    event.preventDefault();
    userPaused=true;
    clearTimer();
    await show(index+(event.key==='ArrowRight'?1:-1),true);
    updateToggle();
  });

  document.addEventListener('visibilitychange',schedule);
  const onMotionChange=()=>schedule();
  if(reducedMotion.addEventListener)reducedMotion.addEventListener('change',onMotionChange);
  else reducedMotion.addListener(onMotionChange);

  const dataPromise=window.fceHomeData||fetch('/api/page/home').then(response=>response.json());
  Promise.resolve(dataPromise).then(async data=>{
    slides=(data.slides||[])
      .filter(slide=>Number(slide.active??1)!==0&&String(slide.object_key||'').trim())
      .sort((a,b)=>Number(a.display_order||0)-Number(b.display_order||0)||Number(a.id||0)-Number(b.id||0))
      .slice(0,12);

    if(!slides.length){
      root.removeAttribute('aria-busy');
      controls.hidden=true;
      dots.hidden=true;
      return;
    }

    renderDots();
    await show(0,false);
    schedule();
  }).catch(()=>{
    root.removeAttribute('aria-busy');
    controls.hidden=true;
    dots.hidden=true;
  });
})();
