#!/usr/bin/env python3
"""Check official DHMZ radar image freshness by the measurement timestamp on the image.
Do not infer freshness from HTTP fetch time.
"""
import io,json,re,urllib.request,time
from pathlib import Path
from datetime import datetime,timedelta,timezone
from zoneinfo import ZoneInfo
from PIL import Image, ImageOps, ImageEnhance
import pytesseract

OUT=Path(__file__).resolve().parents[1]/"web"/"data"/"radar.json"
SNAPSHOT=OUT.parent/"radar-latest.png"
ANIMATION=OUT.parent/"radar-animation.gif"
TZ=ZoneInfo("Europe/Zagreb")
def iso(d):return d.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")
def download():
 url="https://vrijeme.hr/anim_kompozit.gif?check="+str(time.time_ns())
 req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (DHMZ Radar Verification)","Cache-Control":"no-cache"})
 with urllib.request.urlopen(req,timeout=28) as response:blob=response.read(25000000)
 image=Image.open(io.BytesIO(blob))
 if image.format!="GIF":raise ValueError("Expected GIF")
 frames=getattr(image,"n_frames",1)
 image.seek(frames-1)
 return image.convert("RGB"),frames,blob
def parse_time(image,now):
 w,h=image.size
 candidates=[]
 for crop in [image.crop((0,0,w,min(h,80))),image.crop((0,0,w,h))]:
  mono=ImageEnhance.Contrast(ImageOps.grayscale(crop)).enhance(2)
  mono=mono.resize((mono.width*2,mono.height*2))
  txt=pytesseract.image_to_string(mono,config="--psm 6")
  for m in re.finditer(r"(20\d{2})\D{1,3}(\d{1,2})\D{1,3}(\d{1,2})\s+(\d{1,2})\D{1,3}(\d{2})",txt):
   year,month,day,hour,minute=map(int,m.groups())
   try:
    reading=datetime(year,month,day,hour,minute,tzinfo=TZ).astimezone(timezone.utc)
    if abs((now-reading).total_seconds())<3600*24*365:candidates.append(reading)
   except ValueError:pass
 if not candidates:raise ValueError("Cannot verify radar image timestamp")
 return max(candidates)
def main():
 now=datetime.now(timezone.utc)
 output={"status":"unavailable","checkedAt":iso(now)}
 try:
  img,nframes,animation_blob=download()
  measured=parse_time(img,now)
  age=now-measured
  output.update({"status":"current" if timedelta(minutes=-5)<=age<=timedelta(minutes=35) else "stale","measuredUtc":iso(measured),"frames":nframes})
  if output["status"]=="current":
   SNAPSHOT.parent.mkdir(parents=True,exist_ok=True)
   img.save(SNAPSHOT,format="PNG",optimize=True)
   ANIMATION.write_bytes(animation_blob)
  print("radar",output)
 except Exception as e:print("radar unavailable:",type(e).__name__,str(e)[:200])
 if output["status"]!="current":
  if SNAPSHOT.exists():SNAPSHOT.unlink()
  if ANIMATION.exists():ANIMATION.unlink()
 OUT.parent.mkdir(parents=True,exist_ok=True)
 OUT.write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
if __name__=="__main__":main()
