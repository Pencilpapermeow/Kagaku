"""Synthetic fixtures for the "Test from paper" browser tests.

Everything here is made up (no coaching or exam material may live in this public repo).
The layout copies the shape of the papers Uttam uses: two columns, "SECTION-I (PHYSICS)",
"Single Correct Type Questions" with options (1)–(4), "Integer Type Questions", page
numbers "[ n ]", a running header, an "ANSWER KEY" page with subject columns, and a
solutions page after it. Photos are the same pages rendered, turned 90°, dimmed unevenly
and blurred a little, like phone pictures.

    python3 -I tools/fixtures/make_paper_fixtures.py tests/e2e/fixtures
"""

import io
import random
import sys
from pathlib import Path

import pymupdf
from PIL import Image, ImageFilter

W, H = 595, 842
COL = [(30, 285), (315, 570)]
FONT = 10.5
LINE = 15

PHYSICS_SINGLE = [
    ("A ball is thrown straight up with speed 20 m/s. Taking g = 10 m/s², the time it takes to reach the top is",
     ["1 s", "2 s", "4 s", "0.5 s"]),
    ("A block of mass 2 kg rests on a smooth floor. A horizontal force of 6 N acts on it. Its acceleration is",
     ["2 m/s²", "3 m/s²", "6 m/s²", "12 m/s²"]),
    ("Two resistors of 3 ohm and 6 ohm are joined in parallel and connected to an ideal cell of 6 V. "
     "The current drawn from the cell is found by first finding the equivalent resistance of the pair "
     "and then using Ohm's law for the whole circuit. Ignore the resistance of the connecting wires. "
     "The current from the cell is",
     ["1 A", "2 A", "3 A", "6 A"]),
    ("A wave has frequency 50 Hz and wavelength 2 m. Its speed is",
     ["25 m/s", "52 m/s", "100 m/s", "48 m/s"]),
]
PHYSICS_INT = [
    "A car moves 30 m in the first 3 s from rest with uniform acceleration. Its acceleration in m/s² is",
    "The number of significant figures in 0.004500 is",
]
CHEM_SINGLE = [
    ("The number of moles in 36 g of water is",
     ["1", "2", "3", "18"]),
    ("Which of these gases is lighter than air?",
     ["Carbon dioxide", "Chlorine", "Helium", "Argon"]),
    ("The pH of a neutral solution at 25 C is",
     ["0", "1", "7", "14"]),
]
CHEM_INT = ["The number of electrons in a neutral oxygen atom is"]

KEY = {1: "2", 2: "2", 3: "3", 4: "3", 5: "20", 6: "4", 7: "2", 8: "3", 9: "3", 10: "8"}


class Writer:
    def __init__(self, doc):
        self.doc = doc
        self.page = None
        self.col = 0
        self.y = 0
        self.pno = 0

    def new_page(self):
        self.page = self.doc.new_page(width=W, height=H)
        self.pno += 1
        self.page.insert_text((200, 24), "Kagaku Sample Series", fontsize=9, fontname="helv")
        self.page.insert_text((540, 828), f"[ {self.pno} ]", fontsize=9, fontname="helv")
        self.page.draw_line((297, 50), (297, 445), color=(0.5, 0.5, 0.5), width=0.6)
        self.col = 0
        self.y = 60
        self.top = 60

    def need(self, h):
        # Short columns, so questions flow into the right column and onto the next page.
        if self.y + h > 430:
            if self.col == 0:
                self.col, self.y = 1, self.top
            else:
                self.new_page()

    def heading_span(self, text):
        self.page.insert_text((W / 2 - len(text) * 3.4, self.y + 4), text, fontsize=13, fontname="hebo")
        self.y += 26
        self.top = self.y

    def text(self, text, x_off=0, bold=False, size=FONT):
        x0, x1 = COL[self.col]
        x0 += x_off
        words = text.split()
        line = ""
        max_chars = int((x1 - x0) / (size * 0.5))
        lines = []
        for w in words:
            if len(line) + len(w) + 1 > max_chars:
                lines.append(line)
                line = w
            else:
                line = f"{line} {w}".strip()
        if line:
            lines.append(line)
        for ln in lines:
            self.need(LINE)
            x0, _ = COL[self.col]
            self.page.insert_text((x0 + x_off, self.y + 10), ln, fontsize=size, fontname="hebo" if bold else "helv")
            self.y += LINE

    def question(self, n, stem, options=None, diagram=False):
        self.need(LINE * 3)
        x0, _ = COL[self.col]
        self.page.insert_text((x0, self.y + 10), f"{n}.", fontsize=FONT, fontname="hebo")
        start_y = self.y
        self.text(stem, x_off=22)
        if diagram:
            self.need(60)
            x0, _ = COL[self.col]
            r = pymupdf.Rect(x0 + 60, self.y + 4, x0 + 160, self.y + 50)
            self.page.draw_rect(r, color=(0, 0, 0), width=1)
            self.page.draw_line((x0 + 60, self.y + 50), (x0 + 200, self.y + 4), color=(0, 0, 0), width=1)
            self.y += 58
        if options:
            for i in range(0, 4, 2):
                self.need(LINE)
                x0, _ = COL[self.col]
                self.page.insert_text((x0 + 22, self.y + 10), f"({i + 1}) {options[i]}", fontsize=FONT, fontname="helv")
                self.page.insert_text((x0 + 140, self.y + 10), f"({i + 2}) {options[i + 1]}", fontsize=FONT, fontname="helv")
                self.y += LINE
        self.y += 14


