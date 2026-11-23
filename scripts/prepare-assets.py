"""One-off asset preparation. Reads brand/ originals, writes src/assets/.
Premultiplied resize is used for the transparent PNG (its transparent region
is pure black: RGB 0,0,0 at alpha 0), so no dark fringe bleeds into edges.
Run: python -I scripts/prepare-assets.py
"""
from PIL import Image
import numpy as np, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets')
os.makedirs(OUT, exist_ok=True)

TILE = os.path.join(ROOT, 'brand', 'LOGO SPUME PNG.png')       # opaque RGBA, colortype 6
MARK = os.path.join(ROOT, 'brand', 'LOGO SPUME PNG...png')     # transparent RGBA, colortype 6

# 1. opaque tile -> 512
tile = Image.open(TILE).convert('RGBA')
tile.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'logo-tile-512.png'), optimize=True)

# 2. transparent white mark: premultiplied resize, squared canvas
mk = Image.open(MARK).convert('RGBA')
a = np.array(mk)[..., 3]
ys, xs = np.where(a > 8)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
side = int(max(x1 - x0, y1 - y0) * 1.16)
box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
sq = mk.crop(box)
pm = sq.convert('RGBa').resize((512, 512), Image.LANCZOS).convert('RGBA')
pm.save(os.path.join(OUT, 'mark-white-512.png'), optimize=True)
r = np.array(pm)
tr = r[..., 3] == 0
print('mark: transparent px with non-zero rgb after resize:', int((r[tr][:, :3] > 0).any(axis=1).sum()))

# 3. favicon: trace the real pixel grid of the opaque tile into a 32x32 SVG.
t = np.array(tile.convert('RGB')).astype(float)
FIELD = np.array([37, 136, 252], float)   # modal pixel of tile  (#2588fc)
WHITE = np.array([253, 253, 253], float)  # modal pixel of mark  (see tokens.css)
cov_full = np.clip((t[..., 0] - FIELD[0]) / (WHITE[0] - FIELD[0]), 0, 1)
ys, xs = np.where(cov_full > 0.5)
cx, cy = (xs.min() + xs.max()) // 2, (ys.min() + ys.max()) // 2
side = int((ys.max() - ys.min()) * 1.16)
side -= side % 32
x0, y0 = cx - side // 2, cy - side // 2
cell = side // 32
grid = cov_full[y0:y0 + side, x0:x0 + side].reshape(32, cell, 32, cell).mean(axis=(1, 3))
levels = 8
q = np.round(grid * levels).astype(int)
paths = {}
for row in range(32):
    col = 0
    while col < 32:
        lv = q[row, col]
        if lv == 0:
            col += 1; continue
        end = col
        while end + 1 < 32 and q[row, end + 1] == lv:
            end += 1
        paths.setdefault(lv, []).append(f'M{col} {row}h{end - col + 1}v1h-{end - col + 1}z')
        col = end + 1
body = ''.join(
    f'<path fill="#fcfdfd" fill-opacity="{lv / levels:.3f}" d="{"".join(p)}"/>'
    for lv, p in sorted(paths.items()))
svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
       '<rect width="32" height="32" rx="7" fill="#2588fc"/>' + body + '</svg>')
open(os.path.join(OUT, 'favicon.svg'), 'w').write(svg)
print('favicon bytes', len(svg), 'cell', cell, 'side', side)
