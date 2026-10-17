import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Row } from './domain';

// PDF is generated from the same live variants used by checkout, never price_label.
export async function cataloguePdf(cat: {products: Row[]; variants: Row[]; options: Row[]}, stamp = new Date()) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const wine = rgb(.35,.07,.12), grey = rgb(.32,.3,.29);
  let page: ReturnType<typeof pdf.addPage>, y=0, number=0;
  const clean = (value: unknown) => String(value ?? '').replace(/\[\/?(?:bordeaux|or)\]/gi,'').replace(/\*\*/g,'').replace(/[^\x20-\x7e\xa0-\xff€œŒ’–—\n]/g,' ').replace(/[’]/g,"'").replace(/[–—]/g,'-');
  function newPage() {
    page=pdf.addPage([595.28,841.89]);number++;
    page.drawRectangle({x:0,y:760,width:596,height:82,color:wine});
    page.drawText('FC ESCALQUENS | LA BOUTIQUE',{x:42,y:800,size:17,font:bold,color:rgb(1,1,1)});
    page.drawText(`Catalogue du ${stamp.toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'})}`,{x:42,y:779,size:10,font:regular,color:rgb(1,.85,.3)});
    page.drawText(`fcescalquens.fr/boutique/  |  Page ${number}`,{x:42,y:28,size:9,font:regular,color:grey});y=735;
  }
  function line(value: unknown, size=11, strong=false) {
    const font=strong?bold:regular;
    for(const paragraph of clean(value).split('\n')) {
      let text='';
      const flush=()=>{if(y<62)newPage();page.drawText(text,{x:42,y,size,font,color:strong?wine:grey});y-=size+6;};
      // Split long words too, so admin-provided text cannot overflow the page.
      for(const char of paragraph) {if(font.widthOfTextAtSize(text+char,size)>510){flush();text='';} text+=char;}
      flush();
    }
  }
  newPage();line('La collection du club',21,true);
  line('Prix en euros, hors options. Remise gratuite par le coach ou au club.');
  line('Catalogue indicatif : disponibilité et tarifs confirmés sur le site avant paiement.');
  if(!cat.products.length)line('La sélection arrive bientôt.');
  for(const p of cat.products) {
    if(y<200)newPage();y-=12;line(p.name,16,true);
    line(p.description || p.short_description || '');
    const variants=cat.variants.filter(v=>v.product_id===p.id);
    if(!variants.length)line('Article présenté au catalogue - commande pas encore disponible.');
    for(const v of variants)line(`${v.label}${v.color?' - '+v.color:''} : ${(v.price_cents/100).toFixed(2)} €`);
    for(const o of cat.options.filter(o=>o.product_id===p.id))line(`Option ${o.label} : ${o.price_cents?'+ '+(o.price_cents/100).toFixed(2)+' €':'incluse'}${o.requires_text?' (personnalisation)':''}`);
    if(p.delivery_delay)line(`Délai indicatif : ${p.delivery_delay}`);
    y-=10;
  }
  pdf.setTitle('Catalogue boutique - FC Escalquens');pdf.setCreationDate(stamp);
  return pdf.save();
}
