import {createCipheriv,createDecipheriv,randomBytes,scryptSync} from 'node:crypto';
import {createReadStream,createWriteStream,openSync,readSync,closeSync,statSync,mkdirSync,rmSync,renameSync,appendFileSync} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {spawnSync} from 'node:child_process';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const magic=Buffer.from('FCEARCH1\n'),headerSize=magic.length+16+12;
export function archiveKey(password){
 if(typeof password!=='string'||!password.length)throw Error('PRODUCTION_ARCHIVE_PASSWORD absent : le workflow ne reçoit pas ce secret GitHub Actions. Vérifier son nom et son accès pour ce dépôt.');
 if(password.length<32)throw Error('PRODUCTION_ARCHIVE_PASSWORD trop court : utiliser une clé aléatoire d’au moins 32 caractères dans le secret GitHub Actions.');
}
const derive=(password,salt)=>scryptSync(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
export async function encryptFile(input,output,password){
 archiveKey(password);
 const salt=randomBytes(16),iv=randomBytes(12),header=Buffer.concat([magic,salt,iv]);
 const cipher=createCipheriv('aes-256-gcm',derive(password,salt),iv);cipher.setAAD(header);
 const temporary=output+'.partial';
 try{
  const writer=createWriteStream(temporary,{flags:'wx',mode:0o600});writer.write(header);
  await pipeline(createReadStream(input),cipher,writer);
  appendFileSync(temporary,cipher.getAuthTag());
  renameSync(temporary,output);
 }catch(error){rmSync(temporary,{force:true});throw error;}
}
export async function decryptFile(input,output,password){
 archiveKey(password);
 const size=statSync(input).size;if(size<headerSize+16)throw Error('Archive chiffrée invalide.');
 const descriptor=openSync(input,'r'),header=Buffer.alloc(headerSize),tag=Buffer.alloc(16);
 try{readSync(descriptor,header,0,header.length,0);readSync(descriptor,tag,0,16,size-16);}finally{closeSync(descriptor);}
 if(!header.subarray(0,magic.length).equals(magic))throw Error('Format d’archive chiffrée inconnu.');
 const salt=header.subarray(magic.length,magic.length+16),iv=header.subarray(magic.length+16);
 const decipher=createDecipheriv('aes-256-gcm',derive(password,salt),iv);decipher.setAAD(header);decipher.setAuthTag(tag);
 const temporary=output+'.partial';
 try{
  await pipeline(createReadStream(input,{start:headerSize,end:size-17}),decipher,createWriteStream(temporary,{flags:'wx',mode:0o600}));
  renameSync(temporary,output);
 }catch{rmSync(temporary,{force:true});throw Error('Archive non déchiffrée : clé incorrecte ou fichier modifié.');}
}
function tar(args){
 const result=spawnSync('tar',args,{encoding:'utf8',maxBuffer:16*1024*1024});
 if(result.status!==0)throw Error('Compression ou extraction de l’archive en échec.');
 return result.stdout;
}
export async function packArchive(source,output,password){
 archiveKey(password);mkdirSync(dirname(output),{recursive:true,mode:0o700});
 const compressed=output+'.tar.gz';
 try{tar(['-czf',compressed,'-C',source,'.']);await encryptFile(compressed,output,password);}finally{rmSync(compressed,{force:true});}
}
export async function unpackArchive(input,output,password){
 archiveKey(password);mkdirSync(dirname(output),{recursive:true,mode:0o700});mkdirSync(output,{recursive:false,mode:0o700});
 const compressed=join(output,'.decrypted.tar.gz');
 try{
  await decryptFile(input,compressed,password);
  const names=tar(['-tzf',compressed]).split('\n').filter(Boolean);
  if(names.some(name=>name.startsWith('/')||name.split('/').includes('..')))throw Error('Chemin hors archive refusé.');
  if(tar(['-tvzf',compressed]).split('\n').filter(Boolean).some(line=>!['-','d'].includes(line[0])))throw Error('Liens et fichiers spéciaux refusés dans l’archive.');
  tar(['-xzf',compressed,'--no-same-owner','-C',output]);
 }catch(error){rmSync(output,{recursive:true,force:true});throw error;}finally{rmSync(compressed,{force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const args=process.argv.slice(2),known=['--action','--source','--file','--out'];
  for(let i=0;i<args.length;i+=2)if(!known.includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error('Arguments d’archivage invalides.');
  const get=key=>args.includes(key)?args[args.indexOf(key)+1]:undefined,action=get('--action'),password=process.env.PRODUCTION_ARCHIVE_PASSWORD;
  archiveKey(password);
  if(action==='encrypt'&&get('--source')&&get('--out'))await packArchive(resolve(get('--source')),resolve(get('--out')),password);
  else if(action==='decrypt'&&get('--file')&&get('--out'))await unpackArchive(resolve(get('--file')),resolve(get('--out')),password);
  else if(action!=='check-key')throw Error('Action d’archivage invalide.');
  console.log(action==='check-key'?'Clé d’archivage configurée.':'Archive traitée sans publication de contenu en clair.');
 }catch(error){console.error(error.message);process.exitCode=1;}
}
