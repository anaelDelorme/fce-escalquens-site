import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {archiveKey,encryptFile,decryptFile,packArchive,unpackArchive} from '../scripts/production-archive.mjs';
import {legacyPreparationArtifacts} from '../scripts/cleanup-preparation-artifacts.mjs';

const password='test-archive-key-'.repeat(4);
test('archives : chiffrement authentifié, clé absente refusée et aucun contenu client lisible',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'fce-archive-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const input=join(folder,'input'),output=join(folder,'archive.fce'),decoded=join(folder,'decoded');
 const content='Données privées client@example.org\n'.repeat(100000);writeFileSync(input,content);
 assert.throws(()=>archiveKey(undefined),/PRODUCTION_ARCHIVE_PASSWORD absent/);
 assert.throws(()=>archiveKey(''),/PRODUCTION_ARCHIVE_PASSWORD absent/);
 assert.throws(()=>archiveKey('trop-court'),/PRODUCTION_ARCHIVE_PASSWORD trop court/);
 await encryptFile(input,output,password);assert.equal(readFileSync(output).includes(Buffer.from('client@example.org')),false);
 await decryptFile(output,decoded,password);assert.equal(readFileSync(decoded,'utf8'),content);
 const different=join(folder,'different.fce');await encryptFile(input,different,password);assert.notDeepEqual(readFileSync(output),readFileSync(different));
});
test('archives : mauvaise clé et altération refusées, aucun fichier déchiffré partiel conservé',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'fce-archive-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const input=join(folder,'input'),encrypted=join(folder,'archive.fce'),output=join(folder,'decoded');writeFileSync(input,'confidentiel');
 await encryptFile(input,encrypted,password);
 await assert.rejects(()=>decryptFile(encrypted,output,'wrong-key-'.repeat(8)),/clé incorrecte/);assert.equal(existsSync(output),false);assert.equal(existsSync(output+'.partial'),false);
 const bytes=readFileSync(encrypted);bytes[bytes.length-17]^=1;writeFileSync(encrypted,bytes);
 await assert.rejects(()=>decryptFile(encrypted,output,password),/fichier modifié/);assert.equal(existsSync(output),false);
});
test('archives : sauvegarde compressée restaurée avec ses sous-dossiers, liens refusés',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'fce-archive-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const source=join(folder,'source'),encrypted=join(folder,'archive.fce'),output=join(folder,'restored');mkdirSync(join(source,'media'),{recursive:true});
 writeFileSync(join(source,'DB.sql'),'-- sauvegarde réelle');writeFileSync(join(source,'media/photo.bin'),'image');
 await packArchive(source,encrypted,password);await unpackArchive(encrypted,output,password);
 assert.equal(readFileSync(join(output,'DB.sql'),'utf8'),'-- sauvegarde réelle');assert.equal(readFileSync(join(output,'media/photo.bin'),'utf8'),'image');
 assert.equal(existsSync(encrypted+'.tar.gz'),false);assert.equal(existsSync(join(output,'.decrypted.tar.gz')),false);
 symlinkSync('/etc/passwd',join(source,'link'));const bad=join(folder,'link.fce');await packArchive(source,bad,password);
 const rejected=join(folder,'rejected');await assert.rejects(()=>unpackArchive(bad,rejected,password),/Liens/);assert.equal(existsSync(rejected),false);
});
test('archives : nettoyage limité aux anciennes préparations de cette branche, aucune nouvelle archive ou sauvegarde',()=>{
 const item=(id:number,name:string,branch:string,run:number)=>({id,name,workflow_run:{id:run,head_branch:branch}});
 assert.deepEqual(legacyPreparationArtifacts([
  item(1,'preparation-production-41802970302','release/boutique-tournois-production',41802970302),
  item(2,'preparation-production-41802970303','release/boutique-tournois-production',41802970303),
  item(3,'sauvegarde-production-1','release/boutique-tournois-production',1),
  item(4,'preparation-production-1','main',1),
 ]),[1]);
});
