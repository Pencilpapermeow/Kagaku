# Kagaku architecture

Kagaku (科学) is an offline-first PWA for JEE Advanced practice, built for one student (Uttam) on an Android phone and an iPad. Read `docs/HANDOVER.md` first for who it is for and why; this file is how it works.

## Stack

| Concern | Choice |
|---|---|
| UI | React 19 + TypeScript, Vite 7, `react-router-dom` (HashRouter, so deep links work offline and on GitHub Pages) |
| Storage | IndexedDB through Dexie 4 (`src/db/db.ts`); live queries with `dexie-react-hooks` |
| Maths/chemistry | KaTeX + mhchem (`src/ui/rich.ts`) |
| Validation | zod 4 (`src/content/schema.ts`) — the single source of truth for the pack format |
| Packs | zip files (`.kagaku`) via `fflate` |
| Offline | `vite-plugin-pwa` (Workbox precache, update prompt in `src/ui/UpdatePrompt.tsx`) |
| Icons | `lucide-react`; fonts self-hosted via `@fontsource-variable/*` |
| Tests | Vitest (unit, `src/**/*.test.ts`, `fake-indexeddb`) and Playwright (`tests/e2e`, Pixel 7 + iPad portrait + iPad landscape) |
| Test from paper | pdf.js (`pdfjs-dist` legacy build) and tesseract.js, both lazy and **not** precached: `assets/paper/**` and `ocr/**` are cached on first use (Cache Storage `kagaku-paper-tools-v1`, see `src/paper/tools.ts` and `vite.config.ts`) |
| Deploy | GitHub Actions → GitHub Pages, only from `main`, only when every check passes (`.github/workflows/ci.yml`) |

## Folders

```
src/
  content/   pack format (schema.ts), chapter registry (syllabus.ts), importer, repo sync,
             AI prompt (prompt.ts), demo pack
  db/        Dexie schema, settings, live queries, backup/restore
  engine/    pure logic: marking, practice variants, generators, sessions, CBT, progress, verify
  paper/     "Test from paper": answer-key parser, question finding, matching (pure, unit-tested),
             pixel work + image worker, pdf.js/OCR loaders, the resumable job, paper store
  ui/        shared components: kit (buttons, sheets, tabs), content (rich text, images),
             answer inputs for every format, Verify sheet, shell/nav
  ink/       handwritten point cards: stroke maths (geometry.ts, unit-tested), SVG view, store
  sync/      device sync through the private repo: GitHub Git Data client, three-way merge,
             one adapter per synced kind, engine (status.ts is the light part the screens use)
  pages/     one file per screen (pages/paper/: upload, check & start, crop editor;
             InkEditor.tsx: the full-screen handwriting pad)
  styles/    tokens.css (theme variables, dark default + light) and app.css
tools/
  process/   Python: crop questions from digital PDFs, clean phone photos (Claude's side)
  pack/      Node: build/check packs and the content-repo index with the app's own validator
  icons/     renders PNG icons from public/icon.svg
tests/e2e/   Playwright flows
docs/        handover, this file, content format, workflow, checklist, pack JSON Schema
```

## Data model

Two kinds of data, kept apart on purpose:

- **Content** — `questions`, `remember`, `passages`, `papers`, `chapters`, `media`, `packs`. Always comes from packs, so it can be re-installed and is **not** in backups. Every row carries `packId`. Images live once in `media`, keyed by SHA-256, with the list of packs using them.
- **Progress** — `attempts`, `galti`, `bookmarks`, `notes`, `ink`, `qmeta`, `tests`, `days`, `settings`. Exists only on the device; `src/db/backup.ts` exports it (plus his own photo questions, `packId: 'user'`, and the paper crops that Galti entries show) to one JSON file. Tokens/keys are never exported.
- **His own papers** (Dexie v2) — `userPapers` (one row per paper: pages with their text, sections, questions with their boxes and keys, the parsed key) and `paperFiles` (raw uploads, deleted once the pages are made). Page images and question crops are in `media` tagged `paper:<id>`. Not in backups (too big); "Delete paper images" frees them and keeps results.

