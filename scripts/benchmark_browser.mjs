import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
const BASELINE="30388fd1f62115d1f6026b41eed4623378101302";
const roots=path.resolve("web");
const baseline=execFileSync("git",["show",BASELINE+":web/index.html"],{encoding:"utf8"});
const manifest=JSON.parse(fs.readFileSync(path.join(roots,"data","manifest.json"),"utf8"));
if(manifest.regions?.MASL?.status!=="current"||!Number.isInteger(manifest.regions.MASL.previewHour)){
 console.log("BROWSER_RESULT unavailable: no verified MASL preview");process.exit(0);
}
const mime=p=>p.endsWith(".html")?"text/html; charset=utf-8":p.endsWith(".json")?"application/json":p.endsWith(".png")?"image/png":p.endsWith(".js")?"application/javascript":"application/octet-stream";
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,"http://127.0.0.1").pathname;
 if(pathname==="/before.html"){res.setHeader("Content-Type","text/html; charset=utf-8");res.end(baseline);return}
 const local=path.resolve(roots,pathname.slice(1)||"index.html");
 if(!(local===roots||local.startsWith(roots+path.sep))){res.writeHead(403);res.end();return}
 fs.readFile(local,(err,body)=>{
  if(err){res.writeHead(404);res.end();return}
  res.setHeader("Content-Type",mime(local));res.setHeader("Cache-Control","no-store");res.end(body);
 });
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const root="http://127.0.0.1:"+server.address().port;
let browser;
const measurements={before:[],after:[]};
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]});
 for(let i=0;i<3;i++){
  for(const kind of (i%2===0?["before","after"]:["after","before"])){
   const context=await browser.newContext({serviceWorkers:"block",ignoreHTTPSErrors:true});
   const page=await context.newPage();
   const started=performance.now();
   try{
    await page.goto(root+"/"+(kind==="before"?"before.html":"index.html")+"?bench="+i+"-"+kind,{waitUntil:"domcontentloaded",timeout:25000});
    await page.waitForFunction(()=>{
      const el=document.querySelector("#image");
      return Boolean(el&&!el.classList.contains("hidden")&&el.complete&&el.naturalWidth>0);
    },{},{timeout:22000});
    if(kind==="after"){
      const startState=await page.evaluate(()=>({hour:document.getElementById("hour")?.textContent,slider:document.getElementById("slider")?.value,date:document.getElementById("date")?.textContent}));
      if(startState.hour!=="+0 h"||startState.slider!=="0")throw Error("Wind must start at +0 h: "+JSON.stringify(startState));
      console.log("WIND_START_ZERO_PASS",JSON.stringify(startState));
    }
    const elapsed=Math.round(performance.now()-started);
    measurements[kind].push(elapsed);
    console.log("BROWSER",kind,i+1,elapsed,"ms",JSON.stringify(await page.evaluate(()=>({status:document.querySelector("#status")?.textContent,progress:document.querySelector("#loadinfo")?.textContent||null}))));
   }catch(err){
    console.log("BROWSER",kind,i+1,"unavailable",String(err.message).slice(0,180),JSON.stringify(await page.evaluate(()=>({status:document.querySelector("#status")?.textContent,empty:document.querySelector("#empty")?.textContent})).catch(()=>({}))));
   }finally{await context.close()}
  }
 }
 function median(x){if(!x.length)return null;const a=[...x].sort((a,b)=>a-b);return a[Math.floor(a.length/2)]}
 const before=median(measurements.before),after=median(measurements.after);
 console.log("BROWSER_RESULT",JSON.stringify({before_ms_median:before,after_ms_median:after,ratio:before&&after?Math.round(before/after*100)/100:null,attempts_per_variant:3,location:"GitHub Actions headless Chrome",measurement:"navigation to first decoded visible wind image"}));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
