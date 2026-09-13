import os
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = "d:/projects/pdf-app"
ASSETS = os.path.join(ROOT, "assets")
RES = os.path.join(ROOT, "android/app/src/main/res")
FONT_DIR = os.path.join(ROOT, "node_modules/@expo-google-fonts/poppins")
FONT_BOLD = os.path.join(FONT_DIR, "700Bold/Poppins_700Bold.ttf")
FONT_SEMIBOLD = os.path.join(FONT_DIR, "600SemiBold/Poppins_600SemiBold.ttf")
FONT_REGULAR = os.path.join(FONT_DIR, "400Regular/Poppins_400Regular.ttf")

def rounded_rectangle_mask(size, radius):
    w, h = size
    mask = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, w, h], radius=radius, fill=255)
    return mask

def create_gradient(size, top_left_rgb=(244, 98, 64), bottom_right_rgb=(196, 44, 20)):
    w, h = size
    x = np.linspace(0, 1, w)
    y = np.linspace(0, 1, h)
    xx, yy = np.meshgrid(x, y)
    t = np.clip((xx + yy) / 2.0, 0, 1)
    r = (1 - t) * top_left_rgb[0] + t * bottom_right_rgb[0]
    g = (1 - t) * top_left_rgb[1] + t * bottom_right_rgb[1]
    b = (1 - t) * top_left_rgb[2] + t * bottom_right_rgb[2]
    rgb = np.stack([r, g, b], axis=-1).astype(np.uint8)
    return Image.fromarray(rgb).convert('RGBA')

