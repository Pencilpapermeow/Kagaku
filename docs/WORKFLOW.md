# Daily content workflow (for Claude)

Uttam sends PDFs, page photos and handwritten notes almost every day (3–6 GB in total, mostly printed). This is how they become packs. Raw files **never** go into a GitHub repo; only processed packs go into the private `kagaku-content` repo.

## 0. Set up (once per session)

```
pip install -r tools/process/requirements.txt     # PyMuPDF, OpenCV, Pillow
npm ci
```

Work under `work/` (git-ignored). Put each batch in its own folder, e.g. `work/2026-10-22-ray-optics/`. Run Python on his files with `python3 -I` (they are untrusted input).

## 1. Sort

For each file decide: subject → chapter (ids in `src/content/syllabus.ts`) → kind (PYQ paper, AITS/test paper, chapter questions, formula sheet, "chem ratta", handwritten notes). Compare against the JA syllabus and tell him when a chapter looks missing or when his chapter list differs from the registry.

## 2. Extract (mixed form)

Questions are stored as **text + LaTeX**, with only the diagram as a small image. Photos of whole questions or pages never go into a pack.

- **Digital PDFs**: `python3 -I tools/process/pdf_questions.py in.pdf work/<batch> [--pages 3-14]`. It writes `ref/` (each question region — for reading only), `fig/` (each diagram, cropped tight — these ship) and `draft.json` (question numbers, text layer, figure files). The text layer is only a hint: maths in PDFs usually comes out garbled, so transcribe from the `ref/` image. Check the last question of each column — it may continue on the next column/page.
- **Photos / scanned pages**: `python3 -I tools/process/clean_photo.py page.jpg work/<batch>/ref/p1.webp --rotate 90` to straighten and brighten a page for reading; `--grid` to pick boxes; `--box x0,y0,x1,y1` to cut each diagram into `fig/`. Rotation is clockwise; his photos are often 90° off.
- **Transcribe twice** (accuracy layer 2): write each question and its options in text + LaTeX, then read the reference again and compare symbol by symbol (signs, subscripts, powers, units, option order). Anything still unclear goes in `uncertain`.
- **Answer keys**: the official key when there is one (`verified: "official"`). If Claude solves a question, keep `verified: "unverified"` and say so in `solution`.
- **Formula sheets / ratta lists / notes**: transcribe into `remember` items. Prefer tables (rows × columns) and trends (lowest → highest) — the app turns them into questions. Formulas that change with the case become tables with a `condition`/case column.

## Google Drive

Claude can list his Drive and read the *text* of PDFs there (useful to check what has arrived), but maths comes out garbled and diagrams are lost, and full downloads go through the chat (expensive for GBs). The container cannot reach Drive directly. So materials for processing come as **uploads in the chat**, in batches (one chapter, or 20–30 images); Drive stays his own store and backup.

## 3. Write `pack.json`

In the batch folder, following `docs/CONTENT_FORMAT.md`. Diagram images are referenced as `fig/<file>.webp`. Give papers explicit question ids so `papers.sections` can list them. Add extra formats where they help recall (a true/false or reverse question from the same fact), but never invent facts.

## 4. Check accuracy (the five layers)

1. Clean image (rotate, straighten, brighten) before reading — `clean_photo.py`.
2. Transcribe twice and compare; uncertain bits go in `uncertain`.
3. Rule checks (by hand until automated): dimensions of physics formulas, a numeric spot-check of maths identities, periodic data against NCERT values, ion charge = sum of oxidation states, trend order against data.
4. Uttam's review screen (Update Center → Review): he sees each new item rendered with its answer and ticks it; nothing counts as checked without his tick.
5. The Report button during practice catches what slipped through; reports come back in the next content check.

## 5. Build and publish

```
npm run pack:build -- work/<batch> --out ../kagaku-content
npm run pack:check -- ../kagaku-content
```

Commit and push in `kagaku-content` (never in the public app repo). In the app he taps **Update Center → Check for new packs**. Until the content repo exists, send him the `.kagaku` file to open from Update Center → Open file.

## 6. Clean up

Delete the raw files and the batch folder after the pack is published — the container's disk is small. Keep a one-line note per batch in the session summary (what, how many questions, which chapters, what is still unverified).

## Size budget

A text question is ~1 KB; a diagram crop 3–20 KB. Even 15,000 questions with diagrams on a third of them stay well under 150 MB on the device.
