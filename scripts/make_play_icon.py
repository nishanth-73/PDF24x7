"""Draws the Google Play app icon (512x512, 32-bit PNG, full square: Play rounds the corners itself) from the same
coordinates as the launcher icon in app/src/main/res/drawable/ic_launcher_*.xml.

    python scripts/make_play_icon.py   ->   store-screenshots/play/app-icon-512.png
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "store-screenshots" / "play" / "app-icon-512.png"
S = 16  # supersampling: pixels per unit of the 108 canvas
W = 108 * S
p = lambda *xy: [v * S for v in xy]

# Background: Black Cherry with Tangerine rising from the bottom right (the Home card's glow).
bg = Image.new("RGBA", (W, W))
px = bg.load()
stops = [(0, (0xFF, 0x5C, 0x34)), (0.45, (0x8C, 0x2F, 0x2A)), (1, (0x35, 0x1E, 0x28))]
cx, cy, R = 96 * S, 112 * S, 118 * S
for y in range(0, W, 2):
    for x in range(0, W, 2):
        t = min(1.0, math.hypot(x - cx, y - cy) / R)
        (a, ca), (b, cb) = (stops[0], stops[1]) if t <= 0.45 else (stops[1], stops[2])
        k = (t - a) / (b - a)
        col = tuple(round(ca[i] + (cb[i] - ca[i]) * k) for i in range(3)) + (255,)
        for dy in (0, 1):
            for dx in (0, 1):
                px[x + dx, y + dy] = col

# Foreground: a page inside camera-viewfinder corners.
fg = Image.new("RGBA", (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(fg)
for pts in [((31, 40), (31, 31), (40, 31)), ((68, 31), (77, 31), (77, 40)), ((31, 68), (31, 77), (40, 77)), ((68, 77), (77, 77), (77, 68))]:
    d.line([tuple(v * S for v in q) for q in pts], fill=(255, 255, 255, 242), width=round(3.5 * S), joint="curve")
    for q in (pts[0], pts[2]):
        d.ellipse(p(q[0] - 1.75, q[1] - 1.75, q[0] + 1.75, q[1] + 1.75), fill=(255, 255, 255, 242))
page = Image.new("RGBA", (W, W), (0, 0, 0, 0))
pd = ImageDraw.Draw(page)
pd.rounded_rectangle(p(41, 35, 67, 73), radius=2.5 * S, fill=(255, 255, 255, 255))
pd.polygon(p(59, 35, 67.5, 34.5, 67.5, 43), fill=(0, 0, 0, 0))  # cut the corner for the fold
pd.polygon(p(59, 35, 59, 43, 67, 43), fill=(0xD7, 0xEF, 0xFF, 255))  # Cool Blue fold
pd.rounded_rectangle(p(45, 48, 55, 51.5), radius=1.75 * S, fill=(0xFF, 0x5C, 0x34, 255))  # Tangerine title bar
for y, x2 in [(55, 63), (59.5, 61), (64, 57)]:
    pd.rounded_rectangle(p(45, y, x2, y + 2), radius=S, fill=(0xE3, 0xD6, 0xDC, 255))
fg.alpha_composite(page)
bg.alpha_composite(fg)

# The 72-unit area a launcher shows of the 108-unit layers, as a full square.
icon = bg.crop((18 * S, 18 * S, 90 * S, 90 * S)).resize((512, 512), Image.LANCZOS)
OUT.parent.mkdir(parents=True, exist_ok=True)
icon.save(OUT, optimize=True)
print("wrote", OUT, icon.size, f"{OUT.stat().st_size / 1024:.0f} KB")
