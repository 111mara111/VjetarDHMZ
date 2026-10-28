/* Wind model cache. Only version-tagged DHMZ ALADIN frames are stored.
   Radar and status JSON always use network; old model caches are deleted. */
const WIND_CACHE="adriatic-wind-verified-models-v1";
self.addEventListener("install",event=>event.waitUntil(self.skipWaiting()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith("adriatic-wind-")&&k!==WIND_CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener("message",event=>{
 if(event.data?.type!=="KEEP_MODELS"||!Array.isArray(event.data.models))return;
 const versions=new Set(event.data.models.filter(v=>typeof v==="string"&&/^\d{4}-\d\d-\d\dT/.test(v)));
 event.waitUntil((async()=>{
  const cache=await caches.open(WIND_CACHE);
  for(const key of await cache.keys()){
   try{const model=new URL(key.url).searchParams.get("model");if(!versions.has(model))await cache.delete(key);}catch{await cache.delete(key)}
  }
 })());
});
self.addEventListener("fetch",event=>{
 const u=new URL(event.request.url);
 if(event.request.destination!=="image"||u.hostname!=="prognoza.hr"||!/^\/aladinHR\/web_uv10_(MASL|SENJ|SPLI|DUBR|HRv8)_\d{2}\.png$/.test(u.pathname)||!/^\d{4}-\d\d-\d\dT/.test(u.searchParams.get("model")||""))return;
 event.respondWith((async()=>{
  let cache=null;
  try{cache=await caches.open(WIND_CACHE);const hit=await cache.match(event.request);if(hit)return hit;}catch{}
  const network=await fetch(event.request);
  if((network.ok||network.type==="opaque")&&cache){
    try{await cache.put(event.request,network.clone());const keys=await cache.keys();if(keys.length>170)await Promise.all(keys.slice(0,keys.length-170).map(key=>cache.delete(key)));}catch{}
  }
  return network;
 })());
});
