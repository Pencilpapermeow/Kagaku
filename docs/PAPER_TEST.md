# "Test from paper" (question paper + answer key → offline NTA-style CBT)

Uttam's directions for this feature (18 Nov 2026), kept as he gave them, followed by the
decisions taken while building it and how it works. Code: `src/paper/`, screens in
`src/pages/paper/`. Read `docs/HANDOVER.md` and `docs/ARCHITECTURE.md` first.

## Updates after the directions (his decisions — don't reopen)

- **18 Nov 2026: no photos.** "Main pictures click nahi karunga" — every paper and key will
  come as a PDF in the same format as the AITS samples he sent (a PW "Dropper JEE Main" AITS
  test paper, and a "Hints & Solutions" PDF that starts with an ANSWER KEY page). The photo
  path that was already built stays, but it is secondary: its OCR files (~7 MB) download only
  when a photo or a scanned PDF needs them. The photo e2e test was dropped.
- **JA-style papers too, as Paper 1 / Paper 2.** Sections 1–4 (single, one-or-more with partial
  marking, integer/numerical, list-match/paragraph), (A)–(D) options, a key that may hold both
  papers ("PAPER-1 / PAPER-2"), and possibly both papers in one PDF.
- The real sample PDFs were used only in the session workspace and never committed. Fixtures
  in `tests/e2e/fixtures/` are synthetic (`tools/fixtures/make_paper_fixtures.py`).

## How it works (as built)

