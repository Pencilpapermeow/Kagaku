# Kagaku — rules for every session

Read `docs/HANDOVER.md` (who Uttam is and how to talk with him), then `docs/ARCHITECTURE.md`,
`docs/CHECKLIST.md` and, for "Test from paper", `docs/PAPER_TEST.md`.

## Maths and chemistry are always LaTeX (Uttam's permanent rule, 18 Nov 2026)

Maths and chemistry must always be written in LaTeX so KaTeX shows them in proper textbook
form: stacked fractions (`\frac{a}{b}`), real powers and subscripts (`2^{2}`, `x_{1}`),
`\sqrt{}`, `\int`, `\sum`, Greek letters, and `\ce{}` for chemistry. Never write plain text like
a/b, x^2, sqrt(x), H2SO4 or SO4 2-. This applies to everything prepared for him: To Remember
cards, questions, options, explanations, solutions, test material and app text.

In chat replies to him, use `$…$` LaTeX as well. If his interface shows it as raw code instead
of rendering it, he will say so; then use Unicode (x², ½, √) for chat only. App content always
stays LaTeX.

Before every push, check that no plain-text maths slipped in (run the existing math/render
checks: `npm test` includes `src/ui/rich.test.ts`; `npm run pack:check -- <contentDir>` for
packs) and that every expression renders without a KaTeX error.

## Other standing rules

- Talk to him in clear, friendly Roman Hindi; he has no software background — never ask him to
  run commands.
- Ask before saving anything to memory, and say in what words it will be saved.
- Coaching material and his notes never go into this public repo (only into the private
  `kagaku-content` repo as processed packs). Test fixtures are synthetic.
- `npm run check` must pass before pushing; CI deploys `main` to GitHub Pages.