- **Handwritten point cards** (Dexie v3) — `ink`: one row per card (`id`, `chapter`, optional typed `title`, `height`, `paper` ruled/squares/plain, `strokes`). Strokes are vectors in page units (card width is always 1000), `p` = flat `x0,y0,x1,y1…` with one decimal, colours are theme names (`ink` = black on light, white on dark). In backups.
- **Device sync bookkeeping** (Dexie v3) — `syncBase` (per synced item: fingerprint here + git blob sha in the repo at the last agreement; `#commit` = last sync) and `packSources` (the original file of each pack he added by paste/file, so it can be sent on). Typed notes got a `uid` (same on every device). Local only; restoring a backup clears `syncBase` so the next sync only adds.

Ids:
- Question ids come from the pack, or are derived from a hash of the question's content without the answer (`q_<16 hex>`), so the same question from two sources dedupes and a corrected key replaces the old one.
- Generated questions have ids `g:<rememberId>:<kind>:<rows>:<hash>` (`rows` = table rows involved, `t` for a trend; v0.1 ids `g:<id>:<kind>:…` are still parsed by `parseGeneratedId`); Galti stores a `snapshot` of them and tests store `snapshots`, because their random parts can't be rebuilt exactly.
- `qmeta.fixedAnswer` ("Key was wrong → fix") overrides the pack answer everywhere (`withFix` in `engine/session.ts`) and survives re-imports.

Chapters: `src/content/syllabus.ts` is the built-in registry; packs may add or override chapters (`chapters` in the pack). **Never change a chapter id once content uses it** — change `name`, or add the old id to `aliases`.

## Main flows

