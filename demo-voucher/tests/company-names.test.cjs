const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../core.js');
const conditions={startDate:'2026-10-01',endDate:'2026-10-01',seed:'company-name-tests'};
const names={issuerName:'発行元〈架空〉 & Co. "A" <img src=x onerror=alert(1)>',recipientName:"宛先デモ株式会社 <script>alert(1)</script> 'R&D' 御中"};
test('社名未指定・空白で従来の自動設定に戻り、各10様式を維持する',()=>{
 const automatic=C.generate(conditions),blank=C.generate({...conditions,issuerName:'　 ',recipientName:' '});
 assert.deepEqual(blank,automatic);assert.equal(new Set(blank.documents.map(d=>d.merchant.name)).size,20);
 for(const type of ['invoice','receipt'])assert.equal(new Set(blank.documents.filter(d=>d.type===type).map(d=>d.template)).size,10);
});
test('任意社名は取引条件を変えず全件に反映し、英数・記号をテキストとして保持する',()=>{
 const before=C.generate(conditions),after=C.generate({...conditions,...names});
 for(let i=0;i<after.documents.length;i++){
  const d=after.documents[i],old=before.documents[i];assert.equal(d.merchant.name,names.issuerName);assert.equal(d.merchant.latin,names.issuerName);assert.equal(d.buyer,names.recipientName);
  assert.deepEqual({...d,merchant:old.merchant,buyer:old.buyer},old);
 }
 const issuer=C.generate({...conditions,issuerName:names.issuerName}),recipient=C.generate({...conditions,recipientName:names.recipientName});
 assert.equal(issuer.documents[0].buyer,before.documents[0].buyer);assert.deepEqual(recipient.documents[0].merchant,before.documents[0].merchant);
 assert.equal(C.config({issuerName:'  デモ商事  ',recipientName:'Cafe\u0301  御中 '}).recipientName,'Café  御中');
});
test('社名は120文字まで受け付け、過長・制御文字・不正型を拒否する',()=>{
 assert.equal(C.config({issuerName:'あ'.repeat(120)}).issuerName.length,120);assert.equal(C.config({issuerName:'𠮷野髙﨑 & Co.'}).issuerName,'𠮷野髙﨑 & Co.');
 for(const key of ['issuerName','recipientName'])for(const value of ['あ'.repeat(121),'会社\n支店','会社\t支店','会社\u0000支店','会社\u202e支店','\ud800',null,{},[]])assert.throws(()=>C.config({[key]:value}));
});
test('3種類のランダム変更とJSON復元で指定社名を保持し、空欄にすれば自動社名へ戻る',()=>{
 for(const mode of ['both','company','amount'])for(const id of ['INV-001','REC-001']){
  const before=C.generate({...conditions,...names}),snapshot=JSON.stringify(before),after=C.randomize(before,id,mode,'custom-'+id+'-'+mode);
  assert.equal(JSON.stringify(before),snapshot);assert.deepEqual(C.generate(JSON.parse(JSON.stringify(after.config))),after);
  for(const d of after.documents){assert.equal(d.merchant.name,names.issuerName);assert.equal(d.buyer,names.recipientName);}
  const old=before.documents.find(d=>d.id===id),current=after.documents.find(d=>d.id===id);
  if(mode==='company'){assert.deepEqual(current.totals,old.totals);assert.notEqual(current.merchant.logo,old.merchant.logo);}
  else assert.notEqual(current.totals.gross,old.totals.gross);
  assert.deepEqual(current.items.map(({unitPrice,amount,...item})=>item),old.items.map(({unitPrice,amount,...item})=>item));assert.equal(current.template,old.template);assert.equal(current.date,old.date);
  const automatic=C.generate({...after.config,issuerName:'',recipientName:''});assert.notEqual(automatic.documents[0].merchant.name,names.issuerName);assert.notEqual(automatic.documents[0].buyer,names.recipientName);
 }
});
test('指定社名を含むCSVも引用・式注入対策を維持し、社名をファイルパスに使用しない',()=>{
 const issuerName='=HYPERLINK("<デモ>&/../x")',b=C.generate({...conditions,issuerName,recipientName:names.recipientName}),csv=C.csv(b);
 assert.ok(csv.includes('"\'=HYPERLINK(""<デモ>&/../x"")"'));assert.ok(b.documents.every(d=>!d.filename.includes(issuerName)&&!d.filename.includes('..')));
 assert.equal(C.config(JSON.parse(JSON.stringify(b.config))).issuerName,issuerName);
});
test('社名対応の設定は旧版と区別し、1.3.0の既存設定を条件・社名を保って読み込む',()=>{
 assert.notEqual(C.VERSION,'1.3.0');
 for(const version of [undefined,'1.3.0',C.VERSION]){
  const input={...conditions,...names,...(version?{version}:{})},loaded=C.importConfig(input);
  assert.equal(loaded.version,undefined);assert.deepEqual(C.generate(loaded).documents,C.generate({...conditions,...names}).documents);
 }
 const legacy=C.importConfig({...conditions,version:'1.3.0'});assert.equal(legacy.issuerName,'');assert.equal(legacy.recipientName,'');
});
test('未知の設定バージョンと不正なJSONの形を読み込まない',()=>{
 for(const version of ['1.2.0','99.0.0',0,null,{},[]])assert.throws(()=>C.importConfig({...conditions,version}));
 for(const value of [null,[],12,'text'])assert.throws(()=>C.importConfig(value));
});
