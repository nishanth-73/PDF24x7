# Builds the Play Store screenshots (1440x2560, 9:16) from the raw phone captures in this folder: a flat panel in the
# app's colours, a bold headline with a hand-drawn doodle, and the whole screen in an iPhone-style frame (rim, side
# buttons, Dynamic Island). Screens are only ever scaled down, so they stay sharp. Run: python make_store.py -> play/
import math
import os
import re
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, "..", "app", "src", "main", "res", "font", "poppins_semibold.ttf")
OUT = os.path.join(HERE, "play")
W, H = 1440, 2560

# The app's brand: Tangerine, Black Cherry, Cool Blue, on warm paper.
TANGERINE, CHERRY, COOL, PAPER, NIGHT, SOFT = "#FF5C34", "#351E28", "#D7EFFF", "#F6F2EE", "#1C1B19", "#FFE4DB"
TOOL_COUNT = 24

# (screenshot, background, text colour, doodle colour, headline lines, slogan, doodle, the word it marks)
SLIDES = [
    ("01-home.png", TANGERINE, CHERRY, CHERRY, [f"{TOOL_COUNT} PDF tools", "in your pocket"], "100% free. No ads. No sign-up.", "underline", (0, f"{TOOL_COUNT} PDF tools")),
    ("11-scanner.png", CHERRY, "#FFFFFF", TANGERINE, ["Scan documents", "in a snap"], "Searchable scans of docs, books and IDs.", "sparkle", (1, "snap")),
    ("07-tool-merge.png", COOL, CHERRY, TANGERINE, ["Merge, split", "& compress"], f"{TOOL_COUNT} tools, free forever. Zero ads.", "circle", (0, "split")),
    ("12-viewer.png", PAPER, CHERRY, TANGERINE, ["Read, search", "& copy text"], "A fast PDF viewer, built right in.", "underline", (1, "copy")),
    ("03-files-phone.png", NIGHT, "#FFFFFF", TANGERINE, ["All your files,", "synced to Drive"], "Backed up to your own Google Drive.", "underline", (1, "Drive")),
    ("04-settings.png", SOFT, CHERRY, TANGERINE, ["Private by", "design"], "Works offline. No tracking. No ads.", "check", (1, "design")),
]

LEFT, TOP, LEAD = 112, 150, 1.12
# One size for every slide: the largest at which the widest headline line still fits, with room for a doodle.
SIZE = 160
while max(ImageFont.truetype(FONT, SIZE).getlength(t) for s in SLIDES for t in s[4]) > W - 2 * LEFT - 60:
    SIZE -= 2
font = ImageFont.truetype(FONT, SIZE)
PEN = round(SIZE * 0.085)  # doodle stroke width
SUB_FONT = FONT.replace("semibold", "medium")
SUB = round(SIZE * 0.38)
while max(ImageFont.truetype(SUB_FONT, SUB).getlength(s[5]) for s in SLIDES) > W - 2 * LEFT:
    SUB -= 1
sub_font = ImageFont.truetype(SUB_FONT, SUB)


def word_box(lines, line, word):
    """Pixel box of `word` on headline line `line`."""
    text = lines[line]
    start = text.index(word)
    x0 = LEFT + font.getlength(text[:start])
    x1 = x0 + font.getlength(word)
    y = TOP + line * SIZE * LEAD
    return x0, y + SIZE * 0.18, x1, y + SIZE * 1.02


def stroke(d, pts, color, width):
    d.line(pts, fill=color, width=width, joint="curve")
    r = width / 2
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x - r, y - r, x + r, y + r], fill=color)


