<!-- docs/technical/reviews/CODE_TRIAGE_2026-10-18.md -->

# Code Triage — 2026-10-18

**Status:** round 1 shipped in `9735aa719` (pushed). Round 2 is queued as trackers 125-136 (no decisions needed); the rest waits on your calls. All 44 open bugs were re-checked against `9735aa719` on 2026-10-18. **Last updated:** 2026-10-18.

This doc is the plan and the reference, maintained by hand. Work status lives in each tracker. Interactive version of the original findings: https://claude.ai/artifact/S398GNa2PMmkEP2PVBbXPx

## Where we are

|                     |                                                 Found |                                                              Done | Open                                                                                       |
| ------------------- | ----------------------------------------------------: | ----------------------------------------------------------------: | ------------------------------------------------------------------------------------------ |
| Bugs                |                                                    52 |                                                      8 (all high) | 44: 39 in trackers 125-133, 1 needs your pick (web search), 5 wait on a call or are parked |
| Deletion candidates |                                       45 (~93k lines) | 19 (~38k lines of code and tests + 27k lines of stored eval data) | 26: 8 behind your calls, the rest in trackers 125, 129, 132 and 134, or later              |
| Product calls       |                                                     8 |                                                                 0 | 8 (below)                                                                                  |
| Stuck switches      | 22 flag variables on Railway, 19 flag names on Vercel |                                8 unread variables deleted (10-18) | the rest follow a call, a code change (tracker 129) or the 11-01 soak (tracker 136)        |

Re-check result: none of the 44 open bugs was fixed by the day's other commits. 40 are still exactly as reported. 4 changed:

- The bake-off runner: its admin-preview half was deleted in round 1; the runner half is still open.
- The project-loop race: it is real but lives in the web trigger, not the worker.
- Second staged update: round 1 fixed the reported case, and edge cases are left.
- merge_llm: only MCP clients still see it.

## Work queue (no decisions needed)

Each item is a tracker in `tasker/` that a Codex agent can take cold: what users get, the files it owns, each bug with where it is now and the fix, rules, checks, a self-check and a report format. Status lives in the tracker, not here. Claude does a light check after each one reports.

| Order | Tracker                                                                                                                          | Size            | Start                                  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------- |
| 125   | [Chat window tells the truth and always finishes](../../../tasker/125-chat-window-truth-and-finish.md)                           | ~1 day, 6 bugs  | wave 1, now                            |
| 126   | [Chat gets the facts right](../../../tasker/126-chat-gets-the-facts-right.md)                                                    | ~1 day, 6 bugs  | wave 1, now                            |
| 127   | [Project loops and audits survive deploys](../../../tasker/127-project-loops-survive-deploys.md)                                 | ~1 day, 4 bugs  | wave 1, now                            |
| 128   | [Queue and brief scheduling hardening](../../../tasker/128-queue-and-brief-scheduling.md)                                        | ~1 day, 4 bugs  | wave 1, now                            |
| 129   | [Delete round 2 and small chores](../../../tasker/129-delete-round-2-and-chores.md)                                              | ~1 day          | wave 1, now                            |
| 130   | [Calendar you can trust](../../../tasker/130-calendar-you-can-trust.md)                                                          | ~2 days, 6 bugs | wave 2, after 126                      |
| 131   | [Chat turns end cleanly](../../../tasker/131-chat-turns-end-cleanly.md)                                                          | ~1 day, 4 bugs  | any time (shares no files with wave 1) |
| 132   | [Approved changes never duplicate or lose edits](../../../tasker/132-approved-changes-never-duplicate.md)                        | ~2 days, 6 bugs | wave 2, after 127                      |
| 133   | [LLM spend counted right](../../../tasker/133-llm-spend-counted-right.md)                                                        | ~1 day, 2 bugs  | wave 2, after 126                      |
| 134   | [Background cleanup: SMS crons, embedding deletes, worker redeploys, icon generation](../../../tasker/134-background-cleanup.md) | ~1 day          | wave 3, after 128                      |
| 135   | [First send faster](../../../tasker/135-first-send-faster.md)                                                                    | ~half a day     | wave 3, after 125                      |
| 136   | [Kill-switch cleanup after the soak](../../../tasker/136-kill-switch-cleanup-after-soak.md)                                      | ~1 day          | not before 2026-11-01                  |

- **Wave 1 (125-129) runs in parallel.** The five share no files. On a busy laptop, start 125-127 first and add 128-129 as runs free up.
- **Wave 2 (130-133):** 130 and 133 wait for 126 to be committed, and 132 for 127, because they edit the same files. 131 shares no files with wave 1, so it can start whenever a run slot is free.
- **Wave 3 (134-135)** after wave 2; 134 needs 128 in.
- **136** waits for the two-week kill-switch soak (2026-11-01).
- Migrations in 129, 134 and 135 are written and rehearsed by the agent and applied by DJ.

**Codex prompt** (one agent per tracker; change the file):

```text
You are working in /Users/djwayne/buildos-platform (pnpm monorepo, branch main). Your assignment is tasker/125-chat-window-truth-and-finish.md. Read AGENTS.md, then that tracker, and do every item under "Work, in this order", following its Rules exactly. Other agents are editing other files in this same checkout right now: touch only the files the tracker lists, and never stash, reset, revert or reformat anything else. When you finish, run the tracker's "Self-check before you report", update the tracker file as it describes, and reply with its Report section.
```

## Needs your call before an agent can start

- **Web search without regex** (`web-egress-policy.ts`, a no-regex violation; tracked in the bug list, not in a tracker yet).
    - Lean: delete the regex and send every search to the existing Jev reviewer (+~2 s on searches that skipped review).
    - Ambitious: Jev's opening pass returns a structured research topic, which also skips the per-search review (−~2 s per search).
- **One LLM client on the web:** delete `OpenRouterV2Service` + the smart-llm `streamText` path (~5.7k lines). Needs one small paid check, because three web features move clients.
- **Faster write turns** (speed item S1): DJ picked it on 2026-10-18 → `tasker/138-faster-write-turns.md`. Measured: 215 of 256 reviewer passes in 30 days were the battery's harness account; real users had 26 reviewed write turns, 8 of them reviewed 2–5 times.
- **The 8 product calls** below, plus the 5 bugs parked under them:
    - Regex/keyword classification of the user message steers live skill preloads (repo-rule violation) (`apps/web/src/lib/services/agentic-chat/tools/domains/domain-sensing.ts:128`): tasker/124, which you parked on 10-18 ("decide what we want before building").
    - Prewarm bumps chat_sessions.updated_at and writes ~40KB context into the session every run (`apps/web/src/routes/api/agent/v2/prewarm/+server.ts:512`): Call #2. Deleting prepared prompts removes the per-session cache and fixes this; if they stay, fix it alone (skip the merge when the cache came from the same session, plus a migration so the merge stops touching `updated_at`).
    - Prepared prompts drop focused-table fields (`apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-cache.ts:169`): Call #2. Moot if prepared prompts are deleted; otherwise a 3-field allowlist fix.
    - Quiet-hours SMS is retried then marked failed instead of cancelled/deferred (`apps/worker/src/workers/notification/smsAdapter.ts:698`): Call #5. Cannot happen while SMS is off; goes away with the SMS code.
    - brief.completed SMS deliveries accumulate as 'pending' forever (`apps/worker/src/workers/notification/notificationWorker.ts:715`): Call #5. Deleting the SMS worker code alone makes this worse. It needs a migration that removes the SMS branch of `emit_notification_event`, plus a one-time cancel of the pending rows.

## Speed: steps worth skipping

These are the step-skips and simplifications with the best payoff, ranked. The full lists are in the appendix.

