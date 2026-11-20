# Draws the Nthawi mark: a stopwatch with a light-purple ring and a deep-purple hand and crown.
# 16/32 px (toolbar): the bare mark. 48/128 px (extensions page, store): on a soft white tile.
from PIL import Image, ImageDraw
import math, os

RING = (164, 151, 242, 255)   # #A497F2
DEEP = (61, 43, 158, 255)     # #3D2B9E
TILE = (255, 255, 255, 255)
EDGE = (237, 237, 242, 255)
out = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(out, exist_ok=True)

# Geometry in the logo's own 400x400 box (viewBox "50 73 400 400").
CX, CY, R_RING, R_ARC, STROKE = 200.5, 231, 146.5, 207, 30


def mark(d, S, ox, oy, scale, stroke_boost=1.0):
    k = scale
    w = STROKE * k * stroke_boost
    cx, cy = ox + CX * k, oy + CY * k

    def dot(x, y, col):
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=col)

    r = R_RING * k
    d.ellipse([cx - r - w / 2, cy - r - w / 2, cx + r + w / 2, cy + r + w / 2], outline=RING, width=round(w))
    # Crown arc from -91° to -44°, round caps.
    ra = R_ARC * k
    d.arc([cx - ra - w / 2, cy - ra - w / 2, cx + ra + w / 2, cy + ra + w / 2], -91, -44, fill=DEEP, width=round(w))
    for a in (-91, -44):
        dot(cx + ra * math.cos(math.radians(a)), cy + ra * math.sin(math.radians(a)), DEEP)
    # Hand from the centre towards one o'clock-and-a-half.
    x1, y1 = ox + (256 - 50) * k, oy + (303 - 73) * k
    x2, y2 = ox + (321 - 50) * k, oy + (238 - 73) * k
    d.line([x1, y1, x2, y2], fill=DEEP, width=round(w))
    dot(x1, y1, DEEP)
    dot(x2, y2, DEEP)


def draw(size):
    S = size * 8
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if size >= 48:
        pad = S * 0.03
        d.rounded_rectangle([pad, pad, S - pad, S - pad], radius=S * 0.24, fill=TILE, outline=EDGE, width=max(1, round(S * 0.012)))
        inner = S * 0.70
        mark(d, S, (S - inner) / 2, (S - inner) / 2 + S * 0.01, inner / 400)
    else:
        inner = S * 0.96
        mark(d, S, (S - inner) / 2, (S - inner) / 2, inner / 400, 1.25 if size == 16 else 1.1)
    return img.resize((size, size), Image.LANCZOS)


for size in (16, 32, 48, 128):
    draw(size).save(os.path.join(out, f'icon{size}.png'))
print('icons ok')
