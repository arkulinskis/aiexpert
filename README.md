# AI Expert

**AI Expert** is a free training and certification site for AI engineers who want to build AI products that hold up in
production, not just in a demo. Seven programs (LLM Foundations, Context Engineering, Production RAG, Agents, Evaluation,
Security, LLMOps) teach through short sourced briefings, spaced-repetition drills, "demo or production?" judgement calls,
written production scenarios, in-browser labs, real incident files and self-assessed final exams with verifiable
certificates. Built on [Anvil](https://anvil.works) as native Anvil Forms (Python + HTML templates, a layout, custom
components, RepeatingPanels).

- **App repo:** github.com/arkulinskis/aiexpert (branch `master`). Anvil pulls `master`.
- **Live:** not published yet (waiting for the Anvil clone).
- **Inspiration:** an Instagram reel contrasting "wannabe" and "$200K" AI engineers (naive RAG vs hybrid search with
  reranking and retrieval evals; "LLM in a loop" vs scoped tools and controlled state; prompt tricks vs context, data and
  evaluation). The landing page's demo-vs-production pipeline and table come from it.

## What it does

**For everyone (no account needed):**
- **Landing page** (`#landing`): the hero is a before/after diagram (drag handle, keyboard too): a demo-grade RAG pipeline
  vs the production pipeline (rewrite, BM25 + vectors, RRF, rerank, eval gate, cited answer, tracing). Then the
  "what the demo says / what production needs" table, how learning works, the 7 programs, the 4 labs, 3 incident files,
  the sample certificate with a credential lookup, the Honour Roll and an honest FAQ (free, not accredited, no job promise).
- **Programs** (`#tracks`, `#tracks/<id>`): 7 programs x 4 modules + a capstone each. Foundations + any three specialist
  certificates earns the **AI Architect** credential.
- **Module briefings** (`#module/<id>`): the briefing, Do / Avoid, incident files, sources, further reading from the
  Library, and a link to the module's lab where there is one.
- **Labs** (`#labs`, `#labs/<id>`), all in the browser (theme/assets/ax-labs.js):
  - *Token and cost calculator*: a support-summary feature at $27,720/month; get it under a $9,000 budget with shorter
    output, prompt caching, batch and routing (editable example prices).
  - *Chunking workbench*: fixed vs structure-aware chunks, overlap, section headers; four test questions must land whole
    and labelled in one chunk.
  - *Hybrid retrieval lab*: 16 IT articles, 10 queries; real BM25, a simulated "vector" search (a synonym/concept map,
    labelled as such), RRF fusion with adjustable k, a reranker; recall@3 and MRR per configuration
    (BM25 50% · vectors 80% · hybrid 90% · hybrid + rerank 100%).
  - *Judge calibration lab*: label 16 answers, then see the LLM judge's agreement, TPR, TNR and Cohen's kappa against your
    labels; the judge misses long confident wrong answers (verbosity bias).
- **The Library** (`#library`, `#library/<program>`): 79 hand-picked resources (papers, guides, courses, books, videos,
  tools, standards), each linking to the original, filterable by program, kind, free only, and searchable.
