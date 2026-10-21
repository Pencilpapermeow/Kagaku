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
| Deploy | GitHub Actions → GitHub Pages, only from `main`, only when every check passes (`.github/workflows/ci.yml`) |

## Folders

```
src/
  content/   pack format (schema.ts), chapter registry (syllabus.ts), importer, repo sync,
             AI prompt (prompt.ts), demo pack
  db/        Dexie schema, settings, live queries, backup/restore
  engine/    pure logic: marking, practice variants, generators, sessions, CBT, progress, verify
  ui/        shared components: kit (buttons, sheets, tabs), content (rich text, images),
             answer inputs for every format, Verify sheet, shell/nav
  pages/     one file per screen
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
- **Progress** — `attempts`, `galti`, `bookmarks`, `notes`, `qmeta`, `tests`, `days`, `settings`. Exists only on the device; `src/db/backup.ts` exports it (plus his own photo questions, `packId: 'user'`) to one JSON file. Tokens/keys are never exported.

Ids:
- Question ids come from the pack, or are derived from a hash of the question's content without the answer (`q_<16 hex>`), so the same question from two sources dedupes and a corrected key replaces the old one.
- Generated questions have ids `g:<rememberId>:<kind>:…`; Galti stores a `snapshot` of them and tests store `snapshots`, because their random parts can't be rebuilt exactly.
- `qmeta.fixedAnswer` ("Key was wrong → fix") overrides the pack answer everywhere (`withFix` in `engine/session.ts`) and survives re-imports.

Chapters: `src/content/syllabus.ts` is the built-in registry; packs may add or override chapters (`chapters` in the pack). **Never change a chapter id once content uses it** — change `name`, or add the old id to `aliases`.

## Main flows

- **Import** (`content/importer.ts`): `readPackSource` (JSON text, AI reply with ```json fences, or zip) → `preparePack` (zod + cross-checks: answers exist among options, chapters exist, passages/papers resolve, images present, duplicates) → preview in the Update Center → `commitPack` in one transaction (replaces an older copy of the same pack). `removePack` drops content only; progress stays.
- **Repo sync** (`content/sync.ts`): reads `index.json` from the private `kagaku-content` repo with a read-only fine-grained token, compares SHA-256 with installed packs, downloads `.kagaku` files.
- **Practice** (`engine/session.ts` → `pages/Practice.tsx`): pool = stored questions + questions generated from tables/trends; weighted towards unseen and Galti questions; each shown through `presentQuestion` (shuffle, distractor pool, "None of these" as right *or* wrong option; photo questions untouched). Every answer → `recordAttempt` (attempt log, daily count, Galti add/streak/graduate).
- **CBT** (`engine/cbt.ts` → `pages/Cbt.tsx`): NTA semantics — an answer counts only after Save & Next / Save & Mark; palette states not visited / not answered / answered / marked / answered+marked; timer saved every 5 s and paused while the app is closed; `submitTest` logs attempts so wrong answers reach Galti; `evaluate` gives section/chapter/question breakdowns.
- **Marking** (`engine/marking.ts`): per-test schemes; JA multiple-correct partial marking = +1 per correct option chosen when no wrong option is chosen.
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
- **Database change**: add `this.version(2).stores(...)` in `db.ts` (never edit version 1) with an `upgrade` if rows need rewriting.
