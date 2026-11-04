import {card,escapeHtml as esc} from '../news/content';
const section=document.querySelector('#home-news'),items=document.querySelector('#home-news-items'),alert=document.querySelector('#home-news-alert');
let generation=0;
const hide=()=>{section.hidden=true;if(alert){alert.hidden=true;alert.innerHTML='';}};
async function load(){
 if(!section||!items)return;
 const request=++generation;
 try{
  const response=await fetch('/api/news',{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw new Error();
  const data=await response.json();if(request!==generation)return;
  if(!Array.isArray(data.news)||!data.news.length){hide();return;}
  items.innerHTML=data.news.map(card).join('');section.hidden=false;
  if(alert){
   const first=data.news[0],more=data.news.length-1;
   alert.innerHTML=`<div class="home-news-alert-inner"><a class="home-news-highlight" href="#annonce-${Number(first.id)}"><span class="home-news-label">À la une</span>${first.image_key?`<img src="/media/${encodeURIComponent(first.image_key).replace(/%2F/g,'/')}" alt="" width="52" height="40" decoding="async">`:''}<strong>${esc(first.title)}</strong><span class="home-news-discover">Découvrir <span aria-hidden="true">↓</span></span></a>${more?`<a class="home-news-all" href="#home-news">+ ${more} ${more===1?'actualité':'actualités'} <span aria-hidden="true">→</span></a>`:''}</div>`;
   alert.hidden=false;
  }
 }catch{if(request===generation)hide();}
}
load();
// Re-check dates when a long-open page becomes visible again.
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
