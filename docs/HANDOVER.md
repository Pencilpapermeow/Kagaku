# Kagaku: handover from the planning chat (21 Oct 2026)

> **For Claude:** this file sums up everything Uttam and Claude decided in the first planning chat. Read all of it before doing anything. Each decision below is his, so don't reopen them unless he asks. Once the repo is pushable, save it as `docs/HANDOVER.md` in the repo.

## Updates after the planning chat

- **21 Oct 2026 (build session 1):** his handwritten chapter list is the master. **95 numbered chapters**: Physics 1–30, Chemistry 31–65, Maths 66–95 ("Solution of triangle" = 94, "Number theory (basic)" = 95). 28 = Atom/Nuclei (one chapter). "Dual nature of radiation and matter" has no number yet — he will confirm. `src/content/syllabus.ts` carries his numbers (`no`). Chapter ids must stay stable once content uses them (rename `name`, or add `aliases`).
- **Storage of questions: mixed form only.** Question and options as text + LaTeX; a diagram, if any, as a small crop; options shuffle every time. **Photo form (a crop of the whole question) is dropped completely** — not even as a backup. The five accuracy layers and his review screen apply. This replaces the "Photo form (default)" and "think first" parts of sections 4–5 below.
- **Material (~6 GB):** stays in his iPad Files and Google Drive. He sends it in this chat in batches (one chapter, or 20–30 images); Claude processes, puts packs in `kagaku-content`, then deletes the raw files from the workspace. Raw material never goes to GitHub. Drive can be listed and read as text by Claude, but not used for bulk processing (see `docs/WORKFLOW.md`).
- All work happens in the build session; the planning chat is only for discussion.
- He will send PDFs and photos **every day**. Claude sorts them chapter-wise, makes questions in several formats, and the app stores only the processed questions (compressed crops + JSON), never the raw files. He expects the raw material to total **3–6 GB**.
- He said "start the work" instead of approving static mockups first, so the foundation was built with real screens; he can redirect the look from the live app.
- See `docs/ARCHITECTURE.md`, `docs/CONTENT_FORMAT.md`, `docs/WORKFLOW.md` and `docs/CHECKLIST.md`.

---

## 1. Who you're building for

- **Uttam**, a dropper preparing for **JEE Advanced 2027** (he writes it "JA") through Physics Wallah's online course. He has **no software background**, so explain in plain words and never ask him to run commands.
- **Language:** clear, respectful, friendly Hindi in Roman script (his own style). Positive tone, light Konosuba-style humour is welcome, and nothing stiff or "professional". When something has several possible approaches, show all of them. Explain "how" rather than issuing orders. When he's wrong, say so, show the right way of thinking, and say in what context his idea could still hold.
- **Devices:** Android phone and iPad (with an Amazon Basics stylus, not an Apple Pencil).
- **Claude Pro ends on 10 Nov 2026.** Claude Code is not part of the free plan, so after that date new features or code changes need a paid, competent AI. He has said he'll re-subscribe later if needed. He does **not** want free AIs changing the code.
- **What he cares about:** a good, useful, beautiful, **durable** app. If complex code makes the app better, use it.
- **Why he wants it:** to stop learning by writing things out again and again. That saves paper and strain on his fingers. The app replaces writing with active recall. He's ready to spend several days on this because it directly supports his JA prep. His daily lesson projects (OC/Physics/IT) carry on alongside.
- **Daily time until 10 Nov:** sessions of roughly 10 min to 1 hour a day for building, testing, bug-hunting, and improving the test mode, options and interactivity.
- **His saved preferences still apply:** ask before saving anything to memory, and say in what words it will be saved. "qq" means a quick question: answer only that and assess his understanding. On "endchat", show what was saved and give him a score out of 100 (50 from a learning teacher's view, 50 from a JA teacher's view). Any message containing ":~" comes from someone other than Uttam.

## 2. Repos and hosting

