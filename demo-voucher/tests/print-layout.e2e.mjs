import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { inspectImagePdf } from './image-profile.e2e.mjs';
const require=createRequire(import.meta.url),PDF=require('../vendor/pdf-lib.min.js');
const ready=page=>page.waitForFunction(()=>!document.getElementById('downloadZip').disabled&&document.getElementById('previewLoading').hidden);
export async function verifyPrintLayout(page,{outputDir}={}){
 await page.evaluate(()=>{window.__printCalls=0;window.print=()=>{window.__printCalls++;};});
 await page.locator('[data-preset="standard"]').click();await ready(page);
 await page.emulateMedia({media:'print'});
 assert.equal(await page.locator('.print-page img[data-id^="INV-"]').evaluate(img=>getComputedStyle(img).outlineStyle),'none','invoices have no cutting guide');
 await page.emulateMedia({media:'screen'});
 await page.locator('[data-preset="receipts"]').click();await ready(page);
 const ids=await page.evaluate(()=>{const c=Object.fromEntries(['invoiceCount','receiptCount','startDate','endDate','taxMix','pricing','rounding','receiptStyle','handwriting','pdfMode','seed'].map(k=>[k,document.getElementById(k).value]));return VoucherCore.generate(c).documents.filter(d=>VoucherPDF.pageSize(d).height*25.4/72<=277).slice(0,5).map(d=>d.id);});
 assert.equal(ids.length,5);
 await page.locator('.doc-row[aria-label^="'+ids[0]+' "]').click();await ready(page);
 const beforeDownload=page.waitForEvent('download');await page.locator('#downloadPdf').click();const originalBytes=await readFile(await(await beforeDownload).path());
 for(const id of ids)await page.locator('.print-choice[data-id="'+id+'"]').check();
 assert.match(await page.locator('#printSelectionCount').innerText(),/5件/);
 await page.locator('#printSelected').click();await page.waitForFunction(()=>window.__printCalls===1);
 const dimensions=await page.locator('.print-page img').evaluateAll(imgs=>imgs.map(img=>({id:img.dataset.id,left:img.style.left,top:img.style.top,width:img.style.width,height:img.style.height})));
 assert.equal(dimensions.length,5);assert.ok(dimensions.every(d=>d.width==='58mm'));
 assert.equal(await page.locator('.print-page').count(),2);
 await page.emulateMedia({media:'print'});
 assert.equal(await page.locator('main').isVisible(),false);
 assert.equal(await page.locator('#printSheet').isVisible(),true);
 const guides=await page.locator('.print-page img').evaluateAll(imgs=>imgs.map(img=>{const style=getComputedStyle(img);return{style:style.outlineStyle,color:style.outlineColor,width:parseFloat(style.outlineWidth),offset:style.outlineOffset,border:style.borderWidth,boxWidth:img.getBoundingClientRect().width};}));
 assert.ok(guides.every(g=>g.style==='dashed'&&g.color==='rgb(184, 184, 184)'&&g.width>0&&g.width<=1&&g.offset==='0px'&&g.border==='0px'),JSON.stringify(guides));
 assert.ok(guides.every(g=>Math.abs(g.boxWidth-58*96/25.4)<.02),'cutting guides must not change receipt width');
 if(outputDir)await page.pdf({path:outputDir+'/a4-five-receipts.pdf',preferCSSPageSize:true,printBackground:true});
 await page.emulateMedia({media:'screen'});
 assert.equal(await page.locator('.print-page img').first().evaluate(img=>getComputedStyle(img).outlineStyle),'none','cutting guides are print-only');
 // Single download keeps the original small page, even after imposing five receipts.
 await page.locator('.doc-row[aria-label^="'+ids[0]+' "]').click();await ready(page);
 const download=page.waitForEvent('download');await page.locator('#downloadPdf').click();const bytes=await readFile(await(await download).path());
 const pdf=await PDF.PDFDocument.load(bytes);assert.ok(Math.abs(pdf.getPages()[0].getWidth()*25.4/72-58)<.001);
 assert.deepEqual(bytes,originalBytes,'imposition/cutting guides must not change the upload PDF');await inspectImagePdf(bytes);
 // Unit geometry covers arbitrary long pages; exercise the actual UI error path too.
 await page.evaluate(()=>{window.__realSize=VoucherPDF.pageSize;VoucherPDF.pageSize=d=>({...window.__realSize(d),height:900});});
 const calls=await page.evaluate(()=>window.__printCalls);await page.locator('#printDocument').click();
 await page.waitForFunction(()=>!document.getElementById('error').hidden);
 assert.match(await page.locator('#error').innerText(),/縮小・切断/);assert.equal(await page.evaluate(()=>window.__printCalls),calls);
 await page.evaluate(()=>{VoucherPDF.pageSize=window.__realSize;});
 await page.locator('[data-preset="handwritten"]').click();await ready(page);
 await page.locator('#selectReceipts').click();await page.locator('#printSelected').click();await page.waitForFunction(n=>window.__printCalls===n+1,calls);
 assert.equal(await page.locator('.print-page.landscape').count(),3);
 if(outputDir){await page.emulateMedia({media:'print'});await page.pdf({path:outputDir+'/a4-three-handwritten.pdf',preferCSSPageSize:true,printBackground:true});await page.emulateMedia({media:'screen'});}
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile has no horizontal overflow');
 await page.locator('#printSelected').scrollIntoViewIfNeeded();const box=await page.locator('#printSelected').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390&&box.height>=44);
 if(outputDir)await page.screenshot({path:outputDir+'/mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1100});
 return{selected:ids,portraitPages:2,widthMm:58,marginMm:10,gapMm:5,longReceiptRejected:true,handwrittenLandscapePages:3,mobileWidth:390,dimensions,cuttingGuides:'print-only dashed gray outline',uploadPdfUnchanged:true,invoiceGuideAbsent:true};
}
