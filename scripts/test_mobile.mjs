// Mobile regression and paired performance checks. Run in CI, not on a physical phone.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {webkit,chromium} from 'playwright';
const baseline='918a9e9255ce28b8ec6c4515dfb92d7b3167f397';
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
// Deliberately labeled fixtures verify controls, paging and rejected stale data.
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="660"><rect width="600" height="660" fill="#deeff8"/><text x="30" y="70" font-size="30">TEST FRAME</text></svg>';
const frames=Array.from({length:4},(_,i)=>({path:`data/radar-frames/test-${i}.png`,measuredUtc:new Date(Date.now()-(3-i)*5*60000).toISOString()}));
const regions=Object.fromEntries(['MASL','SENJ','SPLI','DUBR','HRv8'].map(r=>[r,{status:'current',modelUtc:now,checkedAt:now,previewPath:`data/test-${r}.png`,previewHour:0}]));
const fixture={manifest:{generatedAt:now,maxModelAgeHours:16,regions},radar:{status:'current',measuredUtc:now,checkedAt:now,timeline:frames},texts:Object.fromEntries(['nauticari','pomorci'].map(s=>[s,{status:'current',issuedUtc:now,checkedAt:now,text:sample}]))};
async function useFixtures(page,state){await page.route('**/*',async route=>{const u=new URL(route.request().url);if(u.pathname.endsWith('/manifest.json'))return route.fulfill({json:state.manifest});if(u.pathname.endsWith('/radar.json'))return route.fulfill({json:state.radar});if(u.pathname.endsWith('/texts.json'))return route.fulfill({json:state.texts});if(/\.(png|webp)$/.test(u.pathname))return route.fulfill({contentType:'image/svg+xml',body:svg});return route.continue()})}
const dimensions=[[375,600],[390,664],[402,740],[402,874],[430,932],[874,402]];
async function layout(page,section){
 const result=await page.evaluate(section=>{const visible=[...document.querySelectorAll('#'+section+' button,#'+section+' input,#'+section+' a,.main-nav button,#tabs button')].filter(e=>e.getClientRects().length);const bad=visible.filter(e=>{const b=e.getBoundingClientRect();return b.top<-.5||b.left<-.5||b.bottom>innerHeight+.5||b.right>innerWidth+.5}).map(e=>e.id||e.textContent);const viewport=document.querySelector(section==='radar'?'#radar-viewport':'#map-container').getBoundingClientRect();const slider=document.querySelector(section==='radar'?'#radar-slider':'#slider').getBoundingClientRect();return{bad,width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,mapHeight:viewport.height,sliderTop:slider.top,mapBottom:viewport.bottom}},section);
 assert.deepEqual(result.bad,[]);assert.ok(result.scrollHeight<=result.height);assert.ok(result.scrollWidth<=result.width);
 if(['wind','radar'].includes(section)){assert.ok(result.mapHeight>75);if(result.width<600)assert.ok(result.sliderTop>=result.mapBottom)}
 return result;
}
const results={baseline,engines:{},performance:{}};
try{for(const [name,engine] of [['webkit',webkit],['chromium',chromium]]){
 const browser=await engine.launch({headless:true});const context=await browser.newContext({viewport:{width:402,height:740},isMobile:true,hasTouch:true,serviceWorkers:'block'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let state=structuredClone(fixture);await useFixtures(page,state);
 const checks=[];
 for(const [width,height] of dimensions){await page.setViewportSize({width,height});await page.goto(base,{waitUntil:'load'});await page.waitForFunction(()=>document.querySelector('#image').naturalWidth>0&&!document.querySelector('#image').classList.contains('hidden'));assert.equal(await page.locator('#slider').inputValue(),'0');assert.equal(await page.locator('#install').count(),0);
 for(const section of ['wind','radar','douglas','nauticari','pomorci']){await page.locator(`[data-section="${section}"]`).click();if(section==='radar')await page.waitForFunction(()=>document.querySelector('#radar-image').naturalWidth>0&&!document.querySelector('#radar-image').classList.contains('hidden'));if(['nauticari','pomorci'].includes(section)){await page.waitForFunction(s=>document.querySelector('#text-'+s).textContent.startsWith('TEST'),section);await page.waitForTimeout(40)}checks.push({section,...await layout(page,section)})}}
 // Full text must be recoverable, without clipping or losing words at page boundaries.
 for(const section of ['nauticari','pomorci']){await page.locator(`[data-section="${section}"]`).click();let full='';for(let i=0;i<300;i++){full+=await page.locator('#text-'+section).textContent();assert.ok(await page.locator('#text-'+section).evaluate(e=>e.scrollHeight<=e.clientHeight));const next=page.locator('#'+section+' .forecast-pages button').last();if(await next.isDisabled())break;await next.click()}assert.equal(full,sample)}
 await page.setViewportSize({width:402,height:740});await page.locator('[data-section="wind"]').click();
 for(const region of ['MASL','SENJ','SPLI','DUBR','HRv8']){await page.locator(`[data-r="${region}"]`).click();await page.waitForFunction(()=>document.querySelector('#image').naturalWidth>0&&!document.querySelector('#image').classList.contains('hidden'));assert.equal(await page.locator('#slider').inputValue(),'0')}
 await page.locator('[data-h="72"]').click();await page.waitForFunction(()=>document.querySelector('#hour').textContent==='+72 h');await page.locator('#prev').click();await page.waitForFunction(()=>document.querySelector('#hour').textContent==='+71 h');await page.locator('[data-h="0"]').click();await page.locator('#play').click();await page.waitForFunction(()=>Number(document.querySelector('#slider').value)>0);await page.locator('#play').click();await page.locator('#zoom').click();assert.ok((await page.locator('#image').getAttribute('style')).includes('scale(2)'));await page.locator('#fit').click();
 await page.locator('[data-section="radar"]').click();await page.waitForFunction(()=>document.querySelector('#radar-play').textContent.includes('Pauza'));await page.locator('#radar-static').click();await page.locator('#radar-slider').evaluate(s=>{s.value='0';s.dispatchEvent(new Event('input',{bubbles:true}))});await page.waitForFunction(()=>document.querySelector('#radar-slider').value==='0'&&document.querySelector('#radar-image').src.includes('test-0'));
 // Screenshot is explicitly fixture QA, not weather evidence.
 await page.screenshot({path:path.join(out,name+'-mobile-radar-fixture.png')});
 state.manifest.regions=Object.fromEntries(Object.keys(regions).map(r=>[r,{status:'current',modelUtc:old,checkedAt:old}]));state.radar={...fixture.radar,measuredUtc:old,checkedAt:old};await page.reload();await page.waitForFunction(()=>document.querySelector('#refresh').disabled===false);assert.ok(await page.locator('#image').evaluate(e=>e.classList.contains('hidden')));await page.locator('[data-section="radar"]').click();await page.waitForFunction(()=>document.querySelector('#radar-time').textContent==='Radar nije dostupan');assert.ok(await page.locator('#radar-slider').isDisabled());
 assert.deepEqual(errors,[]);results.engines[name]={layoutCases:checks.length,checks,fullTextPreserved:true,regions:5,windAnimation:true,radarManual:true,expiredDataHidden:true,errors};console.log('MOBILE_PASS',name,checks.length,'layout cases, paging, all regions, controls, stale data');await context.close();
 // Compare against immediately previous production version with the SAME real generated assets.
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/manifest.json'),'utf8')),radar=JSON.parse(fs.readFileSync(path.join(root,'data/radar.json'),'utf8'));
 const validWind=manifest.regions?.MASL?.status==='current'&&manifest.regions.MASL.previewPath;
 const validRadar=radar.timeline?.length&&Date.now()-Date.parse(radar.measuredUtc)<2*3600000;
 if(validWind&&validRadar){const data={before:{wind:[],radar:[],scrub:[]},after:{wind:[],radar:[],scrub:[]}};
 for(let i=0;i<9;i++){for(const kind of i%2?['after','before']:['before','after']){const c=await browser.newContext({viewport:{width:402,height:740},isMobile:true,hasTouch:true,serviceWorkers:'block'});const p=await c.newPage();await p.addInitScript(()=>{window.addEventListener('DOMContentLoaded',()=>{const watch=()=>{const image=document.getElementById('image');if(image&&!image.classList.contains('hidden')&&image.complete&&image.naturalWidth>0){requestAnimationFrame(()=>document.documentElement.dataset.firstVisibleMs=String(performance.now()));return}requestAnimationFrame(watch)};watch()})});await p.goto(base+(kind==='before'?'/before.html':'/'),{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>document.documentElement.dataset.firstVisibleMs,{},{timeout:25000});data[kind].wind.push(Number(await p.locator('html').getAttribute('data-first-visible-ms')));
 const elapsed=await p.evaluate(async()=>{const t=performance.now();document.querySelector('[data-section="radar"]').click();return new Promise(resolve=>{const check=()=>{const im=document.querySelector('#radar-image');if(!im.classList.contains('hidden')&&im.naturalWidth>0&&im.complete){requestAnimationFrame(()=>resolve(performance.now()-t));return}requestAnimationFrame(check)};check()})});data[kind].radar.push(elapsed);
 await p.locator('[data-section="wind"]').click();await p.locator('#next').click();await p.waitForFunction(()=>document.querySelector('#image').src.includes('_01.png'),{},{timeout:18000});const scrub=await p.evaluate(async()=>{const t=performance.now(),s=document.querySelector('#slider');s.value='0';s.dispatchEvent(new Event('input',{bubbles:true}));return new Promise(resolve=>{const check=()=>{if(document.querySelector('#image').src.includes('h=0')){requestAnimationFrame(()=>resolve(performance.now()-t));return}requestAnimationFrame(check)};check()})});data[kind].scrub.push(scrub);await c.close()}}
 const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];const summary={};for(const metric of ['wind','radar','scrub'])summary[metric]={before:Math.round(median(data.before[metric])),after:Math.round(median(data.after[metric]))};results.performance[name]={summary,data,attempts:9,conditions:'Fresh browser contexts, mobile viewport, same real generated assets, local server, service worker blocked; not physical iPhone/network latency.'};console.log('MOBILE_PERFORMANCE',name,JSON.stringify(summary));
 // Network timing is noisy: fail a material regression, report exact medians for review.
 for(const metric of ['wind','radar'])assert.ok(summary[metric].after<=summary[metric].before+Math.max(25,summary[metric].before*.10),'Material first-frame regression: '+metric);assert.ok(summary.scrub.after<summary.scrub.before,'Cached scrubbing must be faster');
 }else{results.performance[name]={skipped:true,reason:'No current verified wind/radar assets; no invented timing'};console.log('MOBILE_PERFORMANCE_SKIPPED',name)}
 await browser.close();
}assert.ok(current.includes('100dvh'));console.log('ALL_MOBILE_CHECKS_PASS');
}finally{fs.writeFileSync(path.join(out,'mobile-checks.json'),JSON.stringify(results,null,2));await new Promise(r=>server.close(r))}
