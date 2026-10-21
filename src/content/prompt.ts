// The instructions any AI chat needs to turn study material into a Kagaku pack.
// "Copy prompt" in the Update Center puts this on the clipboard; the same text (with the
// chapter list) is the master prompt for the Claude Project after 10 Nov.

import type { Chapter } from './syllabus'

export function packPrompt(chapters: Chapter[]): string {
  const list = chapters.map((c) => `${c.id} = ${c.name}`).join('\n')
  return `You convert JEE study material into a "Kagaku pack": one JSON object, nothing else.
Reply with the JSON inside a single \`\`\`json code block.

Top level:
{"format":"kagaku-pack","version":1,"id":"<short-unique-id>","title":"<what this is>","createdAt":"<YYYY-MM-DD>",
 "questions":[...], "remember":[...], "passages":[...], "papers":[...]}   (leave out empty lists)

MIXED FORM — the only way questions are stored:
- Write every question and every option as text: plain text with $inline LaTeX$, $$display LaTeX$$,
  \\ce{...} for chemistry, **bold**. Never put a photo of the whole question or of a page.
- If the question has a diagram, it goes in "image" as a small crop of the diagram only
  (for a pack you send as text, leave "image" out and say in "uncertain" that a diagram is needed).
- If you are unsure about any symbol, number or word, say exactly what in "uncertain".
Every item needs "chapter": one of the ids below. Pick the best match; never invent ids.
"verified": "official" only if the answer comes from an official key; otherwise "unverified".

QUESTIONS — "format" decides the fields:
- single:   "stem", "options":[{"id":"A","text":"..."},...], "answer":"B"
- multiple: same, "answer":["A","C"]
- integer:  "stem", "answer": 3
- numerical:"stem", "answer": 2.25, "tolerance": 0.01
- assertion:"assertion":"...", "reason":"...", "answer": one of
            "both-explains" | "both-not-explains" | "a-only" | "r-only" | "neither"
- truefalse:"stem", "answer": true
- match:    "stem", "left":[{"id":"P","text":"..."}], "right":[{"id":"1","text":"..."}], "answer":{"P":"2","Q":["1","3"]}
- ordering: "stem", "items":[{"id":"a","text":"..."}], "answer":["c","a","b"]
Optional on every question: "topic", "solution" (2–3 lines max), "source":{"exam":"JEE Advanced","year":2023,"paper":"P1","qno":"7"},
"distractors":[{"text":"..."}] (extra believable WRONG options for single-correct), "passage":"<passage id>".
Comprehension: put the passage in "passages":[{"id":"p1","chapter":"...","text":"..."}] and set "passage":"p1" on its questions.

TO REMEMBER — "kind" decides the fields:
- formula: "title", "latex" (no $ signs), "condition" (WHEN it applies: process, sign convention, case), "where":[{"symbol":"n","meaning":"moles"}]
- note:    "title", "body"
- table:   "title", "keyColumn":"name", "columns":[{"key":"name","label":"Ion"},{"key":"charge","label":"Charge"}], "rows":[{"name":"Nitrate","charge":"$-1$"}]
- trend:   "title", "property", "order":[LOWEST ... HIGHEST], "exceptions"
Prefer tables and trends for anything with rows/columns or an order: the app makes quiz questions from them.
If a formula changes with the case (process type, mirror vs lens, sign convention), make a table with one row per case.

Make extra formats from the same idea when it helps recall (e.g. a true/false and a reverse question),
but never invent facts. If unsure of an answer, say so in "solution" and keep "verified":"unverified".

CHAPTER IDS:
${list}`
}
