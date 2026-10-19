const {test}=require('node:test'),assert=require('node:assert/strict'),PDF=require('../vendor/pdf-lib.min.js');
async function fixture(color){const doc=await PDF.PDFDocument.create(),page=doc.addPage([72,72]),data=new Uint8Array(300*300*3).fill(255);data.set(color,(10*300+10)*3);const image=doc.context.register(doc.context.flateStream(data,{Type:'XObject',Subtype:'Image',Width:300,Height:300,ColorSpace:'DeviceRGB',BitsPerComponent:8}));page.node.set(PDF.PDFName.of('Resources'),doc.context.obj({XObject:{Im:image}}));return doc.save({useObjectStreams:false});}
const probe={regions:[{role:'amount',text:'123',core:[[10,10]],background:[[20,20]]}],opacity:1,textCommands:1,coloredGraphics:true};
test('保存PDFの文字中心画素で純黒を確認し、灰色・有色・透けた文字を拒否する',async()=>{
 const {inspectTextInk}=await import('./text-ink.e2e.mjs');
 assert.deepEqual((await inspectTextInk(await fixture([0,0,0]),probe)).coreRgb,[0,0,0]);
 for(const color of [[31,41,48],[102,115,122],[26,43,74],[64,64,64]])await assert.rejects(()=>fixture(color).then(bytes=>inspectTextInk(bytes,probe)));
});
test('文字ありPDFも純黒・不透明とし、ロゴや装飾の色は許容する',async()=>{
 const {inspectVectorTextInk}=await import('./text-ink.e2e.mjs');
 const make=async(color,opacity)=>{const doc=await PDF.PDFDocument.create(),font=await doc.embedFont(PDF.StandardFonts.Helvetica),page=doc.addPage([100,100]);page.drawRectangle({x:5,y:5,width:90,height:90,color:PDF.rgb(.9,.7,.2)});page.drawText('123',{x:10,y:20,font,size:15,color:PDF.rgb(...color),opacity});return doc.save({useObjectStreams:false});};
 assert.equal((await inspectVectorTextInk(await make([0,0,0],1))).blackTextBlocks,1);
 for(const [color,opacity] of [[[.12,.16,.19],1],[[1,1,1],1],[[0,0,0],.5]])await assert.rejects(()=>make(color,opacity).then(inspectVectorTextInk));
});
