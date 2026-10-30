const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../core.js');

test('通常生成は商品・単価・明細構成を広く変え、計算と現金差額を保つ',()=>{
 const totals=new Set(),prices=new Set(),combinations=new Set();
 for(let i=0;i<80;i++){
  const batch=C.generate({seed:'variation-'+i,invoiceCount:10,receiptCount:10,taxMix:'varied'});
  assert.deepEqual(C.generate(batch.config),batch);
  totals.add(batch.documents[0].totals.gross);
  for(const doc of batch.documents){
   C.assertDoc(doc);
   assert.equal(doc.tender-doc.totals.gross,doc.change);
   assert.ok(doc.items.every(item=>item.amount===item.quantity*item.unitPrice));
   if(doc.type==='invoice')assert.equal(new Set(doc.items.map(item=>item.name)).size,doc.items.length);
   else assert.ok(new Set(doc.items.map(item=>item.name)).size>=Math.min(doc.items.length,4));
   for(const item of doc.items)if(item.name==='デザイン制作費')prices.add(item.unitPrice);
  }
  combinations.add(batch.documents[10].items.map(item=>item.name).join('|'));
  assert.equal(batch.summary.total,batch.documents.reduce((sum,doc)=>sum+doc.totals.gross,0));
 }
 assert.ok(totals.size>=75,`異なる総額: ${totals.size}`);
 assert.ok(prices.size>=15,`デザイン制作費の異なる単価: ${prices.size}`);
 assert.ok(combinations.size>=15,`レシートの異なる組合せ: ${combinations.size}`);
});

test('旧生成条件は旧方式の金額・明細を再現して再保存できる',()=>{
 const input={version:'1.4.0',seed:'legacy-price',invoiceCount:1,receiptCount:1,startDate:'2026-10-01',endDate:'2026-10-01'};
 const legacy=C.importConfig(input);
 assert.equal(legacy.catalogVersion,'1.4.0');
 const batch=C.generate(legacy);
 assert.deepEqual(batch.documents.map(doc=>({id:doc.id,items:doc.items.map(item=>[item.name,item.unitPrice,item.quantity]),gross:doc.totals.gross})),[
  {id:'INV-001',items:[['ランチセット（店内飲食）',1483,8],['デザイン制作費',12881,6],['食器用洗剤',401,5],['デザイン制作費',12880,5],['食器用洗剤',407,8],['配送料',707,7],['デザイン制作費',12881,2]],gross:208474},
  {id:'REC-001',items:[['国産米 5kg（持帰り）',2689,1],['りんご（持帰り）',184,1],['国産米 5kg（持帰り）',2681,2],['野菜詰合せ（持帰り）',977,3],['国産米 5kg（持帰り）',2696,3],['りんご（持帰り）',180,3],['国産米 5kg（持帰り）',2691,2]],gross:25176}
 ]);
 assert.deepEqual(C.generate(C.importConfig({...batch.config,version:C.VERSION})),batch);
 assert.notDeepEqual(C.generate({...legacy,catalogVersion:C.VERSION}).documents,batch.documents);
});
