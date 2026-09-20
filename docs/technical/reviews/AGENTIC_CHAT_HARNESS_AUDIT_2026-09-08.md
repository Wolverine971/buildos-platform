<!-- docs/technical/reviews/AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-08/10 against main at `6d70b36e1` (HEAD moved to
> `226e51c31` during the audit; no harness file changed). Sections 1-10 describe the system at that
> moment. Section 11 records what was changed in the same iteration. Verify against code before
> acting on anything older than a week.

# Agentic Chat harness audit: is the harness good enough for a cheap model?

Scope: the whole chat harness after the one-engine merge (2026-09-04): the eleven-section system
prompt and every runtime message, the three tool surfaces and their schemas, the worker provider loop
and its reviewer, the shared runtime loop modules, the executor and its durable machinery, context
assembly and admission on the web, the skill and domain layer, the OpenRouter transport and model
configuration, production telemetry since the deploy, every recorded live battery, and the eval loop
itself.

Method: eleven read-only lanes (A prompts, B tool surface, C provider loop, D runtime loop, E
executor, F context, G skills, H telemetry, I live evidence, J eval loop, K transport and models),
each with measured numbers and `file:line` evidence. 155 raw findings were clustered into 119, and
every one was adversarially verified by an independent agent reading the working tree with two
lenses: is the claim true in code today, and would the proposed fix break something the 09-02 audit
deliberately kept. 58 were confirmed outright, 61 confirmed with corrections, 0 refuted. Where the
verifier supplied a safer fix, this document uses the verifier's version. The completeness critic
did not run (session limit); its absence is the main known gap. Lane reports, scripts, pulled
aggregates, and the verified findings JSON are in
[`agentic-chat-harness-audit-2026-09-08/`](./agentic-chat-harness-audit-2026-09-08/).

Prior work this builds on and does not repeat: the
[09-02 turn-executor audit](./AGENTIC_CHAT_TURN_EXECUTOR_AUDIT_2026-09-02.md) (15 findings, all
fixed the same day, Finding 11 reverted 09-03), the
[one-engine handoff](./ONE_ENGINE_BRANCH_HANDOFF_2026-09-04.md), the three post-deploy batteries in
`artifacts/`, and tracker 80.

---

## 1. Verdict

**The cheap model is not the problem, and it is not saving money. The harness makes the cheap
model do two to three times more work than the task needs, and then a strong model damages the
result.**

Four numbers carry the argument:

| What                                                    | Measured                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| Cost saved by the cheap acting model at 4 users         | about $4 a month versus running the reviewer model as the actor (lane K §6) |
| Median completed turn since the one-engine deploy       | 45 s, p90 99 s, against a 21 s target (lane H §2)                           |
| Single-target edits that took the direct write lane     | 0 of 11 across five batteries; all went through the contract lane (lane I)  |
| `declare_turn_contract` calls rejected by the validator | 10 of 34 (29%), in every cohort including DJ's organic turns (lane H §5)    |

The system is safe. Nothing in the window wrote a guessed entity, every partial write was disclosed,
and every failure class the 09-02 audit found is gone. What is left is a harness that spends its
effort in the wrong place:

1. **The contract lane is the wrong protocol for a weak actor.** To make one edit the model must
   translate a plain request into a DSL (`outcomes[].required_fields/changes/labels`) with 38
   deterministic rejection reasons, satisfy a stronger model's review of that translation, then be
   handed back a surface and re-propose the call it already proposed two passes earlier. A direct
   write is 2 calls, 18 s, $0.0025 and was stable across three code versions; the same edit through
   the contract lane is 7 calls, 83 s, $0.0137, with 64 s of silence before anything is visible. The
   direct lane the 09-02 audit built is never taken because the prompt opens with "call
   declare*turn_contract first, unless..." and a weak model executes the imperative. And since the
   09-04 reviewer collapse, the reviewer approves a \_description* of the batch and no longer checks
   the arguments that execute (F08), so the machinery is both expensive and hollow.
2. **The strong model did the damage.** Six turns of corrupted or blocked writes came from the
   reviewer (GPT-5.6-luna) authoring replacement contracts and padding capped fields with `##2`,
   `|||||`, and zero-width characters (F04). A stronger actor would not have helped; the reviewer is
   already the strong model. The reviewer should return a verdict, not content.