- **Incident files** (`#cases`, `#cases/<id>`): 18 real, sourced cases (Air Canada's chatbot ruling, Mata v. Avianca,
  Deloitte Australia's report, NYC MyCity, Google AI Overviews, DPD, Cursor's support bot, Replit's deleted database,
  EchoLeak, the GitHub MCP leak, Slack AI, Amazon Q's wiper prompt, McHire's 123456, OpenAI's sycophancy rollback,
  Klarna, Anthropic's Contextual Retrieval and multi-agent research system, Project Vend), filterable by kind.
- **Verify a credential** (`#verify/<code>`) and **certificate pages** (`#certificate/<code>`), plus the Honour Roll.

**For members:**
- **Dashboard** (`#home`): rank (Prompt Tinkerer → Distinguished Architect) and XP, streak, drills due, this week of the
  study plan (or an invitation to make one), exams ready, continue where you left off, every program's progress,
  credentials, incident of the day, Honour Roll.
- **Study plan** (`#plan`): choose background (software engineer, data/ML, new to programming, product/eng leader), goal
  (land a role, ship a feature, lead projects) and hours a week (3/5/8/12); get every module and final exam scheduled week
  by week with dates, ticks for what's done, "weeks behind" and a restart button; warm-up resources for the background.
- **Drills** (`#study/review`, `#study/<module>`): recall cards and "Demo or production?" calls, Leitner boxes 0-6
  (due after 0/1/3/7/16/35/90 days); keys Space / 1 / 2.
- **Challenges** (`#challenge/<id>`): a production scenario per module; write your design, compare with the model answer,
  tick the rubric (70% to pass).
- **Module completion** = briefing read + every drill learned + challenge ≥ 70%.
- **Final examination** (`#exam/<program>`): honour code, 12 recall items (80%) + the capstone (70%); pass → certificate
  `AIX-<CODE>-<YEAR>-<6 chars>`; AI Architect is issued automatically with Foundations + 3 specialist certificates.
- **Labs** record a member's first completion (+15 XP). **Reading list**: Save any Library resource.
- **Credentials** (`#credentials`), **Profile** (name on certificates, job title, Honour Roll opt-in, theme, password).

**For admins** (`#admin`; arkulinskis@gmail.com becomes admin on first sign-in): overview, credentials (search,
revoke/reinstate), feedback inbox (older messages), users, demo data (six fictional AI engineers with progress and
certificates, marked as sample records).

## Setting it up in Anvil (once)

1. Anvil editor: **Create app → Clone from GitHub**, paste `https://github.com/arkulinskis/aiexpert`.
2. Check the **Users** service (email + password, Continue with Google, sign-up on).
3. Accept the **Schema Mismatch** alert with **"The schema of the source code is correct"**.
4. Run it, sign up with the admin email first, then **Publish**.

<!-- libraries:start -->
## Libraries and outside services

What this project uses besides its own code. Generated by `APP_MAKER/tools/libraries.py`; to change it, edit `APP_MAKER/libraries/catalog.py` and re-run the script.

| Name | How it gets in | Used here for |
|---|---|---|
| [Google Fonts](https://fonts.google.com) | Loaded from a CDN | Hanken Grotesk, JetBrains Mono, Schibsted Grotesk |
| [Anvil Uplink](https://anvil.works/docs/uplink) | Python package | Connects a Python program on any computer to an Anvil app, so each can call the other's functions. |

**Built into the browser:** localStorage, Clipboard.

**Anvil platform:** Anvil, Anvil Data Tables, Anvil JS bridge (anvil.js), Anvil Users, Anvil Google service.

**Build and test tools (not shipped):** axe-core, Node.js, Headless Chrome (DevTools Protocol), PyYAML.

<!-- libraries:end -->

## Working on it

See `.claude/skills/aiexpert/SKILL.md`. In short:

```
python tools/check.py                    # Anvil's validator, JS syntax, asset hashes, server tests -> ALL CHECKS PASSED
python -I tools/ui_test.py               # the real app in the Anvil App Server (Docker) driven by headless Chrome
python -I tools/ui_test.py --shots DIR   # + screenshots of every page (desktop/phone, light/dark, guest/member)
git push origin master                   # deploy
```

## Project layout

```
client_code/    startup.py, router.py, state.py, auth.py, legal.py, ax.py (helpers over the JS engines)
                Layouts/Shell; Pages: Landing, Auth, Home, Tracks, Module, Study, Challenge, Exam, Credentials, Certificate,
                Verify, Cases, Library, Labs, Plan, Profile, Admin; Components: Hero, Pipeline, LabStage, Drill, Rubric,
                Certificate, Seal, Ring, Bar; Items/* (cards and rows); Dialogs/LinkBox
server_code/    content_core.py (LLM Foundations), content_context/rag/agents/evals/security/ops.py (the programs),
                content_cases.py (incident files), content_library.py (the Library), Curriculum.py, Learning.py, Exams.py,
                Credentials.py, Labs.py, Plan.py, Accounts.py, Admin.py, DemoData.py, Feedback.py, common.py, SchemaCheck.py
theme/assets/   app.css (tokens + pages + role layer), ax-kit.js (schematics, pipeline hero, stamp, certificate, ring,
                confetti), ax-labs.js (the four labs), app-kit.js, icons.css (generated), theme.css (spinner), icon.svg + PNGs
tools/          check.py, assets.py, build_icons.py, make_icons.py, ui_test.py + ui/ (flow, phone, admin, exam, a11y, design, seed)
```

## Content rules

- Every factual claim is tied to a source listed in the module or incident file (checked Nov 2026). Where reports
  disagree, the text says "about" or "reported", or leaves the number out.
- No vendor prices in the content (they change); the cost lab uses clearly labelled, editable example prices.
- The Library links only to originals (authors, publishers, arXiv, official docs). Paid books are marked Paid and
  linked to the publisher; nothing is hosted.
