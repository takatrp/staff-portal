import assert from 'node:assert/strict';
import { inspectImagePdf } from './image-profile.e2e.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {inflateSync} from 'node:zlib';
const require=createRequire(import.meta.url),PDF=require('../vendor/pdf-lib.min.js');
export function storedZip(bytes){const entries=new Map();let at=0;while(bytes.readUInt32LE(at)===0x04034b50){const size=bytes.readUInt32LE(at+18),nameSize=bytes.readUInt16LE(at+26),extra=bytes.readUInt16LE(at+28),start=at+30+nameSize+extra;entries.set(bytes.subarray(at+30,at+30+nameSize).toString('utf8'),bytes.subarray(start,start+size));at=start+size;}return entries;}
export async function inspect(bytes,imageOnly){if(imageOnly)await inspectImagePdf(bytes);const pdf=await PDF.PDFDocument.load(bytes),page=pdf.getPages()[0],resources=page.node.Resources(),fonts=resources.lookupMaybe(PDF.PDFName.of('Font'),PDF.PDFDict),objects=resources.lookupMaybe(PDF.PDFName.of('XObject'),PDF.PDFDict);assert.equal(pdf.getPageCount(),1);if(imageOnly){assert.equal((fonts?new Set(fonts.values().map(v=>v.toString())).size:0)||0,0,'image-only proof has no font resources');assert.equal(objects.keys().length,1);const image=pdf.context.lookup(objects.values()[0],PDF.PDFRawStream);assert.equal(image.dict.get(PDF.PDFName.of('Subtype')).toString(),'/Image');const contents=page.node.Contents(),refs=contents instanceof PDF.PDFArray?contents.asArray():[contents];for(const ref of refs){const stream=pdf.context.lookup(ref,PDF.PDFRawStream),filter=stream.dict.get(PDF.PDFName.of('Filter')),raw=Buffer.from(stream.getContents()),text=(filter?.toString()==='/FlateDecode'?inflateSync(raw):raw).toString('latin1');assert.doesNotMatch(text,/\b(?:BT|ET|Tf|Tj|TJ)\b/,'image PDF contains no text operators');}}else assert.ok(new Set(fonts.values().map(v=>v.toString())).size>=2,'handwriting PDF embeds print and handwriting fonts');return {fonts:(fonts?new Set(fonts.values().map(v=>v.toString())).size:0)||0,images:objects?.keys().length||0};}
export async function verifyHandwriting(page,{outputDir}={}){
 await page.setViewportSize({width:1280,height:1000});
 const ui=await readableUi(page);

 await page.evaluate(()=>{if(!window.__handQa){const original=VoucherPDF.voucher,raster=VoucherArtwork.raster;VoucherArtwork.raster=async page=>{window.__handCommands=structuredClone(page._demoPaint);return raster(page);};window.__handQa={current:null,bytes:null,blobs:new Map()};const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{const url=create(blob);window.__handQa.blobs.set(url,blob);return url;};VoucherPDF.voucher=async d=>{window.__handQa.current=structuredClone(d);const bytes=await original(d);window.__handQa.bytes=bytes;return bytes;};}});
 await page.locator('#invoiceCount').fill('0');await page.locator('#receiptCount').fill('1');
 await page.locator('#receiptStyle').selectOption('handwritten');assert.equal(await page.locator('#handwritingField').isVisible(),true);
 await page.locator('#startDate').fill('2026-10-01');await page.locator('#endDate').fill('2026-10-01');await page.locator('#taxMix').selectOption('mixed');await page.locator('#pricing').selectOption('inclusive');await page.locator('#rounding').selectOption('floor');
 await page.locator('details').evaluate(el=>{el.open=true;});
 const records=[];let referenceItems,referenceTotals;
 async function generate(){await page.getByRole('button',{name:'この条件で生成',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('regenerate').disabled,null,{timeout:90000});assert.equal(await page.locator('#error').isVisible(),false);await page.waitForFunction(()=>document.getElementById('documentImage').complete&&document.getElementById('documentImage').naturalWidth>0);}
 async function download(){const wait=page.waitForEvent('download');await page.locator('#downloadPdf').click();const file=await wait;return readFile(await file.path());}
 if(outputDir)await mkdir(outputDir,{recursive:true});
 for(const style of ['neat','natural','uneven','scrawl'])for(const mode of ['text','image']){
  await page.locator('#handwriting').selectOption(style);await page.locator('#pdfMode').selectOption(mode);await page.locator('#seed').fill('handwriting-qa-2026');await generate();
  const current=await page.evaluate(()=>window.__handQa.current),bytes=await download();assert.equal(current.handwriting,style);assert.equal(current.receiptStyle,'handwritten');assert.equal(current.pdfMode,mode);assert.ok((await page.locator('#previewMeta').innerText()).includes(mode==='image'?'文字層なし':'文字あり'));
  if(!referenceItems){referenceItems=current.items;referenceTotals=current.totals;}assert.deepEqual(current.items,referenceItems);assert.deepEqual(current.totals,referenceTotals);
  const shown=Buffer.from(await page.evaluate(async()=>Array.from(new Uint8Array(await window.__handQa.blobs.get(document.getElementById('pdfPreview').href).arrayBuffer()))));assert.deepEqual(bytes,shown,'handwritten preview link equals saved PDF');
  if(style==='scrawl'){
   const strokes=await page.evaluate(()=>window.__handCommands.filter(c=>c.op==='text'&&c.family==='DemoHandYomogi'));
   assert.ok(Math.max(...strokes.map(c=>Math.abs(c.rotation)))>=5,'rough writing varies individual glyph rotation');
   const amount=strokes.filter(c=>c.baseline>165&&c.baseline<187),date=strokes.filter(c=>c.baseline>80&&c.baseline<99);
   assert.equal(amount.map(c=>c.text).join(''),'￥ '+Number(current.totals.gross).toLocaleString('ja-JP')+' －','rough writing keeps all amount characters');
   const [y,m,d]=current.date.split('-').map(Number);assert.equal(date.map(c=>c.text).join(''),y+' 年 '+m+' 月 '+d+' 日');
   assert.ok(Math.max(...amount.map(c=>c.size))-Math.min(...amount.map(c=>c.size))>3,'individual amount glyph sizes vary');
   assert.ok(Math.max(...amount.map(c=>c.baseline))-Math.min(...amount.map(c=>c.baseline))>2,'amount baselines vary');
   assert.ok(amount.every((c,i)=>i===0||c.x>amount[i-1].x),'amount glyphs remain in their reading order');
  }
  const info=await inspect(bytes,mode==='image');records.push({style,mode,...info,total:current.totals.gross});
  if(outputDir){await writeFile(outputDir+'/'+style+'-'+mode+'.pdf',bytes);const png=await page.locator('#documentImage').getAttribute('src');await writeFile(outputDir+'/'+style+'-'+mode+'.png',Buffer.from(png.split(',')[1],'base64'));await writeFile(outputDir+'/'+style+'-'+mode+'.json',JSON.stringify(current,null,2));}
 }
 // A ZIP uses exactly the proof shown in preview, and keeps references separate.
 const selected=await page.evaluate(()=>window.__handQa.current),saved=await download(),zipWait=page.waitForEvent('download');await page.locator('#downloadZip').click();const zip=await zipWait,entries=storedZip(await readFile(await zip.path()));await page.waitForFunction(()=>!document.getElementById('regenerate').disabled);
 assert.deepEqual(entries.get('01_投入用/'+selected.filename),saved);assert.ok(entries.has('02_照合用_投入禁止/期待値.csv'));assert.ok(entries.has('03_見本_投入禁止/全件見本.pdf'));const config=JSON.parse(entries.get('02_照合用_投入禁止/生成条件.json'));assert.equal(config.handwriting,'scrawl');assert.equal(config.pdfMode,'image');assert.equal(config.receiptStyle,'handwritten');
 // Random generation retains handwriting and output choices, including at phone width.
 await page.setViewportSize({width:390,height:844});await readableUi(page);const before=selected;
 await page.getByRole('button',{name:'ランダム生成',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('regenerate').disabled,null,{timeout:90000});const after=await page.evaluate(()=>window.__handQa.current);assert.equal(after.handwriting,'scrawl');assert.equal(after.pdfMode,'image');assert.equal(after.receiptStyle,'handwritten');assert.notEqual(after.merchant.name,before.merchant.name);assert.notEqual(after.template,before.template);assert.notDeepEqual(after.items,before.items);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#regenerate').scrollIntoViewIfNeeded();const box=await page.locator('#regenerate').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390&&box.height>=44);if(outputDir)await page.screenshot({path:outputDir+'/iphone.png',fullPage:true});
 // Image-only also applies to an ordinary receipt and an A4 invoice.
 await page.locator('#receiptStyle').selectOption('normal');assert.equal(await page.locator('#handwritingField').isVisible(),false);
 for(const type of ['receipt','invoice']){await page.locator('#invoiceCount').fill(type==='invoice'?'1':'0');await page.locator('#receiptCount').fill(type==='receipt'?'1':'0');await generate();const bytes=await download();records.push({type,mode:'image',...await inspect(bytes,true)});if(outputDir)await writeFile(outputDir+'/'+type+'-image.pdf',bytes);}
 return {ui,records,previewPdfZipIdentical:true,handwritingAndImageChoicesPreserved:true,mobileWidth:390};
}
async function readableUi(page){
 const values=await page.evaluate(()=>Object.fromEntries(['label','#invoiceCount','#startDate','#taxMix','.hint','.primary','.secondary','.doc-info strong','.preview-title p','footer'].map(s=>[s,parseFloat(getComputedStyle(document.querySelector(s)).fontSize)])));
 for(const key of ['#invoiceCount','#startDate','#taxMix','.primary'])assert.ok(values[key]>=16,key+' remains readable');
 for(const key of ['label','.secondary','.doc-info strong'])assert.ok(values[key]>=14,key+' remains readable');
 for(const key of ['.hint','.preview-title p','footer'])assert.ok(values[key]>=12,key+' remains readable');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'larger UI text fits the viewport');return values;
}
