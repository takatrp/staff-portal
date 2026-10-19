/* A4 shelf layout in millimetres. No scaling, rotation or cropping. */
(function(g){'use strict';
function layout(items,{landscape=false,margin=10,gap=5}={}){
 const width=landscape?297:210,height=landscape?210:297,pages=[];
 if(!Number.isFinite(margin)||margin<0||!Number.isFinite(gap)||gap<0)throw Error('印刷の余白・間隔が正しくありません。');
 let page,x=margin,y=margin,rowHeight=0;
 for(const item of items){
  if(!Number.isFinite(item.width)||!Number.isFinite(item.height)||item.width<=0||item.height<=0)throw Error('証憑の印刷寸法が正しくありません。');
  if(item.width>width-margin*2+.001||item.height>height-margin*2+.001)throw Error(item.id+'（'+item.width.toFixed(1)+' × '+item.height.toFixed(1)+' mm）はA4の印刷領域に収まりません。縮小・切断は行いません。「このPDF」から保存し、対応する長い用紙に実際のサイズで印刷してください。');
  if(!page){page={width,height,landscape,items:[]};pages.push(page);}
  if(x+item.width>width-margin+.001){x=margin;y+=rowHeight+gap;rowHeight=0;}
  if(y+item.height>height-margin+.001){page={width,height,landscape,items:[]};pages.push(page);x=margin;y=margin;rowHeight=0;}
  page.items.push({...item,x,y});x+=item.width+gap;rowHeight=Math.max(rowHeight,item.height);
 }
 return pages;
}
const api={layout};if(typeof module!=='undefined')module.exports=api;g.VoucherPrint=api;
})(globalThis);
