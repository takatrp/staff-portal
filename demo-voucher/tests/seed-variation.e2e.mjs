import assert from 'node:assert/strict';

const instant='2026-10-30T08:00:00Z';

async function ready(page){
 await page.waitForFunction(()=>!document.getElementById('downloadZip').disabled&&document.getElementById('previewLoading').hidden,undefined,{timeout:90_000});
 assert.equal(await page.locator('#error').isVisible(),false);
}

async function snapshot(page){
 await ready(page);
 return {seed:await page.locator('#seed').inputValue(),amounts:await page.locator('.doc-amount').allTextContents()};
}

async function newPage(browser,url){
 const context=await browser.newContext();
 const page=await context.newPage();
 await page.clock.install({time:new Date(instant)});
 await page.goto(url,{waitUntil:'domcontentloaded'});
 return {context,page};
}

export async function verifySeedVariation(browser,url){
 const first=await newPage(browser,url);
 try{
  const a=await snapshot(first.page);
  await first.page.getByRole('button',{name:'この条件で生成',exact:true}).click();
  const b=await snapshot(first.page);
  await first.page.reload({waitUntil:'domcontentloaded'});
  const c=await snapshot(first.page);
  const second=await newPage(browser,url);
  let d;
  try{d=await snapshot(second.page);}finally{await second.context.close();}
  assert.equal(new Set([a.seed,b.seed,c.seed,d.seed]).size,4,'同時刻の再生成・再訪問でもseedを再利用しない');
  for(const item of [a,b,c,d])assert.equal(item.amounts.length,20);
  assert.equal(new Set([a,b,c,d].map(item=>item.amounts.join('|'))).size,4,'一覧の金額も変わる');
  await first.page.locator('details summary').click();
  await first.page.locator('#seed').fill('manually-fixed-seed');
  await first.page.getByRole('button',{name:'この条件で生成',exact:true}).click();
  const fixed1=await snapshot(first.page);
  await first.page.getByRole('button',{name:'この条件で生成',exact:true}).click();
  const fixed2=await snapshot(first.page);
  assert.deepEqual(fixed2,fixed1,'明示seedは同じ条件を再現する');
  return {sameInstantFreshSeeds:4,distinctAmountLists:4,explicitSeedReproducible:true};
 }finally{await first.context.close();}
}
