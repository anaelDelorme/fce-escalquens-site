import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
const next=()=>new Promise(resolve=>setImmediate(resolve));
function setup(legacy=false){
 const w=new Window({url:'https://example.org/admin/'});
 w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 w.HTMLCanvasElement.prototype.getContext=(()=>({clearRect(){},fillRect(){},drawImage(){}})) as any;
 w.HTMLCanvasElement.prototype.toBlob=function(callback:any){callback(new w.Blob(['webp'],{type:'image/webp'}));};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 (w as any).Image=class{naturalWidth=2400;naturalHeight=1600;onload:any;set src(value:string){queueMicrotask(()=>this.onload());}};
 if(legacy)w.eval('var current="home_slides", editingRow={}, uploaded=null;var upload=async input=>{uploaded=input.files[0];};');
 w.eval(readFileSync(new URL('../public/admin-media.js',import.meta.url),'utf8'));
 const input=w.document.createElement('input');input.type='file';input.dataset.image='1';input.dataset.upload='object_key';w.document.body.append(input);
 const transfer=new w.DataTransfer();transfer.items.add(new w.File(['original'],'photo.png',{type:'image/png'}));input.files=transfer.files;
 return {w,input};
}
test('recadrage partagé : conversion WebP après confirmation, erreur réessayable et annulation sans envoi',async()=>{
 const {w,input}=setup();let attempts=0,file:any;
 const crop=(w as any).installAdminImageCropper({upload:async(i:any)=>{attempts++;if(attempts===1)throw new Error('Réseau interrompu');file=i.files[0];},profile:()=>({width:1600,height:900,label:'Annonce',mode:'cover'})});
 const pending=crop(input);await next();assert.equal(attempts,0);
 const dialog=w.document.querySelector('dialog')!,button=w.document.querySelector<HTMLButtonElement>('#cropper-confirm')!;
 assert.equal(w.document.querySelector('canvas')!.width,1600);assert.equal(w.document.querySelector('canvas')!.height,900);
 button.click();await next();assert.equal(dialog.open,true);assert.match(w.document.querySelector('#cropper-status')!.textContent!,/Réseau interrompu/);
 button.click();await pending;assert.equal(attempts,2);assert.equal(file.type,'image/webp');assert.equal(file.name,'photo-recadree.webp');assert.equal(dialog.open,false);
 const transfer=new w.DataTransfer();transfer.items.add(new w.File(['other'],'other.png',{type:'image/png'}));input.files=transfer.files;
 const canceled=crop(input);await next();dialog.close();await canceled;assert.equal(attempts,2);
 await w.happyDOM.abort();w.close();
});
test('recadrage partagé : administration existante conserve son branchement et ses formats',async()=>{
 const {w,input}=setup(true);const pending=(w as any).upload(input);await next();assert.match(w.document.querySelector('#cropper-format')!.textContent!,/Diaporama/);
 w.document.querySelector<HTMLButtonElement>('#cropper-confirm')!.click();await pending;assert.equal((w as any).uploaded.type,'image/webp');await w.happyDOM.abort();w.close();
});
