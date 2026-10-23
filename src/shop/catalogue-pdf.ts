import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Row } from './domain';
export type Catalogue = {products: Row[]; variants: Row[]; options: Row[]; categories?: Row[]};
export type CatalogueImages = {logo?: Uint8Array; products?: Map<string,Uint8Array>};
export const catalogueText = (value: unknown) => String(value??'').replace(/\[\/?(?:bordeaux|or)\]/gi,'').replace(/\*+/g,'').replace(/[’‘]/g,"'").replace(/[–—]/g,'-').replace(/[^\x20-\x7e\xa0-\xff€œŒ\n]/g,' ').replace(/\s*\|\s*/g,' · ');

export async function cataloguePdf(cat: Catalogue, stamp = new Date(), images: CatalogueImages = {}) {
  const pdf=await PDFDocument.create(), font=await pdf.embedFont(StandardFonts.Helvetica), bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const wine=rgb(.35,.07,.11), red=rgb(.62,.10,.10), gold=rgb(.95,.77,0), paper=rgb(.97,.95,.92), ink=rgb(.16,.12,.12), muted=rgb(.43,.39,.37);
  const logo=images.logo?await pdf.embedPng(images.logo):null;
  const embedded=new Map<string,PDFImage>();
  for(const [key,bytes] of images.products||[])try{embedded.set(key,await pdf.embedPng(bytes));}catch{}
  const money=(n:number)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n/100).replace(/\u202f/g,' ');
  const wrap=(value:unknown,width:number,size:number,f:PDFFont=font)=>{
    const lines:string[]=[];
    for(const paragraph of catalogueText(value).split('\n')){
      let line='';for(const word of paragraph.split(/\s+/).filter(Boolean)){
        if(f.widthOfTextAtSize(line+(line?' ':'')+word,size)<=width){line+=(line?' ':'')+word;continue;}
        if(line)lines.push(line);line='';
        for(const ch of word){if(f.widthOfTextAtSize(line+ch,size)>width){lines.push(line);line='';}line+=ch;}
      }if(line)lines.push(line);
    }return lines;
  };
  function text(page:PDFPage,value:unknown,x:number,top:number,width:number,size=10,f=font,color=ink,max=100){
    const lines=wrap(value,width,size,f),used=lines.slice(0,max);if(lines.length>max && used.length){let last=used[max-1];while(f.widthOfTextAtSize(last+'...',size)>width)last=last.slice(0,-1);used[max-1]=last+'...';}
    for(let i=0;i<used.length;i++)page.drawText(used[i],{x,y:top-i*(size*1.38),size,font:f,color});
    return used.length*size*1.38;
  }
  function contain(page:PDFPage,image:PDFImage,x:number,y:number,w:number,h:number){const scale=Math.min(w/image.width,h/image.height);page.drawImage(image,{x:x+(w-image.width*scale)/2,y:y+(h-image.height*scale)/2,width:image.width*scale,height:image.height*scale});}
  const date=stamp.toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'});
  const pages:PDFPage[]=[];
  const createPage=()=>{const p=pdf.addPage([595.28,841.89]);pages.push(p);p.drawRectangle({x:0,y:0,width:596,height:842,color:paper});return p;};
  function masthead(p:PDFPage,category:string){
    p.drawRectangle({x:0,y:746,width:596,height:96,color:wine});p.drawRectangle({x:0,y:740,width:596,height:6,color:gold});
    if(logo)contain(p,logo,30,762,64,64);
    text(p,'FC ESCALQUENS',108,803,450,17,bold,rgb(1,1,1));text(p,'LA BOUTIQUE DU CLUB',108,780,440,9,bold,gold);
    text(p,category,32,715,430,18,bold,wine);text(p,date,470,715,92,9,font,muted);
  }
  const categories=cat.categories||[], groups=new Map<string,Row[]>();
  for(const p of cat.products){const category=categories.find(c=>c.id===p.shop_category_id)?.name||'La sélection du club';if(!groups.has(category))groups.set(category,[]);groups.get(category)!.push(p);}
  if(!groups.size){const p=createPage();masthead(p,'La collection arrive bientôt');text(p,'Retrouvez prochainement les équipements du club sur notre boutique.',32,650,510,14);}
  let productNumber=0;
  const ordered=[...categories.map(c=>String(c.name)),...groups.keys()].filter((key,index,all)=>all.indexOf(key)===index).flatMap(category=>(groups.get(category)||[]).map(p=>({p,category})));
  for(let index=0;index<ordered.length;index+=2){
    const page=createPage();masthead(page,ordered[index].category===ordered[index+1]?.category?ordered[index].category:'La collection du club');
    for(let slot=0;slot<2;slot++){
      if(!ordered[index+slot]){
        page.drawRectangle({x:28,y:86,width:539,height:288,color:wine});
        if(logo)contain(page,logo,54,255,92,92);
        text(page,'Prêts pour la prochaine rencontre ?',164,326,365,20,bold,rgb(1,1,1),2);
        text(page,'Votre équipement se choisit sur la boutique du club.',164,265,360,12,font,rgb(1,1,1),2);
        text(page,'01  Choisissez vos tailles et vos personnalisations.\n02  Réglez votre commande avec HelloAsso.\n03  Récupérez-la auprès du coach ou au club.',54,205,460,12,font,rgb(1,1,1),6);
        text(page,'fcescalquens.fr/boutique/',54,113,480,17,bold,gold,1);
        continue;
      }
      const category=ordered[index+slot].category;
        const p=ordered[index+slot].p, top=slot===0?682:374, bottom=top-288;productNumber++;
        page.drawRectangle({x:28,y:bottom,width:539,height:288,color:rgb(1,1,1)});
        const image=embedded.get(String(p.id)), imageX=40,imageY=bottom+55;
        page.drawRectangle({x:imageX,y:imageY,width:188,height:211,color:paper});
        if(image)contain(page,image,imageX+8,imageY+8,172,195);else if(logo){contain(page,logo,imageX+40,imageY+52,108,108);text(page,"Visuel à venir",imageX+35,imageY+25,140,9,font,muted,1);}
        text(page,`${String(productNumber).padStart(2,'0')} / ${category}`,244,top-18,300,8,bold,red,1);
        let y=top-40;y-=text(page,p.name,244,y,304,17,bold,wine,2)+7;
        const variants=cat.variants.filter(v=>v.product_id===p.id),options=cat.options.filter(o=>o.product_id===p.id);
        if(variants.length){const prices=variants.map(v=>v.price_cents),min=Math.min(...prices);y-=text(page,'Tarif FCE : '+(new Set(prices).size>1?'De '+money(min)+' à '+money(Math.max(...prices)):money(min)),244,y,300,15,bold,red,2)+7;}
        else if(p.price_label){y-=text(page,p.price_label,244,y,300,12,bold,red,1)+7;}
        y-=text(page,p.short_description||p.description,244,y,300,10,font,ink,3)+9;
        // Group sizes sharing a price to keep a full size range readable without a long table.
        const prices=new Map<string,{price:number;reference:number;labels:string[]}>();for(const v of variants){const key=v.price_cents+':'+(v.catalogue_price_cents||'');if(!prices.has(key))prices.set(key,{price:v.price_cents,reference:v.catalogue_price_cents,labels:[]});prices.get(key)!.labels.push(v.label+(v.color?' / '+v.color:''));}
        const detailLines=variants.length?[...prices.values()].map(({price,reference,labels})=>`${labels.join(', ')} : ${money(price)}${reference?' · catalogue '+money(reference):''}`):[p.sizes?`Tailles : ${p.sizes}`:'Tailles à préciser', 'Commande en ligne prochainement'];
        for(const o of options)detailLines.push(`${o.label} : ${o.price_cents?'+ '+money(o.price_cents):'inclus'}`);
        if(p.delivery_delay)detailLines.push(`Délai indicatif : ${p.delivery_delay}`);
        const available=Math.max(1,Math.floor((y-(bottom+32))/12.4));
        const details=wrap(detailLines.join('\n'),300,9);const chosen=details.slice(0,available);
        if(details.length>available)chosen[chosen.length-1]='Tous les choix et détails sur la boutique en ligne.';
        text(page,chosen.join('\n'),244,y,300,9,font,muted,available);
        page.drawRectangle({x:40,y:bottom+14,width:515,height:1,color:paper});
        text(page,'Détails, composition et choix à jour sur fcescalquens.fr/boutique/',42,bottom+5,510,8,font,muted,1);
      }
  }
  pages.forEach((page,index)=>{
    text(page,'Remise gratuite : coach ou rendez-vous au club · Paiement HelloAsso',32,49,530,9,bold,wine,1);
    text(page,'Prix indicatifs hors options. Tarifs et disponibilité confirmés avant paiement.',32,34,465,8,font,muted,1);
    text(page,`${index+1} / ${pages.length}`,520,22,55,8,bold,muted,1);
  });
  pdf.setTitle('Catalogue boutique - FC Escalquens');pdf.setAuthor('FC Escalquens');pdf.setCreationDate(stamp);
  return pdf.save();
}