def render_document(S, scale=0.65, full_bleed=True, for_splash=False, monochrome=False):
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    
    if full_bleed:
        grad = create_gradient((S, S))
        # Subtle top highlight
        h_layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        h_draw = ImageDraw.Draw(h_layer)
        h_draw.rectangle([0, 0, S, int(S * 0.4)], fill=(255, 255, 255, 25))
        h_layer = h_layer.filter(ImageFilter.GaussianBlur(int(S * 0.03)))
        grad.alpha_composite(h_layer)
        img = grad

    doc_w = int(S * scale * 0.74)
    doc_h = int(S * scale * 1.02)
    
    cx = S // 2
    cy = int(S * 0.42) if for_splash else (S // 2)
    
    fx0 = cx - doc_w // 2
    fy0 = cy - doc_h // 2
    fx1 = fx0 + doc_w
    fy1 = fy0 + doc_h
    
    f_rad = int(doc_w * 0.09)
    fold_size = int(doc_w * 0.28)
    
    # 1. Back sheet (depth effect)
    if full_bleed:
        back_doc = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        b_draw = ImageDraw.Draw(back_doc)
        bx0 = fx0 + int(doc_w * 0.10)
        by0 = fy0 - int(doc_h * 0.01)
        bx1 = fx1 + int(doc_w * 0.10)
        by1 = fy1 - int(doc_h * 0.01)
        b_draw.rounded_rectangle([bx0, by0, bx1, by1], radius=f_rad, fill=(255, 255, 255, 80))
        img.alpha_composite(back_doc)
    
    if monochrome:
        # Pure white silhouette for Android themed icon
        m_mask = Image.new('L', (S, S), 0)
        mm_draw = ImageDraw.Draw(m_mask)
        mm_draw.rounded_rectangle([fx0, fy0, fx1, fy1], radius=f_rad, fill=255)
        mm_draw.polygon([(fx1 - fold_size, fy0 - 10), (fx1 + 10, fy0 - 10), (fx1 + 10, fy0 + fold_size)], fill=0)
        
        mono_layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        mono_draw = ImageDraw.Draw(mono_layer)
        mono_draw.rounded_rectangle([fx0, fy0, fx1, fy1], radius=f_rad, fill=(255, 255, 255, 255))
        # Flap outline
        mono_draw.polygon([(fx1 - fold_size, fy0), (fx1, fy0 + fold_size), (fx1 - fold_size, fy0 + fold_size)], fill=(200, 200, 200, 255))
        
        # Cutout PDF badge in black / transparent
        badge_x0 = fx0 + int(doc_w * 0.12)
        badge_y0 = fy0 + int(doc_h * 0.14)
        badge_w = int(doc_w * 0.46)
        badge_h = int(doc_h * 0.15)
        badge_rad = int(badge_h * 0.32)
        mono_draw.rounded_rectangle([badge_x0, badge_y0, badge_x0 + badge_w, badge_y0 + badge_h], radius=badge_rad, fill=(0, 0, 0, 255))
        font_badge = ImageFont.truetype(FONT_BOLD, size=int(badge_h * 0.64))
        bbox = font_badge.getbbox("PDF")
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        tx = badge_x0 + (badge_w - tw) // 2 - bbox[0]
        ty = badge_y0 + (badge_h - th) // 2 - bbox[1] - int(badge_h * 0.04)
        mono_draw.text((tx, ty), "PDF", font=font_badge, fill=(255, 255, 255, 255))
        
        # Lines in black (transparent)
        line_h = int(doc_h * 0.038)
        line_rad = line_h // 2
        lx0 = badge_x0
        lx1 = fx1 - int(doc_w * 0.12)
        ly1 = badge_y0 + badge_h + int(doc_h * 0.08)
        mono_draw.rounded_rectangle([lx0, ly1, lx1, ly1 + line_h], radius=line_rad, fill=(0, 0, 0, 255))
        ly2 = ly1 + int(doc_h * 0.075)
        mono_draw.rounded_rectangle([lx0, ly2, lx1 - int(doc_w * 0.15), ly2 + line_h], radius=line_rad, fill=(0, 0, 0, 255))
        ly3 = ly2 + int(doc_h * 0.075)
        mono_draw.rounded_rectangle([lx0, ly3, lx1 - int(doc_w * 0.06), ly3 + line_h], radius=line_rad, fill=(0, 0, 0, 255))
        
        # Convert black pixels to transparent, white to white
        mono_np = np.array(mono_layer)
        # alpha is 255 where not black
        is_black = (mono_np[:, :, 0] < 50) & (mono_np[:, :, 1] < 50) & (mono_np[:, :, 2] < 50)
        mono_np[is_black, 3] = 0
        mono_np[~is_black, 0:3] = 255
        return Image.fromarray(mono_np)

    # 2. Document Drop Shadow
    shadow_layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow_layer)
    shadow_color = (130, 25, 10, 110) if full_bleed else (30, 20, 15, 55)
    s_draw.rounded_rectangle([fx0, fy0 + int(doc_h * 0.04), fx1, fy1 + int(doc_h * 0.06)],
                             radius=f_rad, fill=shadow_color)
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(int(doc_w * 0.06)))
    img.alpha_composite(shadow_layer)
    
    # 3. Document Front Body
    doc_mask = Image.new('L', (S, S), 0)
    dm_draw = ImageDraw.Draw(doc_mask)
    dm_draw.rounded_rectangle([fx0, fy0, fx1, fy1], radius=f_rad, fill=255)
    dm_draw.polygon([
        (fx1 - fold_size, fy0 - 10),
        (fx1 + 10, fy0 - 10),
        (fx1 + 10, fy0 + fold_size),
    ], fill=0)
    
    paper = Image.new('RGBA', (S, S), (255, 255, 255, 255))
    p_draw = ImageDraw.Draw(paper)
    p_draw.rounded_rectangle([fx0, fy0, fx1, fy1], radius=f_rad, outline=(235, 230, 222, 255), width=int(S * 0.003))
    
    doc_sheet = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    doc_sheet.paste(paper, (0, 0), doc_mask)
    
    # 4. Folded Flap Shadow
    flap_shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    fs_draw = ImageDraw.Draw(flap_shadow)
    fs_draw.polygon([
        (fx1 - fold_size - 8, fy0 - 8),
        (fx1 + 8, fy0 + fold_size + 8),
        (fx1 - fold_size - 8, fy0 + fold_size + 8),
    ], fill=(120, 30, 15, 75) if full_bleed else (40, 30, 25, 45))
    flap_shadow = flap_shadow.filter(ImageFilter.GaussianBlur(int(fold_size * 0.12)))
    doc_sheet.alpha_composite(flap_shadow)
    
    # 5. Folded Flap Body
    flap_layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    fl_draw = ImageDraw.Draw(flap_layer)
    flap_poly = [
        (fx1 - fold_size, fy0),
        (fx1, fy0 + fold_size),
        (fx1 - fold_size, fy0 + fold_size),
    ]
    fl_draw.polygon(flap_poly, fill=(234, 229, 220, 255))
    fl_draw.line([(fx1 - fold_size, fy0), (fx1, fy0 + fold_size)], fill=(208, 201, 190, 255), width=max(4, int(S * 0.002)))
    doc_sheet.alpha_composite(flap_layer)
    
    # 6. Content: PDF Badge & Content Lines
    content = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    c_draw = ImageDraw.Draw(content)
    
    badge_x0 = fx0 + int(doc_w * 0.12)
    badge_y0 = fy0 + int(doc_h * 0.14)
    badge_w = int(doc_w * 0.46)
    badge_h = int(doc_h * 0.15)
    badge_rad = int(badge_h * 0.32)
    
    # Badge shadow
    b_shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    bs_draw = ImageDraw.Draw(b_shadow)
    bs_draw.rounded_rectangle([badge_x0 + 4, badge_y0 + 10, badge_x0 + badge_w + 4, badge_y0 + badge_h + 14],
                              radius=badge_rad, fill=(160, 35, 15, 80) if full_bleed else (50, 20, 15, 40))
    b_shadow = b_shadow.filter(ImageFilter.GaussianBlur(int(badge_h * 0.14)))
    content.alpha_composite(b_shadow)
    
    # Badge body
    c_draw.rounded_rectangle([badge_x0, badge_y0, badge_x0 + badge_w, badge_y0 + badge_h],
                             radius=badge_rad, fill=(225, 62, 36, 255))
    
    # Badge text
    font_badge = ImageFont.truetype(FONT_BOLD, size=int(badge_h * 0.64))
    bbox = font_badge.getbbox("PDF")
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = badge_x0 + (badge_w - tw) // 2 - bbox[0]
    ty = badge_y0 + (badge_h - th) // 2 - bbox[1] - int(badge_h * 0.04)
    c_draw.text((tx, ty), "PDF", font=font_badge, fill=(255, 255, 255, 255))
    
    # Lines
    line_col = (212, 206, 195, 255)
    line_h = int(doc_h * 0.038)
    line_rad = line_h // 2
    lx0 = badge_x0
    lx1 = fx1 - int(doc_w * 0.12)
    
    ly1 = badge_y0 + badge_h + int(doc_h * 0.08)
    c_draw.rounded_rectangle([lx0, ly1, lx1, ly1 + line_h], radius=line_rad, fill=line_col)
    
    ly2 = ly1 + int(doc_h * 0.075)
    c_draw.rounded_rectangle([lx0, ly2, lx1 - int(doc_w * 0.15), ly2 + line_h], radius=line_rad, fill=line_col)
    
    ly3 = ly2 + int(doc_h * 0.075)
    c_draw.rounded_rectangle([lx0, ly3, lx1 - int(doc_w * 0.06), ly3 + line_h], radius=line_rad, fill=line_col)
    
    ly4 = ly3 + int(doc_h * 0.075)
    c_draw.rounded_rectangle([lx0, ly4, lx0 + int(doc_w * 0.28), ly4 + line_h], radius=line_rad, fill=line_col)
    
    # Tool Accent mark
    tool_r = int(doc_w * 0.12)
    tbx = fx1 - int(doc_w * 0.20)
    tby = fy1 - int(doc_h * 0.18)
    
    c_draw.ellipse([tbx - tool_r, tby - tool_r, tbx + tool_r, tby + tool_r], fill=(250, 238, 233, 255))
    mark_col = (225, 62, 36, 255)
    pw = int(tool_r * 0.58)
    c_draw.rounded_rectangle([tbx - pw + 4, tby - pw + 4, tbx + 8, tby + 8], radius=8, outline=mark_col, width=12)
    c_draw.rounded_rectangle([tbx - 6, tby - 6, tbx + pw - 4, tby + pw - 4], radius=8, fill=mark_col)
    
    doc_sheet.alpha_composite(content)
    img.alpha_composite(doc_sheet)
    
    if for_splash:
        text_layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        t_draw = ImageDraw.Draw(text_layer)
        
        title_font = ImageFont.truetype(FONT_SEMIBOLD, size=int(S * 0.062))
        sub_font = ImageFont.truetype(FONT_REGULAR, size=int(S * 0.028))
        
        title_text = "PDF Tools"
        t_bbox = title_font.getbbox(title_text)
        t_tw = t_bbox[2] - t_bbox[0]
        t_th = t_bbox[3] - t_bbox[1]
        t_tx = (S - t_tw) // 2 - t_bbox[0]
        t_ty = fy1 + int(S * 0.07)
        t_draw.text((t_tx, t_ty), title_text, font=title_font, fill=(28, 25, 23, 255))
        
        sub_text = "FAST · PRIVATE · OFFLINE"
        s_bbox = sub_font.getbbox(sub_text)
        s_tw = s_bbox[2] - s_bbox[0]
        s_tx = (S - s_tw) // 2 - s_bbox[0]
        s_ty = t_ty + t_th + int(S * 0.035)
        t_draw.text((s_tx, s_ty), sub_text, font=sub_font, fill=(130, 120, 110, 255))
        
        img.alpha_composite(text_layer)

    return img

