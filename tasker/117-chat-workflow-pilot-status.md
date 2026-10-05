<!-- tasker/117-chat-workflow-pilot-status.md -->

# 117 — Chat workflow pilot / specialists: where it stands

**Status:** DECISION NEEDED (DJ). Everything is built, deployed and switched on for DJ only. It is
idle: 3 reviews ever, the last on 2026-09-30. Nothing here is running for any other user.
**Opened:** 2026-10-04 · **Replaces:** trackers 81, 82, 84–87, 89, 91, 92, 98 (epitaphs in the
appendix) · **Related, kept separate:** 88 (freshness radar), 110 (project stewards).

## In one minute

Between 09-12 and 09-23 we built a multi-agent "review committee" for chat: a planner, read-only
specialists and an editor answer one project question together, with crash-safe steps and a cost
ledger. It is live in production for your account only, as the **Review project** and **Organize
documents** chips in project chat, **Review deeper** on freshness cards, and a **Workflows** nav
tab. It lost on value: in your 09-23 blind read, specialists won 0 of 4 against plain chat with
document reads, and your "ownership" reframe became project stewards (110). Idle, it costs nothing
(its whole production life is 13 model calls, $0.025), and ordinary chat pays no meaningful
latency. It still carries about 25K lines of code, 20K of tests, 12 tables and 75 SQL functions,
hooked into the chat modal, turn route, worker startup, radar, privacy job and admin export. What
was worth keeping has already moved into core: the Jev context finder, the delivery fixes, prompt
snapshots and the paid-test rule.

## What's live today

Every switch defaults to **off** in code; a switch is on only when it reads exactly `true`. The
exceptions are the nav tab, hard-coded to DJ's email, and the admin inspector, which has no flag.
Production values were read 2026-10-04 from Vercel and Railway (names and values only).

| Surface / switch                                                 | Who sees it | State                 | Evidence                                                                                                                 |
| ---------------------------------------------------------------- | ----------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Review project** chip (v4 admission → preparation → execution) | DJ only     | ON                    | Web admission, worker preparation + execution all `true`; cohort = DJ. Last run 09-30: complete, 11 s, $0.018, plan v1   |
| **Organize documents** chip (specialist workflows + doc reads)   | DJ only     | ON                    | `SPECIALIST_WORKFLOWS` and `DOCUMENT_READ_TOOLS` are `true` on web and worker. Used once ever (09-20, synthetic project) |
| **Review deeper** on freshness cards                             | DJ only     | ON                    | Shown whenever Review project is available                                                                               |
| **Workflow Lab** + **Workflows** nav tab                         | DJ only     | ON                    | Nav hard-coded in `+layout.server.ts`; the page 404s outside the cohort                                                  |
| Specialist workbench and comparison lab (Lab subpages)           | DJ only     | Reachable, never used | 0 drafts, 0 versions, 0 comparisons ever                                                                                 |
| Published specialists, Jev recommendations, review v2/v3, etc.   | nobody      | OFF                   | Unset everywhere. The selection shadow is retired in code. The workflow context finder is on but dormant                 |
| Admin workflow inspector + export                                | admins      | ON (no flag)          | `/admin/chat/workflows`; the admin session export embeds a Workflows section                                             |
| AgentRunDock                                                     | everyone    | **Not this pilot**    | Shows `delegate_task` runs (21 runs, 3 users, last 30 days). Keep                                                        |

## What it costs

- **Money:** 13 model calls in 3 reviews ever, all yours: **$0.025 lifetime**, all inside the last
  30 days. The cost lives only in the dispatch ledger; `llm_usage_logs` has no pilot rows. Paid
  test runs since 09-14 add about **$3**, mostly full chat gates that also tested ordinary chat.
  **Idle cost: $0.**
- **Ordinary-chat latency: effectively none.** The worker enters the workflow path only for
  review-admitted turns, and the turn route's check does no I/O. Every signed-in user makes one
  small, non-blocking capabilities request per page load. The radar (DJ only) adds one indexed
  lookup per turn and one query per scan.
- **Railway:** no dedicated process. The runner lives in `agentic-chat-worker`, and the daily
  privacy job calls 2 pilot cleanups.
- **Maintenance:** the 09-30 CI repair (`e4c958357`) had to touch 5 pilot test files. The review
  logic sits in the 3,365-line `AgentChatModal`, which tracker 62 already flags. Future agents keep
  asking whether "specialists" code matters.

## What depends on it

Nothing that any user besides DJ touches.

- **No dependency:** stewards (110), capture, document organization (the loop's own lens), and the
  project cleanup card and loop (112/114). Those use the context-finder package, which was born
  here, is core now, and stays.
- **Freshness radar (88), soft coupling:** its turn trigger and scan skip workflow turns by reading
  `chat_turn_workflow_runs`, and Review deeper sends a pilot review. The trigger **swallows
  errors**, so dropping the tables first would stop the radar silently while chat keeps working.
- **Plumbing to cut cleanly:** dead-turn recovery (table-exists guard), 2 privacy-job cleanups, the
  account-deletion guard, 3 project-fold policy rows, the admin export's Workflows section, and a
  `DOCUMENT_READ_TOOL` import in chat provider validation.
- **Keep regardless:** the chat context finder (73 calls, $0.038 in 30 days), prompt-snapshot v3
  (every turn uses it), 84's delivery health, and `parseChatWorkflowPrototypeUsers` (it parses the
  context-finder cohort too).

