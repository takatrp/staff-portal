import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {inspectImagePdf} from './image-profile.e2e.mjs';
import {installTextInkProbe,inspectTextInk,inspectVectorTextInk} from './text-ink.e2e.mjs';
const names={issuerName:'発行元〈デモ〉𠮷野髙﨑 & Co. "A" <img src=x onerror=alert(1)>',recipientName:"宛先デモ𠮷野髙﨑株式会社 <script>alert(1)</script> 'R&D' 御中"};
function storedZip(bytes){const entries=new Map();let offset=0;while(bytes.readUInt32LE(offset)===0x04034b50){assert.equal(bytes.readUInt16LE(offset+8),0);const size=bytes.readUInt32LE(offset+18),length=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),start=offset+30+length+extra;entries.set(bytes.subarray(offset+30,offset+30+length).toString('utf8'),bytes.subarray(start,start+size));offset=start+size;}return entries;}
async function ready(page){await page.waitForFunction(()=>!document.getElementById('regenerate').disabled&&document.getElementById('previewLoading').hidden);}
async function submit(page){await page.getByRole('button',{name:'この条件で生成',exact:true}).click();await ready(page);}

export async function verifyCompanyNames(page,{outputDir=process.env.COMPANY_OUTPUT_DIR}={}){
 if(outputDir)await mkdir(outputDir,{recursive:true});
 await page.evaluate(()=>{const original=VoucherPDF.voucher,create=URL.createObjectURL.bind(URL);window.__companyNames={current:null,blobs:new Map()};URL.createObjectURL=blob=>{const url=create(blob);window.__companyNames.blobs.set(url,blob);return url;};VoucherPDF.voucher=async doc=>{window.__companyNames.current=structuredClone(doc);return original(doc);};window.__companyNames.restore=()=>{VoucherPDF.voucher=original;URL.createObjectURL=create;};});
 const records=[];
 try{
  await page.setViewportSize({width:1440,height:1100});
  await page.locator('#invoiceCount').fill('1');await page.locator('#receiptCount').fill('1');await page.locator('#receiptStyle').selectOption('normal');await page.locator('#pdfMode').selectOption('image');
  for(const [key,value] of Object.entries(names))await page.locator('#'+key).fill(value);
  await submit(page);
  assert.equal(await page.locator('#documentList .doc-info strong').first().textContent(),names.issuerName);
  assert.equal(await page.locator('#documentList img, #documentList script').count(),0,'names are text nodes');
  assert.equal(await page.evaluate(()=>window.__companyNames.current.buyer),names.recipientName);
  for(const mode of ['both','company','amount']){
   await page.locator('#randomMode').selectOption(mode);await page.locator('#regenerate').click();await ready(page);
   const d=await page.evaluate(()=>window.__companyNames.current);assert.equal(d.merchant.name,names.issuerName);assert.equal(d.buyer,names.recipientName);
  }
  const previewBytes=Buffer.from(await page.evaluate(async()=>Array.from(new Uint8Array(await window.__companyNames.blobs.get(document.getElementById('pdfPreview').href).arrayBuffer()))));
  const waitPdf=page.waitForEvent('download');await page.locator('#downloadPdf').click();assert.deepEqual(await readFile(await(await waitPdf).path()),previewBytes,'download is the displayed PDF');
  const waitZip=page.waitForEvent('download');await page.locator('#downloadZip').click();const entries=storedZip(await readFile(await(await waitZip).path()));await ready(page);
  const config=JSON.parse(entries.get('02_照合用_投入禁止/生成条件.json').toString('utf8')),batch=JSON.parse(entries.get('02_照合用_投入禁止/全明細.json').toString('utf8'));
  for(const key of Object.keys(names))assert.equal(config[key],names[key]);
  assert.deepEqual(entries.get('01_投入用/'+batch.documents[0].filename),previewBytes,'ZIP preserves preview PDF');
  await page.locator('#issuerName').fill('');await page.locator('#recipientName').fill('');await submit(page);assert.notEqual(await page.evaluate(()=>window.__companyNames.current.merchant.name),names.issuerName);
  await page.locator('#importConfig').setInputFiles({name:'company-settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))});await ready(page);
  for(const key of Object.keys(names))assert.equal(await page.locator('#'+key).inputValue(),names[key]);
  assert.equal(await page.evaluate(()=>window.__companyNames.current.merchant.name),names.issuerName);
  for(const preset of ['handwritten','mixed','receipts','standard']){await page.locator('[data-preset="'+preset+'"]').click();await ready(page);for(const key of Object.keys(names))assert.equal(await page.locator('#'+key).inputValue(),names[key]);}
  if(outputDir)await page.screenshot({path:outputDir+'/ui-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'company fields fit mobile width');
  for(const key of Object.keys(names)){const box=await page.locator('#'+key).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);}
  if(outputDir)await page.screenshot({path:outputDir+'/ui-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1100});
  await installTextInkProbe(page);
  const ids=await page.evaluate(names=>{
   const config={startDate:'2026-10-01',endDate:'2026-10-01',seed:'custom-company-layout',taxMix:'mixed',pdfMode:'image',issuerName:('長い発行元株式会社'+ '日本語の研修用架空会社'.repeat(12)).slice(0,120),recipientName:('長い宛先株式会社'+'日本語の請求先デモ'.repeat(14)).slice(0,120)},cases=[];
   for(const d of VoucherCore.generate(config).documents)cases.push({id:d.type+'-'+d.template+'-long',doc:d});
   for(const handwriting of ['neat','natural','uneven','scrawl'])for(const d of VoucherCore.generate({...config,invoiceCount:0,receiptCount:3,receiptStyle:'handwritten',handwriting}).documents)cases.push({id:'handwritten-'+d.template+'-'+handwriting+'-long',doc:d});
   for(const pdfMode of ['image','text']){
    const docs=VoucherCore.generate({...config,...names,pdfMode}).documents;
    cases.push({id:'invoice-symbols-'+pdfMode,doc:docs.find(d=>d.type==='invoice'&&d.template===2)});
    cases.push({id:'receipt-symbols-'+pdfMode,doc:docs.find(d=>d.type==='receipt'&&d.template===3)});
    cases.push({id:'handwritten-symbols-'+pdfMode,doc:VoucherCore.generate({...config,...names,pdfMode,invoiceCount:0,receiptCount:3,receiptStyle:'handwritten',handwriting:'scrawl'}).documents[0]});
   }
   window.__companyCases=cases;return cases.map(c=>c.id);
  },names);
  assert.equal(ids.length,38);assert.equal(new Set(ids).size,38);
  for(const [index,id] of ids.entries()){
   const result=await page.evaluate(async index=>{
    const {doc}=window.__companyCases[index],raster=VoucherArtwork.raster;let probe,layout;
    VoucherArtwork.raster=async page=>{
     const png=await raster(page);probe=window.__sampleTextInk(page,doc);const commands=page._demoPaint.filter(c=>c.op==='text'),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
     const boxes=commands.map(c=>{ctx.fontKerning='none';ctx.font=c.size+'px "'+c.family+'"';const m=ctx.measureText(c.text),angle=-c.rotation*Math.PI/180,points=[[-m.actualBoundingBoxLeft,-m.actualBoundingBoxAscent],[m.actualBoundingBoxRight,-m.actualBoundingBoxAscent],[-m.actualBoundingBoxLeft,m.actualBoundingBoxDescent],[m.actualBoundingBoxRight,m.actualBoundingBoxDescent]].map(([x,y])=>[c.x+x*Math.cos(angle)-y*Math.sin(angle),c.baseline+x*Math.sin(angle)+y*Math.cos(angle)]);return{text:c.text,x:Math.min(...points.map(p=>p[0])),right:Math.max(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),bottom:Math.max(...points.map(p=>p[1]))};});
     if(boxes.some(b=>b.x< -2||b.right>page.getWidth()+2||b.top< -2||b.bottom>page.getHeight()+2))throw Error('Text outside voucher page');
     if(doc.type==='receipt'&&doc.receiptStyle!=='handwritten'&&commands.some(c=>c.text.includes('宛先')))throw Error('Recipient added to receipt without recipient field');
     const source=doc.merchant.name;const merchant=boxes.filter(b=>b.text===source||(b.text.endsWith('…')&&source.startsWith(b.text.slice(0,-1))));if(!merchant.length)throw Error('Custom issuer absent');
     if(doc.type==='invoice'&&!commands.some(c=>c.text===doc.buyer||(c.text.endsWith('…')&&doc.buyer.startsWith(c.text.slice(0,-1)))))throw Error('Custom recipient absent');
     if(doc.receiptStyle==='handwritten'){const buyer=boxes.filter(b=>b.top>=97&&b.top<130&&b.x<550&&b.bottom>100&&b.text!=='宛名');if(!buyer.length||buyer.some(b=>b.right>522))throw Error('Handwritten recipient overflow');if(doc.buyer.includes('𠮷')&&doc.handwriting==='scrawl'&&!commands.some(c=>c.text==='𠮷'&&c.family==='DemoNotoJP'))throw Error('Missing rare-glyph font fallback');}
     layout={pageWidth:page.getWidth(),pageHeight:page.getHeight(),merchant:merchant.map(b=>({text:b.text,x:b.x,right:b.right})),recipientShown:doc.type==='invoice'||doc.receiptStyle==='handwritten',textCommands:commands.length};return png;
    };
    let bytes,png;try{bytes=await VoucherPDF.voucher(doc);png=await VoucherPDF.previewFor(bytes);}finally{VoucherArtwork.raster=raster;}
    const image=new Image();image.src=png;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d',{alpha:false,colorSpace:'srgb'});ctx.drawImage(image,0,0);const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data,rgb=new Uint8Array(image.width*image.height*3);for(let i=0,j=0;i<rgba.length;i+=4){if(rgba[i+3]!==255)throw Error('Transparent output');rgb[j++]=rgba[i];rgb[j++]=rgba[i+1];rgb[j++]=rgba[i+2];}const digest=await crypto.subtle.digest('SHA-256',rgb);
    return{bytes:Array.from(bytes),png,probe,layout,pdfMode:doc.pdfMode,pixelHash:Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')};
   },index);
   const bytes=Buffer.from(result.bytes),info=result.pdfMode==='image'?await inspectImagePdf(bytes,{pixelHash:result.pixelHash}):{vectorText:await inspectVectorTextInk(bytes)};
   const ink=result.pdfMode==='image'?await inspectTextInk(bytes,result.probe):null;records.push({id,pdfMode:result.pdfMode,...info,ink,layout:result.layout});
   if(outputDir){await writeFile(outputDir+'/'+id+'.pdf',bytes);await writeFile(outputDir+'/'+id+'.png',Buffer.from(result.png.split(',')[1],'base64'));}
  }
  const {issuerName,recipientName,...legacy}=config;await page.locator('#importConfig').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await ready(page);
  assert.equal(await page.locator('#issuerName').inputValue(),'');assert.equal(await page.locator('#recipientName').inputValue(),'');
  await page.locator('[data-preset="standard"]').click();await ready(page);
  if(outputDir)await writeFile(outputDir+'/measurements.json',JSON.stringify(records,null,2));
  return{cases:records.length,imagePdfs:records.filter(r=>r.pdfMode==='image').length,textPdfs:records.filter(r=>r.pdfMode==='text').length,blackCorePixels:records.reduce((n,r)=>n+(r.ink?.corePixels||0),0),uiLiteralText:true,noHtmlInjection:true,previewDownloadZipIdentical:true,jsonAndLegacyImport:true,presetsAndRandomModesPreserveNames:true,mobileWidth:390,recipientAbsentFromNormalReceipts:true};
 }finally{await page.evaluate(()=>window.__companyNames.restore());}
}