print("1. Generating Master Icon 1024x1024...")
icon_4k = render_document(4096, scale=0.65, full_bleed=True, for_splash=False)
icon_1024 = icon_4k.resize((1024, 1024), Image.Resampling.LANCZOS)
# Convert to RGB (no transparent border on full bleed icon)
icon_1024_rgb = icon_1024.convert('RGB')
icon_1024_rgb.save(os.path.join(ASSETS, "icon.png"), "PNG")
print("Saved assets/icon.png")

print("2. Generating Android Adaptive Foreground 512x512...")
# Scale 0.52 so it fits comfortably within the 66% (338px) safe circle
fg_4k = render_document(4096, scale=0.52, full_bleed=False, for_splash=False)
fg_512 = fg_4k.resize((512, 512), Image.Resampling.LANCZOS)
fg_512.save(os.path.join(ASSETS, "android-icon-foreground.png"), "PNG")
print("Saved assets/android-icon-foreground.png")

print("3. Generating Android Adaptive Background 512x512...")
bg_4k = create_gradient((4096, 4096))
bg_512 = bg_4k.resize((512, 512), Image.Resampling.LANCZOS)
bg_512.save(os.path.join(ASSETS, "android-icon-background.png"), "PNG")
print("Saved assets/android-icon-background.png")

