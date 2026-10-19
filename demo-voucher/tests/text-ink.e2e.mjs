import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';
const require=createRequire(import.meta.url),PDF=require('../vendor/pdf-lib.min.js');

// Locate opaque glyph cores with the loaded font, then inspect those locations in
// the saved PDF's RGB image. Antialiased edge pixels are deliberately excluded.
export async function installTextInkProbe(page){
 await page.evaluate(()=>{
  window.__sampleTextInk=(page,doc)=>{
   const commands=page._demoPaint.filter(c=>c.op==='text');
   if(!commands.length||commands.some(c=>c.color.some(v=>v!==0)||c.opacity!==1))throw Error('Voucher text must be opaque RGB black');
   const samples=[],pick=(role,predicate)=>{const c=commands.find(predicate);if(!c)throw Error('Missing text sample '+role);samples.push({role,command:c});};
   pick('merchant',c=>c.text===doc.merchant.name);
   pick('tax',c=>c.text.includes('消費税'));
   pick('note',c=>c.text.startsWith('全件架空'));
   if(doc.receiptStyle==='handwritten'){
    pick('date',c=>c.family!=='DemoNotoJP'&&c.baseline>75&&c.baseline<100);
    pick('amount',c=>c.family!=='DemoNotoJP'&&c.size>=20);
    pick('buyer',c=>c.family!=='DemoNotoJP'&&c.baseline>100&&c.baseline<130);
   }else{
    pick('date',c=>c.text.includes(doc.date));
    pick('amount',c=>c.text.includes('¥ '+VoucherCore.yen(doc.totals.gross)));
    pick('item',c=>c.text.startsWith(doc.items[0].name));
    if(doc.type==='invoice')pick('table-heading',c=>c.text.startsWith('品名'));
   }
   if(commands.some(c=>c.size===4))pick('four-point',c=>c.size===4);
   const scale=VoucherArtwork.IMAGE_DPI/72;
   const spaced=(points,count)=>points.filter((_,i)=>i%Math.max(1,Math.ceil(points.length/count))===0).slice(0,count);
   const regions=samples.map(({role,command:c})=>{
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{alpha:false,colorSpace:'srgb'});
    ctx.font=c.size+'px "'+c.family+'"';ctx.fontKerning='none';ctx.textBaseline='alphabetic';
    const metric=ctx.measureText(c.text),angle=-c.rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
    const corners=[[-metric.actualBoundingBoxLeft,-metric.actualBoundingBoxAscent],[metric.actualBoundingBoxRight,-metric.actualBoundingBoxAscent],[-metric.actualBoundingBoxLeft,metric.actualBoundingBoxDescent],[metric.actualBoundingBoxRight,metric.actualBoundingBoxDescent]].map(([x,y])=>[c.x+x*cos-y*sin,c.baseline+x*sin+y*cos]);
    const x0=Math.floor(Math.min(...corners.map(p=>p[0]))*scale)-2,y0=Math.floor(Math.min(...corners.map(p=>p[1]))*scale)-2;
    canvas.width=Math.ceil(Math.max(...corners.map(p=>p[0]))*scale)-x0+2;canvas.height=Math.ceil(Math.max(...corners.map(p=>p[1]))*scale)-y0+2;
    ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.setTransform(scale,0,0,scale,-x0,-y0);ctx.translate(c.x,c.baseline);ctx.rotate(angle);
    ctx.globalAlpha=1;ctx.fontKerning='none';ctx.textBaseline='alphabetic';ctx.font=c.size+'px "'+c.family+'"';ctx.fillStyle='#000000';ctx.fillText(c.text,0,0);
    const data=ctx.getImageData(0,0,canvas.width,canvas.height).data,core=[],background=[];
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
     const at=(y*canvas.width+x)*4,point=[x+x0,y+y0];
     if(point[0]<0||point[1]<0||point[0]>=Math.ceil(page.getWidth()*scale)||point[1]>=Math.ceil(page.getHeight()*scale))continue;
     if(data[at]===0&&data[at+1]===0&&data[at+2]===0)core.push(point);
     else if(data[at]===255&&data[at+1]===255&&data[at+2]===255)background.push(point);
    }
    if(!core.length)throw Error('No opaque glyph core: '+role+' '+c.text);
    return{role,text:c.text,font:c.family,size:c.size,core:spaced(core,16),background:spaced(background,32)};
   });
   const coloredGraphics=page._demoPaint.filter(c=>c.op!=='text').some(c=>{const value=c.fill||c.color;return value&&Math.max(...value)-Math.min(...value)>.02&&Math.min(...value)<.8;});
   return{regions,textCommands:commands.length,opacity:1,textColor:[0,0,0],coloredGraphics};
  };
 });
}

