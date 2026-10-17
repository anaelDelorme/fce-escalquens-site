import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const quote = value => value == null ? 'NULL' : typeof value === 'number' ? String(value) : "'"+String(value).replaceAll("'","''")+"'";
const fields = {
  shop_categories: ['slug','name','description','display_order','active'],
  shop_products: ['slug','name','short_description','description','price_label','price_details','sizes','options','image_key','featured','highlighted','active','display_order','delivery_delay'],
};
export function buildImport(categories, products, imageMap = new Map()) {
  const categorySlugs=new Map(categories.map(c=>[c.id,c.slug]));
  const rows=[];
  for(const [table, data] of [['shop_categories',categories],['shop_products',products]]) {
    for(const source of data) {
      if(!source.slug || !source.name)throw new Error('Article ou catégorie sans slug/nom : import interrompu.');
      const columns=fields[table].filter(k=>Object.hasOwn(source,k));
      const values=columns.map(k=>quote(k==='image_key'?(imageMap.get(source[k])??source[k]):source[k]));
      if(table==='shop_products') {
        columns.push('shop_category_id');
        const slug=categorySlugs.get(source.shop_category_id);
        values.push(slug?`(SELECT id FROM shop_categories WHERE slug=${quote(slug)})`:'NULL');
      }
      rows.push(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${values.join(',')}) ON CONFLICT(slug) DO UPDATE SET ${columns.filter(k=>k!=='slug').map(k=>`${k}=excluded.${k}`).join(',')};`);
    }
  }
  return rows.join('\n')+'\n';
}
function run(args, json=false) {
  const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{encoding:'utf8',maxBuffer:32*1024*1024,stdio:json?'pipe':'inherit'});
  if(result.status!==0)throw new Error(`Wrangler a échoué (${args.slice(0,3).join(' ')}). Import interrompu.`);
  if(json)return JSON.parse(result.stdout);
}
function main() {
  const args=process.argv.slice(2);
  if(args.some(a=>a!=='--apply'))throw new Error('Usage : node scripts/import-shop-prod-to-staging.mjs [--apply]');
  const apply=args.includes('--apply'), config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
  const prod=config.d1_databases.find(d=>d.binding==='DB'),staging=config.env.staging.d1_databases.find(d=>d.binding==='DB');
  const prodBucket=config.r2_buckets.find(d=>d.binding==='MEDIA').bucket_name,stagingBucket=config.env.staging.r2_buckets.find(d=>d.binding==='MEDIA').bucket_name;
  if(!prod?.database_id||!staging?.database_id||prod.database_id===staging.database_id||prodBucket===stagingBucket)throw new Error('Les bases et les espaces média prod/staging doivent être distincts.');
  const query=table=>run(['d1','execute',prod.database_name,'--remote','--command',`SELECT * FROM ${table} ORDER BY id`,'--json'],true)[0].results;
  const categories=query('shop_categories'),products=query('shop_products');
  const folder=resolve('backups',`boutique-${new Date().toISOString().replace(/[:.]/g,'-')}`);mkdirSync(folder,{recursive:true});
  writeFileSync(join(folder,'source.json'),JSON.stringify({categories,products},null,2));
  console.log(`${categories.length} catégorie(s), ${products.length} article(s). Correspondance par slug : les identifiants staging et leurs variantes sont conservés. Les articles propres au staging restent présents.`);
  if(!apply){writeFileSync(join(folder,'apercu.sql'),buildImport(categories,products));console.log(`Aucune écriture distante. Aperçu : ${folder}. Relancez avec --apply pour importer.`);return;}
  run(['d1','export',staging.database_name,'--remote','--env','staging','--output',join(folder,'site-staging-avant.sql')]);
  const images=new Map();
  for(const key of new Set(products.map(p=>p.image_key).filter(Boolean))) {
    const destination=`imports/${folder.split('/').pop()}/${key}`;
    const file=join(folder,'image-temp');
    run(['r2','object','get',`${prodBucket}/${key}`,'--remote','--file',file]);
    const mime=spawnSync('file',['-b','--mime-type',file],{encoding:'utf8'});
    if(mime.status!==0)throw new Error('La commande file est nécessaire pour vérifier les images.');
    run(['r2','object','put',`${stagingBucket}/${destination}`,'--remote','--file',file,'--content-type',mime.stdout.trim(),'--force']);
    images.set(key,destination);
  }
  const sql=join(folder,'import.sql');writeFileSync(sql,buildImport(categories,products,images));
  run(['d1','execute',staging.database_name,'--remote','--env','staging','--file',sql,'--yes']);
  console.log(`Import terminé. Sauvegarde : ${folder}. Vérifiez les prix par taille et les options dans /admin-boutique/. Aucune écriture en production ni dans ORDERS.`);
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)main();
