"""Crop every question out of a digital (text-layer) PDF.

Finds question markers such as "Q.12", "12." or "Question 12" at the start of a line,
handles one- and two-column layouts, and saves one compact grayscale WebP per question.
It also records where the options start ("(A)", "(a)", "A.") so the app can hide them
in "think first" mode, and the question's text for search.

    python3 -I tools/process/pdf_questions.py paper.pdf work/paper1 [--pages 1-12] [--dpi 200]

Writes work/paper1/img/q<page>-<n>.webp and work/paper1/draft.json. Claude then reads the
draft, assigns chapters/answers, and writes pack.json for tools/pack/build.ts.
Scanned PDFs have no text layer: use clean_photo.py on page renders instead.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
from pathlib import Path

import pymupdf
from PIL import Image, ImageOps

Q_MARK = re.compile(r"^(?:Q(?:ue(?:stion)?)?\.?\s*(\d{1,3})\b[.:)]?|(\d{1,3})[.)])$", re.I)
Q_MARK_JOINED = re.compile(r"^(?:Q\.?\s*(\d{1,3})[.:)]?|(\d{1,3})[.)])\S", re.I)
OPT_MARK = re.compile(r"^(?:\(\s*[aA1]\s*\)|[aA][.)]|\[A\])")


def parse_pages(spec: str | None, n: int) -> list[int]:
    if not spec:
        return list(range(n))
    out: list[int] = []
    for part in spec.split(","):
        a, _, b = part.partition("-")
        lo, hi = int(a), int(b or a)
        out.extend(range(lo - 1, min(hi, n)))
    return out


def lines_of(page: pymupdf.Page):
    """Text lines as (x0, y0, x1, y1, text, first_word)."""
    words = page.get_text("words")
    groups: dict[tuple[int, int], list] = {}
    for w in words:
        groups.setdefault((w[5], w[6]), []).append(w)
    out = []
    for ws in groups.values():
        ws.sort(key=lambda w: w[0])
        out.append((min(w[0] for w in ws), min(w[1] for w in ws), max(w[2] for w in ws), max(w[3] for w in ws), " ".join(w[4] for w in ws), ws))
    out.sort(key=lambda l: (round(l[1]), l[0]))
    return out


def question_number(ws) -> str | None:
    first = ws[0][4]
    m = Q_MARK.match(first)
    if m:
        return m.group(1) or m.group(2)
    # "Q." and "12" split into two words
    if first.lower() in ("q.", "q", "question", "que.") and len(ws) > 1 and re.fullmatch(r"\d{1,3}[.:)]?", ws[1][4]):
        return re.sub(r"\D", "", ws[1][4])
    m = Q_MARK_JOINED.match(first)
    if m and not re.match(r"^\d+\.\d", first):
        return m.group(1) or m.group(2)
    return None


def trim_box(img: Image.Image, pad: int = 12) -> tuple[int, int, int, int]:
    """Bounding box of the ink, plus padding."""
    inv = ImageOps.invert(img.convert("L"))
    box = inv.point(lambda p: 255 if p > 40 else 0).getbbox()
    if not box:
        return (0, 0, img.width, img.height)
    x0, y0, x1, y1 = box
    return (max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("out")
    ap.add_argument("--pages")
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--quality", type=int, default=70)
    ap.add_argument("--margin", type=float, default=0.06, help="fraction of page height ignored at top/bottom (headers, footers)")
    args = ap.parse_args()

    out = Path(args.out)
    (out / "img").mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(args.pdf)
    items = []
    total_bytes = 0
    for pno in parse_pages(args.pages, doc.page_count):
        page = doc[pno]
        W, H = page.rect.width, page.rect.height
        top, bottom = H * args.margin, H * (1 - args.margin)
        lines = [l for l in lines_of(page) if top <= l[1] <= bottom]
        if not lines:
            print(f"page {pno + 1}: no text layer (scanned?) — skipped", file=sys.stderr)
            continue
        mid = W / 2
        markers = [(l, question_number(l[5])) for l in lines]
        markers = [(l, q) for l, q in markers if q]
        two_col = sum(1 for l, _ in markers if l[0] > mid * 0.9) >= 2
        cols = [(0, mid), (mid, W)] if two_col else [(0, W)]
        for cx0, cx1 in cols:
            col_lines = [l for l in lines if cx0 - 1 <= l[0] < cx1]
            if not col_lines:
                continue
            left = min(l[0] for l in col_lines)
            col_markers = [(l, q) for l, q in markers if cx0 - 1 <= l[0] < cx1 and l[0] - left < 40]
            col_bottom = max(l[3] for l in col_lines)
            for i, (l, qno) in enumerate(col_markers):
                y0 = l[1] - 4
                y1 = (col_markers[i + 1][0][1] - 4) if i + 1 < len(col_markers) else col_bottom + 4
                region = [x for x in col_lines if y0 <= x[1] < y1]
                opt = next((x for x in region if OPT_MARK.match(x[4])), None)
                rect = pymupdf.Rect(cx0 if two_col else 0, y0, cx1 if two_col else W, y1)
                pix = page.get_pixmap(clip=rect, dpi=args.dpi, colorspace=pymupdf.csGRAY)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                box = trim_box(img)
                img = img.crop(box)
                # Where the options start, as a fraction of the trimmed image's height.
                split = None
                if opt:
                    opt_px = (opt[1] - y0) * args.dpi / 72 - box[1]
                    split = round(opt_px / img.height, 3)
                if img.width > 1400:
                    img = img.resize((1400, round(img.height * 1400 / img.width)), Image.LANCZOS)
                name = f"q{pno + 1:03d}-{qno}.webp"
                buf = io.BytesIO()
                img.save(buf, "WEBP", quality=args.quality, method=6)
                (out / "img" / name).write_bytes(buf.getvalue())
                total_bytes += buf.tell()
                items.append({
                    "qno": qno,
                    "page": pno + 1,
                    "image": f"img/{name}",
                    "imageSplit": split if split and 0.05 < split < 0.95 else None,
                    "text": " ".join(x[4] for x in region),
                    "continuesNextColumn": i + 1 == len(col_markers),
                })
    (out / "draft.json").write_text(json.dumps({"source": Path(args.pdf).name, "questions": items}, ensure_ascii=False, indent=1))
    print(f"{len(items)} questions → {out}/img ({total_bytes / 1024:.0f} KB). Check the last question of each column: it may continue.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