3. **Latency is pass count times provider luck.** 69% of wall time is acting-model generation and
   harness overhead is only about 0.8 s per call, so the lever is fewer passes. But the route pin
   fails on 47% of turns, the retry lands on endpoints that are not in the configured order (Azure
   serves DeepSeek at 112 ms per output token versus Alibaba's 8 ms), and every switch drops the
   prompt cache from 67% to 5%. Four turns spent 93 to 120 s on Azure alone.
4. **The opening prompt is 60% tool schemas the model mostly does not use.** Pass-1 prompt tokens
   went up 4.1× on global and 1.6-2.5× on project since one-engine, because 28-36 tools now mount by
   context alone; 38-41% of that block was never called in the window. On top sit about 500 tokens
   of web-research and delegation rules on every turn, a 2,436-char routing message on every opening
   pass, and a reviewer prompt that is one 9,672-character paragraph.
5. **The context layer loads 222 KB and renders 3.4% of it, and a 6,000-char guard turns the tool
   the prompt steers toward into a cut JSON string 76% of the time.** A weak model then reads
   outline, section, section, section (6-8 serial reads per owner report) for facts the loader
   already had.
6. **About 20,000 lines are dead or disproportionate.** Domain sensing, outcome cards, session
   state and a DB trigger (4,600 lines, zero preloads since deploy); the prepared-prompt cache stack
   (6,700 lines, 9% hit rate, a quarter of turns pay both paths); discovery and materialization
   machinery no worker can call; the supervisor package and web shims; a dead lexical intent
   classifier and two dead checkpoint queries on every admission; model tiering; phase-A route eval;
   ~1,750 dead lines inside the context loader alone.

The thesis DJ set out ("the harness should be so good that a cheap model does the work cleanly")
is supported by the one experiment the window contains: the same cheap model went from 27/52 to
45/52 on the 09-04 battery purely by removing harness faults (dates, a validator rule, a surface
omission). The remaining write-path failures are harness-caused and would break any model; the
remaining read-path failure (asserting absent records as real-world facts, 5 of 5 owner reports
through three prompt edits) looks like model capability and needs a deterministic check or the
strong model, not a fourth sentence.

---

## 2. What production says (2026-09-04 17:14Z to 2026-09-09 02:26Z)

Fifty-five turns, all DJ's account, all `worker_realtime`: 52 scripted battery and QA turns and
three organic ones. Read every number as "what the harness did on these prompts," not as user
statistics. Full tables in lane H.

| Class          |   n | Model calls p50 | Reviewer | Tool rounds | Total prompt tok p50 | Cost p50 | Wall p50 | First visible |
| -------------- | --: | --------------: | -------: | ----------: | -------------------: | -------: | -------: | ------------: |
| read only      |  17 |               4 |        0 |           3 |                61.8k |  $0.0050 |   26.2 s |         8.2 s |
| direct write   |   6 |               2 |        0 |           1 |                21.9k |  $0.0025 |   18.0 s |        14.8 s |
| contract write |  13 |               7 |        2 |           5 |               105.6k |  $0.0137 |   83.2 s |        64.2 s |
| clarification  |  11 |               7 |        1 |           3 |                75.0k |  $0.0117 |   55.3 s |        30.3 s |
| all            |  48 |               5 |        0 |           3 |                67.3k |  $0.0064 |   45.1 s |        18.7 s |

Other facts the findings rest on:

- Failures 5/55 (9%): a clarification-validator loop (fixed), two forced-synthesis passes on Alibaba
  that emitted tool calls after successful writes (receipt fallback added), an egress block on DJ's
  organic meeting-notes turn (fixed and deployed), and the 09-08 feedback-kind crash (fixed,
  committed in `226e51c31`). Two cancellations at 80 s and 150 s, one after 12 successful writes with
  nothing visible to the user.
- Reviewer: 43 calls, 25.7% of spend (flat versus 24% on 09-02), 23% token cache against a target
  of 50%, p50 9.5 s. `approve_mutation_batch_review` fired 0 times in 13 contract writes.
- Provider pin: Alibaba → `404 No endpoints found` on 23% of following rounds, DeepInfra → 429 on
  33%; NextBit, Phala, StreamLake and Azure served 38% of acting calls though none is in the
  configured order; `deepseek` and `cloudflare` served zero.
- Pass-1 prompt: 13.4k tokens global, 14.8k project; tool schemas 58-64% of it; the admission
  estimator ignores schemas and under-reports the billed prompt 2.6-2.8×.
- Prepared prompt cache: 5 of 55 hits. Read memo: 1 of 249 hits. Skill preloads: 24 of 55, six of
  them on read-only turns.
- Same 13 prompts on three code versions: read-only and direct-write cases were stable in class,
  cost and time; the four cases whose outcome class changed between runs were all contract-lane
  writes.

---

## 3. Themes

The 119 findings cluster into twelve themes (dedup step; the full mapping is in
`evidence/findings-verified.json`). In the order that matters to the person typing:

1. **Contract lane too heavy for the actor** (F02-F09, F39, F91). The DSL, its 38 rejection
   reasons, the label sub-schema (18 label-only rejection paths, 44% of the control's schema bytes),
   the reviewer as author, two acting passes that produce nothing durable, and a direct lane that
   the prompt steers away from.
2. **Harness overhead on the critical path** (F19, F40, F49-F54, F57-F59, F62, F63, F66, F67,
   F84, F86, F105). Awaited observation RPCs (about 14 serial round trips on a 3-read + 1-write
   turn), an O(N²) projection that re-sends the full assistant text on every event, a forced
   tool-free pass after every direct write and every clarification, two read ladders per round, and
   atomic passes that hold text until the pass ends.
3. **Provider routing and model config** (F76-F81, F103, F108, F111). Pin failures, snapshot-id
   detours to Azure, a half-dead provider order, reviewer reasoning effort unset, a 4,000-token
   output cap that bounds document bodies, and a reviewer fallback chain that contains a documented
   bad reviewer.
4. **Prompt states what code enforces** (F01, F11, F18, F20, F22-F24, F43, F75, F93). Rules
   rendered unconditionally, "untrusted" stated five times plus 261 chars per tool result, three
   statements of the project_create rules, and two fidelity guarantees (verbatim storage, stored
   dates) that rest on prompt sentences where a byte-compare exists.
5. **Context loading and memory** (F21, F112-F116, F118). The cache stack, the size guard, six task
   refs with no descriptions while the computed digest goes unrendered, 222 KB loaded for a global
   turn, START HERE cut at 2,400 chars for half of DJ's projects, and a session memory that is the
   last four rows.
6. **Tool surface and schema mismatch** (F25, F26, F29-F35, F37, F82, F85). `delegate_task` on
   global where it cannot succeed, no way to update the project or create goals/milestones/risks
   from the project surface while the prompt coaches toward it, `update_onto_document` advertising a
   mode it rejects, calendar reads that report success while every source fails.
7. **Terminal-text guards damage good replies** (F12-F15). The sanitizer re-join flattens lists,
   the finalization guard replaces short correct answers that offer a follow-up, and a regex gate
   routes ordinary read answers into a required gate.
8. **Skill apparatus is the wrong unit** (F68-F73). 4,600 lines of domain sensing and session
   state with zero preloads since deploy; a preload wrapper that names `skill_load` and
   `outcome_card_load`, tools the worker does not have; a once-per-window dedupe that removes the
   playbook from every following write turn; SKILL.md steps that name tools not on the surface.
9. **Dead engine leftovers** (F16, F27, F28, F34, F36, F44-F47, F61, F73, F74, F95, F96, F100,
   F102, F104, F106, F107, F109, F119). About 20,000 lines with no production caller.
10. **Failure handling brittleness** (F41, F42, F48, F55, F56, F64, F65). Thrown read errors kill
    the turn, partial fulfilment completes only on budget exhaustion, self-validation between two
    modules in one process is fatal, and the recovery RPC has no single source of truth.
11. **Date and time** (F117). UTC day buckets and UTC write receipts behind a frame that promises
    local time.
12. **Eval gap** (F17, F38, F83, F87-F90, F92, F94, F97-F99, F101, F110). No offline replay though
    every input is persisted; a battery whose oracle grades correct product behaviour as failure;
    a size-budget test that measures a prompt production never sends; harness unit tests that never
    run in CI.

---

## 4. The over-engineering ledger

"Delete" means no production caller or no production evidence of the failure it prevents.
"Simplify" means load-bearing but disproportionate. Line counts are measured by the lanes; the
invariant column is what the verifier said must survive.

| #    | Item                                                                                                                                             | Lines                           | Cost per turn today                                                                 | Verdict            | Must survive                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| F68  | Domain sensing, outcome cards, session state, research queue, used-signals, the SQL trigger                                                      | 4,643 + 638 SQL                 | runs on every admission; 4.3 KB frozen into every artifact; 0 preloads since deploy | delete             | `resolveOperationalSkillForTurn` (233 lines) and the playbook render                   |
| F112 | Three-layer context cache (prepared prompt, prepared admission, context snapshots)                                                               | 3,070 + 2,180 tests + 1,410 SQL | 9% hit; 25% of turns run both paths; ~20 sequential DB round trips on a miss        | delete (decision)  | the freshness triggers on the 12 ontology tables (09-02 §6)                            |
| F03  | The contract dialect: `declare_turn_contract`, parser, labels, fulfilment resolver, carve-out and completion passes, disposition gate for writes | ~4,000                          | 2 non-durable acting passes + reviewer per complex write; 29% validator rejection   | replace (decision) | SHA-bound approval, the candidate-ambiguity floor, the restraint canary, atomic passes |
| F27  | Discovery and materialization machinery (`skill_search`, `tool_search`, `tool_schema`, materialize-on-miss)                                      | ~550 in compaction alone + web  | dead on the only host; one env flag refuses every turn if flipped                   | delete             | none                                                                                   |
| F46  | Supervisor package, web `turn-supervisor/` shims, `ports.ts`, `lifecycle-observability.ts`, four loop modules                                    | ~2,500                          | none (dead)                                                                         | delete             | `finalization-guard` shim last (09-02 §11)                                             |
| F44  | Lexical intent classifier and two checkpoint queries in admission                                                                                | ~300 + 2 RPCs                   | 2 dead DB calls per turn                                                            | delete             | none                                                                                   |
| F49  | `streamPublisher` (soft/hard pressure tiers, waiters, reconcile-hint throttle, ack RPC)                                                          | 1,299 → ~950                    | one hot-row RPC per event, serialized behind the executor                           | simplify           | the worker snapshot (capacity gate), timing callbacks, terminal-after-drain            |
| F50  | Awaited observation rows on the tool critical path                                                                                               | —                               | ~14 serial round trips on a 3-read + 1-write turn                                   | simplify           | the rows themselves (09-02 read-planning views, harness telemetry, canary)             |
| F59  | Terminal timing: four finalize RPCs for one observability event                                                                                  | ~1,700                          | 4 RPCs at finalization                                                              | simplify           | the `timing` event                                                                     |
| F19  | Two read-saturation ladders per read round                                                                                                       | 477 + 40                        | two system messages a weak model echoes                                             | simplify           | one ladder (novelty)                                                                   |
| F84  | Forced tool-free synthesis pass after every direct write and clarification                                                                       | —                               | +1 model call, ~6 s, on 23 of 48 turns                                              | simplify           | receipt-grounded answers, no tool calls after a write                                  |
| F105 | Three tool-call accumulators over the same stream deltas                                                                                         | ~400                            | none measurable                                                                     | simplify           | truncation guard                                                                       |
| F104 | Per-turn provider degradation latch                                                                                                              | ~120                            | none (dead)                                                                         | delete             | none                                                                                   |
| F107 | `model-tiering.ts`                                                                                                                               | 288                             | none (dead)                                                                         | delete             | none                                                                                   |
| F96  | Phase-A route eval, open-brief control, `@buildos/agent-orchestrator`                                                                            | ~3,000                          | none                                                                                | delete (decision)  | none in production                                                                     |
| F61  | `statedFutureCapture`                                                                                                                            | 490                             | an RPC per project turn for an auto-created task nobody asked for                   | delete (decision)  | none                                                                                   |
| F119 | Dead code inside the lane-F files                                                                                                                | ~1,750                          | none                                                                                | delete             | none                                                                                   |
| F57  | Tool execution DAG, policy, `call_ref`/`after` sidecars                                                                                          | ~800                            | 581-char batching message when mounted; real batches rarely >1 mutation             | keep, trim         | resource-conflict barriers for unknown-scope mutations                                 |

Total candidate deletion: about 20,000 lines plus two SQL functions and a trigger, with the two
decision-gated items (contract lane, cache stack) accounting for half.

---

## 5. Capability gaps

Things a user would reasonably type that fail, loop, or cannot happen today.

| #    | Gap                                                                                                    | Evidence                                                                                                          | Fix                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| F26  | "Rename this project", "add a goal", "add a milestone", "add a risk" from a project chat               | `update_onto_project`, goal/milestone/risk creates on no surface; the routing example names `update_onto_project` | mount them on the project surface (+~3.6 KB, still below today's total after trims)                       |
| F05  | "Mark the cabinet task done" after a list read that returned several tasks                             | direct lane requires focused entity, single-hit read, or typed UUID                                               | fix the prompt line first (verifier: it is the binding constraint), then a narrow whole-phrase title lane |
| F24  | Owner report says "no payment was made" when the record is merely absent                               | 5 of 5 owner reports through three prompt edits                                                                   | deterministic absence-claim check that appends a caveat line, with a telemetry event                      |
| F114 | "What should I work on?" needs a tool round because context shows 6 task refs and no descriptions      | 15 of 41 DJ projects exceed the 6-ref cap; digest computed, never rendered                                        | render the computed digest (18 tasks, 80-char descriptions); raise the RPC cap to 40 later                |
| F115 | "Which projects do I have?" on global cannot be answered in one round                                  | 222 KB loaded, 8 of 46 rendered, no ids                                                                           | render the 46 names with ids and open/overdue counts; stop loading `project_logs`                         |
| F113 | `get_workspace_overview` / `explore_project` / `get_document_tree` results arrive as a cut JSON string | 76% / 90% / 31% of calls in 21 days                                                                               | every ontology compactor targets the cap minus the notice margin; structural fit, never string cut        |
| F116 | Decisions and open questions in START HERE are cut off                                                 | 26 of 52 START HERE docs exceed 2,400 chars                                                                       | 8,000-char inline budget cut at a heading boundary, naming omitted headings                               |
| F55  | A read that throws (access denied on a hallucinated id, not-found, a PostgREST error) ends the turn    | code path                                                                                                         | route `read_tool_execution_failed` through the recoverable-read channel with a bounded message            |
| F56  | Partial fulfilment completes only when the budget expires                                              | code path                                                                                                         | finalize `completed` + `mutation_unfulfilled` on any terminal after ≥1 durable write                      |
| F85  | Calendar read with all sources failed looks like success; model retries 5×                             | dfc7fa13, 89797082                                                                                                | set the five Railway variables (first); add top-level `calendar_read_failed` + `error_code`               |
| F33  | Gmail connect handoff is mounted only for users who already connected                                  | surface rule                                                                                                      | mount `request_email_account_connection` when no mailbox is connected                                     |
| F94  | No way to measure a prompt change without a deploy                                                     | lane J                                                                                                            | golden corpus from `chat_prompt_snapshots` + offline first-pass replay (§9)                               |
| F64  | A worker restart mid-write ends the turn                                                               | tracker 80 WP-3                                                                                                   | phase persistence + post-start requeue (unchanged from WP-3)                                              |

---

## 6. Prompt and tool-description problems for a weak model

What a cheap acting model reads, and why it goes wrong. Measured sizes are per opening pass on a
project turn unless stated.

- **The write rule contradicts the mount** (F02). The first line of the worker write rules says
  "call declare_turn_contract first, unless...", nine tool descriptions end "otherwise
  declare_turn_contract first", and the routing message's own guidance says "a complex one calls
  declare_turn_contract first", while the opening pass deliberately does not mount that tool. A weak
  model reads the imperative and skips the exception; every single-target edit in five batteries
  opened with a declaration. Fix: an ordered recipe that leads with the direct cases and matches the
  code ("typed UUID and loaded by a read this turn"), tool-neutral guidance, and the sentence
  removed from the three overrides that ride the opening pass.
- **Always-on situational rules** (F01): 2,050 chars of web-research and delegation rules render on
  every global and project turn because `web_search` and `delegate_task` are always mounted. Web
  rules should render on research phrasing or be appended by the worker after the first web call;
  the delegation rules already live in the `delegate_task` description.
- **The reviewer prompt** (F10): one 9,672-char paragraph with 13 "never"s, and the reviewer's
  evidence slice carries ~2.7k chars of actor rules it was meant to drop. Format-only rewrite plus
  dropping "Rules for This Turn" from the evidence titles (keep the preloaded playbook block).
- **The label sub-schema** (F06): four optional symbolic fields the schema begs the model to omit
  three times, filled with placeholders by both models, 1,150 of the control's 2,605 description
  chars. Tier 1: normalize them away the way reviewer corrections already are; cut the descriptions
  to ~250 chars.
- **Rejections that should be normalizations** (F07): `project_id` in `required_fields` is
  rejected (the model cannot know it is scope), and the schema description never says so. Filter it
  in `normalizeOutcome` and say "never project_id" at the point of use. Keep the empty-field
  document-update rejection (the verifier showed it is the only postcondition left on that path).
- **Tool descriptions** (F29, F30, F31, F35): `create_onto_project` requires two arrays whose only
  legal value is `[]`; `update_onto_document` advertises `merge_llm` three times and rejects it, and
  carries a dead `merge_instructions`; five calendar schemas carry three derivable addressing knobs;
  `list_onto_tasks` undersells its payload and nudges N+1 detail reads; `update_onto_task.project_id`
  is described as required when it is ignored.
- **"Untrusted" five times plus 261 chars per tool result on every pass** (F18); **2.2k chars of
  instructions inside data sections** (F20); **project_create rules stated three times** (F11);
  **stale phase instructions accumulate as system messages for the rest of the turn** (F43);
  **~400 lines of model-facing strings describing deleted machinery** (F16).
- **The preloaded playbook** (F69-F71): wrapped in "Skill-load gate: SATISFIED BY PRELOAD / do not
  call skill_load / outcome_card_load", 14% jargon a worker model cannot act on; dedupe removes it
  from the next write turn of the same kind; the steps name tools that are not mounted (task
  playbook 4 of 8, document 4 of 9).
- **Terminal guards** (F12, F13, F15): the sanitizer re-joins sentences with spaces and flattens
  every list once any of 144 patterns hits one sentence; the finalization guard replaces a short
  correct answer that offers a follow-up ("You have 3 open tasks; check the Q3 plan for the rest")
  with synthesized evidence text; lead-in prose is glued to the final answer with no separator.

The shape of a lean prompt (lane A §7): a static prefix under 2,000 chars (identity, four "how to
act" bullets, three report bullets, three safety bullets), zero per-turn rules on read turns, at most
700 chars of write rules on write turns, a playbook of at most 4,000 chars, and every per-call rule
moved into that tool's description. Today the instruction prose alone is 10.6-11.5k chars per
opening pass, before data and before the 37-39k chars of schemas.

---

## 7. What is right and must not be undone

Every lane was asked for this, and the verifiers checked each proposed fix against it.

- Everything in the 09-02 audit §6: read-default plumbing, SHA-bound approvals, the deterministic
  candidate-ambiguity floor, the effect ledger with post-start no-retry, the atomic buffered pass and
  per-turn route pin, the ontology freshness triggers, worker narrowing of schemas, the situational
  rules mechanism, the execution graph's conflict barriers, the skill file format.
- The Finding 11 addendum: every earlier tool result stays in the request at full length; no
  compaction may apply to the pass that feeds the final response.
- The direct-write floor in `write-routing.ts` (three lanes, ≤3 ops, no sidecars) and the restraint
  canary ("keeps an update chosen from three plausible tasks on the contract route").
- `provider-pass.ts`: truncation guard against our own cap, the `tool_choice=none` violation catch,
  budget-derived attempt timeouts, the abort race on body reads.
- Idempotent usage receipts keyed per (turn, generation, round, role, attempt, route), and
  provider-reported cost over catalog estimates. This audit's numbers exist because of them.
- The reviewer's static prefix and constant cache key; the approval tools stay static.
- The 12-pass ceiling with receipt-grounded synthesis; partial-batch disclosure; `mutation_unfulfilled`.
- The dev-only prompt dump; the `agentic:health` report; the pgTAP recovery tests.
- Two HTTP clients, not one: smart-llm is request/response for JSON services; the chat needs
  streamed tool calls.
- `parseToolArguments` and its recovery helpers (fence stripping, concatenated-object merge): the
  tolerance a weak model needs, used by every validator.
- Context-only surfaces. Every lane that proposed message-keyed mounting was corrected: the worker
  surface is immutable for the turn, so a tool omitted at launch is a dead turn. Gate on durable
  account facts (a connected mailbox, a readable calendar source), never on the message.

---

## 8. Decisions for DJ

Each changes what users experience or what the product costs. Everything else is an engineering
call and is either done in §11 or queued in §9. Lean and ambitious are both real options; neither
pre-concedes.

1. **The contract lane.** Lean: keep the DSL, make the harness derive the contract from the withheld
   batch so the actor never writes it (removes the gate pass and the 29% rejections; keeps the
   reviewer, the validators and fulfilment). Ambitious (recommended): replace it with SHA-bound batch
   approval: the actor proposes the exact tool calls, the reviewer returns approve / reject-with-reason
   / ask-user on the batch SHA, the harness executes exactly the approved batch. About 4,000 fewer
   lines, one to three fewer calls per complex write, and the executed arguments are the approved
   arguments by construction (closes F08). Risk: a multi-day change touching the restraint canary;
   the reviewer verdict set shrinks, so the three-plausible-tasks case must still route to review.
   Both options make the reviewer verdict-only (F04); that part is not optional after six corrupted
   writes.
2. **The reviewer model.** Lean: keep GPT-5.6-luna, set reasoning effort low, fix the fallback chain
   and the evidence slice (F79, F80, F81, F10). Ambitious: canary DeepSeek v4 flash at temperature 0
   as the reviewer behind the restraint canary (lane K scenario C, −25% spend, the reviewer round trip
   drops from 9.5 s to ~4 s). Either way the reviewer share cannot reach the 50% cache target by
   keying; only by sending less.
3. **The acting model.** The cheap-model constraint saves about $4 a month at 4 users and $540 to
   $1,085 a month at 1,000 users versus Luna acting with the reviewer kept. Lean: keep DeepSeek v4
   flash and fix routing (K1-K3, a 25% cut with no model change). Ambitious: run Luna as the actor
   with no reviewer (scenario F, +20% over today) through the 52-point battery and the restraint
   canary, and decide on quality, not price. Recommended: fix routing first, then run scenario F
   once as an experiment; the number that matters is the battery score, not the bill.
4. **The context cache stack.** Recommended: delete the prepared-prompt, prepared-admission and
   context-snapshot layers and rely on the freshness triggers plus OpenRouter prompt caching. It
   saves ~1 s of a 45 s turn at a 9% hit rate and costs 6,700 lines and a quarter of turns running
   both paths. Alternative: keep only the prepared-prompt row for the prewarm path if the modal's
   open-to-first-token time is a product priority.
5. **Live streaming.** The atomic pass is load-bearing on the cheap route (25 failed passes in 48
   turns were retried invisibly). Lean (recommended now): do nothing to the pass; take the RPC and
   routing wins so the silent gap shrinks. Ambitious: stream text live on `toolChoice: none` passes
   only, with retry permitted only while nothing has been released. Never on `auto` passes.
6. **Calendar tools for users without a calendar.** Gating the five calendar tools on a readable
   calendar source (the way email is gated on a connected mailbox) saves 28-34% of the tool block for
   those users but removes native BuildOS events for them. Product call; not a cleanup.
7. **`statedFutureCapture`** (490 lines, an auto-created task nobody asked for) and the phase-A
   route eval package (~3,000 lines): delete or keep. Recommended: delete both.
8. **The eval loop.** Lean: fix the Cedar House oracle and run the 20 harness unit tests in CI.
   Ambitious (recommended, and the "folders of code + scripts + data driven by an agent" habit): a
   committed golden corpus of DJ's real opening requests from `chat_prompt_snapshots`, an offline
   replay that sends the exact request to N models and scores first-pass tool choice and argument
   validity, and a cost/latency table per model. Lane J estimates 2-3 days to build; each run costs
   under $2. It is the only way to answer decisions 2 and 3 without a deploy.

---

## 9. Recommended order

1. **This iteration (§11):** the prompt contradiction, always-on rules, surface hygiene, provider
   routing, the guards that damage replies, the compaction size guard, START HERE and the task
   digest, observation RPCs off the critical path, the playbook dedupe and wrapper, dead admission
   calls. All verified safe, no decision needed, no overlap with the web components another session
   is editing.
2. **Decision 1 (contract lane).** The single largest latency and correctness lever on the write
   path. Do the reviewer-verdict-only change first regardless of which option DJ picks.
3. **Decision 8 (offline replay).** Build it before touching models, so decisions 2 and 3 are
   measured.
4. **Decision 4 (cache stack) and the dead-engine deletions** (§4): mechanical, large, low risk.
5. **Executor simplifications** (F49, F59, F57): after the deletions, when the executor is smaller.
6. **WP-3 resumability** (F64): unchanged from tracker 80.
7. **Rerun the five battery cases from lane I §5** on one deployed release, with the corrected
   oracle, before claiming any of this worked.

---

## 10. Findings index

All 119 verified findings, most severe first. Verdict is the code-truth verifier's; "safe" is
whether the proposed fix survived the consequence lens unchanged (when it did not, the verifier's
safer fix is recorded in `evidence/findings-verified.json` and used in §11). Lane reports carry
the full claim, evidence and reasoning for each.

| ID   | Sev | Theme                                    | Title                                                                                                                                                | Verdict                    | Safe as proposed     | Decision |
| ---- | --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------- | -------- |
| F04  | P0  | contract lane too heavy for the actor    | The reviewer authors content and pads it into capped fields; six turns of corrupted or blocked writes, the strong model did the damage               | partially confirmed (0.85) | no, see verifier fix | yes      |
| F90  | P0  | eval gap                                 | A reviewer schema change regressed four write shapes to zero in production and the unit suite could not see it                                       | partially confirmed (0.9)  | yes                  |          |
| F01  | P1  | prompt states what code enforces         | "Rules for This Turn" is no longer situational: 2,050 chars of web-research and delegation rules render on every worker turn                         | confirmed (0.92)           | yes                  |          |
| F02  | P1  | contract lane too heavy for the actor    | The opening pass carries two incompatible write routes, one of them naming a tool that is not mounted                                                | confirmed (0.9)            | no, see verifier fix |          |
| F03  | P1  | contract lane too heavy for the actor    | Replace the contract lane with SHA-bound batch approval                                                                                              | confirmed (0.85)           | yes                  | yes      |
| F05  | P1  | contract lane too heavy for the actor    | Two deterministic resolution lanes are missing: user-named titles and ids created this turn                                                          | partially confirmed (0.8)  | no, see verifier fix | yes      |
| F06  | P1  | contract lane too heavy for the actor    | Contract labels (label/src_label/dst_label/parent_label) carry ~330 lines and 12 rejection paths for a feature the model barely uses                 | partially confirmed (0.72) | no, see verifier fix | yes      |
| F07  | P1  | contract lane too heavy for the actor    | Contract validation rejects scope ids in required_fields and empty-field document updates instead of normalizing                                     | partially confirmed (0.82) | no, see verifier fix |          |
| F08  | P1  | contract lane too heavy for the actor    | Approved contracts do not constrain the values that execute                                                                                          | confirmed (0.92)           | yes                  |          |
| F12  | P1  | terminal-text guards damage good replies | Sanitizer re-join flattens markdown lists/tables and drops short sentences whenever any of 144 patterns matches                                      | partially confirmed (0.9)  | yes                  |          |
| F16  | P1  | dead engine leftovers                    | Model-facing strings and ~400 lines that describe deleted machinery                                                                                  | partially confirmed (0.8)  | yes                  |          |
| F24  | P1  | prompt states what code enforces         | Absence-of-record is asserted as fact in every owner report; three prompt edits have not moved it                                                    | confirmed (0.85)           | no, see verifier fix | yes      |
| F25  | P1  | tool surface and schema mismatch         | `delegate_task` is mounted on `global` but can never succeed there                                                                                   | partially confirmed (0.8)  | yes                  |          |
| F26  | P1  | tool surface and schema mismatch         | Project surface cannot update the project or create goals/milestones/risks; prompt coaches toward it                                                 | confirmed (0.85)           | yes                  | yes      |
| F49  | P1  | harness overhead on the critical path    | streamPublisher at 1,299 lines                                                                                                                       | partially confirmed (0.85) | no, see verifier fix |          |
| F50  | P1  | harness overhead on the critical path    | Observation rows on the tool critical path                                                                                                           | confirmed (0.8)            | no, see verifier fix |          |
| F52  | P1  | harness overhead on the critical path    | O(N^2) projection and full assistant text re-sent on every event; 512 KB ceiling is a latent turn killer                                             | partially confirmed (0.8)  | no, see verifier fix |          |
| F54  | P1  | harness overhead on the critical path    | Atomic buffered passes mean no live streaming                                                                                                        | partially confirmed (0.85) | no, see verifier fix | yes      |
| F55  | P1  | failure handling brittleness             | Any thrown non-web read error kills the turn                                                                                                         | partially confirmed (0.85) | no, see verifier fix |          |
| F56  | P1  | failure handling brittleness             | Partial-fulfilment completion only for budget exhaustion                                                                                             | confirmed (0.8)            | yes                  |          |
| F68  | P1  | skill apparatus is the wrong unit        | The skill abstraction is the wrong unit for the worker; fold operational knowledge into tool descriptions plus a per-entity playbook string          | confirmed (0.7)            | yes                  | yes      |
| F69  | P1  | skill apparatus is the wrong unit        | Once-per-history-window dedupe removes the playbook from every following write turn of the same kind while the prompt is rebuilt each turn           | confirmed (0.85)           | yes                  | yes      |
| F76  | P1  | provider routing and model config        | Hard route pin fails one pass in 47% of turns                                                                                                        | partially confirmed (0.85) | no, see verifier fix | yes      |
| F77  | P1  | provider routing and model config        | Pin re-requests the provider's snapshot model id, detouring to Azure                                                                                 | confirmed (0.9)            | no, see verifier fix |          |
| F80  | P1  | provider routing and model config        | Reviewer latency tripled; reasoning effort unset                                                                                                     | partially confirmed (0.75) | yes                  |          |
| F82  | P1  | tool surface and schema mismatch         | Tool schemas are now 58-64% of the first-pass prompt and 38-41% of that block is never called                                                        | partially confirmed (0.75) | no, see verifier fix | yes      |
| F85  | P1  | failure handling brittleness             | Calendar reads report success while every source fails, so the model retries and telemetry sees nothing                                              | partially confirmed (0.8)  | no, see verifier fix | yes      |
| F86  | P1  | harness overhead on the critical path    | Completed-turn latency is 2.1x the target and it is pass count, not harness time                                                                     | partially confirmed (0.7)  | no, see verifier fix | yes      |
| F89  | P1  | eval gap                                 | The last battery was 45/52 -> 10/20 subset; production has had no full battery since 09-04 20:54 ET                                                  | confirmed (0.92)           | yes                  |          |
| F91  | P1  | contract lane too heavy for the actor    | The auto-created Context Document is a recurring false candidate; the gate cannot see entity kind                                                    | partially confirmed (0.85) | yes                  |          |
| F92  | P1  | eval gap                                 | The automated Cedar House battery grades correct product behavior as failure and never touches the global surface                                    | confirmed (0.9)            | yes                  |          |
| F94  | P1  | eval gap                                 | No golden corpus and no offline first-pass replay, though every input is already persisted                                                           | confirmed (0.85)           | yes                  | yes      |
| F95  | P1  | dead engine leftovers                    | Prompt-eval scenarios, evaluator, and admin Run-eval/Replay cannot pass on the worker lane                                                           | confirmed (0.85)           | yes                  |          |
| F112 | P1  | context loading and memory               | Three-layer context cache: 9% adoption, 25% of turns pay both paths, ~6,700 lines to save ~1 s of a 45 s turn                                        | partially confirmed (0.7)  | yes                  | yes      |
| F113 | P1  | context loading and memory               | The 6,000-char size guard replaces read results with a cut JSON string, and hits the tools the prompt steers to                                      | confirmed (0.9)            | yes                  |          |
| F114 | P1  | context loading and memory               | Project context renders <=6 task refs with no descriptions; the computed 'Top open tasks' digest is never shown                                      | confirmed (0.85)           | yes                  |          |
| F115 | P1  | context loading and memory               | Global context loads 222 KB to render 8 of 46 projects and an id-less metadata JSON; 'which projects do I have' needs a truncated tool round         | confirmed (0.85)           | yes                  |          |
| F09  | P2  | contract lane too heavy for the actor    | TypeScript and SQL compute the pending turn contract differently; the TS builder is dead and the SQL trigger drops changes/labels and floors minimum | confirmed (0.9)            | yes                  | yes      |
| F10  | P2  | contract lane too heavy for the actor    | Reviewer prompt: one 9,672-char paragraph, four clarification rules, actor syntax, and actor rules in the evidence                                   | partially confirmed (0.85) | no, see verifier fix |          |
| F13  | P2  | terminal-text guards damage good replies | The finalization guard replaces a short, correct read-turn answer that offers a follow-up                                                            | confirmed (0.95)           | yes                  |          |
| F14  | P2  | terminal-text guards damage good replies | The receipt-grounded regex gate routes ordinary read answers into a required gate with no read-only exit                                             | partially confirmed (0.8)  | no, see verifier fix |          |
| F17  | P2  | eval gap                                 | The size budget and the LLM eval runner measure a prompt production never sends                                                                      | partially confirmed (0.8)  | yes                  |          |
| F18  | P2  | prompt states what code enforces         | "Untrusted" is stated 5+ times in the system prompt and 261 chars per tool result, on every pass                                                     | partially confirmed (0.8)  | yes                  |          |
| F19  | P2  | harness overhead on the critical path    | Two read-saturation ladders run per read round, and their roundsRemaining <= 2 branch is unreachable                                                 | confirmed (0.85)           | yes                  |          |
| F20  | P2  | prompt states what code enforces         | Loaded-context frame and section preambles carry ~2.2k chars of instructions inside "data" sections                                                  | partially confirmed (0.75) | no, see verifier fix |          |
| F21  | P2  | context loading and memory               | Mid-session memory is the last 4-10 rows: no prior tool evidence, no live summary, a client hint that restates the last reply                        | partially confirmed (0.8)  | no, see verifier fix | yes      |
| F27  | P2  | dead engine leftovers                    | Discovery + materialization machinery is dead on the only host; one env flag refuses every turn                                                      | confirmed (0.85)           | yes                  |          |
| F28  | P2  | dead engine leftovers                    | `declare_read_only_turn` mounted on all surfaces and stripped at four sites                                                                          | confirmed (0.85)           | yes                  |          |
| F29  | P2  | tool surface and schema mismatch         | `create_onto_project` requires two arrays that must be empty; realm vocabulary lost in override                                                      | confirmed (0.85)           | no, see verifier fix |          |
| F30  | P2  | tool surface and schema mismatch         | `update_onto_document` advertises `merge_llm` x3 and a dead `merge_instructions` param                                                               | confirmed (0.9)            | yes                  |          |
| F31  | P2  | tool surface and schema mismatch         | Calendar tools carry three derivable/superseded addressing knobs across five schemas                                                                 | partially confirmed (0.8)  | no, see verifier fix | yes      |
| F32  | P2  | tool surface and schema mismatch         | `strip_calendar_attendees_and_reminders` is unreachable; attendees hard-fail instead of degrading                                                    | partially confirmed (0.85) | no, see verifier fix |          |
| F33  | P2  | tool surface and schema mismatch         | Gmail connect handoff is mounted only for users already connected                                                                                    | confirmed (0.9)            | yes                  |          |
| F34  | P2  | dead engine leftovers                    | 25 always-true capability flags and five overlapping read/write classifiers                                                                          | partially confirmed (0.8)  | yes                  |          |
| F39  | P2  | contract lane too heavy for the actor    | After a single-outcome project contract, the answer pass still mounts create_onto_project                                                            | confirmed (0.8)            | yes                  |          |
| F40  | P2  | harness overhead on the critical path    | Three "wrong tool for this pass" repairs share one attempt and differ only in prose                                                                  | partially confirmed (0.75) | yes                  |          |
| F41  | P2  | failure handling brittleness             | feedback.ts shape assertions kill the turn instead of degrading                                                                                      | partially confirmed (0.85) | no, see verifier fix |          |
| F44  | P2  | dead engine leftovers                    | Web admission still runs the retired lexical intent classifier and two dead checkpoint queries on every non-prepared turn                            | confirmed (0.92)           | yes                  |          |
| F46  | P2  | dead engine leftovers                    | The supervisor package, its web shims, ports.ts, lifecycle-observability.ts and four loop modules are dead with zero production importers            | confirmed (0.9)            | yes                  |          |
| F51  | P2  | harness overhead on the critical path    | Pre-read claim fence duplicates the ledger fence                                                                                                     | confirmed (0.85)           | yes                  |          |
| F53  | P2  | harness overhead on the critical path    | Cancellation poll at 500 ms                                                                                                                          | confirmed (0.85)           | yes                  |          |
| F57  | P2  | harness overhead on the critical path    | Tool execution DAG, policy, and call_ref/after sidecar                                                                                               | partially confirmed (0.7)  | no, see verifier fix |          |
| F59  | P2  | harness overhead on the critical path    | Terminal timing: ~1,700 lines and four finalize RPCs for one observability event                                                                     | confirmed (0.85)           | yes                  |          |
| F64  | P2  | failure handling brittleness             | Resumability needs phase persistence and a post-start requeue path                                                                                   | confirmed (0.9)            | no, see verifier fix |          |
| F70  | P2  | skill apparatus is the wrong unit        | Half the productivity allowlist can never fire; the list and catalog overstate what the worker has                                                   | confirmed (0.85)           | yes                  |          |
| F71  | P2  | skill apparatus is the wrong unit        | What renders from the operational SKILL.md files is written for a different runtime                                                                  | partially confirmed (0.8)  | no, see verifier fix |          |
| F72  | P2  | skill apparatus is the wrong unit        | Research persistence has no carrier on the worker                                                                                                    | partially confirmed (0.85) | no, see verifier fix | yes      |
| F78  | P2  | provider routing and model config        | Provider order is half dead and the cheap endpoints are unused                                                                                       | partially confirmed (0.8)  | yes                  |          |
| F79  | P2  | provider routing and model config        | Reviewer share is flat at 25.7% and its cache ceiling is structural                                                                                  | partially confirmed (0.8)  | no, see verifier fix |          |
| F81  | P2  | provider routing and model config        | Default reviewer fallback chain contains a documented bad reviewer                                                                                   | confirmed (0.9)            | yes                  |          |
| F83  | P2  | eval gap                                 | Two prompt-size estimators under-report the billed prompt by 2.6-2.8x                                                                                | partially confirmed (0.85) | no, see verifier fix |          |
| F84  | P2  | harness overhead on the critical path    | A clarification costs a forced tool-free pass, and a direct write costs another                                                                      | partially confirmed (0.7)  | yes                  | yes      |
| F87  | P2  | eval gap                                 | Fixed since the window; verify the deploy, do not re-fix                                                                                             | partially confirmed (0.8)  | yes                  |          |
| F93  | P2  | prompt states what code enforces         | Verbatim-storage and stored-date fidelity rest on two prompt sentences; the byte-compare the battery does offline is not in the product              | confirmed (0.85)           | no, see verifier fix |          |
| F96  | P2  | dead engine leftovers                    | Phase-A route eval, open-brief control and @buildos/agent-orchestrator have no production consumer                                                   | partially confirmed (0.85) | no, see verifier fix | yes      |
| F97  | P2  | eval gap                                 | Battery scoring cannot emit the rubric's 0 for 'misleading success'                                                                                  | confirmed (0.9)            | yes                  |          |
| F98  | P2  | eval gap                                 | Judge route starts with a flash model and falls back to the acting model                                                                             | partially confirmed (0.8)  | yes                  |          |
| F99  | P2  | eval gap                                 | 20 harness unit tests (incl. the Cedar House oracle guard) never run in CI or before a battery                                                       | confirmed (0.95)           | yes                  |          |
| F103 | P2  | provider routing and model config        | 4,000-token cap with reasoning inside it bounds document bodies; cap-hit retry is wasted                                                             | partially confirmed (0.75) | yes                  |          |
| F104 | P2  | dead engine leftovers                    | Per-turn provider degradation latch is dead machinery                                                                                                | confirmed (0.9)            | yes                  |          |
| F105 | P2  | harness overhead on the critical path    | Three tool-call accumulators over the same deltas                                                                                                    | partially confirmed (0.85) | no, see verifier fix |          |
| F110 | P2  | eval gap                                 | Acting temperature and reasoning never evaluated                                                                                                     | partially confirmed (0.75) | yes                  |          |
| F111 | P2  | provider routing and model config        | The cheap-model constraint is a $4/month decision today                                                                                              | partially confirmed (0.8)  | yes                  | yes      |
| F116 | P2  | context loading and memory               | START HERE is cut at 2,400 chars from the end for half of DJ's projects (09-02 §2.6 still live)                                                      | confirmed (0.92)           | yes                  |          |
| F117 | P2  | date/time                                | Day buckets and rendered dates are UTC while the frame promises local; write receipts return UTC                                                     | partially confirmed (0.85) | yes                  |          |
| F118 | P2  | context loading and memory               | Interrupted-turn receipts spend their six slots on harness control results and drop the writes                                                       | confirmed (0.9)            | yes                  |          |
| F11  | P3  | prompt states what code enforces         | project_create states its rules three times per turn                                                                                                 | confirmed (0.92)           | yes                  |          |
| F15  | P3  | terminal-text guards damage good replies | Pre-tool lead-in prose is glued to the final answer without a separator                                                                              | confirmed (0.92)           | yes                  |          |
| F22  | P3  | prompt states what code enforces         | Section order differs between prepared-prompt hits and cold builds                                                                                   | partially confirmed (0.8)  | yes                  |          |
| F23  | P3  | prompt states what code enforces         | Three static rules with no measured effect or no situation                                                                                           | partially confirmed (0.75) | yes                  |          |
| F35  | P3  | tool surface and schema mismatch         | `list_onto_tasks` undersells its payload and nudges N+1 reads; `update_onto_task.project_id` is a lie                                                | partially confirmed (0.85) | no, see verifier fix |          |
| F36  | P3  | dead engine leftovers                    | `cancel_turn_contract` rides every turn; only meaningful with a pending contract                                                                     | partially confirmed (0.8)  | no, see verifier fix |          |
| F37  | P3  | dead engine leftovers                    | Stale comments and mismatched enums/vocabularies across sibling tools                                                                                | partially confirmed (0.75) | no, see verifier fix |          |
| F38  | P3  | eval gap                                 | Guard tests check `admitted` not `opening`, and never execute a mounted tool in its own context                                                      | confirmed (0.85)           | no, see verifier fix |          |
| F42  | P3  | failure handling brittleness             | A disposition plus one read on a gate pass is a permanent kill while two dispositions get a notice                                                   | partially confirmed (0.85) | yes                  |          |
| F43  | P3  | prompt states what code enforces         | Stale phase instructions accumulate as system messages for the rest of the turn                                                                      | confirmed (0.7)            | yes                  |          |
| F45  | P3  | dead engine leftovers                    | Dead exports and unreachable branches inside otherwise live loop modules (~520 lines)                                                                | confirmed (0.88)           | yes                  |          |
| F47  | P3  | dead engine leftovers                    | The /loop subpath is a host abstraction with one host; three injection slots exist only to cross the package boundary                                | partially confirmed (0.8)  | yes                  | yes      |
| F48  | P3  | failure handling brittleness             | validateExplicitProjectCreateName compares names case-sensitively, so capitalizing the user's name is rejected                                       | partially confirmed (0.85) | yes                  |          |
| F58  | P3  | harness overhead on the critical path    | reserve + begin are always adjacent                                                                                                                  | partially confirmed (0.8)  | no, see verifier fix |          |
| F60  | P3  | harness overhead on the critical path    | Research-capture evidence RPC on every project turn                                                                                                  | confirmed (0.85)           | yes                  |          |
| F61  | P3  | dead engine leftovers                    | statedFutureCapture: 490 lines for an auto-created task nobody asked for                                                                             | partially confirmed (0.85) | yes                  | yes      |
| F62  | P3  | harness overhead on the critical path    | liveVision downloads and hashes every image before the opening pass                                                                                  | partially confirmed (0.8)  | no, see verifier fix |          |
| F63  | P3  | harness overhead on the critical path    | Stalled sweeper as an in-process subsystem                                                                                                           | partially confirmed (0.6)  | no, see verifier fix |          |
| F65  | P3  | failure handling brittleness             | `recover_agentic_chat_turn` has no single source of truth                                                                                            | confirmed (0.9)            | yes                  |          |
| F66  | P3  | harness overhead on the critical path    | Five cosmetic stream events per turn                                                                                                                 | partially confirmed (0.7)  | no, see verifier fix |          |
| F67  | P3  | harness overhead on the critical path    | Prompt snapshot awaited inline with no deadline                                                                                                      | confirmed (0.8)            | yes                  |          |
| F73  | P3  | dead engine leftovers                    | Dead modules and dead branches                                                                                                                       | confirmed (0.85)           | yes                  |          |
| F74  | P3  | dead engine leftovers                    | Stale comments and config that will mislead the next change                                                                                          | confirmed (0.8)            | yes                  |          |
| F75  | P3  | prompt states what code enforces         | One regex classifier gates both the playbook and the worker's write-route rule                                                                       | partially confirmed (0.8)  | yes                  |          |
| F88  | P3  | eval gap                                 | agentic:health scores two metrics wrong                                                                                                              | confirmed (0.88)           | no, see verifier fix |          |
| F100 | P3  | dead engine leftovers                    | README documents model pinning and scaffold variants the worker never reads                                                                          | partially confirmed (0.85) | no, see verifier fix |          |
| F101 | P3  | eval gap                                 | Battery economics: time and deploy dependency, not dollars                                                                                           | partially confirmed (0.8)  | yes                  |          |
| F102 | P3  | dead engine leftovers                    | Worker attribution reports native for every attributed turn                                                                                          | confirmed (0.85)           | yes                  |          |
| F106 | P3  | dead engine leftovers                    | Dead route generality (openai_compatible kind, headers, multi-route loop)                                                                            | confirmed (0.85)           | yes                  |          |
| F107 | P3  | dead engine leftovers                    | model-tiering.ts is dead since one-engine                                                                                                            | confirmed (0.95)           | yes                  |          |
| F108 | P3  | provider routing and model config        | Cross-turn prompt caching is not a lever; do not spend on it                                                                                         | confirmed (0.85)           | yes                  |          |
| F109 | P3  | dead engine leftovers                    | Reasoning-event extraction is dead downstream                                                                                                        | confirmed (0.9)            | yes                  |          |
| F119 | P3  | dead engine leftovers                    | ~1,750 lines of dead code inside the lane-F files                                                                                                    | confirmed (0.85)           | yes                  |          |

---

## 11. Implementation status (this iteration)

Seven work packages ran in parallel under disjoint file ownership (2026-09-10, 41 findings), then one
integration agent ran every suite sequentially and an adversarial reviewer read the full diff. The
author then fixed the reviewer's three majors and four of its five minors and added two red/green
regression tests. Everything below is UNCOMMITTED and UNSTAGED in the working tree; receipts are in
[`agentic-chat-harness-audit-2026-09-08/receipts/`](./agentic-chat-harness-audit-2026-09-08/receipts/).

### 11.1 What landed, by package

| Package                      | Findings                                                                     | Headline changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1-prompt-and-context        | 6 fixed, 3 partial, 0 skipped (F01, F02, F11, F114, F115, F116, F117, F18)   | Worker write rule is an ordered recipe leading with the four direct cases; web-research rules render only on research phrasing; review-delegation rules deleted; START HERE inline budget 8,000 chars cut at a heading boundary; every open task (cap 18) and goal/milestone/plan (cap 12) rendered one line each with id, state, priority, local date, 80-char description; global renders every accessible project with id and open/overdue counts and no longer reads `project_logs`; all prompt dates are civil days in the user's zone; size-budget ratchet re-baselined 12,850 → 11,800 (measured 11,261). |
| A2-admission-and-skills      | 2 fixed, 3 partial, 0 skipped (F44, F69, F70, F71, F75)                      | Dead lexical intent classifier and the two checkpoint queries removed from admission (turn-intent/turn-outcome/checkpoint-service deleted); operational playbooks render on every write turn of their kind (dedupe kept only for craft preloads); the loaded-skills ledger message is gone from worker prompts; productivity allowlist trimmed to skills that can fire; task/document/calendar playbooks rewritten in mounted tool names (≤40 lines) under a plain "Playbook" heading; the skill-load-gate wrapper deleted.                                                                                      |
| B-tool-surface               | 5 fixed, 3 partial, 1 skipped (F02, F117, F25, F28, F29, F30, F33, F35, F37) | `delegate_task` off the global surface; `declare_read_only_turn` no longer mounted; `update_onto_document` description fixed (no `merge_llm`, no `merge_instructions`); `list_onto_tasks` describes its payload; `update_onto_task.project_id` no longer claimed required; `create_onto_project` drops the two empty-array requirements and regains the realm vocabulary; three opening-pass overrides lose "otherwise declare_turn_contract first"; catalog fitness snapshot re-baselined.                                                                                                                      |
| C-contract-and-reviewer-text | 2 fixed, 3 partial, 2 skipped (F02, F06, F07, F10, F36, F39, F43)            | Labels normalized instead of rejected (action-aware, as reviewer corrections already were) and their descriptions cut ~1,150 → ~250 chars; `project_id` filtered from `required_fields` and the schema says so; actor rules no longer ride the reviewer's evidence; the reviewer system prompt reformatted into blocks with every tested sentence kept verbatim (byte-stable across reviews); `ACTOR_COMMISSION_GUIDANCE[0]` tool-neutral; `cancel_turn_contract` dropped from the opening pass when no contract is pending; the answer pass after a fulfilled project contract is tool-free.                    |
| D-transport-and-models       | 6 fixed, 1 partial, 1 skipped (F104, F109, F50, F76, F77, F78, F80, F81)     | Route pin is a preference (`allow_fallbacks: true`), timeouts still attributed; the pin never re-requests a provider snapshot id (configured ids only); provider order reflects measured speed with Azure on the ignore list; reviewer reasoning effort set explicitly; the documented bad reviewer removed from the fallback chain; provider-attempt observations fire-and-forget into a per-turn pending set; dead degradation latch and reasoning-event extraction deleted.                                                                                                                                   |
| E-executor-resilience        | 4 fixed, 1 partial, 1 skipped (F118, F50, F53, F55, F56, F67)                | Thrown non-web reads with `read_tool_execution_failed` become recoverable model feedback (allowlist/context/ownership/cancellation stay terminal); partial fulfilment finalizes `completed` + `mutation_unfulfilled` on any post-start failure after a durable write (not only budget expiry); tool observations fire-and-forget and drain at finalization; cancellation poll 500 → 1,500 ms; prompt-snapshot await bounded; interrupted-turn receipts prefer writes over control rows.                                                                                                                          |
| F-guards-compaction-reads    | 4 fixed, 2 partial, 0 skipped (F113, F12, F13, F15, F19, F85)                | Sanitizer removes only the matched sentence and preserves line structure (lane-A false-positive fixture is a test); finalization guard replaces only real lead-ins without a question mark; blank line between lead-in and answer; every ontology compactor targets the cap minus the notice margin so results never degrade into cut JSON strings; overview payloads bounded at the source; calendar reads expose `calendar_read_failed` + `error_code`; the two read-saturation ladders are one message.                                                                                                       |

### 11.2 Verification

| Check                                                                                        | Result                                                                                                                  |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @buildos/agentic-chat-runtime typecheck`                                      | clean                                                                                                                   |
| `pnpm --filter @buildos/agentic-chat-runtime exec vitest run`                                | 47 files / 484 tests passed                                                                                             |
| `pnpm --filter @buildos/agentic-chat-runtime build`                                          | ESM + CJS + DTS success                                                                                                 |
| `pnpm --filter @buildos/worker typecheck`                                                    | clean                                                                                                                   |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChat`                            | 71 files passed (3 live skipped); 996 tests passed, 19 skipped                                                          |
| `pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat-lite src/lib/serv` | 327 passed, 1 failed on first run (my own new calendar crosscheck case); rerun of affected targets 9 files / 108 passed |
| `pnpm --filter @buildos/web check`                                                           | 0 errors, 0 warnings (after fix); first run 3 errors                                                                    |
| `node scripts/docs/check-doc-health.mjs`                                                     | exit 0; dead-schema 0, dead-paths 0, 6 unstamped docs all pre-existing (committed 6db131447)                            |
| worker `tests/agenticChat` after the review fixes                                            | 71 files, 997 passed, 19 skipped; typecheck clean; touched files prettier clean                                         |

One test stays red on purpose: `apps/web/src/routes/api/agent/v2/prewarm/server.test.ts` expects the loaded-skills ledger message that F69 removed; the route file is under `routes/**`, which another session is editing, so the assertion flip is a handoff (below).

### 11.3 Review findings and what was done about them

The adversarial reviewer (`receipts/REVIEW.md`) found no blocker, three majors and five minors. Fixed by the author, each with a regression test proven red without the fix:

- **Major, F56.** A mutation whose effect committed but whose receipt row then failed to persist entered the partial-completion lane and would have disclosed a real write as "not yet done". The persist failure is now tagged (`AgenticChatCommittedEffectPersistError`), classifies as its cause for recovery, and keeps the failure route. Test: `keeps the failure path when a committed mutation receipt cannot be persisted after a durable write`.
- **Major, F39.** The tool-free forcing after a project shell keyed on the completion continuation being null, which is also null for touched-but-unfulfilled child outcomes; a partially executed child batch would have lost its write surface. It now also requires zero unfinished contract outcomes. Test: the composite shell test's new round 5 (goal + two tasks succeed, one fails) asserts the next pass still mounts `create_onto_task`.
- **Major, F33.** The `request_email_account_connection` description claimed it is mounted only when no Gmail account is connected, but the web mount (reverted at integration) still mounts it for connected users. The description now states the real condition; mounting it for unconnected users stays an open handoff.
- **Minor.** The merged read-saturation message regained "or perform the requested change now" so a commissioned write on the third read round is not told to answer instead. The document playbook no longer claims title-only updates need content. Date-only stores at UTC midnight (milestone due dates, editor `start_at`) render as their stored civil day instead of the previous day in US zones. Raw driver text (PostgREST codes, SQL state, row text) in a permanent read failure is replaced by a generic message before it reaches the model.
- **Minor, recorded not changed.** With `permanent` in the partial-completion set, an allowlist or context rejection of a private read after a durable write now ends `completed` + `mutation_unfulfilled` with the disclosure rather than `failed`. The tool still never executes (fail-closed holds); the terminal status is the better user outcome and is noted here for the health report.

### 11.4 Open handoffs (specified, not done)

- WP-A1 1 / WP-B (F02): six remaining 'otherwise declare_turn_contract first' overrides in mutationToolCatalog.ts — WP-A1 wants all nine removed, WP-B narrowed to the three opening-pass tools; F75 verifier's additions conflict; one decision
- WP-A1 2 (F01): utility.ts delegate_task base description restraint sentence — WP-B's worker override already carries one; decide whether the web/MCP base needs it (changes catalog SHA)
- WP-A1 3 (F18): drop model_context_notice in tool-payload-compaction.ts and reduce last-turn-context.ts continuity hint — requires cedar-house case 9 turn 2 rerun before merge
- WP-A1 4 (F11): reviewer copy of projectCreateShellGuidance in review/turn-contract.ts — WP-C's investigation shows the reviewer sees it once (evidence drops system messages); treat as resolved unless WP-A1 disagrees
- WP-A1 5 (F114): load_fastchat_context.sql LIMIT 18 -> 40 migration, then raise PROJECT_CONTEXT_TASK_LIMIT + PROMPT_OPEN_TASK_LINE_LIMIT and re-baseline prompt-size-budget.test.ts
- WP-A1 6 (F115): drop project_logs from the global SQL branch; mount list_onto_projects on the global surface
- WP-A1 7 / WP-B 7 (F117 worker): project mutation receipts to the user's timezone at the model-visible boundary in turn-executor.ts via a memoized turnTimezoneFor on the read port; ambiguity on which of the three receipt copies (chatToolResult / published tool_result / returned execution.result) projects
- WP-A2 4 (F69 prewarm): routes/api/agent/v2/prewarm/+server.ts + server.test.ts — the one remaining red test; routes/\*\* owned by another session
- WP-A2 7 (F70 content): project_creation SKILL.md shell-only rewrite; fold google_calendar into calendar_management + blog redirect
- WP-A2 9 (F75 keying): worker write recipe intent-keyed vs mount-keyed — one decision in situational-rules.ts
- WP-B 4 (F33 web half): email-surface-mount.server.ts via getGatewayEmailSurfaceToolNames — applied then reverted; also breaks seven exact-surface pins in worker-turn-preparation.test.ts incl. project_create growing 6 -> 7 tools (product question)
- WP-B 8 (F25): mutationAdapterBoundary.ts:98 ontology-context fence — entityId may be a non-project entity; needs a project check before applying as written
- WP-B 9 (F28): tool-surface.ts:94/:163 artifact-only strips removable after the 90 s prepared-prompt window (another session editing that file)
- WP-B 10 (F29 follow-up): project-create-args.ts default missing arrays to []; then drop the two optional properties from the worker projection and trim three prompt lines
- WP-B 11 (F35 payload message): ontology-reads.ts:835 — check stripToolDiscoveryHintsFromPayload under advertiseMaterializedTools:false first; two worker fixtures embed the old text
- WP-C 2 (F36 web side): remove cancel_turn_contract from static surfaces and append in admission only when pendingTurnContract !== null (surface pins + snapshot)
- WP-C 3 optional (F39): validation.ts turnContractOutcomeAuthorizesCall rejecting a second create for a fulfilled targetless create outcome
- WP-C 4 (F43): replacePhaseInstruction helper in request-builders.ts + five phase sites
- WP-D 4 (F104): provider degradation latch deletion across providerCapacity.ts, capacity.ts, provider-pass.ts, turn-provider.ts, contracts.ts, README.md:82, composition-root.ts and three test files
- WP-D 6 (F81 env, DJ): Railway AGENTIC_CHAT_REVIEWER_MODEL=openai/gpt-5.6-luna, AGENTIC_CHAT_REVIEWER_FALLBACK_MODELS= (empty)
- WP-D canaries before keeping F76/F78/F80: same-provider continuation rate, pinned-pass retryable receipts, per-provider p50/p90 incl. StreamLake/GMICloud, 09-04 reviewed-write battery + three-email restraint case with reasoning-token counts
- WP-F 2 (second half): drop gatewayModeActive from buildToolValidationRepairInstruction (only caller passes false; true branch pinned by repair-instructions.test.ts:168)
- WP-F 3: DEFAULT_AGENTIC_CHAT_MAX_TOOL_ROUNDS 16 -> 12 — production default via CHAT_MAX_TOOL_ROUNDS; product decision
- WP-F 5: agentic:health calendar outage count from result->>'calendar_read_failed' / error_code
- WP-F 6: overview-helper.ts entity_counts/entity_totals source duplication (needs utility-executor.overview.test.ts edits)
- WP-F 7: record_references appended after the size guard (~9.5k chars worst case) — separate decision

### 11.5 Behaviour differences a battery rerun should expect

- [A1] Worker-bound 'Rules for This Turn' write block no longer names declare_turn_contract; it lists the four resolved direct cases first and says the worker routes the rest to review.
- [A1] Web-research rules render only when the message reads as web research; the review-delegation block never renders (its rule lives on the delegate_task description). Mounted web_search/web_visit/delegate_task alone no longer make a turn 'situational'.
- [A1] START HERE renders up to 8,000 chars (was 2,400), cut at a heading boundary with omitted headings named in the preamble and slots; 'untrusted' appears once as a header tag; the shared MCP excerpt budget is unchanged.
- [A1] Project context renders every loaded open task/goal/milestone/plan/windowed event as a line with id, state, priority, local date + relative day, and an 80-char description (dated items stay only in the dated lines; recent-change lines do not suppress a work line); dated intelligence task lines show 'priority N'.
- [A1] The JSON loaded-context index shrinks to focus_entity + linked_entity_refs (now skipping only the focus ids) + documents the Knowledge Map does not list, and is omitted when empty (global and daily-brief turns no longer carry a JSON index); a one-sentence completeness line from entity_scopes replaces context_meta/loaded_counts/intelligence-count metadata.
- [A1] Global context lists every accessible project with id, state, next step and open/overdue/in-progress/blocked counts (cap 80 with an honest tail); bundle lines no longer show a 'done' count; the 'More projects exist' pointer only renders for payloads without an index.
- [A1] Loader: the open-task rollup query covers every accessible project and filters to open tasks server-side (cap 2,000); GlobalContextData gains project_index; bundles lose recent_activity; context_meta loses recent-activity window fields; payload.project_logs is ignored on the RPC path and onto_project_logs is no longer queried on the fallback path, so the fal
- [A1] Every rendered date is the user's civil date and every relative day ('today', 'in 3 days') is computed in the user's zone from the instant; the SQL days_delta is no longer trusted for labels or the 45/90-day overdue windows.
- [A1] Digest path (no SQL intelligence): timeline lines carry ids, due-soon and upcoming lists are disjoint, the 'Next scheduled item' repeat is gone, and 'Top open tasks' left the status lines for the work block.
- [A1] Reviewed-shell project_create workflow is four lines (state_key vs props.facets.stage rule and the duplicate clarification rule dropped).
- [A1] Size ratchets: system-prompt cap 12,850 → 11,800 (measured 11,261); tool-schema per-turn cap 31,200 → 32,000 for concurrent Lane B growth.
- [A2] Every non-prepared admission makes two fewer DB calls (checkpoint RPC + chat*turn_checkpoints select); user messages no longer carry supervisor_resume*\* metadata and artifacts never carry resumeCheckpoint (field stays in the contract).
- [A2] On turns 2..n of a task/document/calendar editing session the model gets the playbook every time its intent fires (~3,000 chars) instead of a 485-char loaded-skills ledger naming skill_load and no playbook; the ledger message is gone from all worker prompts.
- [A2] Craft/explicit-ask/affinity preloads still fire at most once per history window on the admission-window path; on a prepared-admission hit they can fire again (documented gap).
- [A2] The preload block opens with 'Playbook for task writes this turn:' (or 'Playbook for this turn (<Skill>):') and no longer carries Source / Skill-load gate: SATISFIED BY PRELOAD / Next step: do not call skill_load or outcome_card_load / reference-modules-unavailable text.
- [A2] task_management and document_workspace playbooks name only worker-mounted snake tools, are ≤40 rendered lines, show the update-by-exact-id example by default, the create example on create-verb turns, the organize example on organize-verb turns; the packaging H4 block is gone from the public markdown too (Related Tools dotted ops unchanged).
- [A2] Automatic preload is possible only for six reachable skills (google_calendar, people_context, plan_management, project_creation, research_capture, task_state_updates dropped from the allowlist; all stay registered and loadable).
- [A2] Polite question-led writes ('Can you schedule a call…', 'Could you assign this to Sam?', 'set the due date', 'fix the title', 'put … on hold') now classify as writes and get the playbook + write rules; 'How do I fix the build?' trips the four-line write rules but never a playbook.
- [A2] worker-turn-preparation.server.ts no longer passes reviewDelegation to resolveLitePromptTurnSituation (WP-A1 made the param ignored); two worker-turn-preparation.test.ts assertions were aligned to WP-A1 (no reviewDelegation) and F25 (delegate_task not on global) — restore them if either package is reverted.
- [A2] Survive list respected: Finding 11 addendum, direct-write floor and restraint canary, SHA-bound approvals, fail-closed unknown tools, terminal-truth invariants, worker never imports web source, reviewer prompt/approval tools, context-only tool surfaces (only the playbook and rules key off the message, never the mounted surface), idempotent usage receipts — n
- [B] Global turns no longer mount delegate_task (global opening pass 31,085 B -> 26,967 B); project turns keep it, now with an explicit 'only delegate when the user asks for background or review-staged work' sentence in the description.
- [B] No static surface mounts declare_read_only_turn; the reviewer lane still builds its own copy and already-prepared artifacts listing the name are still filtered (not refused).
- [B] update_onto_document on the worker no longer accepts merge_instructions (a model that sends it now gets mutation_arguments_not_admitted from the boundary like any unreviewed argument) and no longer mentions merge_llm anywhere in its projected schema; the reject_merge_llm normalizer remains as a second lock.
- [B] create_onto_project on the worker accepts a call with no entities/relationships (adapter defaults them to []); the projected schema no longer requires them and they appear as optional default:[] properties; a populated array is still refused.
- [B] list_onto_tasks description states its real payload and the exact total; update_onto_task.project_id and create_onto_task.type_key descriptions now describe what the code does (catalog SHAs for these tools change).
- [B] link_onto_entities kind descriptions on the worker no longer list 'project'.
- [B] The three opening-pass write descriptions (update_onto_task, update_onto_document, link_onto_entities) no longer tell the model to call declare_turn_contract; they say the worker routes unresolved targets to review.
- [B] Email group by mailbox state (effective once the one-line web mount change lands): un-connected users get the 743 B request_email_account_connection handoff on every turn; connected users get the four read tools and lose the handoff (second-account connect from chat is no longer possible while connected).
- [B] request_email_account_connection's description changed for every host that renders it (no longer says 'Call get_external_account_status first'; spells out the user_confirmed two-call flow).
- [B] Two unowned tests currently fail as a direct consequence and need the handed-off edits: the worker surface-budget ratchet (project 39,126 B > 39,000; project_create 12,500 B > 12,400) and the pinned update_onto_document reviewed-field list / create_onto_project required list in agenticChatTurnProvider.test.ts.
- [C] declare_turn_contract calls whose only faults were a misplaced/over-scoped label or project_id in required_fields/changes now succeed; the declared result carries normalization_notes naming each drop (previously a bounded validation-repair round, +1.6 passes / +38k tokens / +38 s per rejected turn per the audit).
- [C] A contract that still fails after a drop lists the dropped-label note after its rejections (within the 5-item cap), so a dangling parent_label caused by a dropped label is explained.
- [C] Reviewer corrections carrying project_id in required_fields are accepted instead of failing closed as unexecutable_effect_fields.
- [C] Reviewer system prompt is five titled blocks with paragraph breaks instead of one 9,672-char paragraph; same rule set (one merged clarify rule); still one static string, byte-identical across reviews, so the cache prefix changes once at deploy.
- [C] The reviewer no longer receives the 'Rules for This Turn' section (~2.7k chars of web-research/delegation rules and the preloaded playbook per review).
- [C] Actor routing message (both variants) and the disposition gate no longer say 'calls declare_turn_contract first'; the line is tool-neutral.
- [C] Opening pass on global/project turns without a carried-forward contract no longer mounts cancel_turn_contract (~420 B); a turn whose history carries the pending-contract message still does; the admitted surface for later passes is unchanged. Legacy shell-only Project Setup artifacts force-mount only the gate pair.
- [C] Project Setup opening gate carries the shell rules once instead of twice.
- [C] contract-fields.ts unknown-field message for non-document kinds no longer mentions project_id.
- [C] turn-phase.ts: TurnPhaseEvent budget limit is now only 'force_synthesis'; surfaceFor no longer accepts openingTools (never passed by the provider).
- [D] Pinned passes send provider.order: [slug] with fallbacks allowed; OpenRouter routes a pass the pinned endpoint cannot serve inside the request instead of returning 404 to the client. A 404 on a pinned pass is now permanent (retryable: false).
- [D] A pre-stream 4xx/5xx on a pinned request that names no provider adds nothing to provider.ignore (previously the pinned slug was ignored). Pre-stream timeouts on a single-ordered request still ignore that endpoint.
- [D] The turn pin, preferredModels, failedModels and lastResponse only hold configured model ids; a provider's snapshot id is never sent as a request model. Usage rows and attempt receipts still record the reported (snapshot) id.
- [D] Acting route provider order is deepinfra, gmicloud, alibaba, streamlake with ignore: ['azure'] (was deepinfra, deepseek, alibaba, cloudflare with no ignore).
- [D] The semantic reviewer route no longer inherits the acting route's provider ignore list; it carries allow_fallbacks: true and its own order (Luna: openai, azure).
- [D] contract_review and mutation_review requests send reasoning: { effort: 'low', exclude: true }; other pass roles unchanged.
- [D] Default reviewer fallback chain excludes z-ai/glm-5.3-flash (now gemini-3.7-flash, glm-5.2, deepseek-v4-pro); an explicit AGENTIC_CHAT_REVIEWER_MODEL policy is unaffected.
- [D] provider_attempt_started/ended observation RPCs are no longer awaited on the pass (two serial round trips per pass removed); they settle during the executor's pre-fence drain of the shared AGENTIC_CHAT_PENDING_EFFECTS_REGISTRY. Usage receipts remain awaited before done.
- [D] The client never emits { type: 'reasoning' } events; reasoning tokens are still accounted from the usage receipt.
- [E] A private read that throws inside the shared implementation (access denied on a well-formed guessed id, not-found, semantic argument checks, control-tool validation text, DB/PostgREST errors) no longer ends the turn with 'An error occurred while streaming.'; the model receives a failed tool result (adapter message for 'permanent', 'The read could not be comp
- [E] A post-start failure of class permanent, transient_infra, unknown, provider_throttle or timeout_post_start after at least one durable write now finalizes completed / mutation_unfulfilled with the 'Done: N of M ... Not yet ...' disclosure, last_turn_context and a done event instead of failed with the generic error. Health dashboards keyed on status='failed' s
- [E] Worst-case user-visible cancel latency during a silent provider phase rises from 0.5 s to 2 s; cancellation-poller RPC load drops 4x. Cancel during a write is unchanged (write RPCs return cancel_requested). The non-owned observer test pinning 500 ms fails until its handoff lands.
- [E] Tool observation rows and the prompt snapshot no longer sit on the tool critical path (about two serial RPC round trips per tool call and one per turn removed); they are joined once before each terminal fence, so a turn's tail can wait up to 5 s for a slow observation RPC that previously stalled mid-turn. Same rows, same keys, same generation; port call orde
- [E] AgenticChatPromptSnapshotPortV1.persist now receives a deadline AbortSignal as an optional second argument; a write hung past 15 s is cancelled and reported through onPromptSnapshotError. AgenticChatExecutorEffects accepts an optional pendingEffects port (default: the process-wide registry shared with the provider client).
- [E] New shared module apps/worker/src/workers/agentic-chat/pendingEffects.ts (this package's AgenticChatPendingEffects + WP-D's registry/singleton); no migrations, views, harness telemetry or canary touched; execution-adapter.ts left byte-identical.
- [F] Sanitized replies keep markdown structure (headers, bullets, tables, single line breaks, decimals); only matched sentences are removed; sentences under 8 chars are no longer dropped.
- [F] Finalization guard no longer replaces short read answers that merely contain check/find/update/… or end with '?'; only sentence-opening promise shapes (I'll / let me / first I / one moment …) are replaced.
- [F] Worker text_delta stream: the first prose of any later pass is prefixed with \n\n when the previous pass's prose ended mid-line; persisted assistant text gains a paragraph break at that seam.
- [F] Tool results over budget are never JSON strings: structural trimming with <key>\_omitted, omitted_keys, payload_truncated, payload_original_length markers; compactors target 5,600 chars so the notice wrapper never triggers the outer guard.
- [F] Search/explore results: gained priority/start_at/due_at/updated_at/bucket_key/chunk_anchor, snippet <=200 (shrinks to 80), lost path/matched_fields/why_matched/ranking_factors/rank_score; explore_project now compacted.
- [F] Model payloads for get_workspace_overview/get_project_overview carry one merged counts block (total_tasks/documents/plans/goals) instead of counts + entity_counts; activity <=2 items, 120-char text, no actor id/change source; list_onto_tasks drops props (keeps facets) and bounds description to 200; create/update_onto_document receipts carry content_length +
- [F] Overview source payloads: description/next_step_short <=200 chars, workspace per-project activity <=2 (was 3).
- [F] Calendar read payloads carry top-level calendar_read_failed: true + error_code on a total Google outage (list, details when provider unreachable, project calendar when no port); still success: true.
- [F] One read-saturation system message per round without counters ('Context gathering: narrowing|saturated|must synthesize. …'); the 3/6/8 read-round floor now lives in the ledger; ledger status is monotonic between write rounds; sanitizer strips an echoed 'Context gathering:' sentence.
- [F] turn-provider DEFAULT_MAX_PROVIDER_ROUNDS constructor default 16→12 (production passes the config value; CHAT_MAX_TOOL_ROUNDS default in turn-executor unchanged at 16).

### 11.7 Post-iteration browser rerun (2026-09-10) and Tier 0 repairs

The §11 iteration was re-tested through the real UI
([`output/playwright/agentic-chat-browser-audit-2026-09-10.md`](../../../output/playwright/agentic-chat-browser-audit-2026-09-10.md)):
**38/52 comparable (C), down from 45/52**, with the five load-bearing gates 0/5. The split is
clean and matches what §11 actually changed: every read/reason case scored 4/4 (grounding,
injection resistance, DST, honest unknowns — cases 5, 6, 9, 11, 13, 14), and every failure was on
the write path, which §11 did not touch because it is Decision 1 in §8.

Four Tier 0 defects were root-caused in code and fixed the same day; each carries a regression test
proven red without its fix.

| #   | Defect                                                                              | Root cause                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Fix                                                                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The global open-task rollup fails on every turn (`22P02`)                           | F115's new `.not('state_key','in', …)` filter was built from `COMPLETED_STATE_KEYS` (`done, completed, closed, archived, cancelled, canceled, abandoned`), but `task_state` only has `todo, in_progress, blocked, done`. Postgres rejected the query and the rollup degraded to `null` every time — the feature never once worked.                                                                                                                                                                                                                  | `context-loader.ts` derives the filter from `Constants.public.Enums.task_state` and uses `.in()`. The test mock now rejects any non-enum `state_key` filter, so this class cannot ship again.                                                                                                                                |
| 2   | **P0** No project can be created (cases 1, 2)                                       | Deterministic deadlock. `turn-contract.ts` dropped a labelled create's label with a note saying _"a labelled create must declare its title in changes"_; `validation.ts:231` hard-rejects any project outcome that carries `changes`. Adding the title → rejected; omitting it → label dropped → any dependent `parent_label` dangles. The model oscillated until the 3-attempt repair budget ran out, ending `provider_forced_synthesis_failed`. `create_onto_project` is `directWriteClass: 'contract_required'`, so there was no path around it. | A project label is unreferenceable by construction (endpoint labels must name a non-project create; `parent_label` binds a document parent), so it is now dropped with a note that states that and never asks for a change. The shell-validator message says the label is kept-free so children use the returned project id. |
| 3   | **P0** A task write creates a calendar event under an explicit prohibition (case 4) | `calendar_sync` defaults to `'auto'` at the REST layer — right for the UI, wrong for an agent — and nothing in the harness forced the switch the model omitted.                                                                                                                                                                                                                                                                                                                                                                                     | New `default_calendar_sync_none` argument normalizer on `create_onto_task`/`update_onto_task`, plus the same default in the web executor. Silence now means no event; `'auto'` must be explicit. Schema default and description flipped to match.                                                                            |
| 4   | A correct no-op is reported as an unfinished write (case 3)                         | The machinery was already right — cancelling a contract nulls it and yields a clean terminal — but `cancel_turn_contract`'s description said _"only when the user explicitly cancels or supersedes it"_, forbidding the exact use the case needed.                                                                                                                                                                                                                                                                                                  | The description now names the already-satisfied case as a legitimate cancel and says leaving the contract open reports the turn as an unfinished write. The restraint ("never cancel because a write failed, was rejected, or looks hard") is kept.                                                                          |

Eval-loop repairs (Decision 8, lean option) landed with them:

- **J7.** `vitest.config.ts` excluded the whole `agentic-e2e/` tree, so the harness's own pure unit
  tests — including the Cedar House oracle guard — never ran in CI. The exclude now names only the
  suites that make real turns; **19 files / 100 tests** run in the normal suite.
- **J5.** New `misleading_success` result class scoring **0**. Every deterministic assertion failure
  previously mapped to `behavior_failure` (1), so "I updated that for you" over a database that
  disagrees — the most user-damaging shape — was indistinguishable from an honest miss.
- **J6.** The judge ran on the `powerful` JSON profile, whose first choice is a flash model and whose
  last fallback is `deepseek/deepseek-v4-flash`, the acting model. It now pins an explicit strong
  chain, uses the `maximum` profile (no acting-model fallback), and throws if any model under test
  appears in its route.
- **J9.** Case 1 matches the created project on a normalised name key and reports punctuation drift
  as a soft note instead of failing a case about dates and budget. Case 2 accepts a real
  relationship edge **or** prose for a prerequisite, as its own prompt asks.

Verification: runtime 486 tests + typecheck + build clean; worker `tests/agenticChat` 1001 passed /
19 skipped + typecheck clean; web agentic suites 1165 passed; `pnpm --filter @buildos/web check` 0
errors. One pre-existing failure remains and is unrelated:
`tool-surface-size-report.test.ts` expects `project_create` to mount 7 tools and it mounts 6 — that
is the WP-B 4 handoff in §11.4 (the email surface mount, applied then reverted at integration).

**Still owed, in order:** Decision 1 (the contract lane). Tier 0 removes the deadlock but not the
DSL: 18 `rejectOutcome` sites and a label sub-language remain, and case 2's failure was the label
grammar, not the project rule. DJ chose the ambitious option — SHA-bound batch approval — as the
next project. Then the latency work, which largely falls out of it (contract writes 7 passes / 83 s
versus direct writes 2 passes / 18 s). Case 10 stays blocked until the five Railway calendar
credentials land.

### 11.8 Decision 1 built: SHA-bound mutation batch approval (2026-09-10)

DJ chose the ambitious option. The new write lane is **built, on by default, and green**; the
contract lane is still in the tree behind a migration seam and is deleted once one battery confirms
the cutover. Nothing was ripped out blind.

**What the lane does.** The acting model proposes the exact tool calls it wants. The harness
withholds that batch, digests it, and shows the reviewer the calls and their real arguments plus the
schemas of the tools involved. The reviewer approves the digest, rejects with a reason, downgrades
to read-only, or asks the user. On approval the harness executes **the same held call objects** —
there is no acting pass between approval and execution, so the executed arguments are the approved
arguments by construction. That is F08 closed structurally rather than by instruction.

| Ladder                                                          | Contract lane                                                        | Batch lane                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------ | --- | --- | --- | ------------------------ | ------------------------------------------------- |
| Acting passes for a complex write                               | propose → gate (declare DSL) → carve-out (re-propose calls) → answer | propose → answer                           |
| Reviewer sees                                                   | a DSL description of the intended change                             | the calls and arguments that will run      |
| Reviewer can author content                                     | yes (`corrected_contract`) — the source of the six `##2`/`           |                                            |     |     |     | ` corrupted writes (F04) | no; it returns a reason and the actor re-proposes |
| Deterministic rejection reasons before a write can be attempted | 18 `rejectOutcome` sites plus the project-shell validator            | none — there is no vocabulary to get wrong |
| Cross-turn pending state                                        | pending contract carried in artifact metadata                        | none; a batch lives for one turn           |

**Measured in the provider fixtures:** one acting pass and one reviewer pass for a four-task batch
that previously needed three acting passes plus a review. The rejection path costs exactly one extra
acting pass and one extra review, and the second review is bound to the corrected batch.

**Files added**

- `packages/agentic-chat-runtime/src/loop/mutation-batch.ts` — batch model, digest, fulfilment,
  durable round trip. The digest covers tool names, canonical arguments and ordering, and
  deliberately excludes provider call ids so a re-streamed proposal after a transport retry keeps
  its approval instead of paying for a second review.
- `apps/worker/src/workers/agentic-chat/provider/review/mutation-batch.ts` — the reviewer prompt
  (one static string, so the prefix still caches), the review request, and the revision request that
  hands a rejected batch back on the ordinary acting surface.
- `MUTATION_BATCH_REVIEW_APPROVAL_TOOL` and `MUTATION_BATCH_PROPOSAL_REVISION_TOOL` in
  `review/controls.ts`; `completeMutationBatchReviewDecision` in `review/decision-completion.ts`;
  `approve_mutation_batch_review` is now executable in `tools/execution-adapter.ts` (it had been a
  vestige of the retired batch lane).
- Phases `batch_withheld` / `batch_approved`, events `withhold_batch` / `approve_batch` /
  `revise_batch`, and the `mutation_batch_review` reviewer surface in `turn-phase.ts`.

**Fail-closed properties, each with a test.** An approval whose SHA does not match the held batch
ends the turn with `semantic_review_failed` and no mutation. `validateApprovedMutations` re-hashes
the executing calls against the approved batch and refuses anything else. A rejected batch never
executes. The direct-write floor is untouched: one resolved create in the focused project still
takes the two-call lane with no reviewer.

**Terminal truth is verified, not assumed.** An approved batch executes as ordinary write calls, so
the existing implicit-contract path already measures fulfilment from receipts. Two tests pin it: a
half-landed batch has its "created all four" claim corrected against the receipts, and a fully
executed batch's honest report is left alone.

**Prompts needed no change.** §11's A1 rewrite of the worker write rule ("Any other existing-entity
write is routed to review by the worker after you propose it; you do not choose the route") and
`ACTOR_COMMISSION_GUIDANCE[0]` already describe the batch lane exactly. The DSL was never something
the actor was told to use in the current prompt — only the tool descriptions and the gate carried it.

**Config.** `CHAT_MUTATION_BATCH_LANE` defaults to `true`. Set it to `false` for one deploy to fall
back to the contract lane if the battery finds a regression. The flag and the contract lane are
deleted together.

**Verification:** runtime 496 tests + typecheck + build clean; worker `tests/agenticChat` 1009
passed / 19 skipped + typecheck clean; web 1165 passed, `pnpm --filter @buildos/web check` 0 errors.
The one pre-existing failure (`tool-surface-size-report`, `project_create` mounts 6 tools not 7) is
the §11.4 WP-B 4 handoff and is unrelated.

**Not done, deliberately.** The ~4,000-line deletion — `loop/turn-contract.ts`,
`review/turn-contract.ts`, `contract-fields.ts`, `reviewedTurnContract.ts`, the contract half of
`validation.ts` (including the project-shell validator whose contradiction with the label rule was
the 09-10 P0), the `declare_turn_contract` / `cancel_turn_contract` /
`approve_turn_contract_review` controls, the carve-out and completion continuations, and the
cross-turn pending-contract metadata on the web side. Deleting it before the battery runs would
leave no way to compare the two lanes on one release, which is exactly the mistake §11 made. Run the
13-case battery with `CHAT_MUTATION_BATCH_LANE=true`, then delete.

### 11.6 Deploy notes

- No migration in this iteration. Web and worker deploy together (surfaces, descriptions and compaction are shared through `@buildos/agentic-chat-runtime`).
- Railway: set `AGENTIC_CHAT_REVIEWER_MODEL=openai/gpt-5.6-luna` explicitly and leave `AGENTIC_CHAT_REVIEWER_FALLBACK_MODELS` empty (F81); the five calendar credential variables from the one-engine handoff are still owed (lane I §3.8).
- Before trusting F76/F78/F80 in production, watch for seven days: same-provider continuation rate, pinned-pass retryable receipts, per-provider p50/p90, and rerun the reviewed-write battery plus the three-email restraint case.
- Then rerun the five battery cases from lane I §5 on one release with the corrected oracle (F92).

---

## Appendix: method, limits, evidence

- Lanes and their reports: `agentic-chat-harness-audit-2026-09-08/lane-{A,B,C,D,E,F,G,H,I,J,K}-*.md`.
- Verified findings with verifier corrections: `agentic-chat-harness-audit-2026-09-08/evidence/findings-verified.json`.
- Production pulls (select-only, aggregates and anonymized per-turn rows, no message text):
  `evidence/lane-h-summary.json`, `evidence/lane-h-turns.json`, `evidence/health-2026-09-08.json`,
  `evidence/lane-F-*.json`, `evidence/lane-K-*.json`; the scripts beside them read `apps/web/.env`
  at run time and never print keys or emails.
- Measurement scripts: `evidence/lane-A-measure-*.mjs`, `lane-B-*.mjs`, `lane-C-*.mjs`,
  `lane-D-graph.mjs`, `lane-G-measure-preload.mjs`.
- Limits: the production window is 4.4 days and 52 of its 55 turns are scripted; the completeness
  critic and gap-fill round did not run (session limit), so areas no lane owned (the chat UI
  contract, the MCP server's parallel tool descriptions, RLS on worker execution, attachments) are
  unaudited; no suite was run during the audit; lane conflicts were resolved by the author in §3-§8
  and are listed verbatim in `findings-verified.json` under `conflicts`.
