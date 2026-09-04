<!-- docs/technical/reviews/AGENTIC_CHAT_TURN_EXECUTOR_AUDIT_2026-09-02.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-02 against commit `53a77af1f` plus the uncommitted
> working tree. Sections 1-10 describe the system at that moment; section 11 records what was
> changed the same day. Verify against code before acting on it.

# Agentic Chat turn executor audit

Scope: `AgenticChatTurnExecutor` and everything it depends on to run a turn: the prompts the
acting and reviewer models see, the context assembled for them, the tool surface, the skill and
domain routing, and the worker harness that orchestrates passes, reviewers, budgets, and failure
handling.

Method: five parallel read-only code lanes (prompts, context, tools, skills, harness) with
`file:line` evidence, plus a read-only pull of 14 days of production telemetry and 12 persisted
prompt snapshots from DJ's own turns. Nothing in the repo or the database was changed. Lane reports
and the evidence scripts are in
[`agentic-chat-turn-executor-audit-2026-09-02/`](./agentic-chat-turn-executor-audit-2026-09-02/).

Prior work this builds on and does not repeat: the
[08-27 prompt-cost audit](./AGENTIC_CHAT_PROMPT_AUDIT_2026-08-27.md), the
[08-27 read-default investigation](./AGENTIC_CHAT_READ_DEFAULT_WRITE_CONTRACT_INVESTIGATION_2026-08-27.md),
and trackers 65, 67, and 70. Section 9 crosswalks their open items.

---

## 1. Verdict

The harness is safe and the read-default redesign shipped on 08-27 worked: a plain question is now
two model calls, no reviewer, about $0.003. Since then the median completed worker turn takes 21
seconds and the median cost is under a cent.

Three things are wrong today, in order of how much they hurt the person typing:

1. **Turns die permanently on recoverable events.** Seven of DJ's 31 worker turns since 08-28
   failed. Three died because one provider endpoint truncated a large tool-call batch and the
   harness treats that as a permanent protocol violation instead of retrying elsewhere. One died
   because the global surface has no way to read a document the model had already found, so it
   searched eight times and then the forced answer failed. None of these needed a model to be
   smarter; each is one branch in the harness.
2. **The prompt and the harness disagree, and the text filter eats the answer.** The static prompt
   tells the model to write unrequested things and to look up skills it cannot call. The worker
   then mounts a 4,677-character rulebook written for the reviewer on every project pass, including
   pure questions. A skill preload chose a blog-marketing playbook for "where are we at with this
   book?" and told the model to apply it. And a regex sanitizer meant to strip model scratchpad
   leaks would alter 38 of DJ's last 76 replies, deleting 13% of their text.
3. **Write turns pay for machinery that could be code.** Every edit to an existing entity goes
   through the contract lane even when the model just read the exact id. The reviewer runs on a GPT
   route with zero prompt caching, reads the entire acting transcript on every call, and has a
   60-to-73-second tail on Azure. Over 14 days it was 59% of model spend; since the 08-28 ship it is
   24% and runs on 16% of turns.

The architecture underneath is sound: SHA-bound reviewers, a deterministic direct-write floor, an
effect ledger with post-start no-retry, atomic provider passes, and a hashed execution graph. The
fixes below are mostly narrow. The one structural recommendation is to name the turn phases so the
next fix does not add a ninth flag.

---

## 2. What production says

Window: 14 days ending 2026-09-02. Source tables: `chat_turn_runs`, `llm_usage_logs`,
`chat_tool_executions`, `chat_turn_events`, `chat_prompt_snapshots`,
`agentic_chat_execution_observations`.

### 2.1 Traffic is mostly the test battery

| Slice              | Turns | Notes                                     |
| ------------------ | ----: | ----------------------------------------- |
| All                |   296 | 4 users; 261 worker, 35 legacy SSE        |
| E2E harness user   |   208 | 20 distinct messages replayed             |
| DJ                 |    83 | 53 worker; the only organic user of note  |
| Two other accounts |     5 |                                           |
| Context            |       | project 223, global 62, project_create 11 |

Read every aggregate below with that in mind. The costliest 25 turns in the window are all the
harness "This project's documents are a mess" organize scenario.

### 2.2 Outcomes

| Measure                                |             Value |
| -------------------------------------- | ----------------: |
| Worker turns completed / failed        |          227 / 34 |
| DJ worker turns since 08-28 noon       |                31 |
| DJ failures in that slice              |           7 (23%) |
| Harness turns since 08-28, failed      |            49 / 3 |
| DJ median duration / calls / cost      | 32 s / 3 / $0.003 |
| Harness median duration / calls / cost | 19 s / 3 / $0.002 |

Failure codes on the worker over 14 days: `provider_tool_not_allowlisted` 9 (last on 08-28
04:52), `internal_cohort_rejected` 8 (08-20 and 08-21; the string no longer exists in the codebase),
`provider_tool_finish_reason_invalid` 3 (all DJ, 08-30 and 08-31),
`provider_forced_synthesis_failed` 2, `read_tool_execution_failed` 2,
`provider_tool_arguments_invalid` 2, `permanent` 2, `timeout_post_start` 1 (a 493-second
semantic-discovery smoke), and one each of five others.

### 2.3 Where the seconds go

From the worker's own `timing` event on 43 completed turns since 08-28:

| Phase                              |    p50 |    p90 |
| ---------------------------------- | -----: | -----: |
| Queue wait                         |  0.3 s |  0.6 s |
| Worker start to provider authority |  0.4 s |  0.6 s |
| Provider authority to finish       | 19.4 s | 68.6 s |
| Of which model generation          | 12.1 s | 47.4 s |
| Provider finish to terminal        |  0.5 s |  0.7 s |
| Total                              | 20.8 s | 70.3 s |
| Time to first visible response     |  6.0 s | 43.7 s |

Ninety-three percent of wall time is inside the provider loop. About seven seconds of the median
turn is not model generation: tool execution, validation, durable fences between rounds. The 08-27
serial-delivery defect is gone (provider finish to terminal is half a second).

Model call latency by route: DeepInfra p50 3.9 s, p90 11 s. Alibaba p50 3.3 s, p90 12.8 s. Reviewer
on OpenAI p50 3.6 s, p90 8.1 s. Reviewer on Azure p50 5.4 s, p90 11.6 s, with two calls on 08-28 at
73.0 s and 63.7 s. That turn ("push the beta list email thing to friday") took 190 seconds, 137 of
them in the two reviewer calls.

### 2.4 Where the dollars go