| Repo | Visibility | Purpose |
|---|---|---|
| `Pencilpapermeow/Kagaku` | Public | App code only. Deploy with GitHub Pages via GitHub Actions. URL: `pencilpapermeow.github.io/Kagaku` (check the casing). |
| `Pencilpapermeow/kagaku-content` | **Private** | Content vault: processed questions, cards, cropped images, packs. **Not created or visible yet**, so check. |

- The account was renamed (`pencilpaparmeow` became `Pencilpapermeow`). Claude GitHub App installation status is **unconfirmed**, so test a push first. If the push is refused, ask him to install the App at https://github.com/apps/claude/installations/select_target (pick "Only select repositories", both repos) or to reconnect at https://claude.ai/customize/connectors?auth_start=github&auth_start_force=1
- **Content never goes into the public repo.** That covers coaching material (PW AITS papers etc.) and his notes.
- The app reads `kagaku-content` with a **read-only fine-grained GitHub token** (Contents: Read, that one repo only). He enters it once per device in Settings. You'll need to guide him through creating it step by step. Bundle content as per-chapter packs so it takes few requests.
- He does **not** want Claude putting content into Google Drive. Content goes straight into the app (via the private repo). He backs up to Drive himself, manually, whenever he likes.
- Don't put raw materials in GitHub (100MB per-file limit, repo should stay at a few GB at most). Store only processed, compressed content.

## 3. Tech decisions (quality first)

- PWA, installable on Android Chrome and iPad Safari, works offline.
- **React + TypeScript + Vite**. IndexedDB via **Dexie**. **KaTeX + mhchem** for rendering. **MathLive** visual math keyboard for edits, so he never has to type LaTeX. **Compute Engine** (or similar) for symbolic checks. **pdf.js** for PDF rendering and text positions. In-browser image cleanup (rotate, deskew, crop, brighten).
- Call `navigator.storage.persist()`. Show storage used. Allow per-chapter or per-subject download.
- Automated tests (Vitest plus Playwright at phone and iPad viewport sizes) **before every deploy**.
- Keep `docs/ARCHITECTURE.md` and the handover docs in the repo so a future paid AI can pick up instantly.

## 4. App spec

**Name: Kagaku** (科学). **UI language: English (compulsory).** **Default theme: dark**, with a light toggle.

**His original examples of what the app must handle:**
- Maths: conic section formulas.
- Chemistry: ions; atomic mass and atomic number; elements with their periodic properties.
- Physics: optics and thermodynamics formulas that depend on the condition (process type, mirror or lens case, sign convention).

His input sources: text from PDFs or images, and handwritten pages with each question and its answer written below it.

**Design references he provided:**
- **PW web:** light theme, purple accent, card grid, the Subject → Chapter → Preference stepper, and test cards showing "Questions · Marks · Mins · Attempts".
- **Marks app:** dark navy with neon icon tiles; Phy/Chem/Math tabs; Units filter (Mechanics 1/2, Optics, Thermodynamics…, Physical/Organic/Inorganic, Algebra/Calculus/Coordinate…); Class filter; per-chapter progress like "5/147"; subject progress bars; exam countdown; Notebooks (bookmarks, chapter-wise, notes); "Create your own test" and "PYQ mock tests".
- **NTA CBT** for the test screen.
- Take the **layout** as inspiration only. No logos, brand names or XP coins.

**Three moods:**
- Home and navigation: clean, in the PW/Marks style.
- Tests: NTA CBT layout. Palette colours for not visited / not answered / answered / marked for review / answered + marked, plus timer, Save & Next, Mark for Review, Clear, and section tabs.
- Quiz/practice: cute and light. Big option cards, small animations, streak.

**Structure:**
- Home: daily goal, streak, subject progress, JA countdown (date editable; JA 2027 date not announced yet).
- Subject → Units/Class filter → Chapters (~75; **Uttam supplies chapter names and topics**). Each chapter has:
  - **To Remember:** formulas, definitions, theory, "chem ratta". Show/hide for self-testing. Tables and trends live here.
  - **Practice:** all question formats.
  - **Galti Notebook** for that chapter.
