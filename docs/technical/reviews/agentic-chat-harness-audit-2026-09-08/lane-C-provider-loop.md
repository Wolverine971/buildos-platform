<!-- docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/lane-C-provider-loop.md -->

# Lane C — The provider loop (worker turn coordinator)

Audit date 2026-09-08. Working tree at HEAD `6d70b36e1` plus the uncommitted feedback-kind fix.
Read-only review of `apps/worker/src/workers/agentic-chat/provider/**`, the runtime loop pieces it
calls, and the production batteries in `artifacts/`. No suite was run; every number below comes from
reading code, `node -e` measurements (scripts and raw output in `evidence/lane-C-*`), or the retained
battery JSON.

Question this lane answers: is the control flow that turns model responses into passes, reviews,
repairs, and writes the right shape for a cheap acting model (DeepSeek v4 flash) plus a separate
reviewer (GPT-5.6-luna)? What is over-engineered, what is missing, and what hurts a weak model?

**Bottom line.** The loop's safety spine (atomic buffered passes, SHA-bound approvals, the
deterministic direct-write floor, the 12-pass ceiling with receipt-grounded synthesis, the
partial-batch disclosure) is sound and should be kept. Around that spine sits a contract abstraction
(`declare_turn_contract` → contract review → re-propose → post-hoc fulfilment) that costs a weak model
two extra acting passes per complex write, exposes 38 deterministic rejection reasons plus 12
reviewer-format rejections, cannot carry the values it is supposed to protect (160-char cap, no
prose), and — since the 09-04 "reviewer collapse" deleted the mutation-batch review — no longer
compares the approved intent with the concrete arguments that execute. The three production batteries
show the reviewer approving 10 of 33 decisions, sending 17 back for revision, and dead-ending 4 of 6
double-revision turns in a clarification the user did not need. A simpler protocol — the acting model
proposes the exact tool calls, the reviewer approves the batch SHA, the harness executes exactly that
batch — preserves every invariant DJ named (no guessed writes, SHA-bound approvals, atomic passes,
bounded rounds) with roughly 4,000 fewer lines and one to three fewer model calls per complex write.

---

## 1. The state machine as it exists

Source: `apps/worker/src/workers/agentic-chat/provider/turn-phase.ts:46-147` (reducer) and
`:201-302` (`surfaceFor`). The provider dispatches events only after the thing they describe has
executed, so an unexpected event is a no-op (`:86-88`).

### 1.1 Phases (13)

| Phase                | Meaning (`turn-phase.ts:29-45`)                                          | Reached in production?                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `opening`            | first pass, no disposition                                               | every non-project_create turn (`turn-provider.ts:336-337`)                                                                                                                                                     |
| `reading`            | ≥1 read round, no disposition                                            | every multi-round read turn                                                                                                                                                                                    |
| `disposition_gate`   | required control pass (declare / clarify / read)                         | project_create opening (`:305-307`, `:336`), withheld complex writes (`:594-619`), regex-flagged prose (`:620-640`)                                                                                            |
| `read_only_declared` | reviewer downgraded to read-only, or declaration on a write-less surface | rare: `declare_read_only_turn` 2 calls in 14 days, both reviewer (09-02 audit §2.5); every worker surface has write tools so the `!surfaceCanWrite` path (`:362-364`, `:535-537`) is unreachable in production |
| `contract_declared`  | contract recorded, awaiting review                                       | every contract turn                                                                                                                                                                                            |
| `contract_reviewed`  | reviewer approved the exact SHA                                          | every approved contract                                                                                                                                                                                        |
| `contract_carve_out` | one write-only pass before any mutation                                  | project-create contracts always (`:921-930`); other contracts only when forced synthesis or prose interrupts (`:1045-1047`, `:1445-1457`)                                                                      |
| `contract_cancelled` | `cancel_turn_contract` while a contract is present                       | never: 0 calls in 14 days (09-02 audit §2.5); the tool exists for the cross-turn pending-contract flow                                                                                                         |
| `mutating`           | at least one mutation reached execution                                  | every write turn                                                                                                                                                                                               |
| `completion`         | the one bounded pass to finish untouched outcomes                        | organize and project-create-with-children turns                                                                                                                                                                |
| `clarification`      | clarification control executed                                           | common (8 acting calls in the 09-04 battery)                                                                                                                                                                   |
| `synthesis`          | budget/ladder forced tool-free                                           | every direct-write turn (`:736-741`, `:1028`) and every capped turn                                                                                                                                            |
| `terminal`           | `finish` yielded                                                         | all                                                                                                                                                                                                            |

### 1.2 Events (14 shapes) and transitions

Events: `tool_round{read,control,mutation,repair}`, `gate`, `disposition{contract,read_only,clarification,cancel}`,
`review{approve_contract,revise_contract,correct_contract,read_only,clarify}`, `carve_out`,
`completion`, `budget{force_synthesis,validation_repairs,rounds}`, `finish`
(`turn-phase.ts:61-83`).

| From                                    | Event                                        | To                                                                                                      | Line    |
| --------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------- |
| any but terminal                        | `finish`                                     | `terminal`                                                                                              | 93-94   |
| any                                     | `budget:force_synthesis`                     | `synthesis`                                                                                             | 95-97   |
| any                                     | `budget:validation_repairs`, `budget:rounds` | unchanged (dead: never dispatched — grep finds no `limit: 'validation_repairs'` or `'rounds'` dispatch) | 95-97   |
| `opening`/`reading`/`disposition_gate`  | `gate`                                       | `disposition_gate`                                                                                      | 98-99   |
| any                                     | `disposition:contract`                       | `contract_declared`                                                                                     | 102-103 |
| any                                     | `disposition:read_only`                      | `read_only_declared`                                                                                    | 104-105 |
| any                                     | `disposition:clarification`                  | `clarification`                                                                                         | 106-107 |
| contract present                        | `disposition:cancel`                         | `contract_cancelled`                                                                                    | 108-109 |
| `contract_declared`                     | `review:approve_contract`                    | `contract_reviewed`                                                                                     | 114-115 |
| contract present                        | `review:revise_contract`                     | `reading`                                                                                               | 116-118 |
| contract present                        | `review:correct_contract`                    | `contract_declared`                                                                                     | 119-121 |
| any                                     | `review:read_only`                           | `read_only_declared`                                                                                    | 122-123 |
| any                                     | `review:clarify`                             | `clarification`                                                                                         | 124-125 |
| `contract_declared`/`contract_reviewed` | `carve_out`                                  | `contract_carve_out`                                                                                    | 128-131 |
| `mutating`                              | `completion`                                 | `completion`                                                                                            | 132-133 |
| any but `completion`                    | `tool_round:mutation`                        | `mutating`                                                                                              | 136-137 |
| `opening`                               | `tool_round:read`                            | `reading`                                                                                               | 138-139 |
| any                                     | `tool_round:control`/`repair`                | unchanged                                                                                               | 140-142 |

Two of the three `budget` limits are declared and never dispatched; the reducer's `budget` branch
only reacts to `force_synthesis`.

### 1.3 Surface per phase (`surfaceFor`, `turn-phase.ts:201-302`)

