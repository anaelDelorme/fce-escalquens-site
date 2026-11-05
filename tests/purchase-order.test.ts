import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument,PDFArray,PDFRawStream,PDFName,PDFDict,decodePDFRawStream} from 'pdf-lib';
import {purchaseOrderPdf,purchaseOrdersPdf} from '../src/shop/purchase-order-pdf';
import {defaultSettings} from '../src/shop/terms';
const logo=new Uint8Array(readFileSync(new URL('../public/logo-fce.png',import.meta.url)));
function content(pdf:PDFDocument){return pdf.getPages().map(page=>{
 const streams=page.node.Contents(),refs=streams instanceof PDFArray?streams.asArray():[streams];
 const data=refs.map(ref=>{const stream=pdf.context.lookup(ref);return stream instanceof PDFRawStream?Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1'):'';}).join('');
 return [...data.matchAll(/<([0-9a-f]+)>/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join('');
}).join('');}
test('bon fournisseur : PDF avec logo et client, sans référence produit, prix de vente ou contact client',async()=>{
 const bytes=await purchaseOrderPdf({reference:'FCE-TEST',first_name:'Anaël',last_name:'Durand',licensed_name:'Léa',team:'U13',email:'prive@example.org',phone:'0612345678'},[{supplier:'Intersport / Kappa',name:'Maillot',size:'M',quantity:2,sku:'REF-SUPPRIMEE',unit_cents:123456789,options_json:JSON.stringify([{label:'Initiales',text:'AD'}])}],defaultSettings,logo);
 assert.equal(Buffer.from(bytes).subarray(0,5).toString(),'%PDF-');const pdf=await PDFDocument.load(bytes),text=content(pdf);
 assert.match(text,/Client : Anaël Durand/);assert.match(text,/Maillot/);assert.match(text,/Initiales : AD/);assert.doesNotMatch(text,/REF-SUPPRIMEE|123456789|prive@example.org|0612345678|Prix d'achat fournisseur/);
 const images=pdf.getPage(0).node.Resources()!.lookup(PDFName.of('XObject'),PDFDict);assert.ok(images.keys().length>0);
});
test('bons fournisseur regroupés : un fichier, nouvelle page par client et tous les articles conservés',async()=>{
 const documents=Array.from({length:3},(_,i)=>({order:{reference:`FCE-GROUPE-${i}`,first_name:'Camille',last_name:`Client-${i}`,email:'prive@example.org',phone:'0612345678'},items:Array.from({length:i===1?45:1},(_,n)=>({name:`Article-${i}-${n}`,supplier:'Intersport',size:'M',quantity:2,unit_cents:999999,options_json:JSON.stringify([{label:'Initiales',text:`FIN-${i}-${n}`}])}))}));
 const pdf=await PDFDocument.load(await purchaseOrdersPdf(documents,defaultSettings,logo)),text=content(pdf);
 assert.ok(pdf.getPageCount()>3);assert.equal(pdf.getTitle(),'Bons fournisseur - 3 commandes');
 for(const document of documents){assert.match(text,new RegExp(document.order.reference));assert.match(text,new RegExp(document.order.last_name));for(const item of document.items){assert.ok(text.includes(item.name));assert.ok(text.includes(JSON.parse(item.options_json)[0].text));}}
 assert.doesNotMatch(text,/prive@example.org|0612345678|999999/);
 const streams=pdf.getPage(0).node.Contents() as PDFArray;
 const firstPage=streams.asArray().map(ref=>Buffer.from(decodePDFRawStream(pdf.context.lookup(ref) as PDFRawStream).decode()).toString('latin1')).join('');
 const firstText=[...firstPage.matchAll(/<([0-9a-f]+)>/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join('');
 assert.match(firstText,/FCE-GROUPE-0/);assert.doesNotMatch(firstText,/FCE-GROUPE-[12]|Client-[12]/);
 for(const page of pdf.getPages())assert.ok(page.node.Resources()!.lookup(PDFName.of('XObject'),PDFDict).keys().length>0);
 await assert.rejects(purchaseOrdersPdf([],defaultSettings,logo),/Aucune commande/);
});
test('bon fournisseur : toutes les lignes et personnalisations longues sont conservées sur plusieurs pages',async()=>{
 const items=Array.from({length:35},(_,i)=>({supplier:'Intersport',name:`Article-${i}`,size:'12 ans',quantity:1,options_json:JSON.stringify([{label:'Texte',text:'X'.repeat(700)+`FIN-${i}`}])}));
 const pdf=await PDFDocument.load(await purchaseOrderPdf({reference:'FCE-LONG',first_name:'Camille',last_name:'Durand'},items,defaultSettings,logo));
 assert.ok(pdf.getPageCount()>1);const text=content(pdf);for(let i=0;i<35;i++){assert.ok(text.includes(`Article-${i}`));assert.ok(text.includes(`FIN-${i}`));}
 for(const page of pdf.getPages())assert.ok(page.node.Resources()!.lookup(PDFName.of('XObject'),PDFDict).keys().length>0);
});
