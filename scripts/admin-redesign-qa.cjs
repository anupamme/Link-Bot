const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('node:assert/strict');
const out=require('path').resolve(process.env.QA_OUTPUT || 'tmp/admin-redesign');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
const report=[];
for(const mode of ['console','cabinet'])for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:960},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/mini-app/app.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text())+'\nwindow.__qa={state,render};'});});
 await page.route('**/api/mini-app/admin/**',async route=>{let data={};const path=new URL(route.request().url()).pathname,body=route.request().postDataJSON()||{};
  if(path.endsWith('/broadcast/state'))data={status:'draft',sourceKind:'text',sourcePreview:'Новости сервиса',buttons:[],audience:{category:'all'},updatedAt:'2026-10-11T10:00:00Z'};
  else if(path.endsWith('/email/state'))data={configured:true,draft:{status:'draft',subject:'Новости',body:'Текст письма',audience:{category:'all'}},availableRecipients:120};
  else if(path.endsWith('/broadcast/audience')){await new Promise(r=>setTimeout(r,350));data={count:120,audience:body.audience,draft:{status:'draft',audience:body.audience,buttons:[],updatedAt:'2026-10-11T10:00:01Z'}};}
  else if(path.endsWith('/settings/update'))data=body.settings;
  else if(path.endsWith('/audience/options'))data={internal:[],external:[]};
  await route.fulfill({json:{ok:true,data}});
 });
 const sections=process.argv.slice(2).length?process.argv.slice(2):['home','users','subscriptions','plans','administrators','finance','analytics','promocodes','referrals','partners','broadcast','integrations','moynalog','content','appearance','layout','subpage','localization','status','diagnostics','features','trial','grace','ai','push','maintenance'];
 for(const section of sections){
  await page.goto((process.env.QA_BASE_URL || 'http://127.0.0.1:8790')+'/mini-app/?preview=1&admin=1'+(mode==='console'?'&console=1':'')+'&page=admin&section='+section);
  await page.locator(mode==='console'?'.rn-main':'.app-shell').waitFor();await page.evaluate(()=>document.fonts.ready);
  if(section==='integrations'){
   await page.evaluate(()=>{const {state,render}=__qa;state.data.admin.integrations.push({id:'payhot',name:'PayHot',description:'Приём платежей',kind:'payment',enabled:true,configured:true,fields:[{key:'apiKey',label:'API ключ',secret:true,help:'Ключ из личного кабинета PayHot. Не публикуйте его.'},{key:'merchantId',label:'ID магазина',help:'Идентификатор магазина'},{key:'paymentMethod',label:'Способ оплаты',help:'Метод оплаты для выставления счёта'},{key:'currency',label:'Валюта',value:'RUB'}]});state.adminIntegrationOpen='payhot';render();});
  }
  if(section==='broadcast'){
   await page.locator('[data-action="admin-audience-check"]').click();await page.locator('.audience-count').filter({hasText:'120 получателей'}).waitFor();
  }
  await page.screenshot({path:`${out}/${mode}-${width}-${section}.png`,fullPage:false});
  const pane=page.locator(mode==='console'?'.rn-main':'.page-scroll').first();
  if(await pane.count()){const tall=await pane.evaluate(e=>e.scrollHeight>e.clientHeight+100);if(tall){await pane.evaluate(e=>e.scrollTop=e.scrollHeight);await page.screenshot({path:`${out}/${mode}-${width}-${section}-bottom.png`});await pane.evaluate(e=>e.scrollTop=0);}}
  const result=await page.evaluate(()=>{
   const root=document.querySelector('.rn-content')||document.querySelector('#page-admin')||document.querySelector('.rn-page')||document.querySelector('.admin-plan-editor')||document.querySelector('.app-shell'),box=root.getBoundingClientRect();
   const visible=e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).visibility!=='hidden'};
   const overflow=[...root.querySelectorAll('input,select,textarea,button')].filter(visible).filter(e=>!e.closest('.modal,.admin-content-tabs,.admin-user-table-wrap,[class*="TableContainer"],.admin-plan-periods')).map(e=>({e,r:e.getBoundingClientRect()})).filter(({r})=>r.left<box.left-2||r.right>box.right+2).map(({e,r})=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,30),left:r.left,right:r.right}));
   return {width:box.width,scroll:root.scrollWidth,nestedButtons:root.querySelectorAll('button button').length,nestedLabels:root.querySelectorAll('label label').length,overflow};
  });report.push({mode,viewportWidth:width,section,...result});console.log(mode,width,section,JSON.stringify(result));
 }
 console.log('errors',mode,width,errors);assert.deepEqual(errors,[]);await page.close();
}
fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
assert.equal(report.filter(r=>r.nestedButtons||r.nestedLabels||r.overflow.length).length,0,'No nested interactive controls or clipped controls');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