| Step | Where | Notes |
|---|---|---|
| Upload | `pages/paper/PaperNew.tsx` | Two zones (paper, key); PDFs (and photos, with rotate + 4-corner straightening). A paper PDF with "ANSWER KEY" pages is spotted and offered as the key. The PDF reader (~1.6 MB) downloads once on first visit, then it's offline. |
| Processing | `paper/job.ts` | Resumable stages saved per page: `pages` (pdf.js render at 1600 px + text layer; photos cleaned in `paper.worker.ts`), `read` (OCR only for pages without text), `detect`. Only **one PDF is open at a time**: pdf.js 5 keeps the page count of the last opened document in a global (`PagesMapper`), so two open documents break each other ("Invalid page request"). |
| Finding questions | `paper/layout.ts` | Port of `tools/process/pdf_questions.py`: markers `Q.12` / `12.` / `Question 12` (and pdf.js's split `29` `.`) at a column's left edge; 1 or 2 columns (split from right-half markers or the gutter); full-width headings make bands; a question runs to the next marker/heading and continues into the next column/page as extra pieces; passages are prepended to their questions; cover/instruction pages, page numbers and repeated headers are skipped; a chain search (`chooseMarkers`) drops numbered options and instruction lists. Paper 2 inside the same PDF is split off (`paper2Start`) into its own paper. |
| Sections & types | `paper/layout.ts` | Subject headings (`SECTION-I (PHYSICS)`, `PART A – CHEMISTRY`, `PHYSICS`), section headings (`SECTION 1`, `SECTION-A (Single Correct)`), type headings (`Single Correct Type`, `Integer Type`, `One or More Options Correct`, `List Match`…), instruction text ("ONLY ONE", "ONE OR MORE", "NON-NEGATIVE INTEGER", "NUMERICAL VALUE"), marks ("Full Marks : +4 … Partial … Negative Marks : −2", "4 marks … 1 mark deducted"), duration ("180 Minutes", "3 hours"). A cover that describes several sections never sets everyone's marks. |
| Answer key | `paper/answerKey.ts` | Pure parser with many unit tests: all the formats in the directions, grids, subject columns (by x position), keys split by subject or restarting numbers, `PAPER-1/2` blocks, stops at solutions; on key PDFs it reads from the ANSWER KEY heading and skips solution pages, otherwise only "12. (B)" at line starts. |
| Matching | `paper/match.ts` | Numbering continuous or restarting on either side (`matchKey` modes). Questions the key has but the paper reading missed become placeholders ("draw its box"). Keys are fitted to the type (`keyFor`): (1)–(4) options map to ids `1`–`4`; "A or C" → `accept`; ranges → numerical with tolerance; "Bonus" → full marks to all; anything that doesn't fit is a doubt, never a silent guess. A key with both papers uses this paper's answers (from the title/cover/file name), switchable on the check screen. |
| Check & start | `pages/paper/PaperCheck.tsx` | "54 questions found · key read for 54 · 3 need a look". Only doubtful items are open; with none it's one tap "Looks right → Start". Fix crops (`CropEditor`: drag edges, draw a box, remove, split), join with next, add a missed question, change type/key/number, sections (name, subject, type), marks (shared `ui/SchemeTable.tsx` + presets), title and time. |
| Test | `engine/cbt.ts`, `pages/Cbt.tsx`, `pages/Result.tsx` | Normal CBT; one tab per subject (split only if a subject gives one type two different marks). Questions are snapshots (`p:<paperId>:<uid>`), never in `db.questions`. On the result sheet he can pick the real chapter of a question (Galti + patterns). |

Data: Dexie v2 tables `userPapers` (meta, pages with text, sections, questions with pieces and
keys, parsed key) and `paperFiles` (raw uploads until the pages are made). Images live in
`media` tagged `paper:<id>`. Galti snapshots keep their crop; backups include those crops (not
the page images). "Delete paper images" frees the space, keeps results and Galti crops.

---

## The directions (as given)

### What I want
On the Tests page I add (a) a question paper and (b) its answer key. Each one can be phone photos (one or more pages) or a PDF. From only these two, Kagaku builds an NTA-style CBT test (one question at a time) that I can take fully offline. It is scored with the existing marking engine, and wrong answers go to the Galti Notebook. No AI, nothing uploaded anywhere: all processing happens on the device. I always add the key together with the paper.

### Decisions already made (don't reopen)
1. One question at a time, NTA layout: reuse the existing CBT (pages/Cbt.tsx, engine/cbt.ts) with its palette, timer, Save & Next etc. Each question is shown as an image crop of the paper (including its options and diagrams). Below it is the answer input: A/B/C/D buttons (single or multiple) or the existing number pad (integer/numerical).
2. Photo-form exception: HANDOVER says photo-form questions are dropped. That decision is about packs. This feature is the one exception: crops live only inside papers I add myself (and Galti entries made from them). They never go into packs, the practice pool, Create-your-own-test, chapter counts, Search or the Review queue.
3. Offline-first, processing included: self-host every worker/wasm/language file (no CDN). Lazy-load the heavy libraries (pdf.js, tesseract.js) only when this feature opens. On first use, download the OCR files once with a clear message, then keep them cached so everything works offline. Don't make the main app install heavier.
4. The key always comes with the paper (no "key pending" state).

### Flow I expect
1. Tests page → new card "Test from paper" → a screen with two drop zones, "Question paper" and "Answer key". Each takes camera photos, gallery images (several, reorderable) or a PDF. Also auto-detect when the key is inside the paper PDF (pages headed "ANSWER KEY"/"ANSWERS") and suggest using it.
2. "Make test" → processing with a progress bar (page x of y), in a Web Worker, never freezing the UI, and resuming if the app was closed midway.
3. "Check & start" screen: quick, not a chore. Top summary ("54 questions found · key read for 54 · 3 need a look"). Only doubtful items open by default. If nothing is doubtful, one tap "Looks right → Start". Here I can fix a crop (drag edges, merge two, split one, add a missed question by drawing a box on the page), change a question's type, edit its key answer, rename sections, and change title, time and marking scheme (reuse the scheme table from TestBuilder.tsx).
4. Start → normal CBT → Submit → existing Result page.
5. The paper stays under Tests → "My papers" for re-attempts, with its storage size and a "Delete paper images" option (results stay).

### Processing pipeline (suggested; check it against the code)
a. Pages → images
   - PDF: render with pdf.js (pdfjs-dist). If it has a text layer, use its words + positions. If not (scanned), treat its pages like photos.
   - Photos: clean in the browser. Auto-rotate (my photos are often 90° off; pick the orientation with the best OCR confidence, or use Tesseract OSD), crop to the page, brighten/contrast, downscale to ~1600 px wide, and store as WebP/JPEG. Reuse the photo helpers in pages/Notebooks.tsx (move shared ones into a module). Add perspective correction (drag 4 corners) if it isn't too costly.
   - OCR for photos/scanned PDFs: tesseract.js, English, in a worker.

b. Question detection: port the logic of tools/process/pdf_questions.py to TypeScript. That means markers like "Q.12", "12.", "Question 12" at the start of a line; one- and two-column layouts; a question runs from its marker to the next one (so options and diagrams are included); a question continuing onto the next column/page becomes several pieces stacked vertically. Skip cover/instruction pages with no markers.

c. Sections, subjects, types
   - Detect subject headings (PHYSICS / CHEMISTRY / MATHEMATICS, PART / SECTION) and section instructions. "ONLY ONE … correct" → single. "ONE OR MORE THAN ONE" → multiple. "non-negative integer" → integer. "numerical value … decimal places" → numerical. List-I/List-II match questions are single-correct MCQs in JA.
   - Numbering may be continuous (1–54) or restart per subject (1–18 ×3). Handle both by keying questions by (subject, number).
   - Duration from the cover ("3 Hours", "180 min"), else 180. Title from the first heading or the file name. All editable.
   - Marking: detect "Full Marks : +4 … Partial … Negative −2" where possible, else use the JA preset (SCHEME_PRESETS in engine/marking.ts) per section.

d. Answer key parser: a pure function with lots of unit tests. It must handle at least "1. (A)", "1-A", "Q1 A", "1. (A,C)", "1. ACD", "1. (A) (C)", "1. 25", "1. 2.50", and ranges "2.50 to 2.70" / "2.50–2.70" (→ numerical with tolerance). It must also handle grid tables (a "Q.No" row over an "Ans" row, several groups side by side), keys split by subject, and "Bonus"/"Dropped" (full marks to everyone). If cheap, support "A or C" (either accepted) for single-correct; otherwise flag it. A single letter in a multiple-correct section stays multiple-correct. Any mismatch (key has 54 answers but the paper has 53 questions; a key answer that doesn't fit the section type) → mark it doubtful. Never guess silently.

### Fitting into the existing engine (suggested)
- Store each paper in a new Dexie table (db.ts version 2; never edit version 1), e.g. userPapers: meta, page image hashes, detected boxes, sections, key. Images go in db.media with packs: ['paper:<id>'].
- Build each question as a normal Question: format single/multiple with bare-letter options A–D (engine/variants.ts already keeps bare-letter options unshuffled), integer, or numerical with tolerance. Set image = the crop, id = p:<paperId>:<n>, and chapter = a per-subject "From papers" bucket hidden from chapter lists and counts.
- Don't put them in db.questions (session.ts, queries.ts, Search and Review read that table broadly). Pass them to createTest as snapshots instead (extend the snapshot condition in engine/cbt.ts). In engine/progress.ts, Galti stores a snapshot only for generated ids (line ~68): do the same for p: ids, so Galti re-attempts and the Mistakes test keep working.
- On the Result page, let me optionally pick the real chapter for each wrong question (for Galti's chapter-wise view and mistake patterns).
- Backup: attempts/Galti/tests go into the backup as today. Paper page images don't (too big), but the images used by Galti snapshots must, so a restored Galti isn't broken.

### Done means
- Unit tests: the key parser (every format above), marker detection (one/two columns, restarting numbers, multi-page questions), and type detection.
- E2E (Playwright, phone + iPad sizes) with fixtures you generate yourself: a made-up 2-column digital PDF + key PDF, plus the same paper rendered as rotated, dim PNG "photos". Check that the test is created with the right questions and keys, that an attempt gives the correct score, and that the whole flow works with the browser offline after the first load. Fixtures must be synthetic: no PW/coaching material in this public repo.
- Ask me to attach one real PDF paper + key and one photo paper + key in this chat for a real try. Use them only in the workspace and never commit them.
- npm run check passes; then commit and push to main (CI deploys). Update docs/ARCHITECTURE.md (new flow + data) and docs/CHECKLIST.md, and save these directions as docs/PAPER_TEST.md.
