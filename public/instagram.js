const instagramRoot=document.querySelector('#instagram-posts');
if(instagramRoot)(window.fceHomeData||fetch('/api/page/home').then(response=>response.json())).then(data=>{
  const posts=data.social_posts||[];
  instagramRoot.innerHTML=posts.map(post=>{
    const image=post.media_type==='VIDEO'?(post.thumbnail_url||post.media_url):post.media_url;
    const caption=String(post.caption||'').trim();
    return `<a href="${post.permalink}" target="_blank" rel="noopener"><img src="${image}" alt="" loading="lazy"><span>${caption.slice(0,130)}${caption.length>130?'…':''}</span></a>`;
  }).join('')||'<p>Connectez le compte Instagram professionnel dans l’administration pour afficher les dernières actualités.</p>';
}).catch(()=>{instagramRoot.innerHTML='<p>Les actualités Instagram sont momentanément indisponibles.</p>'});