## What we learned

- **Live (09-20):** 2 of 2 reviews completed in 27–37 s for $0.0065, with no writes, and restored
  from History. But specialists didn't share evidence, and answers exposed internal IDs.
- **Offline (09-23):** the engine was reliable, but the planner's output was invalid in 11 of 12
  runs. Reviews took 15–171 s at $0.01–0.06 each, and switching reasoning off failed.
- **Your blind read: 0 of 4** (3 ties, 1 loss): "it didn't make that big of a difference." It
  tested read-only lookups, not ownership, and that reframe became stewards.
- **Chat gates:** 45/52 (09-14); 38/52 at $1.70 against a $0.30 estimate, then 43/52 at $0.32
  (09-22). The gate was retired 09-24.
- **Carried forward:** the context finder (now in chat and the project loop), delivery and stall
  visibility (84), replay protection and the empty-reply re-ask (92), the grounding rules (113), the
  12K output cap, the prompt-snapshot fix (83), and the **ask-before-every-paid-test rule**, born
  from the $1.70 overrun.

## Options for DJ

**(a) Leave as is.** $0, and you keep the chips and tab. The maintenance tax and the "is this
live?" confusion continue, and decision 5 of the project-agents plan stays open.

**(b) Switch off for you, keep the code.** About 10 minutes, reversible.

- **Vercel:** set `AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED=false` and redeploy.
- **Railway worker:** turn off `V4_PREPARATION`, `EXECUTION`, `SPECIALIST_WORKFLOWS`,
  `DOCUMENT_READ_TOOLS` and `CONTEXT_FINDER_ENABLED`, but not `CONTEXT_FINDER_CHAT*`.
- **Both:** clear the cohort.

The chips and Review deeper disappear. The **Workflows** tab stays and turns into a 404 link unless
a 1-line change ships with it.

**(c) Remove it.** About **1–2 agent-days**, one web and one worker deploy, about 45K lines
deleted; no paid test needed.

1. Do (b) first.
2. **Delete** the worker `workflow/`, runtime `specialists/`, Workflow Lab, the specialist,
   comparison and capabilities APIs, the admin inspector and export, the progress cards, scripts
   and tests.
3. **Cut the hooks** out of the chat modal, composer, stream controller, turn route, nav, worker
   startup and recovery, radar data port, privacy job and admin session export.
4. **One new migration**, applied after the deploy: redefine the radar trigger and dead-turn
   recovery, delete the 3 fold rows, and drop the 12 tables and about 75 functions (keep
   prompt-snapshot v3). Run `pnpm db:rehearse` first and `pnpm gen:all` after.
5. Mark the docs point-in-time.

**Risk:** low for users. The real risk is ordering: the radar trigger fails silently if the tables
go first.

**Your forks in (c):**

- Should Review deeper survive as a plain-chat draft? Nearly free: the prompt already exists in
  `reviewDeeperPromptFor`.