| #   | What                                                                                                                                                                                                                                                                                                                                                                                   | Saves                                                                                                                                                                                        | Effort              | Gate                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| S1  | **Faster write turns.** Send structured-safe write batches (creates inside the focused project, single-entity updates of ids read this turn) down the direct lane instead of the reviewer. Close reviewed write turns from the ledger receipt when every outcome is satisfied. Code: `turn-state.ts` `takeWithheldMutationBatch` / `assessDirectWriteBatch`, `directWriteReceiptText`. | The reviewer is 21.6% of all model time: ~4.3 s per reviewed write turn, plus ~2.7 s for the extra closing pass. The biggest speed win available.                                            | M                   | A paid battery before and after (your OK; cost depends on the acting model). |
| S2  | **Lighter chat open** (call #2). Delete prepared prompts, stop the 90 s prewarm re-fire, stop sending the ~40 KB context to the browser, drop the per-session cache, fold the context warm into the turns warm-up GET.                                                                                                                                                                 | ~12 DB round trips per open chat every 90 s, one Vercel cold start per open, ~2.9k lines, and 2 bugs (old chats looking recently active; table fields dropped). Cost: ~0.2 s on 2% of turns. | M                   | Call #2                                                                      |
| S3  | **Quiet background work** (call #3 + free items). Drop the drift lens from the nightly pass, skip scheduled audits while the last one is untouched, put freshness radar in shadow. Free: gate the dormant crons, do embedding deletes inline in the trigger, narrow Railway `watchPatterns` to the worker's real dependencies.                                                         | 2 of 7 LLM calls per loop run (the slowest path, ~42-55 s), ~1,850 do-nothing queue jobs per 30 days, fewer worker redeploys (which feed tracker 127's lost-run bug), and less inbox noise.  | S-M                 | Call #3 for the first three; the free items are tracker 134                  |
| S4  | **First send faster** (tracker 135). The admission RPC returns the created session row. The transport-decision lookup runs in parallel with preparation. The "finalizing" lifecycle event folds into the finalize RPC.                                                                                                                                                                 | One round trip on every first send (the new-user first impression), 30-80 ms on every send, 50-150 ms on every turn.                                                                         | S each, 1 migration | none                                                                         |
| S5  | **Research without a review per search.** The ambitious web-search option above.                                                                                                                                                                                                                                                                                                       | ~2 s per web search, and removes a no-regex violation.                                                                                                                                       | M                   | Your pick                                                                    |

Not worth it: skipping Jev tool selection or the context finder. They already run in parallel and cost ~0.3 s together.

Large simplifications to save for when a change gets hard to land: split `turn-executor.execute` (L), split `AgentChatModal` into 5 modules (L; tasker/62), one calendar core (L), make `build-lite-prompt` section-order driven (M).

## Switch cleanup

Read 2026-10-18 at about 16:00: flag values only from Railway (three services), names only from Vercel production. Every name was checked against the code that reads it.

### 1. Done 2026-10-18: deleted because no code reads them

| Variable                                                                      | Where                                                                 |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `AGENTIC_CHAT_WORKER_ENABLED`                                                 | Railway agentic-chat-worker (`true`) and daily-brief-worker (`false`) |
| `AGENTIC_CHAT_WORKER_LIVE_VISION_ENABLED`                                     | Railway agentic-chat-worker                                           |
| `AGENTIC_CHAT_TOOL_GATEWAY`                                                   | Vercel                                                                |
| `AGENTIC_CHAT_WORKER_ROUTING_ENABLED`, `AGENTIC_CHAT_WORKER_ROUTING_USER_IDS` | Vercel                                                                |
| `OPENROUTER_V2_ENABLED`                                                       | Vercel                                                                |
| `LIBRI_INTEGRATION_ENABLED`                                                   | Vercel (only the worker reads it, and it is not set there)            |
| `NATIVE_SEARCH_DURABLE_CACHE_ENABLED`                                         | Vercel (only the worker reads it; keep the Railway copy)              |

Removed by Claude on 2026-10-18 at about 15:45 after a final check of code, build configs, CI and `turbo.json`; production had no project loops or chat turns in flight. Vercel had one shared entry per variable, so production, preview and development are all clear. Railway did not redeploy, so the running workers drop the old values on their next deploy. The stale `AGENTIC_CHAT_WORKER_ROUTING_ENABLED` line in `turbo.json` was removed too (uncommitted).

### 2. Flip today (cheap, saves work)

Done 2026-10-18 night: `PRIVATE_CYCLE_DAILY_BRIEF_SHADOW_ENABLED` (was `true`) and the redundant `PRIVATE_CYCLE_COORDINATOR_ENABLED` (`false`, same as default) deleted from the Railway daily-brief-worker. Takes effect on that worker's next deploy. The libri-worker pause and radar shadow still wait on calls #8 and #3.

- `PRIVATE_CYCLE_DAILY_BRIEF_SHADOW_ENABLED` → delete it (the code default is off). It runs an hourly shadow comparison for cycles, which have never run.
- Pause the `libri-worker` Railway service (call #8).
- `FRESHNESS_RADAR_MODE` `live` → `shadow` (call #3).

### 3. A small code change first, then remove

Done 2026-10-18 night for the first two: tracker 129 flipped the defaults (deployed in `1499e4d54`), then Claude deleted `AGENTIC_CHAT_LIVE_TEXT_PREVIEW` and `AGENTIC_CHAT_DIRECT_WRITE_RECEIPT_TEXT` from the Railway agentic-chat-worker. Both were `true`, now the default, so behavior is unchanged.

- `AGENTIC_CHAT_LIVE_TEXT_PREVIEW`, `AGENTIC_CHAT_DIRECT_WRITE_RECEIPT_TEXT`: they default to `false` in code but are `true` in production. Tracker 129 flips the defaults, and then the Railway values are redundant.
- `AGENT_CHAT_LIVE_VISION_ENABLED`: the worker refuses to start without it (`PRODUCTION_REQUIRED_CONFIG`). It goes with call #7, and the web also reads it in `worker-turn-preparation.server.ts`.

### 4. Delete the off-branch after the soak (about 2026-11-01)

These are kill switches for things turned on 10-17 or 10-18. Keep them two quiet weeks, then delete the unused branch with its variable:

- `AGENTIC_CHAT_LIVE_TEXT_PREVIEW`, `AGENTIC_CHAT_DIRECT_WRITE_RECEIPT_TEXT`
- `AGENTIC_CHAT_PROVIDER_HEDGING`, `AGENTIC_CHAT_CONTEXT_FINDER_BROAD`
- `AGENTIC_CHAT_PROVIDER_INCIDENT_DRAIN`, `SMART_LLM_INCIDENT_DRAIN`
- the `off`/`shadow`/`chips` modes of `AGENTIC_CHAT_CONTEXT_FINDER_CHAT` and `_GLOBAL`
- the `AGENTIC_CHAT_CONTINUATION_REASONING` A/B arms (~2k lines, already decided "keep default")

Keep `AGENTIC_CHAT_PROVIDER_INCIDENTS` (privacy switch) and the `off` mode of `AGENTIC_CHAT_JEV_TOOL_SELECTION` (kill switch).

### 5. Goes with a product call

| Call                                  | Variables that go away                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1 Project Review                     | Railway: `AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED`, `AGENTIC_CHAT_WORKFLOW_EXECUTION_ENABLED`, `AGENTIC_CHAT_WORKFLOW_V4_PREPARATION_ENABLED`, `AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED`, `AGENTIC_CHAT_CONTEXT_FINDER_ENABLED`. Vercel: `AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED`, `AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED`, `AGENTIC_CHAT_CONTEXT_FINDER_ENABLED`, `AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED`, `AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS`. Code-only, never set: `AGENTIC_CHAT_PROJECT_REVIEW_V2_ENABLED`, `_V3_ENABLED`, `AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED`, `AGENTIC_CHAT_DOCUMENT_EVIDENCE_HANDOFF_ENABLED`. |
| #4 Deep research / agent-run executor | `PRIVATE_DEEP_RESEARCH_ENABLED`, `AGENT_RUN_COST_RECONCILIATION_ENABLED` (code-only, off)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| #5 SMS                                | `PRIVATE_SMS_SENDING_ENABLED`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| #6 Cycles                             | `PRIVATE_CYCLE_COORDINATOR_ENABLED` (plus the shadow flag above)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| #7 Live vision                        | `AGENT_CHAT_LIVE_VISION_ENABLED` (Railway and Vercel)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| #8 Libri                              | `LIBRI_WORKER_ENABLED`, `LIBRI_WORKER_ACTIVATION_MODE` stay with the paused service                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Icon generation (tracker 134)         | `PROJECT_ICON_GENERATION_ENABLED` (code-only, off)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### 6. Keep

- `PRIVATE_ENABLE_CONSUMPTION_BILLING_GATE`: off until people pay.
- `ENGAGEMENT_BACKOFF_ENABLED`, `USE_WEBHOOK_EMAIL`, `NATIVE_SEARCH_DURABLE_CACHE_ENABLED` (Railway): live behavior, and the code defaults differ.
- `GMAIL_RELEVANCE_PHASE_A_*`: the active email-suggestions work.
- `PRIVATE_MULTI_CALENDAR_CONNECTIONS_*`: the active rollout.

## Your calls

### 1. Keep the Project Review workflow?

**Your call (2026-10-19): keep.** You'll update it later. It comes off the deletion list.

**Size:** ~30,000 lines. About 30,000 lines across the worker, the runtime package, the web Workflow Lab and their tests. 0 runs in the last 30 days, 13 dispatches ever, the last on Sept 30. Three switches keep it on in production.

**Recommendation:** Delete it and tag the commit so it can be restored. If you have a plan for it in the next month, freeze it instead: bug fixes only, no new work.

**Unlocks:** ~30k lines and 12 switches (section 5).

### 2. Keep prepared prompts for a 0.2-second head start?

**Your call (2026-10-19): keep.** Tracker 139 fixes the two bugs they carry (old chats marked recently active; fast turns losing the focused table) and stops sending the full context to the browser.

**Size:** ~2,583 lines. 2.6k lines plus a table and 2 database functions. Used on 29 of 1,544 turns, saving about 200 ms each. It also rewrites the open chat's session row every 90 seconds, which makes old chats look recently active.

**Recommendation:** Delete it and keep a light context warm-up when chat opens. Chat turns take several seconds each (p90 about 21 s), so 0.2 s isn't noticeable.

**Unlocks:** Speed item S2 and 2 parked bugs.

### 3. Stop background reviews nobody acts on?

**Your call (2026-10-19): yes.** `FRESHNESS_RADAR_MODE` moved from live to shadow on the Railway daily-brief-worker on 10-19. Tracker 139 drops drift from scheduled light passes (manual runs keep it) and skips scheduled audits while the last one is untouched.

Drift checks produced 68 findings with 1 applied. Scheduled Complete Project Audits produced 71 recommendations with 0 applied. Freshness radar raised 273 flags with 0 applied (about 11% precision).

**Recommendation:** Drop drift from the nightly pass (2 of 7 AI calls per run), skip scheduled audits while the last one is untouched, and put freshness radar in shadow mode. Less inbox noise for users, fewer moving parts.

**Unlocks:** The first half of S3.

### 4. Delete deep research and freeze the agent-run executor?

**Already done (2026-10-19):** your push `2b0f738be` deleted deep research (~7,200 lines with tests). Old runs and queued jobs cancel with a clear message. The agent-run executor stays as is.

**Size:** ~2,600 lines. Deep research has been parked since Oct 4, with no runs since July 22. The executor around it (7.7k lines total) last ran for real on Sept 1. Every agent_runs row since then is a START HERE proposal written straight to the table.

**Recommendation:** Delete deep research now. Freeze the rest of the executor until you decide on delegated runs.

**Unlocks:** ~2.6k lines now; freezing the executor stops further work there.

### 5. Delete the SMS stack?

**Your call (2026-10-19): keep, may plug in later.** The SMS crons were already gated by tracker 134. Tracker 139 fixes quiet hours (defer, not fail) and stops SMS rows piling up as pending while SMS is off: 91 are stuck since 2026-07-30.

**Size:** ~2,660 lines. About 2.7k worker lines plus consent flows on the web. Sending has been off since July 31, yet two scheduled jobs still run for it every hour and every night.

**Recommendation:** Delete it and tag the commit. Gate the two scheduled jobs off today either way.

**Unlocks:** ~2.7k lines, plus the migration for the SMS rows stuck "pending". Gate the two SMS crons off today either way.

### 6. Abandon the cycles scheduler?

**Still open (2026-10-19).** You weren't sure what it is: it's an August plan to run all recurring work (daily briefs, audits, reviews) through one scheduler users could see and configure. It never ran for users. Its hourly shadow comparison stopped on 10-19 (switch deleted, brief worker redeployed), so it costs nothing while parked.

**Size:** ~1,680 lines. 1.7k lines. It has never run in production (0 cycle runs ever), its definitions haven't changed since Aug 26, and a shadow comparison still runs every hour.

**Recommendation:** Turn the shadow off today. Delete the subsystem unless you still plan to move the daily brief onto it.

**Unlocks:** ~1.7k lines. Turn the shadow off today either way (switch section 2).

### 7. Remove chat capabilities nobody uses?

**Your call (2026-10-19): keep for now.** web_navigate and live vision stay; their deletions come off the list.

**Size:** ~1,610 lines. Over 120 days of tool history: web_navigate 0 calls, get_email_message 0, explore_project 0, calendar writes 0. Live vision (910 lines) has never been switched on.

**Recommendation:** Remove web_navigate and live vision. Keep calendar, but fix its four bugs before you show it to anyone, because a first calendar request would hit them.

**Unlocks:** Deleting `web_navigate` (~700 lines) and live vision (~910 lines + the web helpers). Tracker 130 already assumes calendar stays, as recommended.

### 8. Pause the idle Libri worker service?

**Your call (2026-10-19): don't delete.** Still open: pause the idle Railway service (reversible, no code change) or leave it running.

**Cost:** Railway cost. It runs on Railway with its worker switched off. It connects to the Libri database and probes it, but does no work.

**Recommendation:** Pause the service in Railway. No code change needed, since the Libri code is still in active development.

**Unlocks:** A Railway setting; no code.

## Appendix A — deletion candidates still open

| Status                          |  Lines | Confidence | Candidate                                                                                    |
| ------------------------------- | -----: | ---------- | -------------------------------------------------------------------------------------------- |
| DJ CALL (#1)                    | 30,000 | medium     | Project Review durable workflow (whole subsystem)                                            |
| Later (one calendar core, L)    |  3,400 | medium     | AgentRunCalendarPort class + web CalendarExecutor (after promoting the worker write adapter) |
| Tracker 129                     |  3,300 | medium     | Stale one-off worker scripts                                                                 |
| Needs your OK (paid check)      |  3,050 | high       | smart-llm streamText path + web stream overrides + tool-call assemblers                      |
| DJ CALL (#2)                    |  2,870 | medium     | Prepared-prompt system (keep at most a slim context warm)                                    |
| Needs your OK (paid check)      |  2,710 | high       | OpenRouterV2Service + web LLM helper copies                                                  |
| DJ CALL (#5)                    |  2,660 | medium     | SMS stack                                                                                    |
| DJ CALL (#4)                    |  2,600 | high       | Deep research (orchestrator, evidence, branches, bake-off scripts)                           |
| tasker/124 (parked)             |  2,200 | medium     | Lexical domain sensing + test-only domain state                                              |
| After the 11-01 soak            |  2,020 | high       | Continuation-reasoning A/B arms (replay, off_after_reads)                                    |
| Your call: keep for evals?      |  1,750 | medium     | Admin prompt-eval feature                                                                    |
| DJ CALL (#6)                    |  1,680 | medium     | Cycles subsystem (run_cycle, coordinator, daily-brief shadow, backfill)                      |
| Tracker 134                     |    990 | medium     | Project icon generation                                                                      |
| Your call: do you curl /health? |    950 | medium     | Per-turn progress health (/health JSON nobody reads)                                         |
| DJ CALL (#7)                    |    910 | medium     | Live vision on the worker (never enabled)                                                    |
| DJ CALL (#7)                    |    700 | medium     | web_navigate tool (0 uses)                                                                   |
| Call #5                         |    514 | high       | twilio SMSService wrapper                                                                    |
| Tracker 129                     |    450 | medium     | Unreachable context-loader fallback loaders                                                  |
| Tracker 129                     |    360 | medium     | Deprecated FSM/template chain in onto.ts / onto-api.ts                                       |
| Call #7                         |    270 | medium     | Web live-vision and legacy attachment helpers                                                |
| After the 11-01 soak            |    250 | high       | Off branches of flags that are ON (soak then delete)                                         |
| Tracker 125                     |    190 | high       | Legacy assistant-text path in modal/handler/adapter                                          |
| Later, alone (many files)       |    130 | medium     | Identity normalizeGatewayOpName + 27 web re-export shims                                     |
| Tracker 132                     |     70 | high       | merge_llm strategy + merge_instructions                                                      |
| Call #2 (S2)                    |     60 | high       | Session-level fastchat_context_cache                                                         |
| DJ CALL (#8)                    |      0 | medium     | Idle Libri Railway service                                                                   |

### Project Review durable workflow (whole subsystem)

**Status:** DJ CALL (#1) · ~30,000 lines · medium confidence

- **Evidence:** Read-only prod queries 2026-10-18: chat_turn_workflow_runs 0 rows (30-day retention), chat_turn_workflow_dispatches 13 rows from 09-20 to 09-30, chat_turn_runs mentioning project_review/workflow in the last 60 days = 3 (last 09-30). Worker src 8,705 lines in 18 files, worker tests ~11.3k, plus runtime specialists ~1.5k, shared-types contract 846, web ~4.5k Includes the web Workflow Lab / specialist prototype (~4.3k lines: answer comparison, specialist workbench, /workflow-lab).
- **Risk:** Product call: DJ may have a near-term plan; ON in prod behind a cohort gate. Delete web admission first, then worker
- **Files:** `apps/worker/src/workers/agentic-chat/workflow/`, `packages/agentic-chat-runtime/src/specialists/`, `apps/worker/src/workers/agentic-chat/host/stalled-recovery.ts`

### AgentRunCalendarPort class + web CalendarExecutor (after promoting the worker write adapter)

**Status:** Later (one calendar core, L) · ~3,400 lines · medium confidence

- **Evidence:** Duplicate create+mapping, 5 timezone converters, 3 token-refresh paths. The executor is reachable only from the external gateway.
- **Risk:** Medium: the MCP response shape is a contract (keep a mapper); needs a shared adapter with a project fence first. Only the web copy has multi-calendar source reads, so port that into the shared module first.
- **Files:** `packages/shared-agent-ops/src/calendar/agent-run-calendar-port.ts (class + copied token crypto)`, `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts`, `apps/web/src/lib/services/agentic-chat/tools/core/executors/base-executor.ts`, `web calendar-datetime.ts`

### Stale one-off worker scripts

**Status:** Tracker 129 · ~3,300 lines · medium confidence

- **Evidence:** Not in package scripts; decisions shipped (Apr-Sept).
- **Risk:** Low; git history keeps them. Move evals DJ will rerun into an evals/ folder instead.
- **Files:** `apps/worker/scripts/test-scheduler.ts`, `apps/worker/scripts/project-loop-timeout-generations.mjs`, `apps/worker/scripts/project-loop-provider-throughput.mjs`, `apps/worker/scripts/jev-context-eval.ts`, `apps/worker/scripts/jev-global-context-eval.ts`, `apps/worker/scripts/project-review-rollup-replay.ts`

### smart-llm streamText path + web stream overrides + tool-call assemblers

**Status:** Needs your OK (paid check) · ~3,050 lines · high confidence

- **Evidence:** Zero prod callers. The worker chat has its own streaming client. Only the paid-suite helper lite-turn-runner.ts uses it.
- **Risk:** Breaks 2 paid eval suites unless the helper is ported to the worker client.
- **Files:** `packages/smart-llm/src/smart-llm-service.ts (2203-3528)`, `packages/smart-llm/src/tool-call-assembler.ts`, `apps/web/src/lib/services/openrouter-v2-service.ts (streamText 1183-1752)`, `apps/web/src/lib/services/openrouter-v2/tool-call-assembler.ts`

### Prepared-prompt system (keep at most a slim context warm)

**Status:** DJ CALL (#2) · ~2,870 lines · medium confidence

- **Evidence:** 29 of 1,544 turn runs ever used a prepared prompt; >=21,414 rows inserted (PREPARED_PROMPT_TTL_MS=90s re-warm while open); hit saves ~160ms p50 on 20-45s turns; ~2.5k test lines and 5 migrations also go
- **Risk:** +~0.2s preparation on follow-up sends; keep the materialized-context snapshot warm (context-only warm, ideally folded into the turns ?warm=1 GET) or first sends pay a fresh context load; needs a migration to drop the table/RPCs and the RPC copy-contract branches
- **Files:** `apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-cache.ts`, `apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-consumer.server.ts`, `apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-history.ts`, `apps/web/src/lib/services/agentic-chat-v2/prepared-admission-lease.server.ts`, `apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-store.server.ts`, `apps/web/src/routes/api/agent/v2/prewarm/+server.ts`, `apps/web/src/lib/components/agent/agent-chat-prewarm.svelte.ts`, `prepared branches in worker-turn-preparation.server.ts (~250) and turns/+server.ts race retry (~40)`

### OpenRouterV2Service + web LLM helper copies

**Status:** Needs your OK (paid check) · ~2,710 lines · high confidence

- **Evidence:** agentic_chat_v2_stream last call 2026-09-04; streamText used only by tests/llm/helpers/lite-turn-runner.ts; 3 remaining callers use getJSONResponse/generateText (model/models/profile), which package SmartLLMService supports; smart-llm/types.ts has 0 importers; package exports cleanJSONResponse
- **Risk:** per-model provider max-price/order defaults and devPrimaryModel exist only in the V2 service, so check package parity for the GEMINI_31_FLASH_LITE→DEEPSEEK chain; the paid LLM test runner must move to the worker scaffold
- **Files:** `apps/web/src/lib/services/openrouter-v2-service.ts`, `apps/web/src/lib/services/openrouter-v2/client.ts`, `apps/web/src/lib/services/openrouter-v2/model-lanes.ts`, `apps/web/src/lib/services/openrouter-v2/tool-call-assembler.ts`, `apps/web/src/lib/services/smart-llm/types.ts`, `apps/web/src/lib/services/smart-llm/response-parsing.ts`

### SMS stack

**Status:** DJ CALL (#5) · ~2,660 lines · medium confidence

- **Evidence:** Globally off since 2026-07-31 (PRIVATE_SMS_SENDING_ENABLED); 0 send_sms since; hourly SMS-alert cron and midnight scheduler are pure overhead.
- **Risk:** Medium: product decision; Twilio/consent flows in web would need matching removal.
- **Files:** `apps/worker/src/workers/smsWorker.ts`, `apps/worker/src/workers/dailySmsWorker.ts`, `apps/worker/src/workers/sms/prompts.ts`, `apps/worker/src/lib/utils/smsPreferenceChecks.ts`, `apps/worker/src/workers/notification/smsAdapter.ts`, `apps/worker/src/routes/sms/scheduled.ts`, `apps/worker/src/scheduler.ts`

### Deep research (orchestrator, evidence, branches, bake-off scripts)

**Status:** DJ CALL (#4) · ~2,600 lines · high confidence

- **Evidence:** Parked 2026-10-04 after failed quality gate; worker refuses jobs unless PRIVATE_DEEP_RESEARCH_ENABLED=true; last deep_research run 2026-07-22. Also strip ~43 deep-research references in agentRunWorker.ts and 12 in agentRunStrandedSweep.ts.
- **Risk:** Low; re-enable would need git revert. Keep webResearchPort.ts (live for chat + tables) and move it out of agent-run/.
- **Files:** `apps/worker/src/workers/agent-run/deepResearchOrchestrator.ts`, `apps/worker/src/workers/agent-run/deepResearchEvidence.ts`, `apps/worker/src/config/deepResearch.ts`, `apps/worker/scripts/deep-research-bakeoff.mjs`, `apps/worker/src/scripts/bakeoffAgentRunWorker.ts`

### Lexical domain sensing + test-only domain state

**Status:** tasker/124 (parked) · ~2,200 lines · medium confidence

- **Evidence:** repo rule forbids it; domain_sensing preloads fired on 10 of ~248 user turns in 45d, all craft skills; operational playbooks already moved to structured candidates
- **Risk:** craft-skill preloads stop until skills are offered as structured candidates for the worker to pick; the admin research queue loses its feed (DJ call)
- **Files:** `apps/web/src/lib/services/agentic-chat/tools/domains/domain-sensing.ts`, `apps/web/src/lib/services/agentic-chat/tools/domains/domain-load.ts (keyword scoring)`, `domain-session-state.ts test-only ranges (~370)`, `domain-used-signals.ts:132-335`, `apps/web/src/lib/services/agentic-chat/tools/domains/domain-research-queue.ts (admin)`

### Continuation-reasoning A/B arms (replay, off_after_reads)

**Status:** After the 11-01 soak · ~2,020 lines · high confidence

- **Evidence:** The 10-18 audit decision was to keep 'default' and the variable was removed from Railway; ~440 product lines, 613 test lines, 963 script lines
- **Risk:** The audit called replay a −19% cost win; if DJ wants to keep it, delete only off_after_reads (~120 lines)
- **Files:** `apps/worker/src/workers/agentic-chat/provider/openrouter/reasoning-replay.ts`, `apps/worker/src/workers/agentic-chat/provider/openrouter-client.ts`, `apps/worker/src/workers/agentic-chat/host/config.ts`

### Admin prompt-eval feature

**Status:** Your call: keep for evals? · ~1,750 lines · medium confidence

- **Evidence:** chat_prompt_eval_runs n_tup_ins=0 since stats reset 2025-04-16
- **Risk:** DJ may want it for the agentic gate; the battery in scripts covers evals today
- **Files:** `apps/web/src/lib/services/agentic-chat-v2/prompt-evaluator.ts`, `apps/web/src/lib/services/agentic-chat-v2/prompt-eval-runner.ts`, `apps/web/src/lib/services/agentic-chat-v2/prompt-eval-scenarios.ts`, `apps/web/src/lib/services/agentic-chat-v2/prompt-eval-comparison.ts`, `apps/web/src/routes/api/admin/chat/evals/**`, `apps/web/src/lib/components/admin/chat/PromptEvalPanel.svelte`

### Cycles subsystem (run_cycle, coordinator, daily-brief shadow, backfill)

**Status:** DJ CALL (#6) · ~1,680 lines · medium confidence

- **Evidence:** 0 cycle_runs ever; 20 paused definitions untouched since 2026-08-26; shadow runs hourly. Removes BriefJobExecutionOptions branches in briefWorker.ts and cycle CTEs in reset_stalled_jobs.
- **Risk:** Medium: it was a planned scheduler migration; confirm DJ has abandoned it. Turn off PRIVATE_CYCLE_DAILY_BRIEF_SHADOW_ENABLED immediately either way.
- **Files:** `apps/worker/src/workers/cycle/`, `apps/worker/src/config/cycles.ts`, `apps/worker/src/scripts/backfillDailyBriefCycles.ts`, `apps/worker/src/scripts/reportDailyBriefCycleShadow.ts`

### Project icon generation

**Status:** Tracker 134 · ~990 lines · medium confidence

- **Evidence:** Last generation 2026-02-17 (19 manual); auto path gated off; emoji tiles replaced it. Remove queueAutoProjectIconGeneration (~110 lines) from the snapshot worker plus web route/service/UI.
- **Risk:** Medium: verify existing icon_svg is not still rendered somewhere.
- **Files:** `apps/worker/src/workers/project-icon/`, `apps/worker/src/workers/ontology/projectContextSnapshotWorker.ts`

### Per-turn progress health (/health JSON nobody reads)

**Status:** Your call: do you curl /health? · ~950 lines · medium confidence

- **Evidence:** Feeds only /health 'progress'; the Railway healthcheck uses the status code and prod-battery reads only health.release; no web or script reader
- **Risk:** DJ may curl /health by hand during incidents
- **Files:** `apps/worker/src/workers/agentic-chat/host/delivery-health.ts`, `apps/worker/src/workers/agentic-chat/stream/stream-publisher.ts`

### Live vision on the worker (never enabled)

**Status:** DJ CALL (#7) · ~910 lines · medium confidence

- **Evidence:** AGENT_CHAT_LIVE_VISION_ENABLED=false in prod; last real work in June; 455 lines plus wiring plus 340 test lines; must also drop the env var from PRODUCTION_REQUIRED_CONFIG (config.ts:490)
- **Risk:** Product call (image understanding); the web-side contract field is a separate cleanup
- **Files:** `apps/worker/src/workers/agentic-chat/tools/live-vision.ts`, `apps/worker/src/workers/agentic-chat/provider/turn-provider.ts`, `apps/worker/src/workers/agentic-chat/host/config.ts`

### web_navigate tool (0 uses)

**Status:** DJ CALL (#7) · ~700 lines · medium confidence

- **Evidence:** chat_tool_executions over 120 days: web_navigate 0 (web_search 30, web_visit 7); 620 lines plus the Jev nav client wiring in bootstrap.ts plus catalog/surface entries
- **Risk:** Removing it from the tool surface changes prompts slightly; keep web_visit
- **Files:** `apps/worker/src/workers/agentic-chat/tools/web-navigate.ts`, `packages/agentic-chat-runtime/src/catalog/definitions/utility.ts`

### twilio SMSService wrapper

**Status:** Call #5 · ~514 lines · high confidence

- **Evidence:** Constructed in smsWorker only as a null-check; its send methods are never called.
- **Risk:** Low. Gate smsWorker on twilioClient instead.
- **Files:** `packages/twilio-service/src/services/sms.service.ts`

### Unreachable context-loader fallback loaders

**Status:** Tracker 129 · ~450 lines · medium confidence

- **Evidence:** loadProjectContextData/loadLinkedEntities/loadEntityContextData (~2960-3342) and branches at ~3758-3828; scope.ts:72-81 always routes project chats to the RPC and :3740 returns first
- **Risk:** Also removes an RLS-widening fallback that is one edit away from going live
- **Files:** `packages/agentic-chat-runtime/src/context/context-loader.ts`

### Deprecated FSM/template chain in onto.ts / onto-api.ts

**Status:** Tracker 129 · ~360 lines · medium confidence

- **Evidence:** Marked @deprecated ('FSM is no longer used'); 0 external users.
- **Risk:** Low. Keep the entity Zod schemas (the scan's 'unused' flag on them is a false positive).
- **Files:** `packages/shared-agent-ops/src/ontology/onto.ts`, `packages/shared-agent-ops/src/ontology/onto-api.ts`

### Web live-vision and legacy attachment helpers

**Status:** Call #7 · ~270 lines · medium confidence

- **Evidence:** test-only exports per scanner; worker owns live vision
- **Risk:** low
- **Files:** `apps/web/src/lib/services/agentic-chat-v2/attachments.ts (normalizeChatAttachmentRefs, shouldUseLiveVisionForTurn, buildLiveVisionContentParts)`, `apps/web/src/lib/services/agentic-chat-v2/stream-attachments.ts (createLiveVisionSignedImages)`

### Off branches of flags that are ON (soak then delete)

**Status:** After the 11-01 soak · ~250 lines · high confidence

- **Evidence:** LIVE_TEXT_PREVIEW and DIRECT_WRITE_RECEIPT_TEXT on since 10-17; hedging, broad, incidents and drain default-on since 10-18; context-finder off/shadow/chips modes and Jev shadow unused; Railway vars WORKER_ENABLED and AGENTIC_CHAT_WORKER_LIVE_VISION_ENABLED are read by no code
- **Risk:** These are kill switches; keep about 2 weeks; consider keeping PROVIDER_INCIDENTS (privacy switch)
- **Files:** `apps/worker/src/workers/agentic-chat/host/config.ts`, `apps/worker/src/workers/agentic-chat/host/bootstrap.ts`

### Legacy assistant-text path in modal/handler/adapter

**Status:** Tracker 125 · ~190 lines · high confidence

- **Evidence:** adapter never forwards text events (:259, :302-318, :650); worker never emits template\_\*; worker always sends completed/model
- **Risk:** low; confirm no worker path emits text through the handler
- **Files:** `apps/web/src/lib/components/agent/AgentChatModal.svelte (bufferAssistantText, flushAssistantText, addOrUpdateAssistantMessage :2996-3109, markAssistantCompletion :3132-3155)`, `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts (text/text_delta/template_* cases, degraded finalization)`, `apps/web/src/lib/components/agent/agent-chat-worker-ui-adapter.ts:737-742`

### Identity normalizeGatewayOpName + 27 web re-export shims

**Status:** Later, alone (many files) · ~130 lines · medium confidence

- **Evidence:** normalizeGatewayOpName is just trim(); the shims are leftovers from the Wave 0 extraction.
- **Risk:** Low; mechanical import rewrites.
- **Files:** `packages/shared-agent-ops/src/ops/gateway-op-aliases.ts`, `apps/web/src/** 'Re-export shim' files`

### merge_llm strategy + merge_instructions

**Status:** Tracker 132 · ~70 lines · high confidence

- **Evidence:** The merge op has 0 references and the worker rejects merge_llm; the gateway treats it as append.
- **Risk:** External MCP callers sending merge_llm would get a validation error; map it to append for one release.
- **Files:** `packages/agentic-chat-runtime/src/catalog/definitions/ontology-write.ts`, `packages/shared-agent-ops/src/gateway/op-execution-gateway.config.ts`, `packages/shared-agent-ops/src/gateway/op-execution-gateway.core.ts`, `apps/worker/src/workers/agentic-chat/mutations/argument-normalizers.ts`

### Session-level fastchat_context_cache

**Status:** Call #2 (S2) · ~60 lines · high confidence

- **Evidence:** the agentic_chat_context_snapshots table already caches per user+key with the same invalidation token; the session cache is only used when that token matches, and the snapshot read runs in parallel anyway; ~40KB per session row bloats every select('\*'), artifact and session event, and bumps updated_at
- **Risk:** low; optionally strip the key from existing rows
- **Files:** `apps/web/src/routes/api/agent/v2/prewarm/+server.ts:206-223,500-506`, `apps/web/src/lib/services/agentic-chat-v2/turn-preparation.ts:147`, `apps/web/src/lib/services/agentic-chat-v2/materialized-context-cache.server.ts:75-99`

### Idle Libri Railway service

**Status:** DJ CALL (#8) · ~0 lines · medium confidence

- **Evidence:** LIBRI_WORKER_ENABLED=false: process still requires LIBRI_DATABASE_URL, probes it on an interval, serves /health, does no work. Code is actively developed (last commit 10-04), so pause the service, not the code.
- **Risk:** Low (Railway setting only)
- **Files:** `apps/worker/src/libri-worker.ts`

**Done in round 1:** Gateway meta-tool payload compaction; assistant-text-sanitization.ts (regex scratchpad detector on model prose); Dead runtime exports and leftovers from the old web loop; Chat compression + chat title generation; Dead session-service write helpers; Admin lite shadow/preview tooling; Web webvisit parser; agent-orchestrator package + phase-a/open-brief experiment suites; Dead shared-types job validators and guards; Admin Question Tree experiment; Onboarding analysis pipeline; Braindump processing (process_onto_braindump); v2 project manager brief generator; Unused SupabaseQueue cancel methods; Old ontology context loader (web); Two unused graph renderers (G6 and SvelteFlow) plus the @antv/g6 dependency; Dashboard greeting generator; In-memory rate limiter and its LRU cache; Small orphaned web files and a stray nested app folder.

## Appendix B — all simplifications

S is under a day, M is a few days, L is a week or more. Some are already folded into packets.

- **tool-payload-compaction: delete the gateway compactor, then one registry per tool family {compactor, budget}** (M) — Removes the area's highest-complexity function (cc96, ~500 lines). One budget source per tool removes the 'inner guard tighter than outer budget' class that caused the calendar data-loss bug, and the drift between resolvePayloadBudget's if-chain and the compactor dispatch Files: `packages/agentic-chat-runtime/src/loop/tool-payload-compaction.ts`
- **Split turn-executor.execute into claim/start/providerLoop/complete/fail and delete the legacy fixture provider.stream path** (L) — cc75 down to ~5 functions under 20; production always uses prepare()+continueWithToolResults, so the 4 branches that only fixtures exercise (and their 50 test fixtures) go away, leaving one dispatch per step type. Read-save joins become auditable in one place Files: `apps/worker/src/workers/agentic-chat/turn/turn-executor.ts`, `apps/worker/tests/agenticChatTurnExecutor.test.ts`
- **One builder for terminal finalize input that picks the RPC variant and keeps invariants by construction** (M) — Today turn-finalizer.finalize (cc80) builds inputs that execution-control validates afterward with about 12 cross-field rules; the 'failed + null timing → stuck turn' bug comes from that split. A single builder makes invalid combinations impossible and lets the timing fallback be one function Files: `apps/worker/src/workers/agentic-chat/turn/turn-finalizer.ts`, `apps/worker/src/workers/agentic-chat/turn/execution-control.ts`
- **calendar-write-port: explicit error classifier plus all_day plus duration-preserving moves** (M) — Fixes 4 of the 15 bugs at once (uncertain misclassification, start-only move, all-day, reconnect ok:false); target errors and Google 4xx become knownFailure with actionable text; the catch-all runProvider goes away Files: `apps/worker/src/workers/agentic-chat/tools/calendar-write-port.ts`
- **execution-adapter per-turn state into one TurnScope; JevToolSelector onto the shared JevClient** (S) — Five copy-pasted Map+TTL sweeps become one, and completeTurnSecurityState can't forget a map. The tool selector's hand-rolled HTTP, validation and usage logging (~150 lines) go away, and its 403 calls/30d gain the Jev hedge (rescues the 2-3 s lane that 26% of Jev calls hit) Files: `apps/worker/src/workers/agentic-chat/tools/execution-adapter.ts`, `apps/worker/src/workers/agentic-chat/provider/jev-tool-selector.ts`
- **One LLM client on the web: package SmartLLMService** (S) — -2.7k prod / -2.2k test lines; one routing/ZDR/usage-logging path instead of two Files: `apps/web/src/lib/services/openrouter-v2-service.ts`, `apps/web/src/lib/server/document-proposal.service.ts`, `apps/web/src/lib/services/next-step-generation.service.ts`, `apps/web/src/routes/api/onto/tasks/generate-title/+server.ts`
- **Split AgentChatModal into 5 modules (conversation, worker wiring, session loader with a staleness token, side channels, lifecycle)** (L) — 3.5k→~1.3k lines; one home each for the reopen/realtime, reload-race and leak bugs; receive half testable without mounting Files: `apps/web/src/lib/components/agent/AgentChatModal.svelte`
- **Single admission history path (no prepared prompts) + one history loader shared by any warm path** (M) — prepareWorkerAdmission cc65→~30; removes lineage hashing, race-retry and byte-copy-claim logic; ends two divergent history queries (different tie-break/limits/client) Files: `apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.server.ts`, `apps/web/src/lib/services/agentic-chat-v2/session-service.ts`, `apps/web/src/routes/api/agent/v2/turns/+server.ts`
- **Make build-lite-prompt section-order driven and drop retired scaffold flags** (M) — ~3.8k-line file → ~250-line assembler plus focused section modules; -330 dead lines; evals test the real prompt Files: `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`, `apps/web/src/lib/services/agentic-chat-v2/scaffold-variant.ts`
- **Make commit approval rebase instead of whole-row drift compare** (M) — Fixes the 40% START HERE approval failure. Compare only the fields the op writes (drop children and props other than body_markdown). Stage START HERE as section-level edits re-resolved at commit, or supersede pending reviews on any START HERE write. Pass downstreamIdempotencyKey=change-set:{run}:{change} per change and check telemetry insert errors. Files: `packages/shared-agent-ops/src/gateway/change-set.ts`, `apps/worker/src/workers/chat/checkpoint/checkpointCapture.ts`, `apps/worker/src/workers/chat/checkpoint/supabaseCheckpointPorts.ts`
- **One non-streaming LLM client** (M) — Takes the LLM clients from 3 to 2 (smart-llm + worker streaming client). Roughly -6k source and -3k test LOC. All spend lands in llm_usage_logs, and the getJSONResponse retry loop gets simple enough to fix. Files: `packages/smart-llm/src/smart-llm-service.ts`, `apps/web/src/lib/services/openrouter-v2-service.ts`, `apps/web/src/lib/services/smart-llm/response-parsing.ts`
- **One calendar core** (L) — Build one all-day-aware timing module with keep-duration-on-move, which fixes the move-shrinks-meeting and timed/all-day bugs. Promote the worker write adapter to shared-agent-ops with a project fence and rebuild the Agent Run and external ports on it. Run project sync jobs in the worker to drop the worker-to-Vercel webhook hop. About -3.9k LOC. Files: `packages/shared-agent-ops/src/calendar/*`, `apps/worker/src/workers/agentic-chat/tools/calendar-write-port.ts`, `packages/agentic-chat-runtime/src/tools/calendar-reads.ts`, `apps/web/.../calendar-executor.ts`
- **Split verifyProjectSuggestionIntegrity and drop the lexical alignment check** (M) — Split into loadVerificationContext plus 5 per-tool verifiers returning {decoded, structuralPart} or a diagnostic (cc186 down to about 30 each). Replace the model-text check with a structured echo the model controls (expected_title per op, exact compare) or remove it; this unblocks the nesting suggestions now quarantined. Files: `packages/shared-agent-ops/src/proposal-context/verify-operations.ts`
- **Split op-execution-gateway.core.ts by entity** (S) — Pure move: documents (~1,590 lines) to .documents.ts, createProject to .projects.ts, executeGatewayOp/registry/stage snapshot (~470) to .external.ts. The hottest file (22 commits in 90 days) shrinks to about 570 lines. Files: `packages/shared-agent-ops/src/gateway/op-execution-gateway.core.ts`
- **Fence project-loop and audit runs by queue row, not by 'queued' status** (S) — Fixes lost runs after every deploy/timeout and the 1 h 'already_running' lockout; lets the 'running' branch of the reclaim cron shrink Files: `apps/worker/src/workers/project-loop/projectLoopWorker.ts`, `apps/worker/src/workers/project-loop/enqueue.ts`
- **One SQL RPC for project-loop enqueue shared by web and worker** (M) — Removes a documented web/worker duplicate, closes the check-then-insert race (8 bogus failed runs/30d), fewer round trips Files: `apps/worker/src/workers/project-loop/enqueue.ts`
- **Let the queue own row lifecycle; remove legacy adapter status writes** (M) — briefWorker writes processing/completed/failed itself and then the queue completes/fails again; one owner removes a class of token/status races and ~100 lines Files: `apps/worker/src/workers/brief/briefWorker.ts`, `apps/worker/src/workers/shared/queueUtils.ts`, `apps/worker/src/workers/shared/jobAdapter.ts`
- **Split projectLoopWorker.ts by mode and drop dead brief code** (M) — 3.8k-line file -> lightPass / completeAudit / reviewSignal modules; plus ~590 dead lines removed from generators.ts Files: `apps/worker/src/workers/project-loop/projectLoopWorker.ts`, `apps/worker/src/workers/project-loop/generators.ts`
- **Collapse cancel paths in processNotification** (S) — Five near-identical 'mark delivery cancelled + attempts+1' blocks -> one helper; cc71 -> ~30 Files: `apps/worker/src/workers/notification/notificationWorker.ts`

Already done in round 1: the change-set approval rebase (scoped compare plus START HERE section rebase), dropping the lexical alignment check, deleting the gateway meta-tool compactor, and the calendar-write-port error classifier and duration-preserving moves.

## Appendix C — all step-skips

- **Send more write batches down the direct lane instead of the reviewer** — `apps/worker/src/workers/agentic-chat/provider/turn-state.ts:613 (takeWithheldMutationBatch / assessDirectWriteBatch)`. Saves: mutation_review = 238 passes/30d, p50 4.3 s, p90 8.3 s, 1,325 s = 21.6% of all model time; ~4.3 s per reviewed write turn, ~14 s per avoided bounce (ledger: 17 revisions vs 21 approvals). Risk: Safety: the reviewer catches wrong targets and unrequested writes. Widen only for structured-safe classes (creates inside the focused project, single-entity updates of IDs read this turn)
- **Close reviewed write turns from the ledger receipt instead of another acting pass** — `apps/worker/src/workers/agentic-chat/provider/turn-state.ts:1149 (directWriteReceiptText refuses when reviewedBatchExecuted)`. Saves: One continuation pass (acting p50 2.7 s) on reviewed write turns where the completion receipt shows every contract outcome satisfied. Risk: Receipt-style closing text instead of model prose; multi-stage requests must still continue (gate on an empty remaining-outcomes list)
- **Avoid the per-search research review** — `apps/worker/src/workers/agentic-chat/tools/execution-adapter.ts:714`. Saves: research_review = 30 passes/30d, p50 2.0 s, one before every web_search. Risk: Egress security: the review checks the actual query for private content. Safer variant: have Jev's opening classification return a structured research topic and allow queries within it, which also replaces the regex in web-egress-policy
- **Fold the 'finalizing' lifecycle event into the finalize RPC** — `apps/worker/src/workers/agentic-chat/turn/turn-executor.ts:752`. Saves: One sequential persist RPC (~50-150 ms) between the last text and 'done' on every turn. Risk: Low; the terminal RPC already writes several events atomically
- **Leave Jev tool selection and the context finder as they are** — `apps/worker/src/workers/agentic-chat/provider/turn-provider.ts:412-428`. Saves: Only ~0.3 s: tool_selection p50 277 ms / p90 402, context_finder_chat p50 252 / p90 370, and they already run in parallel. Risk: Skipping loses tool narrowing, write commission and playbooks; not worth it
- **Run the transport-decision lookup in parallel with preparation** — `apps/web/src/routes/api/agent/v2/turns/+server.ts:120 → worker-turn-inline-admission.server.ts:39`. Saves: one serial DB round trip (~30-80ms) on every send; for a fresh clientTurnId it always misses. Risk: low; await it before building the RPC args, or let the admission RPC adopt an existing decision
- **Start session/access/attachment reads before the prepared-lease RPC resolves (or drop leases)** — `apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.server.ts:362`. Saves: one serial round trip on every miss (~73%+ of follow-ups, 100% of first sends with a key). Risk: wasted reads on hits; moot if prepared prompts are deleted
- **Return the created session row from the admission RPC** — `apps/web/src/routes/api/agent/v2/turns/+server.ts:301 (loadAdmittedWorkerSession)`. Saves: one round trip on every first send, which is the new-user first impression. Risk: migration to the RPC return shape
- **Stop shipping the full context payload to the browser** — `routes/api/agent/v2/prewarm/+server.ts:545 → agent-chat-prewarm.svelte.ts:448`. Saves: ~40KB+ JSON per prewarm plus a deep $state proxy; the browser only derives a readiness boolean from it and never sends it back. Risk: none; return {key, created_at}
- **Stop the 90s prewarm re-fire and the serial prewarm chain** — `agent-chat-prewarm.svelte.ts:392 (TTL wake) and prewarm/+server.ts:419-531 (2 access RPCs → session select → resolveSession re-selects the same row → token/snapshot → merge RPC → 4 history queries → email check → insert)`. Saves: ~12 DB round trips + a ~100KB insert per open chat every 90s; fixes the updated_at bump. Risk: if prepared prompts stay, hit rate drops slightly
- **Fold the context warm into the turns warmup GET** — `agent-chat-session.ts:428 warmAgentChatTurnRoute + prewarm split function`. Saves: one Vercel cold start and one request on chat open; the send hits an instance that just warmed the snapshot. Risk: turns function memory/duration config
- **Trim the session snapshot frozen into each turn artifact** — `apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.server.ts:1117-1129`. Saves: stops copying full agent_metadata (incl. ~40KB context cache, domain state) into every input artifact and the worker's session realtime event. Risk: low; the client reads only title, context_type, entity_id and focus from it
- **Skip the model-prose alignment step in Project Review verification: IDs are already resolved server-side, and the step blocked 9 of 11 suggestions while 1 passed.**
- **Skip the worker-to-Vercel webhook hop for calendar sync jobs (calendarSyncWorker POSTs to /api/webhooks/calendar-sync-job); call processProjectEventSyncJob in the worker.**
- **Skip building agent-orchestrator (tsup + .d.ts) on every Vercel deploy via build:deps by deleting the package.**
- **Skip offering merge_llm to models: one strategy fewer, and no rejected-tool turns.**
- **Skip the hourly SMS-alert materialized-view refresh while SMS sending is off by design (0 send_sms jobs in 30 days).**
- **Skip further investment in Tables (2 tables) and Gmail read (3 credentials) until usage justifies roughly 8k lines; no new features, bug fixes only.**
- **Drop the drift lens from the nightly light pass** — `projectLoopWorker.ts:3310 + driftEvidence.ts + driftFixes.ts`. Saves: 2 of 7 LLM calls per run (project_loop_drift 85 + drift_finder 108 calls/30d), the slowest critical path (~42-55 s), ~1.1k lines; drift produced 68 findings with 1 applied. Risk: Lose rare real drift catches; could keep it for manual runs only
- **Skip scheduled Complete Project Audits while the last audit's recommendations are untouched** — `auditEnqueue.ts / scheduler.ts:377`. Saves: Audit synthesis runs and inbox noise: 71 recommendations in 30d, 0 applied, 51 pending. Risk: Low; audits resume once the user engages
- **Do embedding deletes inline in the trigger instead of queue jobs** — `SQL enqueue_onto_entity_embedding (DELETE / deleted_at branch)`. Saves: ~1,850 of 4,239 embed_onto_entity jobs/30d were delete jobs that removed nothing. Risk: Low; one indexed DELETE inside the write transaction
- **Pause freshness radar live scans (mode off or shadow)** — `FRESHNESS_RADAR_MODE on daily-brief-worker`. Saves: 65 jobs + 114 Jev calls/30d and 8.5k lines of live behavior; 273 flags, 0 applied, 79 auto-labeled not stale vs 10 stale. Risk: DJ's active experiment; backtest can continue offline
- **Narrow Railway watchPatterns from packages/** to the worker's real dependencies\*\* — `railway.toml / apps/worker/railway.toml`. Saves: Fewer worker redeploys, so fewer mid-job aborts (which feed the lost-run bug). Risk: A missed dependency would skip a needed redeploy; derive the list from package.json workspace deps
- **Gate dormant crons** — `scheduler.ts:332, 338, 408, 421, 459`. Saves: Hourly SMS materialized-view refresh, midnight SMS scan, 5-min operatives scan of an empty table, hourly cycles shadow, 2-min stranded sweep with no runs. Risk: None while the features are off
- **Make brief audio on-demand** — `briefWorker.ts:537 enqueueBriefAudioIfEnabled`. Saves: Kokoro TTS CPU on the brief worker for every admin brief (30/30d) whether or not it is played. Risk: First play waits for synthesis
- **Keep prod test-harness fixtures out of background triggers** — `pick_project_emoji / embedding triggers vs agentic e2e scenarios`. Saves: 196 emoji jobs skipped as 'project deleted' on 10-17/18 plus matching embedding delete churn. Risk: Needs a fixture marker the triggers can check

## Appendix D — pipelines (prod, 30 days, read 2026-10-18)

### Queue jobs that never fired

- `run_cycle` — **delete** (~1,547 lines). Only enqueued by cycle coordinator (scheduler.ts:414, PRIVATE_CYCLE_COORDINATOR_ENABLED=false) + cycle SQL RPCs. Prod: 20 cycles, 0 cycle_runs ever, cycles untouched since 2026-08-26. Shadow comparison still runs hourly (scheduler.ts:421). Deleting also removes manageQueueRecord/cycleRunId/emitFailureEffects branches from briefWorker.ts and cycle CTEs in reset_stalled_jobs.
- `onboarding_analysis` — **delete** (~576 lines). Enqueue path intact (web onboarding.service.ts:178/319 -> onboarding-analysis.service.ts -> worker routes/queue/enqueue.ts:23). Zero jobs because 0 of 3 new users completed onboarding (2 created projects and chatted without ever hitting completion). Output table project_questions last row 2026-06-16 despite 4 onboardings since; V3 path passes userContext {}; nothing in UI reads project_questions (/api/projects/[id]/questions/random has no caller).
- `schedule_daily_sms` — **delete** (~488 lines). scheduler.ts:332 midnight cron returns early unless PRIVATE_SMS_SENDING_ENABLED=true (off since 2026-07-31 by design); only other producer is admin trigger route. Product call: delete with the rest of SMS (~2.7k lines incl. dailySmsWorker 488, smsPreferenceChecks 389, smsAdapter 824, routes/sms 141, sms/prompts 169).
- `send_sms` — **delete** (~523 lines). Produced only by dailySmsWorker.ts:443 and smsWorker retries; last job 2026-07-31; notificationWorker.ts:715 cancels SMS deliveries anyway. Hourly checkSMSAlerts (scheduler.ts:338) still refreshes the SMS metrics materialized view for nothing.
- `process_onto_braindump` — **delete** (~314 lines). Producers: web POST /api/onto/braindumps and /api/onto/braindumps/[id]/process, plus worker /queue/braindump/process. No UI calls the create/process endpoints (only history view/delete/chat-session). onto_braindumps: 7 rows ever, last 2026-04-17. Keep read routes for the 7 legacy rows.
- `transcribe_voice_note` — **keep** (~228 lines). web api/voice-notes/+server.ts:413 queues only when duration > MAX_SYNC_TRANSCRIBE_SECONDS; voice notes are live (14 in 30d, all short enough for sync). Cheap fallback for long recordings.
- `agent_run` — **keep** (~7,729 lines). 0 agent_run queue jobs; last real executed run (tool_calls>0) 2026-09-01. All 24 agent_runs rows in 45d are START HERE proposals inserted directly by supabaseCheckpointPorts.ts:535 (trigger='chat', status proposal_ready), not executions. Still reachable: delegate_task chat tool (delegate-task-adapter.ts:144), POST /api/agent-runs, operatives (agent_operatives = 0 rows), inbox resolve-from-chat. Delete deep research now (parked 2026-10-04, last run 07-22); the rest of the executor is a product decision (freeze or delete).
- `generate_project_icon` — **delete** (~990 lines). Producers: projectContextSnapshotWorker.ts:732 auto-trigger (gated by PROJECT_ICON_GENERATION_ENABLED, off) and web icon/generations route. onto_project_icon_generations: 19 manual, last 2026-02-17. Emoji replaced it (pick_project_emoji live). Check that the 19 existing icon_svg values are no longer rendered before removing UI.
- `user_data_export` — **keep** (~1,115 lines). Settings -> Your data; enqueued by SQL RPC from migration 20260924190300. Compliance/user-rights path; zero traffic is expected.
- `admin_question_tree` — **delete** (~1,645 lines). Admin experiment; enqueued by SQL from migrations 20260801040100/040300. question_tree_runs: 3 rows ever, last 2026-08-02. Also ~4 tables + admin web pages.

### AI calls that stopped

| Operation                           | Calls before | Last call  | Note                                                                                                                 |
| ----------------------------------- | -----------: | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `agentic_chat_v2_stream`            |        3,920 | 2026-09-04 | openrouter-v2-service.ts streaming path. The worker took over chat turns on 09-04.                                   |
| `agent_state_reconciliation`        |          816 | 2026-09-04 | No code emits this anymore. Already removed.                                                                         |
| `agent_run_deep`                    |          101 | 2026-07-22 | Deep research in agent-run (~2.6k lines). Parked behind a flag on 10-04.                                             |
| `agent_run_web_search`              |           56 | 2026-07-22 | Agent-run research. The web search port it used is still live for chat and tables.                                   |
| `agentic_chat_content_merge`        |           55 | 2026-08-03 | No producer. The merge_llm strategy is still offered to models but rejected (worker) or silently appended (gateway). |
| `agent_run_deep_research_plan`      |           12 | 2026-07-22 | Deep research, same as above.                                                                                        |
| `agent_run_deep_research_synthesis` |           11 | 2026-07-22 | Deep research, same as above.                                                                                        |
| `task_title_generation`             |            2 | 2026-07-17 | The generate-title route still exists and uses the web OpenRouter client. One call since July.                       |
| `document_proposal_generate`        |            1 | 2026-09-09 | document-proposal.service.ts still exists and uses the web OpenRouter client.                                        |

### Web chat code: what is still live (before round 1 deletions)

| Status     |  Lines | Code                                                                                                                                                                                                                                                                     | Evidence                                                                                                                                                                                                                            |
| ---------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| legacy     |  2,256 | `apps/web/src/lib/services/openrouter-v2-service.ts + openrouter-v2/{client,model-lanes,tool-call-assembler}.ts`                                                                                                                                                         | streamText emitted agentic_chat_v2_stream (5,853 calls, last 2026-09-04); remaining callers document-proposal (last 09-09), next-step (6 calls, last 10-12), task generate-title (last 07-17) use only getJSONResponse/generateText |
| legacy     |    987 | `apps/web/src/lib/services/chat-compression-service.ts + routes/api/chat/{compress,generate-title}/+server.ts`                                                                                                                                                           | no caller in apps/packages/scripts; chat_conversation_compression last 2026-02-06, chat_title_generation last 2025-10-29; chat_compressions n_tup_ins=0                                                                             |
| legacy     |    742 | `apps/web/src/lib/services/agentic-chat/tools/webvisit/{parser,types}.ts`                                                                                                                                                                                                | unreachable from any entry (test-only); worker implements web_visit in apps/worker/.../tools/web-navigate.ts                                                                                                                        |
| legacy     |    453 | `apps/web/src/lib/services/smart-llm/{types,response-parsing}.ts`                                                                                                                                                                                                        | types.ts has zero importers; response-parsing is a near-copy of packages/smart-llm/src/response-parsing.ts (exported from package index); used by openrouter-v2-service + 2 role-profile routes (cleanJSONResponse)                 |
| legacy     |    270 | `apps/web/src/lib/services/agentic-chat-v2/{attachments,stream-attachments}.ts live-vision helpers`                                                                                                                                                                      | normalizeChatAttachmentRefs, buildLiveVisionContentParts, shouldUseLiveVisionForTurn, createLiveVisionSignedImages are test-only; worker does live vision                                                                           |
| admin-eval |  4,300 | `Workflow Lab: agentic-chat-v2/{answer-comparison.server,answer-comparison-core,specialist-recommendations.server,specialist-workbench*.server}.ts + routes/api/agent/specialists/** + AnswerComparisonLab.svelte + SpecialistWorkbench.svelte + routes/workflow-lab/**` | cohort-gated by AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS; chat_turn_specialist_snapshots=0 rows, chat_turn_workflow_runs=0                                                                                                          |
| admin-eval |  1,659 | `apps/web/src/lib/services/agentic-chat-v2/prompt-eval-{runner,scenarios,comparison}.ts + prompt-evaluator.ts`                                                                                                                                                           | only /admin/chat/sessions + /api/admin/chat/evals/\*; chat_prompt_eval_runs n_tup_ins=0 since stats reset 2025-04                                                                                                                   |
| admin-eval |  1,267 | `apps/web/src/lib/services/agentic-chat-lite/{shadow,preview}/** + routes/api/admin/chat/{lite-shadow-comparison,lite-prompt-preview} + agentic-chat-v2/{prompt-cost-breakdown,tool-surface-size-report}.ts`                                                             | no UI or script calls either endpoint; they build the retired web-lane prompt                                                                                                                                                       |
| admin-eval |    855 | `apps/web/src/lib/services/agentic-chat-v2/worker-turn-workflow-admission.server.ts + routes/api/agent/v2/turns/workflow-review-admission.ts`                                                                                                                            | explicit project-review turns, flag+cohort gated; chat_turn_workflow_dispatches = 13 rows, last 2026-09-30; ordinary turns return null with no DB call                                                                              |
| admin-eval |    509 | `apps/web/src/lib/services/agentic-chat/tools/domains/domain-research-queue.ts`                                                                                                                                                                                          | only /admin/chat/domains + research-queue routes                                                                                                                                                                                    |
| mcp-api    |  1,735 | `apps/web/src/lib/services/agentic-chat/tools/core/executors/{calendar-executor,base-executor,types}.ts`                                                                                                                                                                 | only importer: lib/server/agent-call/external-tool-gateway.ts:55 createCalendarPort; worker uses packages calendar ports                                                                                                            |
| mcp-api    |    637 | `apps/web/src/lib/services/agentic-chat/tools/registry/{tool-search,capability-catalog}.ts`                                                                                                                                                                              | reached only from agent-call/MCP routes (tool_search discovery)                                                                                                                                                                     |
| live       | 31,000 | `apps/web/src/lib/components/agent/** (AgentChatModal, MessageList, stream-controller, sse-handler, ui-adapter, session, presenter, cards)`                                                                                                                              | browser chat UI; ~190 lines of assistant-text buffering in modal/handler unreachable (adapter never forwards text events)                                                                                                           |
| live       |  5,600 | `apps/web/src/lib/services/agentic-chat-v2/worker-*.ts (preparation, admission, gateway, adoption, realtime-*, transport-client, queue-wake)`                                                                                                                            | reached from turns route + browser modal; worker_realtime is the only execution_mode in chat_turn_runs                                                                                                                              |
| live       |  4,932 | `apps/web/src/lib/services/agentic-chat-lite/prompt/**`                                                                                                                                                                                                                  | buildLitePromptEnvelope/applyActiveDomainSignalsOverlay called by worker-turn-preparation + prewarm; ~330 lines only reachable with retired web-lane scaffold flags                                                                 |
| live       |  2,856 | `apps/web/src/lib/services/agentic-chat/tools/domains/{domain-sensing,domain-load,catalog,skill-gate-preload,operational-skill-intent}.ts`                                                                                                                               | turn-preparation.ts:126 senseDomains(message) -> worker-turn-preparation:1412 preload; regex-based; domain_sensing source on 10/~248 user turns in 45d                                                                              |
| live       |  2,583 | `apps/web/src/lib/services/agentic-chat-v2/prepared-{prompt-cache,prompt-consumer,prompt-history,admission-lease,prompt-store}*.ts + routes/api/agent/v2/prewarm + components/agent/agent-chat-prewarm.svelte.ts`                                                        | live but marginal: 29 of 1,544 chat_turn_runs ever carried preparedPromptId; >=21,414 prepared-prompt inserts; hit p50 prep 247ms vs miss 407-455ms                                                                                 |
| live       |  1,840 | `apps/web/src/lib/services/agentic-chat/tools/skills/** (registry, skill-load, *.skill.ts, markdown-skill)`                                                                                                                                                              | admission skill preload + MCP skill_load; skill-authoring-validation.ts (773) is test-only lint                                                                                                                                     |
| live       |  1,332 | `apps/web/src/lib/services/agentic-chat-v2/session-service.ts`                                                                                                                                                                                                           | resolveSession/loadRecentMessages/projection used by prewarm+admission; persistMessage/persistMessageAttachments/updateSessionContext/attachVoiceNoteGroup (~330 lines) have zero prod callers (legacy in-process stream)           |
| live       |    499 | `apps/web/src/routes/api/agent/chat-attachments/+server.ts`                                                                                                                                                                                                              | image upload path used by agent-chat-attachments.svelte.ts                                                                                                                                                                          |
| live       |    336 | `apps/web/src/routes/api/agent/v2/turns/+server.ts`                                                                                                                                                                                                                      | POST = the one admission request per turn (transport decision -> prepare -> create_agentic_chat_turn_with_job RPC); GET = active-turn lookup + warmup                                                                               |
| live       |    226 | `apps/web/src/lib/services/agentic-chat/tools/core/executors/{web-access-adapter,calendar-datetime}.ts`                                                                                                                                                                  | used by /api/onto/\*/[id] routes and /api/users/timezone, not chat                                                                                                                                                                  |
| live       |    222 | `apps/web/src/routes/api/agent/v2/turns/[id]/{cancel,reconcile}/+server.ts, turns/[id]/+server.ts`                                                                                                                                                                       | Stop + durable reconcile used by worker-realtime-coordinator and stream controller                                                                                                                                                  |

## Appendix E — reviewer notes on the riskiest files

| File                                                                                 | Use | Verdict  | What it does                                                                                                                                                                 | Why                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------ | --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/agentic-chat-runtime/src/context/context-loader.ts`                        | A   | split    | Builds the chat prompt's context (project/global/entity RPC plus START HERE, steward, family, tables extras); used by web admission and the worker workflow loader           | About 450 lines of fallback loaders (loadProjectContextData/loadLinkedEntities/loadEntityContextData, ~2960-3342) can't be reached because scope.ts always routes to the RPC; degraded context is cached like good context        |
| `packages/agentic-chat-runtime/src/loop/tool-payload-compaction.ts`                  | A   | split    | Fits each tool result into the model's char budget, per tool family                                                                                                          | compactGatewayMetaPayload (cc96) plus skill helpers (~500 lines, 326-831) only serve 13 gateway tools that no longer exist on the worker; budget names are scattered if-chains, which caused the calendar guard bug               |
| `apps/worker/src/workers/agentic-chat/stream/stream-publisher.ts`                    | A   | split    | Per-turn FIFO that persists semantic/text events, broadcasts over Realtime, and applies backpressure and retries                                                             | A 2.4k-line hand-rolled scheduler that mixes persistence, live delivery and pressure; load-bearing and already hardened by an adversarial review in wave 3                                                                        |
| `apps/worker/src/workers/agentic-chat/workflow/workflow-runner.ts`                   | D   | delete   | Project Review: planner, then 2 specialists, then editor, with fenced commits and per-dispatch cost gates                                                                    | chat_turn_workflow_runs has 0 rows; 3 review turns in 60 days, last 09-30; no live use, so freeze or delete unless DJ has a plan                                                                                                  |
| `packages/agentic-chat-runtime/src/loop/turn-contract.ts`                            | A   | simplify | Parses and normalizes the reviewer's request contract and checks fulfilment against the write ledger                                                                         | normalizeOutcome cc74; the implicit-contract path keeps failed writes as unmeetable outcomes; about 64 lines of dead or test-only functions                                                                                       |
| `packages/agentic-chat-runtime/src/tools/ontology-reads.ts`                          | A   | keep     | Shared list, search, detail and section read tools over projects, tasks and docs                                                                                             | Highest tool usage (read_document_section 75/30d); fix the missing archived filter on project details and the lowercase ' or ' regex                                                                                              |
| `apps/worker/src/workers/agentic-chat/turn/execution-control.ts`                     | A   | keep     | RPC client for the turn lifecycle (claim/begin/recover/finalize) with strict receipt validation                                                                              | Strict parsing is the point; its finalize invariants should be produced by one builder shared with turn-finalizer, not checked after the fact                                                                                     |
| `apps/worker/src/workers/agentic-chat/turn/turn-executor.ts`                         | A   | split    | The fenced turn kernel: claim, lease, prelude, provider loop, tool batches, finalize or recover                                                                              | execute() is a ~670-line, cc75 function; the legacy fixture provider.stream path and the !continueWithToolResults branches are test-only (50 fixture uses in the 8.7k-line test file)                                             |
| `apps/worker/src/workers/agentic-chat/workflow/raw-turn-preparation.ts`              | D   | delete   | Prepares raw Project Review turns: context checkpoint, specialist and policy gates                                                                                           | Only serves the workflow, which has had no production runs; includes the gate for a context-finder path whose ON branch can never execute                                                                                         |
| `apps/worker/src/workers/agentic-chat/provider/openrouter-client.ts`                 | A   | simplify | OpenRouter SSE client: route fallback, watchdogs, hedge trigger, runaway-reasoning cutoff, usage/attempt telemetry                                                           | stream() cc120; the attempt-ended receipt payload is hand-built 4+ times; about 440 lines of the losing continuation-reasoning A/B are still wired in                                                                             |
| `apps/worker/src/workers/agentic-chat/provider/turn-state.ts`                        | A   | split    | Per-turn provider state machine: write routing, SHA-bound review, read evidence, choosing the next lane                                                                      | completeToolRound cc53 both folds the round into evidence and picks the next lane; splitting out a pure lane decision makes it table-testable                                                                                     |
| `apps/worker/src/workers/agentic-chat/tools/execution-adapter.ts`                    | A   | simplify | Dispatches read tools: egress provenance and security, web/mailbox reviews, per-turn caches                                                                                  | Five parallel per-turn Maps, each with a copy-pasted TTL sweep (security, timezone, access, calendar, email); merge them into one TurnScope object                                                                                |
| `packages/agentic-chat-runtime/src/tools/calendar-reads.ts`                          | B   | keep     | Merges Google and BuildOS events for the list/detail calendar tools                                                                                                          | Low use (5 list calls/30d); has_more is computed from capped fetches                                                                                                                                                              |
| `packages/agentic-chat-runtime/src/context-finder/workspace.ts`                      | B   | keep     | Jev two-hop ranking of workspace projects plus briefs for the global-chat context finder                                                                                     | 55 calls/30d, p50 274 ms; no bugs found                                                                                                                                                                                           |
| `apps/worker/src/workers/agentic-chat/tools/calendar-write-port.ts`                  | C   | simplify | Worker adapter for the 4 calendar write tools (BuildOS row plus Google sync)                                                                                                 | 0 calendar writes in the 120-day ledger, yet it holds 4 bugs; needs an explicit error classifier, all_day support and duration-preserving moves, or freeze it                                                                     |
| `apps/worker/src/workers/agentic-chat/turn/turn-finalizer.ts`                        | A   | simplify | Terminal lifecycle: recover, partial completion after durable writes, finalize with timing fallback, queue reconcile                                                         | finalize cc80 builds inputs whose invariants execution-control checks only afterward; a failed turn with no timing draft can't finalize                                                                                           |
| `apps/worker/src/workers/agentic-chat/provider/provider-pass.ts`                     | A   | keep     | Atomic buffered provider pass: one retry, slow-stream hedge, output-budget recovery, live preview                                                                            | Traced the hedge and race logic and found it sound; complex but justified                                                                                                                                                         |
| `apps/worker/src/workers/agentic-chat/provider/turn-provider.ts`                     | A   | simplify | Acting-pass coordinator: Jev selection, context finder, validation/surface/mimicry/empty-reply repairs, review lanes                                                         | streamActingPass cc64 chains 6 repair recursions; an abandoned opening pass is never closed                                                                                                                                       |
| `apps/worker/src/workers/agentic-chat/host/stalled-recovery.ts`                      | B   | simplify | Dead-turn sweeper: batch recovery RPC plus converging workflow handoffs from durable truth                                                                                   | The handoff/converge half exists only for the dormant workflow; its RPCs have no deadline                                                                                                                                         |
| `packages/agentic-chat-runtime/src/loop/write-ledger.ts`                             | A   | simplify | Turns write executions into ledger entries for receipts, contracts and disclosures                                                                                           | buildEntryFromExecution cc43 falls back to project_id as the target of a failed create; the formatter at 618-722 is unused                                                                                                        |
| `apps/web/src/lib/components/agent/AgentChatModal.svelte`                            | A   | split    | Chat UI shell: composer, thinking blocks, worker turn wiring, session load/restore, cards, lifecycle                                                                         | 3,546 lines, 46 commits/90d; 4 of the bugs live here; split into conversation/worker-wiring/session-loader/side-channels/lifecycle modules (~1,300 left)                                                                          |
| `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`            | A   | split    | Builds the worker system prompt (context, project intelligence, rules) at admission and prewarm                                                                              | 3,786 lines; priority-inversion + UTC-midnight date bugs; ~330 lines reachable only with retired web-lane flags                                                                                                                   |
| `apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.server.ts`        | A   | simplify | Server turn prep: access, session, history, context, prompt overlay, skill preload, input artifact + RPC args                                                                | prepareWorkerAdmission cc65 is mostly two history paths (prepared vs window); dropping prepared prompts halves it                                                                                                                 |
| `apps/web/src/lib/components/agent/agent-chat-tool-presenter.ts`                     | B   | simplify | Turns tool calls/results into readable activity lines, entity links and mutation records                                                                                     | 2,401 lines with 67 type escapes; split per tool family                                                                                                                                                                           |
| `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts`           | A   | simplify | Client send/queue/stop lifecycle and admission POST with optimistic rollback                                                                                                 | sendMessage cc88: split into validate/optimistic/admit/rollback; overwrites the worker's specific error copy                                                                                                                      |
| `apps/web/src/lib/services/agentic-chat-v2/session-service.ts`                       | B   | simplify | Session resolve + model-history projection; plus persist/attach helpers from the dead stream                                                                                 | ~330 dead lines; its own history loader duplicates loadOwnedWorkerHistory                                                                                                                                                         |
| `apps/web/src/lib/components/agent/agent-chat-session.ts`                            | A   | keep     | Client session load/restore, prewarm + active-turn fetchers, row→UI message mapping                                                                                          | live restore path; prewarm helper shrinks if prepared prompts go                                                                                                                                                                  |
| `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts`   | C   | merge    | Google + onto calendar read/write port for the MCP/agent-API gateway only                                                                                                    | listCalendarEvents cc98 duplicates packages AgentRunCalendarPort/calendar-reads; only the web copy has multi-calendar source reads                                                                                                |
| `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-inbox.ts`                 | A   | keep     | Orders/dedupes worker realtime events and reconciled receipts on the client                                                                                                  | core delivery; re-buffering an unparseable event can wedge a turn                                                                                                                                                                 |
| `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-coordinator.ts`           | A   | keep     | Schedules per-turn reconcile fetches, backoff and watchdog                                                                                                                   | core; already defers reconciles while live stream is healthy                                                                                                                                                                      |
| `apps/web/src/lib/components/agent/agent-chat-worker-ui-adapter.ts`                  | A   | keep     | Maps worker projections/receipts to UI events and live text preview                                                                                                          | should skip+report unknown events instead of throwing (version-skew wedge)                                                                                                                                                        |
| `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts`                        | A   | simplify | Applies stream events (tools, phases, session, errors) to UI state                                                                                                           | named for the dead SSE route; text/text*delta/template*\* cases and degraded-completion branches unreachable                                                                                                                      |
| `apps/web/src/lib/components/agent/agent-chat-timeline.ts`                           | B   | keep     | Builds activity timeline items from turn/tool rows for restore and history view                                                                                              | live via modal and /api/chat/sessions/[id]                                                                                                                                                                                        |
| `apps/web/src/lib/components/agent/AgentMessageList.svelte`                          | A   | keep     | Renders messages with streamed reveal, markdown blocks, scroll pinning                                                                                                       | every row reads livePreview so all rows recompute per preview tick (cached, minor)                                                                                                                                                |
| `apps/web/src/lib/services/agentic-chat-v2/answer-comparison.server.ts`              | D   | delete   | Workflow Lab answer A/B comparison store and loader                                                                                                                          | cohort prototype; backing tables empty in prod                                                                                                                                                                                    |
| `apps/web/src/routes/api/agent/v2/prewarm/+server.ts`                                | C   | simplify | Pre-loads context, writes session context cache, builds prepared prompts                                                                                                     | ~12 DB round trips + insert every 90s per open chat for 29 lifetime hits; bumps session updated_at; keep only a context warm                                                                                                      |
| `apps/web/src/lib/services/agentic-chat-v2/worker-turn-workflow-admission.server.ts` | C   | keep     | Admission for explicit project-review workflow turns                                                                                                                         | flag+cohort gated, 13 dispatches; delete with Workflow Lab if review is not shipping                                                                                                                                              |
| `apps/web/src/lib/services/agentic-chat/tools/domains/domain-sensing.ts`             | D   | delete   | Keyword/regex scoring of the user message to pick domains, outcome cards and skill gates                                                                                     | violates the no-regex-language rule and still steers live preloads (10/~248 turns); replace with structured candidates                                                                                                            |
| `apps/web/src/lib/services/agentic-chat-v2/specialist-recommendations.server.ts`     | D   | delete   | Published-specialist recommendation for Workflow Lab review turns                                                                                                            | prototype; 0 specialist snapshots in prod                                                                                                                                                                                         |
| `apps/web/src/lib/services/agentic-chat-v2/answer-comparison-core.ts`                | D   | delete   | Pure scoring/vote logic for answer comparisons                                                                                                                               | only serves answer-comparison.server.ts                                                                                                                                                                                           |
| `packages/smart-llm/src/smart-llm-service.ts`                                        | B   | simplify | Shared non-streaming LLM client for JSON, text and transcription, with failover, spend reservations and usage logging (~35 prod callers)                                     | About 42% of the file is the streamText path, which nothing in prod calls. getJSONResponse (cc157) re-calls models that already failed, never fails over on an empty choices array, and reports only the last attempt to onUsage. |
| `packages/shared-types/src/agentic-chat-worker-contract.ts`                          | A   | keep     | Turn admission, lease, recovery and stream contract shared by web (25 files), worker (89) and runtime                                                                        | Load-bearing. The only trim worth considering is the input-artifact v2 read branch and 3 functions only tests call (~180 LOC).                                                                                                    |
| `packages/shared-agent-ops/src/gateway/op-execution-gateway.core.ts`                 | A   | split    | Handler map, document create/update/move/tree reads, createProject, external executeGatewayOp, and the stage before-snapshot                                                 | 2,838 lines. Documents write (~800) + document reads/tree (~786) belong in a documents module, the external executor (~470) in its own file, and createProject in projects.ts. merge_llm silently behaves like append.            |
| `packages/shared-agent-ops/src/proposal-context/verify-operations.ts`                | B   | split    | Fail-closed integrity gate and display decoder for Project Review and cleanup suggestions                                                                                    | verifyProjectSuggestionIntegrity is 1,028 lines (cc186) in 5 per-tool branches. Its lexical model-text check accounts for 9 of 11 quarantines and violates the no-regex rule.                                                     |
| `packages/shared-agent-ops/src/calendar/onto-event-sync.service.ts`                  | A   | simplify | onto_events writes, Google create/update/delete, mapping repair, project sync jobs                                                                                           | This is the canonical calendar core. Fold its 4 create branches into one. Skipped jobs leave events 'pending' forever (69 live events stuck).                                                                                     |
| `packages/shared-agent-ops/src/inbox-index.ts`                                       | A   | keep     | Indexes agent runs, suggestions, audits and freshness into inbox_items (15 importers)                                                                                        | Core to the AI inbox (468 items, written today). upsertInboxItem fails open when its pre-read errors, which can un-snooze an item (minor).                                                                                        |
| `packages/shared-agent-ops/src/tables/table-schema.ts`                               | C   | keep     | Table column schema, cell coercion, date/number parsing, column change planner                                                                                               | Solid code but tiny usage: 2 tables in 1 project. Freeze investment until usage grows.                                                                                                                                            |
| `packages/shared-agent-ops/src/email/gmail-read-gateway.ts`                          | C   | keep     | Read-only Gmail search/get/window scan for chat, email suggestions and web routes                                                                                            | 3 Gmail credentials in prod (DJ-only pilot, CASA cost deferred). Code is careful; the payoff waits on Gmail verification.                                                                                                         |
| `packages/shared-agent-ops/src/calendar/agent-run-calendar-port.ts`                  | C   | split    | Agent Run CalendarPort class plus the legacy single-grant Google client/reader                                                                                               | The class duplicates shared create+mapping, token crypto and project-calendar creation. It never updates or deletes Google copies of personal events. Keep the legacy client (~550 lines) and delete the class (~1,600).          |
| `packages/shared-agent-ops/src/email/gmail-read-oauth.service.ts`                    | C   | keep     | Gmail read OAuth connect, refresh, revoke and audit                                                                                                                          | Same 3-credential audience as the gateway.                                                                                                                                                                                        |
| `packages/shared-agent-ops/src/gateway/op-execution-gateway.tables.ts`               | C   | simplify | Agent table tools: get/query/create/update table and row edits with retry                                                                                                    | updateTable (cc76) saves the schema without a revision guard and in non-atomic batches above 1,000 row ops. Latent, since only 2 tables exist.                                                                                    |
| `packages/shared-agent-ops/src/gateway/op-execution-gateway.tasks.ts`                | A   | keep     | Agent task list/get/create/update through atomic RPCs                                                                                                                        | Main write path. The non-atomic update path read-modify-writes the whole props object with no updated_at guard.                                                                                                                   |
| `packages/shared-agent-ops/src/ontology/doc-structure.service.ts`                    | A   | keep     | Project document tree (doc_structure JSONB) with a versioned compare-and-swap RPC                                                                                            | CAS is correct. Callers swallow version conflicts with no retry; 139 of 949 live docs are unlinked (6 of 128 created in the last 30 days), mostly from non-gateway creators.                                                      |
| `packages/shared-agent-ops/src/ontology/document-edits.ts`                           | A   | keep     | Exact-text and section edit resolution for document updates                                                                                                                  | Shared by gateway, reviewer preview, revert and Project Review; fails closed.                                                                                                                                                     |
| `packages/shared-agent-ops/src/ontology/start-here.ts`                               | A   | keep     | START HERE section parsing, managed regions, checkpoint rewrite planner                                                                                                      | 30 importers. Ties into the stale-approval bug through change-set drift.                                                                                                                                                          |
| `packages/shared-agent-ops/src/task-entities/task-entities.ts`                       | B   | keep     | Validates and grounds LLM-extracted task entities; structured URL/email/phone detection                                                                                      | Live (1,065 entity rows). Its regexes are structured-format only, so it complies with the rule.                                                                                                                                   |
| `packages/shared-agent-ops/src/tables/table-query.ts`                                | C   | keep     | Filter, sort and aggregate table rows for agent reads                                                                                                                        | Same tiny tables audience. Sums silently skip cells left as text after a failed retype.                                                                                                                                           |
| `packages/smart-llm/src/jev-client.ts`                                               | A   | keep     | Fail-closed hedged decisions client (context finder, email relevance, loops, freshness)                                                                                      | Live. A losing hedge request may still be billed but isn't logged (possible).                                                                                                                                                     |
| `packages/shared-agent-ops/src/calendar/google-calendar-read.service.ts`             | A   | keep     | Multi-source Google list, freeBusy and slots with pagination and time budgets                                                                                                | Canonical calendar read. Add a per-source truncation flag (has_more bug).                                                                                                                                                         |
| `packages/shared-agent-ops/src/consolidation/consolidation.ts`                       | B   | keep     | Parses and validates doc+task consolidation ops, questions and answers                                                                                                       | Live (7 runs, last 10-17); validates model output structurally.                                                                                                                                                                   |
| `packages/shared-agent-ops/src/gateway/change-set.ts`                                | A   | simplify | Commits staged agent-run change sets: drift check, crash re-entry, stalled-commit recovery                                                                                   | Holds the worst user-facing bug in this area: 16 of 40 START HERE approvals failed as stale.                                                                                                                                      |
| `apps/worker/src/workers/project-loop/projectLoopWorker.ts`                          | B   | split    | Runs the light project review pass (4 LLM detectors -> roll-up judgment -> cleanup card), Complete Project Audits, and debounced review signals                              | 3.8k lines, 3 unrelated modes in one file; claim logic loses interrupted runs; 15 applied of 293 findings in 30d                                                                                                                  |
| `apps/worker/src/workers/agent-run/agentRunWorker.ts`                                | D   | simplify | Executes queued Agent Runs: tool loop, web research, deep research fan-out, proposals, cost ledger                                                                           | No real execution since 2026-09-01; strip deep research (~43 references) now, then decide freeze vs delete; processAgentRunJob cc181                                                                                              |
| `apps/worker/scripts/freshness-radar-backtest.ts`                                    | C   | keep     | Read-only offline backtest/replay of freshness radar policy on prod data                                                                                                     | Only useful while radar precision is being tuned; delete together with radar if radar is paused for good                                                                                                                          |
| `apps/worker/scripts/jev-context-eval.ts`                                            | D   | delete   | One-off eval harness for Jev context-finder policy (Sept)                                                                                                                    | Decision shipped; main() cc94; git keeps it                                                                                                                                                                                       |
| `apps/worker/src/scheduler.ts`                                                       | A   | simplify | Cron hub: hourly brief scheduling + backfill, project loops/audits/reclaim, operatives, cycles shadow, cost reconciliation, checkpoint sweep, stranded sweep, retention, SMS | Half the crons serve dormant systems (SMS x2, cycles, operatives on empty table, stranded sweep with no runs); move brief scheduling to its own module                                                                            |
| `apps/worker/src/lib/supabaseQueue.ts`                                               | A   | keep     | Queue spine: atomic claim, per-slot refill, heartbeat, worker timeout + abort, retry/fail, stalled recovery, bounded drain                                                   | Sound core; delete unused cancelJob/cancelJobsAtomic/cancelJobWithReason; timeout releases slot even when processor ignores signal                                                                                                |
| `apps/worker/src/workers/project-loop/generators.ts`                                 | B   | simplify | Prompts + sanitizers for doc_org, doc_outdated, drift, task_conflict detectors and cleanup synthesis                                                                         | ~590 lines of v2 project-manager brief (lines ~1059-1588, 1712-1766, sanitizeManagerBrief cc51) are prod-dead since v3 cleanup card; drift lens yields 1 applied of 68                                                            |
| `apps/worker/src/workers/freshness-radar/context.ts`                                 | C   | keep     | Stage 1 of a radar scan: info window, exclusions, candidates, prefilter, date mentions, facts                                                                                | Shared with backtest; fate tied to radar decision (1 user, 0 applied, ~11% precision)                                                                                                                                             |
| `apps/worker/src/workers/freshness-radar/signalJob.ts`                               | C   | keep     | freshness_radar_scan job: claims debounced chat signal, runs up to 3 project scans, auto-apply, inbox bundle, chat card                                                      | Live for DJ cohort only; 273 flags / 0 applied in 30d; recommend mode=off/shadow until precision improves                                                                                                                         |
| `apps/worker/src/workers/consolidation/survey.ts`                                    | B   | keep     | Pure half of doc/task consolidation: group-finding and per-group decision prompts, plan + question cards                                                                     | User-initiated, low volume, coherent; complexity is in parsers (taskActionsToOps cc42)                                                                                                                                            |
| `apps/worker/src/workers/chat/checkpoint/supabaseCheckpointPorts.ts`                 | B   | simplify | DB ports for chat checkpoint capture: thinking log, START HERE writes via op gateway, review proposals                                                                       | Writes START HERE review proposals as fake agent_runs rows, coupling a live feature to the dormant agent-run subsystem                                                                                                            |
| `apps/worker/src/workers/agent-run/deepResearchEvidence.ts`                          | F   | delete   | Normalizes/validates deep research evidence packets                                                                                                                          | Deep research parked behind PRIVATE_DEEP_RESEARCH_ENABLED after failed quality gate; last run 2026-07-22                                                                                                                          |
| `apps/worker/scripts/jev-global-context-eval.ts`                                     | D   | delete   | One-off eval for global-chat Jev context structuring                                                                                                                         | Decision shipped 2026-09-29; not wired to any package script                                                                                                                                                                      |
| `apps/worker/src/workers/brief/ontologyBriefGenerator.ts`                            | A   | simplify | Builds the daily brief: loads ontology data, per-project LLM summary (69% skip LLM as low-signal), main markdown                                                             | generateMainBriefMarkdown cc68 / formatOntologyProjectBrief cc46 are formatting monoliths; briefs are opened (29/30 emails)                                                                                                       |
| `apps/worker/src/workers/project-loop/enqueue.ts`                                    | B   | merge    | Worker-side duplicate of web project-loop enqueue + end-of-day candidate selection + stale-run reclaim                                                                       | Header admits it duplicates web project-loops.service.ts; check-then-insert race; move into one SQL RPC                                                                                                                           |
| `apps/worker/src/workers/agent-run/webResearchPort.ts`                               | B   | keep     | Paid web search/visit port with charge accounting                                                                                                                            | Live via agentic chat (composition-root.ts:18, execution-adapter.ts:67) and tables AI fill; move out of agent-run/ so that folder can be deleted                                                                                  |
| `apps/worker/src/workers/consolidation/consolidationJob.ts`                          | B   | keep     | consolidation_run orchestration: survey, replan from owner answers, merge drafts, ledger resume                                                                              | User-triggered, resumable; 10 runs/30d                                                                                                                                                                                            |
| `apps/worker/src/workers/notification/notificationWorker.ts`                         | A   | simplify | Delivers notification_deliveries per channel with prefs, quiet hours, stale-brief suppression, attempt bookkeeping                                                           | processNotification cc71 has 5 near-identical mark-cancelled blocks; SMS branch dead                                                                                                                                              |
| `apps/worker/scripts/project-review-rollup-replay.ts`                                | D   | delete   | Offline replay of the review roll-up against real projects (tasker 112)                                                                                                      | One-off validation, decision shipped 2026-09-29                                                                                                                                                                                   |
| `apps/worker/src/workers/freshness-radar/combine.ts`                                 | C   | keep     | Pure policy: turns Jev probabilities into decisions, auto-apply allowlist, caps                                                                                              | Well-factored pure code; fate tied to radar decision                                                                                                                                                                              |

## Appendix F — round 1 (done)

**Fixed, with regression tests** (committed in `9735aa719`, pushed):

- **Calendar list compactor fits rows to 11.6k chars, then its final guard trims to 5.6k after pagination was computed** — DONE (final guard uses the web budget; regression test fails on old code)
- **Deterministic calendar errors (target-resolution errors, Google 400/403/404) are classified outcome_uncertain** — DONE (target-resolution and Google 4xx except 401/408 are known_failed; 5xx stays uncertain)
- **Embedded chat never restarts worker realtime after close/reopen** — DONE (reopen restarts the worker channel; start() is idempotent). Not browser-tested.
- **Task priority sorted backwards (1=Critical)** — DONE (prompt sort fixed + migration 20261018190000 applied to prod and recorded)
- **Background session snapshot reload can overwrite a newer turn or chat** — DONE (send, reset and close make in-flight reloads stale; fallback waits on any busy turn). Not browser-tested.
- **START HERE review approvals fail as stale 40% of the time** — DONE (compare only fields the change writes; section-level 3-way rebase for START HERE content)
- **Lexical model-text check quarantines valid Project Review suggestions; regex-rule violation** — DONE (check removed; cards show server-resolved titles; option kept but ignored)
- **Moving an event by start time alone shrinks or breaks it (all calendar paths)** — DONE (worker ontology + Google paths, shared agent-run port, web ontology path keep duration). Web legacy CalendarService provider path left as is (UI shares it).

**Log:**

- **2026-10-18 round 1 finished. Committed by DJ in `9735aa719` (15:10) and pushed.**
- All 8 high bugs fixed with regression tests. Migration `20261018190000_chat_context_task_priority_order.sql` was rehearsed, applied to production and recorded.
- Deletions: 230 files deleted. That is ~21k lines of web/worker/runtime code and tests, ~11k lines of agent-orchestrator code, and ~27k lines of its stored eval data. Another ~6k lines came out of edited files. 149 npm packages left the install (@antv/g6, @xyflow/svelte).
- Also removed: `buildOrganizeCommissionRepairInstruction` and its helpers. Its last caller went in commit `ac1043268`, and the runtime export-surface test failed on it.
- Validation (all free, local): the 4 packages build and typecheck. Worker and web typecheck, including test files: web svelte-check shows 0 errors in 9,637 files.
- Validation, tests: package suites shared-types 76, smart-llm 253, runtime 873, shared-agent-ops 942. Focused worker tests 194, focused web tests 980. Strict doc-health passes.
- Not run: no paid or live tests; the two chat-modal fixes were not tried in a browser.
- Docs: 4 docs whose cited files are gone got the standard point-in-time banner. CLAUDE.md system map no longer lists agent-orchestrator. The orchestration README records the restore commit `e16b39a3a`.
- Lockfile: removing the orchestrator also changed which test-tooling copy (vitest/@types/node, sourcemap-codec) the lockfile records. No app dependency changed version.
- `pnpm run verify` fix (after DJ ran it): the SQL contract inventory flagged 2 files. Deleted `supabase/tests/20260802010100_question_tree_normalize_trim.test.sql`; its only runner was the question-tree postgres test removed in round 1. Renamed another session's rehearsal check `20261018180000_agentic_chat_terminal_reconcile_hint.test.sql` to `.check.sql`, the repo convention for `db:rehearse --check` files.
- The same run also hit an older failure: `apps/worker/tests/agentOpExecution.test.ts` predated the merged-project refusal lookup added in `184fdb859` (10-17), so it failed at HEAD too. Updated its expected call list. Full `pnpm run verify` passes afterward: static checks, build, and all 17 test tasks (web 6,090 tests, worker 3,907).
- Follow-ups for round 2 are in the "Round 2 follow-ups" section below.

## Round 2 log

- 2026-10-18: re-checked all 44 open bugs against `9735aa719` (4 read-only reviewers; nothing fixed elsewhere, 4 changed). Read switch values from Railway and names from Vercel.
- 2026-10-18: DJ chose Codex for the no-decision work. Wrote trackers 125-136 and deleted the 8 unread variables (Railway 3 entries, Vercel 6) plus the `turbo.json` line.
- 2026-10-18: Codex finished 125–127 (DJ committed them in `ac26e2011`, not pushed). Claude's light check:
    - 125 and 127 passed. 125 still needs its browser check, which needs one paid send.
    - 126 is reopened for items 7–8. Item 5 now lets inline `<think>` reasoning leak into chat; fix it by stripping only a block at the start of the answer. Item 4 left 3 web test fixtures stale (tests only).
    - Tracker 128 (done, uncommitted) broke the shutdown-drain test mock. Claude fixed the mock.
    - Claude also fixed 5 type-only errors in other agents' test files.
- 2026-10-18 evening: Claude light-checked 126 (items 7–8) and 128–135 with 4 read-only reviewers, a full verify and migration rehearsals.
    - Passed: 126, 128, 129, 131, 133, 134, 135.
    - Reopened: 130 (items 8–12) and 132 (items 9–11).
    - Item 9 blocks deploys: the runtime's type build runs out of memory, and Railway caps the heap at 2 GB.
    - New tracker 137 collects the small follow-ups.
    - All 4 new migrations rehearse clean. Claude fixed the account-deletion seed so it passes both before and after the Question Tree drop.
- 2026-10-18 late: Claude checked the follow-ups to 130, 132 and 137; all pass.
    - Full verify is green: static checks, `turbo build` (the runtime builds under 2 GB again), typecheck, lint, and all 17 test tasks (about 12,700 tests).
    - Claude updated one worker test for the new receipt-text default.
    - Trackers 125–135 and 137 are done; 136 waits until 2026-11-01.
    - Still to do: commit, push and deploy, then apply 4 migrations (the Question Tree drop goes last, after the deploy).
- 2026-10-18 ~21:30: DJ pushed `1499e4d54`. Web and both workers deployed and are healthy (live turns completing).
    - Claude dry-ran each migration in production (rollback), then applied and recorded `215551`, `215559`, `233421` and `212708` (Question Tree drop, last). Function hashes match the rehearsals.
    - The Question Tree data (3 runs, 229 nodes, 997 events, 385 proposals) was backed up first to `~/.buildos-backups/question_tree_2026-10-18/`.
    - Found and fixed an outage. Code shipped in `ac26e2011` (~16:45) called `get_chat_session_restore_v1`, which didn't exist in production, so reopening a saved chat returned an error for about 5 hours (2 users active in that window).
    - Claude reviewed, rehearsed (with role probe and its own check) and applied `20261018193727_chat_session_restore_snapshot`, then confirmed the restore works on a real chat.
- 2026-10-19: DJ answered the 8 calls.
    - Keep: #1, #2, #5 and #7.
    - Yes: #3. The radar was moved to shadow the same day.
    - Already done: #4. Deep research was deleted in `2b0f738be`.
    - Still open: #6 (cycles) and #8 (pause Libri).
    - Follow-through is in `tasker/139-follow-through-on-djs-calls.md`.
- 2026-10-18 night: prod battery on `1499e4d54` (DeepSeek V4.1 Flash, $0.25 measured): 48/52.
    - Both misses are judge strictness on acceptable answers. Case 10 rep 2 queried 09:00–17:00, where Google's overlap read already includes all-day events. Case 11 rep 2 was correct but said "specify" rather than "ask".
    - Faster than the 10-18 morning runs: p50 7.0 s vs 10 s, p90 16.7 s vs 21–23 s.
    - This is the "before" number for tracker 138.

## Method and how to rerun

The scanner lives in `scripts/code-triage/` (dependency-free; uses the TypeScript compiler from `apps/web/node_modules`).

```bash
node scripts/code-triage/scan.cjs . /tmp/scan.json      # ~8 s, ~360 MB: complexity, import graph, reachability, churn
node scripts/code-triage/score.cjs /tmp/scan.json /tmp/scored.json   # grades + rankings to stdout
node scripts/code-triage/clones.cjs . /tmp/scan.json /tmp/clones.json # copy-paste pairs
```

Scope: apps/worker, every package under packages/, and the web app's chat layer (services/agentic-chat\*, components/agent, routes/api/agent). That's 1,048 source files and about 344,000 lines. Tests, generated database types and fixtures are excluded from grading but counted when deciding whether something is tested.

- Complexity: each file is parsed with the TypeScript compiler, and each function gets a cyclomatic complexity score: one plus every if, loop, case, catch, ternary and && / || / ?? branch. The file's grade is its worst function (A ≤10, B ≤20, C ≤35, D ≤60, F >60).
- Usefulness: the scanner builds the full import graph across apps and packages, including Svelte lazy imports and import.meta.glob, then walks it from every live entry point (web routes and hooks, the worker, chat worker and libri worker mains, the MCP server). Files nothing live can reach get F. Files reachable only from scripts get D. The rest are graded by how many live files import them.
- Bug surface (0–100, percentile): branching beyond 10 per function, 90-day git churn, timers/races/abort controllers, catch blocks that don't rethrow, type escapes (any, double casts, non-null assertions, ts-ignore), database tables and settings touched, and how many files depend on it. Files no test imports get a 25% penalty.
- Hotspot: complexity percentile multiplied by churn percentile, after Tornhill.
- Commit messages weren't used. 233 of the 706 commits in the last 90 days are titled "updates", so they carry no signal about which changes were fixes.
- Production facts came from read-only queries on 2026-10-18: queue_jobs (30 days; completed jobs older than about 30 days are purged), llm_usage_logs, agent_runs, users, onto_braindumps, plus Railway variable values for on/off settings only. No secrets were printed.
- Four reviewers then read the riskiest files in each area by hand and confirmed or rejected each finding. Bugs are rated confirmed (traced in code), likely or possible. Deletions are rated by evidence strength.

Known limits: dynamic imports with computed paths and files spawned by path (e.g. the brief audio child process) can look unreachable, and those were checked by hand before anything was listed for deletion. Cyclomatic complexity counts paths, not difficulty, so a long flat switch scores high but is easy to read. Line counts for deletions are estimates and some overlap.

Production numbers came from read-only SQL on 2026-10-18 (`queue_jobs` 30 days, `llm_usage_logs`, `agent_runs`, `users`, `onto_braindumps`, `chat_turn_workflow_dispatches`, `chat_tool_executions`) and from Railway on/off values only.
