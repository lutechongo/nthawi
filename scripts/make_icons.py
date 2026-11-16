# Draws the Nthawi mark: a violet rounded square with a white hourglass whose
# lower half is filled with the app's diagonal hatching (solid at small sizes).
from PIL import Image, ImageDraw
import os

VIOLET = (110, 95, 216, 255)
WHITE = (255, 255, 255, 255)
out = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(out, exist_ok=True)


def draw(size):
    S = size * 8
    k = S / 100
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = 3 * k
    d.rounded_rectangle([pad, pad, S - pad, S - pad], radius=24 * k, fill=VIOLET)
    w = (7 if size <= 32 else 6) * k

    def line(a, b):
        d.line([a, b], fill=WHITE, width=round(w))
        for p in (a, b):
            d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=WHITE)

    P = lambda x, y: (x * k, y * k)
    # Lower half: hatched (big icons) or solid (toolbar sizes).
    tri = [P(50, 52), P(71, 76), P(29, 76)]
    if size >= 48:
        mask = Image.new('L', (S, S), 0)
        ImageDraw.Draw(mask).polygon(tri, fill=255)
        hatch = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        hd = ImageDraw.Draw(hatch)
        for x in range(-40, 120, 9):
            hd.line([P(x, 82), P(x + 32, 42)], fill=WHITE, width=round(4 * k))
        img.paste(hatch, (0, 0), Image.composite(hatch, Image.new('RGBA', (S, S)), mask).split()[3])
    else:
        d.polygon(tri, fill=WHITE)
    # Glass outline and the two caps.
    for a, b in ((P(29, 24), P(50, 50)), (P(71, 24), P(50, 50)), (P(50, 50), P(29, 76)), (P(50, 50), P(71, 76))):
        line(a, b)
    line(P(22, 24), P(78, 24))
    line(P(22, 76), P(78, 76))
    return img.resize((size, size), Image.LANCZOS)


for size in (16, 32, 48, 128):
    draw(size).save(os.path.join(out, f'icon{size}.png'))
print('icons ok')
