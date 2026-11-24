"""
PrintFlow Brand & Favicon Asset Generator
Synthesizes crisp, multi-resolution raster icons, favicons, PWA assets, and social cards using PIL.
"""

import os
from PIL import Image, ImageDraw, ImageFont

FRONTEND_PUBLIC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public"))
PRINT_AGENT_ASSETS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "print-agent", "assets"))

os.makedirs(FRONTEND_PUBLIC, exist_ok=True)
os.makedirs(PRINT_AGENT_ASSETS, exist_ok=True)

def interpolate_color(color1, color2, factor):
    """Linear interpolation between two RGB tuples."""
    return tuple(int(c1 + (c2 - c1) * factor) for c1, c2 in zip(color1, color2))

def draw_rounded_gradient_rect(draw, bbox, radius, color_top, color_bottom):
    """Draw a rounded rectangle with vertical linear gradient."""
    x0, y0, x1, y1 = bbox
    height = y1 - y0
    width = x1 - x0
    
    # Create mask for rounded rectangle
    mask = Image.new("L", (int(width), int(height)), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, width, height], radius=radius, fill=255)
    
    # Create gradient image
    gradient = Image.new("RGBA", (int(width), int(height)))
    grad_draw = ImageDraw.Draw(gradient)
    for y in range(int(height)):
        ratio = y / max(height - 1, 1)
        c = interpolate_color(color_top, color_bottom, ratio)
        grad_draw.line([(0, y), (width, y)], fill=c + (255,))
        
    return gradient, mask

def create_brand_mark(size=512, transparent_bg=False):
    """
    Renders the PrintFlow brand emblem at target size.
    """
    scale = size / 64.0
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    
    # Base rounded super-ellipse
    radius = int(15 * scale)
    grad_top = (59, 130, 246)    # #3B82F6
    grad_bottom = (20, 54, 139)  # #14368B
    
    grad_img, mask = draw_rounded_gradient_rect(None, (0, 0, size, size), radius, grad_top, grad_bottom)
    img.paste(grad_img, (0, 0), mask)
    
    draw = ImageDraw.Draw(img)
    
    # 1. Back Sheet (Feed document)
    back_x0 = int(22 * scale)
    back_y0 = int(11 * scale)
    back_x1 = int(42 * scale)
    back_y1 = int(23 * scale)
    back_r = max(int(2 * scale), 1)
    draw.rounded_rectangle([back_x0, back_y0, back_x1, back_y1], radius=back_r, fill=(255, 255, 255, 220))
    
    # 2. Printer Feed Core Chamber (Midnight slot)
    slot_x0 = int(13 * scale)
    slot_y0 = int(21 * scale)
    slot_x1 = int(51 * scale)
    slot_y1 = int(36 * scale)
    slot_r = max(int(4.5 * scale), 2)
    draw.rounded_rectangle([slot_x0, slot_y0, slot_x1, slot_y1], radius=slot_r, fill=(12, 20, 39, 255))
    
    # Status LED (Ready emerald)
    led_x = int(18.5 * scale)
    led_y = int(28.5 * scale)
    led_r = max(int(2.2 * scale), 1)
    draw.ellipse([led_x - led_r, led_y - led_r, led_x + led_r, led_y + led_r], fill=(16, 185, 129, 255))
    
    # Laser Slot Aperture line
    beam_x0 = int(24 * scale)
    beam_y0 = int(27.5 * scale)
    beam_x1 = int(45 * scale)
    beam_y1 = int(29.5 * scale)
    draw.rounded_rectangle([beam_x0, beam_y0, beam_x1, beam_y1], radius=max(int(1 * scale), 1), fill=(255, 255, 255, 90))
    
    # 3. Flowing Output Document Sheet (Forward cascading sheet)
    sheet_x0 = int(17.5 * scale)
    sheet_y0 = int(28 * scale)
    sheet_x1 = int(46.5 * scale)
    sheet_y1 = int(48 * scale)
    sheet_r = max(int(3.5 * scale), 2)
    draw.rounded_rectangle([sheet_x0, sheet_y0, sheet_x1, sheet_y1], radius=sheet_r, fill=(255, 255, 255, 255))
    
    # Document content stream lines
    line1_x0 = int(22 * scale)
    line1_y0 = int(33.5 * scale)
    line1_x1 = int(42 * scale)
    line1_y1 = int(36.5 * scale)
    draw.rounded_rectangle([line1_x0, line1_y0, line1_x1, line1_y1], radius=max(int(1.5 * scale), 1), fill=(36, 91, 219, 255))
    
    line2_x0 = int(22 * scale)
    line2_y0 = int(38.5 * scale)
    line2_x1 = int(35 * scale)
    line2_y1 = int(41.5 * scale)
    draw.rounded_rectangle([line2_x0, line2_y0, line2_x1, line2_y1], radius=max(int(1.5 * scale), 1), fill=(0, 210, 255, 255))
    
    # Verification check dot on sheet
    dot_x = int(39.5 * scale)
    dot_y = int(40 * scale)
    dot_r = max(int(1.5 * scale), 1)
    draw.ellipse([dot_x - dot_r, dot_y - dot_r, dot_x + dot_r, dot_y + dot_r], fill=(16, 185, 129, 255))
    
    return img