| Route                            | Calls | Prompt tokens | Cached |  Cost |
| -------------------------------- | ----: | ------------: | -----: | ----: |
| Acting, DeepSeek v4 flash (14 d) | 1,037 |    14,158,929 |    47% | $0.90 |
| Reviewer, GPT-5.6-luna (14 d)    |   350 |     4,557,575 |     0% | $1.30 |
| Acting since 08-28               |   165 |     2,218,048 |    46% | $0.18 |
| Reviewer since 08-28             |    20 |       190,281 |     0% | $0.06 |

Per turn: prompt tokens p50 42,922, p90 155,652, max 445,477. Cost p50 $0.0052, p90 $0.021.
Reviewer share of worker spend: 59% over 14 days, 24% since the read-default ship. The reviewer
averages 9,500 to 12,900 prompt tokens per call because it receives the whole acting transcript,
and it has never had a cache hit on either OpenAI or Azure.

### 2.5 What tools actually run

1,807 tool executions over 14 days, split at 2026-08-28:

| Tool                          | Before | After | Note                                                    |
| ----------------------------- | -----: | ----: | ------------------------------------------------------- |
| get_document_outline          |    215 |    67 | outline plus section = 42% of post-ship calls           |
| read_document_section         |    208 |    65 |                                                         |
| declare_turn_contract         |    200 |    32 | 20% failed before, 16% after                            |
| approve_mutation_batch_review |     85 |    14 |                                                         |
| approve_turn_contract_review  |     78 |    10 |                                                         |
| request_proposal_revision     |     50 |    13 |                                                         |
| declare_read_only_turn        |     58 |     2 | retired control; both post-ship calls were the reviewer |
| get_project_overview          |     40 |    23 |                                                         |
| list_onto_tasks               |     12 |    16 |                                                         |
| search_all_projects           |      5 |    15 |                                                         |
| create_onto_task              |      2 |    13 |                                                         |
| update_onto_task              |     91 |    12 |                                                         |
| delegate_task                 |      0 |    10 | 6 failed (60%)                                          |
| explore_project               |      0 |     9 | new semantic discovery                                  |
| skill_load                    |      4 |     4 | 2 failed                                                |
| change_chat_context           |      0 |     0 | mounted on every surface                                |
| cancel_turn_contract          |      0 |     0 | mounted on every surface                                |

Control and reviewer calls were 38.7% of all tool executions before 08-28 and 22.3% after.

### 2.6 What the model actually sees

Twelve persisted snapshots of DJ's worker turns (08-30 to 09-01):

| Surface               |    System prompt |    Tools (chars) | Runtime system messages after history                   |  Pass-1 tokens |
| --------------------- | ---------------: | ---------------: | ------------------------------------------------------- | -------------: |
| global_basic          |     12,372 chars |        8 / 9,297 | batching 581                                            |         ~3,250 |
| project (17-18 tools) | 16,450 to 23,541 | 23,222 to 25,375 | surface override 767, write routing 4,677, batching 581 | 5,850 to 9,170 |

The static prefix that can cache across turns is 5,231 characters (about 1,300 tokens). Everything
after it is dynamic. In the project snapshot for "Okay, I forget: where are we at with this book?":

- Domain sensing preloaded `story_driven_content_craft` (dopamine ladders, seven-mistake reject
  pass) as "Apply its workflow directly to this turn's work": 6,227 characters.
- `situational_rules` reported `writeIntent: true` for a pure question, so the write rules and the
  4,677-character write-routing message were mounted.
- The system prompt's "Current Tool Surface" listed `declare_turn_contract`; the worker's override
  message listed a callable set without it. Three tool lists in one prompt.
- The prompt said "See the task_management skill" and "do not call skill_load again"; no skill tool
  exists on the surface.
- START HERE appeared four times (its own section, the JSON index, the Knowledge Map, recent
  changes). Members rendered as UUIDs for both id and title.
- The START HERE excerpt was cut at 2,400 characters, dropping the Decisions, Current state, and
  Open questions sections, which is what the question was about. The model then spent two rounds on
  outline and section reads.

---

## 3. Five traces

**T1. Truncated batch kills the turn.** DJ turns `83a0a7fc`, `41271a44` (08-31) and `b1c37abe`
(08-30): "stage the proposal as one review-required change set". Each ran its reads, then the
acting call that emitted the mutation batch came back from the Alibaba endpoint with exactly 2,001
completion tokens, tool calls present, and a finish reason that was not `tool_calls`.
`assertToolCallFinishReason` throws `provider_tool_finish_reason_invalid`
(`apps/worker/src/workers/agentic-chat/provider/stream-tool-calls.ts:176`), classified `unknown`,
mapped to permanent. The client's own cap is 4,000 (`provider/openrouter-client.ts:46`), so the
"reached our cap" correction at line 538 never fires. Alibaba's advertised max output for this model
is 393k tokens, so this is an endpoint quirk, and every other route would have finished the call.
Three of three of DJ's complex proposal requests died this way with "An error occurred while
streaming." No `provider_attempt_ended` observation is written for the failing attempt.

**T2. Search loop with no read tool.** DJ turn `3cd50ea6` (09-01, global): "Do I already have
something ready for me to send to Theo Von?" Round one found the task and the outreach document.
Rounds two through eight were seven more `search_all_projects` and `explore_project` calls with
paraphrased queries, because `global_basic` mounts no document reader
(`packages/agentic-chat-runtime/src/catalog/surfaces.ts:68-78`) while the search results advertise
`get_onto_document_details` as the next step, a tool that would have killed the turn
(`loop/tool-payload-compaction.ts:766-781`). The prompt grew from 6.4k to 26.7k tokens. Round six
hit a 429, the pin switched provider and model snapshot, and the read-loop repair forced a
synthesis that failed. Sixty seconds, eleven calls, $0.021, generic error. The same question in
project context two days earlier succeeded.

**T3. Reviewer confusion.** Harness turn `d41d9e86` (08-28 04:52): the acting model declared a
two-target contract three times despite two `request_proposal_revision` results naming the single
correct target. Then the reviewer itself called `declare_read_only_turn` with the reason "This turn
asks for semantic review of a proposed contract... it does not commission execution", mistaking
its own review prompt for the user's request, and the turn died with
`provider_tool_not_allowlisted`. The typed `corrected_contract` path shipped later that day
(`b879d3fb7`) closes the re-declare loop; the kill class is still live (Finding 6).

**T4. Reviewer tail latency.** Turn `67015082` (08-28 22:45): seven calls, 190 seconds. Contract
review on Azure 73.0 s, mutation review on Azure 63.7 s. Acting calls were 1.9 to 18 s.

