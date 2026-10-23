import {card} from '../news/content';
const section=document.querySelector('#home-news'),items=document.querySelector('#home-news-items');
async function load(){
 if(!section||!items)return;
 try{const response=await fetch('/api/news',{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw new Error();const data=await response.json();if(!Array.isArray(data.news)||!data.news.length){section.hidden=true;return;}items.innerHTML=data.news.map(card).join('');section.hidden=false;}catch{section.hidden=true;}
}
load();
// Re-check dates when a long-open page becomes visible again.
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
