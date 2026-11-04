// This switch only changes shop_settings.shop_enabled. Checkout configuration stays separate.
export async function mountShopVisibility(root,call,notice){
 if(!root)return;
 let pending=false;
 async function refresh(){
  if(pending)return;
  try{
   const rows=await call('content/shop_settings'),settings=rows.find(row=>Number(row.id)===1);
   if(!settings)throw new Error('Les réglages d’affichage de la boutique sont introuvables.');
   const visible=Number(settings.shop_enabled)!==0,key=String(settings.maintenance_image_key||'').trim();
   root.innerHTML=`<div class="shop-display-copy"><span class="commerce-badge">${visible?'Boutique visible':'Image d’attente affichée'}</span><h2>${visible?'Mettre la boutique en pause':'La boutique est masquée'}</h2><p>${visible?'Remplacez le catalogue par votre image d’attente. Les articles et les commandes sont conservés.':'Les visiteurs voient la page d’attente. Vous pouvez continuer à gérer les articles et les commandes.'}</p><a href="/admin-boutique/couverture/">${key?'Modifier l’image d’attente':'Ajouter l’image d’attente'} →</a></div>${key?`<img class="shop-display-preview" src="/media/${encodeURIComponent(key).replace(/%2F/g,'/')}" alt="Image d’attente de la boutique" width="140" height="90">`:''}<div class="shop-display-action"><button type="button" id="toggle-shop-display" ${visible&&!key?'disabled':''}>${visible?'Afficher uniquement l’image d’attente':'Réafficher la boutique'}</button>${visible&&!key?'<small>Ajoutez d’abord une image dans « Couverture et affichage ».</small>':''}</div><p id="shop-display-status" role="status" aria-live="polite"></p>`;
   root.dataset.visible=String(visible);
   root.querySelector('#toggle-shop-display').onclick=async event=>{
    if(pending)return;pending=true;
    const button=event.currentTarget,status=root.querySelector('#shop-display-status');
    button.disabled=true;button.setAttribute('aria-busy','true');status.textContent='Mise à jour de l’affichage…';
    try{
     await call('content/shop_settings/1',{method:'PUT',data:{shop_enabled:visible?0:1}});
     const message=visible?'La boutique est masquée : les visiteurs voient l’image d’attente.':'La boutique est de nouveau visible. Les réglages de paiement sont conservés.';
     pending=false;await refresh();const feedback=root.querySelector('#shop-display-status');if(feedback)feedback.textContent=message;notice(message);
    }catch(error){status.textContent=error.message||'L’affichage n’a pas pu être modifié. Réessayez.';}
    finally{pending=false;button.disabled=false;button.removeAttribute('aria-busy');}
   };
  }catch(error){
   root.innerHTML='<p role="status"></p><button type="button" id="retry-shop-display">Réessayer</button>';
   root.querySelector('p').textContent=error.message||'État de la boutique indisponible.';
   root.querySelector('button').onclick=refresh;
  }
 }
 document.addEventListener('shop-display-updated',refresh);
 await refresh();
}
