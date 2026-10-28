"""Cuts generated shop-item sheets (a 4 x 2 grid on magenta) into item-{id}.png files.

    python3 tools/slice_items.py assets/sprites

Reads assets/sprites/source/items-{stage}.png. Each item is every non-magenta blob
whose centre falls in that item's cell(s), so items may spill over cell edges.
Needs Pillow and NumPy.
"""
import sys
from collections import deque
import numpy as np
from PIL import Image

# Item ids by grid cell (column, row), as laid out in each generated sheet.
SHEETS = {
    'child': {(0, 0): 'comics', (1, 0): 'ball', (2, 0): 'boardgame', (3, 0): 'crayons',
              (0, 1): 'plush', (1, 1): 'fishtank', (2, 1): 'console'},
    'teen': {(0, 0): 'posters', (1, 0): 'desk', (2, 0): 'guitar', (3, 0): 'bike',
             (0, 1): 'headphones', (1, 1): 'phone', (2, 1): 'gamingpc', (3, 1): 'gamingpc'},
    'adult': {(0, 0): 'plants', (1, 0): 'bookshelf', (2, 0): 'coffee', (3, 0): 'treadmill',
              (0, 1): 'sofa', (1, 1): 'tv', (2, 1): 'piano', (3, 1): 'watch'},
    'senior': {(0, 0): 'garden', (1, 0): 'garden', (2, 0): 'chess', (3, 0): 'tablet',
               (0, 1): 'karaoke', (1, 1): 'massage'},
}
MAX = 160  # longest side of a saved item, in pixels


def blobs(mask):
    h, w = mask.shape
    seen = np.zeros_like(mask)
    for y0 in range(h):
        for x0 in np.nonzero(mask[y0] & ~seen[y0])[0]:
            if seen[y0, x0]:
                continue
            q = deque([(y0, x0)]); seen[y0, x0] = True; pts = []
            while q:
                y, x = q.popleft(); pts.append((y, x))
                for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True; q.append((ny, nx))
            yield np.array(pts)


def main(out):
    for stage, cells in SHEETS.items():
        im = np.asarray(Image.open(f'{out}/source/items-{stage}.png').convert('RGB')).astype(int)
        h, w = im.shape[:2]
        r, g, b = im[..., 0], im[..., 1], im[..., 2]
        solid = ~(g < np.minimum(r, b) - 45)  # not magenta (the grid lines are dark magenta too)
        parts = {}
        for pts in blobs(solid):
            if len(pts) < 30:
                continue  # specks
            cy, cx = pts.mean(0)
            item = cells.get((int(cx * 4 // w), int(cy * 2 // h)))
            if item:
                parts.setdefault(item, []).append(pts)
        for item, ps in parts.items():
            pts = np.concatenate(ps)
            alpha = np.zeros((h, w), np.uint8)
            alpha[pts[:, 0], pts[:, 1]] = 255
            y0, x0 = pts.min(0); y1, x1 = pts.max(0) + 1
            rgba = np.dstack([im.astype(np.uint8), alpha])[y0:y1, x0:x1]
            img = Image.fromarray(rgba, 'RGBA')
            k = min(1, MAX / max(img.size))
            if k < 1:
                img = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
            img.save(f'{out}/item-{item}.png', optimize=True)
            print(stage, item, img.size)


main(sys.argv[1])
