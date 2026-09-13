import os
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SCRATCH = "C:/Users/samarth/.gemini/antigravity/brain/0f4579c7-1ce2-4255-9dd4-52f2e88979da/scratch"
FONT_DIR = "d:/projects/pdf-app/node_modules/@expo-google-fonts/poppins"
FONT_BOLD = os.path.join(FONT_DIR, "700Bold/Poppins_700Bold.ttf")
FONT_SEMIBOLD = os.path.join(FONT_DIR, "600SemiBold/Poppins_600SemiBold.ttf")
FONT_REGULAR = os.path.join(FONT_DIR, "400Regular/Poppins_400Regular.ttf")

def rounded_rectangle_mask(size, radius):
    """Create a high-resolution antialiased rounded rectangle mask."""
    w, h = size
    mask = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, w, h], radius=radius, fill=255)
    return mask

def create_gradient(size, top_left_rgb, bottom_right_rgb):
    """Create a smooth diagonal gradient."""
    w, h = size
    x = np.linspace(0, 1, w)
    y = np.linspace(0, 1, h)
    xx, yy = np.meshgrid(x, y)
    t = (xx + yy) / 2.0
    t = np.clip(t, 0, 1)
    
    r = (1 - t) * top_left_rgb[0] + t * bottom_right_rgb[0]
    g = (1 - t) * top_left_rgb[1] + t * bottom_right_rgb[1]
    b = (1 - t) * top_left_rgb[2] + t * bottom_right_rgb[2]
    
    rgb = np.stack([r, g, b], axis=-1).astype(np.uint8)
    return Image.fromarray(rgb)

