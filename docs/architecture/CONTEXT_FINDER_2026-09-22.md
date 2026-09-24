<!-- docs/architecture/CONTEXT_FINDER_2026-09-22.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-22; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Shared Context Finder: Jev-selected evidence for specialists (and later, chat)

Status (2026-09-23): **shipped in f212700b1; `AGENTIC_CHAT_CONTEXT_FINDER_ENABLED=true` in
production** (Railway `agentic-chat-worker` first, then Vercel web, redeployed on the same commit).
It stays dormant until `AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED` is on for web and worker (off
as of 2026-09-23). No migration. Paid pilot run ($0.30, results below); DJ declined a rerun of the
fixed cell. Spec
lineage: `JEV_CONTEXT_RANKER_2026-09-22.md` (chat chips) and the free replay in `docs/research/jev-context-ranker-2026-09-22/README.md` ("Applying the ranker to the
research specialist").

## What it does

A published specialist review today reads a **recency-capped inventory**: titles and summaries of
the newest records, and document bodies only when the model asks to read them. If the facts are
in an old document, or deep inside a long one, the specialist never sees them.

The context finder asks Jev one yes/no question per project record ("would this help answer the
question?"), then one per heading of the top five documents. The best records load in full: their
best sections for documents, an opening excerpt as fallback. The next tier loads as one-line
summaries. Everything is frozen into the workflow's context checkpoint, so **every role (planner,
analyst, reviewer, editor) sees the same evidence and can cite it.**

In Workflow Lab, **"Working from"** shows that selection before the review starts. The user can
pin (load in full), drop, or add a record Jev missed. The edited plan rides along with the review.

## One core, several hosts

`packages/agentic-chat-runtime/src/context-finder/` (export `@buildos/agentic-chat-runtime/context-finder`):

| File          | Job                                                                                     |
| ------------- | --------------------------------------------------------------------------------------- |
| `packets.ts`  | Records → condensed packets (title, description, headings) and parsed sections          |
| `rank.ts`     | Two-stage Jev ranking behind a structural `ContextFinderDecider` port; request cap      |
| `select.ts`   | Policy `safe_v1` → `ContextPlanV1` (ids, tiers, sections; no record text)               |
| `evidence.ts` | Plan → `ContextEvidenceV1` (excerpts, summaries, missing, coverage); strict plan parser |
| `edit.ts`     | Pin / drop / add edits over a plan (pure; the browser and the server share it)          |
| `finder.ts`   | `findProjectContext`: rank + select + materialize, or materialize a given plan only     |
| `load.ts`     | One loader for every host; the caller supplies the authority (RLS client or service)    |

Policy `safe_v1` (the eval's "safe packing"): full tier = p ≥ max(0.25, 0.6 × top), at most 10
items within 14,000 characters, packed skip-not-stop; documents contribute their best 4 sections
(p ≥ 0.25, ≤ 2,000 characters each) or a 1,500-character opening (a **pinned** document with no
ranked section loads its first 8,000 characters, never less than a document read's 6,000);
START HERE is skipped because the payload already carries it; next 20 items at p ≥ 0.25 become one-line summaries; up to 5 pins
load first and are exempt from the budget. A parity script reproduced the eval's selections
exactly.

## Flow

```
Workflow Lab                         web                                   worker
────────────                         ───                                   ──────
[Find evidence] ──POST /api/agent/context-finder
                     user RLS client → loadContextFinderProject
                     JevClient (5 s, no retry) → rank → plan
                ◀── { preview: plan + candidates, no record text }
pin / drop / add (applyContextPlanEdits, local)
[Run specialist review] ── admission: contextFinder = auto | curated(plan)
                           plan re-validated (parseContextPlanV1), frozen
                           into the hash-bound specialist snapshot ─────▶ preparation:
                                                                          curated → materialize only
                                                                          auto → rank now (8 s)
                                                                          fail → "unavailable" note
                                                                          → payload.data.selected_evidence
                                                                          → evidenceVersions (citable)
                                                                          → checkpoint (recovery reuses it)
```

- **Auto mode** (no preview, or "Skip this") ranks in worker preparation (8 s per Jev call;
  the interactive preview uses 5 s).
- **Curated mode** never calls Jev again; the worker only loads the listed records. Ids that no
  longer exist are reported under `missing`. The worker loads only this project's records, so a
  forged id cannot reach another project.
- **Fail-open:** any finder error records `context_finder` as a preparation error and freezes an
  `unavailable` block telling roles to rely on the other context and say what is missing. An
  aborted turn still aborts.
- The Task 91 audit export shows a "Context finder" block per run (status, source, ranker cost
  and duration, full items with section headings, summaries, missing ids, coverage).

## Flags and rollout

| Flag                                  | Where  | Effect                                                                          |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| `AGENTIC_CHAT_CONTEXT_FINDER_ENABLED` | worker | Installs the finder in preparation (with workflow execution)                    |
| `AGENTIC_CHAT_CONTEXT_FINDER_ENABLED` | web    | Admission adds `contextFinder`; Lab shows "Working from"; preview route answers |

Also required on web: the four published-specialist gates and `PRIVATE_OPENROUTER_API_KEY`.

**Deploy order landmine:** a worker that predates this change rejects snapshots carrying
`contextFinder` (strict key counts). Deploy web and worker at the **same SHA**, turn the worker
flag on first, then web. Turning web off stops new requests; runs already admitted keep their
frozen evidence.

Cost: Jev measured $0.00082 and 543 ms p50 per two-stage ranking in the offline eval (1,161 ms
p95). The preview route has a soft cap of 150 previews per user per day (from `llm_usage_logs`).
The larger cost is specialist input: up to about 14K characters of evidence per role.

## Paid pilot (2026-09-22, $0.30)

`apps/worker/tests/contextFinderPilot.live.test.ts` (opt-in: `CONTEXT_FINDER_PILOT=1`) runs the
real published-specialist workflow on a disposable PostgreSQL with real DeepSeek
(`deepseek/deepseek-v4-flash`) and real Jev. It reads two projects from the linked database
read-only (`load_fastchat_context` is STABLE) and grades answers with Jev against
`docs/research/jev-context-ranker-2026-09-22/scenarios.json`. Output (private) lands in
`output/context-finder-pilot/<timestamp>/`. One review per cell:

| Question              | Today | Jev auto | Curated (one pin)       |
| --------------------- | ----- | -------- | ----------------------- |
| 9takes influencers    | 0/4   | 4/4      | 4/4                     |
| 9takes email strategy | 2/4   | 4/4      | 4/4                     |
| School cost           | 4/4   | 4/4\*    | 4/4                     |
| School who            | 4/4   | 4/4      | 0/4 → fixed, rerun owed |
| Facts                 | 10/16 | 16/16    | 12/16                   |
| $ / review            | 0.019 | 0.031    | 0.024                   |

\* Jev timed out at 3 s; the review fell back to reads. Timeouts raised (worker 8 s, preview 5 s).

- The curated 0/4: the pinned document had no ranked sections, loaded 1,500 characters, and hid
  "Team & Support" at ~5,700; the specialist then read nothing. Fixed (pinned opening 8,000
  characters) with a regression test in `context-finder.test.ts`.
- Unrelated to the finder: the planner failed validation (`workflow_planner_invalid`) in 11/12
  reviews in every arm (the fixed plan was installed), and the analyst's report failed
  (`workflow_report_invalid`) in 2/12. The planner has one attempt at 1,200 output tokens; the
  raw outputs were not captured, so the cause is unconfirmed.
- **2026-09-23 caveat:** the pilot's route carried no provider routing. The workflow pins V4.1
  Flash, so OpenRouter's price-weighted default served it from the cheapest V4.1 endpoints
  (7–45 tok/s p50, some fp4). Its times, and possibly its planner failures, do not describe
  production. See `docs/technical/reviews/SPECIALIST_WORKFLOW_SPEED_AUDIT_2026-09-23.md` and
  tasker 98.

## Not built yet

1. **Chat consumer.** Same core, shadow mode first in the worker turn provider, then chips per the
   ranker spec.
2. **Section-level read tool.** Specialists still read documents by opening; a read-by-heading
   tool needs a small migration for the read ledger.
3. **Pilot rerun** of the fixed curated cell (school "who"): not run, by DJ's call.

## Chat consumer plan (2026-09-23, DJ chose the ambitious route)

This is the ambitious route: shadow mode plus the "Working from" chips in ordinary project chat,
for DJ's account first. It reuses this core unchanged. The UX spec is
`JEV_CONTEXT_RANKER_2026-09-22.md`; the evidence for the packing policy is the eval README
(`safe_v1` = 88% fact coverage vs 38% today on DeepSeek).

**Phase A: worker, in the turn provider's first pass**

- Hook: `turn-provider.ts`, `if (initial)`. Run `loadContextFinderProject` + `findProjectContext`
  **concurrently** with `toolSelector.select`, so the p50 ranking (~355–550 ms) hides behind the
  existing tool-selection wait. Project-focused turns only.
- Timeout 1.5 s, fail-open. The turn runs as today.
- Modes come from `AGENTIC_CHAT_CONTEXT_FINDER_CHAT=off|shadow|chips|on` (env kill switch) plus a
  per-user `feature_flags` row `context_finder_chat`:
    - `shadow`: rank and write a receipt, nothing else.
    - `chips`: also publish the selection; inject only the user's pins.
    - `on`: inject the `safe_v1` evidence via `renderContextEvidenceBlock` as a system message
      after the stable prompt, through `appendSystemInstruction`.
- Receipt: a durable `context_selection` semantic event (plan ids, tiers, sections,
  probabilities, cost, duration) through `persist_agentic_chat_semantic_event`. No new table.

**Phase B: chips in the chat UI**

- New stream event `context_selection` in `AgentStreamEventV1` (phase `prompt`), published
  before the first `text_delta`. It's persisted, so reloads show it.
- `ContextChips.svelte` goes under the user message, reusing `ContextFinderPanel.svelte`'s item
  rendering where it fits. Inkprint tokens and central Lucide icons.
    - Solid chip = full; hollow chip = summary; the section name shows on document chips.
    - "+ N more · M checked" expands the list.
- "Read by model" ticks come from existing `tool_call` events, matched against chip ids in the UI
  adapter. No new event.

**Phase C: steering**

- Pin / drop / add are stored as session-scoped `ContextPlanEditsV1` in
  `chat_sessions.agent_metadata.context_finder_edits`. No migration.
- A new `POST` route validates ids against the session's project; the route reuses the
  preview-route auth.
- The next turn applies the edits with `applyContextPlanEdits` (pins load first and are exempt
  from the budget; drops are excluded).
- **v1 applies edits from the next message.** Mid-turn application at a pass boundary is a
  follow-up, only if next-message feels too slow in use.

**Phase D: measure, then turn injection on**

- Run shadow/chips on DJ's real chats for about a week. Compare tool lookups per turn, turns
  with and without injection, and misses (records the model fetched that Jev ranked below the
  summary tier, or that DJ pinned).
- Then set `on` for DJ. Other users only after the ledger looks right.

**Before starting**

1. **OpenRouter balance is $0.86** (2026-09-23), on the production key. Shadow mode spends about
   $0.001 per project turn, and live chat stops if the balance hits zero. Top up first.
2. **Commit the eval artifacts** (`JEV_CONTEXT_RANKER` spec, the research folder) with an
   explicit pathspec.
3. **Deploy landmine:** same-SHA web + worker, worker first (strict snapshot keys). Also confirm
   Vercel web deploys are healthy before Phase B.

### Status 2026-09-23: phases A and B built (uncommitted, flag off, not deployed)

**Worker**

- `provider/chat-context-finder.ts` (`ChatContextFinder`): loads the project, ranks it and
  builds the `context_selection` payload.
    - Deadline 2.5 s (load + ranking, raced so a hung dependency can't hold the turn), Jev
      1.5 s per call.
    - Fail-open; a cancelled turn still cancels.
    - The idempotency key is derived from the payload, so a retry that ranks differently can't
      conflict and fail the turn.
- `turn-provider.ts`: the finder starts before live vision and tool selection and runs
  concurrently with them. The event is yielded before the first provider pass, so it arrives
  before any answer text. `on` appends `renderContextEvidenceBlock` via `appendSystemInstruction`.
- Config: `AGENTIC_CHAT_CONTEXT_FINDER_CHAT=off|shadow|chips|on` (default off) and
  `AGENTIC_CHAT_CONTEXT_FINDER_CHAT_USER_IDS` (a comma-separated allowlist; empty ranks nobody).
  Wired through `bootstrap.ts` → `composition-root.ts`. Independent of the specialist flag.

**Shared types**

- `context-selection.ts`: `ContextSelectionEventV1` plus a defensive parser.
- The event is added to the `AgentSSEMessage` union.

**Web**

- `agent-chat-sse-handler.ts`: `case 'context_selection'` passes visible selections to
  `attachContextSelection`.
- `AgentChatModal.svelte`: sets `metadata.context_selection` on the user message with the
  matching `client_turn_id`, replacing the message object rather than mutating it.
- `api/chat/sessions/[id]`: reload joins the latest visible `context_selection` turn event onto
  its user message, so reopened chats keep their chips.
- `ContextSelectionChips.svelte` + `context-selection-chips.ts`, rendered under the user bubble
  in `AgentMessageList.svelte`:
    - solid chip = full, dashed chip = summary;
    - the first section shows on document chips;
    - task and document chips link to the record;
    - "+N more · M checked" expands;
    - an accent tick marks records the model's tools read, matched by record id in the
      thinking-block tool arguments;
    - `unavailable` shows a quiet one-liner.

**Tests**

- Worker: `tests/agenticChatContextFinderChat.test.ts` (11). Covers the allowlist, chips/on/
  shadow, fail-open on load failure and deadline, cancel propagation, and the transition id.
  Turn-level: the selection comes before text, and injection happens only in `on`.
- Web: `context-selection-chips.test.ts` (6) and `agent-chat-sse-handler.test.ts` (+2).
- Existing suites: 262 worker provider/config/composition tests pass; the consumer config
  expectation was updated.
- `pnpm --filter @buildos/web check`: 0 errors, 0 warnings, after rebuilding `shared-types`
  dist.

**Not built yet**

- Phase C (pin/drop).
- "Found by model" chips for unranked records the model read.
- Mid-turn steering.

**Turn it on for DJ**

1. Commit, then deploy web and the chat worker. The event is additive: an old web ignores
   unknown event types, and old workers never emit it.
2. On the Railway `agentic-chat-worker`, set:
    - `AGENTIC_CHAT_CONTEXT_FINDER_CHAT=chips`
    - `AGENTIC_CHAT_CONTEXT_FINDER_CHAT_USER_IDS=255735ad-a34b-4ca9-942c-397ed8cc1435`
3. Watch `llm_usage_logs` operation `agentic_chat_context_finder_chat` for cost, and the
   `context_selection` rows in `chat_turn_events` for latency (`elapsed_ms`) and failures.

## Tests

- Runtime: `src/context-finder/context-finder.test.ts` (16, incl. the pinned-document regression), `published-execution.test.ts`
  (snapshot carries auto/curated, rejects a tampered plan).
- Worker: `publishedSpecialistExecution.postgres.test.ts` freezes Jev-selected evidence (a record
  outside the inventory) into the checkpoint for every role, with and without finder failure.
- Web: preview service (RLS client, 404 before any Jev call, no record text), admission
  (flag off, auto, curated, tampered → 422), transport payload, audit export block.
