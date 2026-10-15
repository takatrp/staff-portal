import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function zipEntries(bytes){
 const entries=new Map();let at=0;
 while(bytes.readUInt32LE(at)===0x04034b50){
  assert.equal(bytes.readUInt16LE(at+8),0,"ZIP entries use STORE");
  const size=bytes.readUInt32LE(at+18),nameSize=bytes.readUInt16LE(at+26),extra=bytes.readUInt16LE(at+28);
  const name=bytes.subarray(at+30,at+30+nameSize).toString("utf8"),start=at+30+nameSize+extra;
  entries.set(name,bytes.subarray(start,start+size));at=start+size;
 }
 return entries;
}
export async function verifyRandomPreview(page){
 await page.evaluate(()=>{
  const original=VoucherPDF.voucher,create=URL.createObjectURL.bind(URL);
  window.__voucherQa={blobs:new Map(),calls:0,current:null,delay:150};
  URL.createObjectURL=blob=>{const url=create(blob);window.__voucherQa.blobs.set(url,blob);return url;};
  VoucherPDF.voucher=async doc=>{
   window.__voucherQa.calls++;window.__voucherQa.current=structuredClone(doc);
   await new Promise(resolve=>setTimeout(resolve,window.__voucherQa.delay));
   const bytes=await original(doc);return bytes;
  };
 });
 await page.locator("#invoiceCount").fill("2");await page.locator("#receiptCount").fill("3");
 await page.locator("#startDate").fill("2026-10-01");await page.locator("#endDate").fill("2026-10-01");
 await page.locator("#taxMix").selectOption("8");await page.locator("#pricing").selectOption("inclusive");await page.locator("#rounding").selectOption("ceil");
 await page.getByRole("button",{name:"この条件で生成",exact:true}).click();
 await page.waitForFunction(()=>!document.getElementById("regenerate").disabled);
 await page.locator("#filter").selectOption("receipt");
 await page.locator('.doc-row[aria-label^="REC-003 "]').click();
 await page.waitForFunction(()=>document.getElementById("previewLoading").hidden);
 let previous=await page.evaluate(()=>window.__voucherQa.current);
 const variants=[];
 for(let i=0;i<4;i++){
  const calls=await page.evaluate(()=>window.__voucherQa.calls);
  await page.getByRole("button",{name:"ランダム生成",exact:true}).click();
  assert.equal(await page.locator("#regenerate").isDisabled(),true);
  assert.equal(await page.locator("#previewLoading").isVisible(),true);
  const seed=await page.locator("#seed").inputValue();
  await page.locator("#regenerate").evaluate(button=>{
   for(let n=0;n<5;n++)button.dispatchEvent(new MouseEvent("click",{bubbles:true}));
  });
  await page.waitForFunction(()=>!document.getElementById("regenerate").disabled);
  assert.equal(await page.locator("#seed").inputValue(),seed,"ignored rapid clicks must not change the accepted seed");
  const current=await page.evaluate(()=>window.__voucherQa.current);
  assert.equal(await page.evaluate(()=>window.__voucherQa.calls),calls+1,"one render for one accepted click");
  assert.equal(current.id,"REC-003");assert.equal(current.type,"receipt");
  assert.equal(current.taxMode,"8");assert.ok(current.items.every(item=>item.rate===8));
  assert.equal(current.pricing,"inclusive");assert.equal(current.rounding,"ceil");assert.equal(current.date,"2026-10-01");
  assert.notEqual(current.merchant.name,previous.merchant.name);assert.notEqual(current.template,previous.template);
  assert.notDeepEqual(current.items,previous.items);
  assert.equal(await page.locator("#filter").inputValue(),"receipt");
  assert.equal(await page.locator("#invoiceCount").inputValue(),"2");assert.equal(await page.locator("#receiptCount").inputValue(),"3");
  assert.match(await page.locator("#previewMeta").innerText(),new RegExp(current.merchant.name));
  assert.ok((await page.locator("#previewTitle").innerText()).includes(current.templateName));
  assert.equal(await page.locator('.doc-row[aria-pressed="true"] strong').innerText(),current.merchant.name);
  variants.push({company:current.merchant.name,template:current.templateName,seed});previous=current;
 }
 const expected=previous;
 const previewBytes=Buffer.from(await page.evaluate(async()=>{
  const url=document.getElementById("pdfPreview").href;
  return Array.from(new Uint8Array(await window.__voucherQa.blobs.get(url).arrayBuffer()));
 }));
 const pdfWait=page.waitForEvent("download");await page.locator("#downloadPdf").click();
 const pdfDownload=await pdfWait,pdfBytes=await readFile(await pdfDownload.path());
 assert.deepEqual(pdfBytes,previewBytes,"saved PDF must be exactly the preview PDF");
 const zipWait=page.waitForEvent("download");await page.locator("#downloadZip").click();
 const zip=await zipWait,entries=zipEntries(await readFile(await zip.path()));
 await page.waitForFunction(()=>!document.getElementById("regenerate").disabled);
 const config=JSON.parse(entries.get("02_照合用_投入禁止/生成条件.json").toString("utf8"));
 assert.deepEqual([config.invoiceCount,config.receiptCount,config.startDate,config.endDate,config.taxMix,config.pricing,config.rounding],[2,3,"2026-10-01","2026-10-01","8","inclusive","ceil"]);
 assert.equal(config.seed,expected.seed);
 const batch=JSON.parse(entries.get("02_照合用_投入禁止/全明細.json").toString("utf8"));
 assert.equal(batch.documents.length,5);
 assert.deepEqual(batch.documents.find(doc=>doc.id===expected.id),expected);
 assert.deepEqual(entries.get("01_投入用/"+expected.filename),pdfBytes,"ZIP must contain the preview PDF");
 await page.getByRole("button",{name:"この条件で生成",exact:true}).click();
 await page.waitForFunction(()=>!document.getElementById("regenerate").disabled);
 await page.locator("#filter").selectOption("receipt");await page.locator('.doc-row[aria-label^="REC-003 "]').click();
 await page.waitForFunction(()=>document.getElementById("previewLoading").hidden);
 assert.deepEqual(await page.evaluate(()=>window.__voucherQa.current),expected,"the same seed and settings reproduce the appearance");
 await page.setViewportSize({width:390,height:844});
 await page.locator("#regenerate").scrollIntoViewIfNeeded();
 const button=await page.locator("#regenerate").boundingBox();
 assert.ok(button.x>=0&&button.x+button.width<=390&&button.height>=44,"iPhone-width random button fits and has a touch target");
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"no iPhone horizontal overflow");
 await page.getByRole("button",{name:"ランダム生成",exact:true}).click();
 await page.waitForFunction(()=>!document.getElementById("regenerate").disabled);
 const mobile=await page.evaluate(()=>window.__voucherQa.current);
 assert.notEqual(mobile.merchant.name,expected.merchant.name);assert.notEqual(mobile.template,expected.template);assert.equal(mobile.type,"receipt");
 const mobileWait=page.waitForEvent("download");await page.locator("#downloadPdf").click();
 const mobileDownload=await mobileWait;
 assert.equal((await readFile(await mobileDownload.path())).subarray(0,5).toString(),"%PDF-");
 return {variants,mobile:{company:mobile.merchant.name,template:mobile.templateName},rapidClicksIgnored:true,previewPdfZipIdentical:true,conditionsPreserved:true,seedReproduced:true,iphoneWidth:390};
}