| Phase                                                | Tools                                                                                                                       | toolChoice | Note                                                                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `opening`, `reading`, `contract_cancelled`           | `openingTools ?? admitted`                                                                                                  | auto       | **Dead branch**: no caller passes `openingTools` (grep, `turn-phase.ts:178,211` only); the real opening surface is built in `request-builders.ts:181-186` |
| `disposition_gate`                                   | `declare_turn_contract` + `request_turn_clarification` + pure reads (reads off for project_create)                          | required   | no read-only exit for the actor (`declare_read_only_turn` filtered at `tool-surface.ts:161`)                                                              |
| `read_only_declared`                                 | pure reads                                                                                                                  | auto       |                                                                                                                                                           |
| `contract_declared`, `contract_reviewed`, `mutating` | **full admitted surface** (reads + writes + controls)                                                                       | auto       | post-approval passes are not write-scoped; scope is enforced by `validateApprovedMutations` (`turn-provider.ts:672-689`)                                  |
| `completion`                                         | safe write tools for unfinished outcomes + `call_ref/after` sidecar                                                         | auto       |                                                                                                                                                           |
| `contract_carve_out`                                 | safe write tools for the contract (+ sidecar); project contracts narrowed to `create_onto_project` only                     | auto       | `turn-phase.ts:266-274`                                                                                                                                   |
| `clarification`, `synthesis`, `terminal`             | none                                                                                                                        | none       |                                                                                                                                                           |
| `contract_review` (reviewer lane)                    | approval + [`declare_read_only_turn` first review only] + [`request_proposal_revision` while revisions < 2] + clarification | required   | `turn-provider.ts:1552-1554`                                                                                                                              |

The README claim that `surfaceFor` is "the single place that decides which tools" (`README.md:85`)
is not accurate: the opening surface is decided by `deferComplexWriteContractForInitialPass`
(`tool-surface.ts:129-144`), and every continuation inherits `request.tools` verbatim
(`request-builders.ts:305`), including the carve-out surface after the project shell (see C6).

---

## 2. Pass-by-pass traces, as the code runs today

Conventions: A = acting pass (`streamActingPass`), R = reviewer pass (`streamTurnContractReview`),
S = forced tool-free synthesis (`streamForcedSynthesis`), ctl = control round (a `read_tool` round
through the executor that gathers no evidence), mut = mutation round. Surface names are from §1.3.
All passes count toward `MAX_PROVIDER_PASSES_PER_TURN = 12` (`turn-provider.ts:175`, counted at
`:1108-1120`). Battery columns are physical model attempts from `model_routes` in the retained
runs JSON (retries included), see `evidence/lane-C-battery-pass-counts.md`.

| #   | Turn class                                            | Pass ladder today (surface → toolChoice)                                                                                                                                                                                                                                                                                                                                                                     |             Model calls | ctl |   R | Battery 09-04 (turn, calls, s)                                                                                    |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------: | --: | --: | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Pure question                                         | A1 opening (admitted − contract, auto) → reads → A2 continuation (same) → prose → `takeReceiptGroundedFinalDispositionGate` regex (`:620-640`) → finish                                                                                                                                                                                                                                                      | 1–2 (+2 if regex fires) |   0 |   0 | 994570bf: 4 attempts, 30 s                                                                                        |
| 2   | Single create in focused project                      | A1 proposes `create_onto_task` → `assessDirectWriteBatch` = simple (`write-routing.ts:72-156`) → mut → `directSimpleMutationCompleted` (`:736-741`) → S2 (none)                                                                                                                                                                                                                                              |                       2 |   0 |   0 | a223e515: 2, 15 s                                                                                                 |
| 3   | "Mark task X done", X read this turn (multi-hit list) | A1 read → A2 proposes `update_onto_task` → withheld (`target_resolution_requires_review`, `write-routing.ts:149-153`) → A3 gate (required) declares → ctl → R1 → ctl → A4 full surface + approval instruction (`:913-933`) → mut → A5 answer                                                                                                                                                                 |                       6 |   2 |   1 | c4cb3552: 6 acting + 2 reviewer, 64.8 s (one revision)                                                            |
| 3b  | same, X was the only task a search returned           | A1 read → A2 update direct (single-hit, `:795-800`) → S3                                                                                                                                                                                                                                                                                                                                                     |                       3 |   0 |   0 | —                                                                                                                 |
| 4   | "Rename this project"                                 | `update_onto_project` is **not mounted** on the `project` or `global` surface (`catalog/surfaces.ts:78-146`); A1 calls it → exists in catalog → surface repair (`repair-policy.ts:122-190`) → A2 says it cannot. The routing example "rename this focused project" (`review/turn-contract.ts:410`) names a tool that never exists where the message is shown                                                 |             2, no write |   0 |   0 | not in battery                                                                                                    |
| 5   | Organize: 3 moves + 1 folder                          | A1 tree read → A2 proposes create+3 moves → withheld (`mutation_count_exceeded` or `operation_requires_contract`; move is contract-only, `mutationToolCatalog.ts:306`) → A3 gate declares (label + parent_label) → ctl → R1 → ctl → A4 full surface + organize instruction → mut (folder) → A5 (held prose or moves; unfinished → completion surface `contract-execution.ts:7-78`) → mut (moves) → A6 answer |                       7 |   2 |   1 | no organize case in the 09-04 battery                                                                             |
| 6   | Project create from General Chat                      | A1 proposes `create_onto_project` → withheld (contract-only) → A2 gate declares → ctl → R1 → ctl → carve-out surface `[create_onto_project]` (`:921-930`) A3 → mut → A4 answer **on the same carve-out surface** (see C6)                                                                                                                                                                                    |                       5 |   2 |   1 | 069c45f4: 4 + 3 reviewer, 55 s, ended in a nonsense clarification; Project Setup recovery f83a56f1: 3 + 1, 27.5 s |
| 7   | Selective edit of an existing document                | A1 outline → A2 section → A3 proposes `update_onto_document` → withheld (target not focused/single-hit) → A4 gate declares (`required_fields=["content"]`) → ctl → R1 → ctl → A5 update → mut → A6 answer                                                                                                                                                                                                    |                       7 |   2 |   1 | b7b715f6: 6 + 3 reviewer, 95.6 s, no edit; 579e0c95: 7 + 2, 76.9 s, no edit                                       |
| 8   | Model asks a clarifying question                      | A1 read → A2 `request_turn_clarification` (mounted on opening) → ctl → S3 with clarification render (`:1032-1044`, `:1087-1092`); or A2 proposes write → withheld → A3 gate clarifies → S4                                                                                                                                                                                                                   |                     3–4 |   1 |   0 | 8a2fcdd3: 7 attempts, 45 s (one validation failure)                                                               |
| 9   | Read-loop ladder                                      | read rounds increment `readOnlyRoundCount` (`:822-824`); nudge at 3, stop at 6, must_synthesize at 8 (`read-loop-escalation.ts:24-38`) or 3 low-novelty rounds (`context-gathering-ledger.ts:214-220`) → S; hard cap 12 passes → S with receipts (`:1171-1180`)                                                                                                                                              |                  ≤ 9–12 |   0 |   0 | 90f7354d: 6 attempts, 11 reads, 50 s                                                                              |

Two observations from the table that recur in the findings:

- The complex-write ladder pays **two acting passes that produce nothing durable** — the withheld
  proposal (A2) and the gate declaration (A3) — before the reviewer even sees the turn. The withheld
  proposal already contains everything the reviewer needs (the exact call and target).