**T5. delegate_task.** Ten calls since 08-28, six failed. DJ's own messages in the window include
"Retry delegate_task once now that the backend type mismatch is repaired": a live contract mismatch
being debugged by hand through chat.

---

## 4. The system as it runs today

### 4.1 Which path a turn takes

| Context                                                        | Surface                            | Runs on                                                                                                                                                                                                |
| -------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| project, ontology                                              | `project_write_document`           | worker                                                                                                                                                                                                 |
| global, general                                                | `global_basic`                     | worker, read-only                                                                                                                                                                                      |
| project_create                                                 | `project_create_minimal`           | worker, contract-first                                                                                                                                                                                 |
| daily_brief, calendar                                          | `global_write`, `project_calendar` | **legacy web path**, always: calendar tools are worker-unavailable so admission throws `transport_renegotiate` (`apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.server.ts:376-383`) |
| any message that mounts email, delete, contacts, Corsair tools |                                    | legacy web path                                                                                                                                                                                        |

The legacy `stream-orchestrator` (about 5,500 lines) has no reviewer. The web `project_basic`,
`project_write`, and `project_document` profiles are never selected by routing.

### 4.2 Passes per turn class (verified in `provider/turn-provider.ts`)

| Class                           | Sequence                                                                              | Model calls min / typical |                            Reviewer |
| ------------------------------- | ------------------------------------------------------------------------------------- | ------------------------: | ----------------------------------: |
| Pure read or answer             | A → (reads → A)\* → answer                                                            |                     1 / 2 |                                   0 |
| Simple direct write, ≤3 creates | A proposes → execute → forced tool-free answer                                        |                     2 / 3 |                                   0 |
| Complex write via contract      | A withheld → A gate declares → R contract → A proposes → R batch → execute → A answer |          5 / 6, ~28 worst | 1 + 1 per batch, +≤2 revisions each |
| Clarification                   | A → control executes → forced question                                                |                     2 / 3 |                                   0 |
| Project create                  | gate → R → shell create → R → children → R → answer                                   |                     5 / 7 |                                 2-3 |
| Compiled single-task reschedule | withheld → R contract → compiled call → R batch → A answer                            |                         4 |                                   2 |

Every control decision, including the reviewer's approvals, executes as a read-tool round through
the executor: a claim-fence RPC, a tool row, two semantic publishes, a tick on the 16-round and
40-call budgets, and a tick on the read-loop escalation ladder (Finding 8).

### 4.3 Models

Acting: `AGENTIC_CHAT_OPENROUTER_MODEL` (DeepSeek v4 flash in production), provider order
deepinfra, deepseek, alibaba, cloudflare with fallbacks allowed, `max_tokens` 4,000, reasoning
excluded from the stream but billed. Reviewer: a second OpenRouter client at temperature 0,
`max_tokens` 4,000, hardcoded to prefer `openai/gpt-5.6-luna`
(`apps/worker/src/workers/agentic-chat/bootstrap.ts:354-392`). The comment in `config.ts:22-33`
still calls it "the Gemini semantic reviewer". If every candidate were an acting model the
reviewer would silently fall back to the acting model (`bootstrap.ts:376-380`).

---

## 5. Findings

Severity is by user impact today. P0 means DJ or a harness turn failed or was visibly wrong
because of it in the window.

### P0

**1. A truncated tool-call response is a permanent turn death.** Trace T1.
`provider/stream-tool-calls.ts:176` throws when tool calls arrive with a finish reason other than
`tool_calls`; the cap detection in `provider/openrouter-client.ts:531-540` only fires at the
client's own `max_tokens`. Fix: when tool calls are present and the finish reason is not
`tool_calls`, or parsing fails at end of input, classify as `provider_tool_arguments_truncated`
and let the atomic pass retry on the next route with the pin cleared, before any text has been
yielded. Separately decide whether Alibaba stays in the acting order (Decision 7). Write the
`provider_attempt_ended` observation before the finish assertion so failed attempts are visible.

**2. The global surface cannot read a document, and tool results tell the model to call tools that
kill the turn.** Trace T2. `surfaces.ts:68-78` mounts no document reader on `global_basic`;
`loop/tool-payload-compaction.ts:766-781` injects `materialized_tools` hints such as
`get_onto_document_details` into worker search results; descriptions of `list_onto_documents`,
`get_document_outline`, `get_onto_project_details`, and `create_onto_task` reference unmounted
tools; the worker surface is immutable between passes (`provider/request-builders.ts:176-181`).
`change_chat_context`, the intended escape, has zero calls in 14 days. Fix: mount
`get_document_outline` and `read_document_section` on `global_basic` (about 1,800 characters);
strip `materialized_tools` from worker payloads or honour them from `admittedTools` on the next
pass; turn `provider_tool_not_allowlisted` for a name that exists in the catalog into the same
one-shot repair used for `skill_load` (`provider/repair-policy.ts:21-61`); add a test that no
mounted tool's description names an unmounted tool per profile.

**3. The final-text sanitizer deletes ordinary sentences.**
`packages/agentic-chat-runtime/src/loop/assistant-text-sanitization.ts:14,15,18,19` drop any
sentence containing "word (", starting with "No", "From", or "Since", or containing "query:".
Applied on the worker to every forced-synthesis answer (every direct write, clarification, and
read-loop stop, `turn-provider.ts:2111`) and to every assistant message entering model history
(`apps/web/src/lib/services/agentic-chat-v2/history-composer.ts:118-135`). Measured on DJ's last
76 assistant messages: 38 altered, 13,079 of 97,862 characters removed, including "That Theo Von
task (due Aug 16) is already 16 days overdue." and every header of the form "Where we're at (Day 1
of 100)". Tests cover only Grok leak fixtures. Fix: delete those four patterns, require two marker
hits before stripping, add the measured sentences as regression tests, and measure the delete rate
on a week of messages before and after.

