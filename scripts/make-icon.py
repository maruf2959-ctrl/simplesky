"""Draw the SimpleSky Saturn app icon with PIL (supersampled), at every size we need."""
import math, random, sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops

S = 2048  # supersampled canvas

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def background():
    bg = Image.new('RGB', (S, S))
    px = bg.load()
    cx, cy = S * 0.42, S * 0.30
    inner, outer = (44, 34, 112), (4, 6, 18)
    for y in range(0, S, 2):
        for x in range(0, S, 2):
            d = min(1, math.hypot(x - cx, y - cy) / (S * 0.95))
            c = lerp(inner, outer, d ** 0.8)
            px[x, y] = c
            if x + 1 < S: px[x + 1, y] = c
            if y + 1 < S: px[x, y + 1] = c; 
            if x + 1 < S and y + 1 < S: px[x + 1, y + 1] = c
    return bg

def stars(img, scale):
    random.seed(7)
    d = ImageDraw.Draw(img, 'RGBA')
    W = img.width
    for _ in range(70):
        x, y = random.random() * W, random.random() * W
        # keep the planet area clear
        if math.hypot(x - W * 0.5, y - W * 0.53) < W * 0.33: continue
        r = (random.random() ** 3 * 5 + 1.5) * scale
        a = int(150 + random.random() * 105)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, a))
    # two gold four-point sparkles
    for (x, y, r) in [(0.18, 0.2, 70), (0.83, 0.17, 46), (0.86, 0.86, 34)]:
        x, y, r = x * W, y * W, r * scale
        pts = []
        for k in range(8):
            ang = k * math.pi / 4
            rad = r if k % 2 == 0 else r * 0.22
            pts.append((x + rad * math.sin(ang), y - rad * math.cos(ang)))
        d.polygon(pts, fill=(255, 214, 121, 255))

def saturn(content_scale=1.0):
    """Returns RGBA layer of Saturn with rings, centred."""
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    cx, cy = S / 2, S * 0.53
    R = 400 * content_scale
    tilt = -22
    # --- planet body: banded, then lit from top-left
    body = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)
    bands = [(0.0, (250, 228, 180)), (0.18, (238, 206, 150)), (0.30, (214, 168, 104)), (0.38, (244, 220, 170)),
             (0.48, (226, 186, 124)), (0.56, (205, 152, 92)), (0.64, (240, 212, 160)), (0.78, (220, 176, 116)), (1.0, (196, 146, 88))]
    top, bot = cy - R, cy + R
    for y in range(int(top), int(bot) + 1):
        t = min(1.0, max(0.0, (y - top) / (2 * R)))
        for i in range(len(bands) - 1):
            if bands[i][0] <= t <= bands[i + 1][0]:
                u = (t - bands[i][0]) / (bands[i + 1][0] - bands[i][0])
                c = lerp(bands[i][1], bands[i + 1][1], u)
                break
        bd.line([(cx - R - 40, y), (cx + R + 40, y)], fill=c + (255,))
    body = body.rotate(tilt, center=(cx, cy), resample=Image.BICUBIC)
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).ellipse([cx - R, cy - R, cx + R, cy + R], fill=255)
    # shading: darker towards bottom-right
    shade = Image.new('L', (S, S), 0)
    sp = shade.load()
    lx, ly = cx - R * 0.45, cy - R * 0.5
    for y in range(int(cy - R), int(cy + R) + 1, 2):
        for x in range(int(cx - R), int(cx + R) + 1, 2):
            dd = math.hypot(x - lx, y - ly) / (R * 1.7)
            v = int(max(0, min(1, (dd - 0.35) * 1.25)) * 175)
            for (a, b) in ((0, 0), (1, 0), (0, 1), (1, 1)):
                if x + a < S and y + b < S: sp[x + a, y + b] = v
    dark = Image.new('RGBA', (S, S), (10, 8, 30, 255))
    body = Image.composite(dark, body, shade)
    body.putalpha(ImageChops.multiply(mask, body.split()[3]))

    # --- rings: drawn flat, then rotated; back half behind the planet, front half over it
    ring = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rings = [(1.98, 0.54, (226, 205, 160, 235)), (1.80, 0.49, (240, 224, 186, 245)), (1.62, 0.44, (40, 30, 40, 0)),  # Cassini gap
             (1.57, 0.425, (214, 186, 132, 245)), (1.34, 0.36, (188, 160, 112, 210)), (1.22, 0.33, (0, 0, 0, 0))]
    for rx, ry, col in rings:
        rd.ellipse([cx - R * rx, cy - R * ry, cx + R * rx, cy + R * ry], fill=col)
    ring = ring.rotate(tilt, center=(cx, cy), resample=Image.BICUBIC)
    front_mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(front_mask).rectangle([0, cy, S, S], fill=255)
    front_mask = front_mask.rotate(tilt, center=(cx, cy), resample=Image.BICUBIC)
    ring_front = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ring_front.paste(ring, (0, 0), ImageChops.multiply(front_mask, ring.split()[3]))
    # planet's shadow on the far ring is implied; keep it simple
    layer.alpha_composite(ring)
    # soft glow around the planet
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([cx - R * 1.15, cy - R * 1.15, cx + R * 1.15, cy + R * 1.15], fill=(255, 210, 140, 60))
    glow = glow.filter(ImageFilter.GaussianBlur(60))
    layer = Image.alpha_composite(glow, layer)
    layer.alpha_composite(body)
    layer.alpha_composite(ring_front)
    return layer

def make(content_scale, out, sizes):
    img = background().convert('RGBA')
    stars(img, 1.0)
    img.alpha_composite(saturn(content_scale))
    for name, size in sizes:
        img.convert('RGB').resize((size, size), Image.LANCZOS).save(f'{out}/{name}', optimize=True)

# Usage: python3 scripts/make-icon.py assets
out = sys.argv[1] if len(sys.argv) > 1 else "assets"
make(1.0, out, [('icon-512.png', 512), ('icon-192.png', 192), ('apple-touch-icon.png', 180), ('favicon-64.png', 64)])
make(0.78, out, [('icon-maskable-512.png', 512)])  # keeps the rings inside the 80% safe zone
print('done')
