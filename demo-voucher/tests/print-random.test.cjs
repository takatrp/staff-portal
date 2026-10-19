const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../core.js'),Print=require('../print.js');
test('A4面付けは58mm原寸・余白10mm・間隔5mmを守り3列で次ページへ送る',()=>{
 const input=Array.from({length:5},(_,i)=>({id:'R'+i,width:58,height:250})),pages=Print.layout(input);
 assert.equal(pages.length,2);assert.deepEqual(pages.map(p=>p.items.length),[3,2]);
 for(const p of pages)for(const item of p.items){assert.equal(item.width,58);assert.equal(item.height,250);assert.ok(item.x>=10&&item.y>=10);assert.ok(item.x+item.width<=200&&item.y+item.height<=287);}
 assert.deepEqual(pages[0].items.map(i=>i.x),[10,73,136]);
 const rows=Print.layout(Array.from({length:6},(_,i)=>({id:'R'+i,width:58,height:70})));
 assert.equal(rows.length,1);assert.deepEqual(rows[0].items.map(i=>i.y),[10,10,10,85,85,85]);
});
test('長過ぎる証憑は縮小・切断せず拒否し、手書き用紙はA4横に原寸配置',()=>{
 assert.throws(()=>Print.layout([{id:'long',width:80,height:280}]),/long.*縮小・切断/);
 assert.throws(()=>Print.layout([{id:'hand',width:210,height:128.8}]),/収まりません/);
 const pages=Print.layout([{id:'hand',width:210,height:128.8}],{landscape:true});
 assert.equal(pages[0].width,297);assert.equal(pages[0].height,210);assert.equal(pages[0].items[0].width,210);
 for(const width of [NaN,0,-1,Infinity])assert.throws(()=>Print.layout([{id:'bad',width,height:1}]));
});
test('3択は対象の社名・金額だけを変更し、他の証憑・様式・日付・税率・品名・数量を保持',()=>{
 for(const receiptStyle of ['normal','handwritten'])for(const pricing of ['inclusive','exclusive'])for(const rounding of ['floor','round','ceil']){
  let batch=C.generate({invoiceCount:2,receiptCount:3,taxMix:'mixed',receiptStyle,pricing,rounding,handwriting:'scrawl'});
  for(const id of ['INV-001','REC-002'])for(const mode of ['both','company','amount','company','amount']){
   const before=structuredClone(batch),old=before.documents.find(d=>d.id===id);
   const next=C.randomize(batch,id,mode,'variation-'+id+mode+'-'+(batch.config.variations?.[0]?.companySeed||'first').length),doc=next.documents.find(d=>d.id===id);
   assert.deepEqual(batch,before,'input remains untouched');
   for(const other of before.documents.filter(d=>d.id!==id))assert.deepEqual(next.documents.find(d=>d.id===other.id),other);
   const invariant=d=>{const {merchant,items,totals,tender,change,...rest}=d;return{...rest,items:items.map(({unitPrice,amount,...rest})=>rest)};};
   assert.deepEqual(invariant(doc),invariant(old));
   if(mode==='amount')assert.deepEqual(doc.merchant,old.merchant);else{assert.notEqual(doc.merchant.name,old.merchant.name);const brand=C.brands[doc.merchant.logo];assert.equal(doc.merchant.name,brand[0]);assert.equal(doc.merchant.latin,brand[1]);}
   if(mode==='company'){assert.deepEqual(doc.items,old.items);assert.deepEqual(doc.totals,old.totals);assert.equal(doc.tender,old.tender);assert.equal(doc.change,old.change);}else{assert.notEqual(doc.totals.gross,old.totals.gross);assert.deepEqual(doc.totals,C.totals(doc.items,pricing,rounding));assert.ok(doc.items.every(item=>item.amount===item.unitPrice*item.quantity));assert.equal(doc.tender-doc.totals.gross,doc.change);}
   assert.equal(next.summary.total,next.documents.reduce((sum,d)=>sum+d.totals.gross,0));
   assert.deepEqual(C.generate(JSON.parse(JSON.stringify(next.config))),next);batch=next;
  }
 }
});
test('変更条件の不正ID・重複・seed・モードを拒否',()=>{
 for(const variations of [{},[{id:'REC-000'}],[{id:'REC-051'}],[{id:'REC-001',companySeed:1}],[{id:'REC-001'},{id:'REC-001'}]])assert.throws(()=>C.generate({variations}));
 assert.throws(()=>C.randomize(C.generate(),'REC-001','bad','seed'));
});
