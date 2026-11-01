// WebKit engine regression smoke test with real generated DHMZ assets.
// It is not a test on a physical iPhone and makes no synthetic weather assertions.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {webkit} from "playwright";

const root=path.resolve("web");
const wind=JSON.parse(fs.readFileSync(path.join(root,"data","manifest.json"),"utf8"));
const radar=JSON.parse(fs.readFileSync(path.join(root,"data","radar.json"),"utf8"));
const mime={".html":"text/html; charset=utf-8",".js":"application/javascript",
 ".json":"application/json",".png":"image/png",".webp":"image/webp",".gif":"image/gif",
 ".svg":"image/svg+xml",".webmanifest":"application/manifest+json"};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,"http://127.0.0.1").pathname;
 const file=path.resolve(root,pathname.slice(1)||"index.html");
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(file,(error,body)=>{
  if(error){res.writeHead(404);res.end();return}
  res.setHeader("Content-Type",mime[path.extname(file)]||"application/octet-stream");
  res.setHeader("Cache-Control","no-store");res.end(body);
 });
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port;
let browser;
try{
 browser=await webkit.launch({headless:true});
 const context=await browser.newContext({
   viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
 const page=await context.newPage();
 const errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base+"/index.html",{waitUntil:"domcontentloaded"});
 if(wind.regions?.MASL?.status==="current"){
  await page.waitForFunction(()=>{const i=document.getElementById("image");return i&&!i.classList.contains("hidden")&&i.complete&&i.naturalWidth>0},{},{timeout:20000});
  const state=await page.evaluate(()=>({
   hour:document.getElementById("hour").textContent,
   slider:document.getElementById("slider").value,
   timestamp:document.getElementById("date").textContent}));
  if(state.hour!=="+0 h"||state.slider!=="0"||state.timestamp==="—")
    throw Error("Wind startup regression: "+JSON.stringify(state));
  console.log("WEBKIT_WIND_PASS",JSON.stringify(state));
 }else{
  await page.waitForTimeout(750);
  if(!await page.locator("#image").evaluate(e=>e.classList.contains("hidden")))
    throw Error("Unverified wind must be hidden");
  console.log("WEBKIT_WIND_UNAVAILABLE_PASS");
 }
 await page.locator('[data-section="radar"]').click();
 if(radar.timeline?.length){
  await page.waitForFunction(()=>{const e=document.getElementById("radar-image");return e&&!e.classList.contains("hidden")&&e.naturalWidth>0},{},{timeout:15000});
  const state=await page.evaluate(()=>{
    const v=document.getElementById("radar-viewport").getBoundingClientRect();
    const s=document.getElementById("radar-slider");
    return {sliderDisabled:s.disabled,bottom:v.bottom,sliderTop:s.getBoundingClientRect().top,frames:Number(s.max)+1};
  });
  if(state.frames>1&&(state.sliderDisabled||state.sliderTop<=state.bottom||state.sliderTop-state.bottom>120))
   throw Error("Radar slider regression: "+JSON.stringify(state));
  if(state.frames>1){
   await page.evaluate(()=>{const s=document.getElementById("radar-slider");s.value="0";s.dispatchEvent(new Event("input",{bubbles:true}))});
   await page.waitForFunction(()=>document.getElementById("radar-position")?.textContent.startsWith("1 /"),{},{timeout:12000});
  }
  console.log("WEBKIT_RADAR_PASS",JSON.stringify(state));
 }else{
  await page.waitForTimeout(750);
  if(!await page.locator("#radar-slider").isDisabled())throw Error("Unavailable radar slider should be disabled");
  console.log("WEBKIT_RADAR_UNAVAILABLE_PASS");
 }
 for(const section of ["nauticari","pomorci","douglas"]){
  await page.locator('[data-section="'+section+'"]').click();
  if(!await page.locator("#"+section).isVisible())throw Error("Missing section "+section);
 }
 if(errors.length)throw Error("WebKit JS errors: "+errors.join("; "));
 console.log("WEBKIT_ALL_SECTIONS_PASS");
 await context.close();
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
