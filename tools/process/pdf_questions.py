"""Split a digital (text-layer) PDF into questions for transcription.

Kagaku stores questions in MIXED FORM only: the question and options as text + LaTeX,
plus a small crop of the diagram when there is one. This script prepares that work:

  ref/q<page>-<n>.webp   the whole question region — a reading reference for Claude while
                         transcribing. NEVER shipped in a pack (photo form is not used).
  fig/q<page>-<n>-<k>.webp  each diagram inside the question (vector drawing or embedded
                         picture), cropped tight — these are the only images that go in a pack.
  draft.json             per question: number, page, text layer (a hint; maths in a PDF text
                         layer is often garbled), reference image, diagram files.

    python3 -I tools/process/pdf_questions.py paper.pdf work/batch [--pages 1-12] [--dpi 200]

Finds question markers such as "Q.12", "12." or "Question 12" at the start of a line and
handles one- and two-column layouts. Scanned PDFs have no text layer: render the pages and
use clean_photo.py instead.
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
    """Text lines as (x0, y0, x1, y1, text, words)."""
    groups: dict[tuple[int, int], list] = {}
    for w in page.get_text("words"):
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
    if first.lower() in ("q.", "q", "question", "que.") and len(ws) > 1 and re.fullmatch(r"\d{1,3}[.:)]?", ws[1][4]):
        return re.sub(r"\D", "", ws[1][4])
    m = Q_MARK_JOINED.match(first)
    if m and not re.match(r"^\d+\.\d", first):
        return m.group(1) or m.group(2)
    return None


def figure_rects(page: pymupdf.Page, region: pymupdf.Rect, min_w: float = 40, min_h: float = 30) -> list[pymupdf.Rect]:
    """Diagram candidates inside a region: clusters of vector drawings plus embedded pictures.

    Thin rules (underlines, separators) fail the size limits; frames and backgrounds that
    cover most of the region are ignored, so a boxed question never turns into one big
    "figure". Claude still decides which candidates are real diagrams.
    """
    raw = [pymupdf.Rect(d["rect"]) for d in page.get_drawings()] + [pymupdf.Rect(i["bbox"]) for i in page.get_image_info()]
    area = region.width * region.height
    boxes = []
    for r in raw:
        r = pymupdf.Rect(r.x0 - 0.5, r.y0 - 0.5, r.x1 + 0.5, r.y1 + 0.5)  # lines have zero height/width
        if r.intersects(region) and r.width * r.height < 0.5 * area:
            boxes.append(r & region)
    clusters: list[pymupdf.Rect] = []
    for r in boxes:
        grown = True
        while grown:
            grown = False
            for c in clusters:
                if pymupdf.Rect(c.x0 - 8, c.y0 - 8, c.x1 + 8, c.y1 + 8).intersects(r):
                    clusters.remove(c)
                    r = r | c
                    grown = True
                    break
        clusters.append(r)
    return [c for c in clusters if c.width >= min_w and c.height >= min_h and c.width * c.height < 0.7 * area]


def trim_box(img: Image.Image, pad: int = 12) -> tuple[int, int, int, int]:
    inv = ImageOps.invert(img.convert("L"))
    box = inv.point(lambda p: 255 if p > 40 else 0).getbbox()
    if not box:
        return (0, 0, img.width, img.height)
    x0, y0, x1, y1 = box
    return (max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad))


def render(page: pymupdf.Page, rect: pymupdf.Rect, dpi: int) -> Image.Image:
    pix = page.get_pixmap(clip=rect, dpi=dpi)
    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    # Keep colour only when the figure really uses it.
    r, g, b = img.split()
    spread = max(abs(a - c) for a, c in zip(r.getextrema(), b.getextrema())) + max(abs(a - c) for a, c in zip(r.getextrema(), g.getextrema()))
    return img.convert("L") if spread < 40 else img


def save_webp(img: Image.Image, path: Path, quality: int, max_w: int) -> int:
    img = img.crop(trim_box(img))
    if img.width > max_w:
        img = img.resize((max_w, round(img.height * max_w / img.width)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=quality, method=6)
    path.write_bytes(buf.getvalue())
    return buf.tell()


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
    (out / "ref").mkdir(parents=True, exist_ok=True)
    (out / "fig").mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(args.pdf)
    items = []
    fig_bytes = 0
    for pno in parse_pages(args.pages, doc.page_count):
        page = doc[pno]
        W, H = page.rect.width, page.rect.height
        top, bottom = H * args.margin, H * (1 - args.margin)
        lines = [l for l in lines_of(page) if top <= l[1] <= bottom]
        if not lines:
            print(f"page {pno + 1}: no text layer (scanned?) — use clean_photo.py", file=sys.stderr)
            continue
        mid = W / 2
        markers = [(l, q) for l in lines if (q := question_number(l[5]))]
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
                region = pymupdf.Rect(cx0, y0, cx1, y1)
                stem = f"q{pno + 1:03d}-{qno}"
                save_webp(render(page, region, args.dpi), out / "ref" / f"{stem}.webp", 60, 1400)
                figs = []
                for k, rect in enumerate(figure_rects(page, region), 1):
                    name = f"fig/{stem}-{k}.webp"
                    fig_bytes += save_webp(render(page, rect + (-4, -4, 4, 4), args.dpi), out / name, args.quality, 900)
                    figs.append(name)
                text = " ".join(x[4] for x in col_lines if y0 <= x[1] < y1)
                items.append({
                    "qno": qno,
                    "page": pno + 1,
                    "ref": f"ref/{stem}.webp",
                    "figures": figs,
                    "text": text,
                    "continuesNextColumn": i + 1 == len(col_markers),
                })
    (out / "draft.json").write_text(json.dumps({"source": Path(args.pdf).name, "questions": items}, ensure_ascii=False, indent=1))
    n_figs = sum(len(q["figures"]) for q in items)
    print(f"{len(items)} questions, {n_figs} diagrams ({fig_bytes / 1024:.0f} KB) → {out}. ref/ is for reading only — never put it in a pack.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
