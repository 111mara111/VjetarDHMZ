import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
const root=path.resolve("web");
const manifest=JSON.parse(fs.readFileSync(path.join(root,"data","radar.json"),"utf8"));
if(!manifest?.timeline?.length){console.log("RADAR_TEST_SKIPPED no verified source data");process.exit(0)}
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,"http://127.0.0.1").pathname;
 const pathname=path.resolve(root,url.slice(1)||"index.html");
 if(!pathname.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 const type=pathname.endsWith(".json")?"application/json":pathname.endsWith(".png")?"image/png":pathname.endsWith(".webp")?"image/webp":pathname.endsWith(".html")?"text/html":"application/octet-stream";
 if(url==="/data/radar.json"){
  // Emulate a delayed GitHub Actions run: metadata and frames are available,
  // but radar time is 60 minutes old. Previous implementation hid the radar.
  const oldTime=new Date(Date.now()-60*60000).toISOString();
  const fake={...manifest,status:"stale",measuredUtc:oldTime,checkedAt:oldTime};
  res.setHeader("Content-Type","application/json");res.end(JSON.stringify(fake));return;
 }
 fs.readFile(pathname,(err,content)=>{if(err){res.writeHead(404);res.end();return}res.setHeader("Content-Type",type);res.end(content)});
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",args:["--no-sandbox"]});
 const page=await browser.newPage({serviceWorkers:"block"});
 await page.goto("http://127.0.0.1:"+server.address().port+"/index.html",{waitUntil:"domcontentloaded",timeout:15000});
 const start=Date.now();
 await page.locator('[data-section="radar"]').click();
 await page.waitForFunction(()=>{const el=document.querySelector("#radar-image");return el&&!el.classList.contains("hidden")&&el.naturalWidth>0},{},{timeout:15000});
 const visible=await page.evaluate(()=>({src:document.querySelector("#radar-image")?.getAttribute("src"),text:document.querySelector("#radar-time")?.textContent,slider:document.querySelector("#radar-slider")?.disabled,windOverlay:document.querySelector("#wind-map-time")!==null,belowTime:document.querySelector("#date")!==null,ageNote:document.querySelector("#radar-info")?.textContent}));
 if(!visible.src||visible.slider||visible.windOverlay||!visible.belowTime)throw Error("UI regression: "+JSON.stringify(visible));
 const before=await page.evaluate(()=>({src:document.getElementById("radar-image").src,label:document.getElementById("radar-map-time").textContent,count:Number(document.getElementById("radar-slider").max)+1,position:document.getElementById("radar-viewport").getBoundingClientRect().bottom,sliderTop:document.getElementById("radar-slider").getBoundingClientRect().top}));
 if(before.count<2||before.sliderTop<=before.position||before.sliderTop-before.position>115)throw Error("Radar slider must be enabled immediately beneath map: "+JSON.stringify(before));
 await page.evaluate(()=>{const s=document.getElementById("radar-slider");s.value="0";s.dispatchEvent(new Event("input",{bubbles:true}))});
 await page.waitForFunction(previous=>{const img=document.getElementById("radar-image"),s=document.getElementById("radar-slider");return Number(s.value)===0&&img.complete&&img.naturalWidth>0&&img.src!==previous},before.src,{timeout:15000});
 const after=await page.evaluate(()=>({src:document.getElementById("radar-image").src,time:document.getElementById("radar-map-time").textContent,position:document.getElementById("radar-position").textContent,sliderValue:document.getElementById("radar-slider").value}));
 if(after.time===before.label||after.sliderValue!=="0"||!after.position.startsWith("1 /"))throw Error("Manual scrub didn't change frame/time: "+JSON.stringify({before,after}));
 console.log("RADAR_SLIDER_PASS",JSON.stringify({count:before.count,below_image_px:Math.round(before.sliderTop-before.position),before_time:before.label,after_time:after.time,changed_image:after.src!==before.src}));
 console.log("RADAR_TEST_PASS",JSON.stringify({first_frame_ms:Date.now()-start,...visible}));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