def generate_all_icons():
    print("Generating PrintFlow brand and favicon assets...")
    
    # Master high-res render (1024x1024 for supersampling)
    master = create_brand_mark(1024)
    
    # 1. Favicon 96x96
    fav96 = master.resize((96, 96), Image.Resampling.LANCZOS)
    fav96.save(os.path.join(FRONTEND_PUBLIC, "favicon-96x96.png"), "PNG")
    print("Saved favicon-96x96.png")
    
    # 2. Apple Touch Icon 180x180
    apple180 = master.resize((180, 180), Image.Resampling.LANCZOS)
    apple180.save(os.path.join(FRONTEND_PUBLIC, "apple-touch-icon.png"), "PNG")
    print("Saved apple-touch-icon.png")
    
    # 3. Web App Manifest 192x192
    pwa192 = master.resize((192, 192), Image.Resampling.LANCZOS)
    pwa192.save(os.path.join(FRONTEND_PUBLIC, "web-app-manifest-192x192.png"), "PNG")
    print("Saved web-app-manifest-192x192.png")
    
    # 4. Web App Manifest 512x512
    pwa512 = master.resize((512, 512), Image.Resampling.LANCZOS)
    pwa512.save(os.path.join(FRONTEND_PUBLIC, "web-app-manifest-512x512.png"), "PNG")
    print("Saved web-app-manifest-512x512.png")
    
    # 5. Multi-resolution favicon.ico (16x16, 32x32, 48x48)
    ico_frames = [
        master.resize((16, 16), Image.Resampling.LANCZOS),
        master.resize((32, 32), Image.Resampling.LANCZOS),
        master.resize((48, 48), Image.Resampling.LANCZOS),
    ]
    ico_path = os.path.join(FRONTEND_PUBLIC, "favicon.ico")
    ico_frames[0].save(ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico_frames[1:])
    print("Saved multi-resolution favicon.ico (16, 32, 48px)")
    
    # 6. Desktop Print Agent Icon
    agent_ico = os.path.join(PRINT_AGENT_ASSETS, "app-icon.ico")
    agent_png = os.path.join(PRINT_AGENT_ASSETS, "app-icon.png")
    ico_frames[0].save(agent_ico, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico_frames[1:])
    pwa512.save(agent_png, "PNG")
    print("Saved print-agent assets: app-icon.ico and app-icon.png")
    
    # 7. OpenGraph / Twitter Banner (1200x630)
    og_width = 1200
    og_height = 630
    og_img = Image.new("RGBA", (og_width, og_height), (10, 14, 26, 255))
    og_draw = ImageDraw.Draw(og_img)
    
    # Subtle ambient gradient background
    for y in range(og_height):
        factor = y / og_height
        c = interpolate_color((10, 14, 26), (18, 24, 40), factor)
        og_draw.line([(0, y), (og_width, y)], fill=c + (255,))
        
    # Blue accent atmospheric glow circle in upper right
    glow_center = (1000, 120)
    glow_r = 350
    for r in range(glow_r, 0, -8):
        alpha = int(25 * (1 - r / glow_r))
        og_draw.ellipse([glow_center[0] - r, glow_center[1] - r, glow_center[0] + r, glow_center[1] + r], fill=(36, 91, 219, alpha))
        
    # Paste brand emblem at (100, 165), size 300x300
    emblem_300 = master.resize((300, 300), Image.Resampling.LANCZOS)
    og_img.paste(emblem_300, (100, 165), emblem_300)
    
    # Textual details (simulated with clean vector geometry / typography)
    # Brand Name: PrintFlow
    try:
        font_title = ImageFont.truetype("arial.ttf", 76)
        font_sub = ImageFont.truetype("arial.ttf", 32)
        font_badge = ImageFont.truetype("arial.ttf", 20)
    except Exception:
        font_title = ImageFont.load_default()
        font_sub = ImageFont.load_default()
        font_badge = ImageFont.load_default()
        
    text_x = 450
    # Pre-title badge
    og_draw.rounded_rectangle([text_x, 170, text_x + 360, 210], radius=8, fill=(36, 91, 219, 60), outline=(59, 130, 246, 180), width=1)
    og_draw.text((text_x + 16, 178), "BANGLADESH PRINT SHOP AUTOMATION", fill=(56, 189, 248, 255), font=font_badge)
    
    # Main Title
    og_draw.text((text_x, 230), "PrintFlow", fill=(255, 255, 255, 255), font=font_title)
    # Title accent line
    og_draw.rounded_rectangle([text_x, 325, text_x + 620, 330], radius=2, fill=(36, 91, 219, 255))
    
    # Subtitle
    og_draw.text((text_x, 345), "Autonomous Walk-in Print Operations", fill=(226, 232, 240, 255), font=font_sub)
    
    # Feature Pills
    pills = [
        ("QR Document Upload", (36, 91, 219)),
        ("Duplex Poisha Pricing", (16, 185, 129)),
        ("bKash & SSLCOMMERZ", (217, 119, 6)),
        ("Local Spooler Agent", (139, 92, 246))
    ]
    
    pill_x = text_x
    pill_y = 420
    for text, border_col in pills:
        bbox = og_draw.textbbox((0, 0), text, font=font_badge)
        pw = bbox[2] - bbox[0] + 32
        og_draw.rounded_rectangle([pill_x, pill_y, pill_x + pw, pill_y + 40], radius=20, fill=(255, 255, 255, 15), outline=border_col, width=1)
        og_draw.text((pill_x + 16, pill_y + 10), text, fill=(255, 255, 255, 230), font=font_badge)
        pill_x += pw + 16
        if pill_x > 1100:
            pill_x = text_x
            pill_y += 50
            
    og_path = os.path.join(FRONTEND_PUBLIC, "og-image.png")
    og_img.save(og_path, "PNG")
    print(f"Saved social graph preview card: {og_path} (1200x630)")
    print("All raster and icon assets generated successfully!")

if __name__ == "__main__":
    generate_all_icons()