**4. Operational skills never reach the production model, wrong skills do, and whether any skill
fires depends on the prompt cache.** Fourteen skills, including `task_management`,
`document_workspace`, `plan_management`, `project_creation`, `calendar_management`,
`people_context`, and `research_capture`, are in no domain or outcome card
(`apps/web/src/lib/services/agentic-chat/tools/domains/domain-sensing.ts:575-680`), so they can
never be preloaded, and the worker cannot call `skill_load`
(`packages/agentic-chat-runtime/src/worker-tool-policy.ts:88-93`). The marketing skills that can
be preloaded misfire because the scorer awards +50 per common word leaking from skill ids and
summaries ("first", "list", "find", "email", "plan", `domain-load.ts:103-111,128-132`); the Gmail
read message still preloads `cold_email_deliverability_readiness` on the current catalog, and
"where are we at with this book" preloaded a blog-marketing playbook (section 2.6). A prepared-prompt
hit applies no overlay (`worker-turn-preparation.server.ts:472-493`) while a miss preloads
(`:564-573`), and the worker never passes `alreadyLoadedSkillIds`, so it re-injects about 985
tokens on every miss turn. Fix: a deterministic intent-to-skill map at worker admission for the
operational skills keyed off the selected surface; split the sensing haystack into discriminative
and prose tokens and require an alias or two discriminative hits to open the gate; run the overlay on
both cache branches; pass loaded ids; emit a `skill_preloaded_id` event on the worker lane.

### P1

**5. The reviewer never caches, reads the whole transcript, and has a minute-long tail.** Section
2.4 and trace T4. The approval tool schema carries a per-review `contract_sha256: { const }`
(`provider/review/turn-contract.ts:60-76`), which changes the tools array on every call and defeats
prefix caching on OpenAI and Azure; the user message is the entire acting message list including the
acting system prompt and the worker's routing messages (`turn-contract.ts:79,136`,
`review/mutation-batch.ts:85,146`); the reviewer client inherits the 90-second request timeout with
no per-pass budget. Fix: keep the SHA binding but move it out of the tool schema into the user
message and validate it in `decision-completion.ts` as already done for identity; send only user
messages, tool results, and the loaded-context sections as evidence (the artifact's `promptSections`
makes this a filter); prefer OpenAI over Azure in the reviewer route order; give reviewer passes a
shorter timeout and a budget derived from the remaining turn wall.

**6. A work-tool call on a reduced surface still kills the turn permanently.** Trace T3 and nine
`provider_tool_not_allowlisted` failures in the window. `turn-provider.ts:1826`
(`assertAllowlistedCall`), `:1970-1972` (`provider_missing_tool_call` on a required gate), and
`review/disposition.ts:126-145` have no repair path; the only one-shot repairs are for `skill_*`
and reviewer-only names (`repair-policy.ts:21-97`). Tracker 70 ratified this as fail-closed; it
can fire after six paid control rounds or after a durable project create. Fix: extend the mimicry
repair pattern to "advertised-elsewhere work tool on a reduced surface" with a one-shot restore of
the right surface, and route prose on a required gate to forced synthesis instead of a throw. Keep
fail-closed for unknown names.

**7. Every update of an existing entity is contract-routed.** All `update_onto_*`,
`link_onto_entities`, `tag_onto_entity`, and `create_task_document` carry
`directWriteSelectionPolicy: 'resolved_existing'` (`mutationToolCatalog.ts`), which
`assessDirectWriteBatch` always sends to the contract lane (`provider/write-routing.ts:88`). The
direct lane is therefore creates-in-focused-project only, and "mark X done" after reading X's id
in the same turn costs the full reviewer cycle. The prompt's own "simple" example, renaming the
focused project, has no mounted tool (`update_onto_project` is on no project surface). Fix: allow
`resolved_existing` in the direct lane when the target id was returned by a read in the same turn
(the read memo already knows, `provider/feedback.ts:170-182`) and the batch is at most three;
keep the contract lane for cold references. Decision 3.

**8. Reviewer decisions advance the read-loop escalation ladder.** Controls are registered
`kind: 'read'` (`provider/tool-surface.ts:26-31`) and are not excluded in
`loop/round-analysis.ts:89-135`, so a canonical organize (three reads, declare, contract approval,
batch approval) reaches `stop_and_answer` before its first mutation and `must_synthesize` after
batch one. The completion continuation at `turn-provider.ts:1077-1088` is a one-shot patch over
this; the file's own comment promises a reset on writes that never happens. Fix: exclude control
names from the round pattern and reset the rank when a mutation round executes.

**9. About 3,000 tokens per project pass of avoidable prompt.**
`call_ref`/`after` sidecars on every tool schema, 349 bytes each, about 1,500 tokens on 17 tools
(`provider/tool-surface.ts:167-207`), for a feature reads do not need and the direct lane forbids
(`write-routing.ts:72-83`); the 3,556-character `SEMANTIC_COMMISSION_GUIDANCE` in reviewer register
mounted in the actor prompt on every project pass (`review/turn-contract.ts:265,276`); write rules
mounted whenever write tools exist rather than when write intent exists
(`agentic-chat-lite/prompt/situational-rules.ts:98`); the surface-override message on every pass
because the artifact lists the deferred `declare_turn_contract` (`tool-surface.ts:74-94`); and
three tool lists per prompt. No size-budget test sees the worker surface. Fix: sidecars only on the
contract carve-out and completion surfaces; a four-line actor version of the commission guidance;
gate write rules on detected intent; exclude the known deferral from the override comparison;
delete the prose tool list; add a worker-surface budget test.

**10. The static prompt contradicts the harness.** "Before you finish... write it somewhere that
survives this session" (`build-lite-prompt.ts:1034`) commissions unrequested writes, and a
focused-project `create_onto_task` executes with no reviewer; the deterministic conservative floor
in `statedFutureCapture.ts` already covers the measured phrasings. Web write rules say find the id
then write (`situational-rules.ts:36`) while the worker says any existing entity needs a contract
first (`review/turn-contract.ts:272`), and `update_onto_task` has no worker description override
saying so. The lead-in rule (`:964`, `:1050`) produces text the worker discards on every disposition
pass. Four different clarification triggers exist. Fix: delete line 1034 outside living-reference
projects; make `WRITE_TURN_RULE_LINES` worker-aware; put "existing entity, contract first" into the
description override of every `resolved_existing` tool; drop the lead-in on worker-bound artifacts.

**11. Tool results are replayed in full on every later pass, and memo hits re-inject the whole
payload.** `provider/request-builders.ts:245-297` only appends; nothing in `provider/` trims a prior
round's tool messages; a memo-served repeat read re-emits the full cached payload
(`loop/read-memo.ts:58-76`). A `skill_load` result is budgeted at 20,000 characters and rides every
later pass. Fix: after the next pass consumes a round, replace older tool messages with a
200-character stub carrying ids; return a stub for memo hits.

**12. Partial contract fulfilment finalizes as completed with no disclosure.**
`turn-executor.ts:2939-2955` stores `outcome_status: 'unfulfilled'` only in message metadata; the
completion continuation re-drives only untouched outcomes (`turn-provider.ts:318-352`); the terminal
text guard never receives `expectedWriteToolNames` (`terminalTextIntegrity.ts:41-52`). Two of six
moves done plus prose is `completed`, `finished_reason: 'stop'`. Fix: pass the unfulfilled outcomes
with `missingTargetIds` into the terminal integrity pass so the disclosure line is appended and
`finishedReason` becomes `mutation_unfulfilled`; let the completion pass send `missingTargetIds`.

