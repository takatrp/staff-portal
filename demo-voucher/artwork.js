/* Receipt artwork and local rasterizer. Fonts remain on this device. */
(function(g){'use strict';
const families={base:'DemoNotoJP',klee:'DemoHandKlee',yomogi:'DemoHandYomogi'},faces=new Map();let handData;
const IMAGE_DPI=300;
function decode(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
async function loadHandData(){if(g.DEMO_HAND_FONTS)return g.DEMO_HAND_FONTS;if(!handData)handData=new Promise((resolve,reject)=>{const script=g.document.createElement('script');script.src='assets/hand-font-data.js?v=1.2.0';script.onload=()=>g.DEMO_HAND_FONTS?resolve(g.DEMO_HAND_FONTS):reject(Error('手書きフォントを読み込めませんでした。'));script.onerror=()=>reject(Error('手書きフォントを読み込めませんでした。'));g.document.head.append(script);});return handData;}
async function fontFace(family){if(!faces.has(family))faces.set(family,(async()=>{let data;if(family===families.base)data=g.DEMO_FONT_BASE64;else{const fonts=await loadHandData();data=family===families.klee?fonts.klee:fonts.yomogi;}const face=new FontFace(family,decode(data));await face.load();g.document.fonts.add(face);return face;})());return faces.get(family);}
function css(c){return 'rgb('+c.map(v=>Math.round(v*255)).join(',')+')';}
async function raster(page){if(!g.document||!g.FontFace)throw Error('画像PDFはブラウザで生成してください。');const commands=page._demoPaint||[];await Promise.all([...new Set(commands.filter(c=>c.op==='text').map(c=>c.family))].map(fontFace));
 const scale=IMAGE_DPI/72,canvas=g.document.createElement('canvas');canvas.width=Math.ceil(page.getWidth()*scale);canvas.height=Math.ceil(page.getHeight()*scale);const ctx=canvas.getContext('2d',{alpha:false,colorSpace:'srgb'});if(!ctx)throw Error('画像PDFの作成に対応していないブラウザです。');ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.scale(scale,scale);ctx.fontKerning='none';ctx.textBaseline='alphabetic';
 for(const c of commands){ctx.save();if(c.op==='rect'){ctx.fillStyle=css(c.fill);ctx.fillRect(c.x,c.y,c.w,c.h);if(c.border){ctx.strokeStyle=css(c.border);ctx.lineWidth=.6;ctx.strokeRect(c.x,c.y,c.w,c.h);}}
 else if(c.op==='line'){ctx.beginPath();ctx.strokeStyle=css(c.color);ctx.lineWidth=c.width;ctx.setLineDash(c.dash||[]);ctx.moveTo(c.x,c.y);ctx.lineTo(c.x2,c.y2);ctx.stroke();}
 else if(c.op==='circle'){ctx.fillStyle=css(c.color);ctx.beginPath();ctx.arc(c.x,c.y,c.r,0,Math.PI*2);ctx.fill();}
 else if(c.op==='text'){ctx.globalAlpha=1;ctx.fillStyle=css(c.color);ctx.font=c.size+'px "'+c.family+'"';ctx.translate(c.x,c.baseline);ctx.rotate(-c.rotation*Math.PI/180);ctx.fillText(c.text,0,0);}ctx.restore();}
 return canvas.toDataURL('image/png');
}
function rng(seed){let n=2166136261;for(const c of seed){n=Math.imul(n^c.codePointAt(0),16777619);}return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};}
async function handReceipt(d,doc,base,painter,logo){const data=await loadHandData(),key=d.handwriting==='neat'?'klee':'yomogi',font=await doc.embedFont(decode(data[key]),{subset:true});font._demoFamily=families[key];const page=doc.addPage([595.28,365]),p=painter(page,base),pen=painter(page,font),rand=rng(d.seed+'|'+d.id+'|pen-v1');
 const colors=[[.34,.48,.38],[.31,.42,.54],[.60,.39,.34]],accent=colors[d.template],printed=[0,0,0],penInk=printed,m=22,W=page.getWidth(),right=W-m;
 p.rect(0,0,W,365,[.998,.996,.982]);p.rect(m,18,W-2*m,300,[1,.999,.990],accent);p.rect(m+1,19,5,298,accent);p.line(m+10,65,right-10,65,accent,.8);p.text('領　収　書',m+205,27,24,accent);p.right('No. '+d.id,m+365,31,153,9,printed);
 function hand(value,x,y,size,width){const s=String(value);let fs=size;while(font.widthOfTextAtSize(s,fs)>width&&fs>6)fs-=.25;if(d.handwriting==='scrawl'){
  // Vary each glyph while retaining the exact source text and a safe field width.
  const strokes=Array.from(s,ch=>({ch,scale:.84+rand()*.30,rotation:(rand()-.5)*18,lift:(rand()-.5)*.22,gap:.03+rand()*.12}));
  const span=pt=>strokes.reduce((sum,t)=>sum+font.widthOfTextAtSize(t.ch,pt*t.scale)+pt*t.gap,pt*.36);
  while(span(fs)>width&&fs>6)fs-=.25;
  let at=x+fs*.18;for(const t of strokes){const pt=fs*t.scale;pen.text(t.ch,at,y+fs-pt+t.lift*fs,pt,penInk,{width:Math.max(30,width-(at-x)+4),rotation:t.rotation});at+=font.widthOfTextAtSize(t.ch,pt)+fs*t.gap;}return;
 }if(d.handwriting!=='uneven'){pen.text(s,x,y,fs,penInk,{width,rotation:d.handwriting==='natural'?-.45:0});return;}
  const chars=Array.from(s),extra=.10;while(font.widthOfTextAtSize(s,fs)+chars.length*extra>width&&fs>6)fs-=.25;let at=x;for(const ch of chars){const dy=(rand()-.5)*1.4,rotation=(rand()-.5)*3.2;pen.text(ch,at,y+dy,fs,penInk,{width:Math.max(30,width-(at-x)+4),rotation});at+=font.widthOfTextAtSize(ch,fs)+extra+(rand()-.5)*.18;}
 }
 const date=d.date.split('-').map(Number);hand(date[0]+' 年 '+date[1]+' 月 '+date[2]+' 日',370,76,13,175);
 p.text('宛名',m+17,84,8,printed);hand(d.buyer,m+17,101,19,480);p.line(m+17,128,right-18,128,accent,.7);
 p.rect(m+17,145,W-2*m-35,49,[.973,.976,.947],accent);p.text('金額',m+28,160,10,accent);hand('￥ '+g.VoucherCore.yen(d.totals.gross)+' －',m+105,145,31,385);p.text('税込',right-53,177,8,printed);
 p.text('但し',m+17,211,10,printed);const desc=d.items[0].name+(d.items.length>1?' ほか '+d.items.length+'点':'')+' の代金として';hand(desc,m+52,204,13,465);p.line(m+52,230,right-18,230,accent,.6);p.text('上記正に領収いたしました。',m+17,239,9,printed);
 const ys=260;for(const [i,t] of d.totals.groups.filter(t=>t.amount).entries()){p.text(t.rate+'%対象 '+(d.pricing==='inclusive'?'税込 ':'税抜 ')+g.VoucherCore.yen(t.amount)+'円',m+17,ys+i*17,8,printed,{width:170});p.text((d.pricing==='inclusive'?'内消費税 ':'外消費税 ')+g.VoucherCore.yen(t.tax)+'円',m+193,ys+i*17,8,printed,{width:120});}
 logo(p,d.merchant.logo,373,250,18,accent);p.text(d.merchant.name,401,250,11,printed,{width:145});p.text(d.merchant.address,373,273,7,printed,{width:174});p.text('登録番号 '+g.VoucherCore.DUMMY+'（ダミー）',373,288,7,printed,{width:174});
 p.text('軽減8%は持ち帰り食品。税率別に証憑1枚につき1回の端数処理。',m+17,301,6.5,printed,{width:490});p.center('全件架空・デモ専用 / 実在の企業・店舗・署名・印影は使用していません。',330,7,printed);p.center('登録番号は無効なダミーです。実事業者照会は対象外。',342,7,printed);return page;
}
g.VoucherArtwork={raster,handReceipt,families,IMAGE_DPI};
})(globalThis);