export async function inspectTextInk(bytes,probe){
 const pdf=await PDF.PDFDocument.load(bytes),page=pdf.getPages()[0],objects=page.node.Resources().lookup(PDF.PDFName.of('XObject'),PDF.PDFDict);
 const image=pdf.context.lookup(objects.values()[0],PDF.PDFRawStream),width=image.dict.get(PDF.PDFName.of('Width')).asNumber(),height=image.dict.get(PDF.PDFName.of('Height')).asNumber(),rgb=inflateSync(image.getContents());
 assert.equal(rgb.length,width*height*3);
 const pixel=([x,y])=>{assert.ok(x>=0&&x<width&&y>=0&&y<height);const at=(y*width+x)*3;return Array.from(rgb.subarray(at,at+3));};
 let corePixels=0,edgeCandidatesExcluded=0;
 for(const sample of probe.regions){
  assert.ok(sample.core.length>0);
  // Subpixel antialiasing can differ at the cropped mask boundary. Confirm an
  // actual RGB000 glyph interior for every role; exclude those edge candidates.
  const black=sample.core.filter(point=>pixel(point).every(v=>v===0));
  assert.ok(black.length>0,'No pure-black glyph interior: '+sample.role+' / '+sample.text);
  for(const point of black)assert.deepEqual(pixel(point),[0,0,0]);
  corePixels+=black.length;edgeCandidatesExcluded+=sample.core.length-black.length;
  const light=sample.background.filter(point=>pixel(point).every(v=>v>=230)).length;
  assert.ok(light>=Math.ceil(sample.background.length*.25),'Black text needs a light background: '+sample.role+' / '+sample.text);
 }
 return{corePixels,coreRgb:[0,0,0],edgeCandidatesExcluded,roles:probe.regions.map(s=>s.role),opacity:probe.opacity,textCommands:probe.textCommands,coloredGraphics:probe.coloredGraphics};
}

export async function inspectVectorTextInk(bytes){
 const pdf=await PDF.PDFDocument.load(bytes);let blocks=0;
 for(const page of pdf.getPages()){
  const contents=page.node.Contents(),refs=contents instanceof PDF.PDFArray?contents.asArray():[contents];
  for(const ref of refs){const stream=pdf.context.lookup(ref,PDF.PDFRawStream),raw=stream.dict.get(PDF.PDFName.of('Filter'))?.toString()==='/FlateDecode'?inflateSync(stream.getContents()):stream.getContents(),source=Buffer.from(raw).toString('latin1');
   for(const block of source.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)){
    const colors=[...block[1].matchAll(/([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+rg\b/g)];assert.ok(colors.length);
    for(const color of colors)assert.deepEqual(color.slice(1).map(Number),[0,0,0],'Vector text RGB');blocks++;
   }
  }
  const states=page.node.Resources().lookupMaybe(PDF.PDFName.of('ExtGState'),PDF.PDFDict);
  if(states)for(const ref of states.values()){const state=pdf.context.lookup(ref,PDF.PDFDict),opacity=state.get(PDF.PDFName.of('ca'));if(opacity)assert.equal(opacity.asNumber(),1,'Vector text opacity');}
 }
 assert.ok(blocks>0);return{blackTextBlocks:blocks,opacity:1};
}
