const applySiteMedia=async()=>{
  const targets=[...document.querySelectorAll('[data-media-slot]')];
  if(!targets.length)return;
  try{
    const shared=window.fceHomeData||window.fceMecenatData;
    const data=shared?await shared:await fetch('/api/site_media').then(response=>response.ok?response.json():[]);
    const rows=Array.isArray(data)?data:(data.site_media||[]);
    for(const target of targets){
      const media=rows.find(item=>item.slot===target.dataset.mediaSlot);
      if(!media)continue;
      if(media.alt_text)target.alt=media.alt_text;
      if(!media.object_key)continue;
      const source=`/media/${media.object_key}`,loader=new Image();
      loader.onload=()=>{target.src=source};
      loader.src=source;
    }
  }catch{}
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applySiteMedia,{once:true});
else applySiteMedia();
