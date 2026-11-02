"""Kagaku icon artwork from a photo of Uttam's pencil cat (his Pencil_paper_meow avatar).

Keeps his drawing exactly as drawn (no tracing): the paper is flattened to white and the
pencil is darkened a little so faint lines (like the pupils) survive at small icon sizes.

  python3 tools/icons/cat-from-photo.py <photo> <cx> <cy> <r>    # circle of the drawing in the photo
  -> tools/icons/icon-art.png (1024 px, white square) and public/icon.svg; then: node tools/icons/render.mjs
"""
import sys
import cv2
import numpy as np

photo, cx, cy, r = sys.argv[1], *map(float, sys.argv[2:5])
g = cv2.cvtColor(cv2.imread(photo), cv2.COLOR_BGR2GRAY).astype(np.float32)
x0, y0, s = int(cx - r), int(cy - r), int(2 * r)
crop = g[y0:y0 + s, x0:x0 + s]

# Paper → white: divide by the blurred paper brightness (removes uneven light and shadow).
paper = cv2.GaussianBlur(crop, (0, 0), 25)
flat = np.clip(crop / (paper + 1e-3) * 255, 0, 255)

# Pencil darker, paper grain gone: values above ~238 become white, the rest follow a curve.
lo, hi, gamma = 120.0, 238.0, 2.2
tone = np.clip((flat - lo) / (hi - lo), 0, 1) ** gamma * 255

# A touch thicker, so lines don't vanish on a phone home screen.
tone = cv2.erode(tone, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))

# Only the drawing inside the circle (the photo's edge is dark).
Y, X = np.ogrid[:s, :s]
tone[(X - s / 2) ** 2 + (Y - s / 2) ** 2 >= (s / 2 - 24) ** 2] = 255

# Frame: the face a little above centre, the whole figure as in the avatar.
size = 1024
centre = (0.5085 * s, 0.5209 * s)   # point of the drawing at the icon centre
scale = size / (1.108 * s)          # icon width = 1.108 × the drawing circle
art = cv2.resize(tone, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
canvas = np.full((size, size), 255, np.float32)
ox, oy = int(round(size / 2 - centre[0] * scale)), int(round(size / 2 - centre[1] * scale))
h, w = art.shape
ys, xs = slice(max(0, oy), min(size, oy + h)), slice(max(0, ox), min(size, ox + w))
canvas[ys, xs] = art[ys.start - oy:ys.stop - oy, xs.start - ox:xs.stop - ox]
cv2.imwrite('tools/icons/icon-art.png', canvas.astype(np.uint8))

# The icon source: a white rounded tile with the art (512 px WebP inside, so the favicon stays small).
import base64
small = cv2.resize(canvas, (512, 512), interpolation=cv2.INTER_AREA).astype(np.uint8)
ok, webp = cv2.imencode('.webp', small, [cv2.IMWRITE_WEBP_QUALITY, 92])
data = base64.b64encode(webp.tobytes()).decode()
svg = f"""<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512">
  <!-- Kagaku icon: Uttam's own pencil cat (Pencil_paper_meow). Made by tools/icons/cat-from-photo.py -->
  <defs><clipPath id="tile"><rect width="512" height="512" rx="112"/></clipPath></defs>
  <g clip-path="url(#tile)">
    <rect width="512" height="512" fill="#ffffff"/>
    <image width="512" height="512" href="data:image/webp;base64,{data}" xlink:href="data:image/webp;base64,{data}"/>
  </g>
</svg>
"""
open('public/icon.svg', 'w').write(svg)
print('wrote tools/icons/icon-art.png and public/icon.svg', len(svg) // 1024, 'KB')