**13. Global context loads eight project bundles and renders none of them; daily-brief chat renders
no brief.** The loader fetches name, description, next step, goals, milestones, plans, and activity
for eight projects (`context-loader.ts:47-53`) but the prompt renders only `project_intelligence`
(`build-lite-prompt.ts:1545-1563,1693,1811`), with no task rollups, so a status question needs a
`get_workspace_overview` round. The 44-versus-33 accessible-project discrepancy is the preload
counting paused projects while the overview filters them (`access-port.ts:66-70`). Daily-brief chat
loads the executive summary and every project brief and renders only counts
(`build-lite-prompt.ts:1231-1264`); the AI-inbox proposal brief renders only on the legacy path
(`stream-route/prompt-context.ts:36`). Fix: render bundle summaries with open and overdue counts,
add a task rollup to the intelligence RPC, align the paused filter, add a daily-brief section, and
push the proposal brief on the worker branch.

**14. Budgets compose to the 300-second wall with no retry after start.** 90 seconds times two
attempts per pass, shared by the reviewer, times six or more passes; `provider_budget_exhausted`
maps to permanent and the recovery RPC never retries post-start
(`supabase/migrations/...recovery.sql:472-480`). A budget expiry after successful writes reports a
failed turn. Pre-start throttle requeues wait one to sixteen minutes (`:513-515`). Fix: derive each
attempt's timeout from the remaining budget; on expiry after at least one successful write finalize
as completed with `mutation_unfulfilled` and the pending contract; use seconds-scale backoff for
throttle.

**15. delegate_task fails 60% of the time since 08-28.** Section 2.5, trace T5. Root cause not
traced in this audit; the type mismatch DJ named in chat is the first place to look.

### P2

- **History is thin and its summary is always empty.** Compression at eight messages keeps the
  last four at 1,200 characters plus a summary line that nothing on the worker path writes
  (`history-composer.ts:66-121`); the continuity hint is not rendered when one to seven raw messages
  exist; `data_accessed` leaks control-tool names (`last-turn-context.ts:559-583`);
  `entityResolutionHint` is built and never rendered.
- **Duplication and dead weight in the context index.** Documents two to three times; members as
  UUID-only refs; focus-entity description and document preview loaded but never rendered;
  `read_document_section` has no compactor so long sections degrade into a JSON-string preview;
  the prompt frame uses local date while intelligence buckets use UTC days.
- **Executable mutations unreachable on the project surface.** Goal, plan, milestone, risk create
  and update, `update_onto_project`, link, unlink, and tag have worker adapters
  (`composition-root.ts:315-370`) but are on no project surface and there is no worker discovery.
- **Same-project creates serialise** because creates are keyed on `project_id` as a write resource
  (`toolExecutionPolicy.ts:29-34`).
- **Worker has no argument recovery.** A JSON parse failure is permanent
  (`stream-tool-calls.ts:219-227`) while the runtime ships `recoverToolArgumentObject` used only by
  the legacy path.
- **Committed effect plus failed tool-row persist** yields a failed turn and a cross-turn duplicate
  risk because effect identity is per turn (`turn-executor.ts:1609-1636`,
  `mutation-executor.ts:107-113`).
- **Reviewer transport failure becomes a user clarification** ("Which exact item should I change?")
  rather than a retry (`turn-provider.ts:1490-1495`).
- **A compiled single-task batch pays a reviewer pass for a deterministic transform**
  (`turn-provider.ts:1655-1694`).
- **Validation-class contract defects still require acting-model regeneration** because
  validation runs before the reviewer and cannot use the typed-correction path.
- **Dead references and stale docs.** `request_turn_clarification` and `cancel_turn_contract` on
  read-only `global_basic`; `change_chat_context` on every surface with zero calls (Decision 2);
  `search_buildos` and two libri names in metadata with no definition; the ADR names five files that
  no longer exist and describes a read-only review that no longer runs; the config comment names the
  wrong reviewer; `internal_cohort_rejected` appears in eight production rows and nowhere in code;
  `llm_pass_count` is still zero on 10 of 51 worker turns since 08-28.
- **Supervisor is 900 lines off by default** (`config.ts:83-87`) with a dead `stop_with_message`
  path, and its responsibilities are each duplicated by the read-loop ladder, validation repair, or
  the clarification control. Decision 5.

### Architecture (not a defect, a cost of the next feature)

`turn-provider.ts` holds about 25 closure flags and eight `take*` methods whose preconditions
repeat `semanticTurnDispositionGateUsed || turnContract || mutationRoundReached` four times; there
is no named phase, so each fix adds a flag. `streamInitial` and `streamContinuation` are the same
250-line loop with three optional behaviours. The legacy single-read `synthesize` bridge is about
350 lines of dead dual-path logic that production never takes. Seven derived tool surfaces plus a
prose override are recomputed at each call site. Twelve side-effect ports each swallow their own
errors. The executor validates fixture shape on every step of a provider it composes itself. Nothing
mid-turn is resumable: a worker restart mid-contract loses the approved SHA and revision counters.

If simplifying, cut in this order: delete the `synthesize` bridge; merge the two stream loops;
introduce a `TurnPhase` enum with a pure `next(phase, event)` reducer and a single
`surfaceFor(phase)`, which makes "work tool on a reduced surface" a phase transition rather than a
throw and makes Finding 8 impossible; give control decisions their own durable step kind so they
stop counting as tool rounds; decide the supervisor; collapse the side-effect ports.

---

## 6. What is right and should not be undone

- **The read-default plumbing** (tracker 65 WP-3): contract deferred off the opening pass, read-only
  surfaces omit the schema, the deterministic direct-write floor in `write-routing.ts`. A plain
  question is two calls and $0.003; the exact 08-27 replay went from 121 seconds to 8.
- **Reviewer hardening**: SHA-bound approvals, mandatory `reference_candidates` with a
  deterministic candidate-ambiguity floor (`review/decision-handling.ts:113-198`), typed
  `corrected_contract` re-review without acting regeneration (`turn-provider.ts:838-857`), field
  semantics and required-argument projections, fail-closed to clarification. The ADR canaries that
  justify the reviewer still hold: the three-email-task guess after a mechanically correct gate is
  the class no deterministic check catches.