- Tests (CBT): built from a question paper (photo/PDF), or "create your own" from chapters. Configurable marking scheme. Analysis afterwards: score, accuracy, time per question, subject/chapter breakdown, attempts.
- Notebooks: Galti, Bookmarks, Notes.
- Update Center: content import, plus syncing packs from `kagaku-content`.
- Search across all formulas and questions.
- Settings: theme, GitHub token, Gemini key, backup/export, daily goal.

**Question formats:**
- Single correct, multiple correct (JA partial marking), comprehension, assertion & reason, match the following, trends & comparison, true/false, numerical/integer.
- Marking schemes are per test and configurable, because JA changes its scheme by year.

**No spaced repetition.** He said it's not needed. Questions he gets wrong go to the Galti Notebook automatically.

**Galti Notebook:**
- Add a question photo, the correct answer, and a tag: concept / calculation / misread / didn't remember.
- Wrong answers from in-app quizzes and tests are added automatically.
- He can re-attempt any time; a question "graduates" after 2–3 correct attempts in a row.
- Show mistake patterns, e.g. "40% of optics mistakes are sign-convention".
- Offer a "only my mistakes" test.

**Stop the brain memorising option patterns:**
1. Shuffle option order.
2. Keep a pool of 6–10 distractors per question and pick 3 at random.
3. For table-generated questions, draw distractors from the same column.
4. Switch formats: MCQ, then the reverse question, then true/false.
5. Sometimes remove the correct option and show "None of these".
6. Parametric questions with changing numbers.

For photo-type paper questions, options can't be shuffled. Shuffle the question order instead, and offer a "think first" mode that hides the options region until he commits.

**Auto-generation from To Remember data (no AI):**
- Tables (for example thermodynamics process × W/ΔU/Q, ions name ↔ formula ↔ charge, element properties) generate MCQ, reverse and match-the-following questions.
- Trend lists generate ordering questions.

**Verify button beside every question:**
- **Ask Claude:** use the Web Share API to send the question image/text plus a ready prompt ("Key says B, I chose C — which is right? show solution") to the Claude app.
- **Google Lens / search.**
- **In-app Gemini**, if he has added a key.
- Afterwards he chooses: "Key was right" / "Key was wrong → fix" / "Still doubtful" (goes to its own list). Needs internet; the rest of the app is offline.

**Solutions:** an optional, short field. No detailed solutions; he said that's extra load.

## 5. Getting content in

**Two storage forms, both offered at upload:**
- **Photo form (default):** cropped image of the question. Faithful, including diagrams.
- **Text form:** AI-transcribed text + LaTeX. He'll use this rarely, as a last resort.

**Cropping:**
- Digital PDFs: automatic, using "Q.1, Q.2" positions from the pdf.js text layer.
- Scanned pages: he drags a box per question, or Gemini auto-crops.

**Answer keys:** from the official key. If there's no key, Claude can solve, but mark those answers "unverified".

**After 10 Nov:**
- **Default path:** a Claude free-plan **Project** (the free plan allows up to 5 projects) whose instructions hold the app's content-pack format. He adds a photo or text, Claude returns a pack, he copies it and taps **Paste** in Update Center, then reviews and adds.
- **Last resort:** a Gemini free API key inside the app, which works automatically. Its free tier and limits change, and free-tier data is used by Google.

**Other ways in:**
- A "Copy prompt" button works with **any** free AI chat (ChatGPT, the Gemini app, etc.) as a fallback to Claude.
- Manual entry in a simple format, as a last resort.
- **Preload:** everything he hands over before 10 Nov gets processed and preloaded into the app through `kagaku-content`.

**Smaller technical notes:**
- Make the Gemini model name a setting, because Google retires model names.
- Show a weekly backup reminder: clearing browser data wipes local progress. Content can be restored from the private repo; progress can't.
- **Undecided:** Google Drive **auto-sync** of progress through a small Google Apps Script "bridge" in his Drive. It would also keep phone and iPad progress in step. For now he backs up manually.
- Optional idea he hasn't confirmed: export to Anki as an extra safety net.

