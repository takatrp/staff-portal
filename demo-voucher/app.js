(function () {
'use strict';
const C=VoucherCore,P=VoucherPDF,$=id=>document.getElementById(id);
const fields=['invoiceCount','receiptCount','startDate','endDate','taxMix','pricing','rounding','receiptStyle','handwriting','pdfMode','seed'];
const presets={handwritten:{invoiceCount:0,receiptCount:3,taxMix:'mixed',pricing:'inclusive',receiptStyle:'handwritten',handwriting:'auto',pdfMode:'image'},standard:{invoiceCount:10,receiptCount:10,taxMix:'varied',pricing:'varied',receiptStyle:'normal',pdfMode:'image'},mixed:{invoiceCount:5,receiptCount:5,taxMix:'mixed',pricing:'varied',receiptStyle:'normal',pdfMode:'image'},receipts:{invoiceCount:0,receiptCount:10,taxMix:'varied',pricing:'inclusive',receiptStyle:'normal',pdfMode:'image'}};
let batch=null,selected=null,busy=false,previewUrl=null,previewTicket=0,generationTicket=0,randomNonce=0,variations=[];
const printSelection=new Set();
const pdfCache=new Map();
function read(){return {...Object.fromEntries(fields.map(k=>[k,$(k).value])),...(variations.length?{variations}: {})};}
function appearance(){$('handwritingField').hidden=$('receiptStyle').value!=='handwritten';}
function set(c){fields.forEach(k=>{if(c[k]!==undefined)$(k).value=c[k];});variations=c.variations||[];appearance();}
function error(e){$('error').hidden=false;$('error').textContent=e.message||String(e);console.error(e);}
function state(value,message=''){
 busy=value;$('status').textContent=message;
 document.querySelectorAll('button').forEach(b=>{b.disabled=value||(!batch&&['regenerate','downloadZip','proofsZip','downloadCsv','downloadPdf','printDocument'].includes(b.id));});
 $('printDocument').disabled=value||!selected||!$('previewLoading').hidden;
 for(const id of [...fields,'filter','importConfig','randomMode'])$(id).disabled=value;
 document.querySelectorAll('.print-choice').forEach(input=>input.disabled=value);printCount();
 $('regenerate').textContent=value?'生成中…':'ランダム生成';
 $('regenerate').setAttribute('aria-busy',String(value));
}
function save(data,name,type){
 const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function list(){
 const docs=batch.documents.filter(d=>$('filter').value==='all'||d.type===$('filter').value);
 $('documentList').replaceChildren();$('countBadge').textContent=docs.length;
 for(const d of docs){
  const b=document.createElement('button');b.type='button';b.className='doc-row';b.disabled=busy;
  b.setAttribute('aria-pressed',String(d.id===selected?.id));
  b.setAttribute('aria-label',d.id+' '+d.merchant.name+' '+C.yen(d.totals.gross)+'円');
  const icon=document.createElement('span');icon.className='doc-icon';icon.textContent=d.type==='invoice'?'請求書':'ﾚｼｰﾄ';
  const info=document.createElement('span');info.className='doc-info';
  const name=document.createElement('strong');name.textContent=d.merchant.name;
  const meta=document.createElement('small');meta.textContent=d.date+' · '+d.id;
  const bottom=document.createElement('span');bottom.className='doc-bottom';
  const amount=document.createElement('span');amount.className='doc-amount';amount.textContent='¥ '+C.yen(d.totals.gross);
  const tax=document.createElement('span');tax.className='tax-badge';tax.textContent=d.taxMode==='mixed'?'8% + 10%':d.taxMode+'%';
  bottom.append(amount,tax);info.append(name,meta,bottom);b.append(icon,info);
  b.addEventListener('click',()=>{if(busy)return;selected=d;list();preview(d);});
  const row=document.createElement('div');row.className='doc-choice';
  if(d.type==='receipt'){const label=document.createElement('label');label.className='print-choice-label';const check=document.createElement('input');check.type='checkbox';check.className='print-choice';check.dataset.id=d.id;check.checked=printSelection.has(d.id);check.disabled=busy;check.setAttribute('aria-label','印刷選択 '+d.id+' '+d.merchant.name);check.addEventListener('change',()=>{if(check.checked)printSelection.add(d.id);else printSelection.delete(d.id);printCount();});label.append(check);row.append(label);}
  row.append(b);$('documentList').append(row);
 }
 if(!docs.length){const e=document.createElement('p');e.className='empty';e.textContent='この種類の証憑はありません。';$('documentList').append(e);}
}
async function pdf(d){
 if(!pdfCache.has(d.id))pdfCache.set(d.id,P.voucher(d));
 return pdfCache.get(d.id);
}
async function preview(d){
 const ticket=++previewTicket;
 $('printDocument').disabled=true;$('printSheet').dataset.ready='false';
 const size=P.pageSize(d),width=Math.min(210,size.width*25.4/72),height=Math.min(297,size.height*25.4/72);
 $('printSize').textContent=(d.type==='invoice'?'請求書 A4':d.receiptStyle==='handwritten'?'手書き領収書':'レシート')+'：'+width.toFixed(1)+' × '+height.toFixed(1)+' mm';
 document.querySelector('.preview-surface').classList.toggle('landscape',d.receiptStyle==='handwritten');
 $('previewLoading').textContent='新しいPDFを準備しています…';$('previewLoading').hidden=false;
 printCount();
 $('previewTitle').textContent=d.id+' / '+d.templateName;
 $('previewMeta').textContent=d.merchant.name+' · '+(d.pricing==='inclusive'?'税込内税':'税抜外税')+' · 消費税 '+C.yen(d.totals.tax)+'円 · '+(d.pdfMode==='image'?'画像PDF・文字層なし':'文字ありPDF')+' · 検算OK';
 try{
  const bytes=await pdf(d),png=await P.previewFor(bytes);if(ticket!==previewTicket)return;
  const nextUrl=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  const previousUrl=previewUrl;previewUrl=nextUrl;
  $('pdfPreview').href=nextUrl;
  // Prepare the menu/Ctrl+P layout as well as the explicit print buttons.
  try{await preparePrint([d],new Map([[d.id,png]]),ticket);}catch(e){if(ticket!==previewTicket)return;$('printSheet').replaceChildren();$('printSheet').dataset.ready='false';$('printUnavailable').textContent=e.message;}
  if(ticket!==previewTicket)return;$('printDocument').disabled=busy;
  $('documentImage').src=png;$('documentImage').alt=d.merchant.name+' / '+C.yen(d.totals.gross)+'円 / '+d.templateName;
  $('previewLoading').hidden=true;
  printCount();
  if(previousUrl)URL.revokeObjectURL(previousUrl);
 }catch(e){if(ticket===previewTicket){$('previewLoading').textContent='PDFを作成できませんでした。';error(e);}}
}
function randomBatch(previous){
 const values=new Uint32Array(2);crypto.getRandomValues(values);
 const entropy=Array.from(values,n=>n.toString(36)).join('-')+'-'+(++randomNonce).toString(36);
 const next=C.randomize(batch,previous.id,$('randomMode').value,entropy);
 return{next,choice:next.documents.find(d=>d.id===previous.id)};
}
async function generate(randomize=false){
 if(busy)return;
 const previous=selected,filter=$('filter').value,ticket=++generationTicket;
 ++previewTicket;$('error').hidden=true;
 state(true,randomize?'選択した社名・金額を変更しています…':'証憑を生成しています…');
 try{
  const config=C.config(read());
  const result=randomize?randomBatch(previous):{next:C.generate(config)};
  if(ticket!==generationTicket)return;
  batch=result.next;variations=batch.config.variations||[];if(!randomize)printSelection.clear();pdfCache.clear();selected=result.choice||batch.documents[0];printCount();
  $('seed').value=batch.config.seed;
  $('filter').value=randomize&&(filter==='all'||batch.documents.some(d=>d.type===filter))?filter:'all';
  list();
  $('resultSummary').textContent=batch.summary.count+'件 / 税込総額 ¥ '+C.yen(batch.summary.total)+' / 全件 検算OK';
  await preview(selected);
  if(ticket===generationTicket)state(false,randomize?selected.merchant.name+' / '+selected.templateName+' に切り替えました。':'');
 }catch(e){if(ticket===generationTicket){state(false);error(e);}}
}
$('settingsForm').addEventListener('submit',e=>{e.preventDefault();generate();});
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{if(busy)return;set(presets[b.dataset.preset]);generate();}));
$('regenerate').addEventListener('click',()=>{if(busy)return;generate(true);});
$('filter').addEventListener('change',()=>{
 if(busy||!batch)return;
 const d=batch.documents.find(x=>$('filter').value==='all'||x.type===$('filter').value);
 if(d)selected=d;
 list();if(d)preview(d);
});
$('downloadPdf').addEventListener('click',async()=>{
 if(busy||!selected)return;
 const d=selected;
 try{save(await pdf(d),d.filename,'application/pdf');}catch(e){error(e);}
});
function printCount(){
 $('printSelectionCount').textContent=printSelection.size+'件選択';$('printSelected').disabled=busy||!printSelection.size||!$('previewLoading').hidden;
 $('selectReceipts').disabled=busy||!batch?.documents.some(d=>d.type==='receipt');$('clearPrintSelection').disabled=busy||!printSelection.size;
}
async function preparePrint(docs,images=new Map(),ticket){
 const sizes=docs.map(d=>{const size=P.pageSize(d);return{id:d.id,width:Math.min(210,size.width*25.4/72),height:Math.min(297,size.height*25.4/72)};});
 const invoice=docs.length===1&&docs[0].type==='invoice';
 const pages=invoice?[{width:210,height:297,landscape:false,items:[{...sizes[0],x:0,y:0}]}]:VoucherPrint.layout(sizes,{landscape:docs.every(d=>d.receiptStyle==='handwritten')});
 const fragment=document.createDocumentFragment();
 for(const page of pages){const sheet=document.createElement('div');sheet.className='print-page '+(page.landscape?'landscape':'portrait');
  for(const item of page.items){const d=docs.find(d=>d.id===item.id),img=document.createElement('img');img.dataset.id=d.id;img.alt='';img.src=images.get(d.id)||await P.previewFor(await pdf(d));img.style.cssText='left:'+item.x+'mm;top:'+item.y+'mm;width:'+item.width+'mm;height:'+item.height+'mm';sheet.append(img);await img.decode();}
  fragment.append(sheet);
 }
 if(ticket!==undefined&&ticket!==previewTicket)return;
 $('printSheet').replaceChildren(fragment);$('printSheet').dataset.ready='true';return pages.length;
}
async function printDocuments(docs){
 if(busy||!docs.length||!$('previewLoading').hidden)return;const current=docs.slice();$('error').hidden=true;$('printSheet').dataset.ready='false';state(true,'原寸の印刷ページを準備しています…');
 try{const count=await preparePrint(current);state(false,current.length+'件をA4 '+count+'ページに原寸配置しました。倍率100%で印刷してください。');window.print();}
 catch(e){$('printSheet').replaceChildren();$('printUnavailable').textContent=e.message;state(false);error(e);}
}
$('printDocument').addEventListener('click',()=>printDocuments(selected?[selected]:[]));
$('printSelected').addEventListener('click',()=>printDocuments(batch?batch.documents.filter(d=>printSelection.has(d.id)):[]));
$('selectReceipts').addEventListener('click',()=>{if(!busy&&batch){batch.documents.filter(d=>d.type==='receipt').forEach(d=>printSelection.add(d.id));list();printCount();}});
$('clearPrintSelection').addEventListener('click',()=>{if(!busy){printSelection.clear();list();printCount();}});
$('downloadCsv').addEventListener('click',()=>{if(!busy&&batch)save(C.csv(batch),'照合用_投入禁止_期待値.csv','text/csv;charset=utf-8');});
async function download(proofsOnly){
 if(busy||!batch)return;
 $('error').hidden=true;state(true,'日本語フォントを埋め込んでいます。準備 0 / '+batch.summary.count);
 try{
  const current=batch;
  const result=await P.build(current,(i,n)=>{$('status').textContent='PDF生成 '+i+' / '+n+(i===n?' · ZIPを準備しています…':'');},{proofsOnly});
  save(result.zip,'架空証憑_'+(proofsOnly?'投入用のみ_':'照合資料付_')+current.config.startDate+'.zip','application/zip');
  state(false,'ZIPを保存しました。投入時は「01_投入用」だけを選んでください。');
 }catch(e){state(false);error(e);}
}
$('downloadZip').addEventListener('click',()=>download(false));
$('proofsZip').addEventListener('click',()=>download(true));
$('importConfig').addEventListener('change',async e=>{
 if(busy)return;
 try{
  const file=e.target.files[0];if(!file)return;
  if(file.size>20000)throw Error('生成条件JSONは20KB以下で指定してください。');
  const config=JSON.parse(await file.text());if(busy)return;
  if(config.version&&config.version!==C.VERSION)throw Error('バージョンが異なるため、同一結果は保証できません。対応する版を使用してください。');
  set(C.config(config));await generate();
 }catch(e){error(e);}finally{e.target.value='';}
});
$('receiptStyle').addEventListener('change',appearance);
$('settingsForm').addEventListener('input',()=>{variations=[];if(batch&&!busy)$('status').textContent='条件を変更しました。「この条件で生成」で反映します。';});
const initialDates=C.defaultDateRange();
for(const key of ['startDate','endDate'])if(!$(key).value)$(key).value=initialDates[key];
$('version').textContent=C.VERSION;generate();
})();
