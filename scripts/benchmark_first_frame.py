#!/usr/bin/env python3
"""Measure first-frame network path before (DHMZ) and after (GitHub Pages preview).
Not a physical iPhone browser benchmark. Report all attempts and median, no invented data.
"""
import json,statistics,urllib.request,time,sys
from datetime import datetime,timezone
from pathlib import Path
sys.stdout.reconfigure(line_buffering=True)
m=json.loads(Path("web/data/manifest.json").read_text())
r=m.get("regions",{}).get("MASL",{})
if r.get("status")!="current" or "previewHour" not in r:
 print("BENCHMARK unavailable: no verified MASL preview")
 sys.exit(0)
hour=r["previewHour"]
model=r["modelUtc"]
old="https://prognoza.hr/aladinHR/web_uv10_MASL_"+str(hour).zfill(2)+".png"
new="https://111mara111.github.io/VjetarDHMZ/"+r["previewPath"]
def run(path,kind):
 timings=[]
 for n in range(4):
  req=urllib.request.Request(path+("?bench=" if "?" not in path else "&bench=")+str(time.time_ns()),headers={"Cache-Control":"no-cache","User-Agent":"Mozilla/5.0 AdriaticBenchmark"})
  start=time.perf_counter()
  try:
   with urllib.request.urlopen(req,timeout=20) as response:
    data=response.read()
    if not data.startswith(bytes((137,80,78,71,13,10,26,10))):raise RuntimeError("No PNG")
   ms=(time.perf_counter()-start)*1000
   timings.append(round(ms))
   print("BENCH",kind,n+1,round(ms),"ms",len(data),"bytes")
  except Exception as e:print("BENCH",kind,n+1,"error",type(e).__name__,str(e)[:90])
 return statistics.median(timings) if timings else None
before=run(old,"BEFORE_DIRECT_DHMZ")
after=run(new,"AFTER_GITHUB_PREVIEW")
if before is not None and after is not None:
 print("BENCH_RESULT",json.dumps({"before_ms_median":before,"after_ms_median":after,"ratio":round(before/after,2),"trials":4,"region":"MASL","hour":hour,"note":"network PNG transfer, GitHub Actions runner; not iPhone full app startup"}))
else:print("BENCH_RESULT incomplete")
