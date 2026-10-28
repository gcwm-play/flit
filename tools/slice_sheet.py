"""Turns a generated 4-frame walk strip (magenta background) into the game's sprite sheets.

    python3 tools/slice_sheet.py assets/sprites/source/dog-walk.png assets/sprites dog

Finds the 4 cells, keys out the magenta, lines the frames up, and writes
{animal}-{stage}-walk.png and {animal}-{stage}-she-walk.png (with a bow) for
every life stage: 4 frames of 128 x 128, the same model scaled per stage.
Needs Pillow and NumPy.
"""
import sys
from PIL import Image, ImageFilter
import numpy as np
src, out, animal = sys.argv[1], sys.argv[2], sys.argv[3]
im = np.asarray(Image.open(src).convert('RGB')).astype(int)
H, Wd = im.shape[:2]
# Find the 4 cells: separator columns have almost no magenta and are one flat colour.
mag = im[..., 1] < np.minimum(im[..., 0], im[..., 2]) - 45
sep = [x for x in range(Wd) if mag[:, x].mean() < 0.05 and im[:, x].std(0).mean() < 20]
edges, cells, start = sorted(set(sep) | {-1, Wd}), [], 0
for a, b in zip(edges, edges[1:]):
    if b - a > Wd / 8: cells.append((a + 1, b))
assert len(cells) == 4, cells
M = max(2, H // 80) # trim a margin inside each cell
frames = []
for x0, x1 in cells:
    c = im[M:H-M, x0+M:x1-M]
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    # Magenta background and the pink/purple ghost smudges: green well below both red and blue.
    key = (g < np.minimum(r, b) - 45)
    # Frame 2 has a see-through purple 'ghost' of the back arm (an image-generator smudge)
    # left of the shirt. Clear that patch, keeping only the real brown hand.
    if animal == 'capybara' and len(frames) == 1:
        yy, xx = np.mgrid[0:c.shape[0], 0:c.shape[1]]
        patch = (yy >= 480 - 12) & (yy <= 720 - 12) & (xx < 248)
        key |= patch & ~(r > b + 40)
    alpha = np.where(key, 0, 255).astype(np.uint8)
    rgba = np.dstack([c.astype(np.uint8), alpha])
    frames.append(rgba)
# Keep only the biggest connected blob per frame (drops leftover specks).
from collections import deque
def largest(mask):
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    best = None
    for y0 in range(0, h, 8):
        for x0 in range(0, w, 8):
            if not mask[y0, x0] or seen[y0, x0]: continue
            q = deque([(y0, x0)]); seen[y0, x0] = True; pts = []
            while q:
                y, x = q.popleft(); pts.append((y, x))
                for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                    ny, nx = y+dy, x+dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True; q.append((ny, nx))
            if best is None or len(pts) > len(best): best = pts
    keep = np.zeros_like(mask, dtype=bool)
    if best:
        yy, xx = zip(*best); keep[list(yy), list(xx)] = True
    return keep
for i, f in enumerate(frames):
    f[..., 3] = np.where(largest(f[..., 3] > 0), f[..., 3], 0)
    # Eat one pixel of the fringe so no magenta halo is left.
    a = Image.fromarray(f[..., 3]).filter(ImageFilter.MinFilter(3))
    f[..., 3] = np.asarray(a)
# One box around all four frames, so the animal doesn't jump between frames.
ys, xs = [], []
for f in frames:
    yy, xx = np.nonzero(f[..., 3])
    ys += [yy.min(), yy.max()]; xs += [xx.min(), xx.max()]
y0, y1, x0, x1 = min(ys), max(ys), min(xs), max(xs)
print('union box', x0, y0, x1, y1)
crops = [Image.fromarray(f[y0:y1+1, x0:x1+1], 'RGBA') for f in frames]
cw, ch = crops[0].size

# A pink bow on the left ear, for female family members, drawn on a coarse grid so it looks pixelled.
from PIL import ImageDraw
BOW = [
    '.XX.....XX.',
    'XPPX...XPPX',
    'XPPPXXXPPPX',
    'XPPPKKKPPPX',
    'XPPPXXXPPPX',
    'XPPX...XPPX',
    '.XX.....XX.',
]
COL = {'X': (90, 30, 55, 255), 'P': (255, 110, 160, 255), 'K': (215, 50, 110, 255)}
def with_bow(img, cx, cy, cell=max(2, round(cw / 75))):
    img = img.copy(); d = ImageDraw.Draw(img)
    ox, oy = cx - len(BOW[0]) * cell // 2, cy - len(BOW) * cell // 2
    for j, row in enumerate(BOW):
        for i, ch_ in enumerate(row):
            if ch_ in COL:
                d.rectangle([ox + i * cell, oy + j * cell, ox + (i + 1) * cell - 1, oy + (j + 1) * cell - 1], fill=COL[ch_])
    return img
def ear(f):
    # The top of the head's left ear: the highest opaque brown pixel in the left third of the crop.
    a = np.asarray(f)
    for y in range(a.shape[0]):
        xs = [x for x in range(int(cw * 0.12), int(cw * 0.42)) if a[y, x, 3] > 0 and a[y, x, 0] > a[y, x, 2] + 40]
        if len(xs) > max(2, cw // 150):
            return xs[len(xs) // 2], y
    return int(cw * 0.3), int(ch * 0.13)
she = []
for c_ in crops:
    ex, ey = ear(c_)
    she.append(with_bow(c_, ex + cw * 3 // 100, ey + ch // 90))
print('ears', [ear(c_) for c_ in crops])
FR = 128
# How tall each stage stands, as a share of the frame. Same model at every age for now.
SCALE = {'baby': 0.5, 'child': 0.66, 'teen': 0.83, 'adult': 0.97, 'senior': 0.93}
for stage, k in SCALE.items():
    h = round((FR - 3) * k); w = round(cw * h / ch)
    if w > FR - 4:
        w = FR - 4; h = round(ch * w / cw)
    for name, set_ in (('', crops), ('-she', she)):
        sheet = Image.new('RGBA', (FR * 4, FR), (0, 0, 0, 0))
        for i, c in enumerate(set_):
            small = c.resize((w, h), Image.LANCZOS)
            sheet.alpha_composite(small, (i * FR + (FR - w) // 2, FR - 2 - h))
        sheet.save(f'{out}/{animal}-{stage}{name}-walk.png', optimize=True)
    print(stage, w, h)
