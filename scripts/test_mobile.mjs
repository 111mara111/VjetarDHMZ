// Mobile regression and paired performance checks. Run in CI, not on a physical phone.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {webkit,chromium} from 'playwright';
const baseline='332d004b4076f7c67da1964d7807893478cee752';
const root=path.resolve('web'),out=path.resolve('benchmark-results');fs.mkdirSync(out,{recursive:true});
const previous=execFileSync('git',['show',baseline+':web/index.html'],{encoding:'utf8'});
const current=fs.readFileSync(path.join(root,'index.html'),'utf8');
const mime={'.html':'text/html; charset=utf-8','.json':'application/json','.js':'text/javascript','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 res.setHeader('Cache-Control','no-store');
 if(p==='/before.html'){res.setHeader('Content-Type',mime['.html']);return res.end(previous)}
 const file=path.resolve(root,p.slice(1)||'index.html');
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
 fs.readFile(file,(e,b)=>{if(e){res.writeHead(404);return res.end()}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(b)});
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const now=new Date().toISOString(),old=new Date(Date.now()-24*3600000).toISOString();
const sample='TEST prognoza. Bura i tramontana, more umjereno valovito. Čuvati hrvatske znakove: čćšđž.\n\n'.repeat(70);
// Deliberately labeled fixtures verify controls, scrolling and rejected stale data.
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="660"><rect width="600" height="660" fill="#deeff8"/><text x="30" y="70" font-size="30">TEST FRAME</text></svg>';
const frames=Array.from({length:4},(_,i)=>({path:`data/radar-frames/test-${i}.png`,measuredUtc:new Date(Date.now()-(3-i)*5*60000).toISOString()}));
const regions=Object.fromEntries(['MASL','SENJ','SPLI','DUBR','HRv8'].map(r=>[r,{status:'current',modelUtc:now,checkedAt:now,previewPath:`data/test-${r}.png`,previewHour:0}]));
const fixture={manifest:{generatedAt:now,maxModelAgeHours:16,regions},radar:{status:'current',measuredUtc:now,checkedAt:now,timeline:frames},texts:Object.fromEntries(['nauticari','pomorci'].map(s=>[s,{status:'current',issuedUtc:now,checkedAt:now,text:sample}]))};
async function useFixtures(page,state){await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.pathname.endsWith('/manifest.json'))return route.fulfill({json:state.manifest});if(u.pathname.endsWith('/radar.json'))return route.fulfill({json:state.radar});if(u.pathname.endsWith('/texts.json'))return route.fulfill({json:state.texts});if(u.pathname==='/anim_kompozit.gif'||/\.(png|webp)$/.test(u.pathname))return route.fulfill({contentType:'image/svg+xml',body:svg});return route.continue()})}
const dimensions=[[375,600],[390,664],[402,740],[402,874],[430,932],[874,402]];
async function layout(page,section){
 const result=await page.evaluate(section=>{const visible=[...document.querySelectorAll('#'+section+' button,#'+section+' input,#'+section+' a,.main-nav button,#tabs button')].filter(e=>e.getClientRects().length);const bad=visible.filter(e=>{const b=e.getBoundingClientRect();return b.top<-.5||b.left<-.5||b.bottom>innerHeight+.5||b.right>innerWidth+.5}).map(e=>e.id||e.textContent);const viewport=document.querySelector(section==='radar'?'#radar-viewport':'#map-container').getBoundingClientRect();const slider=document.querySelector(section==='radar'?'#radar-slider':'#slider').getBoundingClientRect();return{bad,width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,mapHeight:viewport.height,sliderTop:slider.top,mapBottom:viewport.bottom}},section);
 assert.deepEqual(result.bad,[]);assert.ok(result.scrollHeight<=result.height);assert.ok(result.scrollWidth<=result.width);
 if(['wind','radar'].includes(section)){assert.ok(result.mapHeight>75);if(result.width<600)assert.ok(result.sliderTop>=result.mapBottom)}
 return result;
}
const results={baseline,engines:{},performance:{}};
let activeBrowser;
try{for(const [name,engine] of [['webkit',webkit],['chromium',chromium]]){
 const browser=await engine.launch({headless:true});activeBrowser=browser;const context=await browser.newContext({viewport:{width:402,height:740},isMobile:true,hasTouch:true,serviceWorkers:'block'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let state=structuredClone(fixture);await useFixtures(page,state);
 const checks=[];
 for(const [width,height] of dimensions){await page.setViewportSize({width,height});await page.goto(base,{waitUntil:'load'});await page.waitForFunction(()=>document.querySelector('#image').naturalWidth>0&&!document.querySelector('#image').classList.contains('hidden'));assert.equal(await page.locator('#slider').inputValue(),'0');assert.equal(await page.locator('#install').count(),0);
 assert.equal(await page.locator('#hour').count(), 0);
 assert.ok(await page.locator('#date').evaluate(date => {
  const map = document.getElementById('map-container').getBoundingClientRect();
  const bounds = date.getBoundingClientRect();
  const style = getComputedStyle(date);
  return date.textContent !== '—' && bounds.top >= map.bottom - 1
   && bounds.bottom <= innerHeight && Math.abs(bounds.x + bounds.width / 2 - (map.x + map.width / 2)) < 1
   && style.textAlign === 'center' && parseFloat(style.fontSize) >= 18;
 }), 'Forecast time must be centered immediately below the wind image');

 for(const section of ['wind','radar','douglas','nauticari','pomorci']){await page.locator(`[data-section="${section}"]`).click();if(section==='radar')await page.waitForFunction(()=>document.querySelector('#radar-image').naturalWidth>0&&!document.querySelector('#radar-image').classList.contains('hidden'));if(['nauticari','pomorci'].includes(section)){await page.waitForFunction(s=>document.querySelector('#text-'+s).textContent.startsWith('TEST'),section);await page.waitForTimeout(40)}checks.push({section,...await layout(page,section)})}}
 // Verify both reports scroll independently, including their last line.
 for (const section of ['nauticari', 'pomorci']) {
  await page.locator(`[data-section="${section}"]`).click();
  const report = page.locator('#text-' + section);
  assert.equal(await report.textContent(), sample);
  assert.equal(await page.locator('.forecast-pages').count(), 0);
  const scrolled = await report.evaluate(element => {
   element.scrollTop = element.scrollHeight;
   return element.scrollTop > 0
    && element.scrollHeight - element.clientHeight - element.scrollTop <= 1
    && window.scrollY === 0;
  });
  assert.ok(scrolled, 'Full report must scroll inside its panel');
  state.texts[section].text = 'TEST kratka prognoza.';
  await page.locator(`[data-section="${section}"]`).click();
  await page.waitForFunction(id => document.getElementById(id).textContent === 'TEST kratka prognoza.', 'text-' + section);
  assert.ok(await report.evaluate(element => element.scrollHeight <= element.clientHeight && element.scrollTop === 0));
 }
 await page.setViewportSize({width:402,height:740});await page.locator('[data-section="wind"]').click();
 for(const region of ['MASL','SENJ','SPLI','DUBR','HRv8']){await page.locator(`[data-r="${region}"]`).click();await page.waitForFunction(()=>document.querySelector('#image').naturalWidth>0&&!document.querySelector('#image').classList.contains('hidden'));assert.equal(await page.locator('#slider').inputValue(),'0')}
 await page.locator('[data-h="72"]').click();await page.waitForFunction(()=>document.querySelector('#slider').value==='72');await page.locator('#prev').click();await page.waitForFunction(()=>document.querySelector('#slider').value==='71');await page.locator('[data-h="0"]').click();await page.locator('#play').click();await page.waitForFunction(()=>Number(document.querySelector('#slider').value)>0);await page.locator('#play').click();await page.locator('#zoom').click();assert.ok((await page.locator('#image').getAttribute('style')).includes('scale(2)'));await page.locator('#fit').click();
 await page.locator('[data-section="radar"]').click();await page.waitForFunction(()=>document.querySelector('#radar-play').textContent.includes('Pauza'));await page.locator('#radar-static').click();await page.locator('#radar-slider').evaluate(s=>{s.value='0';s.dispatchEvent(new Event('input',{bubbles:true}))});await page.waitForFunction(()=>document.querySelector('#radar-slider').value==='0'&&document.querySelector('#radar-image').src.includes('test-0'));
 // Screenshot is explicitly fixture QA, not weather evidence.
 await page.screenshot({path:path.join(out,name+'-mobile-radar-fixture.png')});
 state.manifest.regions=Object.fromEntries(Object.keys(regions).map(r=>[r,{status:'current',modelUtc:old,checkedAt:old}]));state.radar={...fixture.radar,measuredUtc:old,checkedAt:old};await page.reload();await page.waitForFunction(()=>document.querySelector('#refresh').disabled===false);assert.ok(await page.locator('#image').evaluate(e=>e.classList.contains('hidden')));await page.locator('[data-section="radar"]').click();await page.waitForFunction(()=>document.querySelector('#radar-image').src.startsWith('https://vrijeme.hr/anim_kompozit.gif?'));assert.ok(await page.locator('#radar-slider').isDisabled());await page.locator('#radar-static').click();await page.waitForFunction(()=>document.querySelector('#radar-image').src.startsWith('https://vrijeme.hr/kompozit-stat.png?'));
 await page.emulateMedia({colorScheme:'dark'});assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(9, 21, 34)');await layout(page,'radar');
 assert.deepEqual(errors,[]);results.engines[name]={layoutCases:checks.length,checks,fullTextPreserved:true,regions:5,windAnimation:true,radarManual:true,expiredDataHidden:true,errors};console.log('MOBILE_PASS',name,checks.length,'layout cases, scrolling, all regions, controls, stale data');await context.close();
 // Compare against immediately previous production version with the SAME real generated assets.
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/manifest.json'),'utf8')),radar=JSON.parse(fs.readFileSync(path.join(root,'data/radar.json'),'utf8'));
 const validWind=manifest.regions?.MASL?.status==='current'&&manifest.regions.MASL.previewPath;
 const validRadar=radar.timeline?.length&&Date.now()-Date.parse(radar.measuredUtc)<2*3600000;
 if(validWind&&validRadar){const data={before:{wind:[],radar:[],scrub:[],report:[]},after:{wind:[],radar:[],scrub:[],report:[]}};
 for(let i=0;i<9;i++){for(const kind of i%2?['after','before']:['before','after']){const c=await browser.newContext({viewport:{width:402,height:740},isMobile:true,hasTouch:true,serviceWorkers:'block'});const p=await c.newPage();await p.addInitScript(()=>{window.addEventListener('DOMContentLoaded',()=>{const watch=()=>{const image=document.getElementById('image');if(image&&!image.classList.contains('hidden')&&image.complete&&image.naturalWidth>0){requestAnimationFrame(()=>document.documentElement.dataset.firstVisibleMs=String(performance.now()));return}requestAnimationFrame(watch)};watch()})});await p.goto(base+(kind==='before'?'/before.html':'/'),{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>document.documentElement.dataset.firstVisibleMs,{},{timeout:25000});data[kind].wind.push(Number(await p.locator('html').getAttribute('data-first-visible-ms')));
 const elapsed=await p.evaluate(async()=>{const t=performance.now();document.querySelector('[data-section="radar"]').click();return new Promise(resolve=>{const check=()=>{const im=document.querySelector('#radar-image');if(!im.classList.contains('hidden')&&im.naturalWidth>0&&im.complete){requestAnimationFrame(()=>resolve(performance.now()-t));return}requestAnimationFrame(check)};check()})});data[kind].radar.push(elapsed);
 await p.locator('[data-section="wind"]').click();await p.locator('#next').click();await p.waitForFunction(()=>document.querySelector('#image').src.includes('_01.png'),{},{timeout:18000});const scrub=await p.evaluate(async()=>{const t=performance.now(),s=document.querySelector('#slider');s.value='0';s.dispatchEvent(new Event('input',{bubbles:true}));return new Promise(resolve=>{const check=()=>{if(document.querySelector('#image').src.includes('h=0')){requestAnimationFrame(()=>resolve(performance.now()-t));return}requestAnimationFrame(check)};check()})});data[kind].scrub.push(scrub);
 await p.route('**/data/texts.json?*', route => route.fulfill({json:fixture.texts}));
 const report = await p.evaluate(async () => {
  const started = performance.now();
  document.querySelector('[data-section="nauticari"]').click();
  return new Promise((resolve, reject) => {
   const check = () => {
    if (document.getElementById('text-nauticari').textContent.startsWith('TEST')) {
     requestAnimationFrame(() => resolve(performance.now() - started));
    } else if (performance.now() - started > 5000) {
     reject(new Error('Forecast text did not appear'));
    } else requestAnimationFrame(check);
   };
   check();
  });
 });
 data[kind].report.push(report);
 await c.close()}}
 const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];const summary={};for(const metric of ['wind','radar','scrub','report'])summary[metric]={before:Math.round(median(data.before[metric])),after:Math.round(median(data.after[metric]))};results.performance[name]={summary,data,attempts:9,conditions:'Fresh browser contexts, mobile viewport, same real generated assets, local server, service worker blocked; not physical iPhone/network latency.'};console.log('MOBILE_PERFORMANCE',name,JSON.stringify(summary));
 // Network timing is noisy: fail a material regression, report exact medians for review.
 for(const metric of ['wind','radar','scrub','report'])assert.ok(summary[metric].after<=summary[metric].before+Math.max(25,summary[metric].before*.10),'Material first-frame regression: '+metric);
 }else{results.performance[name]={skipped:true,reason:'No current verified wind/radar assets; no invented timing'};console.log('MOBILE_PERFORMANCE_SKIPPED',name)}
 await browser.close();
}assert.ok(current.includes('100dvh'));console.log('ALL_MOBILE_CHECKS_PASS');
}finally{if(activeBrowser)await activeBrowser.close();server.closeAllConnections();fs.writeFileSync(path.join(out,'mobile-checks.json'),JSON.stringify(results,null,2));await new Promise(r=>server.close(r))}
