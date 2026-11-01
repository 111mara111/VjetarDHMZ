#!/usr/bin/env python3
"""Fail-closed publication checks and an honest status summary, no fabricated weather."""
import json,os,re
from pathlib import Path
from datetime import datetime,timezone,timedelta

ROOT=Path(__file__).resolve().parents[1]/"web"
DATA=ROOT/"data"
now=datetime.now(timezone.utc)

def parse(value):
    return datetime.fromisoformat(value.replace("Z","+00:00")).astimezone(timezone.utc)
def read(name):
    with (DATA/name).open(encoding="utf-8") as f:return json.load(f)
def warn(message):
    print("::warning::"+message)
def require(condition,message):
    if not condition:raise RuntimeError(message)
wind=read("manifest.json");radar=read("radar.json");texts=read("texts.json")
require(wind.get("regions") and len(wind["regions"])>=5,"Missing wind region manifest")
require(radar.get("checkedAt"),"Missing radar verification timestamp")
require(texts.get("generatedAt"),"Missing marine text verification")
status={}
for region,meta in wind["regions"].items():
    if meta.get("status")=="current":
        model=parse(meta["modelUtc"]);checked=parse(meta["checkedAt"])
        require(timedelta(hours=-1)<=now-model<=timedelta(hours=16),"Invalid model time: "+region)
        require(timedelta(minutes=-5)<=now-checked<=timedelta(minutes=20),"Wind check not recent: "+region)
        file=meta.get("previewWebpPath") or meta.get("previewPath")
        require(file and (ROOT/file).is_file(),"Fresh wind missing preview: "+region)
    status[region]=meta.get("status","unavailable")
    if meta.get("status")!="current":warn("No fresh DHMZ wind model for "+region)
frames=radar.get("timeline") or []
if frames:
    require(len(frames)>=1,"Radar timeline is empty")
    prev=None
    for frame in frames:
        p=frame.get("webpPath") or frame.get("path")
        require(p and (ROOT/p).is_file(),"Missing radar frame: "+str(p))
        identity=(frame.get("path"),frame.get("measuredUtc"))
        require(identity!=prev,"Radar contains repeated adjacent frame")
        prev=identity
if radar.get("status")=="current":
    require(frames and radar.get("measuredUtc"),"Current radar lacks measured data")
    measured=parse(radar["measuredUtc"])
    require(timedelta(minutes=-5)<=now-measured<=timedelta(minutes=35),"Current radar is not recent")
else:
    warn("DHMZ radar not current; published status: "+str(radar.get("status")))
for key in ("nauticari","pomorci"):
    if texts.get(key,{}).get("status")!="current":warn("No verified "+key+" forecast")
summary={"generatedAt":now.isoformat(),"wind":status,"radar":radar.get("status"),"radarFrames":len(frames),"nauticari":texts.get("nauticari",{}).get("status"),"pomorci":texts.get("pomorci",{}).get("status")}
print("DATA_HEALTH",json.dumps(summary,ensure_ascii=False))
report=os.environ.get("GITHUB_STEP_SUMMARY")
if report:
    with open(report,"a",encoding="utf-8") as f:
        f.write("## DHMZ data verification\n\n")
        f.write("| Source | Status |\n|---|---|\n")
        for k,v in status.items():f.write(f"| Vjetar {k} | {v} |\n")
        f.write(f"| Radar | {summary['radar']} ({summary['radarFrames']} frames) |\n")
        f.write(f"| Nautičari | {summary['nauticari']} |\n| Pomorci | {summary['pomorci']} |\n\n")
