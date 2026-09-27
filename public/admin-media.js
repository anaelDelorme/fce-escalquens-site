(() => {
  const baseUpload=upload;

  const dialog=document.createElement('dialog');
  dialog.id='image-cropper';
  dialog.className='image-cropper-dialog';
  dialog.innerHTML=`
    <form method="dialog">
      <div class="cropper-head">
        <div>
          <small id="cropper-format">Format</small>
          <h2>Recadrer l’image</h2>
        </div>
        <button class="cropper-close" value="cancel" aria-label="Fermer">×</button>
      </div>
      <p class="cropper-help">Déplacez l’image dans le cadre puis ajustez le zoom. L’image envoyée sera convertie en WebP aux dimensions du cadre.</p>
      <div class="cropper-canvas-wrap"><canvas id="cropper-canvas"></canvas></div>
      <label class="cropper-zoom"><span>Zoom</span><input id="cropper-zoom" type="range" min="1" max="3" step="0.01" value="1"></label>
      <p id="cropper-status" role="status" aria-live="polite"></p>
      <menu>
        <button value="cancel">Annuler</button>
        <button id="cropper-confirm" type="button">Recadrer et charger</button>
      </menu>
    </form>`;
  document.body.append(dialog);

  const canvas=dialog.querySelector('#cropper-canvas');
  const ctx=canvas.getContext('2d');
  const zoomInput=dialog.querySelector('#cropper-zoom');
  const status=dialog.querySelector('#cropper-status');
  const formatLabel=dialog.querySelector('#cropper-format');
  const confirmButton=dialog.querySelector('#cropper-confirm');
  let state=null;

  const profile=input=>{
    const field=input.dataset.upload;
    const form=document.querySelector('#editor form');

    if(current==='teams'&&field==='photo_key')return {width:1600,height:900,label:'Photo d’équipe · 1600 × 900 · 16:9',mode:'cover'};
    if(current==='club_members'&&field==='photo_key')return {width:900,height:900,label:'Portrait · 900 × 900 · 1:1',mode:'cover'};
    if(current==='home_slides'&&field==='object_key')return {width:1600,height:900,label:'Diaporama accueil · 1600 × 900 · 16:9',mode:'cover'};
    if(current==='shop_products'&&field==='image_key')return {width:1200,height:900,label:'Article boutique · 1200 × 900 · 4:3',mode:'cover'};
    if(current==='recruitment_posts'&&field==='image_key')return {width:1600,height:900,label:'Annonce recrutement · 1600 × 900 · 16:9',mode:'cover'};

    if(current==='sponsors'&&field==='logo_key'){
      const tier=form?.querySelector('[name="tier"]')?.value||editingRow.tier||'partenaire';
      if(tier==='majeur')return {width:1200,height:600,label:'Partenaire majeur · 1200 × 600 · 2:1',mode:'contain'};
      if(tier==='premium')return {width:1200,height:480,label:'Partenaire premium · 1200 × 480 · 5:2',mode:'contain'};
      return {width:1200,height:400,label:'Partenaire · 1200 × 400 · 3:1',mode:'contain'};
    }

    if(current==='site_media'&&field==='object_key'){
      const slot=String(editingRow.slot||'');
      if(['home_story','sponsor_hero','sponsor_project'].includes(slot))return {width:1200,height:1500,label:'Photo verticale · 1200 × 1500 · 4:5',mode:'cover'};
      if(slot==='shop_hero')return {width:1600,height:1200,label:'Couverture boutique · 1600 × 1200 · 4:3',mode:'cover'};
      return {width:1600,height:900,label:'Photo du site · 1600 × 900 · 16:9',mode:'cover'};
    }

    return {width:1600,height:900,label:'Image · 1600 × 900 · 16:9',mode:'cover'};
  };

  const constrain=()=>{
    if(!state)return;
    const drawW=state.image.naturalWidth*state.scale,drawH=state.image.naturalHeight*state.scale;

    if(state.profile.mode==='cover'){
      state.x=Math.min(0,Math.max(canvas.width-drawW,state.x));
      state.y=Math.min(0,Math.max(canvas.height-drawH,state.y));
    }else{
      const minX=Math.min(0,canvas.width-drawW),maxX=Math.max(0,canvas.width-drawW);
      const minY=Math.min(0,canvas.height-drawH),maxY=Math.max(0,canvas.height-drawH);
      state.x=Math.min(maxX,Math.max(minX,state.x));
      state.y=Math.min(maxY,Math.max(minY,state.y));
    }
  };

  const render=()=>{
    if(!state)return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(state.image,state.x,state.y,state.image.naturalWidth*state.scale,state.image.naturalHeight*state.scale);
  };

  const setZoom=value=>{
    if(!state)return;
    const oldW=state.image.naturalWidth*state.scale,oldH=state.image.naturalHeight*state.scale;
    const centerX=state.x+oldW/2,centerY=state.y+oldH/2;
    state.scale=state.baseScale*Number(value);
    const newW=state.image.naturalWidth*state.scale,newH=state.image.naturalHeight*state.scale;
    state.x=centerX-newW/2;state.y=centerY-newH/2;
    constrain();render();
  };

  const openCropper=(input,file)=>{
    const objectUrl=URL.createObjectURL(file),image=new Image();

    image.onload=()=>{
      const p=profile(input);
      canvas.width=p.width;canvas.height=p.height;

      const coverScale=Math.max(canvas.width/image.naturalWidth,canvas.height/image.naturalHeight);
      const containScale=Math.min(canvas.width/image.naturalWidth,canvas.height/image.naturalHeight);
      const baseScale=p.mode==='contain'?containScale:coverScale;

      state={
        input,file,objectUrl,image,profile:p,
        baseScale,scale:baseScale,
        x:(canvas.width-image.naturalWidth*baseScale)/2,
        y:(canvas.height-image.naturalHeight*baseScale)/2,
        dragging:false,lastX:0,lastY:0
      };

      zoomInput.value='1';
      formatLabel.textContent=p.label;
      status.textContent='';
      confirmButton.disabled=false;
      render();
      dialog.showModal();
    };

    image.onerror=()=>{
      URL.revokeObjectURL(objectUrl);
      input.value='';
      const message=input.closest('label')?.querySelector('.file-state');
      if(message)message.textContent='Cette image ne peut pas être lue.';
    };

    image.src=objectUrl;
  };

  upload=async input=>{
    const file=input.files?.[0];
    if(!file||input.dataset.image!=='1'||!String(file.type||'').startsWith('image/'))return baseUpload(input);
    openCropper(input,file);
  };

  zoomInput.addEventListener('input',()=>setZoom(zoomInput.value));

  canvas.addEventListener('pointerdown',event=>{
    if(!state)return;
    state.dragging=true;state.lastX=event.clientX;state.lastY=event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove',event=>{
    if(!state?.dragging)return;
    const rect=canvas.getBoundingClientRect();
    state.x+=(event.clientX-state.lastX)*(canvas.width/rect.width);
    state.y+=(event.clientY-state.lastY)*(canvas.height/rect.height);
    state.lastX=event.clientX;state.lastY=event.clientY;
    constrain();render();
  });

  const stop=()=>{if(state)state.dragging=false};
  canvas.addEventListener('pointerup',stop);
  canvas.addEventListener('pointercancel',stop);

  confirmButton.addEventListener('click',()=>{
    if(!state)return;
    confirmButton.disabled=true;status.textContent='Préparation de l’image…';

    canvas.toBlob(async blob=>{
      if(!blob){status.textContent='Impossible de générer l’image.';confirmButton.disabled=false;return}
      try{
        const baseName=String(state.file.name||'image').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'')||'image';
        const cropped=new File([blob],`${baseName}-recadree.webp`,{type:'image/webp'});
        const transfer=new DataTransfer();transfer.items.add(cropped);state.input.files=transfer.files;
        status.textContent='Envoi de l’image…';
        await baseUpload(state.input);
        dialog.close();
      }catch(error){status.textContent=error?.message||'Échec du chargement.';confirmButton.disabled=false}
    },'image/webp',0.9);
  });

  dialog.addEventListener('close',()=>{
    if(!state)return;
    URL.revokeObjectURL(state.objectUrl);state.input.value='';state=null;
    ctx.clearRect(0,0,canvas.width,canvas.height);
  });
})();
