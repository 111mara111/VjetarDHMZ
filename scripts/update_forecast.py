#!/usr/bin/env python3
import io,json,re,time,urllib.request
from pathlib import Path
from datetime import datetime,timezone,timedelta
from zoneinfo import ZoneInfo
from PIL import Image,ImageOps,ImageEnhance
import pytesseract

REGIONS=("MASL","SENJ","SPLI","DUBR","HRv8")
DEST=Path(__file__).resolve().parents[1]/"web"/"data"/"manifest.json"
ASSETS=DEST.parent
def get_frame(region,hour):
    url=("https://prognoza.hr/aladinHR/web_uv10_"+region+"_"
         +str(hour).zfill(2)+".png?nocache="+str(time.time_ns()))
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (AdriaticForecastVerifier)","Cache-Control":"no-cache"})
    with urllib.request.urlopen(req,timeout=18) as response:
        raw=response.read(5000000)
    if not raw.startswith(bytes((137,80,78,71,13,10,26,10))):
        raise ValueError("Not a PNG")
    test=Image.open(io.BytesIO(raw))
    test.verify()
    return raw

def iso(t):return t.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")
def check(region,now):
    raw=get_frame(region,0)
    im=Image.open(io.BytesIO(raw)).convert("RGB")
    w,h=im.size
    crop=ImageOps.grayscale(im.crop((0,int(h*.90),int(w*.72),h)))
    crop=ImageEnhance.Contrast(crop).enhance(2.4)
    crop=crop.resize((crop.width*3,crop.height*3))
    times=[]
    for psm in (6,11):
        txt=pytesseract.image_to_string(crop,config="--psm "+str(psm))
        # Only accept a date alongside the printed model start time from bottom of PNG
        for m in re.finditer(r"START\s*MODELA\s*:?\s*(\d{1,2})\s*[./,]\s*(\d{1,2})\s*[./,]\s*(20\d{2})\s+(\d{1,2})",txt,re.I):
            day,mo,yr,hr=map(int,m.groups())
            times.append(datetime(yr,mo,day,hr,tzinfo=ZoneInfo("Europe/Zagreb")).astimezone(timezone.utc))
    if not times:raise ValueError("START MODELA timestamp not verified: "+repr(txt[:220]))
    model=times[0]
    age=now-model
    status="current" if timedelta(hours=-1)<=age<=timedelta(hours=8) else "stale"
    return {"status":status,"modelUtc":iso(model),"checkedAt":iso(now)}
def main():
    now=datetime.now(timezone.utc)
    regs={}
    for region in REGIONS:
        try:
            regs[region]=check(region,now)
            if regs[region]["status"]=="current":
                model=datetime.fromisoformat(regs[region]["modelUtc"].replace("Z","+00:00"))
                preview_hour=max(0,min(72,round((now-model).total_seconds()/3600)))
                try:
                    blob=get_frame(region,preview_hour)
                    ASSETS.mkdir(parents=True,exist_ok=True)
                    (ASSETS/("wind_"+region+".png")).write_bytes(blob)
                    webp_name="wind_"+region+".webp"
                    with Image.open(io.BytesIO(blob)) as preview:
                        preview.save(ASSETS/webp_name,format="WEBP",lossless=True,method=4)
                    regs[region]["previewWebpPath"]="data/"+webp_name
                    regs[region]["previewHour"]=preview_hour
                    regs[region]["previewPath"]="data/wind_"+region+".png"
                    print("FAST_PREVIEW",region,preview_hour,len(blob))
                except Exception as exc:
                    print("FAST_PREVIEW",region,"unavailable",str(exc)[:100])
            print(region,regs[region])
        except Exception as e:
            regs[region]={"status":"unavailable","checkedAt":iso(now)}
            print(region,"unavailable",str(e)[:150])
    manifest={"generatedAt":iso(now),"source":"DHMZ ALADIN/HR","maxModelAgeHours":8,"regions":regs}
    DEST.parent.mkdir(parents=True,exist_ok=True)
    DEST.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+"\n")
if __name__=="__main__":main()
