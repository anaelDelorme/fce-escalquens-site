export async function publicMedia(origin,key,fetcher=fetch){
 const base=new URL(origin);
 if(base.protocol!=='https:'||base.origin!==origin)throw Error('Origine publique staging HTTPS invalide.');
 let response;
 try{response=await fetcher(new URL('/media/'+key.split('/').map(encodeURIComponent).join('/'),base),{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Error('Média public staging inaccessible : connexion ou redirection refusée.');}
 const type=(response.headers.get('content-type')||'application/octet-stream').split(';')[0];
 if(!response.ok||!(type.startsWith('image/')||['application/pdf','application/octet-stream'].includes(type)))throw Error('Média public staging inaccessible ou réponse non média.');
 const chunks=[];let size=0;const reader=response.body?.getReader();if(!reader)throw Error('Média public vide.');
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32*1024*1024)throw Error('Média public trop volumineux pour la préparation.');chunks.push(value);}}finally{await reader.cancel();}
 return {bytes:Buffer.concat(chunks),content_type:type};
}
