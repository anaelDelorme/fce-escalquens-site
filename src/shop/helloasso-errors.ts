import {ShopError} from './domain';

const fieldLabels:Record<string,string>={
  first_name:'Prénom du payeur',last_name:'Nom du payeur',email:'E-mail du payeur',
  total_amount:'Montant total',initial_amount:'Montant du premier règlement',item_name:'Libellé de la demande',
  back_url:'Adresse de retour',return_url:'Adresse de confirmation',error_url:'Adresse en cas d’erreur',
  contains_donation:'Nature du règlement',terms:'Échéances',country:'Pays du payeur',date_of_birth:'Date de naissance du payeur',
};
const aliases:Record<string,string>={firstname:'first_name',lastname:'last_name',email:'email',totalamount:'total_amount',initialamount:'initial_amount',itemname:'item_name',backurl:'back_url',returnurl:'return_url',errorurl:'error_url',containsdonation:'contains_donation',terms:'terms',country:'country',dateofbirth:'date_of_birth'};
function field(value:string){const key=value.replace(/^\$\.?/,'').replace(/^payer\.?/i,'').replace(/[^a-z]/gi,'').toLowerCase();return Object.hasOwn(aliases,key)?aliases[key]:undefined;}

/** Keep only known field identifiers. Provider messages and submitted values are never retained. */
export async function rejectedFields(response:Response):Promise<string[]> {
  if(!response.body)return [];
  const parts:Uint8Array[]=[];let size=0,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  try{
    reader=response.body.getReader();
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384){await reader.cancel();return [];}parts.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
    const data=JSON.parse(new TextDecoder().decode(bytes)),found=new Set<string>();let nodes=0;
    const visit=(value:unknown,context=false,depth=0)=>{
      if(depth>6||++nodes>200||!value||typeof value!=='object')return;
      if(Array.isArray(value)){for(const entry of value)visit(entry,context,depth+1);return;}
      for(const [key,entry] of Object.entries(value)){
        const known=field(key);if(context&&known)found.add(known);
        if(['field','fieldname','property','propertyname','path','parameter'].includes(key.toLowerCase())&&typeof entry==='string'){const known=field(entry);if(known)found.add(known);}
        if(['errors','validationerrors','modelstate','invalidparams'].includes(key.toLowerCase()))visit(entry,true,depth+1);
        else if(context&&typeof entry==='object')visit(entry,true,depth+1);
      }
    };
    visit(data);return [...found].sort();
  }catch{return [];}finally{reader?.releaseLock();}
}
export class HelloAssoRejection extends ShopError {
  readonly historyCode:string;
  constructor(status:number,message:string,fields:string[]=[]){
    const safe=[...new Set(fields.filter(value=>Object.hasOwn(fieldLabels,value)))].sort();
    super('HELLOASSO_REJECTED',502,message+(safe.length?` Champ${safe.length>1?'s':''} signalé${safe.length>1?'s':''} : ${safe.map(value=>fieldLabels[value]).join(', ')}.`:''));
    this.historyCode=`HELLOASSO_REJECTED:${status}:${safe.join(',')}`;
  }
}
