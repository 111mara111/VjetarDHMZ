// Real browser + real generated DHMZ assets. No synthetic image/network responses.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
const refs={earlier:'1f16cb1d341708ef05b2e2593ea51010e781ee36',before:'4cd63bb19de5abcd2923d71f05ae292e3b1d856b'};
const html=Object.fromEntries(Object.entries(refs).map(([k,v])=>[k,execFileSync('git',['show',v+':web/index.html'],{encoding:'utf8'})]));
html.after=fs.readFileSync('web/index.html','utf8');
const root=path.resolve('web'),manifest=JSON.parse(fs.readFileSync('web/data/manifest.json'));
if(manifest.regions?.MASL?.status!=='current'||!manifest.regions?.MASL?.previewPath){console.log('BENCHMARK_SKIPPED: DHMZ has no recent verified wind preview');process.exit(0)}
const radar=JSON.parse(fs.readFileSync('web/data/radar.json'));
if(radar.status!=='current'||!radar.timeline?.length){console.log('BENCHMARK_SKIPPED: DHMZ radar unavailable');process.exit(0)}
const mime={'.html':'text/html; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.js':'application/javascript'};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const variant=pathname.match(/^\/(earlier|before|after)\.html$/)?.[1];
 if(variant){res.setHeader('Content-Type',mime['.html']);res.end(html[variant]);return;}
 const file=path.resolve(root,pathname.slice(1));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,body)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control',file.endsWith('.json')?'no-cache':'public, max-age=600');res.end(body)});
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
const profile={download_mbps:10,upload_mbps:5,latency_ms:100,viewport:'390x844',service_worker:'blocked for equal cold-cache comparison'};
const samples=[];
async function setup(){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage(),cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:10e6/8,uploadThroughput:5e6/8,connectionType:'cellular4g'});
 return {context,page};
}
async function visible(page,id){await page.waitForFunction(id=>{const e=document.getElementById(id);return e&&!e.classList.contains('hidden')&&e.complete&&e.naturalWidth>0},id,{timeout:30000});}
try{
 for(let trial=1;trial<=3;trial++)for(const variant of trial%2?['earlier','before','after']:['after','before','earlier']){
  const {context,page}=await setup();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   let start=performance.now();await page.goto(base+'/'+variant+'.html',{waitUntil:'domcontentloaded'});await visible(page,'image');const wind=Math.round(performance.now()-start);
   start=performance.now();await page.locator('[data-section="radar"]').click();await visible(page,'radar-image');const radar=Math.round(performance.now()-start);
   const item={variant,trial,wind_first_ms:wind,radar_first_ms:radar};samples.push(item);console.log('LOAD_SAMPLE',JSON.stringify(item));
   if(variant==='after'){
    await page.locator('#radar-slider').press('Home');await page.waitForFunction(()=>document.getElementById('radar-slider').value==='0');await visible(page,'radar-image');
    if(await page.locator('#quick').count())throw Error('Quick tabs regression');
    await page.locator('#radar-zoom').click();await page.locator('#radar-zoom').click();await page.locator('#radar-zoom').click();
    if(!await page.locator('#radar-map-time').isVisible())throw Error('Missing radar time overlay');
    if(errors.length)throw Error(errors.join(';'));
   }
  }finally{await context.close();}
 }
 // One cold pass per variant: full 73 frames include actual external DHMZ network.
 const full=[];
 for(const variant of ['before','after']){
  const {context,page}=await setup();const start=performance.now();
  try{await page.goto(base+'/'+variant+'.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.getElementById('wind-progress').getAttribute('aria-valuenow')==='73',null,{timeout:180000});full.push({variant,all73_ms:Math.round(performance.now()-start)});console.log('LOAD_ALL73',JSON.stringify(full.at(-1)));}
  catch(e){full.push({variant,error:String(e.message).slice(0,120)});console.log('LOAD_ALL73',JSON.stringify(full.at(-1)));}
  finally{await context.close();}
 }
 const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
 const summary=Object.fromEntries(['earlier','before','after'].map(v=>[v,{wind_first_ms:median(samples.filter(x=>x.variant===v).map(x=>x.wind_first_ms)),radar_first_ms:median(samples.filter(x=>x.variant===v).map(x=>x.radar_first_ms))}]));
 const report={measuredAt:new Date().toISOString(),profile,source:'GitHub Actions Chrome, local HTTP serving real DHMZ images and live external DHMZ for remaining wind frames. Not a physical iPhone test.',refs,samples,medians:summary,all73:full};
 fs.mkdirSync('benchmark-results',{recursive:true});fs.writeFileSync('benchmark-results/loading.json',JSON.stringify(report,null,2));console.log('LOAD_RESULT',JSON.stringify(report));
}finally{await browser.close();await new Promise(r=>server.close(r));}
