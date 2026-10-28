#!/usr/bin/env python3
"""Only publish DHMZ textual forecasts when the actual issue timestamp is verified."""
import json,re,urllib.request
from datetime import datetime,timezone,timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from bs4 import BeautifulSoup

TZ=ZoneInfo("Europe/Zagreb")
OUT=Path(__file__).resolve().parents[1]/"web"/"data"/"texts.json"
PAGES={
    "nauticari":"https://meteo.hr/prognoze.php?param=jadran&section=prognoze_specp",
    "pomorci":"https://meteo.hr/prognoze.php?param=pomorci&section=prognoze_specp",
}
def iso(dt):return dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")
def process(section,url,now):
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 AdriaticMarineWeather","Cache-Control":"no-cache"})
    with urllib.request.urlopen(req,timeout=20) as resp:raw=resp.read(300000)
    soup=BeautifulSoup(raw,"html.parser")
    for tag in soup(["script","style","nav","footer","header"]):tag.decompose()
    text="\n".join(x.strip() for x in soup.get_text("\n").splitlines() if x.strip())
    if section=="nauticari":
        pattern=r"Izvje[šs][ćc]e\s+Službe\s+Pomorskog meteorološkog centra Split.*?dana\s+(\d{1,2})\.(\d{1,2})\.(20\d{2})\.\s+u\s+(\d{1,2})\s+sati"
        cutoff="Douglasova skala"
        age_limit=timedelta(hours=14)
    else:
        pattern=r"Prognoza za pomorce\s*\(NAVTEX\),?\s*dan\s+(\d{1,2})\.(\d{1,2})\.(20\d{2})\s+u\s+(\d{1,2}):(\d{2})\s+sati"
        cutoff="Vrijeme na Jadranu"
        age_limit=timedelta(hours=28)
    match=re.search(pattern,text,re.I|re.S)
    if not match:raise ValueError("Could not verify issued timestamp")
    groups=[int(v) for v in match.groups()]
    day,month,year,hour=groups[:4]
    minute=groups[4] if len(groups)>4 else 0
    issued=datetime(year,month,day,hour,minute,tzinfo=TZ).astimezone(timezone.utc)
    if not timedelta(hours=-1)<=now-issued<=age_limit:raise ValueError("Outdated forecast")
    content=text[match.start():]
    pos=content.lower().find(cutoff.lower())
    if pos>100:content=content[:pos]
    content=content[:8500].strip()
    if len(content)<180 or "Upozorenje" not in content:raise ValueError("Content not sufficiently verified")
    return {"status":"current","issuedUtc":iso(issued),"checkedAt":iso(now),"text":content}
def main():
    now=datetime.now(timezone.utc);result={"generatedAt":iso(now)}
    for key,url in PAGES.items():
        try:
            result[key]=process(key,url,now)
            print(key,"current",result[key]["issuedUtc"],len(result[key]["text"]))
        except Exception as exc:
            result[key]={"status":"unavailable","checkedAt":iso(now)}
            print(key,"unavailable",type(exc).__name__,str(exc)[:170])
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(result,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
if __name__=="__main__":main()