- **Effect ledger and control plane**: reserve, begin, reconcile with stable ids, post-start
  no-retry, fresh signals on receipt persistence so cancellation cannot hide a committed effect.
  Cancellation and abort handling is sound throughout.
- **Atomic buffered provider pass** and the per-turn route pin.
- **Context freshness**: row triggers on twelve ontology tables bump a per-project version and
  evict snapshots and unconsumed prepared prompts; the token is checked at four points. A user
  cannot see stale ontology context after a write.
- **Worker narrowing of schemas** and the eight mutation description overrides: the right place for
  point-of-use guidance.
- **The situational-rules mechanism**, prompt-clock rounding, static-prefix ordering, and the
  size-budget ratchet on the web surface.
- **The execution graph**: deterministic, hashed, cycle-checked, with worker-owned conflict
  barriers.
- **The skill file format and linter**: `task_management` and `cold_email_outreach_compiler` show
  it can produce operational instructions. The gap is delivery, not authoring.

---

## 7. Decisions for DJ

Each one changes what users experience or what the product costs. Everything else in section 5 is
an engineering call.

1. **Retry or fail on truncation.** Recommended: retry once on another route before any text has
   streamed. Risk: a slightly longer wait on the rare truncation instead of a dead turn.
2. **Global chat and documents.** Recommended: mount outline and section reads on `global_basic`
   and delete `change_chat_context`. Alternative: keep zoom-into-project as the model's move and
   teach it. Cost of the recommendation: about 450 tokens per global pass; benefit: trace T2 cannot
   recur.
3. **Widen the direct lane to same-turn-resolved edits.** Recommended: yes, at most three
   operations, only when the id came from a read in the same turn. This makes "mark X done" two
   passes instead of six and removes the reviewer from most edits. Risk: the restraint canary
   (tracker 56) must stay green; ambiguity still routes to the contract lane because an ambiguous
   target has no single resolved id.
4. **Skills on the worker.** Recommended: deterministic preload of the operational skills by
   surface and intent, fix the scorer, and turn the marketing preload off until the
   discriminative-token fix is in. Cost: about 1,000 tokens on turns where a skill fires.
5. **Supervisor.** Recommended: delete it and its checkpoint plumbing; every job it had is done
   elsewhere. Alternative: turn it on and delete the read-loop ladder it duplicates.
6. **Sanitizer.** Recommended: delete the four broad patterns now and keep the Grok-specific ones.
   Risk: a scratchpad leak from a future model; the tests for those fixtures remain.
7. **Alibaba in the acting route.** Recommended: move it behind DeepInfra and DeepSeek and behind a
   truncation-aware retry; do not globally ignore it until the retry lands and one week of
   attempt observations show whether the 2,000-token cap recurs.
8. **Reviewer model and evidence.** Recommended: keep GPT-5.6-luna, fix caching by moving the SHA
   out of the schema, send filtered evidence, prefer OpenAI over Azure. Alternative: a cheaper
   reviewer model; not recommended without a paired canary, because the reviewer is the only thing
   that caught the guessed-target write.

---

## 8. Recommended order

Lean version, each a small change with a receipt:

1. Truncation retry (Finding 1), catalog-name repair instead of kill (Finding 2 and 6), and the
   attempt-ended observation on failed finish assertions.
2. Sanitizer patterns (Finding 3) with the measured before/after.
3. Global document reads and `materialized_tools` stripping (Finding 2).
4. Reviewer cache and evidence filter, OpenAI-first route (Finding 5).
5. Control rounds out of the read ladder (Finding 8), then the same-turn-resolved direct lane
   (Finding 7) behind the restraint canary.
6. Operational skill preload and scorer fix (Finding 4).
7. Prompt reconciliation (Findings 9 and 10) in one attributable change, measured with a
   worker-surface budget test.
8. Replay stubs (Finding 11) and partial-fulfilment disclosure (Finding 12).

Ambitious version: do items 1 through 4 first, then the phase reducer from section 5's
architecture note. It removes the flag soup, makes Findings 6 and 8 structurally impossible,
deletes about 1,300 lines (synthesize bridge, duplicated stream loop, supervisor), and leaves a
state machine that can be unit-tested without fixtures and extended to sub-agents with their own
budgets. It is a week of focused work against a 10,600-line provider test suite that already pins
the behaviour.

---

## 9. Prior findings crosswalk

| Item                                          | Status 2026-09-02                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 08-27 F1 contract schema cost                 | Largely done; residue is clarify and cancel controls on read-only surfaces               |
| F2 / D3 `change_chat_context`                 | Open; still zero calls; Decision 2                                                       |
| F3 provider pin and caching                   | Done for the acting route (46-48% cached); reviewer route 0%; live gate still unmeasured |
| F4 phantom `tool_search`                      | Closed in the prompt; survives in three legacy-path repair builders                      |
| F5 tool-surface prose duplicate               | Open, now three lists                                                                    |
| F6 write bullets on read-only surfaces        | Open and now contradicts the worker                                                      |
| F7 domain preload misfires                    | Open; mechanism corrected (token leakage, not the floor); reproduced live                |
| F8 / D2 formatting rule                       | Open; still negative-shaped                                                              |
| F9 catalog A/B                                | Not run; moot on the worker lane, which has no catalog                                   |
| F10 entities listed two to three times        | Open                                                                                     |
| Tier 4 replay growth                          | Open (Finding 11)                                                                        |
| Investigation rec 1 serial delivery           | Closed; provider finish to terminal 0.5 s                                                |
| Investigation rec 8 preload rollups, 44 vs 33 | Open; discrepancy root-caused to the paused filter                                       |
| Tracker 65 WP-1 span receipt                  | Satisfied by section 2.3                                                                 |
| Tracker 65 WP-2 cache-hit gate                | Acting route 46-48% since 08-28, below the 80% target; reviewer 0%                       |
| Tracker 65 WP-3 read-default                  | Confirmed in production                                                                  |
| Tracker 67 outline-to-section dependency      | Open; the catalog comment promising materialisation is false on the worker path          |
| Tracker 70 "8 attempts" loop                  | Closed by the typed correction (`b879d3fb7`), not by the schedule compiler               |
| Tracker 70 control-round kill                 | Open (Finding 6)                                                                         |
| Tracker 70 "beta list email thing" regex      | Fixed in code                                                                            |
| PC1 shell-only contract                       | Mitigated (contract may carry goal and task outcomes; post-shell continuation)           |

---

## 10. Open questions needing telemetry

1. Reviewer decision mix (approve, revise, clarify, fallback) by pass role and how often a user
   answers a clarification with the obvious candidate.
