export const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function safeLink(value:unknown):string{
 const s=String(value??'').trim();if(!s)return '';
 if(/[\u0000-\u0020\\]/.test(s)||s.startsWith('//'))throw new Error('Utilisez un lien HTTPS ou une adresse interne commençant par /.');
 if(s.startsWith('/'))return s;
 let url:URL;try{url=new URL(s);}catch{throw new Error('Le lien est invalide.');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Utilisez un lien HTTP(S) sans identifiants.');
 return url.href;
}
// Small, escaped formatting vocabulary. HTML, scripts, inline CSS and embedded media are never interpreted.
export function richText(value:unknown){
 const inline=(s:string)=>escapeHtml(s).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
 const paragraphs=String(value??'').replace(/\r\n?/g,'\n').split(/\n\s*\n/);
 return paragraphs.filter(p=>p.trim()).map(p=>{
  const lines=p.trim().split('\n');
  if(lines.every(l=>/^\s*-\s+/.test(l)))return '<ul>'+lines.map(l=>'<li>'+inline(l.replace(/^\s*-\s+/,''))+'</li>').join('')+'</ul>';
  const heading=p.match(/^##\s+([^\n]+)$/);if(heading)return '<h4>'+inline(heading[1])+'</h4>';
  return '<p>'+lines.map(inline).join('<br>')+'</p>';
 }).join('');
}
export function card(row:Record<string,any>){
 let link='';try{link=safeLink(row.link_url);}catch{}
 return `<article class="news-card" id="annonce-${Number(row.id)}" tabindex="-1">${row.image_key?`<img src="/media/${encodeURIComponent(row.image_key).replace(/%2F/g,'/')}" alt="${escapeHtml(row.image_alt)}" loading="lazy" decoding="async" width="960" height="600">`:''}<div class="news-card-copy"><h3>${escapeHtml(row.title)}</h3><div class="news-prose">${richText(row.body)}</div>${link?`<a class="news-link" href="${escapeHtml(link)}">${escapeHtml(row.link_label)} <span aria-hidden="true">→</span></a>`:''}</div></article>`;
}
