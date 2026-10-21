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

## 2. Extract

- **Digital PDFs** (have a text layer): `python3 -I tools/process/pdf_questions.py in.pdf work/<batch> [--pages 3-14]`. It crops every question to WebP, records `imageSplit` (where options start) and the question text. Check the last question of each column — it may continue on the next column/page; fix by hand if so. Use scripts, not vision, for digital PDFs: it saves usage.
- **Photos / scanned pages**: `python3 -I tools/process/clean_photo.py page.jpg work/<batch>/grid.jpg --rotate 90 --grid` → look at the grid image → cut questions with `--box x0,y0,x1,y1[,split]` (fractions). Rotation is clockwise; his photos are often 90° off.
- **Answer keys**: take the official key when there is one (`verified: "official"`). If Claude solves a question itself, keep `verified: "unverified"` and say so in `solution`.
- **Formula sheets / ratta lists / notes**: transcribe into `remember` items. Prefer tables (rows × columns) and trends (lowest → highest) — the app turns them into questions. Formulas that change with the case become tables with a `condition`/case column.

## 3. Write `pack.json`

In the batch folder, following `docs/CONTENT_FORMAT.md`. Images are referenced as `img/<file>.webp`. Give papers explicit question ids so `papers.sections` can list them. Add extra formats where they help recall (a true/false or reverse question from the same fact), but never invent facts.

## 4. Check accuracy

- Read every transcription against the crop. Highlight anything uncertain in `solution` and leave it `unverified`.
- Rule checks to apply by hand until they're automated: dimensions of physics formulas, a numeric spot-check of maths identities, periodic data against NCERT values, ion charge = sum of oxidation states, trend order against data.

## 5. Build and publish

```
npm run pack:build -- work/<batch> --out ../kagaku-content
npm run pack:check -- ../kagaku-content
```

Commit and push in `kagaku-content` (never in the public app repo). In the app he taps **Update Center → Check for new packs**. Until the content repo exists, send him the `.kagaku` file to open from Update Center → Open file.

## 6. Clean up

Delete the raw files and the batch folder after the pack is published — the container's disk is small. Keep a one-line note per batch in the session summary (what, how many questions, which chapters, what is still unverified).

## Size budget

Printed question crop ≈ 15–40 KB as grayscale WebP. 10,000 questions ≈ 250–400 MB, which phones and iPads can hold in IndexedDB; per-chapter packs let him install only what he needs.