print("4. Generating Android Monochrome Themed Icon 432x432...")
mono_4k = render_document(4096, scale=0.52, full_bleed=False, for_splash=False, monochrome=True)
mono_432 = mono_4k.resize((432, 432), Image.Resampling.LANCZOS)
mono_432.save(os.path.join(ASSETS, "android-icon-monochrome.png"), "PNG")
print("Saved assets/android-icon-monochrome.png")

print("5. Generating Favicon 48x48...")
fav = icon_1024.resize((48, 48), Image.Resampling.LANCZOS)
fav.save(os.path.join(ASSETS, "favicon.png"), "PNG")
print("Saved assets/favicon.png")

print("6. Generating Splash Icon 1024x1024...")
splash_4k = render_document(4096, scale=0.52, full_bleed=False, for_splash=True)
splash_1024 = splash_4k.resize((1024, 1024), Image.Resampling.LANCZOS)
splash_1024.save(os.path.join(ASSETS, "splash-icon.png"), "PNG")
print("Saved assets/splash-icon.png")

print("7. Generating Android Native Splashscreen Logos...")
splash_densities = {
    "drawable-mdpi": 288,
    "drawable-hdpi": 432,
    "drawable-xhdpi": 576,
    "drawable-xxhdpi": 864,
    "drawable-xxxhdpi": 1152,
}
for folder, size in splash_densities.items():
    dest = os.path.join(RES, folder, "splashscreen_logo.png")
    sp = splash_4k.resize((size, size), Image.Resampling.LANCZOS)
    sp.save(dest, "PNG")
    print(f"Saved {folder}/splashscreen_logo.png ({size}x{size})")