- The battery numbers are worse than the minimum ladder in every complex case because of revisions
  (+1 A +1 R each, or +1 R for a typed correction) and validation repairs. Turn 0784af15 (five
  tasks) spent 3 declarations (2 rejected by validation), 1 revision, and 7 model attempts over
  91.6 s on a request the direct lane would execute in 2 calls if the create cap were higher than 3.

---

## 3. Repair and recovery inventory

| Mechanism                        | Trigger                                                                                                                                           | Attempts                                                             | Cost per firing                                                                        | Overlaps with                                          | Production evidence                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Truncation retry (transport)     | tool-call pass with finish≠tool_calls or cut arguments (`provider-pass.ts:95-109`, `stream-tool-calls.ts:175-186`)                                | 1                                                                    | 1 full pass on another route                                                           | —                                                      | 09-02 §3 trace 1 (2,001 tokens); fixed and re-verified; keep                                                                     |
| Retryable provider error         | 429/5xx on any pass (`provider-pass.ts:56-66`)                                                                                                    | 1                                                                    | 1 pass + 2 s cooldown                                                                  | route pin                                              | 09-04 battery: 9 of 89 routes failed (evidence file); necessary                                                                  |
| Unavailable-skill repair         | call to `skill_load`/`skill_search` not on surface (`repair-policy.ts:25-65`)                                                                     | 1                                                                    | 1 pass, restores admitted, toolChoice required                                         | surface repair                                         | `skill_load` 4 calls / 2 failed in 14 d (09-02 §2.5); a1771c1f7 b06d4650 called skill tools 3× and never wrote                   |
| Reviewer-mimicry repair          | acting model calls `approve_*`/`request_proposal_revision` (`repair-policy.ts:72-98`)                                                             | 1                                                                    | 1 pass                                                                                 | surface repair                                         | designed against a real 09-02 trace; recognizes the retired `approve_mutation_batch_review` name (`execution-adapter.ts:62-78`)  |
| Surface repair                   | call to a catalog tool absent from the pass (`repair-policy.ts:122-190`)                                                                          | 1 (shared flag `unavailableSkillRepairAttempted` with the two above) | 1 pass + ~600-char instruction                                                         | the two above                                          | 09-02 findings 2 and 6; **contradictory instruction when the rejected tool is `declare_turn_contract` on the opening pass** (C3) |
| Disposition reconcile            | two dispositions in one pass (`disposition.ts:129-151`)                                                                                           | notice only                                                          | 0 passes                                                                               | —                                                      | added 09-02; fine                                                                                                                |
| Disposition kill                 | disposition + read/mutation in one gate pass (`disposition.ts:153-168`)                                                                           | 0 — permanent `provider_semantic_disposition_invalid`                | dead turn                                                                              | reconcile handles the sibling shape with a notice      | not in the 14-day failure-code list; a weak model can hit it with one plausible mistake (C11)                                    |
| Pre-mutation disposition gate    | non-simple mutation batch while no disposition (`turn-provider.ts:594-619`)                                                                       | unbounded (each proposal withheld again)                             | 1 pass; the withheld proposal is discarded                                             | —                                                      | every complex write in every battery                                                                                             |
| Receipt-grounded regex gate      | terminal prose matches mutation-claim or which-question patterns with no disposition (`:620-640`, `repair-instructions.ts:799-819`, `:1103-1119`) | 1 per pass, can recur                                                | +1 gate pass, +1 fallback pass when the model answers in prose at the required gate    | disposition gate                                       | no telemetry; the patterns match ordinary read answers ("is now done", "which task…?") (C8)                                      |
| Validation repair                | schema/allowlist/no-op-reschedule/contract-shape issues (`:1322-1397`)                                                                            | 2, then receipt-grounded synthesis                                   | 1 pass each + per-issue errors; second identical failure switches route (`:1377-1382`) | —                                                      | 09-04: 3 declare + 4 clarification validation failures in 17 turns; DST turn died here before the 09-04 fix                      |
| Reviewer format repair           | reviewer returns unreadable/mismatched decision (`:1666-1686`)                                                                                    | 1                                                                    | 1 reviewer pass                                                                        | —                                                      | 12 rejection codes (`contracts.ts:329-341`); 09-04 case 1 ended with "invalid or unbound decision" after a truncated correction  |
| Reviewer revision                | reviewer returns proposal (`:846-887`)                                                                                                            | 2 per turn                                                           | typed correction: +1 R; prose correction: +1 A (gate) +1 R                             | —                                                      | 17 revisions across 3 batteries; second revision approved 2 of 6 times (§6)                                                      |
| Candidate-ambiguity floor        | reviewer lists ≥2 candidates for one reference, contract covers <2 (`decision-handling.ts:80-141`)                                                | converts approval to clarification                                   | 0 passes, ends turn                                                                    | reviewer clarify                                       | 579e0c95 bounced "the same existing document" (fixed same day with the prior-message rule)                                       |
| Read-loop count ladder           | 3/6/8 read-only rounds (`read-loop-escalation.ts`)                                                                                                | monotonic                                                            | +instruction; must_synthesize forces S                                                 | novelty ledger, pass cap                               | fires on any 3-round read turn regardless of novelty (C9)                                                                        |
| Context-saturation ledger        | low-novelty rounds 1/2/3, repeated searches (`context-gathering-ledger.ts:183-233`)                                                               | monotonic                                                            | +instruction; must_synthesize forces S                                                 | count ladder, pass cap                                 | —                                                                                                                                |
| Forced synthesis retry           | tool-free pass returns nothing or a stray tool call (`:1723-1837`)                                                                                | 1                                                                    | 1 pass                                                                                 | receipt fallback                                       | `provider_forced_synthesis_failed` 2 in 14 d (09-02 §2.2)                                                                        |
| Receipt fallback text            | synthesis throws after writes (`:1838-1848`, `repair-policy.ts:337-389`)                                                                          | —                                                                    | 0 passes                                                                               | —                                                      | keep                                                                                                                             |
| Pass ceiling                     | 12 passes (`:1171-1180`, `:1541-1551`)                                                                                                            | —                                                                    | 1 synthesis pass with receipts                                                         | 16-round budget (unreachable), 40-call cap, wall clock | designed 09-04; makes the 16-round budget and its `roundsRemaining ≤ 2` triggers dead (C9)                                       |
| Required-pass prose fallback     | gate/required pass answers in prose (`:1418-1431`, `repair-policy.ts:208-228`)                                                                    | 1                                                                    | 1 pass                                                                                 | —                                                      | 09-02 finding; keep                                                                                                              |
| Contract completion continuation | approved contract with untouched outcomes after a mutation round (`:370-404`, `:658-671`)                                                         | 1                                                                    | 1 pass on a write-only surface                                                         | carve-out                                              | designed against live organize failures (folders created, moves never proposed)                                                  |
| Write carve-out                  | contract pending + forced synthesis or prose (`:641-654`); always for project contracts on approval                                               | 1                                                                    | 1 pass                                                                                 | completion                                             | project shell path in every project-create turn                                                                                  |
| Partial-batch disclosure         | a mutation round with both success and failure (`:746-754`, `:1067-1073`)                                                                         | —                                                                    | instruction on the synthesis pass                                                      | —                                                      | keep                                                                                                                             |
| Feedback-kind validation         | executor feedback shape ≠ provider call (`feedback.ts:36-88`)                                                                                     | 0 — throws `unknown`-class error, dead turn                          | dead turn                                                                              | —                                                      | crashed production turn 35f3e826 on 09-08; fixed in the working tree by deleting one clause (§7)                                 |