**No typing formulas:**
- AI writes the LaTeX.
- Edits use the MathLive button keyboard.
- On iPad, he can write with the stylus on a drawing pad and AI converts it. Pressure isn't needed; test palm rejection.

**Accuracy layers (he wants "no mistakes at all"; a fix option is acceptable):**
1. Clean the image: auto-rotate, straighten, brighten. His photos are often rotated 90° and dim.
2. AI reads twice and self-verifies; uncertain bits are highlighted.
3. Rule-based checks:
   - dimensional analysis of physics formulas
   - numeric spot-check of maths identities
   - built-in periodic table data (NCERT values)
   - ion charge via the sum of oxidation states
   - trend order checked against data
4. Side-by-side review of the original crop and the rendered version. Nothing leaves "unverified" without his tick.
5. A Report button during practice.

## 6. Bulk materials: Claude's most important ongoing job

- He'll send **up to ~10GB**: questions with answers, PDFs, PYQ images, pictures, notes, handwritten pages, mostly printed ("bookish").
- Claude processes them, puts each item in the right subject → chapter → type, removes duplicates, and arranges the questions.
- Files come into the chat (and possibly a Claude Project or a Drive folder; test whether this session can read those).
- Process in **batches** and delete raw files from the workspace afterwards, because disk space is limited. Use **scripts** for digital PDFs instead of reading pages with vision, to save Pro usage.
- **Be honest:** all 10GB probably won't be done by 10 Nov.
- **Pending:** his priority order. Suggested: (a) chem ratta / formulas / To Remember, (b) JA PYQs, (c) AITS / test papers, (d) handwritten notes.
- He supplies chapter names and topics daily. **Tell him whenever something seems missing**, by comparing against the official JA syllabus.

## 7. How you'll work together

- Work will be **mixed**: each day he may ask for anything (any chapter's material, features, fixes). There is no fixed phase plan.
- **Daily bug hunt as a scheduled task:**
  - Set it up once v1 is live; proposed time 2 AM IST, **not yet confirmed**.
  - It runs all tests at phone and iPad sizes and checks content (missing answers, duplicates, dimension mismatches).
  - It fixes small bugs but deploys only if all tests pass. Big changes need his approval.
  - Morning report. It stops after 10 Nov.
- Keep a **"must finish before 10 Nov" features checklist** and report what's left at the end of each session. Content can still be added after 10 Nov; features can't. He decides the order of work.
- Pro usage limits are shared between daytime work and the nightly job.
- **Next step:** mockups of Home, Chapter, Quiz and CBT screens for his approval, then the foundation.
- **Promised for handover by 10 Nov:**
  - a **Hindi user guide**: how to use the app, back up, change keys and tokens, and import content;
  - the **Claude Project master prompt** (the content-pack format) set up on his free plan;
  - `docs/ARCHITECTURE.md` for future maintainers.
- **Reference screenshots:** his 14 design reference screenshots and his handwritten instruction page are in `kagaku_references.zip`, attached alongside this file. Unzip it and look at them before making the mockups.

## 8. Handwriting test result

His sample page (rotated 90°, low light) was ~90% readable. A few words were uncertain, which is why the review screen and image clean-up layers matter.

Transcription of his handwritten instruction page. `[?]` marks uncertain words; he never explained what the circled F and M mean:

```
I.
3 no. … rakhiye [?]
(F)[?] Q format → JA: Comprehension (with options) · Multiple/single correct (4 options)
        · Table (match the following) · Trends · True/False
Spaced rep: zaroori nahi → ≈75 chapters ke apne alag sections, unke under "To remember": formula, theory
(M)[?] Test: just like CBT interface → Qs paper ke photo/PDF se
Card banane ke liye: default → Claude (free version); Gemini free key → last resort
- App ko Google Drive se jod sakte hain? Taaki browser data delete hone par bhi data rahe.
- Preload all things that I'm giving.
```