def doodle(d, kind, box, color):
    x0, y0, x1, y1 = box
    u = SIZE / 116  # doodles were tuned at a 116px headline
    short = x1 - x0 < SIZE * 1.4  # a number or short word gets a rounder, roomier loop
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = (x1 - x0) / 2 + (24 if short else 16) * u, (y1 - y0) / 2 + (22 if short else 14) * u
    if kind == "check":  # a quick tick after the word
        tx, ty = x1 + 40 * u, (y0 + y1) / 2
        stroke(d, [(tx, ty), (tx + 26 * u, ty + 30 * u), (tx + 90 * u, ty - 48 * u)], color, PEN + 2)
    elif kind == "circle":  # a loose loop that overshoots where it started, like a pen
        pts = []
        for i in range(121):
            a = math.radians(-160 + i * 3.1)
            k = 1 + 0.06 * math.sin(a * 2.3)
            pts.append((cx + rx * k * math.cos(a), cy + ry * k * math.sin(a) - i * 0.12 * u))
        stroke(d, pts, color, PEN)
    elif kind == "underline":  # a quick swoosh
        pts = [(x0 - 6 * u + t * (x1 - x0 + 30 * u), y1 + 18 * u + 10 * u * math.sin(t * math.pi * 1.6) - t * 8 * u) for t in [i / 80 for i in range(81)]]
        stroke(d, pts, color, PEN + 2)
    elif kind == "sparkle":  # a four-point star with two small ticks
        sx, sy, r = x1 + 70 * u, y0 + 10 * u, 46 * u
        pts = []
        for i in range(8):
            a = math.radians(i * 45 - 90)
            rr = r if i % 2 == 0 else r * 0.28
            pts.append((sx + rr * math.cos(a), sy + rr * math.sin(a)))
        d.line(pts + [pts[0]], fill=color, width=PEN - 2, joint="curve")
        stroke(d, [(sx + 62 * u, sy - 52 * u), (sx + 82 * u, sy - 70 * u)], color, PEN - 2)
        stroke(d, [(sx + 70 * u, sy - 14 * u), (sx + 98 * u, sy - 18 * u)], color, PEN - 2)
    elif kind == "arrow":  # curls down from the word towards the phone
        ax, ay = x1 + 40 * u, y0 + 10 * u
        pts = [(ax + 120 * u * math.sin(t * math.pi * 0.9), ay + 200 * u * t + 30 * u * math.sin(t * math.pi * 2)) for t in [i / 80 for i in range(81)]]
        stroke(d, pts, color, PEN)
        ex, ey = pts[-1]
        px, py = pts[-8]
        a = math.atan2(ey - py, ex - px)
        for da in (2.6, -2.6):
            stroke(d, [(ex, ey), (ex + 46 * u * math.cos(a + da), ey + 46 * u * math.sin(a + da))], color, PEN)


def mask_rr(size, radius, inset=0):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([inset, inset, size[0] - 1 - inset, size[1] - 1 - inset], radius=radius, fill=255)
    return m


def metal(size):
    """Brushed titanium: a soft vertical gradient with a light band near the top and bottom."""
    g = Image.new("RGBA", size)
    d = ImageDraw.Draw(g)
    stops = [(0, (198, 196, 192)), (0.06, (120, 118, 116)), (0.5, (92, 90, 88)), (0.94, (120, 118, 116)), (1, (190, 188, 184))]
    for y in range(size[1]):
        t = y / (size[1] - 1)
        for (a, ca), (b, cb) in zip(stops, stops[1:]):
            if a <= t <= b:
                k = (t - a) / (b - a)
                d.line([(0, y), (size[0], y)], fill=tuple(round(ca[i] + (cb[i] - ca[i]) * k) for i in range(3)) + (255,))
                break
    return g


ISLAND_TOP, ISLAND_H, ISLAND_W = 0.022, 0.075, 0.30  # Dynamic Island, as fractions of the screen width


def ios_status_bar(screen):
    """Swaps Android's status bar for an iOS one: 9:41, signal, Wi-Fi and a full battery either side of the island.
    Drawn on the full-size capture, so it's as sharp as the rest of the screen."""
    w = screen.width
    band = round(w * 0.104)  # just below the island; the app's content starts lower than this
    bg = screen.getpixel((12, band + 4))
    fg = (0, 0, 0, 255) if sum(bg[:3]) > 3 * 150 else (255, 255, 255, 255)
    d = ImageDraw.Draw(screen)
    d.rectangle([0, 0, w, band], fill=bg)
    cy = round(w * (ISLAND_TOP + ISLAND_H / 2))
    ear = (w - w * ISLAND_W) / 2  # width of the space either side of the island
    clock = ImageFont.truetype(FONT, round(w * 0.044))
    d.text((ear / 2, cy), "9:41", font=clock, fill=fg, anchor="mm")

    s = w / 1080  # icon sizes were set on a 1080px-wide capture
    x = w - ear / 2 - 82 * s  # the three icons, centred in the right ear
    for i, h in enumerate((10, 15, 20, 26)):  # signal bars
        d.rounded_rectangle([x + i * 10 * s, cy + (13 - h) * s, x + i * 10 * s + 7 * s, cy + 13 * s], radius=2 * s, fill=fg)
    wx, wy = x + 72 * s, cy + 12 * s  # Wi-Fi: two arcs and a wedge
    for r in (27, 18):
        d.arc([wx - r * s, wy - r * s, wx + r * s, wy + r * s], 225, 315, fill=fg, width=round(5 * s))
    d.pieslice([wx - 9 * s, wy - 9 * s, wx + 9 * s, wy + 9 * s], 225, 315, fill=fg)
    bx = x + 106 * s  # battery: dim outline, solid fill, little nub
    d.rounded_rectangle([bx, cy - 13 * s, bx + 52 * s, cy + 13 * s], radius=8 * s, outline=fg[:3] + (110,), width=round(3 * s))
    d.rounded_rectangle([bx + 5 * s, cy - 8 * s, bx + 47 * s, cy + 8 * s], radius=4 * s, fill=fg)
    d.rounded_rectangle([bx + 55 * s, cy - 5 * s, bx + 59 * s, cy + 5 * s], radius=2 * s, fill=fg[:3] + (110,))
    return screen