Twenty-one mechanisms. Six of them exist to bound the same quantity (rounds/passes): the count
ladder, the novelty ledger, the 16-round budget, the 40-call cap, the 12-pass ceiling, and the wall
clock. Three exist to repair "called a tool that is not on this pass" (skill, mimicry, surface) and
share one attempt flag; they are one mechanism with three messages.

---

## 4. The contract lane end to end

### 4.1 Flow

1. **Declaration.** `declare_turn_contract` (`catalog/definitions/controls.ts:19-163`): 4,354 chars of
   schema, 12 fields per outcome (3 required, 9 optional), 14 actions × 11 entity kinds = 154 enum
   combinations, of which 29 map to a tool (`runtime/loop/turn-contract.ts:1212-1247`). `unlink` and
   `delete` map to nothing.
2. **Parse + validate before review.** `parseDeclaredTurnContract` (`turn-contract.ts:441-780`) has
   22 `rejectOutcome` sites and 5 cross-outcome `issues.push` sites = **27 parse rejections**.
   `validation.ts` adds canonical-UUID targets (`:59-77`), five project-shell rules (`:164-237`),
   two effect-field rules (`contract-fields.ts:17-46`), and the explicit project name rule
   (`validation.ts:101-126`) = **9 more**. Each rejection is a validation-repair pass (max 2) and
   then receipt-grounded synthesis.
3. **Reviewer.** `buildTurnContractReviewRequest` (`review/turn-contract.ts:67-121`). Static system
   prompt 9,672 chars (32 lines: 16 own + 14 `SEMANTIC_COMMISSION_GUIDANCE` + 2 declaration
   examples); tools 9,798 chars on a first review (approval 1,630 + read-only 449 + revision 6,442 +
   clarification 1,277); user message = provenance + optional shell rules + SHA + canonical contract
   JSON + field semantics (≤2,400) + effect fields + evidence JSON (loaded-context sections, user
   messages, tool calls/results, assistant prose labelled untrusted). Fixed prefix ≈ 4,868 tokens.
4. **Decision completion.** `decision-completion.ts:57-218`: exactly one call; 12 rejection codes
   (`contracts.ts:329-341`); one format-repair attempt; a 130-line normalizer that strips
   placeholder labels the reviewer model invents (`:227-297`); the candidate-ambiguity floor can turn
   an approval into a clarification.
5. **Approval → execution.** SHA matched (`turn-provider.ts:897-909`); acting model gets the **full
   admitted surface** plus "Execute only that contract" (`:913-933`). Every mutation is checked by
   `validateApprovedTurnContractMutations` (`validation.ts:245-286`), which proves tool name ∈
   safe set for the outcome, target id ∈ `target_ids`, label bindings, and — for
   complete/assign/archive/restore only — the `state_key`/assignee argument (`:373-396`). **It does
   not compare `changes[].value` with the call's arguments** (`:239-244` says this was "semantically
   adjudicated by the exact mutation-batch reviewer" — that lane was deleted in `d528c328b`).
6. **Fulfilment.** After execution, `resolveTurnContractOutcome` (`turn-contract.ts:1392-1585`)
   compares ledger `changedValues` with `changes` by exact string equality. A wrong value is
   discovered here, after the write, and only as "unfulfilled".
7. **Completion.** Untouched unfulfilled outcomes get one write-only pass (`contract-execution.ts:7-78`).

Rejections a weak acting model can hit on the way to one write: 27 + 9 = **36 deterministic** before
review, 2 post-approval (`validation.ts:268-276`), and 12 reviewer-format codes that end the turn
after one repair. Add the semantic revision (up to 2) and the candidate floor.

### 4.2 Is this the right abstraction for a cheap model?

No. Four reasons, each with a battery case behind it.

- **The contract cannot carry what the reviewer is asked to judge.** `description` is capped at 240
  chars, `changes[].value` at 160, and prose fields are demoted to postconditions
  (`turn-contract.ts:325-361`). In 09-04 case 1 the reviewer rejected the project contract because
  "the proposed description omits the user-requested exclusions … success criteria …" — content
  that lives in the `create_onto_project` arguments, which the reviewer never sees. In case 8 the
  reviewer twice demanded "set content to the complete revised Markdown", the actor complied, the
  160-char cap truncated it to `Clear scope,|||||`, and the reviewer rejected its own instruction
  (`evidence`: `artifacts/agentic-chat-postdeploy-6d787284c-evidence.json`, `documentEditReview`).
  Both GPT-5.6 and DeepSeek got the postcondition-vs-value distinction wrong; the 09-04 fix added
  more prose (`review/turn-contract.ts:57`, `contract-fields.ts:27-34`) rather than removing the
  distinction.
- **SHA-bound approval binds the abstraction, not the write.** With the batch reviewer gone, an
  approved `{update task X, changes:[{due_at, 2026-09-22}]}` authorizes `update_onto_task(X,
due_at: 2026-09-29)` (trace in C1). "No guessed writes" is enforced on targets and not on values.
- **It costs two acting passes that produce nothing.** The withheld proposal (A2) already is the
  exact call; the gate (A3) asks the model to re-describe it in a second vocabulary; after approval
  the model re-proposes the call (A4). Three model outputs for one write, with a translation error
  possible at each step (09-04 case 8: correct UUID internally, wrong artifact declared).
- **The reviewer's second chance rarely pays.** Across the three retained batteries the reviewer
  made 33 decisions: 10 approvals, 17 revisions, 6 clarifications. Turns that used both revisions
  (6) were approved 2 times; the other 4 ended in a clarification the user did not need (09-04
  069c45f4: "Which exact item should I change, and what should the final value be?" for a fully
  specified project brief).

The alternative — **propose the exact tool calls; the reviewer approves the batch** — keeps every
safety property:

| Property                             | Contract lane today                                                               | Batch approval                                                                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No guessed targets                   | reviewer judges `target_ids` against evidence + `reference_candidates` floor      | identical: reviewer judges `task_id` etc. against the same evidence and floor                                                                              |
| No guessed values                    | **not enforced pre-execution** (C1)                                               | enforced by construction: the executed calls are the approved calls                                                                                        |
| SHA-bound approval                   | SHA of contract JSON                                                              | SHA of canonical call batch (already computed per call: `canonicalArguments`, `stream-tool-calls.ts:20-30`)                                                |
| Completeness ("did it do all of it") | contract outcomes + fulfilment + completion pass                                  | reviewer sees the full user request and the full batch; revision = "batch omits X"; harness executes all approved calls, so the model cannot stop halfway  |
| Multi-step (create then reference)   | labels bound after create; completion pass                                        | round 2 with ids created this turn treated as resolved (small addition, C5); organize moves already create parents by title (`repair-instructions.ts:194`) |
| Reviewer sees value semantics        | `describeContractValueSemantics` projects schema descriptions for contract fields | same projection keyed on the arguments actually used                                                                                                       |
| Revision                             | typed `corrected_contract` re-reviewed                                            | typed corrected call batch, validated by the ordinary tool schemas (no placeholder normalizer needed)                                                      |
| Read-only downgrade, clarify         | reviewer tools                                                                    | unchanged                                                                                                                                                  |

