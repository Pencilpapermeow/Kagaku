# Must finish before 10 Nov 2026

Features need a paid, capable AI; content can keep coming after 10 Nov through the free Claude Project. Uttam decides the order. Update this file at the end of every session.

## Done (21 Oct)

- [x] PWA shell, offline cache, update prompt, dark default + light theme, phone/iPad layouts
- [x] Pack format v1, validation, import by paste / file / `.kagaku` zip, demo pack
- [x] Private content-repo sync (token in Settings) — waiting for the repo to exist
- [x] Home: daily goal, streak, JA countdown (editable date), subject progress, backup reminder
- [x] Subject → Units/Class filters → chapters with progress
- [x] Chapter: To Remember (formulas, notes, tables, trends, self-test hide), Practice, Galti, Notes
- [x] Practice: all 8 formats, shuffle, distractor pool, "None of these" both ways, combo streak, reasons for mistakes
- [x] Questions generated from tables and trends (forward, reverse, true/false, match, ordering, highest/lowest)
- [x] Galti Notebook: auto-add, manual photo add with rotate/brighten, reasons, graduation (2–4 in a row), mistake patterns, mistakes practice/test
- [x] CBT in NTA layout: instructions, sections, palette states, Save & Next / Mark for Review / Clear, timer, submit, analysis (score, accuracy, time per question, section and chapter breakdown)
- [x] Create-your-own test (Subject → Chapters → Preferences), configurable marking schemes incl. JA partial marking; papers from packs
- [x] Verify: share to Claude, Google, Gemini (optional), key right / fix / doubtful; Report button
- [x] Bookmarks, Notes, Doubtful list, Search
- [x] Backup download / restore, storage use, "protect my data" (persist)
- [x] Tools: PDF question cropper, photo cleaner, pack builder, content-repo check
- [x] Unit tests + browser tests at phone and iPad sizes; CI deploys only when all pass
- [x] Uttam's chapter list in the registry with his numbers 1–95
- [x] Mixed form only (text + LaTeX + diagram crops); photo-form questions are refused; tools extract diagrams separately

## Waiting on Uttam

- [ ] Install the Claude GitHub App on both repos (push to `Kagaku` was refused on 21 Oct)
- [ ] Enable GitHub Pages: repo Settings → Pages → Source: **GitHub Actions**
- [ ] Create the private `kagaku-content` repo, then the read-only token (Claude will guide)
- [ ] Priority order for materials (suggested: To Remember/ratta → JA PYQs → AITS → handwritten)
- [ ] Confirm the 2 AM IST nightly bug-hunt time
- [ ] Number for "Dual nature of radiation and matter"
- [ ] Experiments (JA "General" physics): own chapter or inside Units and Measurement?

## Still to build

- [ ] MathLive keyboard for editing formulas/answers in the app (no LaTeX typing)
- [ ] Stylus drawing pad on iPad → AI converts to LaTeX
- [ ] In-app diagram cropping for his own photos (manual box) if needed
- [ ] Automated rule checks: dimensions, periodic data (NCERT), oxidation-state sum, trend order
- [ ] Parametric questions with changing numbers; reverse-format switching for stored questions
- [ ] Mistake patterns by topic (e.g. "sign convention") once topics are tagged
- [ ] Per-chapter download/remove of content from the repo; storage per subject
- [ ] Nightly bug hunt (scheduled task) once v1 is live
- [ ] Hindi user guide, Claude Project master prompt on his free plan, final ARCHITECTURE pass
- [ ] Optional/undecided: Google Drive auto-sync via Apps Script, Anki export