- **Import** (`content/importer.ts`): `readPackSource` (JSON text, AI reply with ```json fences, or zip) → `preparePack` (zod + cross-checks: answers exist among options, chapters exist, passages/papers resolve, images present, duplicates) → preview in the Update Center → `commitPack` in one transaction (replaces an older copy of the same pack). `removePack` drops content only; progress stays.
- **Repo sync** (`content/sync.ts`): reads `index.json` from the private `kagaku-content` repo with a fine-grained token, compares SHA-256 with installed packs, downloads `.kagaku` files.
- **Practice** (`engine/session.ts` → `pages/Practice.tsx`): pool = stored questions + questions generated from tables/trends; weighted towards unseen and Galti questions; each shown through `presentQuestion` (shuffle, distractor pool, "None of these" as right *or* wrong option; photo questions untouched). Every answer → `recordAttempt` (attempt log, daily count, Galti add/streak/graduate).
- **To Remember practice is adaptive** (`engine/generate.ts`, `engine/adaptive.ts`, `engine/similar.ts`): `buildSlots` puts *facts* (a table row, a whole trend) into the session; each becomes a question only when reached, at the current level. Levels: 1 Warm-up (random wrong options), 2 Tricky (look-alike options ranked by `similarity`/`confusion`, "which of these" multiple correct, short orderings), 3 JA mode (statements / correctly-matched pairs / comparisons multiple correct, two-step "hop" recall, correct-order MCQ), 4 Boss (typed numbers, 5-row match with a spare option). 2 right in a row → level up, 2 wrong/skipped → level down, partly right holds; the level is saved per chapter set in the `practiceLevels` setting. A missed fact returns 3–5 questions later in another form (max twice; only the rows he got wrong). Every generated question carries a `solution` built from the source row/trend, and the feedback shows the correct answer in words (`answerInWords`) plus that explanation. Columns whose value is printed in the key (charge of `\ce{SO4^2-}`) are never asked.
- **CBT** (`engine/cbt.ts` → `pages/Cbt.tsx`): NTA semantics — an answer counts only after Save & Next / Save & Mark; palette states not visited / not answered / answered / marked / answered+marked; timer saved every 5 s and paused while the app is closed; `submitTest` logs attempts so wrong answers reach Galti; `evaluate` gives section/chapter/question breakdowns.
- **Marking** (`engine/marking.ts`): per-test schemes; JA multiple-correct partial marking = +1 per correct option chosen when no wrong option is chosen.
- **Test from paper** (`src/paper/`, details in `docs/PAPER_TEST.md`): upload (`pages/paper/PaperNew.tsx`) → `paper/job.ts` (resumable: `pages` → `read` (OCR only when a page has no text) → `detect`) → `layout.detectQuestions` + `answerKey.parseAnswerKey` + `match.buildPaper` → crops cut in `paper.worker.ts` → "Check & start" (`pages/paper/PaperCheck.tsx`) → `store.startPaperTest` → normal CBT. Questions are `p:<paperId>:<uid>` snapshots (never in `db.questions`, so practice, counts, Search and Review don't see them), single/multiple with bare option ids (`A`–`D` or `1`–`4`), chapter `<subject>.from-papers` (hidden `PAPER_CHAPTERS`) until he picks one on the result sheet. Galti keeps their snapshot. `Question.accept` ("A or C") and `Question.bonus` (full marks to all) exist for these keys. **Keep only one pdf.js document open at a time** (pdf.js 5 keeps the page count in a global).
- **Handwritten points** (`pages/InkEditor.tsx`, chapter Notes tab): his stylus (Amazon Basics) is capacitive, so the browser sees a finger: one finger/stylus writes, two fingers that land within 300 ms scroll (the first finger's stroke is dropped), a later second touch is ignored as a palm, contacts wider than 44 px are ignored, and the **palm guard** (fixed strip at the bottom, auto-on for iPad-size screens, drag to resize) swallows touches. Live stroke = one SVG path updated directly (no React render per move); committed strokes render through a per-stroke path cache. Points are lightly smoothed (`addPoint`), the card grows by 320 units when he writes near the bottom (max 6000: iOS limits). Eraser removes whole strokes. Notes tab: cards in writing order, numbered, **Self-test** covers them (title stays visible) until tapped.
- **Device sync** (`src/sync/`): everything goes to the branch `kagaku-sync` of the content repo (same token, which then needs **Contents: Read and write**; `main` and the packs are never touched, and shallow single-branch clones don't download it). Files: `ink/<id>.json`, `notes/<uid>.json`, `papers/<id>.json` + `papers/<id>.media.<16 hex of the picture list>.zip` (page images and crops, stored uncompressed), `packs/<id>.kagaku`. Per item a three-way merge (`merge.ts`): base = last agreed state; one side changed → it wins; deleted on one side and edited on the other → the edit wins; both changed → ink cards/notes are **kept twice** (local copy gets a new id), papers: newer `updatedAt` wins, packs: repo wins. One sync = 3 GETs to read the tree, GETs only for changed files, then at most one commit (binary → blob uploads, text inline in chained trees of ≤ 900 KB, commit, ref update without force; a refused update = the other device synced meanwhile → retry). Papers still being read are skipped; local-only paper fields (`bytes`, `imagesDeleted`, progress) are never sent. Auto: on start, back on screen (30 s apart), back online, 8 s after a change to `ink`/`notes`/`userPapers`/`packSources`; Settings → "Sync between devices" has the switch and "Sync now". Progress (attempts, Galti, tests) is **not** synced yet. Tests: `src/sync/sync.test.ts` (two devices, fake GitHub in `src/test/fakeGithub.ts`) and `tests/e2e/sync.spec.ts` (two browser profiles).
- **Verify** (`engine/verify.ts`, `ui/VerifySheet.tsx`): Web Share to the Claude app (image + ready prompt), Google search, optional Gemini (`x-goog-api-key`, model name is a setting); outcomes: confirmed / fixed / doubtful.

## Checks before every deploy

```
npm ci
npm run typecheck      # tsc -b
npm test               # Vitest
npx vite build
npx playwright test    # phone + iPad sizes (CI installs Chromium itself)
```

Inside a Claude cloud container Playwright 1.56.1 matches the pre-installed Chromium, so no browser download is needed. CI builds with `KAGAKU_BASE=/<repo>/`; e2e tests follow the same base path.

## Adding things

- **A question format**: add it to `FORMATS` and `zQuestion` in `schema.ts`, checking in `importer.checkQuestion`, `check`/`describeAnswer` in `marking.ts`, an input in `ui/answer.tsx`, `responseToAnswer` in `verify.ts`, the prompt in `prompt.ts`, docs, and tests.
- **A screen**: a file in `src/pages`, a route in `App.tsx`, an e2e check for no sideways scroll.
- **Database change**: add `this.version(3).stores(...)` in `db.ts` (never edit earlier versions; v2 added `userPapers`, `paperFiles`) with an `upgrade` if rows need rewriting.
- **A paper layout the reader misses**: add a unit test with its lines to `src/paper/layout.test.ts` (or a key format to `answerKey.test.ts`) first. `work/harness/run.mts`-style scripts (git-ignored `work/`) can run a real PDF through the same code in Node with `pdfjs-dist`; real papers never go into the repo.