What it deletes: the contract tool and its schema, `parseDeclaredTurnContract` and its 27
rejections, labels and bindings, `validateApprovedTurnContractMutations`, `contract-fields.ts`,
the completion and carve-out request builders, the disposition gate for writes (the withheld batch
is the proposal), the reviewer correction normalizer, and the fulfilment resolver as a control
input. Roughly 4,200 lines (worker `review/*` 1,644 + `validation.ts` contract parts ~250 +
`contract-fields.ts` 110 + the contract closure in `turn-provider.ts` ~300 + runtime
`turn-contract.ts` 1,593 + the contract half of `write-ledger.ts`) and 2,191 lines of
`turn-contract.test.ts`. Model calls: class 3 goes 6 → 4, class 5 goes 7 → 4, class 7 goes 7 → 5.

Precedent: the repo had a batch reviewer (`approve_mutation_batch_review`, 85 calls before 08-28)
and a contract compiler; `d528c328b` kept the contract and deleted the batch review. This lane's
judgment is that the collapse went the wrong way for a cheap actor.

---

## 5. The reviewer

**What it sees.** The static prompt (§4.1 step 3) plus the evidence JSON built by
`buildReviewerEvidence` (`review/turn-contract.ts:181-227`): five loaded-context sections of the
acting prompt, every user message, assistant tool calls and results, and prior assistant prose. It
never sees the write tool schemas or the arguments the actor will use. It does see "Rules for This
Turn" (`:151-160`), which since 09-04 leads with the preloaded skill playbook — actor instructions
labelled evidence.

**What it can return.** Approve (SHA + reason + `reference_candidates`), revise (reason +
required_correction + full `corrected_contract` + candidates), read-only (first review only),
clarify. Post-processing may convert an approval into a clarification.

**Production record (three batteries, evidence file):**

| Battery   | Turns | Contract turns |    Approvals | Revisions | Reviewer/candidate clarifications | Two-revision turns → approved |
| --------- | ----: | -------------: | -----------: | --------: | --------------------------------: | ----------------------------: |
| a1771c1f7 |    17 |              7 | 3 (+3 batch) |         7 |                                 3 |                         3 → 1 |
| 6d787284c |    17 |              5 |            3 |         7 |                                 3 |                         3 → 0 |
| 4ac73bde7 |    14 |              4 |            4 |         3 |                                 0 |                         1 → 1 |
| **Total** |    48 |             16 |           10 |        17 |                                 6 |                         7 → 2 |

Did it correct real mistakes? In 4ac73bde7 aadd9245 (five tasks) and 259b6a28 (document edit) the
revisions ended in approvals and correct writes — a real save. In 6d787284c four of seven revisions
asked for content the contract schema cannot carry (§4.2) and made the turn worse. Cases 1 and 8 of
the 09-04 battery are exactly the "made things worse" pattern: correct target identified by the
actor, reviewer loop ends in a user-facing question that has no good answer. The 09-02 audit
recorded the reviewer at 59 % of spend over 14 days with 0 % cache; the 09-04 session review
(`artifacts/chat-session-41e496f7-cost-review.md`) measured 36 % of session spend and 28 % of a
simple edit's 83 s on three reviewer passes.

The one job only the reviewer does — "three plausible email tasks, do not guess" — is a judgment
about **targets**, and it does not need the contract vocabulary to make it (§4.2 table).

---

## 6. `feedback.ts`: is the strictness load-bearing?

`validateToolFeedback` (`feedback.ts:36-88`) runs on every result of every round. It checks (a) the
identity triple — call id, tool name, canonical arguments (`:40-46`); (b) for failures, the
`kind`, error text canonicality, `toolCategory` shape, and `modelPayload.error === error`
(`:47-73`); (c) for successes, read/mutation kind and `logicalOperationId`/`operationName`
(`:74-87`). A mismatch throws `provider_read_feedback_mismatch` or
`provider_tool_feedback_kind_mismatch` with failure class `unknown`, which ends the turn with a
generic stream error.

The 09-08 crash (`artifacts/agentic-chat-research-postdeploy-2026-09-08.md`, turn 35f3e826) was
clause (b): `call.kind !== 'mutation'` rejected a recoverable read failure the executor had started
emitting as `known_execution_failure` (`turn-executor.ts:2308-2320`). The working-tree diff deletes
that one clause.

Judgment: (a) is load-bearing — feeding round _n_'s result to the wrong call would silently corrupt
the transcript and every downstream ledger, and it costs nothing. (b) and (c) are shape assertions
on a struct the executor built in the same process two frames earlier (`turn-executor.ts:1704-1713`,
`:1829-1841`, `:2308-2320`); they defend against a local type mismatch that TypeScript already
prevents, and their only observable effect in eleven months has been to kill a user's turn when the
executor legitimately evolved. They should degrade (log and treat the result as a failed tool
result) rather than throw; better, the executor should build the model payload through one shared
builder so there is nothing to cross-check.

---

## 7. What is left in `turn-provider.ts` after the refactor

Counted from the working tree (`grep`, see §Measurements):

- 1,853 lines; `prepareInvocation` (`:291-1101`) is an 810-line closure.
- 19 `let` bindings and 24 closure-level `const` bindings = **43 closure variables**, of which 4 are
  booleans (`released`, `streamed`, `toolRoundCompleted`, `semanticDispositionCorrectionUsed`)
  and 4 are contract identity (`turnContract`, `pendingContractReviewSha256`,
  `approvedContractSha256`, `pendingProposalRevision`).
- `ToolRoundStreamState` has **25 members**, 4 of them `take*` (`takePreMutationSemanticDispositionGate`,
  `takeReceiptGroundedFinalDispositionGate`, `takeTurnContractWriteCarveOut`,
  `takeContractCompletionContinuation`) and 2 dead (`recordProviderToolCalls`,
  `getProviderToolCallCount` and the `providerToolCallCount` counter: 0 call sites, `:330`,
  `:484-489`).
- Per-pass flags in `streamActingPass`: `initial`, `finished`, `keepLease`, `streamedText`,
  `holdAssistantText`, `holdAssistantTextForTurnContract`, `emitPlanningSemantic` = 7; per-request
  flags `semanticDispositionGate`, `unavailableSkillRepairAttempted` = 2.
- `continueWithToolResults` (`:712-1097`) is a 385-line function with 12 early-return/dispatch
  branches; the phase reducer replaced closure _flags_ but the closure still owns the contract
  identity, the ladder counters, the memo, and three evidence maps.
- 35 distinct `providerError` codes across the provider directory.

The refactor achieved its stated goal (no `supervisor`, phase checks instead of flags); the
remaining weight is the contract lane's state (14 of the 43 bindings and 8 of the 25 members exist
only for it).

---

## 8. The simplest loop that keeps the invariants

Invariants to preserve: no guessed writes, SHA-bound approvals, atomic passes, bounded rounds.

