<!-- tasker/109-agentic-chat-session-spend.md -->

# Tasker 109 — Agentic Chat spend per session and per turn

> **Audit 2026-10-04 — SHIPPED, VERIFY LIVE.** Every built fix is pushed + deployed:
> - the minute clock moved out of the cached prefix (e2ffeac9c);
> - the web-search review retry, the no-op-revision rule and legacy calendar reads (ef6840078; reads verified live 09-25 23:36);
> - legacy calendar writes and the battery cost line (9e2327f92).
>
> **Left:** the ~$0.01 calendar create/delete live check, since chat writes for every non-allowlisted user depend on it. New users' first turns took 78–102 s and haven't been measured since. Still to do: measure finder `on` (with 108 item 4a), fix 4 (tool-free synthesis; paid battery), and per-state task counts (P3). **Priority:** P1. **Recommend:** keep (absorb 108's leftovers).

**Status:** Audit done (2026-09-25). Report:
[`docs/research/agentic-chat-session-spend-2026-09-25.md`](../docs/research/agentic-chat-session-spend-2026-09-25.md).
Fixes 1 and 6 built (uncommitted), 2 parked, 5 closed as a non-issue, 3 and 4 open. ·
**Opened:** 2026-09-25 · **Owner ask (DJ):** "I'm more concerned about the agentic chat session
flow. Where's the spend going there? … cost per session … how many tool calls … recent sessions."

**Related:** 108 (platform spend and speed fixes; item 4 there, cutting acting passes, is the
main chat lever and may be reordered by what this finds); 101/102/105 (latency of write turns).

## Question

For recent real chat sessions, where does the money and time go inside a session? Measure it from
our own telemetry, not the OpenRouter dashboard.

## Scope

- **Sessions** from 2026-09-24 on (after the switch to `deepseek/deepseek-v4.1-flash`). Where
  useful, compare with a slice from before 09-24.
- **Per session:**
    - turns, total cost and latency;
    - the cost split by pass role:
        - acting passes;
        - `mutation_review` (luna);
        - Jev (tool selection, context finder);
        - project/workspace finders.
- **Per turn:**
    - acting passes;
    - tool calls (by tool, reads vs writes, and failures/retries);
    - prompt tokens per pass and cached share;
    - output tokens;
    - elapsed time.
- **Prompt growth.** How the prompt grows across passes and turns: history, tool results, system
  prefix, and the context-finder block. Find what is re-sent uncached.
- **Outliers.** The most expensive sessions and turns, and why: loops, big tool payloads,
  reviewer retries, or long histories.
- **Deliverable.** Ranked fixes (value ÷ effort) that cut cost per turn or passes per turn.

## Sources (read-only, free)

- Prod tables `chat_turn_runs`, `chat_turn_events` and `llm_usage_logs`, plus the session and
  message tables, via `supabase db query --linked` (read-only queries only).
- The admin session view `/admin/chat/sessions?chat_session_id=<id>`, for spot checks of
  individual sessions.
- `apps/worker/scripts/context-finder-audit.ts`, for the injected context block on project turns.

## Deliverable

- The research doc `docs/research/agentic-chat-session-spend-2026-09-25.md`, with tables and
  per-session breakdowns.
- A summary of the findings and ranked fixes in this tracker.

## Findings (2026-09-25; full report in the research doc)

**Sample.** 22 turns in 11 sessions since 09-24 00:00 UTC, $0.208 in total. DJ ran 18 turns; a
new external user ran 4. With n=22, the per-100-turn figures are directional.

**A typical turn**

- Cost: median $0.0087, p90 $0.0154.
- Time: 19 s, p90 31 s.
- Work: about 3 acting passes, 3 Jev calls, 3–4 tool calls.

**Where the money goes**

- By role:
    - opening pass: 36%;
    - tool-continuation passes: 29%;
    - Jev: 17.5% (tool selection 7%, context finder 6%, email scan 4%);
    - reviewers: 8.4%;
    - synthesis passes: 4.8%;
    - repair passes: 4%.
- By token type (acting model): uncached input 63%, output 35%, cached input 2%. Uncached input
  costs about 50× cached.
- Reasoning tokens are 57% of acting output and 15.5% of all chat spend.

**Where the time goes.** Waiting on the model is 88% of wall time. Tools and Jev aren't the
latency problem.

**Jev tool selection pays for itself.** It costs $0.00066 per turn and saves about $0.003 per
opening pass by cutting tool schemas from 53–68K characters to about 19K.

## Ranked fixes (work items)

1. **Take the minute clock out of the cached prefix.**
    - The opening pass hits the cache only 12.5% of the time, versus 74–85% for continuation
      passes.
    - Cause: a minute-precision "Current time" line and change counters sit about 16K characters
      into the system prompt, so everything after them is billed at the full rate every turn.
    - Fix: move them to the trailing runtime message (`build-lite-prompt.ts` about lines
      965–980).
    - Free, with no behavior change. Saves about $0.05–0.09 per 100 turns and speeds up the
      first pass.
2. **Cap reasoning on acting passes** (`open-route.ts` about line 252), keyed off Jev's tool count.
    - Five passes spent over 1.5K reasoning tokens each, at 9–18 s apiece.
    - Example: "Boom! Just sent it." burned 6.3K reasoning tokens and 18 s (82% of that turn's
      cost).
    - Needs a paid prod-battery run.
3. **Measure context-finder injection** (108 item 4a) against this baseline, and cache
   outline/section reads per session.
    - 14 passes did nothing but read, one step at a time, records that the finder had already
      selected (18 of the 20 read).
    - Projected savings: about 1.2 s per turn, and 3–6 s on document turns.
4. **Keep the tools in synthesis and repair passes, with `toolChoice: 'none'`**
   (`request-builders.ts:155`).
    - `forceToolFreeRequest` rebuilds the request, which drops the cache hit rate to 33%.
    - Also find out why synthesis ran twice (28 s) on the new user's 102 s turn.
    - Needs a paid prod-battery run.
5. **Trim write results to a receipt plus a diff.** `update_onto_document` returned 40K
   characters, mostly the full document, on the costliest turn ($0.029). That turn also rebuilt
   a 31K-token repair request.
6. **Review web searches once per round, in parallel.** The per-search reviewer runs one at a
   time. It added 15–29 s to each of the new user's slowest turns, including two 5 s timeouts.

## Outcome per fix (2026-09-25, DJ's go-ahead: do the easy ones, be careful with reasoning)

| #   | Fix                                   | Result                                                                                                                                                                                                                                                                                                                                                                                               | State                                                                                            |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Minute clock out of the cached prefix | **Built.** The date line stays in Location. Local time and the UTC instant move to a new last section, `current_time` ("## Current Time"). The worker's reviewer title lists include it, so the reviewer still sees the time in either deploy order.                                                                                                                                                 | Uncommitted. Web prompt tests 608/608 pass; worker typecheck is clean; web svelte-check not run. |
| 2   | Cap reasoning                         | **Not doing it.** Only 5 of 49 passes went over 1.5K reasoning tokens, and 4 of those were real planning or decisions. A token cap starves answers into empty replies (09-22 book loop), and turning thinking off failed (tasker 98). Setting `low` also sets `exclude: true`, which blinds the stall watchdog. OpenRouter lists `low` for v4.1-flash, but it's unverified that the model honors it. | Parked. Optional paid replay: 10 passes × 2 arms, about $0.03–0.05, needs DJ's OK.               |
| 3   | Context finder injection              | Measure only. `on` is live for DJ; rerun this audit's method on his turns.                                                                                                                                                                                                                                                                                                                           | Waiting on data.                                                                                 |
| 4   | Tool-free synthesis and repair passes | Not started. Needs a paid battery.                                                                                                                                                                                                                                                                                                                                                                   | Open.                                                                                            |
| 5   | Trim write receipts                   | **Not a problem.** The audit measured the stored row (40K). The model sees `compactDocumentMutationReceipt` output (3.8K, capped at 6K).                                                                                                                                                                                                                                                             | Closed.                                                                                          |
| 6   | Web-search reviewer                   | **Batching wouldn't help:** reviews already run in parallel. The real defect was about 9% of reviews dying at the 5 s response-headers timeout, which failed the search. Now one retry on a retryable pre-verdict error, within the 20 s budget (none if under 8 s is left). A failed review is no longer cached for the turn, but denials still are. It still fails closed.                         | Uncommitted. Worker tests 97/97 pass; typecheck is clean.                                        |

Other session's work in the same tree: `host/bootstrap.ts` (+ its test) switches the mutation reviewer to GPT-6 Luna (108 item 5). It is not part of this tracker.

## Prod battery on e2ffeac9c (2026-09-25 21:40 UTC, DJ-approved)

- **Score:** 46/52, gate FAILED. 11 of 13 cases passed every repetition; provenance was verified (web and worker both on e2ffeac9c).
- **Case 10 (0/3): setup, not code.** The harness account has no production Google Calendar connection.
- **Case 2 (2 of 3 repetitions passed).** In repetition 2 all five tasks were created, then the model proposed the dependency links. GPT-6 Luna, the new reviewer switched in by the 108 item-5 change in the same push, reviewed twice. The turn then ended with "I saved these changes, but could not finish the response", and no links were written. Cleanup deleted the turn rows, and the worker log pull failed, so the reviewer's verdict isn't recorded. Suspect: the reviewer switch.
- **Timings, all well inside limits:**
    - case 2: 15–20 s (limit 60; median was 26.5 s on 09-25);
    - case 4: ≤7.3 s;
    - case 8: ≤9.1 s;
    - case 14: ≤10.4 s.
- **Real cost: $0.243** (OpenRouter usage went from $174.294 to $174.537; balance about $25.46).
    - The script reported model $0.218 + judge $0.243. The "judge" figure is the whole shared key's delta, which already includes the model spend, so the script double-counts: the judge itself was about $0.02.
    - The 09-24 "$0.36" run was probably really about $0.18. Fix the cost line in `scripts/agentic/prod-battery.ts`.
- **Clock fix, first reading.** Opening-pass cache hit on harness acting passes went from 17.4% (09-24, n=24) to 25.8% (n=45). Average opening-pass cost fell from $0.00298 to $0.00247 (-17%).
    - This is directional only: the case mix differs, and the battery sessions are mostly single-turn.
    - The real test is multi-turn user sessions after e2ffeac9c.

## Follow-ups from the 09-25 battery (built, uncommitted)

**Case 10: chat calendar reads broken for users on the older single-calendar connection (a real bug, not setup)**

- Since db8509ee4 (09-04), the worker's calendar read port has been source-aware only. Every user not on the multi-calendar allowlist got `not_connected`: 2 real users plus the harness account; only DJ is allowlisted.
- **Fix:**
    - `createLegacyGoogleCalendarReader` in shared-agent-ops reuses the agent-run token decrypt/refresh path.
    - `calendar-read-port.ts` falls back to it with the web executor's routing: mode `legacy_single_account`, complete coverage with one source.
    - The fallback returns precise codes (`not_connected`, `reconnect_required`, `credentials_unreadable`, `credentials_not_configured`) and never an empty "complete" list.
- **Prod config:** `PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY` was missing on Railway `agentic-chat-worker`. It was set on 09-25 with `--skip-deploys`, from the local value, which was verified to decrypt the harness's prod token first.
- **Open gap:** calendar WRITES from worker chat (create/update/delete event, `set_project_calendar`) have the same no-fallback design in `calendar-write-port.ts`, about 1K lines, and are not fixed.

**Case 2 rep 2: reviewer returned a no-op revision twice → `semantic_review_failed` → links never written**

- `revision_value_unchanged` was added on 09-15 on purpose (the priority 2→2 hallucination), so it stays.
- **Changed:** a revision is voided only when EVERY `argument_check` is a no-op. A stale check next to a real correction (prod turn b7b18080, 09-23) no longer kills the turn.
- **Likely root cause:** the reviewer misreads the `depends_on` direction. Clarifying that direction in the reviewer prompt needs a paid case-2 check.
- **Battery:** it now saves failed turns' rows (`failed-turn-rows/`) before cleanup.

## Caveats

- There are no injected (`on`) turns in the sample yet, so fix 3's savings are projected, not
  measured.
- Context-finder logs have no `turn_run_id`, so they were matched to turns by session and time.
  Worth adding.
- Gate-battery rows ($0.24) have no session or turn ids.
- The admin session view also counts radar and loop calls that share the session id.

## Next steps

1. Ship fix 1. It's free.
2. Get DJ's approval for a prod-battery run covering fixes 2 and 4.
3. Once DJ has `on` turns, rerun this audit's method for a real before/after on fix 3.
4. The bigger user cost is latency, not dollars: the new user's first turns took 78–102 s.
5. **From tasker 113 (closed 2026-09-29): repeated task lists split by state.** On
   "what's out of date?", the model lists every task and then lists them again once per state
   (todo, done, in_progress, blocked), even when the first list was complete. In the ws01 replay
   that was 5 task lists, with the state-split lists at 23K of 176K tool characters (about 13%).
   Candidate fixes:
    - Per-state counts in the list message, for example "27 tasks: 10 todo, 0 in_progress,
      0 blocked, 17 done".
    - A read-memo rule (`read-memo.ts`) that answers a same-turn filtered list from an earlier
      complete unfiltered list of the same entity.

    A "complete" line alone won't stop it. Low priority: well under a cent per turn, and answer
    quality is unaffected. Evidence is in
    `docs/technical/reviews/CHAT_READS_PRESENT_TASK113_CLOSEOUT_2026-09-29.md`.

## Rules

- No paid runs without DJ's explicit approval.
- Private session content stays out of the repo. Keep raw dumps in a scratch directory and put
  only aggregates and short paraphrases in docs.

## Verified live (2026-09-25 23:36 UTC, ef6840078, DJ-approved)

- Cases 2 and 10 passed **8/8 across 3 repetitions**. Real cost: **$0.054** (credits delta).
- **Case 10** read the calendar through `legacy_single_account`, with complete coverage and 1 source: the older-connection fix works in prod. Turns took 9–11 s.
- **Case 2:** 16–22 s per turn, all dependency links written. With n=3 this doesn't prove the no-op-revision failure is gone. The prompt-direction clarification is still optional.
- Still open: calendar writes for older-connection users (`calendar-write-port.ts`), and the double-counted cost line in `prod-battery.ts`.

## 2026-09-25 evening: calendar writes and cost fixes (built, uncommitted)

**Calendar writes for older-connection users** (`calendar-write-port.ts`, `receipt-builders.ts`, and shared `createLegacyGoogleCalendarClient`)

- Routing: a write takes the source-aware path if the user is allowlisted, OR the call names a `calendar_source_id`, OR the user has an active write target. Otherwise it uses the older token. The target check keeps DJ on the source-aware path, since the worker has no `PRIVATE_MULTI_CALENDAR_*` env.
- Tests: worker 175/175, shared calendar 141/141, typecheck clean.
- Differences from web that remain:
    - project writes run inline, not through the `sync_calendar` fan-out;
    - no retired `task_calendar_events` touch;
    - a `calendar_source_id` for an older-connection user returns a reconnect-style error.
- Live check proposed: one harness chat turn that creates and then deletes an event (about $0.01, needs DJ's OK).

**Cost figure** (`scripts/agentic/prod-battery.ts`)

- The report now gives `productionModelUsd`, `judgeUsd` (the key delta minus model spend when the key is shared), `judgeKeySharedWithProduction` and `totalUsd`.
- The known full-run cost changed from 0.29 to 0.24, and the gate doc is corrected.
- Tests 13/13.

## Absorbed from 65 — 65 — Agentic Chat: read-by-default + cost/latency program (dual-audit remediation) (2026-10-04)

65 was deleted in the 2026-10-04 tasker cleanup. Its audit verdict, including the residual now owned here:

**Audit 2026-10-04 — SUPERSEDED.** Core shipped and was prod-verified 08-27: serial-stream fix (`903a59bc3`),
route pin (`21b5268af`), read-by-default (`91dbcc9cf`; the 121 s turn replayed in 8 s). D3 was closed by retiring
`change_chat_context` (`f28e8f7bc`), and cache work moved to 109. **Left:** small prompt items. F5's "Current Tool
Surface" prose is still in `build-lite-prompt.ts`, D2 is undecided, and the WP-5 ablations never ran.
**Priority:** P3. **Recommend:** merge into 109.

## Absorbed from 108 — Tasker 108 — LLM spend and speed fixes (from the 2026-09-25 audits) (2026-10-04)

108 was deleted in the 2026-10-04 tasker cleanup. Its audit verdict, including the residual now owned here:

**Audit 2026-10-04 — SHIPPED, VERIFY LIVE.** Items 2/3/5 are pushed + deployed (e2ffeac9c, 1196612b9, 84a022484; both migrations in prod). Tracker 111's 09-27 prod read confirms the loop gate (since 09-26 only 1 of 5 end-of-day runs hit an unchanged project, down from 66%) and shows the brief calls tagged and running on GPT-6 Luna. Item 4 lives in 109.
**Left:**
- a read-only check that briefs load more than 0 tasks with no `length` finishes;
- the GPT-6 reviewer replay at medium reasoning (~$0.03, needs DJ's OK);
- item 1, the key split (deferred; the prod key is in 6 local env files);
- the scheduler guard: not built, so `bootstrap.ts` starts crons unconditionally and `apps/worker/.env` targets the prod DB.

**Priority:** P2. **Recommend:** merge into 109.