def generate_master_icon():
    # Supersampling scale factor 4x: draw at 4096 x 4096, downsample to 1024 x 1024
    S = 4096
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    
    # 1. Base Squircle / Rounded Background
    # Continuous iOS/Android squircle style
    radius = int(S * 0.225)
    grad = create_gradient((S, S), (244, 98, 64), (200, 48, 22)) # Vibrant warm terracotta to rich crimson
    mask = rounded_rectangle_mask((S, S), radius)
    
    # Add subtle top highlight on background
    draw_grad = ImageDraw.Draw(grad)
    highlight_mask = Image.new('L', (S, S), 0)
    h_draw = ImageDraw.Draw(highlight_mask)
    h_draw.rounded_rectangle([4, 4, S - 4, S - 4], radius=radius, outline=255, width=12)
    # Blur highlight
    highlight_mask = highlight_mask.filter(ImageFilter.GaussianBlur(8))
    highlight_layer = Image.new('RGBA', (S, S), (255, 255, 255, 45))
    grad.paste(highlight_layer, (0, 0), highlight_mask)
    
    img.paste(grad, (0, 0), mask)
    
    # 2. Back Document Sheet (subtle depth layer representing multiple files / tools)
    # Tilted/offset slightly
    back_doc = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(back_doc)
    
    # Back sheet coordinates (offset right by ~140px, down ~40px)
    bx0, by0 = int(S * 0.29), int(S * 0.17)
    bx1, by1 = int(S * 0.77), int(S * 0.83)
    b_rad = int(S * 0.04)
    b_draw.rounded_rectangle([bx0, by0, bx1, by1], radius=b_rad, fill=(255, 255, 255, 75))
    
    img.alpha_composite(back_doc)
    
    # 3. Drop Shadow for Front Document Sheet
    shadow_layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow_layer)
    
    fx0, fy0 = int(S * 0.23), int(S * 0.17)
    fx1, fy1 = int(S * 0.71), int(S * 0.83)
    f_rad = int(S * 0.042)
    fold_size = int(S * 0.14)
    
    # Front sheet polygon with folded corner
    # Top edge goes from fx0 + f_rad to fx1 - fold_size
    # Then angled to (fx1, fy0 + fold_size)
    # Then down to (fx1, fy1 - f_rad)
    # With rounded corners
    # Let's draw shadow as rounded rect first
    s_draw.rounded_rectangle([fx0 + 8, fy0 + 32, fx1 + 16, fy1 + 44], radius=f_rad, fill=(120, 20, 8, 120))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(40))
    img.alpha_composite(shadow_layer)
    
    # 4. Front Document Sheet
    doc_layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d_draw = ImageDraw.Draw(doc_layer)
    
    # We construct the front sheet with folded corner:
    # Points:
    # (fx0 + f_rad, fy0) -> (fx1 - fold_size, fy0) -> (fx1, fy0 + fold_size)
    # -> (fx1, fy1 - f_rad) -> arc/round -> (fx0, fy1) -> (fx0, fy0 + f_rad)
    
    doc_mask = Image.new('L', (S, S), 0)
    dm_draw = ImageDraw.Draw(doc_mask)
    
    # Draw main body
    poly = [
        (fx0, fy0 + fold_size),
        (fx0, fy1 - f_rad),
        (fx0 + f_rad, fy1),
        (fx1 - f_rad, fy1),
        (fx1, fy1 - f_rad),
        (fx1, fy0 + fold_size),
        (fx1 - fold_size, fy0),
        (fx0 + f_rad, fy0),
        (fx0, fy0 + f_rad),
    ]
    # Use rounded rectangle and cut corner
    dm_draw.rounded_rectangle([fx0, fy0, fx1, fy1], radius=f_rad, fill=255)
    # Cut top right corner with polygon
    dm_draw.polygon([
        (fx1 - fold_size, fy0 - 10),
        (fx1 + 10, fy0 - 10),
        (fx1 + 10, fy0 + fold_size),
    ], fill=0)
    
    # Front sheet background (subtle gradient off-white to pure crisp white)
    doc_fill = create_gradient((S, S), (255, 255, 255), (247, 246, 242)).convert('RGBA')
    doc_layer.paste(doc_fill, (0, 0), doc_mask)
    
    # 5. Folded flap (the triangle folded over)
    # Shadow underneath the flap
    flap_shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    fs_draw = ImageDraw.Draw(flap_shadow)
    fs_draw.polygon([
        (fx1 - fold_size - 6, fy0 - 6),
        (fx1 + 6, fy0 + fold_size + 6),
        (fx1 - fold_size - 6, fy0 + fold_size + 6),
    ], fill=(130, 30, 15, 80))
    flap_shadow = flap_shadow.filter(ImageFilter.GaussianBlur(16))
    doc_layer.alpha_composite(flap_shadow)
    
    # Flap itself: from (fx1 - fold_size, fy0) to (fx1, fy0 + fold_size) to (fx1 - fold_size, fy0 + fold_size)
    flap_layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    fl_draw = ImageDraw.Draw(flap_layer)
    # Slightly rounded tip at the inner corner (fx1 - fold_size, fy0 + fold_size)
    flap_poly = [
        (fx1 - fold_size, fy0),
        (fx1, fy0 + fold_size),
        (fx1 - fold_size, fy0 + fold_size),
    ]
    fl_draw.polygon(flap_poly, fill=(232, 227, 218, 255))
    # Subtle gradient on flap
    fl_draw.line([(fx1 - fold_size, fy0), (fx1, fy0 + fold_size)], fill=(210, 204, 194, 255), width=6)
    doc_layer.alpha_composite(flap_layer)
    
    # 6. Document Content Details
    content = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    c_draw = ImageDraw.Draw(content)
    
    # A. PDF Badge: bold vermilion pill tag
    badge_x0 = fx0 + int(S * 0.065)
    badge_y0 = fy0 + int(S * 0.11)
    badge_w = int(S * 0.22)
    badge_h = int(S * 0.10)
    badge_rad = int(badge_h * 0.32)
    
    # Badge shadow
    b_shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    bs_draw = ImageDraw.Draw(b_shadow)
    bs_draw.rounded_rectangle([badge_x0 + 4, badge_y0 + 12, badge_x0 + badge_w + 4, badge_y0 + badge_h + 16],
                              radius=badge_rad, fill=(160, 35, 15, 90))
    b_shadow = b_shadow.filter(ImageFilter.GaussianBlur(14))
    content.alpha_composite(b_shadow)
    
    # Badge body
    c_draw.rounded_rectangle([badge_x0, badge_y0, badge_x0 + badge_w, badge_y0 + badge_h],
                             radius=badge_rad, fill=(222, 60, 32, 255))
    
    # PDF Text inside badge
    font_badge = ImageFont.truetype(FONT_BOLD, size=int(badge_h * 0.62))
    text = "PDF"
    # Measure and center text in badge
    bbox = font_badge.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = badge_x0 + (badge_w - tw) // 2 - bbox[0]
    ty = badge_y0 + (badge_h - th) // 2 - bbox[1] - 4
    c_draw.text((tx, ty), text, font=font_badge, fill=(255, 255, 255, 255))
    
    # B. Document Lines (clean, geometric, rounded pill bars)
    line_col = (205, 198, 185, 240)
    line_h = int(S * 0.024)
    line_rad = line_h // 2
    
    lx0 = badge_x0
    lx_max = fx1 - int(S * 0.07)
    
    # Line 1: alongside the badge or right below it
    ly1 = badge_y0 + badge_h + int(S * 0.055)
    c_draw.rounded_rectangle([lx0, ly1, lx_max, ly1 + line_h], radius=line_rad, fill=line_col)
    
    # Line 2
    ly2 = ly1 + int(S * 0.052)
    c_draw.rounded_rectangle([lx0, ly2, lx_max - int(S * 0.08), ly2 + line_h], radius=line_rad, fill=line_col)
    
    # Line 3
    ly3 = ly2 + int(S * 0.052)
    c_draw.rounded_rectangle([lx0, ly3, lx_max - int(S * 0.03), ly3 + line_h], radius=line_rad, fill=line_col)
    
    # Line 4
    ly4 = ly3 + int(S * 0.052)
    c_draw.rounded_rectangle([lx0, ly4, lx0 + int(S * 0.16), ly4 + line_h], radius=line_rad, fill=line_col)
    
    # C. "Tools" Accent Emblem in the bottom right of the sheet
    # A sleek geometric badge / tool indicator: layered colored tabs or sleek circle badge
    tool_badge_r = int(S * 0.065)
    tbx = fx1 - int(S * 0.09)
    tby = fy1 - int(S * 0.11)
    
    # Tool circle background (accent soft)
    c_draw.ellipse([tbx - tool_badge_r, tby - tool_badge_r, tbx + tool_badge_r, tby + tool_badge_r],
                   fill=(248, 235, 230, 255))
    
    # Crisp geometric icon inside: clean overlapping page corners or dual slider / wrench
    # Let's draw clean geometric grid / page tools mark
    mark_col = (222, 60, 32, 255)
    mw = int(tool_badge_r * 0.6)
    # Draw two interlocking clean geometric squares / pages
    c_draw.rounded_rectangle([tbx - mw + 4, tby - mw + 4, tbx + 8, tby + 8], radius=6, outline=mark_col, width=10)
    c_draw.rounded_rectangle([tbx - 8, tby - 8, tbx + mw - 4, tby + mw - 4], radius=6, fill=mark_col)
    
    doc_layer.alpha_composite(content)
    img.alpha_composite(doc_layer)
    
    # Downsample to 1024x1024 with LANCZOS for ultimate crispness
    final_1024 = img.resize((1024, 1024), Image.Resampling.LANCZOS)
    
    # Also save test in scratch
    test_path = os.path.join(SCRATCH, "test_icon_1024.png")
    final_1024.save(test_path, "PNG")
    print(f"Master icon rendered to {test_path}")
    return final_1024

generate_master_icon()
