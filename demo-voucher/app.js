(function () {
'use strict';
const C=VoucherCore,P=VoucherPDF,$=id=>document.getElementById(id);
const fields=['invoiceCount','receiptCount','startDate','endDate','taxMix','pricing','rounding','receiptStyle','handwriting','pdfMode','seed'];
const presets={handwritten:{invoiceCount:0,receiptCount:3,taxMix:'mixed',pricing:'inclusive',receiptStyle:'handwritten',handwriting:'auto',pdfMode:'image'},standard:{invoiceCount:10,receiptCount:10,taxMix:'varied',pricing:'varied',receiptStyle:'normal',pdfMode:'image'},mixed:{invoiceCount:5,receiptCount:5,taxMix:'mixed',pricing:'varied',receiptStyle:'normal',pdfMode:'image'},receipts:{invoiceCount:0,receiptCount:10,taxMix:'varied',pricing:'inclusive',receiptStyle:'normal',pdfMode:'image'}};
let batch=null,selected=null,busy=false,previewUrl=null,previewTicket=0,generationTicket=0,randomNonce=0;
const pdfCache=new Map();
function read(){return Object.fromEntries(fields.map(k=>[k,$(k).value]));}
function appearance(){$('handwritingField').hidden=$('receiptStyle').value!=='handwritten';}
function set(c){fields.forEach(k=>{if(c[k]!==undefined)$(k).value=c[k];});appearance();}
function error(e){$('error').hidden=false;$('error').textContent=e.message||String(e);console.error(e);}
function state(value,message=''){
 busy=value;$('status').textContent=message;
 document.querySelectorAll('button').forEach(b=>{b.disabled=value||(!batch&&['regenerate','downloadZip','proofsZip','downloadCsv','downloadPdf'].includes(b.id));});
 for(const id of [...fields,'filter','importConfig'])$(id).disabled=value;
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
  $('documentList').append(b);
 }
 if(!docs.length){const e=document.createElement('p');e.className='empty';e.textContent='この種類の証憑はありません。';$('documentList').append(e);}
}
async function pdf(d){
 if(!pdfCache.has(d.id))pdfCache.set(d.id,P.voucher(d));
 return pdfCache.get(d.id);
}
async function preview(d){
 const ticket=++previewTicket;
 document.querySelector('.preview-surface').classList.toggle('landscape',d.receiptStyle==='handwritten');
 $('previewLoading').textContent='新しいPDFを準備しています…';$('previewLoading').hidden=false;
 $('previewTitle').textContent=d.id+' / '+d.templateName;
 $('previewMeta').textContent=d.merchant.name+' · '+(d.pricing==='inclusive'?'税込内税':'税抜外税')+' · 消費税 '+C.yen(d.totals.tax)+'円 · '+(d.pdfMode==='image'?'画像PDF・文字層なし':'文字ありPDF')+' · 検算OK';
 try{
  const bytes=await pdf(d),png=await P.previewFor(bytes);if(ticket!==previewTicket)return;
  const nextUrl=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  const previousUrl=previewUrl;previewUrl=nextUrl;
  $('pdfPreview').href=nextUrl;
  $('documentImage').src=png;$('documentImage').alt=d.merchant.name+' / '+C.yen(d.totals.gross)+'円 / '+d.templateName;
  $('previewLoading').hidden=true;
  if(previousUrl)URL.revokeObjectURL(previousUrl);
 }catch(e){if(ticket===previewTicket){$('previewLoading').textContent='PDFを作成できませんでした。';error(e);}}
}
function preferredDocument(next,previous,filter){
 const type=filter==='all'?previous?.type:filter;
 const matching=next.documents.filter(d=>d.type===type);
 const candidates=matching.length?matching:next.documents;
 return candidates.find(d=>d.id===previous?.id)||candidates[0];
}
function randomBatch(config,previous,filter){
 const values=new Uint32Array(2);crypto.getRandomValues(values);
 const entropy=Array.from(values,n=>n.toString(36)).join('-');
 for(let attempt=0;attempt<100;attempt++){
  const next=C.generate({...config,seed:'demo-'+entropy+'-'+(++randomNonce).toString(36)});
  const choice=preferredDocument(next,previous,filter);
  if(!previous||(choice.merchant.logo!==previous.merchant.logo&&choice.template!==previous.template&&JSON.stringify(choice.items)!==JSON.stringify(previous.items))){
   return{next,choice};
  }
 }
 throw Error('別の組合せを生成できませんでした。もう一度お試しください。');
}
async function generate(randomize=false){
 if(busy)return;
 const previous=selected,filter=$('filter').value,ticket=++generationTicket;
 ++previewTicket;$('error').hidden=true;
 state(true,randomize?'別の会社・様式・内容で生成しています…':'証憑を生成しています…');
 try{
  const config=C.config(read());
  const result=randomize?randomBatch(config,previous,filter):{next:C.generate(config)};
  if(ticket!==generationTicket)return;
  batch=result.next;pdfCache.clear();selected=result.choice||batch.documents[0];
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
$('settingsForm').addEventListener('input',()=>{if(batch&&!busy)$('status').textContent='条件を変更しました。「この条件で生成」で反映します。';});
const initialDates=C.defaultDateRange();
for(const key of ['startDate','endDate'])if(!$(key).value)$(key).value=initialDates[key];
$('version').textContent=C.VERSION;generate();
})();
