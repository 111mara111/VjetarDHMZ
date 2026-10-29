#!/usr/bin/env python3
"""Produce real PNG home-screen icons for Safari (iPhone/iPad).
Original Vjetar Jadran colors and wave motif preserved from web/icon.svg.
Generated at deploy time; no extra network requests or dependencies beyond Pillow.
"""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / "web"
S = 512
SCALE = S / 180

def pt(x, y):
    return (round(x * SCALE), round(y * SCALE))

def bezier(p0, p1, p2, p3, samples=24):
    pts = []
    for i in range(samples + 1):
        t = i / samples
        a = (1 - t)**3
        b = 3 * (1 - t)**2 * t
        c = 3 * (1 - t) * t*t
        d = t**3
        pts.append((a*p0[0] + b*p1[0] + c*p2[0] + d*p3[0],
                    a*p0[1] + b*p1[1] + c*p2[1] + d*p3[1]))
    return pts

def svg_path(draw, origin, segments):
    pts = [origin]
    current = origin
    for segment in segments:
        if segment[0] == "L":
            current = (segment[1], segment[2])
            pts.append(current)
        elif segment[0] == "C":
            p1, p2, p3 = segment[1:]
            pts += bezier(current, p1, p2, p3)[1:]
            current = p3
    draw.line([pt(*p) for p in pts], fill="#64cfff", width=round(11*SCALE), joint="curve")
    cap = round(5.5*SCALE)
    for x, y in (pts[0],pts[-1]):
        px,py=pt(x,y)
        draw.ellipse((px-cap,py-cap,px+cap,py+cap), fill="#64cfff")

def main():
    img = Image.new("RGB", (S, S), "#12324b")
    draw = ImageDraw.Draw(img)
    svg_path(draw,(24,60),[("L",110,60),("C",(140,60),(140,27),(115,27))])
    svg_path(draw,(17,90),[("L",140,90),("C",(171,90),(165,133),(137,128))])
    svg_path(draw,(26,118),[("L",90,118),("C",(120,118),(121,158),(96,151))])
    font_path="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    font=ImageFont.truetype(font_path,round(15*SCALE))
    label="JADRAN"
    box=draw.textbbox((0,0),label,font=font)
    draw.text(((S-(box[2]-box[0]))/2,round(153*SCALE)),label,fill="#ffffff",font=font)
    for size,name in [(180,"apple-touch-icon.png"),(192,"icon-192.png"),(512,"icon-512.png")]:
        out=ROOT/name
        img.resize((size,size),Image.Resampling.LANCZOS).save(out,optimize=True)
        print(f"{out.relative_to(ROOT.parent)}: {size}x{size}")

if __name__=="__main__":
    main()