def make_paper(path):
    doc = pymupdf.open()
    w = Writer(doc)
    w.new_page()
    p = w.page
    p.insert_text((180, 90), "Kagaku Sample Test 1", fontsize=18, fontname="hebo")
    p.insert_text((40, 130), "DURATION : 60 Minutes", fontsize=11, fontname="helv")
    p.insert_text((430, 130), "M.MARKS : 40", fontsize=11, fontname="helv")
    p.insert_text((40, 170), "General Instructions :", fontsize=11, fontname="hebo")
    instr = [
        "1. The test has 10 questions in two sections: Physics and Chemistry.",
        "2. Each section has Single Correct Type and Integer Type questions.",
        "3. Each correct answer will give 4 marks while 1 Mark will be deducted for a wrong response.",
        "4. Use a black ball point pen to fill the answer sheet.",
    ]
    for i, t in enumerate(instr):
        p.insert_text((40, 192 + i * 18), t, fontsize=10.5, fontname="helv")

    w.new_page()
    w.heading_span("SECTION-I (PHYSICS)")
    w.text("Single Correct Type Questions", bold=True)
    w.y += 6
    for i, (stem, opts) in enumerate(PHYSICS_SINGLE, 1):
        w.question(i, stem, opts, diagram=(i == 2))
    w.text("Integer Type Questions", bold=True)
    w.y += 6
    for i, stem in enumerate(PHYSICS_INT, 5):
        w.question(i, stem)

    w.new_page()
    w.heading_span("SECTION-II (CHEMISTRY)")
    w.text("Single Correct Type Questions", bold=True)
    w.y += 6
    for i, (stem, opts) in enumerate(CHEM_SINGLE, 7):
        w.question(i, stem, opts)
    w.text("Integer Type Questions", bold=True)
    w.y += 6
    for i, stem in enumerate(CHEM_INT, 10):
        w.question(i, stem)
    doc.save(path)


def make_key(path):
    doc = pymupdf.open()
    p = doc.new_page(width=W, height=H)
    p.insert_text((240, 80), "ANSWER KEY", fontsize=14, fontname="hebo")
    p.insert_text((40, 120), "PHYSICS", fontsize=11, fontname="hebo")
    p.insert_text((260, 120), "CHEMISTRY", fontsize=11, fontname="hebo")
    for i in range(1, 7):
        p.insert_text((40, 120 + i * 18), f"{i}.", fontsize=11, fontname="helv")
        p.insert_text((66, 120 + i * 18), f"({KEY[i]})", fontsize=11, fontname="helv")
    for k, i in enumerate(range(7, 11), 1):
        p.insert_text((260, 120 + k * 18), f"{i}.", fontsize=11, fontname="helv")
        p.insert_text((286, 120 + k * 18), f"({KEY[i]})", fontsize=11, fontname="helv")
    p.insert_text((540, 828), "[ 1 ]", fontsize=9, fontname="helv")
    s = doc.new_page(width=W, height=H)
    s.insert_text((220, 40), "SECTION-I (PHYSICS)", fontsize=13, fontname="hebo")
    y = 70
    for i in range(1, 4):
        s.insert_text((40, y), f"{i}.", fontsize=11, fontname="helv")
        s.insert_text((66, y), f"({KEY[i]})", fontsize=11, fontname="helv")
        s.insert_text((66, y + 16), "Use the first equation of motion; 12 3 4 5 are just numbers here.", fontsize=10, fontname="helv")
        y += 50
    s.insert_text((540, 828), "[ 2 ]", fontsize=9, fontname="helv")
    doc.save(path)


JA = {
    1: {
        "single": [
            ("A body starts from rest and moves with uniform acceleration 2 m/s\u00b2. Its speed after 3 s is",
             ["2 m/s", "3 m/s", "6 m/s", "9 m/s"]),
            ("The SI unit of pressure is", ["newton", "pascal", "joule", "watt"]),
        ],
        "multiple": [
            ("Which of these are vector quantities?", ["velocity", "mass", "force", "time"]),
            ("Which of these are scalar quantities?", ["speed", "displacement", "energy", "momentum"]),
        ],
        "numerical": ["A spring of constant 100 N/m is stretched by 0.1 m. The energy stored in it, in J, is"],
    },
    2: {
        "single": [
            ("The dimension of frequency is", ["[T]", "[T\u207b\u00b9]", "[L]", "[M]"]),
            ("Light travels fastest in", ["glass", "water", "vacuum", "diamond"]),
        ],
        "multiple": [
            ("Which of these are units of energy?", ["joule", "erg", "watt", "electron volt"]),
            ("Which of these can be negative?", ["work", "kinetic energy", "potential energy", "mass"]),
        ],
        "numerical": ["A 2 kg body moves at 3 m/s. Its kinetic energy, in J, is"],
    },
}
JA_KEY = {
    1: ["(C)", "(B)", "(A,C)", "(A,C)", "(0.50)"],
    2: ["(A)", "(C)", "(A,B,D)", "(A,C)", "(9)"],
}

