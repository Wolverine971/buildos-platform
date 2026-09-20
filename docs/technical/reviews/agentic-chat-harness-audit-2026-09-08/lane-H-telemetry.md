<!-- docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/lane-H-telemetry.md -->

<!-- doc-status: point-in-time -->

# Lane H — Production telemetry since the one-engine deploy

Window: `2026-09-04T17:14:00Z` (worker `/health` confirmed release `6d787284c`) to
`2026-09-09T02:26Z` (pull time). Read-only service-role `select`s over `chat_turn_runs`,
`llm_usage_logs`, `chat_tool_executions`, `chat_turn_events`, `chat_prompt_snapshots`,
`agentic_chat_execution_observations`, `chat_messages` (metadata + length only), `queue_jobs`.

Evidence (this directory's `evidence/`): `health-2026-09-08.json` (committed `pnpm agentic:health`
output), `pull-h-raw.mjs` (raw pull to the session scratchpad; never committed), `analyze-h.mjs`,
`lane-h-summary.json` (all aggregates below), `lane-h-turns.json` (55 anonymized per-turn rows,
8-char ids, no message text). Baseline for comparison: the 09-02 audit §2 and
`agentic-chat-turn-executor-audit-2026-09-02/evidence/evidence-notes.md`.

## 0. Read this first: the window is not organic traffic

| Cohort                          | Turns | How identified                                                                                  | Code deployed during the run                         |
| ------------------------------- | ----: | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Battery A, 09-04 17:16–17:29Z   |    17 | ids in `artifacts/agentic-chat-postdeploy-6d787284c-runs.json`                                  | `6d787284c` (one-engine merge)                       |
| Battery B, 09-04 20:41–20:51Z   |    14 | same 13 scenario prompts replayed, new project tag                                              | `de43925ca` remediation (committed 18:27Z)           |
| Battery C, 09-05 00:36–00:52Z   |    12 | same scenarios, "failed retest" tag                                                             | `ef4ad9a10` (23:55Z) — the reviewer-label regression |
| Book QA, 09-05 18:17–18:28Z     |     7 | QA project `e256363c`, session `913bcb29` (artifact `agentic-chat-book-qa-fixes-2026-09-05.md`) | `c2b5f442a` fix (03:25Z)                             |
| Research QA, 09-08 19:26–19:28Z |     2 | session `ea16b253` (artifact `agentic-chat-research-postdeploy-2026-09-08.md`)                  | `6db131447`                                          |
| **Organic DJ**                  | **3** | everything else: 09-07 15:56Z project create, 09-07 20:08Z document turn, 09-08 19:16Z retry    | `63d87c2c9` / `6db131447`                            |

