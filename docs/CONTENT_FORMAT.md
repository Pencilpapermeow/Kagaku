# Kagaku content pack format (version 1)

Everything Kagaku shows comes from **packs**. Questions are stored in **mixed form only**: the question and its options as text + LaTeX, plus a small crop of the diagram when there is one. A photo of a whole question or page is never stored (Uttam's decision, 21 Oct 2026); the importer refuses a question that has no text. A pack is one JSON object (pasted, or a `.json` file) or a `.kagaku` file (a zip holding `pack.json` plus its diagram images). The app validates every pack before storing it, and shows problems instead of guessing.

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

## Images (diagrams only)

- `image` on a question, option, passage or note is **a diagram**, never the question itself.
- Inside a `.kagaku` zip: `"image": "fig/q12-1.webp"`. In plain JSON: a `data:` URI.
- Tight crop, WebP, at most ~900 px wide (usually 3–20 KB). `tools/process/` makes these.
- A graph or figure *as an option* goes in that option's `image`; options still shuffle.

## Questions

Common fields: `chapter` (required), `stem` (required: the full question text), `id` (optional; derived from content if missing), `topic`, `image` (diagram), `passage`, `solution` (2–3 lines), `solutionImage`, `source` (`exam`, `year`, `paper`, `qno`, `label`), `verified` (`official` | `checked` | `unverified`, default `unverified`), `uncertain` (what the transcriber wasn't sure of — shown on the review screen), `tags`, `difficulty` (1–3).

| format | extra fields | `answer` |
|---|---|---|
| `single` | `options: [{id, text?, image?}]` (each needs text or a diagram), `distractors?` | `"B"` |
| `multiple` | same | `["A","C"]` |
| `integer` | — | `3` |
| `numerical` | `tolerance?` (default 0.01) | `2.25` |
| `assertion` | `assertion`, `reason`, `withNeither?` | `both-explains` / `both-not-explains` / `a-only` / `r-only` / `neither` |
| `truefalse` | — | `true` |
| `match` | `left: [{id,text}]`, `right: [{id,text}]` | `{"P":"2","Q":["1","3"]}` |
| `ordering` | `items: [{id,text}]` | `["c","a","b"]` (first to last as the stem asks) |

**Example** (mixed form, with a diagram):

```json
{ "chapter": "phy.ray-optics", "format": "single",
  "stem": "A ray travels from glass $(\\mu = 1.5)$ towards air and just grazes the surface, as shown. The angle $C$ is closest to",
  "image": "fig/q007-1.webp",
  "options": [{"id":"A","text":"$30^\\circ$"},{"id":"B","text":"$42^\\circ$"},{"id":"C","text":"$48^\\circ$"},{"id":"D","text":"$60^\\circ$"}],
  "answer": "B",
  "source": {"exam": "JEE Advanced", "year": 2023, "paper": "P1", "qno": "7"},
  "verified": "official" }
```

**Distractor pool**: for text single-correct questions, `distractors` holds extra believable wrong options; practice picks a fresh set each time.

**Comprehension**: put the passage in `passages` (`id`, `chapter`, `title?`, `text`, `image?`) and set `"passage": "<id>"` on each of its questions.

## To Remember

Common fields: `chapter`, `title`, `topic`, `id?`, `source?`, `verified`, `uncertain?`, `tags`.

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
