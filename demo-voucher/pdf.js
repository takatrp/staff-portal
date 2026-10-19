/* Local PDF renderer: embedded fonts or an image-only page; no external requests. */
(function(g){'use strict';
const C=()=>g.VoucherCore,white=[1,1,1],ink=[.12,.16,.19],muted=[.40,.45,.48],light=[.93,.95,.95];
let fontBytes;const previewPages=new WeakMap(),previewImages=new WeakMap();
function bytes(){if(!fontBytes){const s=atob(g.DEMO_FONT_BASE64);fontBytes=Uint8Array.from(s,c=>c.charCodeAt(0));}return fontBytes;}
function rgb(a){return g.PDFLib.rgb(...a);}function color(hex){return hex.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16)/255);}
function fixedDate(d){return new Date(d+'T12:00:00Z');}
// Physical page sizes in PDF points (72 pt = 25.4 mm).
// All normal templates use the common 80 mm roll; their length follows the items.
function pageSize(d){return d.type==='invoice'?{width:595.28,height:841.89}:d.receiptStyle==='handwritten'?{width:595.28,height:365}:{width:80*72/25.4,height:490+d.items.length*35+(d.template===9?60:0)};}
async function document(title,date){const doc=await g.PDFLib.PDFDocument.create();doc.registerFontkit(g.fontkit);doc.setTitle(title+' / 全件架空・研修用');doc.setAuthor('Demo Voucher Studio');doc.setCreator('Demo Voucher Studio '+C().VERSION);doc.setProducer('pdf-lib / embedded Noto Sans JP');doc.setCreationDate(fixedDate(date));doc.setModificationDate(fixedDate(date));const font=await doc.embedFont(bytes(),{subset:true});font._demoFamily='DemoNotoJP';return{doc,font};}
function painter(page,font){const H=page.getHeight(),W=page.getWidth(),commands=page._demoPaint||(page._demoPaint=[]);
function rect(x,y,w,h,fill=light,border=null){page.drawRectangle({x,y:H-y-h,width:w,height:h,color:rgb(fill),...(border?{borderColor:rgb(border),borderWidth:.6}:{})});commands.push({op:'rect',x,y,w,h,fill,border});}
function line(x,y,x2,y2,c=muted,width=.6,dash){page.drawLine({start:{x,y:H-y},end:{x:x2,y:H-y2},color:rgb(c),thickness:width,...(dash?{dashArray:dash}:{})});commands.push({op:'line',x,y,x2,y2,color:c,width,dash});}
function text(value,x,y,size=10,c=ink,opts={}){let s=String(value),fs=size;const width=opts.width||W-x-8;while(font.widthOfTextAtSize(s,fs)>width&&fs>5)fs-=.25;let w=font.widthOfTextAtSize(s,fs);if(w>width){while(s.length&&font.widthOfTextAtSize(s+'…',fs)>width)s=s.slice(0,-1);s+='…';w=font.widthOfTextAtSize(s,fs);}const px=opts.align==='right'?x+width-w:opts.align==='center'?x+(width-w)/2:x,rotation=opts.rotation||0;page.drawText(s,{x:px,y:H-y-fs,font,size:fs,color:rgb(c),...(rotation?{rotate:g.PDFLib.degrees(rotation)}:{})});commands.push({op:'text',text:s,x:px,baseline:y+fs,size:fs,color:c,family:font._demoFamily||'DemoNotoJP',rotation});return fs;}
function center(s,y,size=10,c=ink,x=0,w=W){return text(s,x,y,size,c,{width:w,align:'center'});}
function right(s,x,y,w,size=10,c=ink){return text(s,x,y,size,c,{width:w,align:'right'});}
function circle(x,y,r,c){page.drawCircle({x,y:H-y,size:r,color:rgb(c)});commands.push({op:'circle',x,y,r,color:c});}
return{page,font,H,W,rect,line,text,center,right,circle};}
function logo(p,id,x,y,s,c){const k=id%10,t=s/5;switch(k){
case 0:p.circle(x+s/2,y+s/2,s/2,c);p.line(x+t,y+s*.65,x+s/2,y+t,white,2);p.line(x+s/2,y+t,x+s-t,y+s*.65,white,2);break;
case 1:for(let j=0;j<3;j++)p.rect(x+j*t*1.7,y+(2-j)*t,s/4,(j+2)*t,c);break;
case 2:p.circle(x+s*.4,y+s*.45,s*.34,c);p.circle(x+s*.7,y+s*.65,s*.27,c);p.line(x+s*.5,y+s*.5,x+s*.5,y+s, c,2);break;
case 3:p.circle(x+s*.5,y+s*.5,s*.48,c);p.circle(x+s*.68,y+s*.35,s*.38,white);break;
case 4:p.rect(x+s*.3,y+s*.3,s*.4,s*.7,c);p.rect(x+s*.2,y+s*.25,s*.6,s*.15,c);p.line(x,y+s*.2,x+s*.2,y+s*.3,c,1);p.line(x+s*.8,y+s*.3,x+s,y+s*.2,c,1);break;
case 5:p.circle(x+s*.25,y+s*.3,s*.23,c);p.circle(x+s*.72,y+s*.28,s*.23,c);p.line(x+s*.45,y+s*.4,x+s*.5,y+s,c,2);break;
case 6:for(let j=0;j<3;j++){p.line(x,y+s*(.2+j*.3),x+s*.5,y+s*(.1+j*.3),c,2);p.line(x+s*.5,y+s*(.1+j*.3),x+s,y+s*(.2+j*.3),c,2);}break;
case 7:p.rect(x,y,s,s,c);p.rect(x+t,y+t,s-2*t,s-2*t,white);p.rect(x+2*t,y+2*t,t,t,c);break;
case 8:p.line(x,y+s,x+s*.5,y,c,2);p.line(x+s*.5,y,x+s,y+s,c,2);p.line(x+s*.25,y+s*.7,x+s*.75,y+s*.7,c,2);break;
case 9:p.circle(x+s*.5,y+s*.5,s*.45,c);p.line(x+s*.2,y+s*.5,x+s*.8,y+s*.5,white,2);p.line(x+s*.5,y+s*.2,x+s*.5,y+s*.8,white,2);break;}
if(id>=10)p.circle(x+s*.9,y+s*.92,s*.1,c);
}
function roundLabel(v){return{floor:'切捨て',round:'四捨五入',ceil:'切上げ'}[v];}
function money(n){return C().yen(n);}
function disclaimer(p,y,small=false){const fs=small?6:7;p.center('全件架空・デモ専用 / 実取引・実在企業とは無関係',y,fs,muted);p.center('登録番号は無効なダミーです。実事業者照会は対象外。',y+11,fs,muted);}
function invoice(d,font,doc){const page=doc.addPage([595.28,841.89]),p=painter(page,font),a=color(d.merchant.color),m=42,w=p.W-84,k=d.template;let top=290;
if(k===1){p.rect(0,0,18,p.H,a);p.text('INVOICE',m,34,10,a);p.text('請求書',m,55,30);logo(p,d.merchant.logo,493,36,48,a);}
else if(k===2){p.rect(0,0,p.W,116,a);logo(p,d.merchant.logo,m,34,38,white);p.text(d.merchant.latin,m+52,35,17,white,{width:270});p.text('請求書',425,38,26,white);p.text(d.merchant.name,m+52,62,10,white,{width:290});top=310;}
else if(k===3){p.text('請 求 書',m,34,27,a);p.line(m,77,p.W-m,77,a,2);logo(p,d.merchant.logo,495,31,37,a);top=266;}
else if(k===4){p.rect(m,30,w,74,light);logo(p,d.merchant.logo,m+16,46,40,a);p.text(d.merchant.name,m+72,45,15,a,{width:400});p.text('請求書 / '+d.merchant.latin,m+72,69,10,muted);top=302;}
else if(k===5){logo(p,d.merchant.logo,277,27,40,a);p.center('請 求 書',83,28,a);p.center(d.merchant.name,123,11);top=320;}
else if(k===6){p.rect(m,28,w,7,a);p.text('請求書',m,54,30,a);logo(p,d.merchant.logo,495,50,40,a);top=282;}
else if(k===7){p.rect(m,30,w,55,white,ink);p.center('請 求 書',40,26);logo(p,d.merchant.logo,m,101,30,ink);top=304;}
else if(k===8){p.text('INVOICE',m,35,11,a);p.text('ご請求書',m,57,29);logo(p,d.merchant.logo,493,38,45,a);top=304;}
else if(k===9){p.text(d.merchant.latin,m,35,21,a);p.text('請求書',425,37,25);p.line(m,87,p.W-m,87,a);logo(p,d.merchant.logo,270,35,28,a);top=298;}
else{logo(p,d.merchant.logo,m,34,42,a);p.text(d.merchant.name,m+56,36,15,a,{width:360});p.text(d.merchant.latin,m+56,61,9,muted);p.right('請求書',410,36,143,25,a);}
const infoY=k===5?156:k===2?135:k===7?149:120;
p.text(d.buyer,m,infoY,15,ink,{width:285});p.line(m,infoY+26,m+284,infoY+26,a);
p.text('下記のとおりご請求申し上げます。',m,infoY+38,10,muted);
p.text('請求番号  '+d.id,363,infoY,10);
p.text('発行日    '+d.date,363,infoY+19,10);
p.text('支払期限  '+d.dueDate,363,infoY+38,10);
const totalY=top-66;
if(k===8){p.rect(m,totalY,w,52,a);p.text('ご請求金額（税込）',m+16,totalY+9,10,white);p.right('¥ '+money(d.totals.gross),250,totalY+6,287,28,white);}
else if(k===3){p.text('ご請求金額（税込）',m,totalY+2,10);p.right('¥ '+money(d.totals.gross),m,totalY+15,278,24,a);p.line(m,totalY+49,m+278,totalY+49,a,1.2);}
else{p.rect(m,totalY,w,49,light);p.text('ご請求金額（税込）',m+14,totalY+15,11);p.right('¥ '+money(d.totals.gross),270,totalY+6,266,27,a);}
p.text('明細金額：'+(d.pricing==='inclusive'?'税込（内税）':'税抜（外税）'),m,top-3,9,muted);
const tableY=top+18,rowH=k===3?30:k===9?34:29;
const dark=[2,6,8].includes(k);p.rect(m,tableY,w,25,dark?a:light);
const hc=dark?white:ink;
p.text('品名 / 内容',m+9,tableY+6,9,hc);p.right('数量',315,tableY+6,43,9,hc);p.right('単価',363,tableY+6,65,9,hc);p.right('金額',435,tableY+6,72,9,hc);p.right('税率',510,tableY+6,34,9,hc);
d.items.forEach((it,i)=>{const y=tableY+25+i*rowH;if((k%2===0)&&i%2===0)p.rect(m,y,w,rowH,[.975,.98,.98]);p.text(it.name,m+9,y+8,9,ink,{width:250});p.right(it.quantity,315,y+8,43,10);p.right(money(it.unitPrice),363,y+8,65,10);p.right(money(it.amount),435,y+8,72,10);p.right(it.rate===8?'8% *':'10%',510,y+8,34,8);p.line(m,y+rowH,m+w,y+rowH,light,.5);});
const end=tableY+25+d.items.length*rowH;const ty=end+21;
p.text('* は軽減税率対象（持帰りの飲食料品）',m,ty,8,muted);
p.text('税率別集計 / '+roundLabel(d.rounding)+'・税率ごとに1回',m,ty+19,8,muted);
d.totals.groups.filter(x=>x.amount).forEach((t,i)=>{p.text(t.rate+'%対象 '+(d.pricing==='inclusive'?'税込':'税抜')+' '+money(t.amount)+'円',m,ty+41+i*19,9);p.text((d.pricing==='inclusive'?'うち':'消費税')+' '+money(t.tax)+'円',m+201,ty+41+i*19,9);});
let sy=ty+33;p.right('税抜合計  '+money(d.totals.net)+' 円',350,sy,194,10);p.right('消費税合計  '+money(d.totals.tax)+' 円',350,sy+21,194,10);p.line(350,sy+43,544,sy+43,a);p.right('合計  '+money(d.totals.gross)+' 円',350,sy+49,194,15,a);
p.line(m,730,p.W-m,730,light);p.text(d.merchant.name,m,744,10,a);p.text(d.merchant.address,m,761,8,muted);p.text('登録番号 '+C().DUMMY+'（無効なダミー）',m,776,8,muted);
p.right('振込先：デモ用のため記載省略',333,748,220,8,muted);p.right('様式：'+d.templateName,333,765,220,8,muted);
disclaimer(p,803);return page;}
function receipt(d,font,doc){const k=d.template,{width:w,height:h}=pageSize(d);const page=doc.addPage([w,h]),p=painter(page,font),m=16,inner=w-32,a=k===8?ink:color(d.merchant.color);
if(k===3||k===7){p.rect(m,15,inner,88,light);logo(p,d.merchant.logo,w/2-15,22,30,a);p.center(d.merchant.name,61,12,a,m+4,inner-8);}
else if(k===1||k===6){logo(p,d.merchant.logo,w/2-18,18,36,a);p.center(d.merchant.latin,62,13,a);p.center(d.merchant.name,85,11);}
else{logo(p,d.merchant.logo,m,21,27,a);p.text(d.merchant.latin,m+38,20,12,a,{width:inner-39});p.text('領収書 / レシート',m+38,40,10);p.center(d.merchant.name,77,12,a);}
p.center(d.merchant.address,110,7);p.center(d.date+' '+d.time+' / '+d.id,126,8);
p.center('登録番号 '+C().DUMMY+'（ダミー）',141,7,muted);
const rule=y=>{p.line(m,y,w-m,y,k===2?ink:muted,k===2?1.5:.7,k===0||k===5?[2,2]:undefined);if(k===4)p.line(m,y+3,w-m,y+3,muted,.5);};
rule(162);p.text(d.pricing==='inclusive'?'税込価格 / 内税':'税抜価格 / 外税',m,171,8,muted);
let y=191;d.items.forEach(it=>{p.text(it.name+(it.rate===8?' *':''),m,y,9,ink,{width:inner});p.text(it.quantity+'点 × '+money(it.unitPrice)+'円',m+3,y+15,8,muted);p.right(money(it.amount)+' 円',m+70,y+15,inner-70,10);y+=35;});
rule(y+1);y+=14;
if(k===7||k===3){p.rect(m,y-3,inner,36,a);p.text('合計',m+7,y+5,12,white);p.right('¥ '+money(d.totals.gross),m+45,y+1,inner-52,19,white);}else{p.text('合計',m,y+1,13);p.right('¥ '+money(d.totals.gross),m+50,y-2,inner-50,22,a);}
y+=46;
d.totals.groups.filter(t=>t.amount).forEach(t=>{p.text(t.rate+'%対象'+(d.pricing==='inclusive'?'税込':'税抜'),m,y,8);p.right(money(t.amount)+'円',m+89,y,inner-89,9);y+=16;p.text((d.pricing==='inclusive'?'内':'外')+'消費税 '+t.rate+'%',m+8,y,8,muted);p.right(money(t.tax)+'円',m+89,y,inner-89,9);y+=19;});
p.text(d.payment,m,y+2,8);p.right(money(d.tender)+'円',m+90,y+2,inner-90,8);p.text('お釣り',m,y+19,8);p.right(money(d.change)+'円',m+90,y+19,inner-90,8);y+=43;rule(y);y+=13;p.center('* 軽減税率対象（持帰り食品）',y,7,muted);p.center(roundLabel(d.rounding)+' / 税率ごとに1回計算',y+15,7,muted);
if(k===5){p.line(m,y+37,w-m,y+37,muted,.7,[3,2]);p.center('THANK YOU / DEMO ONLY',y+47,10,a);}else p.center('ありがとうございました',y+42,9,a);
disclaimer(p,h-34,true);return page;}
async function voucher(d){C().assertDoc(d);const {doc,font}=await document(d.id,d.date);const page=d.receiptStyle==='handwritten'?await g.VoucherArtwork.handReceipt(d,doc,font,painter,logo):(d.type==='invoice'?invoice:receipt)(d,font,doc);
 if(d.pdfMode==='image'){const png=await g.VoucherArtwork.raster(page),out=await g.PDFLib.PDFDocument.create();
  // A single opaque RGB image, lossless Flate compression and classic xref tables.
  out.setTitle(d.id+' / DEMO IMAGE ONLY');out.setAuthor('Demo Voucher Studio');out.setCreator('Demo Voucher Studio '+C().VERSION);out.setCreationDate(fixedDate(d.date));out.setModificationDate(fixedDate(d.date));const image=await out.embedPng(png),imagePage=out.addPage([page.getWidth(),page.getHeight()]);imagePage.drawImage(image,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});const saved=await out.save({useObjectStreams:false});
  // pdf-lib always declares 1.7. This opaque RGB/Flate subset uses only 1.4 features.
  // The same-length header leaves every classic-xref offset unchanged.
  saved.set(new TextEncoder().encode('%PDF-1.4'),0);
  previewImages.set(saved,png);return saved;}
 const saved=await doc.save({useObjectStreams:false});previewPages.set(saved,page);return saved;
}
async function previewFor(bytes){if(!previewImages.has(bytes)){const page=previewPages.get(bytes);if(!page)throw Error('プレビュー対象のPDFが見つかりません。');previewImages.set(bytes,await g.VoucherArtwork.raster(page));}return previewImages.get(bytes);}
async function summary(batch){const {doc,font}=await document('照合一覧・投入禁止',batch.config.startDate),per=18;for(let offset=0;offset<batch.documents.length;offset+=per){const p=painter(doc.addPage([841.89,595.28]),font),m=29;p.text('照合一覧 / 証憑投入禁止',m,22,21,[.12,.34,.30]);p.text('全件架空 | '+batch.summary.count+'件 | 総額 '+money(batch.summary.total)+'円 | seed: '+batch.config.seed,m,55,9);p.text('8%・10%欄は税抜金額 / 税額。対象金額の表示基準・詳細は照合CSVを参照。',m,73,8,muted);p.rect(m,95,784,25,[.12,.34,.30]);const xs=[m+6,106,178,347,419,532,645,740],ws=[70,65,163,65,107,107,88,67];const headers=['ID','取引日','発行者（架空）','金額方式','8% 税抜 / 税','10% 税抜 / 税','税込総額','検算'];headers.forEach((s,i)=>p.text(s,xs[i],102,8,white,{width:ws[i]}));
batch.documents.slice(offset,offset+per).forEach((d,i)=>{const y=121+i*22;const [a,b]=d.totals.groups;if(i%2===0)p.rect(m,y,784,22,light);const vals=[d.id,d.date,d.merchant.name,d.pricing==='inclusive'?'税込内税':'税抜外税',money(a.net)+' / '+money(a.tax),money(b.net)+' / '+money(b.tax),money(d.totals.gross),'OK'];vals.forEach((s,j)=>p.text(s,xs[j],y+6,8,ink,{width:ws[j]}));});
p.text('登録番号は全件 T0000000000000（無効なダミー）。実事業者照会は対象外。',m,545,8,muted);p.right((offset/per+1)+' / '+Math.ceil(batch.documents.length/per),735,545,77,9);p.text('Demo Voucher Studio '+C().VERSION+' | 税額：証憑単位・税率別1回 | 端数：'+roundLabel(batch.config.rounding),m,563,8,muted);}
return doc.save({useObjectStreams:false});}
async function booklet(pdfs){const out=await g.PDFLib.PDFDocument.create();out.setTitle('全件見本 / 投入禁止');out.setCreationDate(fixedDate('2000-01-01'));out.setModificationDate(fixedDate('2000-01-01'));for(const bytes of pdfs){const src=await g.PDFLib.PDFDocument.load(bytes,{updateMetadata:false});for(const p of await out.copyPages(src,src.getPageIndices()))out.addPage(p);}return out.save({useObjectStreams:false});}
function readme(batch){return '架空証憑デモセット / Demo Voucher Studio '+C().VERSION+'\r\n\r\n01_投入用 : 1証憑1PDF。このフォルダ内のPDFのみを投入してください。\r\n02_照合用_投入禁止 : 期待値CSV・一覧PDF・生成条件。会計ソフトへ投入しないでください。\r\n03_見本_投入禁止 : 全件見本PDF。各証憑と重複するため投入禁止。\r\n\r\n全件架空。企業・店舗・ロゴ・住所・取引はデモ用です。\r\n登録番号 T0000000000000 は無効なダミー。実事業者照会は対象外です。\r\n口座情報は記載していません。\r\n\r\n税率は10%/軽減8%の研修シナリオに固定。実務・税率改正対応用ではありません。\r\n税額は証憑ごと税率別に合算して1回だけ端数処理。\r\n外税=税抜合計×税率、内税=税込合計×税率/(100+税率)。\r\nCSVの税抜金額は、内税の場合「税込対象金額-税額」です。\r\n\r\nseed: '+batch.config.seed+'\r\n再現には同一バージョンと生成条件JSONを使用してください。\r\n';}
async function build(batch,onProgress=()=>{},options={}){const pdfs=[],entries=[];for(let i=0;i<batch.documents.length;i++){const d=batch.documents[i];pdfs.push(await voucher(d));entries.push({name:'01_投入用/'+d.filename,data:pdfs[i]});onProgress(i+1,batch.documents.length);await new Promise(r=>setTimeout(r,0));}
if(!options.proofsOnly){entries.push({name:'02_照合用_投入禁止/期待値.csv',data:C().csv(batch)},{name:'02_照合用_投入禁止/照合一覧.pdf',data:await summary(batch)},{name:'02_照合用_投入禁止/生成条件.json',data:JSON.stringify({version:batch.version,...batch.config},null,2)},{name:'02_照合用_投入禁止/全明細.json',data:JSON.stringify(batch,null,2)},{name:'03_見本_投入禁止/全件見本.pdf',data:await booklet(pdfs)},{name:'最初にお読みください.txt',data:readme(batch)});}
return{entries,pdfs,zip:C().zip(entries)};}
g.VoucherPDF={voucher,previewFor,pageSize,summary,booklet,build,readme,logo};
})(globalThis);