```
phase ∈ {gathering, reviewing, answering}            # 3 phases, not 13
for pass in 1..12:
  out = model(messages, tools = phase == gathering ? admitted : none)    # one surface
  if out.calls is empty: emit prose; finish
  calls = validate(out.calls)                         # schema, allowlist, no-op reschedule; repair ≤ 2
  mutations = calls ∩ catalog
  if mutations is empty: execute reads/clarification; append results; continue
  if direct_eligible(mutations):                      # write-routing.ts floor, unchanged
      execute; append receipts; tools = none; continue    # forced synthesis, unchanged
  decision = reviewer(batch = mutations, evidence)    # approve(sha) | correct(batch') | clarify | read_only
  approve  → execute exactly the approved batch (graph order); append receipts; continue
  correct  → re-review batch' once; then as approve
  clarify  → emit question; finish
  read_only→ tools = reads; continue
at the ceiling: receipt-grounded synthesis (unchanged)
```

Kept as-is: `provider-pass.ts` (atomic pass, truncation retry), `stream-tool-calls.ts`,
`write-routing.ts` (with C4/C5 additions), read memo, validation repair, one surface repair, route
switch on repeated validation failure, pass ceiling and receipt-grounded synthesis, partial-batch
disclosure, `reference_candidates` and the candidate floor, reviewer read-only/clarify exits,
static reviewer prompt/tools for caching.

Deleted: `declare_turn_contract` (schema, parser, 27 rejections), labels/bindings, fulfilment
resolver as a control input, completion and carve-out passes, the disposition gate for writes, the
receipt-grounded regex gate, `contract-fields.ts`, `validateApprovedTurnContractMutations`, the
reviewer correction normalizer, `cancel_turn_contract` (and the `contract_cancelled` phase), the
count-based read ladder (keep the novelty ledger), the 16-round budget constant, the dead
`openingTools` branch, the lazy contract deferral and its second routing message.

Model calls after the change (from §2): question 1–2, single create 2, resolved update 2–3,
unresolved update 4, organize 4, project create 4–5, document edit 5, clarification 3.

---

## 9. Findings

Severity: P0 data risk / user-visible failure now; P1 material cost or capability gap; P2
simplification or moderate cost; P3 hygiene.

### C1 · P1 · bug/architecture — Approved contracts do not constrain the values that execute

`validation.ts:245-286` authorizes a mutation when the tool is in the outcome's safe set, the target
id is in `target_ids`, labels bind, and (for complete/assign/archive/restore only) the state or
assignee argument matches (`:373-396`). `changes[].value` is never compared with the call. The
comment at `:239-244` delegates that comparison to "the exact mutation-batch reviewer", deleted in
`d528c328b` ("reviewer collapse"). Trace: approved outcome `{update task X, changes:[{due_at,
2026-09-22}]}`; actor calls `update_onto_task({task_id: X, due_at: '2026-09-29'})` →
`turnContractOutcomeAuthorizesCall` returns `authorized` (`:336-370`) → executes → `resolveOutcome`
marks it unfulfilled by value (`turn-contract.ts:1493-1503`) → `incompleteApprovedContractResolution`
sees the target as touched (`turn-provider.ts:387-403`) → no completion → the model reports the
write it made. The 4ac73bde7 assessment §1 documents the benign twin (right value, wrong field path,
reported "mutation_unfulfilled"). Cheap-model impact: the class of error a weak model makes most —
re-typing a date or title slightly differently between declaration and call — executes unreviewed.
Fix (if the contract stays): compare declared scalar `changes` against the call's normalized
arguments in `turnContractOutcomeAuthorizesCall` and reject on mismatch. Fix (preferred): C2.

### C2 · P1 · architecture — Replace the contract lane with SHA-bound batch approval

Claim and evidence in §4.2 and §5. Cheap-model impact: removes two acting passes per complex write
(the withheld proposal and the gate re-description), removes 36 deterministic rejection reasons and
the 160-char/prose trap, and lets the reviewer judge the actual content of a document edit instead
of a summary of it. Estimated effect: 6 → 4 calls on an unresolved single update, 7 → 4 on organize,
7 → 5 on a document edit; ~4,200 source lines and ~2,200 test lines removed. Risk: multi-round
creates (project → children) need ids created this turn to count as resolved (C5); completeness
review moves from contract to batch (reviewer already sees the full request). Guard: the WP-4
canaries (three-email-tasks withheld, single-hit organize approved, mimicry rejected) and the
existing provider fixtures re-targeted at batch approval. Decision needed: yes — 2–4 days, changes
what users see (fewer passes, fewer nonsense clarifications).

### C3 · P1 · prompt_quality — Contract deferral makes the prompt contradict itself on every write-capable opening pass

`request-builders.ts:181-186` removes `declare_turn_contract` from the opening pass of the `global`
and `project` profiles (`tool-surface.ts:63-73`, `:129-144`). Meanwhile the system prompt says
"Writing to an existing entity: call declare_turn_contract first" (`apps/web/.../situational-rules.ts:74`),
the global hints say a project is "declared through declare_turn_contract"
(`build-lite-prompt.ts:118`), and the worker's own opening routing message says "the contract route
is deferred in this opening pass … propose the complete concrete mutation batch"
(`review/turn-contract.ts:396-398`) and then, five lines later, "a complex one calls
declare_turn_contract first" (`ACTOR_COMMISSION_GUIDANCE` spread at `:404`, text at
`controls.ts:39`). An obedient model calls the absent tool; the surface repair then says
"declare_turn_contract is not callable in this pass … The tools callable in this pass are exactly:
…, declare_turn_contract, … Do not call declare_turn_contract again in this turn … declare the
complete turn contract first" (`repair-policy.ts:149-156`, `:183-188` with the `opening` guidance at
`:170`). Cheap-model impact: a wasted pass and a self-contradicting instruction on the most common
write shape. The deferral saves 4,354 chars (~1,089 tokens) of static, cacheable schema on the
opening pass and costs a full extra pass (10–40k tokens) whenever the model follows the prompt.
Fix: mount the contract tool on the opening pass (delete `deferComplexWriteContractForInitialPass`,
the lazy routing variant, `WORKER_KNOWN_ARTIFACT_ONLY_TOOL_NAMES` handling of it, and `openingTools`);
or, with C2, delete the tool and all three prompt lines. Also drop the full-variant routing message
(`:407-419`), which is shown only on project_create where the required gate makes its simple/complex
classification moot and whose examples ("rename this focused project", "create a new goal") name
tools that are not on the surface where it appears.

### C4 · P1 · capability_gap — Every create that references an existing entity, and every batch of more than three creates, pays gate + reviewer

`write-routing.ts:136-146`: a `new_entity` create with any non-null `directWriteExistingReferenceNames`
value is contract-required regardless of how the reference was resolved. `create_onto_milestone`
requires `goal_id` and lists it as an existing reference (`mutationToolCatalog.ts:761-762`), so a
milestone can never be direct. `create_onto_task` with `goal_id`/`plan_id`/`supporting_milestone_id`
(`:414-417`) and `create_calendar_event` with `calendar_id` (`:1094`) likewise. Separately,
`MAX_DIRECT_SIMPLE_MUTATIONS_PER_TURN = 3` (`:8`) sends "create these five tasks" (09-04 case 2:
7 attempts, 91.6 s, two rejected declarations) through the contract lane although five creates in the
focused project can guess no target. Cheap-model impact: the routine "add five tasks" and "add a
milestone to the growth goal" requests cost 6–7 calls instead of 2. Fix: apply
`isDeterministicallyResolvedId` to reference arguments on creates (same three lanes: focused,
single-hit, user-typed-and-seen); raise the new-entity cap (e.g. 10) while keeping 3 for
`resolved_existing` updates. Decision needed: yes — it removes review from 4–10 creates.