All 55 turns belong to one user id (DJ's; matched by email in code, not printed). The e2e-harness
account produced zero turns in the window. Every turn ran `worker_realtime` (legacy share 0/55,
target met). The "seven-day proof" window in tasker/80 WP-1 is 4.4 days old and contains three
organic turns, so nothing below is a statistical claim about users; it is a claim about what the
harness did on 52 scripted turns plus three real ones. The same 13 prompts ran three times under
three code versions, which is the most useful thing in the window (§9).

## 1. Turns by cohort, context, status, failure code

Status: 48 completed, 5 failed, 2 cancelled. Context: project 37, global 15, project_create 3.
Source: `live_ui` 55/55.

| Failure code                                | n   | Turn               | Cohort      | Passes | Calls |      Wall | What happened                                                                                                                                                                                   | Status in working tree                                                                                                                                                                                        |
| ------------------------------------------- | --- | ------------------ | ----------- | -----: | ----: | --------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider_tool_validation_repair_exhausted` | 1   | 0d8019ca           | Battery A   |      4 |     5 |     60.4s | DST read-only question; model called `request_turn_clarification` 3× and the validator rejected each for not repeating candidate labels verbatim                                                | Fixed: validator relaxed, `packages/agentic-chat-runtime/src/loop/turn-contract.ts:956-961`                                                                                                                   |
| `provider_forced_synthesis_failed`          | 2   | 9a31d293, 65307e1e | Battery C   |   2, 3 |  3, 4 |  31s, 47s | 2 and 3 `create_onto_task` **succeeded**, then the tool-free synthesis pass on Alibaba emitted tool calls twice (`provider_tool_call_disabled`); user saw an error for a turn that had written  | Receipt fallback added: `apps/worker/src/workers/agentic-chat/provider/turn-provider.ts:1838-1849` renders the write ledger instead of failing; root cause (endpoint ignores `tool_choice=none`) still exists |
| `read_tool_egress_blocked_private_content`  | 1   | bfa823cd           | **Organic** |      3 |     3 |     18.6s | DJ's meeting-notes turn: two workspace reads then a `web_search` announcement blocked by the post-read egress rule (artifact `agentic-chat-meeting-notes-177eaae4-investigation-2026-09-07.md`) | Fixed and deployed 09-08 per research artifact                                                                                                                                                                |
| `provider_tool_feedback_kind_mismatch`      | 1   | 35f3e826           | Research QA |      2 |     4 |     17.0s | denied `web_visit` feedback crashed provider continuation                                                                                                                                       | Fixed in working tree (`provider/feedback.ts`, uncommitted), not deployed                                                                                                                                     |
| `cancelled`                                 | 2   | 3e8002a4, a2dcf99c | Book QA     |   5, 5 |  6, 7 | 150s, 80s | User cancelled. 3e8002a4 had already created a project, 5 goals and 6 tasks (15 tool executions) when cancelled at 149.7s                                                                       | UX: no visible progress for a turn that was succeeding                                                                                                                                                        |

Failure rate 5/55 (9%) vs the 09-02 worker slice 34/261 (13%) and DJ's 7/31 (23%). None of the
09-02 failure classes (`provider_tool_finish_reason_invalid`, `provider_tool_not_allowlisted`,
`internal_cohort_rejected`, `provider_round_budget_exceeded`) recurred. Every failure in the window
is a class first seen in the window, and every one has a fix in the tree; two of the five fixes are
not yet deployed.

## 2. Per-turn shape by class (completed turns; p50 / p90 / max)

Class is inferred from tool rows: a successful `ontology_action` with a reviewer pass or a
`declare_turn_contract` is a contract write; without either, a direct write; a successful
`request_turn_clarification` with no write is a clarification; `web_*` only is research; else read-only.

| Class          |   n | Model calls | Reviewer calls | Control execs | Tool rounds | Tool execs  | Pass-1 prompt tok     | Total prompt tok         | Cached | Completion tok | Cost USD                 | Wall s               | First response s |
| -------------- | --: | ----------- | -------------- | ------------- | ----------- | ----------- | --------------------- | ------------------------ | -----: | -------------- | ------------------------ | -------------------- | ---------------- |
| read_only      |  17 | 4 / 7 / 8   | 0              | 0             | 3 / 5 / 5   | 5 / 13 / 14 | 13.8k / 15.4k         | 61.8k / 127.7k / 143.3k  |  46.5% | 1.5k / 3.0k    | 0.0050 / 0.0099 / 0.0145 | 26.2 / 68.0 / 80.1   | 8.2 / 25.7       |
| direct_write   |   6 | 2 / 4 / 4   | 0              | 0             | 1 / 2 / 2   | 1 / 2 / 2   | 15.2k / 16.0k         | 21.9k / 38.9k            |  23.2% | 1.0k / 1.3k    | 0.0025 / 0.0043          | 18.0 / 25.5          | 14.8 / 18.7      |
| contract_write |  13 | 7 / 11 / 12 | 2 / 2 / 3      | 3 / 4 / 5     | 5 / 7 / 9   | 6 / 9 / 10  | 14.8k / 15.8k         | 105.6k / 152.5k / 206.6k |  41.8% | 3.2k / 7.4k    | 0.0137 / 0.0165 / 0.0223 | 83.2 / 118.8 / 120   | 64.2 / 92.7      |
| clarification  |  11 | 7 / 9 / 9   | 1 / 3 / 3      | 3 / 4 / 4     | 3 / 6 / 6   | 3 / 6 / 6   | 14.5k / 15.3k         | 75.0k / 99.1k / 104.8k   |  28.2% | 2.8k / 4.7k    | 0.0117 / 0.0138 / 0.0152 | 55.3 / 108.8 / 172.5 | 30.3 / 98.6      |
| research       |   1 | 4           | 0              | 0             | 2           | 2           | 15.1k                 | 52.5k                    |  60.5% | 1.4k           | 0.0041                   | 28.8                 | 27.8             |
| **all**        |  48 | 5 / 9 / 12  | 0 / 2 / 3      | 1 / 4 / 5     | 3 / 6 / 9   | 4 / 9 / 14  | 14.7k / 15.6k / 16.4k | 67.3k / 132.3k / 206.6k  |  39.5% | 2.1k / 5.3k    | 0.0064 / 0.0156 / 0.0223 | 45.1 / 99.1 / 172.5  | 18.7 / 91.0      |

Reviewer cost share within contract writes: 33.5%; within clarifications: 34.1%.

Read of the table: a direct write is 2 calls, 18 s, $0.0025. The same edit routed through the
contract lane is 7 calls, 83 s, $0.0137 — 5.5× the cost, 4.6× the wall time, and the user sees
nothing for 64 s (p50 first response). Asking a clarifying question costs more than a direct write
(7 calls, 55 s, $0.0117) because it carries a contract declaration, a reviewer pass, and a forced
tool-free synthesis pass (§6).

Where the seconds go (48 completed turns, `timing` event + `llm_usage_logs.response_time_ms` +
`tool_execution_ended.duration_ms`):

| Component                                 | Share of wall |        p50 |        p90 |
| ----------------------------------------- | ------------: | ---------: | ---------: |
| Acting model generation                   |         68.9% |     28.7 s |     81.7 s |
| Reviewer generation                       |         13.9% |        0 s |     24.4 s |
| Tool execution                            |          5.9% |      2.4 s |      7.3 s |
| Queue wait + worker start                 |          1.7% |      0.8 s |      1.2 s |
| Provider finish → terminal                |          1.1% |      0.5 s |      0.8 s |
| Everything else (fences, validation, I/O) |          8.5% |      4.0 s |      7.8 s |
| **Total request**                         |               | **45.1 s** | **99.1 s** |

The harness overhead is ~0.8 s per model call. Latency is pass count × per-call generation time,
not framework time. Acting per-call p50 6.1 s (Alibaba 5.3 s, NextBit 7.8 s, DeepInfra 5.3 s,
**Azure 21.5 s**), reviewer per-call p50 10.3 s.

By cohort (turns / completed / failed / cancelled; completed wall p50 / p90; cost p50):
Battery A 17/16/1/0, 45.1 s / 91.6 s, $0.0064. Battery B 14/14/0/0, 40.8 s / 93.5 s, $0.0061.
Battery C 12/10/2/0, 45.3 s / 172.5 s, $0.0063. Book QA 7/5/0/2, 90.2 s / 118.8 s, $0.0131.
Organic 3/2/1/0, 52.4 s, $0.0054. Total spend in window: $0.446 (55 turns).

## 3. Reviewer (GPT-5.6-luna on OpenAI, `routeId = openrouter_semantic_reviewer`)

| Measure                       | Window                                                                                                                                                              | 09-02 baseline (post 08-28)          | WP-1 target     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------- |
| Calls / turns with reviewer   | 43 / 26 (40 `contract_review`, 3 `research_review`)                                                                                                                 | 20 calls on 8/49 turns               | —               |
| Calls per reviewed turn       | 1: 13 turns, 2: 9, 3: 4                                                                                                                                             |                                      |                 |
| Prompt tokens per call        | p50 8,673 / p90 11,314 / max 14,327                                                                                                                                 | avg 9,500                            |                 |
| Cached tokens per call        | p50 2,767 / max 3,491 (23.3% of prompt tokens; 65% of calls have any hit; hit calls cache 32% p50)                                                                  | 0%                                   | > 50% of tokens |
| Completion + reasoning tokens | p50 738 + 372; max 2,270                                                                                                                                            |                                      |                 |
| Latency                       | p50 9.5 s / p90 17.3 s / max 23.9 s                                                                                                                                 | OpenAI p50 3.6 s; Azure tail 63–73 s | p90 < 30 s      |
| Cost                          | $0.114 of $0.446 = **25.7%** (input $0.071, output $0.043)                                                                                                          | 24%                                  | falling         |
| Cost per call                 | p50 $0.0029                                                                                                                                                         |                                      |                 |
| Decisions returned            | 14 `approve_turn_contract_review`, 16 `request_proposal_revision`, 4 reviewer-authored clarifications, 5 invalid/unbound → harness fallback, 1 cancelled mid-review |                                      |                 |

Cache: the reviewer prefix is now keyed constant (`openrouter-client.ts:1083-1090`), and 65% of
calls get a hit, but the hit is capped at ~3.5k tokens — the shared system-prompt-plus-tools prefix.
The other ~5–11k tokens per call are the acting transcript, which cannot cache. The >50% target is
unreachable by cache keying alone; it needs a smaller per-call payload.

Latency: 9.5 s p50 is 2.6× the 09-02 OpenAI figure. Latency tracks output length (2.0 s at 88
completion tokens, 20 s at 1,768): revisions carry a full `corrected_contract`. p90 17.3 s meets the
< 30 s target; the Azure tail is gone (0 Azure reviewer calls).

Revision reasons (16, all in `lane-h-summary.json` `recovery`): every one is "the proposal omits
the user-supplied values" — due dates, priorities, estimates, content postconditions, exclusions,
`calendar_sync`. The acting model declares thin contracts (target + action); the reviewer demands the
whole commission re-encoded as `required_fields`/`changes`. That is the contract DSL doing what it
was designed to do, and it costs a round trip (acting re-declare + reviewer) of ~20–30 s and ~$0.006
each time.

## 4. Prompt snapshots (52 of 55 turns; the 3 `project_create` turns persisted no snapshot)

| Surface (n)  | System prompt chars p50 / p90 | Tools mounted | Tool schema chars p50 | Message chars p50 | Snapshot `approx_prompt_tokens` p50 | Admission `context_usage.estimatedTokens` p50 (budget 15,000) | **Billed pass-1 prompt tokens p50 / max** | Tool schemas' share of pass-1 |
| ------------ | ----------------------------- | ------------- | --------------------- | ----------------- | ----------------------------------- | ------------------------------------------------------------- | ----------------------------------------- | ----------------------------- |
| global (15)  | 14,484 / 19,235               | 28–29         | 31,628                | 21,309            | 5,330                               | 4,572                                                         | **13,434 / 14,934**                       | 58%                           |
| project (37) | 13,718 / 18,108               | 35–36         | 37,703                | 20,632            | 5,159                               | 4,505                                                         | **14,844 / 16,408**                       | 64%                           |

Versus 09-02 §2.6: global was 8 tools / 9,297 chars and ~3,250 pass-1 tokens; project was 17–18
tools / 23.2–25.4k chars and 5,850–9,170 pass-1 tokens. The system prompt shrank on project (16.5–
23.5k → 13.7k) and grew on global (12.4k → 14.5k). The tool schema block grew 3.4× on global and
1.5× on project, so pass-1 prompt tokens went up 4.1× (global) and 1.6–2.5× (project). Both
estimators ignore the tool schemas and under-report the billed prompt by 2.6–2.8× (ratio p50; min
2.44, max 3.39), so the 15,000-token admission budget reads "38% used" on a prompt the provider bills
at ~99% of that budget.

System-prompt sections (chars, p50 / max) — the persisted `prompt_sections.sections` array:

| Section                   | global p50 / max  | project p50 / max | 09-02 project (single snapshot) |
| ------------------------- | ----------------- | ----------------- | ------------------------------- |
| identity_mission          | 482               | 482               | 602                             |
| capabilities_skills_tools | 289               | 289               | 1,035                           |
| operating_strategy        | 378               | 378               | 653                             |
| final_response_contract   | 617 / 1,160       | 617 / 1,160       | 1,330                           |
| safety_data_rules         | 1,701             | 1,701             | 1,611                           |
| situational_rules         | 2,493 / 6,883     | 2,493 / **8,877** | 808 (+6,227 domain signals)     |
| project_start_here        | —                 | 1,600 / 1,716     | 3,147                           |
| focus_purpose             | 646               | 637 / 1,389       | 760                             |
| location_loaded_context   | **7,496** / 7,679 | 3,768 / 4,735     | 4,127                           |
| project_knowledge_map     | —                 | 732 / 1,070       | 682                             |

The static prefix (first five sections) is 3,467 chars ≈ 870 tokens, down from 5,231. The preloaded
skill body is inlined into `situational_rules` (up to 8.9k chars ≈ 2.2k tokens when it fires). The
global workspace overview (`location_loaded_context`, 7.5k chars) is now the largest section on
global. Runtime system messages inserted after history, by frequency: "Worker write routing:
classify a commission…" 30/52, "Worker write routing: the large complex-…" 22/52, "Previously
loaded skills in this session" 32/52, "Conversation continuity hint" 22/52, compressed memory 12,
pending clarification 8, interrupted-turn tool receipts 4, `<pending_turn_contract>` 4.

Tools mounted but never called in the window: global 12 of 30 (12,947 of 34,329 schema chars =
38%); project 17 of 37 (16,664 of 40,397 = 41%). The unused set is the calendar write/read quartet
(`update_calendar_event` 1,827, `create_calendar_event` 1,487, `delete_calendar_event` 1,155,
`get_calendar_event_details` 986), `delegate_task` 1,805, `move_onto_task` 1,299, the email trio
(`search_email_messages` 1,163, `request_email_account_connection` 743, `get_email_message` 580),
`explore_project` 1,070, `link_onto_entities` 1,506, `list_onto_documents` 814, `set_project_calendar`
761, `cancel_turn_contract` 420, `get_workspace_overview` 412, `get_onto_project_details` 380,
`get_project_calendar` 256. Distinct tools actually called: global 15, project 18, project_create 6.

## 5. Tool usage (246 executions)

| Tool                                                        | Category           |      n | Fail | ms p50 / p90  | Failure reasons                                                                                                                                                                                                                                   |
| ----------------------------------------------------------- | ------------------ | -----: | ---: | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| read_document_section                                       | read               |     35 |    2 | 280 / 313     | missing required `anchor` ×2                                                                                                                                                                                                                      |
| declare_turn_contract                                       | control            |     34 |   10 | 0 / 1         | contract schema: `required_fields` names a non-effect field (project_id ×3, estimated_minutes), document update names no changed field ×2, label-only-on-create, min effects vs labelled create, src_label kind, project outcome must omit fields |
| create_onto_task                                            | ontology_action    |     21 |    0 | 1,242 / 1,588 |                                                                                                                                                                                                                                                   |
| get_document_outline                                        | read               |     17 |    0 | 298 / 369     |                                                                                                                                                                                                                                                   |
| request_proposal_revision                                   | control (reviewer) |     16 |    0 | 0 / 1         |                                                                                                                                                                                                                                                   |
| get_onto_task_details                                       | read               |     16 |    0 | 395 / 567     |                                                                                                                                                                                                                                                   |
| request_turn_clarification                                  | control            |     15 |    4 | 0 / 1         | question did not repeat candidate labels verbatim ×4 (validator since removed)                                                                                                                                                                    |
| approve_turn_contract_review                                | control (reviewer) |     14 |    0 | 0 / 1         |                                                                                                                                                                                                                                                   |
| create_onto_goal                                            | ontology_action    |     10 |    0 | 1,088 / 1,487 |                                                                                                                                                                                                                                                   |
| list_calendar_events                                        | read               |      8 |    0 | 865 / 920     | **0 recorded failures; every call returned `events: []` with a warning that all connected sources failed** (`provider_error`, `credentials_not_configured`, `credentials_unreadable`, `source_not_readable`)                                      |
| create_onto_document                                        | ontology_action    |      8 |    0 | 1,956 / 2,229 |                                                                                                                                                                                                                                                   |
| list_onto_tasks                                             | search             |      8 |    0 | 195 / 329     |                                                                                                                                                                                                                                                   |
| get_document_tree                                           | read               |      7 |    0 | 320 / 367     |                                                                                                                                                                                                                                                   |
| get_project_overview                                        | read               |      6 |    0 | 478 / 661     |                                                                                                                                                                                                                                                   |
| create_onto_project                                         | ontology_action    |      5 |    0 | 2,024 / 2,679 |                                                                                                                                                                                                                                                   |
| search_all_projects                                         | search             |      5 |    0 | 924 / 5,262   |                                                                                                                                                                                                                                                   |
| get_external_account_status                                 | read               |      3 |    0 | 184 / 212     | called 3× in one turn                                                                                                                                                                                                                             |
| update_onto_task                                            | ontology_action    |      3 |    0 | 1,359 / 1,802 |                                                                                                                                                                                                                                                   |
| get_onto_document_details                                   | read               |      3 |    0 | 340 / 518     |                                                                                                                                                                                                                                                   |
| web_search                                                  | search             |      3 |    0 | 4,611 / 5,852 |                                                                                                                                                                                                                                                   |
| list_email_accounts                                         | read               |      2 |    0 | 362           |                                                                                                                                                                                                                                                   |
| update_onto_document                                        | ontology_action    |      2 |    0 | 1,414         |                                                                                                                                                                                                                                                   |
| web_visit                                                   | —                  |      2 |    1 | 178           | egress provenance required (denied visit; the turn then crashed, §1)                                                                                                                                                                              |
| search_onto_projects, search_project, move_document_in_tree |                    | 1 each |    0 |               |                                                                                                                                                                                                                                                   |

Totals: control 79 (32.1% of executions; 09-02 post-ship 22.3%), reviewer decisions 30, writes 50,
reads 117. Three `tool_call` events have no `tool_result` (the blocked `web_search` announcements in
bfa823cd). `memo_served=true` on 1 of 249 tool observations — the read memo almost never hits.
`replayed` is present on all 50 mutation observations (all `false`). Never called, as in 09-02:
`change_chat_context` (no longer mounted), `cancel_turn_contract`, `delegate_task`,
`approve_mutation_batch_review` (0 — the batch-review control did not fire once in 13 contract writes).

Repeated calls to a tool that cannot succeed: dfc7fa13 called `list_calendar_events` 5× with varied
arguments (each returned success + "no calendar data was read"); 89797082 called
`get_external_account_status` 3× and `list_calendar_events` 2×. Because the tool reports
`success: true`, neither the read-loop ladder nor `chat_tool_executions.success` sees a failure, and
the model keeps trying.

## 6. Repair and recovery events

| Event                                                           |            Count | Turns | Notes                                                                                                                                                 |
| --------------------------------------------------------------- | ---------------: | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider attempts                                               |              287 |    55 |                                                                                                                                                       |
| Provider attempt failures                                       |               31 |    26 | 27 acting, 1 repair, 3 final_response                                                                                                                 |
| — `404 No endpoints found` after a **pinned Alibaba** success   |               19 |    19 | every one on the first attempt of a later round; the retry landed on NextBit 17, Azure 4, Phala 2, StreamLake 1, Alibaba 5 (across all failure kinds) |
| — `429` after a pinned DeepInfra success                        |                7 |     7 |                                                                                                                                                       |
| — `429` other, 90 s timeout                                     |                3 |       |                                                                                                                                                       |
| — `provider_tool_call_disabled` (tool call in a tool-free pass) |                2 |     2 | both fatal in the window (§1); receipt fallback now covers them                                                                                       |
| Retry attempts / outcomes                                       |               29 |    24 | 29/29 succeeded (27 `tool_calls`, 2 `stop`)                                                                                                           |
| Truncation retries (`provider_tool_arguments_truncated`)        |                0 |     0 | the 09-02 P0 class did not recur; retry path untested in production                                                                                   |
| Repair passes (`passRole = repair`)                             |               16 |    13 | all on the acting route; 14 follow a control validation failure, 2 follow `read_document_section` missing `anchor`                                    |
| Control validation failures                                     |               14 |    11 | `declare_turn_contract` 10, `request_turn_clarification` 4                                                                                            |
| Surface repairs (explicit `surface_repair`)                     |                0 |     0 | none; also 0 inferred (health report)                                                                                                                 |
| Reviewer revisions / approvals / batch approvals                |      16 / 14 / 0 |       |                                                                                                                                                       |
| Reviewer calls with no accepted decision                        |               10 |    10 | 5 became `harness_review_fallback` clarifications, 2 `harness_candidate_gate`, 2 reviewer-authored clarifications, 1 cancelled                        |
| Forced tool-free synthesis passes (`final_response`)            |               23 |    20 | 12 after a clarification, 10 after a direct write, 1 read-only                                                                                        |
| Read-loop ladder `must_synthesize` stops                        |               ≤1 |       | only the single read-only `final_response` pass can be a ladder stop; the ladder is otherwise invisible in telemetry                                  |
| Clarification controls                                          | 11 ok / 4 failed |    12 |                                                                                                                                                       |
| `context_shift` events                                          |                5 |     5 |                                                                                                                                                       |
| `mutation_unfulfilled` terminals                                |                2 |     2 | f9640b74, 258954cd; both disclosed "Done: N of M" (health: 2/2)                                                                                       |
| Cancellations                                                   |                2 |     2 | 149.7 s and 79.7 s in                                                                                                                                 |
| 12-pass cap hits / `provider_round_budget_exceeded`             |            0 / 0 |       | max 11 passes (258954cd, 12 calls)                                                                                                                    |

Provider pin behaviour, measured from consecutive `provider_attempt_ended` observations within a
turn: Alibaba → same 63, Alibaba → 404 **19 (23%)**, Alibaba → tool_call_disabled 2; DeepInfra →
same 14, DeepInfra → 429 **7 (33%)**; NextBit → same 36, → fail 2; Azure → same 11. First-pass
provider: Alibaba 41/55, DeepInfra 11, NextBit 3 (the configured order is deepinfra, deepseek,
alibaba, cloudflare — `config.ts:35-43`; `deepseek` and `cloudflare` served zero calls; NextBit,
Phala, StreamLake and Azure — 83 of 220 successful acting calls, 38% — are not in the order at all,
which `allow_fallbacks: true` permits).

Cache consequence: acting calls that stayed on the previous call's provider cached 66.6% of prompt
tokens (131 calls); calls right after a provider switch cached 5.4% (32 calls), the same as a cold
first pass (5.2%). 26 of 55 turns switched provider at least once (21 once, 4 twice, 1 three
times). Speed consequence: Azure serves DeepSeek at 112 ms per output token vs Alibaba 8 ms; the four
turns that landed on Azure after a pin failure ran 93.5, 99.1, 108.8 and 120.0 s (f9640b74,
5792be5e, 78adb24c, 629f7353). Completed turns with at least one failed provider attempt have wall
p50 76.9 s; clean turns 27.5 s (confounded by pass count, but the switch-then-cold-cache mechanism is
direct).

Telemetry note: the 29 provider-start failures never reached generation, yet `llm_usage_logs` holds
a row for each with `costSource = catalog_estimate` (21) or `unknown` (8): 262,870 prompt tokens and
$0.0257 recorded as if billed — 7% of the window's prompt tokens and 5.8% of its spend. Every
spend figure in this report and in `agentic:health` includes that inflation.

## 7. Skill preloads (`chat_messages.metadata.skill_preloaded_id`)

24 of 55 user messages carried a preload: `task_management:operational_intent` 11,
`document_workspace:operational_intent` 8, `calendar_management:operational_intent` 3,
`cold_email_engagement_first_outreach:domain_sensing` 1, `hook_craft_short_form:domain_sensing` 1.
By turn class: 9 on contract/direct writes (task 6, document 5 counting a cancelled one), 4 on
clarifications, **6 on read-only turns** (calendar 3 — the availability reads; task 2 — the
planning-only conflict question S06; cold-email domain sensing on DJ's meeting-notes turn, the
mismatch the 09-07 investigation already recorded), 2 on research. The health report scores
preloads "pass" (11/22 writes, 0/0 F7 reads) because its F7 canary matches three fixed phrases that
never ran.

## 8. Pass counts

`llm_pass_count` is now written (0 completed turns with 0 passes; 09-02 had ~20%). Distribution:
1: 2, 2: 10, 3: 6, 4: 8, 5: 12, 6: 6, 7: 5, 8: 3, 9: 2, 11: 1. Model calls p50 5 / p90 9 / max 12.
`llm_pass_count` equals successful model calls on 51/55 turns. Turns at ≥ 8 passes are all contract
writes or reviewer-fallback clarifications (b7b715f6, 579e0c95, 259f6a28, 2785785a, d8aee58d,
258954cd), 77–119 s, $0.012–$0.022. No turn reached the 12-pass cap.

## 9. Same prompt, three code versions (13 scenarios × 2–4 runs)

Class / status / calls / wall / cost per run (A = `6d787284c`, B = `de43925ca`, C = `ef4ad9a10`):

| Scenario                              | Run A                                                            | Run B                                         | Run C                                                                          | Verdict                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| S01 project create, general chat      | clarification (reviewer fallback) 7 / 55 s / $0.014              | contract_write 4 / 31 s / $0.006              | contract_write 7 / 120 s / $0.015 (1 failed declare, Azure)                    | works since B; C slow                                                                        |
| S02 five-task batch                   | contract_write 7 / 92 s / $0.016 (2 failed declares, 1 revision) | contract_write 5 / 76 s / $0.013 (1 revision) | clarification (candidate gate: project vs Context Document) 8 / 172 s / $0.013 | never under 75 s; C regressed                                                                |
| S03 duplicate prevention              | read_only 2 / 13 s                                               | read_only 3 / 11 s                            | —                                                                              | stable                                                                                       |
| S04 narrow task update                | contract_write 8 / 65 s / $0.016 (revision)                      | contract_write 6 / 94 s / $0.014 (Azure)      | clarification (reviewer fallback) 5 / 45 s                                     | a single-target, user-named edit went through the contract lane every time                   |
| S04b update by exact task UUID        | —                                                                | —                                             | clarification (reviewer fallback) 5 / 31 s                                     | the user supplied the id and both values and was asked which item and what value             |
| S05 ambiguous inspection (should ask) | clarification 7 / 45 s (1 validator fail)                        | clarification 7 / 99 s (Azure)                | —                                                                              | correct outcome, 7 calls to ask one question                                                 |
| S06 date-conflict planning question   | read_only 5 / 39 s                                               | read_only 5 / 41 s                            | —                                                                              | stable; task_management skill preloaded on a pure question                                   |
| S07 exact document create             | direct_write 2 / 15 s / $0.0024                                  | 2 / 15 s / $0.0024                            | 2 / 14 s / $0.0025                                                             | **the direct lane is the target shape for everything else**                                  |
| S08 selective document edit           | clarification (reviewer, "content truncated") 9 / 96 s           | contract_write 11 / 83 s (2 revisions)        | clarification (reviewer fallback) 5 / 37 s                                     | 1 success in 3; the success needed 11 calls                                                  |
| S09 hostile note store / summarize    | direct 2 / 18 s; read 4 / 24 s                                   | direct 2 / 19 s; read 4 / 26 s                | —                                                                              | stable                                                                                       |
| S10 calendar availability             | read_only 7 / 53 s                                               | read_only 5 / 42 s                            | read_only 2 / 18 s                                                             | all three returned no calendar data (sources failed); the "answer" is a disclosed non-answer |
| S11 DST draft validation              | **failed** (validator) 5 / 60 s                                  | read_only 1 / 16 s                            | —                                                                              | fixed in B                                                                                   |
| S13 fresh-chat saved facts            | read_only 4 / 30 s                                               | 3 / 20 s                                      | 3 / 19 s                                                                       | stable; always outline + 2 section reads                                                     |
| S14 grounded owner report             | read_only 6 / 50 s (11 tools)                                    | 8 / 68 s (14 tools)                           | 7 / 80 s (13 tools)                                                            | 6–8 serial `read_document_section` calls per report                                          |

Outcome class differed across runs in 4 of 13 scenarios (S01, S02, S04, S08); all four are contract-lane
writes. The read-only and direct-write scenarios were stable in class, cost and time.

## 10. The last 20 turns (newest first; labels are paraphrases, not message text)

| When (UTC)  | Turn     | Cohort      | Ctx            | Label                                                  | Outcome                                          | Passes | Tools                                                                                         | Cost    |    Wall | Clarify?       |
| ----------- | -------- | ----------- | -------------- | ------------------------------------------------------ | ------------------------------------------------ | -----: | --------------------------------------------------------------------------------------------- | ------- | ------: | -------------- |
| 09-08 19:28 | f3fb0de6 | research QA | project        | read-only public lookup of a mailing tool's free tier  | completed, cited answer                          |      3 | web_search, web_visit                                                                         | $0.0041 |  28.8 s | no             |
| 09-08 19:26 | 35f3e826 | research QA | project        | summarize open decisions from focused doc + web lookup | **failed** feedback_kind_mismatch                |      2 | web_search ×2, web_visit(denied)                                                              | $0.0034 |  17.0 s | —              |
| 09-08 19:16 | 3206de31 | **organic** | project        | "retry" of the failed 09-07 turn                       | clarification: append or replace?                |      5 | declare(fail), declare, clarification                                                         | $0.0077 |  52.4 s | yes (reviewer) |
| 09-07 20:08 | bfa823cd | **organic** | project        | use meeting-notes doc to work a client-site process    | **failed** egress blocked                        |      3 | doc details, section read, 3 blocked searches                                                 | $0.0031 |  18.6 s | —              |
| 09-07 15:56 | 8ab282a5 | **organic** | project_create | describe a new client website project                  | completed: project + 5 goals                     |      5 | declare, approve, create_project, create_goal ×5                                              | $0.0054 |  51.4 s | no             |
| 09-05 18:28 | 363b8fff | book QA     | project        | update one named task in place                         | contract_write (1 revision)                      |      7 | task details, declare, revision, approve, update_task                                         | $0.0131 |  52.7 s | no             |
| 09-05 18:26 | 258954cd | book QA     | project        | edit a chapter document in place                       | contract_write, `mutation_unfulfilled` disclosed |     11 | doc details, outline, section, declare(fail), declare, revision, approve, update_doc, outline | $0.0223 | 118.8 s | no             |
| 09-05 18:24 | d8aee58d | book QA     | project        | create a root parent doc and move a chapter under it   | contract_write                                   |      9 | tree, declare(fail), declare, revision, approve, create_doc, move                             | $0.0165 |  90.2 s | no             |
| 09-05 18:22 | 2785785a | book QA     | project        | create the chapter-1 document                          | contract_write                                   |      8 | tree, declare(fail), declare, approve, create_doc, tree                                       | $0.0121 |  91.5 s | no             |
| 09-05 18:21 | 308f3497 | book QA     | project        | create the book-bible document                         | direct_write                                     |      3 | tree, create_doc                                                                              | $0.0043 |  25.5 s | no             |
| 09-05 18:20 | a2dcf99c | book QA     | project        | create and organize four documents                     | **cancelled** at 80 s                            |      5 | tree, declare, revision ×2                                                                    | $0.0171 |  79.7 s | —              |
| 09-05 18:17 | 3e8002a4 | book QA     | project_create | create a labelled QA book project                      | **cancelled** at 150 s after 12 writes           |      5 | declare, revision, approve, create_project, goals ×5, tasks ×6                                | $0.0123 | 149.7 s | —              |
| 09-05 00:52 | 9959665d | Battery C   | global         | owner status report from saved data                    | read_only                                        |      7 | overview, tasks, outline ×2, task details, section ×7, search                                 | $0.0063 |  80.1 s | no             |
| 09-05 00:51 | dae1e6ab | Battery C   | global         | fresh-chat recall of saved project facts               | read_only                                        |      3 | overview, tasks, outline, section ×2                                                          | $0.0033 |  19.1 s | no             |
| 09-05 00:50 | aacf658a | Battery C   | project        | selective in-place edit of the brief document          | clarification (reviewer fallback)                |      5 | doc details, declare, clarification                                                           | $0.0056 |  37.1 s | yes            |
| 09-05 00:49 | 41b899e8 | Battery C   | project        | create the brief document with exact content           | direct_write                                     |      2 | create_doc                                                                                    | $0.0025 |  14.4 s | no             |
| 09-05 00:48 | f0c2b495 | Battery C   | project        | update a task identified by its exact id               | clarification (reviewer fallback)                |      4 | declare, clarification                                                                        | $0.0073 |  30.8 s | yes            |
| 09-05 00:47 | bd67667d | Battery C   | project        | change only the cabinets task's date and estimate      | clarification (reviewer fallback)                |      5 | task details, declare, clarification                                                          | $0.0066 |  45.3 s | yes            |
| 09-05 00:45 | 78adb24c | Battery C   | project        | create three task dependencies                         | clarification (reviewer fallback)                |      6 | tasks, declare(fail), declare, clarification                                                  | $0.0152 | 108.8 s | yes            |
| 09-05 00:44 | 65307e1e | Battery C   | project        | recover: create the remaining three tasks              | **failed** after 3 successful creates            |      3 | task details ×2, create_task ×3                                                               | $0.0043 |  47.3 s | —              |

No completed reply in the window matched a refusal heuristic. DJ's three organic turns: one
success (51 s, contract lane for a fresh project), one failure (fixed since), one retry that ended in
a question.

## 11. Baseline and target comparison (tasker/80 WP-1 table + 09-02 §2)

| Metric                                                  | 09-02 baseline                    | Target                                          | Window                                                                                                                   | Met?                                   |
| ------------------------------------------------------- | --------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `provider_tool_finish_reason_invalid` kills             | 3 of DJ's 31                      | 0                                               | 0                                                                                                                        | yes                                    |
| Truncation retries completed                            | n/a                               | ≥ 90%                                           | 0 retries occurred                                                                                                       | no data                                |
| `provider_tool_not_allowlisted` kills / surface repairs | 9 kills                           | 0 kills                                         | 0 kills, 0 repairs                                                                                                       | yes                                    |
| Reviewer cache / latency                                | 0%; Azure tail 63–73 s            | > 50% tokens; p90 < 30 s                        | 23.3% tokens (65% of calls hit); p50 9.5 s / p90 17.3 s                                                                  | latency yes; cache **no**              |
| Reviewer spend share                                    | 24%                               | falling                                         | 25.7%                                                                                                                    | **no** (flat)                          |
| Direct vs contract write turns                          | contract for every edit           | focused edits direct; restraint canary reviewed | 8 direct / 14 contract (36% direct); S04 single-target update contract 3/3; S04b by-UUID update contract; canary not run | partial                                |
| Control-call share                                      | 22.3%                             | reported                                        | 32.1% (79/246)                                                                                                           | up                                     |
| `mutation_unfulfilled` disclosure                       | 0 disclosed                       | every partial                                   | 2/2                                                                                                                      | yes                                    |
| Sanitizer-altered replies                               | 38/76                             | ≤ 6/76, each a real leak                        | 11/50 bytes differ; **21 characters total**, all whitespace normalization, no leak                                       | yes in substance; the metric says fail |
| Skill preloads                                          | never on prepared hits            | writes yes; 0 on F7 reads                       | 24/55 fired; 6 on read-only turns (3 calendar, 2 task, 1 domain mismatch); F7 canary 0/0                                 | partial                                |
| `delegate_task` success                                 | 4/4                               | 100%                                            | 0 calls                                                                                                                  | no data                                |
| Throttle requeue delay                                  | 60–120 s                          | 5–65 s                                          | 0 requeues (429s are absorbed by the in-pass retry; `queue_jobs.attempts = 0` on all 55)                                 | no data                                |
| Completed worker turn latency                           | p50 21 s / p90 70 s               | ≤ 21 s / < 60 s                                 | **p50 45.1 s / p90 99.1 s**                                                                                              | **no** (2.1× / 1.4×)                   |
| Completed workers with 0 LLM passes                     | ~20%                              | reported                                        | 0/48                                                                                                                     | fixed                                  |
| `internal_cohort_rejected` rows                         | hole                              | reported                                        | 0                                                                                                                        | fine                                   |
| Legacy-lane share                                       | second harness                    | 0                                               | 0/55                                                                                                                     | yes                                    |
| Model calls per turn                                    | p50 4 / p90 10 / max 19           | —                                               | p50 5 / p90 9 / max 12                                                                                                   | p90 and max down                       |
| Prompt tokens per turn                                  | p50 42.9k / p90 155.7k / max 445k | —                                               | p50 67.3k / p90 132.3k / max 206.6k                                                                                      | p50 **+57%**; tail down                |
| Pass-1 prompt tokens                                    | ~3.25k global / 5.9–9.2k project  | —                                               | 13.4k global / 14.8k project                                                                                             | **4.1× / 1.6–2.5× larger**             |
| Cost per turn                                           | p50 $0.0052 / p90 $0.021          | —                                               | p50 $0.0064 / p90 $0.0156                                                                                                | p50 +23%, p90 −26%                     |
| Acting cache share                                      | 46–48%                            | —                                               | 40.8% overall; 66.6% when the provider held, 5.4% after a switch                                                         | down                                   |
| Prepared prompt hit                                     | 34/296 hit                        | —                                               | 5/55 hit; miss reason null on all 55                                                                                     | still missing; reason not recorded     |
| `declare_turn_contract` validation failure rate         | 16% post-08-28                    | —                                               | 29% (10/34), present in every cohort incl. post-fix Book QA (3/9) and organic (1/3)                                      | worse                                  |

Caveat on latency comparability: the 09-02 sample was 70% light harness reads; this window is 60%
scripted writes. The class table in §2 is the fair comparison: read-only p50 26 s already exceeds the
21 s target on its own.

## 12. Findings (what the data shows)

Each finding names turn ids from `evidence/lane-h-turns.json`. "Fixed since" means the window
observed it and the working tree already contains the fix; those are listed so the audit does not
re-fix them and so the deploy gap is visible.

### H1 — The provider pin fails in one of four rounds and the fallback pool is unbounded (P1, bug/cost)

19 `404 No endpoints found` after Alibaba successes, 7 `429` after DeepInfra successes: 26 of 55
turns paid at least one pin failure. The pin (`openrouter-client.ts:975-996`: `order: [slug],
allow_fallbacks: false`) exists to keep the warm prefix; when it breaks, `observeTurnRouteFailure`
releases it and the next request goes out with the default routing, whose `allow_fallbacks: true`
(`config.ts:40-43`) lets OpenRouter land on any endpoint. Result: NextBit/Azure/Phala/StreamLake
served 38% of acting calls; cache after a switch 5.4% vs 66.6%; Azure at 112 ms/output-token put
four turns at 93–120 s (f9640b74, 5792be5e, 78adb24c, 629f7353). Each failure also costs a wasted
round trip (~200 ms) and a phantom `llm_usage_logs` row. Cheap-model impact: the acting model's
per-pass latency and its cached prefix are decided by which endpoint won the retry; on Azure it
thinks 4× slower and re-reads a cold 14k-token prompt. Fix: `ignore` the endpoints that are not in
DJ's order (or `only` them per model), and treat the pinned-endpoint 404 as "release the pin and
retry on the configured order" rather than "retry anywhere". Risk: availability drops if the
configured four are all rate-limited; guard with the existing 429 requeue. Turn ids: 069c45f4,
89797082, 0d8019ca, c4cb3552, 8a2fcdd3, 579e0c95, 0d86e1cf, 259f6a28, f9640b74, a7e21a65, 78adb24c,
629f7353, f0c2b495, a2dcf99c, 2785785a, d8aee58d, 258954cd, 363b8fff, 3206de31 (404s);
b7b715f6, 487cfd9c, 5792be5e, ab4e567e, 308f3497 (429s).

### H2 — The contract lane costs 5.5× a direct write and the acting model fails its DSL 29% of the time (P1, overengineering/prompt)

Contract writes: 7 calls, 83 s, $0.0137, 64 s to first visible response (13 turns). Direct writes:
2 calls, 18 s, $0.0025 (6 turns, all stable across three runs). `declare_turn_contract` failed schema
validation 10/34 (every failure a DSL-shape rule from `contract-fields.ts:33-40` and
`turn-contract.ts:608-639`), and 16 of 30 reviewer decisions were revisions saying the declaration
omitted values the user had supplied. A single-target edit the user named (S04) went through the lane
in 3/3 runs; an edit the user identified by UUID (S04b, f0c2b495) did too. Cheap-model impact: the
model must translate a plain request into `outcomes[].required_fields/changes/labels` with a dozen
rejection rules, then satisfy a stronger model's review of that translation; it spends 1–3 extra
passes and ~40k prompt tokens per write learning the DSL by rejection. Fix: widen the direct lane to
any write whose target is resolved (id or unique title hit) and whose values are in the message —
the reviewer then reviews the _tool call_, not a re-encoding of it. Keep the contract for
multi-entity/organize. Risk: the restraint canary (three plausible email tasks) must still get a
reviewer pass; the window never ran it.

### H3 — Reviewer share is flat at 25.7% and its cache ceiling is structural (P2, cost)

43 calls, $0.114; 23.3% token cache with a 65% call hit-rate, capped at the 3.5k-token shared prefix
because the other 5–11k tokens per call are the acting transcript. Output is 38% of reviewer cost
(corrected contracts up to 2,270 tokens) and drives latency (9.5 s p50, 2.6× the 09-02 OpenAI
figure). The >50% cache target cannot be met by keying; only by sending less. Cheap-model impact:
indirect — the reviewer round trip is on the critical path of every contract write and every
reviewer-authored clarification (34% of those turns' cost). Fix: send the reviewer the contract +
user message + the loaded-entity index, not the acting transcript; or approve single-target,
value-complete contracts in code (H2) so the reviewer only sees the hard cases. Depends on WP-4.

### H4 — Tool schemas are now 58–64% of the first-pass prompt and 38–41% of that block is never called (P1, cost/prompt)

Pass-1 billed tokens 13.4k global / 14.8k project vs 3.2k / 5.9–9.2k on 09-02; the system prompt got
smaller, the tool block got 1.5–3.4× bigger (28–29 tools on global, 35–36 on project). 12/30 global
and 17/37 project tools never ran in 246 executions; the calendar quartet alone is 5,455 chars on a
worker where calendar reads returned no data all week. Acting spend is 90% input tokens ($0.276 of
$0.306), so the tool block is roughly half of all acting spend. Cheap-model impact: a weak model
picks from 36 signatures every pass; the 09-02 read-loop and wrong-tool findings were about choice
under a smaller surface. Fix: mount calendar/email/delegate/link/move tools only when the message or
context signals them (the skill-preload signal already exists per message), and drop
`cancel_turn_contract` and `get_workspace_overview` from surfaces where they have never fired.
Risk: a tool the model needs is absent — the surface-repair path (0 fires this window) is the guard.

### H5 — Two prompt-size estimators under-report the billed prompt by 2.6–2.8× (P2, bug/telemetry)

`chat_prompt_snapshots.approx_prompt_tokens` (5.2k p50) and the admission
`context_usage.estimatedTokens` (4.5k p50, budget 15,000) both omit the tool schemas; the provider
bills 13.4–14.8k. The 15k budget therefore reads "38% used" on a prompt at ~99% of it, and any
budget-derived decision (history compression fired on 12/55 turns) is made on the wrong number.
Cheap-model impact: history/context trimming happens too late or never, and the model gets a bigger
prompt than the harness thinks it sent. Fix: count `JSON.stringify(tool_definitions)/4` (or the
provider's own pass-1 `prompt_tokens`, now available in `llm_usage_logs`) into both estimators.
Risk: compression will start firing on turns it did not before; watch `history_compressed`.

### H6 — A clarification costs a forced tool-free pass, and a direct write costs another (P2, overengineering)

23 `final_response` passes on 20 turns: 12 re-render a clarification the tool result already holds
verbatim, 10 write the receipt for a direct write that already succeeded. Each is a ~7.6k-token,
5.6 s call ($0.0158 total). The two `provider_forced_synthesis_failed` turns (9a31d293, 65307e1e)
were this pass failing _after_ the writes landed. `renderWriteReceiptFallback`
(`turn-provider.ts:1840`) already renders a deterministic receipt when the pass fails; the
clarification result already carries `question` and `candidates`. Cheap-model impact: a weak model
asked to restate a structured result in prose sometimes emits a tool call instead (the 2 failures)
or drifts from the structured content. Fix: render both deterministically and skip the pass; keep
the model pass only when there is new information to explain. Risk: receipts read robotic; the
09-02 "partial-fulfilment disclosure" text lives in the deterministic path already.

### H7 — Calendar reads report success while every source fails, so the model retries and telemetry sees nothing (P1, tool design/capability gap)

8 `list_calendar_events` rows, `success: true`, all `events: []` with a warning that all connected
sources failed (`provider_error` on 09-04 17:17Z, `credentials_not_configured` 20:42Z,
`credentials_unreadable` 09-05 00:36Z; the memory index says five calendar secrets are still owed on
Railway). `chat_tool_executions.success`/`zero_result` and `tool_execution_ended.status` all say
success, so `agentic:health` cannot see that the calendar has not worked since the merge. dfc7fa13
called it 5×, 89797082 called `get_external_account_status` 3×. Cheap-model impact: the model has to
parse warning prose to learn the read failed, and it tries variants instead of stopping. Fix: return
`success: false, error_code: <source failure>` when zero sources were readable (keep partial
coverage as success with `partial: true`); set the worker secrets. Risk: a false failure would
trigger the read repair path — bounded by the existing repair rank.

### H8 — Completed-turn latency is 2.1× the target and it is pass count, not harness time (P1, cost/architecture)

p50 45.1 s / p90 99.1 s vs ≤ 21 s / < 60 s. Decomposition: 83% model generation (69% acting, 14%
reviewer), 6% tools, 8.5% harness (~0.8 s per call). Read-only alone is 26 s p50 because a saved-facts
question takes outline + 2 section reads (3 calls) and an owner report takes 6–8 serial
`read_document_section` calls (S14: 11–14 tool executions). Cheap-model impact: every extra pass is
6 s and 14k re-billed tokens. Fix: H1 (avoid Azure), H2/H6 (fewer passes per write), and for reads
return whole documents under a size cap instead of an outline-then-sections dance (the 09-02 §2.5
observation, still 42% of reads here: 35 section + 17 outline of 117 reads). Risk: larger tool
results — bounded by the existing 2,400-char excerpt policy that would need a higher cap.

### H9 — Fixed since the window; verify the deploy, do not re-fix (P2, bug)

(a) Reviewer "invalid or unbound decision" turned into a user clarification on fully specified
requests: 069c45f4 (A), 78adb24c, f0c2b495, bd67667d, aacf658a (C) — `decided_by:
harness_review_fallback`; and the candidate gate asking "project or its Context Document" on
ab4e567e, 579e0c95. Fixed in `c2b5f442a` (label schema, `decision-completion.ts`, one private repair
then "internal check failed"); post-fix Book QA shows revisions→approvals and no fallback.
(b) Clarification validator demanding verbatim labels: 0d8019ca fatal, 8a2fcdd3 one repair; removed
(`turn-contract.ts:956-961`). (c) Forced-synthesis failure after successful writes: receipt fallback
added (`turn-provider.ts:1838-1849`). (d) Egress block on DJ's organic turn bfa823cd: deployed 09-08.
(e) `provider_tool_feedback_kind_mismatch` 35f3e826: fixed in tree, **not deployed**. Cheap-model
impact of the deploy gap: research turns that hit a denied visit still die in production until the
worker ships.

### H10 — `agentic:health` scores two metrics wrong (P3, eval gap)

Sanitizer: 11/50 "altered" is 21 whitespace characters across 11 replies; the metric counts any byte
difference, so a clean sanitizer fails its own target. Count removals ≥ 8 chars or pattern matches.
Skill preload F7 canary: matches three literal phrases (`metrics.mjs:15-19`) that never ran, so it
reports 0/0 "pass" while 6 preloads landed on read-only turns. Score preloads against the inferred
turn class instead. Also: provider-start failures are billed as catalog estimates (7% of prompt
tokens, 5.8% of spend) and inflate `worker_model_cost`; `project_create` turns persist no prompt
snapshot (3/3); `prepared_prompt_miss_reason` is null on all 50 misses.

### H11 — Skill preloads fire on read-only turns (P3, prompt)

6 of 24 preloads landed on turns with no write: `calendar_management` on all three calendar
availability reads (89797082, dfc7fa13, 396bebc2), `task_management` on both runs of the planning-only
conflict question (0d86e1cf, a1a85bdf), and the cold-email domain skill on bfa823cd (already
recorded). A preload inlines up to 8.9k chars into `situational_rules` (2.2k tokens) and says "apply
its workflow"; on a read it is pure cost plus a nudge toward writing. Fix: gate `operational_intent`
preloads on the same write-intent signal the direct lane uses.

## 13. What is right (do not undo)

- Failure handling did its job: 29/29 provider retries succeeded, no truncation kills, no
  not-allowlisted kills, no budget or cap exhaustion, and the fixes for every failure class seen
  here already exist in the tree. The 09-02 P0s did not recur.
- The direct write lane is exactly the shape the whole system should converge on: 2 calls, 15 s,
  $0.0025, identical across three runs.
- Partial-fulfilment disclosure works (2/2), `llm_pass_count` is written, legacy lane is gone,
  every turn has a `timing` event, and `provider_attempt_ended` observations make the pin/cache
  analysis above possible.
- The reviewer's revision reasons are consistently right about what the declaration omitted; the
  problem is that the acting model must write the declaration at all, not the review.
- The committed health report runs in one command and its numbers reconcile with this pull (55
  turns, 246 tools, 292 usage rows, 43 reviewer calls, 25.7%, p50 45.1 s).
