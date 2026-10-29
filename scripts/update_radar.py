#!/usr/bin/env python3
"""Check official DHMZ radar image freshness by the measurement timestamp on the image.
Do not infer freshness from HTTP fetch time.
"""
import io,json,re,urllib.request,time,shutil,hashlib
from pathlib import Path
from datetime import datetime,timedelta,timezone
from zoneinfo import ZoneInfo
from PIL import Image, ImageOps, ImageEnhance
import pytesseract

OUT=Path(__file__).resolve().parents[1]/"web"/"data"/"radar.json"
SNAPSHOT=OUT.parent/"radar-latest.png"
PREVIEW=OUT.parent/"radar-latest.webp"
ANIMATION=OUT.parent/"radar-animation.gif"
FRAME_DIR=OUT.parent/"radar-frames"
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
 for crop in [image.crop((0,0,min(w,400),min(h,25))),image.crop((0,0,w,min(h,80)))]:
  mono=ImageEnhance.Contrast(ImageOps.grayscale(crop)).enhance(2)
  mono=mono.resize((mono.width*2,mono.height*2))
  txt=pytesseract.image_to_string(mono,config="--psm 6")
  for m in re.finditer(r"(20\d{2})\D{1,3}(\d{1,2})\D{1,3}(\d{1,2})\s+(\d{1,2})\D{1,3}(\d{2})",txt):
   year,month,day,hour,minute=map(int,m.groups())
   try:
    reading=datetime(year,month,day,hour,minute,tzinfo=TZ).astimezone(timezone.utc)
    if abs((now-reading).total_seconds())<3600*24*365:candidates.append(reading)
   except ValueError:pass
  if candidates:break
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
  # Make individually timestamped frames available for scrubbing, even if
  # source publication is late; the UI labels images older than 35 min.
  # Never substitute an old local GIF if the source cannot be verified.
  if timedelta(minutes=-5)<=age<=timedelta(hours=2):
   SNAPSHOT.parent.mkdir(parents=True,exist_ok=True)
   img.save(SNAPSHOT,format="PNG",optimize=True)
   img.save(PREVIEW,format="WEBP",quality=84,method=4)
   output["previewPath"]="data/radar-latest.webp"
   ANIMATION.write_bytes(animation_blob)
   if FRAME_DIR.exists():shutil.rmtree(FRAME_DIR)
   FRAME_DIR.mkdir(parents=True)
   timeline=[]
   encoded={}
   version=hashlib.sha256(animation_blob).hexdigest()[:12]
   with Image.open(io.BytesIO(animation_blob)) as animation:
    for i in range(nframes):
     animation.seek(i)
     frame=animation.convert("RGB")
     digest=hashlib.sha256(frame.tobytes()).hexdigest()
     if digest not in encoded:
      name=f"{version}-{i:03d}"
      frame.save(FRAME_DIR/(name+".png"),format="PNG",optimize=True)
      frame.save(FRAME_DIR/(name+".webp"),format="WEBP",quality=84,method=4)
      encoded[digest]=name
     name=encoded[digest]
     entry={"path":"data/radar-frames/"+name+".png","webpPath":"data/radar-frames/"+name+".webp"}
     try:entry["measuredUtc"]=iso(parse_time(frame,now))
     except ValueError:pass  # Never invent a timestamp from frame number or download time.
     timeline.append(entry)
   output["timeline"]=timeline
  print("radar",output)
 except Exception as e:print("radar unavailable:",type(e).__name__,str(e)[:200])
 if not output.get("timeline"):
  if SNAPSHOT.exists():SNAPSHOT.unlink()
  if PREVIEW.exists():PREVIEW.unlink()
  if ANIMATION.exists():ANIMATION.unlink()
  if FRAME_DIR.exists():shutil.rmtree(FRAME_DIR)
 OUT.parent.mkdir(parents=True,exist_ok=True)
 OUT.write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
if __name__=="__main__":main()
