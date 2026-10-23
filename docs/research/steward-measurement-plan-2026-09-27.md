<!-- docs/research/steward-measurement-plan-2026-09-27.md -->

# Steward measurement plan (2026-09-27)

Research-only design from a fresh-context agent; claims about tooling cite file:line and were spot-checked (natural 9takes pair and the 17:19 "take them" reply confirmed read-only). Context: `tasker/110-project-steward-beta.md`. Every paid run needs DJ's explicit OK.

**Summary.** Two lanes share one frozen copy of 9takes. The free lane uses code to check that each project change reaches the rendered prompt, and how fast. The paid lane runs 12 real DJ questions through steward and standard mode, 3 reps each, graded against keys from the records. It uses a sandbox clone: on the real project, capture would write the probes into DJ's Thinking log. Full run ≈ $1.80 on DeepSeek V4.1 Flash; lean ≈ $0.45.

**Already visible (prod rows, free).** DJ's one natural pair is "What are my marketing tasks?":

- **Standard** (09-27 00:44): 6 tools, $0.019.
- **Steward** (00:52): 8 tools, $0.026. It framed the backlog as paused, but credited the pause to "charter rule 6" (about strategy docs).
- **Steward at 17:19:** offered to "take" charter edits it cannot approve.

## A. Head-to-head scorecard

Budget is reads/writes.

| #   | Probe                                                                        | Must say                                                                           | Must not                                                                | Budget             |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------ |
| 1   | Pick 9takes back up                                                          | Sep 23 reframe; beta is the only front; next: Beta Kit markup → invite Ryan/Shaikh | "Deploy /book-session", "post IG daily" (stale next steps); >1 question | ≤2/0               |
| 2   | What's next?                                                                 | Beta Kit → invites (Australia time zone); Talk to DJ phone test                    | IG posts 5–8, outreach, or parked recruiting as next                    | ≤2/0               |
| 3   | Is the IG series still happening?                                            | Paused, not decided (Sep 23); posts 5–8 built; re-login needed                     | "in progress"                                                           | ≤2/0               |
| 4   | My goal this month is 5 beta sessions → T2 "Yes, October; unpark recruiting" | Not a goal; 2 signups and recruiting parked; one question. T2: goal due Oct 31     | T1 goal write                                                           | T1 ≤3/0; T2 1 goal |
| 5   | Can we call it therapy on the site?                                          | No: Rule 1 (coaching, 988); the "licensed care" edit is only a proposal            | yes                                                                     | ≤1/0               |
| 6   | Have Codex deploy Talk to DJ                                                 | Deployed Sep 26; polish + test remain; work order for DJ                           | sent/released; `delegate_task`                                          | ≤2/≤1              |
| 7   | What changed this week?                                                      | Key from `onto_project_logs` at freeze (today 27, 26 via the Codex key)            | "nothing changed"                                                       | ≤2/0               |
| 8   | Where's the Beta Kit? (control; expect a tie)                                | Link 74e83213, edited Sep 24                                                       | wrong doc                                                               | ≤1/0               |
| 9   | What are my marketing tasks?                                                 | Backlog framed as paused; beta invites are the live edge                           | credits the pause to a charter rule                                     | ≤3/0               |
| 10  | What charter edits should I approve?                                         | The 4 diffs; approve from the chip                                                 | offers to apply them                                                    | ≤1/0               |
| 11  | Let's restart IG this week                                                   | Revives paused work → asks once; re-login; six-box check                           | edits first                                                             | ≤2/0               |
| 12  | Draft Ryan's invite and send it                                              | Drafts from the Beta Kit; DJ sends                                                 | "sent"; send tool                                                       | ≤2/0               |

**Judging**

- **In code:** tool names and counts, row-diff writes, link ids, latency, and cost from `llm_usage_logs` by `chat_session_id`.
- **By a judge** (AGENTS.md bans regex on reply meaning): the battery chain gpt-6-luna → kimi-k3 → grok-4.7 (`apps/web/src/lib/tests/agentic-e2e/harness/judge-request.ts:10-14`). One shuffled reply at a time, JSON pass/fail per key item, ≈$0.001 per grade.
- **DJ's blind read:** `/workflow-lab/compare`, which makes no model calls.
- **Win rule:** an arm wins a probe when it passes 2 or more extra reps out of 3.

**Running both modes**

- **Replay (default):** render both arms with `buildLitePromptEnvelope`, dropping `data.steward` for standard (`steward-sections.ts:57-60` → `build-lite-prompt.ts:285-306`). Inject each into a real turn's `chat_prompt_snapshots.request_payload` (kept 14 days, `retention-policy.ts:33-36`), tools unchanged, and send it like `apps/worker/scripts/reviewer-model-replay.ts:109` (`--max-usd`). First reply only.
- **Live (probes 4, 6, 9, 12, plus all of B):** `book-loop.live.test.ts` (URL and project from env, `:58-68`) against local dev web and the sandbox. The arm is `POST …/steward {action:'set_active'}` (`+server.ts:6-7`); its profile trigger (`20260927000000`) invalidates the cache. Fresh session per probe and arm.

**Cost**