### C5 · P1 · capability_gap — Two deterministic resolution lanes are missing: user-named titles and ids created this turn

`isDeterministicallyResolvedId` (`write-routing.ts:246-263`) accepts the focused entity, a single-hit
read, or a user-typed UUID that a read loaded. A user who writes "mark 'Order kitchen cabinets'
done" while `list_onto_tasks` returned five tasks with distinct titles is sent to the reviewer
(09-04 case 4: 8 attempts, 64.8 s for a fully specified update). The candidate floor already has the
exact test needed — `uniquelyIdentifiedCandidate` (`decision-handling.ts:160-175`, full normalized
title contained in the user's message, exactly one match) — but it runs only after a reviewer
approval. Second gap: mutation receipts never enter the evidence maps (`turn-provider.ts:776-801`
collects refs from reads only; `clearTurnReadEvidence` at `:762` wipes them on every mutation round),
so "create the project, then add the tasks" and "create a task and link it" always re-enter the
reviewer for the id the harness itself just returned. Fix: add a fourth lane (user message contains
exactly one read entity's normalized title of the requested kind) and a `turnCreatedEntityIds` map
fed from successful mutation feedback that survives `clearTurnReadEvidence`. Both are deterministic
and are not guesses.

### C6 · P2 · bug — After a single-outcome project contract, the answer pass still mounts `create_onto_project`

On approval of a project contract the carve-out surface `[create_onto_project]` becomes
`currentRequest` (`turn-provider.ts:921-933`). After the shell mutation round,
`buildContinuationRequest` inherits `request.tools` (`request-builders.ts:305`), and the completion
switch at `:834-845` returns null when every outcome is fulfilled (single-outcome contracts, the
exact 09-04 case 1 shape "create the project … do not create tasks yet"). The answer pass therefore
offers `create_onto_project` with `toolChoice: 'auto'`; a second call is authorized by
`validateApprovedTurnContractMutations` (create outcomes skip the target check, `validation.ts:336-343`)
and would create a duplicate project. The comment at `:839-841` claims the switch prevents shell
duplication; it does so only when child outcomes remain. No test asserts the post-shell surface
(`agenticChatTurnProvider.test.ts:5054-5284` checks steps, not tools). Cheap-model impact: a model
that re-issues the only tool it is offered creates two projects. Fix: after a mutation round whose
contract is fully fulfilled, mount the tool-free surface (`forceToolFreeRequest`) or reject calls
for outcomes already at `minimumSuccessfulEffects`.

### C7 · P2 · overengineering — Three "wrong tool for this pass" repairs share one attempt and differ only in prose

`buildUnavailableSkillRepairRequest`, `buildReviewerMimicryRepairRequest`,
`buildUnavailableSurfaceToolRepairRequest` (`repair-policy.ts:25-190`) all read the same
`unavailableSkillRepairAttempted` flag, all restore a surface, and are tried in sequence on every
pass with calls (`turn-provider.ts:1244-1290`). Together with `assertAllowlistedCall` that is four
allowlist evaluations per pass. Cheap-model impact: none directly; the cost is 165 lines and three
instruction registers to keep consistent (C3 shows one already drifted). Fix: one
`buildSurfaceRepairRequest(rejectedNames, phase)` that picks the sentence by name class.

### C8 · P2 · prompt_quality — The receipt-grounded regex gate routes ordinary read answers into a required gate with no read-only exit

`takeReceiptGroundedFinalDispositionGate` (`turn-provider.ts:620-640`) runs on every terminal prose
of a turn with no disposition and mounts the required gate when
`classifyReceiptGroundedAssistantDisposition` (`repair-instructions.ts:799-808`) matches. The
patterns (`:1103-1119`, `:806-812`) include `is now done`, `has been updated`, and
`which … task … ?` — phrases a read answer uses to report state or to ask a genuine follow-up. The
gate offers only `declare_turn_contract`, `request_turn_clarification`, and reads
(`turn-phase.ts:213-233`); `declare_read_only_turn` is filtered for the actor (`tool-surface.ts:161`).
A read-only answer that matches therefore costs +1 gate pass and +1 prose-fallback pass
(`:1418-1431`) whose instruction says "do not claim any change was made". Cheap-model impact: the
weakest models narrate state in exactly these words; each false positive is two paid passes and a
hedged answer. No production telemetry distinguishes these gate entries. Fix: under C2 the gate
disappears (an unreceipted claim is caught by the executor's receipt-grounded finalization, which
already appends disclosures); if kept, gate only on `mutation_claim` when a write tool was
_proposed_ this turn, never on question shape.

### C9 · P2 · overengineering — Six bounds on one quantity; the 16-round budget and its triggers are dead under the 12-pass ceiling

`MAX_PROVIDER_PASSES_PER_TURN = 12` (`turn-provider.ts:175`) counts every model call, so the
16-round budget (`DEFAULT_MAX_PROVIDER_ROUNDS`, `:160`; `DEFAULT_AGENTIC_CHAT_MAX_TOOL_ROUNDS`,
`turn-executor.ts:117`) is unreachable, and with it `roundsRemaining <= 2` in both
`selectReadLoopRepairEscalation` (`read-loop-escalation.ts:28`) and the ledger
(`context-gathering-ledger.ts:191`, `:215`). The count ladder still fires "you are repeating
read-only tool calls without making progress" at the third read round even when every round added
new entities (`turn-provider.ts:1013-1027` ignores novelty; the ledger tracks it). The worker never
passes `framing` or `pendingWriteCommission` to `buildReadLoopRepairInstruction`, so 60 of its 124
lines are dead (`repair-instructions.ts:613-736`; sole caller `turn-provider.ts:1022`), as is the
`gatewayModeActive` half of `buildToolValidationRepairInstruction` (`:474-612`; caller passes
`false`, `request-builders.ts:363`). Cheap-model impact: a document-heavy answer (outline + three
sections) is told it is looping on round 3 and may stop early; the instruction text lies to the
model. Fix: keep the novelty ledger and the pass ceiling; delete the count ladder, the 16-round
constant, `DEFAULT_AGENTIC_CHAT_MAX_TOOL_ROUNDS` plumbing, and the dead branches.

### C10 · P2 · bug — `feedback.ts` shape assertions kill the turn instead of degrading

§6. The identity triple (`feedback.ts:40-46`) is load-bearing; the failure-kind, `toolCategory`,
`modelPayload.error` and success-kind checks (`:47-87`) assert the shape of a struct the same
process built and turn any executor evolution into a dead user turn with an `unknown` failure
class. Cheap-model impact: none on the model; a user-visible crash class. Fix: keep (a), convert
(b)/(c) to a logged warning that yields a failed tool result, and build model payloads through one
shared helper in the executor.

### C11 · P3 · bug — A disposition plus one read on a gate pass is a permanent kill while two dispositions get a notice

`assertSemanticDispositionCalls` (`disposition.ts:153-168`) throws `provider_semantic_disposition_invalid`
(permanent) when a gate pass returns `[read, declare_turn_contract]`; `reconcileSemanticDispositionCalls`
(`:129-151`) repairs `[declare, clarify]` with a notice. The gate text forbids mixing (`:62`), but the
project_create routing message says "Reads may accompany a contract" (`review/turn-contract.ts:418`).
Not in the 14-day failure list, so rare today. Fix: reconcile by executing the reads first and
re-issuing the gate, or by taking the disposition and dropping the reads with a notice.

### C12 · P3 · bug — Pre-tool lead-in prose is glued to the final answer without a separator

`turn-provider.ts:1314-1321` flushes the held `assistantCandidate` of a tool pass when no disposition
is among its calls; the next pass's answer follows as another `text_delta`. Retained answers show
the seam: "Let me check whether this task already exists before doing anythingThat task already
exists…" (56a65b9c), "…to give you an accurate pictureHere is the owner status report" (90f7354d),
"Let me read the current document content to make a precise updateWhich one did you mean…"
(579e0c95) in `artifacts/agentic-chat-postdeploy-6d787284c-runs.json`. Cheap-model impact: weak
models narrate before every call, so their answers carry three or four fused lead-ins. Fix: emit
lead-ins as activity-log semantics, or append `\n\n` when flushing.

### C13 · P3 · overengineering — Dead state and stale documentation in the provider

`recordProviderToolCalls`/`getProviderToolCallCount`/`providerToolCallCount` have no call sites
(`turn-provider.ts:330`, `:484-489`, type `:197-198`); `openingTools` is never passed
(`turn-phase.ts:178`, `:211`); `budget:validation_repairs` and `budget:rounds` are never dispatched
(`turn-phase.ts:82`, `:95-97`); `cancel_turn_contract` is mounted on every write-capable pass (420
chars) with 0 production calls, giving the reducer a `contract_cancelled` phase nobody enters;
`README.md:93` documents `review/mutation-batch.ts`, which does not exist; `validation.ts:239-244`
cites the deleted batch reviewer; `projectCreateShellGuidance` is appended twice to the
project_create opening prompt (`review/turn-contract.ts:417` and `disposition.ts:41-44`). Fix:
delete and correct.

### C14 · P3 · prompt_quality — Stale phase instructions accumulate as system messages for the rest of the turn

`appendSystemInstruction` (`request-builders.ts:56-64`) appends; nothing removes. By the answer pass
of an organize turn the model carries the gate instruction ("choose exactly one control tool now"),
the approval instruction, the organize instruction, the carve-out's "for exactly this one pass", and
any ladder nudges, all still imperative. The reviewer is protected (`buildReviewerEvidence` drops
worker system messages, `review/turn-contract.ts:173-179`); the actor is not. Cheap-model impact:
weak models follow the most recent imperative they can match, which is often a stale one. Fix: tag
phase instructions and replace the previous phase instruction instead of appending.

---

## 10. What is right and must not be undone

- `provider-pass.ts`: atomic buffered pass, one retry on another route, truncation detected before
  release, tool-free partials recovered for the user (`:31-124`).
- The direct-write floor in `write-routing.ts` as a deterministic classifier: whole-UUID matching,
  single-hit reads, focused entity, read evidence invalidated at the write boundary
  (`turn-provider.ts:464-472`, `:761-763`).
- SHA-bound approval with static reviewer tools (`controls.ts:83-86`) and a byte-identical reviewer
  system prompt, so the reviewer prefix can cache; reviewer evidence stripped of worker system
  messages.
- `reference_candidates` plus the candidate-ambiguity floor with the prior-message rule
  (`decision-handling.ts:80-141`): a deterministic restraint that turned a real guessed write into a
  question, and that now respects what the user already said.
- The 12-pass ceiling ending in receipt-grounded synthesis, the partial-batch disclosure, the
  receipt fallback text, and never re-running a failed write (`turn-provider.ts:742-754`,
  `:1063-1074`, `repair-policy.ts:250-334`).
- The read memo keyed on the shared read registry (`feedback.ts:158-178`) and the full-length
  retention of prior tool results (`request-builders.ts:288-291`; Finding 11 of 09-02 was rightly
  reverted).
- The `TurnPhase` reducer as a _record_ of what executed and `surfaceFor` as the one write-scope
  decision for the passes that use it — the shape is right even though several phases and one
  branch are dead.
- The validation repair loop's route switch on an identical second failure
  (`turn-provider.ts:1362-1382`).
- The reviewer-mimicry repair and the required-pass prose fallback: both convert former permanent
  kills into one bounded pass.

---

## 11. Measurements

Scripts and raw output: `evidence/lane-C-measure-prompt-sizes.mjs`, `evidence/lane-C-prompt-sizes.txt`,
`evidence/lane-C-battery-pass-counts.mjs`, `evidence/lane-C-battery-pass-counts.md`.

| Measure                                                                                       | Value                                        |
| --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `turn-provider.ts` lines / `prepareInvocation` closure lines                                  | 1,853 / 810                                  |
| Provider directory lines (incl. `openrouter-client.ts` 2,315)                                 | 9,885                                        |
| Closure `let` / closure `const` in `prepareInvocation`                                        | 19 / 24                                      |
| `ToolRoundStreamState` members / `take*` methods / dead members                               | 25 / 4 / 2                                   |
| Distinct `providerError` codes in provider/                                                   | 35                                           |
| TurnPhase phases / event shapes / transitions                                                 | 13 / 14 / 18                                 |
| `declare_turn_contract` schema (JSON chars / outcome fields / actions × kinds / mapped pairs) | 4,354 / 12 (3 req) / 154 / 29                |
| Contract parse rejections / pre-review validation rejections / post-approval                  | 27 / 9 / 2                                   |
| Reviewer rejection codes                                                                      | 12                                           |
| Reviewer system prompt chars (lines) / reviewer tools chars / fixed prefix tokens             | 9,672 (32) / 9,798 / ≈4,868                  |
| `SEMANTIC_COMMISSION_GUIDANCE` / `ACTOR_COMMISSION_GUIDANCE` chars                            | 3,556 (14 lines) / 1,048 (5 lines)           |
| Disposition gate instruction chars (incl. actor guidance)                                     | 2,647 (≈662 tokens)                          |
| Opening routing message chars, lazy variant / full variant                                    | 2,438 / 3,299 (+ shell guidance)             |
| `TOOL_EXECUTION_BATCHING_INSTRUCTION` / carve-out instruction chars                           | 581 / 380 + contract JSON                    |
| `repair-policy.ts` literal instruction chars                                                  | 9,032                                        |
| Recovery mechanisms inventoried / bounds on rounds-or-passes                                  | 21 / 6                                       |
| Battery 6d787284c: turns / acting attempts / reviewer attempts / failed routes                | 17 / 76 / 13 / 9                             |
| Battery 4ac73bde7: same                                                                       | 14 / 59 / 7 / 6                              |
| Battery a1771c1f7: same                                                                       | 17 / 38 / 6 / 10                             |
| Reviewer decisions across the three: approve / revise / clarify                               | 10 / 17 / 6                                  |
| Two-revision turns → approved                                                                 | 7 → 2                                        |
| Provider tests: `agenticChatTurnProvider.test.ts` / `agenticChatTurnPhase.test.ts`            | 99 tests, 10,881 lines / 18 tests, 390 lines |

Token estimates use chars ÷ 4.