2. Share of complex-write turns finishing `completed` with `outcome_status: 'unfulfilled'`.
3. Whether any production call has ever used `call_ref` or `after`; if none, remove the sidecar
   outright.
4. Fraction of `update_onto_*` batches that were contract-routed only because of
   `resolved_existing` versus genuinely ambiguous targets.
5. Prepared-prompt hit rate on the worker lane; if hits dominate, skills are effectively off today.
6. Attempt-level finish reasons and completion-token caps by provider after the truncation fix,
   to settle Decision 7.
7. Live Railway values of `AGENTIC_CHAT_WORKER_SUPERVISOR_ENABLED` and the web worker-routing
   default.
8. Whether the daily-brief chat surface sees real traffic; if so Finding 13's brief gap is
   user-visible today.

---

## 11. Implementation status (2026-09-02, same day)

DJ chose the ambitious plan: all eight §7 decisions at the recommended option. Seven parallel
lanes under strict file ownership, then integration, then the phase-reducer refactor (§5
architecture note). Everything below is UNCOMMITTED in the working tree.

| Finding                                                                                         | Status             | Where                                                                                                                                                    | Proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Truncated tool-call batch kills the turn                                                      | FIXED              | `stream-tool-calls.ts`, `provider-pass.ts`, `openrouter-client.ts`                                                                                       | tool calls with a non-tool-call finish, or arguments cut at end of input, classify `provider_tool_arguments_truncated` / `transient_infra`; one bounded retry on the next route with the pin cleared, before any text streams; the failed attempt now writes `provider_attempt_ended`. New tests: retry then success; genuinely malformed arguments still invalid.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2 Global surface cannot read documents; results advertise unmounted tools                       | FIXED              | `surfaces.ts`, `tool-payload-compaction.ts`, `feedback.ts`, `execution-adapter.ts`                                                                       | `get_document_outline` + `read_document_section` on `global_basic`; `change_chat_context` deleted end to end (catalog, worker wiring, legacy web handler, presenter, telemetry); worker strips `materialized_tools` and "Use X for…" hints; per-profile test forbids descriptions naming unmounted tools.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 3 Sanitizer mangles answers                                                                     | FIXED              | `assistant-text-sanitization.ts`                                                                                                                         | four broad patterns deleted; generic shapes need two distinct hits per sentence. Measured on the audit's six sentences: 6/6 altered → 0/6; 24-sentence sample 22 → 6 altered, all six remaining are real leaks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 4 Skills unreachable on the worker; marketing skills misfire                                    | FIXED (Decision 4) | `domain-load.ts`, `domain-sensing.ts`, `operational-skill-intent.ts`, `skill-gate-preload.ts`, `worker-turn-preparation.server.ts`, `prewarm/+server.ts` | scorer splits discriminative tokens (+50) from prose tokens (+10); gate needs an alias hit or two discriminative hits; a direct-read guard (entity noun + read verb, no craft verb) never gates. Regression: the Gmail read, the Stripe invoice search and "where are we at with this book" no longer gate; cold-email and marketing-plan asks still do. Deterministic intent → `task_management` / `document_workspace` (plan and calendar wired, fire once those tools mount) preloads at worker admission on both prepared-hit and miss branches, lane-aware (Procedure + Policy + Contract + first example, 6,000-char cap; `task_management` = 3,976 chars); dedupe via `skill_preloaded_id` on the user message inside the history window; write rules keyed on intent not tool presence; worker-aware write rule; one clarification sentence; proposal brief on the worker branch; `task_management` step 7 rewritten. |
| 5 Reviewer 0% cache; whole message list as evidence                                             | FIXED              | `review/controls.ts`, `turn-contract.ts`, `mutation-batch.ts`, `decision-completion.ts`, `bootstrap.ts`, `openrouter-client.ts`                          | approval tools static (SHA validated in code, fail closed); reviewer system prompt byte-identical across reviews; evidence = user messages + tool calls/results + loaded-context sections only (user message 38.9k → 26.5k chars); reviewer route OpenAI before Azure, 45 s timeout, startup throws if the reviewer would be an acting model; constant `prompt_cache_key` for reviewer passes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 6 Catalog-name call kills the turn                                                              | FIXED              | `repair-policy.ts`, `turn-provider.ts`                                                                                                                   | names that exist in the admitted tools or worker catalog get a one-shot surface repair for the current phase; unknown names still fail closed; prose on a required gate pass goes to forced synthesis instead of throwing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 7 Direct lane too narrow                                                                        | FIXED (Decision 3) | `write-routing.ts`, `mutationToolCatalog.ts`, `turn-provider.ts`                                                                                         | `resolved_existing` ops go direct (≤3, no sidecars) only when every target id is the focus entity/project, appears in the user message, or is the single hit of a same-turn read of that kind. Three-candidate restraint case still routes to the contract lane (test). Description overrides say so on all nine `resolved_existing` tools.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 8 Control rounds count as read rounds                                                           | FIXED              | `tool-classification.ts`, `round-analysis.ts`, `turn-provider.ts`                                                                                        | `CONTROL_TOOL_NAMES`; control-only rounds classify `control`; ladder count not incremented; count and rank reset on a mutation round.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 9 Sidecars on every tool; override on every pass; 14-line reviewer guidance in the actor prompt | FIXED              | `tool-surface.ts`, `contract-execution.ts`, `review/controls.ts`, `disposition.ts`                                                                       | sidecars only on carve-out/completion surfaces (batching instruction only there); override only for genuine gaps; 5-line `ACTOR_COMMISSION_GUIDANCE` in the actor prompt (routing message 4,677 → 2,317 chars). `project_write_document` opening pass 23,242 → 16,149 bytes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 10 Static prompt contradictions                                                                 | FIXED              | `build-lite-prompt.ts`, `situational-rules.ts`                                                                                                           | write-before-finish bullet gone outside living workspace; receipts one sentence; lead-in bullets and skill pointers only when skills are loadable; preamble reworded; capability/dump-metadata lines deleted; Current Tool Surface prose section deleted. Project prompt fixture 17,583 → 14,222 chars.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 11 Replay growth                                                                                | REVERTED 09-03     | `request-builders.ts`                                                                                                                                    | older consumed tool results replaced by ≤200-char stubs that keep `tool_call_id`, status and `{id, kind, title}` entities; memo-served repeats return a stub; controls never stubbed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 12 Partial fulfilment undisclosed                                                               | FIXED              | `turn-executor.ts`, `terminalTextIntegrity.ts`, `finalization-guard.ts`, `repair-instructions.ts`                                                        | unfulfilled outcomes with `missingTargetIds` reach the terminal text floors; a "Done: 2 of 6 moves. Not yet moved: …" line is appended when the prose omits it; `finishedReason: mutation_unfulfilled`, status stays `completed`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 13 Global preload renders counts; daily brief unrendered                                        | FIXED              | `context-loader.ts`, `build-lite-prompt.ts`, `worker-turn-preparation.server.ts`                                                                         | eight bundles render state, next step, top goal, open/overdue/in-progress/blocked/done task counts (one TS query, no RPC change); paused labelled; non-paused count shown; `daily_brief` section (summary, priority actions, per-project excerpts fenced as untrusted, entity ids); proposal brief on the worker branch. Global fixture 13,546 → 11,336 chars while rendering more.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 14 Budgets                                                                                      | FIXED              | `turn-executor.ts`, `openrouter-client.ts`, migration `20260902150000`                                                                                   | per-attempt timeout = min(90 s, remaining budget − 5 s); budget expiry after ≥1 durable write finalizes `completed` + `mutation_unfulfilled` with disclosure, timing and done events (zero-write expiry stays `failed`); recovery RPC backoff for `provider_throttle`/`timeout_pre_start` becomes 5·2^n s (≤60 s) + ≤5 s jitter. **Migration must be applied to prod BEFORE the worker deploy; verified by byte-exact needle match only (no local Postgres).**                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 15 delegate_task 60% failure                                                                    | STALE + hardened   | `delegateTaskMutationAdapter.ts`, `turn-executor.ts`                                                                                                     | all six failures were one turn on 08-30 before migration `20260830195800` (enum cast); 4/4 succeeded since. Residual fixed: Postgres contract errors (SQLSTATE 42\*, PGRST2xx) return `delegate_task_backend_contract_mismatch` as non-retryable; executor caps a tool after a `_contract_mismatch` failure and identical-argument retries after any permanent failure; mutation rows now record `execution_time_ms` (ratified parity divergence).                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Verification at integration (before the refactor): worker 1,627 tests / typecheck / lint clean;
runtime 340 / typecheck / build clean; shared-types typecheck clean; docs health clean.