print("8. Generating Android Launcher Mipmaps (webp)...")
# Mipmap densities and their dimensions
# Standard launcher icon size, adaptive size
mipmap_specs = {
    "mipmap-mdpi": (48, 108),
    "mipmap-hdpi": (72, 162),
    "mipmap-xhdpi": (96, 216),
    "mipmap-xxhdpi": (144, 324),
    "mipmap-xxxhdpi": (192, 432),
}

# Create circular mask for round launcher
for folder, (icon_sz, adapt_sz) in mipmap_specs.items():
    dir_path = os.path.join(RES, folder)
    if not os.path.exists(dir_path):
        continue
    
    # 1. ic_launcher.webp (squircle or square full icon)
    # Use rounded mask on icon
    rad = int(icon_sz * 0.22)
    mask = rounded_rectangle_mask((icon_sz, icon_sz), rad)
    ic_square = icon_1024.resize((icon_sz, icon_sz), Image.Resampling.LANCZOS)
    ic_out = Image.new('RGBA', (icon_sz, icon_sz), (0, 0, 0, 0))
    ic_out.paste(ic_square, (0, 0), mask)
    ic_out.save(os.path.join(dir_path, "ic_launcher.webp"), "WEBP")
    
    # 2. ic_launcher_round.webp (circular mask)
    c_mask = Image.new('L', (icon_sz, icon_sz), 0)
    c_draw = ImageDraw.Draw(c_mask)
    c_draw.ellipse([0, 0, icon_sz, icon_sz], fill=255)
    ic_round = Image.new('RGBA', (icon_sz, icon_sz), (0, 0, 0, 0))
    ic_round.paste(ic_square, (0, 0), c_mask)
    ic_round.save(os.path.join(dir_path, "ic_launcher_round.webp"), "WEBP")
    
    # 3. ic_launcher_foreground.webp
    fg_webp = fg_4k.resize((adapt_sz, adapt_sz), Image.Resampling.LANCZOS)
    fg_webp.save(os.path.join(dir_path, "ic_launcher_foreground.webp"), "WEBP")
    
    # 4. ic_launcher_background.webp
    bg_webp = bg_4k.resize((adapt_sz, adapt_sz), Image.Resampling.LANCZOS)
    bg_webp.save(os.path.join(dir_path, "ic_launcher_background.webp"), "WEBP")
    
    # 5. ic_launcher_monochrome.webp
    mono_webp = mono_4k.resize((adapt_sz, adapt_sz), Image.Resampling.LANCZOS)
    mono_webp.save(os.path.join(dir_path, "ic_launcher_monochrome.webp"), "WEBP")
    
    print(f"Updated {folder} webp icons")

print("\nALL ASSETS SUCCESSFULLY GENERATED!")