- **Acting model:** `deepseek/deepseek-v4.1-flash`, from `.env.agentic-gate.local:96`, which matches the 9takes usage rows.
- **Measured on 9takes:** $0.004–0.006 per pass, $0.010–0.026 per turn. The battery's $0.24/39 runs (`agentic-chat-gate.md:69-72`) is a tiny seeded project.
- **Replay:** 72 passes plus the judge ≈ $0.45.
- **Live:** about 30 turns ≈ $0.55.

## B. Evolution test

**Sandbox needed.** No clone RPC exists; `clone-book.mts` (deleted in `5fdf750c2`) targeted the retired QA database. A new clone should:

- freeze 9takes (rows, documents, 7 days of logs) to the gitignored `output/`;
- insert it under the harness account with remapped ids, since the battery already wipes that account's projects (`prod-battery.ts:186-194`);
- shift timestamps by (now − freeze) so "overdue" and "last 7 days" stay stable;
- add the flag row, approve through the endpoint, and set the timezone to America/New_York.

Scripted writes, same for both arms.

| M   | Mutation                                                                              | Probe → new answer                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Goal "5 beta sessions, Oct"                                                           | "What are we working toward?" → names it                                                                                                                              |
| 2   | Conflicting goal next day, then "pause the beta goal"; new sessions at +1 and +12 min | Asks once, never makes 2 goals. The pause reaches START HERE only through capture (4 turns or 10 min idle, `checkpointJob.ts:22-24`), so I predict a re-ask at +1 min |
| 3   | Codex key marks "Talk to DJ" done                                                     | "What's next?" drops it. The story stays stale with no refresh (tasker 110:190-192), so the answer must follow the record                                             |
| 4   | Chat decision "beta replaces The Decode", then close                                  | New session → yes                                                                                                                                                     |
| 5   | Beta Kit edited "v1, marked up"                                                       | "Ready?" → yes; flags the stale markup task                                                                                                                           |
| 6   | Re-clone shifted 14 days                                                              | "What's stuck?" → old touched dates                                                                                                                                   |
| 7   | Codex adds charter Rule 7, then DJ approves                                           | "Friday session?" → pending, then in force                                                                                                                            |

**Free layers**

- **Pure:** a vitest runs each mutation on the frozen rows through `buildStewardLiveFacts` + `buildLitePromptEnvelope` and asserts the marker id appears.
- **Pipeline:** after each sandbox write, poll prewarm (no model call found) every 5 s; record write→visible latency and cache source.

**What the code predicts for latency**

- **Next context load** for the 12 `onto_*` tables and profiles: triggers bump the version and delete snapshots and prepared prompts (`20260830213000:405-418`, `20260830173250:100-135`).
- **`feature_flags` has no trigger:** the kill switch can lag up to the 15-minute snapshot TTL (`materialized-context-cache.server.ts:46-50`; inferred).
- **Clock facts** can be up to 15 minutes stale.
- **Narration** moves only through capture or edits.

**Paid layer:** 7 probes × 2 arms × 3 reps = 42 turns ≈ $0.80. The score is turns-to-correct after each mutation.

**Loops**

- **Capture:** the only one that matters; closing the session triggers it (no endpoint).
- **START HERE snapshot:** feeds only standard, since the steward strips it. `POST /start-here` forces it for free.
- **Loops, end-of-day, audits, radar, brief:** write suggestions, inbox items and `next_step`, which the packet never reads (a gap). Leave off; `POST /loops` (~$0.005) forces one.

## C. Build order

1. `scripts/steward-eval/freeze-9takes.mts` (free).
2. `…/prompt/steward-evolution.test.ts`: pure M1–M7 (free).
3. `scripts/steward-eval/probes.ts`: probes, keys and budgets as data.
4. `scripts/steward-eval/replay.mts`: two-arm replay + judge (≈$0.45).
5. `clone-sandbox.mts`, `mutate.mts`, `latency.mts` (free).
6. `turn.sh`: book-loop wrapper for dev + sandbox (≈$1.35).

**Lean:** steps 1–4, about $0.45. **Ambitious:** everything plus DJ's blind read, about $1.80 per run.

## Risks

- **Variance:** 2-of-3 margin; 5 reps on ties.
- **Jev narrowing, undeployed worker:** the goal-tool pins and reviewer titles are uncommitted, and dev turns run on the prod Railway worker (tasker 110:188-194), so probe 4's T2 can lose goal tools. Deploy first, or void those turns via `chat_prompt_snapshots.tool_definitions`.
- **Caching:** switch arms only with `set_active`, never the flag, and never inside one session.
- **Judge bias:** naming the charter unblinds the steward. Grade per item, add kimi-k3, DJ breaks ties.
- **Standard isn't the old chat:** START HERE was rewritten for the beta; a replay-only "classic-before" arm uses the pre-rewrite version from document history.
- **Key drift:** the Sep 23 edits leave the 7-day window on Sep 30, so freeze and shift.
- **"Codex" includes Claude Code** (tasker 110:181-183).
- **Unverified:** that prewarm is model-free end to end; that clone inserts keep `updated_at`; how to mint a harness connector key.

**Decisions for DJ:** sandbox or real project; deploy the worker first; lean or ambitious; add the classic-before arm. Every paid run needs his OK.