def device(shot, height):
    """The whole phone, `height` px tall: metal rim, side buttons, black bezel, the screen, and a Dynamic Island."""
    rim, bezel = round(height * 0.0045), round(height * 0.014)
    sh = height - 2 * (rim + bezel)
    screen = ios_status_bar(Image.open(os.path.join(HERE, shot)).convert("RGBA"))
    sw = round(sh * screen.width / screen.height)
    screen = screen.resize((sw, sh), Image.LANCZOS)
    pw = sw + 2 * (rim + bezel)
    radius = round(pw * 0.155)
    btn = round(height * 0.004)  # how far the buttons stick out

    out = Image.new("RGBA", (pw + 2 * btn, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    button = (110, 108, 106, 255)
    for side, y, length in [(0, 0.165, 0.035), (0, 0.235, 0.062), (0, 0.31, 0.062), (1, 0.255, 0.095)]:
        x = 0 if side == 0 else pw + btn - 2
        d.rounded_rectangle([x, height * y, x + btn + 2, height * (y + length)], radius=btn, fill=button)

    body = Image.new("RGBA", (pw, height), (0, 0, 0, 0))
    body.paste(metal((pw, height)), mask=mask_rr((pw, height), radius))
    bd = ImageDraw.Draw(body)
    bd.rounded_rectangle([rim, rim, pw - 1 - rim, height - 1 - rim], radius=radius - rim, fill="#050505")
    bd.rounded_rectangle([rim + 1, rim + 1, pw - 2 - rim, height - 2 - rim], radius=radius - rim - 1, outline=(255, 255, 255, 28), width=2)
    body.paste(screen, (rim + bezel, rim + bezel), mask_rr((sw, sh), radius - rim - bezel))
    iw, ih = round(sw * ISLAND_W), round(sw * ISLAND_H)
    ix, iy = (pw - iw) // 2, rim + bezel + round(sw * ISLAND_TOP)
    bd.rounded_rectangle([ix, iy, ix + iw, iy + ih], radius=ih // 2, fill="#000000")
    out.alpha_composite(body, (btn, 0))
    return out


def slide(i, shot, bg, ink, mark, lines, slogan, kind, target):
    canvas = Image.new("RGBA", (W, H), bg)
    sub_y = round(TOP + len(lines) * SIZE * LEAD + SIZE * 0.32)
    top = round(sub_y + SUB * 1.3 + 100)
    p = device(shot, H - top - 130)
    px = (W - p.width) // 2
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([px + 30, top + 50, px + p.width - 30, top + p.height + 40], radius=140, fill=(0, 0, 0, 120))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(55)))
    canvas.alpha_composite(p, (px, top))
    d = ImageDraw.Draw(canvas)
    for n, text in enumerate(lines):
        d.text((LEFT, TOP + n * SIZE * LEAD), text, font=font, fill=ink)
    d.text((LEFT + 4, sub_y), slogan, font=sub_font, fill=ink)
    doodle(d, kind, word_box(lines, *target), mark)
    path = os.path.join(OUT, f"{i + 1:02d}-{os.path.splitext(shot)[0].split('-', 1)[1]}.png")
    canvas.convert("RGB").save(path, optimize=True)
    return path


os.makedirs(OUT, exist_ok=True)
# Only what this script makes is replaced: the app icon, the listing text and anything else in here stay.
for old in os.listdir(OUT):
    if re.match(r"^\d\d-.*\.png$", old) or old in ("overview-strip.png", "banner.png", "feature-graphic.png"):
        os.remove(os.path.join(OUT, old))
made = [slide(i, *s) for i, s in enumerate(SLIDES)]

# All five side by side as rounded cards on a dark strip, for a banner or a quick look at the set.
CW, GAP, PAD = 720, 40, 60
CH = CW * H // W
banner = Image.new("RGB", (PAD * 2 + len(SLIDES) * CW + (len(SLIDES) - 1) * GAP, PAD * 2 + CH), "#141414")
for i, path in enumerate(made):
    card = Image.open(path).convert("RGBA").resize((CW, CH), Image.LANCZOS)
    banner.paste(card, (PAD + i * (CW + GAP), PAD), mask_rr((CW, CH), 44))
banner.save(os.path.join(OUT, "overview-strip.png"), optimize=True)  # NOT the Play feature graphic: that is feature-graphic.png


def feature_graphic():
    """
    Google Play's 1024x500 feature graphic, drawn at twice the size and scaled down so type and edges stay crisp:
    Black Cherry with a soft Tangerine glow and grain, the name and a two-line promise on the left, and three phones
    fanned out on the right (Home in front, Merge and the viewer tilted behind), running off the bottom edge.
    """
    K = 2
    FW, FH = 1024 * K, 500 * K
    g = Image.new("RGBA", (FW, FH), CHERRY)

    def glow(cx, cy, r, rgb, alpha):
        layer = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
        ImageDraw.Draw(layer).ellipse([cx - r, cy - r, cx + r, cy + r], fill=rgb + (alpha,))
        return layer.filter(ImageFilter.GaussianBlur(r * 0.45))

    g.alpha_composite(glow(1720, 1080, 760, (0xFF, 0x5C, 0x34), 240))  # Tangerine from the bottom right
    g.alpha_composite(glow(120, -160, 520, (0xD7, 0xEF, 0xFF), 38))  # a breath of Cool Blue, top left

    def phone_with_shadow(shot, height, angle):
        p = device(shot, height).rotate(angle, resample=Image.BICUBIC, expand=True)
        sh = Image.new("RGBA", p.size, (0, 0, 0, 0))
        sh.putalpha(p.getchannel("A").point(lambda a: a * 0.55))
        pad = 80
        out = Image.new("RGBA", (p.width + pad * 2, p.height + pad * 2), (0, 0, 0, 0))
        out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(28)), (pad, pad + 34))
        out.alpha_composite(p, (pad, pad))
        return out

    back_l = phone_with_shadow("07-tool-merge.png", 880, 11)
    back_r = phone_with_shadow("12-viewer.png", 880, -11)
    front = phone_with_shadow("01-home.png", 1060, 0)
    g.alpha_composite(back_l, (1250 - back_l.width // 2, 400))
    g.alpha_composite(back_r, (1770 - back_r.width // 2, 400))
    g.alpha_composite(front, (1510 - front.width // 2, 250))

    # Grain over everything but the type, like the app's own loud surfaces.
    import random
    rnd = random.Random(7)
    grain = Image.new("L", (FW // 2, FH // 2))
    grain.putdata([rnd.randrange(0, 22) for _ in range(grain.width * grain.height)])
    noise = Image.new("RGBA", (FW, FH), (255, 255, 255, 0))
    noise.putalpha(grain.resize((FW, FH)))
    g.alpha_composite(noise)

    d = ImageDraw.Draw(g)
    icon = Image.open(os.path.join(HERE, "..", "app", "src", "main", "res", "mipmap-xxxhdpi", "ic_launcher.webp")).convert("RGBA").resize((128, 128), Image.LANCZOS)
    g.alpha_composite(icon, (112, 104))
    d.text((268, 130), "PDF Tools", font=ImageFont.truetype(FONT, 54), fill="#FFFFFF")
    d.text((270, 196), "Free · Private · On your phone", font=ImageFont.truetype(SUB_FONT, 28), fill=(255, 255, 255, 150))

    head = ImageFont.truetype(FONT, 118)
    x, y1, y2 = 108, 330, 470
    d.text((x, y1), "Every PDF tool.", font=head, fill="#FFFFFF")
    d.text((x, y2), "One ", font=head, fill="#FFFFFF")
    fx = x + head.getlength("One ")
    d.text((fx, y2), "free", font=head, fill=TANGERINE)
    d.text((fx + head.getlength("free "), y2), "app.", font=head, fill="#FFFFFF")
    # A quick pen swoosh under "free".
    fw = head.getlength("free")
    swoosh = [(fx - 6 + t * (fw + 18), y2 + 152 + 12 * math.sin(t * math.pi * 1.5) - t * 10) for t in [i / 60 for i in range(61)]]
    d.line(swoosh, fill=TANGERINE, width=10, joint="curve")
    for px, py in (swoosh[0], swoosh[-1]):
        d.ellipse([px - 5, py - 5, px + 5, py + 5], fill=TANGERINE)

    d.text((112, 690), f"Scan, merge, sign & compress. {TOOL_COUNT} tools.", font=ImageFont.truetype(SUB_FONT, 38), fill=COOL)
    cf = ImageFont.truetype(FONT, 28)
    cx = 112
    for chip in ("No ads", "Works offline", "No sign-up"):
        w = cf.getlength(chip) + 52
        d.rounded_rectangle([cx, 786, cx + w, 846], radius=30, outline=(255, 255, 255, 110), width=3)
        d.text((cx + 26, 797), chip, font=cf, fill="#FFFFFF")
        cx += w + 16

    g.resize((1024, 500), Image.LANCZOS).convert("RGB").save(os.path.join(OUT, "feature-graphic.png"), optimize=True)


feature_graphic()
print("done:", SIZE, sorted(os.listdir(OUT)), banner.size)
