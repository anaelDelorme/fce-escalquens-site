const applySiteMedia=async()=>{
  const targets=[...document.querySelectorAll('[data-media-slot]')];
  if(!targets.length)return;
  try{
    const response=await fetch('/api/site_media');
    if(!response.ok)return;
    const rows=await response.json();
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
