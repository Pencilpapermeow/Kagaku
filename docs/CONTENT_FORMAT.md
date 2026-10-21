# Kagaku content pack format (version 1)

Everything Kagaku shows comes from **packs**. A pack is one JSON object (pasted, or a `.json` file) or a `.kagaku` file (a zip holding `pack.json` plus `img/…` images). The app validates every pack before storing it, and shows problems instead of guessing.

The exact rules are the zod schema in `src/content/schema.ts`; `docs/pack.schema.json` is the same thing as JSON Schema (regenerate with `npm run schema`). The prompt that teaches any AI this format is `src/content/prompt.ts` (Update Center → "Copy prompt for any AI"); it also lists every chapter id.

## Top level

```json
{
  "format": "kagaku-pack",
  "version": 1,
  "id": "phy-ray-optics-pyq-1",
  "title": "Ray Optics – JA PYQs (batch 1)",
  "createdAt": "2026-10-22",
  "description": "optional",
  "chapters":  [ ],
  "passages":  [ ],
  "questions": [ ],
  "remember":  [ ],
  "papers":    [ ]
}
```

- `id`: letters, digits, `. _ : -`. Re-importing a pack with the same id **replaces** it.
- Leave out lists you don't need.

## Rich text

Plain text with `$inline$` and `$$display$$` LaTeX (KaTeX), `\ce{…}` for chemistry (mhchem, also works without `$`), `**bold**`, `*italic*`, and line breaks. Write `\$` for a literal dollar sign.

## Images

- Inside a `.kagaku` zip: `"image": "img/q12.webp"`.
- In plain JSON: a `data:` URI.
- Grayscale WebP around 1000–1400 px wide is the target (≈15–40 KB per printed question). Tools in `tools/process/` make these.

## Questions

Common fields: `chapter` (required), `id` (optional; derived from content if missing), `topic`, `stem`, `image`, `imageSplit`, `passage`, `solution` (2–3 lines), `solutionImage`, `source` (`exam`, `year`, `paper`, `qno`, `label`), `verified` (`official` | `checked` | `unverified`, default `unverified`), `tags`, `difficulty` (1–3).

| format | extra fields | `answer` |
|---|---|---|
| `single` | `options: [{id, text?, image?}]`, `distractors?`, `optionsInImage?` | `"B"` |
| `multiple` | same | `["A","C"]` |
| `integer` | — | `3` |
| `numerical` | `tolerance?` (default 0.01) | `2.25` |
| `assertion` | `assertion`, `reason`, `withNeither?` | `both-explains` / `both-not-explains` / `a-only` / `r-only` / `neither` |
| `truefalse` | — | `true` |
| `match` | `left: [{id,text}]`, `right: [{id,text}]` | `{"P":"2","Q":["1","3"]}` |
| `ordering` | `items: [{id,text}]` | `["c","a","b"]` (first to last as the stem asks) |

**Photo questions** (cropped from a paper, options printed in the picture):

```json
{ "chapter": "phy.ray-optics", "format": "single", "image": "img/q007.webp",
  "optionsInImage": true, "imageSplit": 0.62,
  "options": [{"id":"A"},{"id":"B"},{"id":"C"},{"id":"D"}], "answer": "C",
  "source": {"exam": "JEE Advanced", "year": 2023, "paper": "P1", "qno": "7"},
  "verified": "official" }
```

`imageSplit` is where the options start (fraction of the image height); "think first" mode blurs everything below it until he taps. Options in an image are never shuffled.

**Distractor pool**: for text single-correct questions, `distractors` holds extra believable wrong options; practice picks a fresh set each time.

**Comprehension**: put the passage in `passages` (`id`, `chapter`, `title?`, `text`, `image?`) and set `"passage": "<id>"` on each of its questions.

## To Remember

Common fields: `chapter`, `title`, `topic`, `id?`, `source?`, `verified`, `tags`.

| kind | fields |
|---|---|
| `formula` | `latex` (no `$`), `condition` (when it applies), `where: [{symbol, meaning, unit?}]`, `note` |
| `note` | `body`, `image?` |
| `table` | `columns: [{key, label, quiz?}]`, `keyColumn`, `rows: [{key: value}]`, `note?` |
| `trend` | `property`, `order` (**lowest → highest**), `basis?`, `exceptions?` |

Tables and trends turn into questions automatically: forward ("ΔU for isothermal?"), reverse (only when the value is unique in its column), true/false, match-the-following (4 rows), ordering, highest/lowest. Wrong options always come from the same column. Set `"quiz": false` on columns like "remarks". A formula that changes with the case (process, mirror vs lens, sign convention) is best written as a table with one row per case.

## Papers (full CBT tests)

```json
{ "id": "ja-2023-p1", "title": "JEE Advanced 2023 Paper 1", "exam": "JEE Advanced", "year": 2023,
  "durationMin": 180, "scheme": "ja",
  "sections": [
    { "name": "Physics",   "questionIds": ["ja23p1-q1", "ja23p1-q2"] },
    { "name": "Chemistry", "questionIds": ["…"], "scheme": { "name": "Section 2", "rules": { "multiple": { "correct": 4, "wrong": -2, "partial": true } } } }
  ] }
```

`scheme` is a preset id (`ja`, `main`, `practice`) or an inline scheme: `rules` per format with `correct`, `wrong`, `unattempted` (default 0) and `partial` (JA multiple-correct partial marking).

## Chapters

A pack may add a chapter or rename one: `{"id": "phy.new-chapter", "unit": "misc", "cls": 12, "name": "…", "aliases": ["phy.old-id"]}`. Ids look like `phy.ray-optics`, `chem.goc`, `math.parabola`.

## Content repo layout (`Pencilpapermeow/kagaku-content`, private)

```
index.json          { format: "kagaku-index", version: 1, updatedAt, packs: [{id, file, title, chapters, bytes, sha256, counts}] }
packs/<id>.kagaku
```

`npm run pack:build -- <draftDir> --out <contentDir>` writes the pack and updates `index.json`; `npm run pack:check -- <contentDir>` validates everything.
