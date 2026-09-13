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
    w, h = size
    mask = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, w, h], radius=radius, fill=255)
    return mask

def draw_pdf_document(S, full_bleed=True, for_splash=False):
    """
    Renders the PDF document emblem at size S x S (e.g. 4096 x 4096).
    If full_bleed is True, fills background with rich terracotta gradient.
    If full_bleed is False (e.g. for splash or adaptive foreground), background is transparent.
    """
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    
    if full_bleed:
        # Full bleed gradient for app store / standard icon
        # Gradient from top-left (244, 98, 64) to bottom-right (196, 44, 20)
        w, h = S, S
        x = np.linspace(0, 1, w)
        y = np.linspace(0, 1, h)
        xx, yy = np.meshgrid(x, y)
        t = np.clip((xx + yy) / 2.0, 0, 1)
        r = (1 - t) * 246 + t * 196
        g = (1 - t) * 100 + t * 44
        b = (1 - t) * 66 + t * 20
        bg_rgb = np.stack([r, g, b], axis=-1).astype(np.uint8)
        img = Image.fromarray(bg_rgb).convert('RGBA')
        
        # Add subtle top highlight
        h_layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        h_draw = ImageDraw.Draw(h_layer)
        h_draw.rectangle([0, 0, S, int(S * 0.4)], fill=(255, 255, 255, 25))
        h_layer = h_layer.filter(ImageFilter.GaussianBlur(120))
        img.alpha_composite(h_layer)

    # Calculate document dimensions
    # For full_bleed icon: scale ~0.65 of S
    # For splash emblem: scale ~0.50 of S
    scale = 0.52 if for_splash else 0.65
    
    doc_w = int(S * scale * 0.74)
    doc_h = int(S * scale * 1.02)
    
    # Center of composition
    cx = S // 2
    cy = int(S * 0.42) if for_splash else (S // 2)
    
    # Main document coordinates
    fx0 = cx - doc_w // 2
    fy0 = cy - doc_h // 2
    fx1 = fx0 + doc_w
    fy1 = fy0 + doc_h
    
    f_rad = int(doc_w * 0.09)
    fold_size = int(doc_w * 0.28)
    
    # 1. Back sheet (depth effect)
    if not for_splash:
        back_doc = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        b_draw = ImageDraw.Draw(back_doc)
        bx0 = fx0 + int(doc_w * 0.10)
        by0 = fy0 - int(doc_h * 0.01)
        bx1 = fx1 + int(doc_w * 0.10)
        by1 = fy1 - int(doc_h * 0.01)
        b_draw.rounded_rectangle([bx0, by0, bx1, by1], radius=f_rad, fill=(255, 255, 255, 80))
        img.alpha_composite(back_doc)
    
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
    # Cut top right corner for the fold
    dm_draw.polygon([
        (fx1 - fold_size, fy0 - 10),
        (fx1 + 10, fy0 - 10),
        (fx1 + 10, fy0 + fold_size),
    ], fill=0)
    
    # Paper fill: pure crisp white with gentle warm vignette
    paper = Image.new('RGBA', (S, S), (255, 255, 255, 255))
    p_draw = ImageDraw.Draw(paper)
    # Subtle inner border for paper crispness
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
    # Flap crease line
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
    
    # Badge body: terracotta vermilion
    c_draw.rounded_rectangle([badge_x0, badge_y0, badge_x0 + badge_w, badge_y0 + badge_h],
                             radius=badge_rad, fill=(225, 62, 36, 255))
    
    # Badge text: "PDF"
    font_badge = ImageFont.truetype(FONT_BOLD, size=int(badge_h * 0.64))
    bbox = font_badge.getbbox("PDF")
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = badge_x0 + (badge_w - tw) // 2 - bbox[0]
    ty = badge_y0 + (badge_h - th) // 2 - bbox[1] - int(badge_h * 0.04)
    c_draw.text((tx, ty), "PDF", font=font_badge, fill=(255, 255, 255, 255))
    
    # Content lines (warm stone gray)
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
    
    # Tool Accent: Interlocking geometric pages symbol in bottom right
    tool_r = int(doc_w * 0.12)
    tbx = fx1 - int(doc_w * 0.20)
    tby = fy1 - int(doc_h * 0.18)
    
    c_draw.ellipse([tbx - tool_r, tby - tool_r, tbx + tool_r, tby + tool_r], fill=(250, 238, 233, 255))
    
    mark_col = (225, 62, 36, 255)
    pw = int(tool_r * 0.58)
    # Page 1 (outline)
    c_draw.rounded_rectangle([tbx - pw + 4, tby - pw + 4, tbx + 8, tby + 8], radius=8, outline=mark_col, width=12)
    # Page 2 (solid filled with cut corner)
    c_draw.rounded_rectangle([tbx - 6, tby - 6, tbx + pw - 4, tby + pw - 4], radius=8, fill=mark_col)
    
    doc_sheet.alpha_composite(content)
    img.alpha_composite(doc_sheet)
    
    # If for_splash, also draw "PDF Tools" text below emblem
    if for_splash:
        text_layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        t_draw = ImageDraw.Draw(text_layer)
        
        title_font = ImageFont.truetype(FONT_SEMIBOLD, size=int(S * 0.062))
        sub_font = ImageFont.truetype(FONT_REGULAR, size=int(S * 0.028))
        
        # Title "PDF Tools"
        title_text = "PDF Tools"
        t_bbox = title_font.getbbox(title_text)
        t_tw = t_bbox[2] - t_bbox[0]
        t_th = t_bbox[3] - t_bbox[1]
        t_tx = (S - t_tw) // 2 - t_bbox[0]
        t_ty = fy1 + int(S * 0.07)
        t_draw.text((t_tx, t_ty), title_text, font=title_font, fill=(28, 25, 23, 255))
        
        # Subtitle "FAST · PRIVATE · OFFLINE"
        sub_text = "FAST · PRIVATE · OFFLINE"
        s_bbox = sub_font.getbbox(sub_text)
        s_tw = s_bbox[2] - s_bbox[0]
        s_tx = (S - s_tw) // 2 - s_bbox[0]
        s_ty = t_ty + t_th + int(S * 0.035)
        t_draw.text((s_tx, s_ty), sub_text, font=sub_font, fill=(130, 120, 110, 255))
        
        img.alpha_composite(text_layer)

    return img

# Test splash screen render
splash_4k = draw_pdf_document(2048, full_bleed=False, for_splash=True)
splash_preview = splash_4k.resize((512, 512), Image.Resampling.LANCZOS)
# Composite on white background for viewing
white_bg = Image.new('RGBA', (512, 512), (255, 255, 255, 255))
white_bg.alpha_composite(splash_preview)
splash_test_path = os.path.join(SCRATCH, "test_splash_preview.png")
white_bg.save(splash_test_path, "PNG")

# Test full bleed icon
icon_4k = draw_pdf_document(4096, full_bleed=True, for_splash=False)
# Apply rounded squircle mask for preview
mask = rounded_rectangle_mask((4096, 4096), int(4096 * 0.225))
icon_preview = Image.new('RGBA', (4096, 4096), (0, 0, 0, 0))
icon_preview.paste(icon_4k, (0, 0), mask)
icon_preview_1024 = icon_preview.resize((1024, 1024), Image.Resampling.LANCZOS)
icon_test_path = os.path.join(SCRATCH, "test_icon_preview.png")
icon_preview_1024.save(icon_test_path, "PNG")

print("Generated splash test and icon test")