SECTION_TEXT = {
    "single": ["This section contains TWO questions. Each question has FOUR options (A), (B), (C) and (D).",
               "ONLY ONE of these four options is the correct answer.",
               "Full Marks : +3 If ONLY the correct option is chosen; Negative Marks : -1 In all other cases."],
    "multiple": ["Each question has FOUR options. ONE OR MORE THAN ONE of these four option(s) is (are) correct answer(s).",
                 "Full Marks : +4 If only (all) the correct option(s) is (are) chosen; Partial Marks : +1 for each correct option",
                 "chosen when no wrong option is chosen; Negative Marks : -2 In all other cases."],
    "numerical": ["The answer to each question is a NUMERICAL VALUE. Round off the value to TWO decimal places.",
                  "Full Marks : +3 If ONLY the correct numerical value is entered; Zero Marks : 0 In all other cases."],
}


def make_ja(path_paper, path_key):
    """JA style: Paper 1 and Paper 2 in one PDF, one column, sections 1-3, options (A)-(D)."""
    doc = pymupdf.open()
    for paper in (1, 2):
        cover = doc.new_page(width=W, height=H)
        cover.insert_text((150, 90), f"Kagaku JA Practice \u2013 Paper {paper}", fontsize=18, fontname="hebo")
        cover.insert_text((40, 130), "Time : 3 Hours", fontsize=11, fontname="helv")
        cover.insert_text((40, 160), "INSTRUCTIONS", fontsize=11, fontname="hebo")
        cover.insert_text((40, 182), "1. Each section has its own marking scheme, given at its start.", fontsize=10.5, fontname="helv")
        cover.insert_text((40, 200), "2. Section 2 has partial marking.", fontsize=10.5, fontname="helv")
        page = doc.new_page(width=W, height=H)
        page.insert_text((40, 40), f"PAPER {paper}", fontsize=9, fontname="hebo")
        y = 70
        page.insert_text((260, y), "PHYSICS", fontsize=13, fontname="hebo")
        y += 28
        n = 0
        for si, kind in enumerate(["single", "multiple", "numerical"], 1):
            page.insert_text((40, y), f"SECTION {si} (Maximum Marks: {12 if kind != 'numerical' else 3})", fontsize=11, fontname="hebo")
            y += 18
            for t in SECTION_TEXT[kind]:
                page.insert_text((52, y), "\u2022 " + t, fontsize=8.5, fontname="helv")
                y += 13
            y += 8
            items = JA[paper][kind]
            for item in items:
                n += 1
                stem, opts = (item, None) if isinstance(item, str) else item
                page.insert_text((40, y), f"Q.{n}", fontsize=10.5, fontname="hebo")
                page.insert_text((75, y), stem, fontsize=10.5, fontname="helv")
                y += 16
                if opts:
                    for k, o in enumerate(opts):
                        page.insert_text((75, y), f"({'ABCD'[k]}) {o}", fontsize=10.5, fontname="helv")
                        y += 15
                y += 12
        page.insert_text((540, 828), f"[ {doc.page_count} ]", fontsize=9, fontname="helv")
    doc.save(path_paper)

    key = pymupdf.open()
    p = key.new_page(width=W, height=H)
    y = 70
    for paper in (1, 2):
        p.insert_text((200, y), f"PAPER-{paper} ANSWER KEY", fontsize=13, fontname="hebo")
        y += 24
        p.insert_text((40, y), "PHYSICS", fontsize=11, fontname="hebo")
        y += 18
        for i, a in enumerate(JA_KEY[paper], 1):
            p.insert_text((40, y), f"{i}.", fontsize=11, fontname="helv")
            p.insert_text((66, y), a, fontsize=11, fontname="helv")
            y += 18
        y += 20
    key.save(path_key)


def photo(page, out, turn, seed):
    """A phone-like photo of a page: turned, dim with uneven light, slightly soft."""
    pix = page.get_pixmap(dpi=150)
    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("L")
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    rnd = random.Random(seed)
    w, h = img.size
    px = img.load()
    for y in range(h):
        for x in range(w):
            light = 0.42 + 0.33 * (x / w) + 0.1 * (y / h)
            px[x, y] = max(0, min(255, int(px[x, y] * light + rnd.uniform(-6, 6))))
    img = img.rotate(turn, expand=True, fillcolor=60)
    img.convert("RGB").save(out, "JPEG", quality=80)


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    make_paper(out / "sample-paper.pdf")
    make_key(out / "sample-key.pdf")
    paper = pymupdf.open(out / "sample-paper.pdf")
    key = pymupdf.open(out / "sample-key.pdf")
    photo(paper[1], out / "photo-paper-1.jpg", 90, 1)
    make_ja(out / "sample-ja.pdf", out / "sample-ja-key.pdf")
    print("fixtures written to", out)


if __name__ == "__main__":
    main()
