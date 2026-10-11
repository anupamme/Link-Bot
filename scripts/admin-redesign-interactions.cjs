const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('fs');
const out=require('path').resolve(process.env.QA_OUTPUT || 'tmp/admin-redesign');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
for(const consoleMode of [false,true]){
 const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});let fail=false,requests=0,saved=null;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/mini-app/app.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text())+'\nwindow.__qa={state,render};'});});
 await page.route('**/api/mini-app/admin/**',async route=>{const path=new URL(route.request().url()).pathname,body=route.request().postDataJSON()||{};let data={};
  if(path.endsWith('/send'))throw new Error('Must not send messages in QA');
  if(path.endsWith('/broadcast/state'))data={status:'draft',sourceKind:'text',sourcePreview:'Проверка',buttons:[]};
  if(path.endsWith('/email/state'))data={configured:true,draft:{status:'draft',subject:'Проверка',body:'Текст',audience:{category:'all'}}};
  if(path.endsWith('/broadcast/audience')){requests++;await new Promise(r=>setTimeout(r,900));if(fail){await route.fulfill({status:502,json:{ok:false,error:{code:'audience_unavailable',message:'Панель временно недоступна. Повторите подсчёт.'}}});return;}data={count:42,audience:body.audience,draft:{status:'draft',sourceKind:'text',sourcePreview:'Проверка',buttons:[],audience:body.audience,updatedAt:'2026-10-11T11:00:00Z'}};}
  if(path.endsWith('/settings/update')){saved=body;data=body.settings;}
  await route.fulfill({json:{ok:true,data}});
 });
 const mode=consoleMode?'console':'cabinet';
 const open=async section=>{await page.goto((process.env.QA_BASE_URL || 'http://127.0.0.1:8790')+'/mini-app/?preview=1&admin=1'+(consoleMode?'&console=1':'')+'&page=admin&section='+section);await page.locator(consoleMode?'.rn-main':'.app-shell').waitFor();await page.evaluate(()=>document.fonts.ready);};
 await open('broadcast');
 for(const channel of ['telegram','email']){
  if(channel==='email')await page.locator('[data-action="admin-broadcast-tab"][data-value="email"]').click();
  const button=page.locator('[data-action="admin-audience-check"]');
  await button.click();await page.locator('.audience-count[aria-busy="true"]').waitFor();assert.equal(await button.isDisabled(),true);
  await page.locator('.audience-count').filter({hasText:'42 получателей'}).waitFor();assert.equal(await button.isDisabled(),false);
  fail=true;await button.click();await page.locator('.audience-error').waitFor();assert.match(await page.locator('.audience-error').innerText(),/Панель временно/);assert.equal(await button.isDisabled(),false);
  await page.screenshot({path:`${out}/${mode}-${channel}-error.png`});
  fail=false;await button.click();await page.locator('.audience-count').filter({hasText:'42 получателей'}).waitFor();assert.equal(await page.locator('.audience-error').count(),0);
 }
 assert.equal(requests,6);
 await open('integrations');
 await page.evaluate(()=>{const {state,render}=__qa;state.data.admin.integrations.push({id:'payhot',name:'PayHot',kind:'payment',enabled:true,configured:true,fields:[{key:'apiKey',label:'API ключ',help:'Длинная подсказка под полем: проверяем, что пояснения не сдвигают соседнюю строку ввода.'},{key:'merchantId',label:'Магазин'},{key:'paymentMethod',label:'Способ оплаты',help:'Метод для счёта'},{key:'currency',label:'Валюта',value:'RUB'}]});state.adminIntegrationOpen='payhot';render();});
 for(const width of [320,768,1920]){
  await page.setViewportSize({width,height:960});
  const boxes=await page.locator('[data-integration-field]').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {key:e.dataset.integrationField,x:r.x,y:r.y,width:r.width,height:r.height,right:r.right};}));
  for(const box of boxes){assert.ok(box.x>=0&&box.right<=width+1,JSON.stringify(box));assert.ok(box.height>=39);}
  if(width>=768){assert.ok(Math.abs(boxes[0].y-boxes[1].y)<1,'first row aligned to a pixel');assert.ok(Math.abs(boxes[2].y-boxes[3].y)<1,'second row aligned to a pixel');}
  await page.screenshot({path:`${out}/${mode}-${width}-payment-alignment.png`});
 }
 await page.setViewportSize({width:390,height:844});await open('trial');
 const days=page.locator('[data-setting-path="trial.days"]');await days.fill('7');await days.blur();
 await page.locator('[data-action="admin-save-settings"]').click();await page.waitForFunction(()=>document.querySelector('[data-action="admin-save-settings"]')?.disabled);assert.equal(saved.settings.trial.days,7);
 const scroll=page.locator(consoleMode?'.rn-main':'.page-scroll').first();await scroll.evaluate(e=>e.scrollTop=e.scrollHeight);await page.screenshot({path:`${out}/${mode}-trial-saved-bottom.png`});
 assert.deepEqual(errors,[]);console.log('PASS',mode,'both channels: loading, disabled controls, errors, retry; exact field alignment 320/768/1920; settings saved');await page.close();
}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
