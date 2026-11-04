import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { catalogueText } from './catalogue-pdf';
import type { Row } from './domain';
import type { Settings } from './terms';

/** One private supplier document per customer order. No retail price or customer contact details. */
export async function purchaseOrderPdf(order: Row, items: Row[], settings: Pick<Settings,'seller_name'|'seller_address'|'contact_email'|'seller_phone'>, logo: Uint8Array, stamp = new Date()) {
  const pdf=await PDFDocument.create(), font=await pdf.embedFont(StandardFonts.Helvetica), bold=await pdf.embedFont(StandardFonts.HelveticaBold), image=await pdf.embedPng(logo);
  pdf.setTitle(`Bon fournisseur - ${order.reference}`);pdf.setAuthor('FC Escalquens');
  const wine=rgb(.35,.09,.11),gold=rgb(.95,.77,0),ink=rgb(.18,.15,.15),muted=rgb(.43,.39,.36),line=rgb(.88,.85,.82),paper=rgb(.98,.97,.95);
  const width=595.28,height=841.89,margin=38,usable=width-margin*2;
  function wrap(value:unknown,w:number,size=10,f:PDFFont=font){
    const result:string[]=[];
    for(const paragraph of catalogueText(value).split('\n')){
      let current='';
      for(const word of paragraph.split(/\s+/).filter(Boolean)){
        if(f.widthOfTextAtSize(current+(current?' ':'')+word,size)<=w){current+=(current?' ':'')+word;continue;}
        if(current)result.push(current);current='';
        for(const ch of word){if(f.widthOfTextAtSize(current+ch,size)>w){result.push(current);current='';}current+=ch;}
      }
      if(current)result.push(current);
    }
    return result.length?result:['-'];
  }
  const draw=(page:PDFPage,value:unknown,x:number,y:number,size=10,f=font,color=ink)=>page.drawText(catalogueText(value),{x,y,size,font:f,color});
  let page!:PDFPage,y=0,freshTop=0;
  const pages:PDFPage[]=[];
  const columns=[margin,margin+174,margin+239,margin+278];
  function tableHeader(){page.drawRectangle({x:margin,y:y-25,width:usable,height:25,color:paper});['Article','Taille / modèle','Qté','Personnalisation'].forEach((s,i)=>draw(page,s,columns[i]+8,y-16,8,bold,muted));y-=25;}
  function nextPage(){
    page=pdf.addPage([width,height]);pages.push(page);
    page.drawRectangle({x:0,y:height-100,width,height:100,color:wine});page.drawRectangle({x:0,y:height-104,width,height:4,color:gold});
    const scale=Math.min(58/image.width,66/image.height);page.drawImage(image,{x:margin,y:height-81,width:image.width*scale,height:image.height*scale});
    draw(page,'FC ESCALQUENS',114,height-37,12,bold,rgb(1,1,1));draw(page,'BON DE COMMANDE FOURNISSEUR',114,height-61,17,bold,rgb(1,1,1));
    draw(page,order.reference,margin,height-137,15,bold,wine);draw(page,`Émis le ${stamp.toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'})}`,margin,height-155,9,font,muted);
    const name=wrap(`Client : ${order.first_name} ${order.last_name}`,usable-24,12,bold);
    let cy=height-188;for(const text of name){draw(page,text,margin+12,cy,12,bold);cy-=16;}
    for(const text of wrap([order.licensed_name?`Licencié : ${order.licensed_name}`:'',order.team?`Équipe : ${order.team}`:''].filter(Boolean).join(' - '),usable-24,9)){draw(page,text,margin+12,cy,9,font,muted);cy-=13;}
    page.drawLine({start:{x:margin,y:cy-5},end:{x:width-margin,y:cy-5},color:line,thickness:1});y=cy-27;
    const club=[settings.seller_name,settings.contact_email,settings.seller_phone].filter(Boolean).join(' - ');
    for(const text of wrap(club,usable,9)){draw(page,text,margin,y,9,font,muted);y-=13;}
    y-=18;tableHeader();freshTop=y;
  }
  nextPage();
  let supplier='';
  for(const item of items){
    const group=String(item.supplier||'Fournisseur à préciser');
    const options=typeof item.options_json==='string'?JSON.parse(item.options_json):item.options||[];
    const cells=[wrap(item.name,158),wrap(item.size||'Unique',49,9),[String(item.quantity)],wrap(options.length?options.map((o:Row)=>`${o.label}${o.text?' : '+o.text:''}`).join('\n'):'Aucune',usable-294,9)];
    const count=Math.max(...cells.map(c=>c.length));let offset=0;
    const fullHeight=count*14+18;
    if(y<140||(fullHeight>y-100&&fullHeight<=freshTop-100)){nextPage();supplier='';}
    if(group!==supplier){y-=20;for(const label of wrap(group,usable-16,11,bold)){draw(page,label,margin+8,y,11,bold,wine);y-=14;}y-=2;supplier=group;}

    while(offset<count){
      if(y<105){nextPage();y-=20;for(const label of wrap(`${supplier} - suite`,usable-16,11,bold)){draw(page,label,margin+8,y,11,bold,wine);y-=14;}y-=2;}
      const take=Math.min(count-offset,Math.max(1,Math.floor((y-82)/14))),rowHeight=take*14+18;
      if(offset>0)draw(page,'Suite de l’article',columns[0]+8,y-10,7,font,muted);
      for(let col=0;col<cells.length;col++)for(let n=0;n<take;n++){const text=cells[col][offset+n];if(text)draw(page,text,columns[col]+8,y-18-n*14,col===0?10:9,col===2?bold:font);}
      y-=rowHeight;page.drawLine({start:{x:margin,y},end:{x:width-margin,y},thickness:.6,color:line});offset+=take;
    }
  }
  pages.forEach((p,i)=>{p.drawLine({start:{x:margin,y:49},end:{x:width-margin,y:49},color:line,thickness:.5});draw(p,'Une commande client - document de préparation fournisseur',margin,34,8,font,muted);draw(p,`${i+1} / ${pages.length}`,width-margin-35,34,8,font,muted);});
  return pdf.save();
}
