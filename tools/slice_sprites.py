"""Recorta las hojas de sprites (fondo magenta) en cuadros PNG con transparencia.

Uso:
  python3 tools/slice_sprites.py --dog hoja_perro.jpg --cat hoja_gato.jpg --out assets/sprites

Las hojas esperadas tienen 4 filas (CAMINAR, SALTAR, ATAQUE, MUERTE) con
5, 4, 4 y 4 cuadros. Si cambias la hoja, ajusta BANDS y SPANS.
"""
import argparse
import os

import numpy as np
from PIL import Image

ANIMS = ['walk', 'jump', 'attack', 'death']
COUNTS = [5, 4, 4, 4]
BANDS = [(21, 370), (388, 787), (857, 1187), (1230, 1569)]
SPANS = {
    'dog': [(51, 1532), (79, 1511), (81, 1515), (25, 1567)],
    'cat': [(50, 1545), (49, 1527), (62, 1542), (25, 1562)],
}
# Zonas con el texto de las etiquetas (CAMINAR, SALTAR, ATAQUE, MUERTE).
LABELS = [(0, 50), (412, 455), (815, 855), (1226, 1268)]


def fg_mask(arr):
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    magenta = (r > 180) & (g < 90) & (b > 180)
    shadow = (r > 70) & (b > 70) & (g < 60) & (np.abs(r - b) < 70)
    return ~(magenta | shadow)


def tight(mask, x0, x1, y0, y1):
    sub = mask[y0:y1, x0:x1]
    ys = np.where(sub.any(axis=1))[0]
    xs = np.where(sub.any(axis=0))[0]
    if len(ys) == 0:
        return None
    return (x0 + xs[0], y0 + ys[0], x0 + xs[-1] + 1, y0 + ys[-1] + 1)


def slice_sheet(name, path, out_dir):
    im = Image.open(path).convert('RGB')
    arr = np.array(im).astype(int)
    mask = fg_mask(arr)
    for y0, y1 in LABELS:
        mask[y0:y1, 0:235] = False
    frames = {}
    for r, anim in enumerate(ANIMS):
        y0, y1 = BANDS[r]
        sx0, sx1 = SPANS[name][r]
        cell = (sx1 - sx0) / COUNTS[r]
        frames[anim] = [
            tight(mask, max(int(sx0 + i * cell) - 6, 0), int(sx0 + (i + 1) * cell) + 6, y0, y1)
            for i in range(COUNTS[r])
        ]
    boxes = [b for anim in ANIMS for b in frames[anim] if b]
    w = max(b[2] - b[0] for b in boxes) + 8
    h = max(b[3] - b[1] for b in boxes) + 8
    for anim in ANIMS:
        for i, (x0, y0, x1, y1) in enumerate(frames[anim]):
            crop = im.crop((x0, y0, x1, y1)).convert('RGBA')
            pixels = np.array(crop)
            pixels[..., 3] = np.where(mask[y0:y1, x0:x1], 255, 0).astype(np.uint8)
            crop = Image.fromarray(pixels, 'RGBA')
            canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
            canvas.paste(crop, ((w - crop.width) // 2, h - crop.height - 4), crop)
            canvas.save(os.path.join(out_dir, f'{name}_{anim}_{i}.png'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dog', required=True)
    parser.add_argument('--cat', required=True)
    parser.add_argument('--out', default='assets/sprites')
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)
    slice_sheet('dog', args.dog, args.out)
    slice_sheet('cat', args.cat, args.out)
    print(f'Cuadros guardados en {args.out}')


if __name__ == '__main__':
    main()