- Should the three role prompts be saved as chat skills (decision 5's "expertise packs")?

**Recommendation:** Do (b) today, since it's free, reversible, and removes surfaces you aren't
using. Then ship (c) as one change set while no other session is in the chat modal or turn route;
keep Review deeper as a plain-chat draft and save the role prompts as skills, which closes decision
5 as "retire."

## Appendix

**Undetermined.**

- Why the two 09-20 run rows are gone while their turns and dispatch receipts remain. Retention
  wouldn't fire until 10-20.
- Whether the 09-30 review came from production or local dev. Local `apps/web/.env` also enables
  admission, and local chat runs on the production worker.

**Production flags (2026-10-04).**

- **Vercel prod:** `V4_ADMISSION`, `SPECIALIST_WORKFLOWS`, `DOCUMENT_READ_TOOLS` and
  `CONTEXT_FINDER_ENABLED` are `true`. `WORKFLOW_PROTOTYPE_USER_IDS` = DJ.
- **Railway `agentic-chat-worker`:**
    - `V4_PREPARATION`, `EXECUTION`, `SPECIALIST_WORKFLOWS`, `DOCUMENT_READ_TOOLS` and
      `CONTEXT_FINDER_ENABLED` are `true`. The cohort = DJ.
    - Core, not pilot: `CONTEXT_FINDER_CHAT` and `CONTEXT_FINDER_GLOBAL` are `on`, cohort = DJ.
- **Unset everywhere:** `PUBLISHED_SPECIALISTS`, `JEV_RECOMMENDATIONS`, `JEV_SPECIALIST_SELECTION`,
  `PROJECT_REVIEW_V2`/`V3`, `DOCUMENT_EVIDENCE_HANDOFF` and `WORKFLOW_REASONING_OFF_STEPS`.

All names carry the `AGENTIC_CHAT_` prefix. Readers: `apps/worker/src/workers/agentic-chat/host/config.ts`,
`apps/web/src/lib/services/agentic-chat-v2/worker-turn-workflow-admission.server.ts`.

**Tables (prod rows · last write).**

| Table                           | Rows | Last write                  |
| ------------------------------- | ---- | --------------------------- |
| `chat_turn_workflow_runs`       | 1    | 09-30                       |
| `chat_turn_workflow_steps`      | 4    | 09-30                       |
| `chat_turn_workflow_dispatches` | 13   | 09-20 → 09-30 (cost ledger) |
| Every other pilot table         | 0    | never                       |

The other 9 tables:

- `chat_turn_specialist_snapshots`
- `chat_turn_document_read_batches`
- `chat_turn_specialist_selection_shadows`
- `agentic_chat_specialist_drafts`
- `agentic_chat_specialist_versions`
- `agentic_chat_specialist_recommendations`
- `agentic_chat_answer_comparisons`
- `agentic_chat_answer_comparison_candidates`
- `agentic_chat_answer_comparison_votes`

**Migrations (13, about 9K lines of SQL).** `20260914165546` (prompt snapshot; keep its v3 function), `20260914203007`,
`20260914203008`, `20260920010743`, `20260920032259`, `20260920041644`, `20260920154843`,
`20260920162616`, `20260921002731`, `20260921041759`, `20260921042959`, `20260921143217`,
`20260922002140`. Later migrations that reference pilot tables: `20260918200300` (radar trigger),
`20260924000100` (turn leases), `20260924190000` (retention), `20260924190100` (account deletion),
`20260930220000` (fold policy).

**Code (approximate lines, excluding tests).**

- **Worker:** `apps/worker/src/workers/agentic-chat/workflow/` (19 files, 8.7K).
- **Runtime:** `packages/agentic-chat-runtime/src/specialists/` (1.5K).
- **Shared types:** `packages/shared-types/src/{agentic-chat-workflow-contract,chat-workflow-prototype}.ts`
  (0.9K).
- **Web (about 13.5K):**
    - Routes: `routes/workflow-lab/` (with `compare/` and `specialists/`), `routes/admin/chat/workflows`,
      `routes/api/agent/specialists/*`, `routes/api/agent/v2/capabilities`,
      `routes/api/agent/v2/turns/workflow-review-admission.ts`.
    - Admin: `lib/components/admin/chat/workflow/*`, `lib/services/admin/chat-workflow-audit-*`.
    - Chat services: `lib/services/agentic-chat-v2/{worker-turn-workflow-admission,specialist-*,answer-comparison*}`.
    - Components: `lib/components/agent/{SpecialistWorkbench,AnswerComparisonLab,WorkflowProgressCard}.svelte`,
      `agent-chat-workflow.ts`, `agent-chat-initial-review.ts`.
- **Scripts:** `apps/worker/scripts/{preview-specialists,workflow-reasoning-replay}.ts`.
- **Tests:** 21 worker files (13.6K) plus about 6K in web and runtime.

**Docs.**

- `docs/architecture/agentic-chat-workflow-v1-contract.md`
- `docs/technical/reviews/CHAT_WORKFLOW_*` (13 docs)
- `SPECIALIST_PILOT_ROLLOUT_2026-09-20.md`
- `SPECIALIST_WORKFLOW_SPEED_AUDIT_2026-09-23.md`
- `docs/testing/chat-workflow-pilot-acceptance.md` (still reads "in progress")
- `docs/research/specialist-quality-2026-09-21/`

**Epitaphs (deleted trackers).**

- **81:** Program coordinator for the whole effort. It sequenced 82–89 and tracked the 09-14
  45/52 gate.
- **82:** Regression repairs: an evidence-coverage record and claim readback. The case failures
  were finished by 92, 101/102 and 113.
- **83** _(already gone)_: Bounded role reports and the prompt-snapshot fix that every chat turn
  still uses.
- **84:** Split durable acceptance from delivery and added per-turn progress health. It is now
  core chat plumbing.
- **85:** The frozen v1 contract and the 3 storage and recovery migrations: runs, steps and the
  dispatch cost ledger.
- **86:** Lightweight admission: the web review lane, cohort gating, and the composer's Review
  project entry.
- **87:** Crash-safe step execution with reserve/settle cost receipts. It ran live: 9 calls,
  $0.0065.
- **89:** Integration acceptance against the QA gate. The gate was deleted 09-24, and 98's blind
  read answered its question.
- **90** _(already gone)_: The 09-14 stabilization gate and its repairs (45/52), closed by DJ.
- **91:** Workflow Lab audit: the `/admin/chat/workflows` inspector and the Markdown/ZIP export.
- **92:** Supervisor reliability and the specialist workbench, published specialists and the
  comparison lab. Its 09-22 gate ($1.70, 38/52) produced the paid-test approval rule.
- **98:** Step limits, speed and value: planner bound, report fitting, reasoning setting. Its
  value test and the 0-of-4 blind read ended the specialist direction.