Web: 4,280 tests / `svelte-check` clean after all lanes integrated.

**Refactor (WP-14, §5 architecture note), landed the same evening.** Roughly +1,100 / −5,200
lines on the worker and runtime, verified against the provider and executor suites after every
step (final: worker 1,611 tests, 34 supervisor/synthesize tests deleted, 18 reducer tests added).

- The single-read `synthesize` bridge is gone (port, provider path, four executor branches).
- The supervisor is gone (Decision 5): four worker modules, the flag, the `supervisorFactory`
  port, the checkpoint persist/waiting-state plumbing, the `supervisor_question` /
  `supervisor_evaluation` / `pre_execution_tool_failure` step kinds and `supervisor_block` failure
  kind. `finalization-guard.ts` moved to the runtime `loop/` directory. The runtime's
  `deterministic-supervisor`, `digest`, `entity-index`, `status-messages` modules stay only because
  seven web files still import them for the legacy orchestrator; retiring those is a web follow-up.
  `resumeCheckpoint` stays in the artifact contract as deprecated because the web still produces it.
- `streamInitial` and `streamContinuation` are one `streamActingPass` parameterised by phase.
- `provider/turn-phase.ts`: a 13-phase `TurnPhase` union, a pure `nextTurnPhase(phase, event)`
  reducer and one `surfaceFor(phase, admitted)`; five closure flags became the phase value and the
  seven surface builders read from it. "Work tool on a reduced surface" is now a repair transition.
- `executorEffects.ts` fronts the twelve never-fatal side-effect ports with one policy.
- Not done: a dedicated durable step kind for control decisions (would change the persisted step
  sequence and event order the web reads; needs a coordinated web change).
- Behaviour differences outside test coverage, reported by the refactor: on the opening pass a
  `done` event with both an invalid usage payload and a contradicting finish reason now reports the
  finish-reason error; after a typed contract correction followed by `cancel_turn_contract` a later
  complex proposal no longer re-enters the gate (that control has zero production calls); a
  throwing error reporter on prompt-snapshot/research/stated-future capture is swallowed.
- Web follow-ups filed in the session log: retire the web `turn-supervisor/` shims; the
  `safety.supervisor_question_repeated_validation` eval scenario can no longer pass on the worker
  lane; the runtime parity registry still carries two supervisor goldens for the web.

**Not done, deliberately:** `plan_management`/`calendar_management` preloads wait for their tools to
be worker-executable; `execution_time_ms` on failed mutation rows needs an RPC parameter; a
first-class `skillPreload` field on the domain-metadata snapshot (shared-types) and a worker
observation for `skill_preloaded_id` are filed as follow-ups in the session's cross-request log.

**Deploy order:** apply `supabase/migrations/20260902150000_agentic_chat_recovery_throttle_backoff_seconds.sql`
to production, then deploy the worker and web together (the surface, sanitizer and reviewer-schema
changes are shared through `@buildos/agentic-chat-runtime`).

---

## Appendix: evidence

- Lane reports: `agentic-chat-turn-executor-audit-2026-09-02/lane-{A-prompts,B-context,C-tools,D-skills,E-harness}.md`.
- Production pull scripts and notes: `agentic-chat-turn-executor-audit-2026-09-02/evidence/`.
  They read `apps/web/.env` at run time and issue only `select` queries.
- Sanitizer measurement: `evidence/sanitize-check.mjs` against
  `packages/agentic-chat-runtime/dist/loop/index.js`.

## Addendum 2026-09-03: Finding 11 reverted

The replay stubs shipped under Finding 11 removed evidence the final answer needed. The Cedar House browser battery (2026-09-03, `artifacts/agentic-chat-audit-2026-09-03.md`) showed the worker reading the correct document sections, then denying they existed and inventing quotations: every prior tool result over 400 characters had been replaced by an id-only stub on the next continuation, and identical rereads served from the turn memo were stubbed too. The deterministic reproduction is `artifacts/agentic-chat-evidence-retention-probe-2026-09-03.ts`.

`supersedeConsumedToolResults` and the memo-stub builder were deleted from `request-builders.ts`; every earlier tool result now stays in the request at full length, and memo-served repeats replay the full cached payload with the repeat notice. The worker test "stubs consumed tool results from older rounds" became "keeps every consumed tool result body in later rounds", and a Cedar House regression test asserts exact quotes survive unrelated reads, a memo repeat, and the final pass. Tier 4 replay growth is open again; any future compaction must be budget-gated and must never apply to the pass that feeds the final response.
