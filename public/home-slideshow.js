(()=>{
  const root=document.querySelector('#home-slideshow');
  if(!root)return;

  const stage=root.querySelector('.home-slideshow-stage');
  const firstImage=root.querySelector('#home-slide-image');
  const controls=root.querySelector('.home-slideshow-controls');
  const dots=root.querySelector('.home-slideshow-dots');
  const previous=root.querySelector('[data-slide-prev]');
  const next=root.querySelector('[data-slide-next]');
  const toggle=root.querySelector('[data-slide-toggle]');
  const status=root.querySelector('#home-slide-status');
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');

  const DISPLAY_MS=5000;
  const TRANSITION_MS=800;

  const fallback={
    src:root.dataset.fallbackSrc||'/equipe-collectif.webp',
    alt:root.dataset.fallbackAlt||'Une équipe du FC Escalquens réunie avant le match'
  };

  // Deux images superposées permettent un vrai fondu croisé :
  // la nouvelle photo apparaît pendant que l'ancienne disparaît.
  firstImage.classList.add('home-slide-buffer','is-active');
  firstImage.setAttribute('aria-hidden','false');

  const secondImage=document.createElement('img');
  secondImage.className='home-slide-buffer';
  secondImage.alt='';
  secondImage.setAttribute('aria-hidden','true');
  secondImage.decoding='async';
  stage.append(secondImage);
  stage.classList.add('is-ready');

  const buffers=[firstImage,secondImage];

  let slides=[];
  let index=0;
  let activeBuffer=0;
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

  const sameResource=(a,b)=>{
    try{
      return new URL(a,window.location.href).href===new URL(b,window.location.href).href;
    }catch{
      return a===b;
    }
  };

  const preload=source=>new Promise((resolve,reject)=>{
    const loader=new Image();
    loader.onload=()=>resolve(source);
    loader.onerror=reject;
    loader.src=source;
  });

  const clearTimer=()=>{
    if(timer){
      window.clearTimeout(timer);
      timer=null;
    }
  };

  const autoplayAllowed=()=>slides.length>1
    && !userPaused
    && !pointerPaused
    && !focusPaused
    && !reducedMotion.matches
    && !document.hidden;

  const updateToggle=()=>{
    if(!toggle)return;
    toggle.hidden=slides.length<=1||reducedMotion.matches;
    toggle.setAttribute('aria-pressed',String(userPaused));
    toggle.textContent=userPaused?'Lecture':'Pause';
    toggle.setAttribute(
      'aria-label',
      userPaused
        ?'Relancer le défilement automatique'
        :'Mettre le diaporama en pause'
    );
  };

  const schedule=()=>{
    clearTimer();
    updateToggle();

    if(!autoplayAllowed())return;

    // La photo reste entièrement visible 5 secondes.
    // Le fondu de 800 ms vient ensuite et ne réduit pas ce temps d'affichage.
    timer=window.setTimeout(async()=>{
      await show(index+1,false,false);
      schedule();
    },DISPLAY_MS);
  };

  const updateDots=()=>{
    [...dots.querySelectorAll('button')].forEach((button,buttonIndex)=>{
      const current=buttonIndex===index;
      button.setAttribute('aria-current',current?'true':'false');
      button.setAttribute(
        'aria-label',
        `${current?'Photo affichée':'Afficher la photo'} ${buttonIndex+1} sur ${slides.length}`
      );
    });
  };

  const setAccessibleBuffer=(active,slide)=>{
    buffers.forEach((buffer,bufferIndex)=>{
      const isActive=bufferIndex===active;
      buffer.setAttribute('aria-hidden',isActive?'false':'true');
      buffer.alt=isActive
        ?(String(slide?.alt_text||fallback.alt).trim()||fallback.alt)
        :'';
    });
  };

  const show=async(nextIndex,announce=true,instant=false)=>{
    if(!slides.length||switching)return;

    const target=normalize(nextIndex);
    const slide=slides[target];
    const source=srcFor(slide);

    switching=true;
    root.setAttribute('aria-busy','true');

    try{
      await preload(source);

      // Premier affichage : aucune animation.
      // Si l'image HTML de départ EST déjà la première photo du diaporama,
      // on ne touche pas à son src : pas de rechargement, pas de flash,
      // pas de "double premier affichage".
      if(instant||reducedMotion.matches){
        const current=buffers[activeBuffer];
        const currentSource=current.currentSrc||current.getAttribute('src')||'';

        if(!sameResource(currentSource,source)){
          current.src=source;
        }

        current.classList.add('is-active');

        const inactive=buffers[1-activeBuffer];
        inactive.classList.remove('is-active');

        index=target;
        setAccessibleBuffer(activeBuffer,slide);
        updateDots();

        if(announce&&status){
          status.textContent=`Photo ${index+1} sur ${slides.length} : ${current.alt}`;
        }
        return;
      }

      const oldBuffer=activeBuffer;
      const newBuffer=1-activeBuffer;
      const outgoing=buffers[oldBuffer];
      const incoming=buffers[newBuffer];

      incoming.src=source;
      incoming.alt='';
      incoming.setAttribute('aria-hidden','true');

      // Force le navigateur à enregistrer l'état initial avant le fondu.
      incoming.classList.remove('is-active');
      void incoming.offsetWidth;

      requestAnimationFrame(()=>{
        incoming.classList.add('is-active');
        outgoing.classList.remove('is-active');
      });

      await new Promise(resolve=>window.setTimeout(resolve,TRANSITION_MS));

      activeBuffer=newBuffer;
      index=target;
      setAccessibleBuffer(activeBuffer,slide);
      updateDots();

      if(announce&&status){
        status.textContent=`Photo ${index+1} sur ${slides.length} : ${buffers[activeBuffer].alt}`;
      }
    }catch{
      const remaining=slides.filter((_,slideIndex)=>slideIndex!==target);

      if(remaining.length){
        slides=remaining;
        index=Math.min(index,slides.length-1);
        renderDots();
      }else{
        const current=buffers[activeBuffer];
        current.src=fallback.src;
        current.alt=fallback.alt;
        current.setAttribute('aria-hidden','false');
      }
    }finally{
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
        await show(slideIndex,true,false);
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
    await show(index-1,true,false);
    updateToggle();
  });

  next?.addEventListener('click',async()=>{
    userPaused=true;
    clearTimer();
    await show(index+1,true,false);
    updateToggle();
  });

  toggle?.addEventListener('click',()=>{
    userPaused=!userPaused;

    if(status){
      status.textContent=userPaused
        ?'Diaporama en pause.'
        :'Défilement automatique relancé.';
    }

    schedule();
  });

  // Le survol met en pause uniquement avec une vraie souris.
  root.addEventListener('pointerenter',event=>{
    if(event.pointerType&&event.pointerType!=='mouse')return;
    pointerPaused=true;
    clearTimer();
  });

  root.addEventListener('pointerleave',event=>{
    if(event.pointerType&&event.pointerType!=='mouse')return;
    pointerPaused=false;
    schedule();
  });

  root.addEventListener('focusin',()=>{
    focusPaused=true;
    clearTimer();
  });

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

    await show(
      index+(event.key==='ArrowRight'?1:-1),
      true,
      false
    );

    updateToggle();
  });

  document.addEventListener('visibilitychange',schedule);

  const onMotionChange=()=>{
    if(reducedMotion.matches){
      buffers.forEach(buffer=>buffer.style.transition='none');
    }else{
      buffers.forEach(buffer=>buffer.style.removeProperty('transition'));
    }
    schedule();
  };

  if(reducedMotion.addEventListener){
    reducedMotion.addEventListener('change',onMotionChange);
  }else{
    reducedMotion.addListener(onMotionChange);
  }

  const dataPromise=window.fceHomeData
    ||fetch('/api/page/home').then(response=>response.json());

  Promise.resolve(dataPromise).then(async data=>{
    slides=(data.slides||[])
      .filter(slide=>
        Number(slide.active??1)!==0
        &&String(slide.object_key||'').trim()
      )
      .sort((a,b)=>
        Number(a.display_order||0)-Number(b.display_order||0)
        ||Number(a.id||0)-Number(b.id||0)
      )
      .slice(0,12);

    if(!slides.length){
      root.removeAttribute('aria-busy');
      controls.hidden=true;
      dots.hidden=true;
      return;
    }

    renderDots();

    // Important : pas de fondu au premier chargement de la page.
    // Si le fallback est déjà la première diapositive, son src n'est même pas réassigné.
    await show(0,false,true);

    // Précharge immédiatement la photo suivante pendant les 5 s d'affichage.
    if(slides.length>1){
      preload(srcFor(slides[1])).catch(()=>{});
    }

    schedule();
  }).catch(()=>{
    root.removeAttribute('aria-busy');
    controls.hidden=true;
    dots.hidden=true;
  });
})();
