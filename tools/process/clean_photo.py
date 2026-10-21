"""Clean up a phone photo of a page and cut questions out of it.

His photos are often rotated 90° and dim. This straightens, evens out the lighting,
boosts contrast, and saves compact grayscale WebP crops.

    # one cleaned page
    python3 -I tools/process/clean_photo.py page.jpg work/day3/page1.webp --rotate 90
    # look at it with a labelled grid to pick crop boxes (fractions of width/height)
    python3 -I tools/process/clean_photo.py page.jpg work/day3/grid.jpg --rotate 90 --grid
    # cut questions: each box is x0,y0,x1,y1[,split] in 0–1 fractions of the cleaned page
    python3 -I tools/process/clean_photo.py page.jpg work/day3/img/p1 --rotate 90 \
        --box 0.05,0.10,0.95,0.38,0.7 --box 0.05,0.40,0.95,0.70
    (writes p1-1.webp, p1-2.webp and prints each box's options split)
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageOps


def load(path: str, rotate: int) -> np.ndarray:
    img = ImageOps.exif_transpose(Image.open(path)).convert("L")
    if rotate:
        img = img.rotate(-rotate, expand=True)  # clockwise
    return np.array(img)


def even_light(gray: np.ndarray) -> np.ndarray:
    """Divide by a blurred copy: removes shadows and uneven lighting."""
    k = max(31, (min(gray.shape) // 20) | 1)
    bg = cv2.medianBlur(cv2.resize(gray, None, fx=0.5, fy=0.5), k if k < 255 else 255)
    bg = cv2.resize(bg, (gray.shape[1], gray.shape[0]))
    norm = cv2.divide(gray, bg, scale=255)
    lo, hi = np.percentile(norm, (1, 99.5))
    return np.clip((norm - lo) * 255.0 / max(1, hi - lo), 0, 255).astype(np.uint8)


def deskew(gray: np.ndarray, max_angle: float = 12) -> tuple[np.ndarray, float]:
    """Straighten using the dominant angle of text lines (Hough on dilated ink)."""
    ink = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
    ink = cv2.dilate(ink, cv2.getStructuringElement(cv2.MORPH_RECT, (25, 3)))
    lines = cv2.HoughLinesP(ink, 1, np.pi / 720, threshold=200, minLineLength=gray.shape[1] // 6, maxLineGap=20)
    if lines is None:
        return gray, 0.0
    angles = [np.degrees(np.arctan2(y2 - y1, x2 - x1)) for x1, y1, x2, y2 in lines.reshape(-1, 4)]
    angles = [a for a in angles if abs(a) < max_angle]
    if not angles:
        return gray, 0.0
    angle = float(np.median(angles))
    if abs(angle) < 0.2:
        return gray, angle
    h, w = gray.shape
    m = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(gray, m, (w, h), flags=cv2.INTER_CUBIC, borderValue=255), angle


def save_webp(img: Image.Image, path: Path, quality: int, max_w: int = 1400) -> int:
    if img.width > max_w:
        img = img.resize((max_w, round(img.height * max_w / img.width)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=quality, method=6)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(buf.getvalue())
    return buf.tell()


def grid(img: Image.Image) -> Image.Image:
    rgb = img.convert("RGB")
    d = ImageDraw.Draw(rgb)
    for i in range(1, 10):
        x, y = rgb.width * i // 10, rgb.height * i // 10
        d.line([(x, 0), (x, rgb.height)], fill=(255, 0, 80), width=2)
        d.line([(0, y), (rgb.width, y)], fill=(0, 120, 255), width=2)
        d.text((x + 4, 4), f"{i / 10:.1f}", fill=(255, 0, 80))
        d.text((4, y + 4), f"{i / 10:.1f}", fill=(0, 120, 255))
    return rgb


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("out")
    ap.add_argument("--rotate", type=int, default=0, choices=[0, 90, 180, 270], help="clockwise")
    ap.add_argument("--no-deskew", action="store_true")
    ap.add_argument("--box", action="append", default=[], help="x0,y0,x1,y1[,split] as fractions")
    ap.add_argument("--grid", action="store_true", help="write a JPEG with a 10x10 labelled grid")
    ap.add_argument("--quality", type=int, default=68)
    args = ap.parse_args()

    gray = even_light(load(args.input, args.rotate))
    angle = 0.0
    if not args.no_deskew:
        gray, angle = deskew(gray)
    page = Image.fromarray(gray)
    out = Path(args.out)

    if args.grid:
        g = grid(page)
        g.thumbnail((1600, 1600))
        out.parent.mkdir(parents=True, exist_ok=True)
        g.save(out, "JPEG", quality=80)
        print(f"grid → {out} (deskewed {angle:.1f}°)")
        return 0
    if not args.box:
        n = save_webp(page, out, args.quality)
        print(f"page → {out} ({n / 1024:.0f} KB, deskewed {angle:.1f}°)")
        return 0
    for i, spec in enumerate(args.box, 1):
        parts = [float(v) for v in spec.split(",")]
        x0, y0, x1, y1 = parts[:4]
        crop = page.crop((round(x0 * page.width), round(y0 * page.height), round(x1 * page.width), round(y1 * page.height)))
        path = out.with_name(f"{out.name}-{i}.webp")
        n = save_webp(crop, path, args.quality)
        split = f", split {parts[4]}" if len(parts) > 4 else ""
        print(f"{path} ({n / 1024:.0f} KB{split})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
