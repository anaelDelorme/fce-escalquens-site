import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { cataloguePdf } from '../src/shop/catalogue-pdf';
// @ts-ignore plain Node CLI helper, also tested using SQLite below.
import { buildImport } from '../scripts/import-shop-prod-to-staging.mjs';
import { TestDatabase } from './d1';
test('catalogue PDF : fichier valide, textes longs et pagination', async () => {
  const bytes=await cataloguePdf({products:Array.from({length:16},(_,i)=>({id:i,name:`Équipement ${i}`,description:'Composition coton. '.repeat(50)})),variants:[{product_id:0,label:'6 ans',price_cents:2000},{product_id:0,label:'M',price_cents:2500}],options:[]});
  const pdf=await PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>3);assert.equal(pdf.getTitle(),'Catalogue boutique - FC Escalquens');
});
test('import catalogue : rapprochement par slug, catégories remappées, tailles staging préservées et SQL échappé', async()=>{
 const db=new TestDatabase();await db.exec("CREATE TABLE shop_categories(id INTEGER PRIMARY KEY,slug TEXT UNIQUE,name TEXT);CREATE TABLE shop_products(id INTEGER PRIMARY KEY,slug TEXT UNIQUE,name TEXT,shop_category_id INTEGER,image_key TEXT);CREATE TABLE variants(product_id INTEGER);INSERT INTO shop_categories VALUES(99,'textile','Ancien');INSERT INTO shop_products VALUES(42,'maillot','Ancien',99,'old');INSERT INTO variants VALUES(42);");
 const sql=buildImport([{id:1,slug:'textile',name:"L'équipement"}],[{id:2,slug:'maillot',name:"Maillot d'été",shop_category_id:1,image_key:'pic.webp'}],new Map([['pic.webp','imports/pic.webp']]));
 for(const statement of sql.trim().split(';').filter(Boolean))await db.prepare(statement).run();
 const row=await db.prepare("SELECT * FROM shop_products WHERE slug='maillot'").first<any>();assert.equal(row.id,42);assert.equal(row.shop_category_id,99);assert.equal(row.name,"Maillot d'été");assert.equal(row.image_key,'imports/pic.webp');assert.equal((await db.prepare('SELECT * FROM variants').first<any>()).product_id,42);db.close();
});
