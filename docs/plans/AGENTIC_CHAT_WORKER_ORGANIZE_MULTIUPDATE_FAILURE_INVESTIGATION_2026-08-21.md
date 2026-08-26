<!-- docs/plans/AGENTIC_CHAT_WORKER_ORGANIZE_MULTIUPDATE_FAILURE_INVESTIGATION_2026-08-21.md -->
<!-- doc-status: point-in-time -->

# Why `project-organize` and `task-multi-update` keep failing on the worker

**Date:** 2026-08-21
**Question asked:** Is the test too stringent, can the agent not do the work, or is something not
hooked up? Where exactly is the problem, and what else is wrong around it?
**Inputs:** the 08-21 post-deploy report, all 33 retained worker evidence artifacts in
`docs/plans/evidence/`, the `chat_tool_executions` rows for every organize/multi-update turn since
08-15 (full contract + reviewer arguments, which the JSON artifacts do not retain), live Railway
variable readback, live `/health`, and the worker/runtime/harness source at `8135a71e2`.

## 1. Bottom line

| Question                   | Answer                                                                                                                                                                                                                                    | Evidence                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is the test too stringent? | **No.** Both scenarios are passable as written, by this model, on this worker.                                                                                                                                                            | Worker passed organize **3/3** and multi-update **3/3** on 07-31 (`bb0f16da1`, before the semantic reviewer existed). Legacy passed both **3/3** on 08-19. Worker passed organize **1/1** under the reviewer on 08-15 (`cab842a83`) and multi-update **4/12** under the reviewer on 08-19/20 when write tools were on. |
| Can the agent do the work? | **Yes.** The acting model reads everything, proposes sensible taxonomies, resolves all three task references correctly, and asks for the right tool names.                                                                                | Every organize contract since 08-15 named 3–4 reasonable folders and all six document IDs. Every multi-update contract after one revision was exactly the three correct changes.                                                                                                                                       |
| Is it hooked up?           | **Transport yes; writing no.** All six turns ran `worker_realtime`, completed, and streamed over Realtime. But the production worker currently advertises **zero** write tools, so every mutation scenario is impossible by construction. | Railway: `AGENTIC_CHAT_MUTATION_PROVIDER_CAPABILITIES=''`, `AGENTIC_CHAT_MUTATION_ADAPTER_CAPABILITIES=''`. 12 tools advertised; `create_onto_document` / `update_onto_task` rejected `provider_tool_not_allowlisted`.                                                                                                 |

So the 0/6 is two things stacked: a **configuration state that makes passing impossible** (3 of 6),
and a **reviewer loop with structural defects** that clarifies instead of executing (3 of 6). Neither
is "the model can't do it" and neither is "the test is unfair." The 08-21 report got both halves
right; what it understates is that the reviewer defects are _structural_ (the contract language
cannot say what the reviewer demands), that organize has **never** executed a single write on the
worker since the reviewer landed, and that the harness has no guard against spending money on an
environment that cannot pass.

## 2. The history nobody has put in one table

Worker batteries, organize + multi-update only. "Writes" = mutation tool executions observed.

| Date / artifact                                      | Reviewer?           | Write caps on worker | organize | multi-update | Organize failure shape                                                 |
| ---------------------------------------------------- | ------------------- | -------------------- | -------: | -----------: | ---------------------------------------------------------------------- |
| 07-31 `bb0f16da1` phase1 gate                        | no                  | yes                  |  **3/3** |      **3/3** | `create_onto_document ×3–5 → move ×6`, done                            |
| 08-15 `debe7170c` phase4 gate                        | **yes (new)**       | yes                  |      0/1 |          3/3 | clarification                                                          |
| 08-15 `cab842a83` retest                             | yes                 | yes                  |  **1/1** |            — | approve → batch approve → create ×3 → batch approve → move ×6          |
| 08-18 `091300faf`                                    | yes                 | yes (4 caps)         |      0/3 |          0/3 | 2× allowlist (after approval), 1× clarify                              |
| 08-19 `870c3feef`                                    | yes                 | yes                  |      0/3 |          1/3 | 1× allowlist, 2× clarify                                               |
| 08-19 `33b4faec`                                     | yes                 | yes                  |      0/3 |          2/3 | 1× allowlist, 2× clarify                                               |
| 08-19 legacy comparator                              | n/a                 | n/a (legacy)         |  **3/3** |      **3/3** | —                                                                      |
| 08-20 `49dcd5a2b` (dedicated Railway, staged 4 caps) | yes                 | yes                  |      0/3 |          0/3 | batch reviewer "incomplete batch" veto; count nitpick; START HERE veto |
| 08-20 `0ee9cb82f`                                    | yes + revision exit | yes                  |      0/3 |          1/3 | 2× args-invalid (tasker 58), 1× revise→clarify                         |
| 08-21 `ff6e8eed6`                                    | yes                 | **unknown/empty**    |      0/3 |          0/3 | 1× read-loop budget, 2× revise→clarify                                 |
| 08-21 `8135a71e2` (this report)                      | yes                 | **empty**            |      0/3 |          0/3 | 2× revise→clarify, 1× approve→allowlist                                |

Totals for August on these two scenarios: **53 paid turns, 11 passes, $0.53.** Organize under the
reviewer: **1 pass in 22 turns**, and that single pass happened on the _first_ reviewer prompt
before it was hardened for restraint.

Two things jump out:

1. **Every organize failure since 08-18 is the harness saying no, not the model saying no.** The
   model reaches a sensible plan every time. Reviewer vetoes, allowlist rejections, and arg-parsing
   errors consume 21 of 21 failures.
2. **Fixes have been whack-a-mole.** 08-19 `33b4faec` scored 11/18 on the six-scenario battery;
   the next day's `49dcd5a2b` scored 5/18 after prompt hardening for restraint. Each fix was
   validated on its target scenario and shipped without a regression battery. The reviewer prompt
   has been edited on 08-15, 08-19, 08-20 (twice), and 08-21.

## 3. Root causes, ranked

### RC1 — The production worker cannot write (config; 100% of mutation scenarios fail)

`phase3Config.ts` parses both capability lists; both are the exact empty string on
`agentic-chat-worker`. With no reviewed mutation spec in the surface, the worker advertises 12
read/control tools. Once the reviewer approves a contract the acting model is told (by the
`declare_turn_contract` description) to "complete every outcome," has no write tool to do it with,
and emits a tool name from its BuildOS vocabulary anyway → `provider_tool_not_allowlisted`,
permanent, "An error occurred while streaming." to the user after ~55 s.

This is the documented Phase 6 invariant ("keep both lists exact empty strings unless a separate
mutation rollout is approved"), so it is not a mistake by whoever provisioned the service. The
mistake is **running paid mutation batteries against it** — twice on 08-21 — and then writing
reports that discuss reviewer behavior as if the environment could have passed.

Three hookup gaps make this easy to repeat:

- `/health` does not report capability names or counts (checked live: no field).
- The harness worker preflight (`worker-client.ts#requireWorkerLease`) proves a lease, never the
  write surface. It will happily spend on a read-only worker.
- With zero write tools the worker still offers `declare_turn_contract`, runs two reviewer passes
  (`gpt-5.6-luna`, ~40% of turn cost), and only then fails. A surface with no reviewed mutation
  tool should not offer a contract tool at all — it should be read-only by construction.

One more drift: the handoff says the cohort is "exactly one UUID"; Railway now has two (DJ's canary

- the `76c04859…` harness user). Harmless, but the docs and the readback no longer agree.

### RC2 — The reviewer loop has four structural defects (3 of 6 today; ~all organize failures)

I read every reviewer argument from the database. The reviewer is not being capricious; it is
following its instructions into dead ends the harness built.

**2a. The contract language cannot express "move into the folder I'm about to create."**
Organize is inherently create-then-move. A `move` outcome needs a destination, but the destination
does not exist until a `create` outcome executes. The reviewer (instructed: "resolves every target
and required value without guessing") reads the literal contract and finds unbound destinations
every time:

> rep 1: "the newly created folder IDs are not bound … approving it would require guessing."
> rep 2: "what exact document titles should be used for the four new parent documents (Reference,
> Planning, Pricing, Outreach) …" — asking the user to confirm titles _the model had already chosen_
> and the reviewer itself called "sensible."

There is no `parent_outcome_id` or symbolic reference in `turn-contract.ts`. The one organize pass
(08-15) got through because that reviewer prompt did not yet demand per-move destination binding.
The 08-19/20 hardening for restraint (`reference_candidates`, "without guessing") collaterally made
every organize contract unapprovable.

**2b. The reviewer cannot see tool semantics.** `buildTurnContractReviewRequest` passes
`request.messages` only — no tool schemas. "Top priority" → priority `1` is defined in the
`update_onto_task` schema ("1 is the HIGHEST … 'Make this top priority' means 1"), which the acting
model sees and the reviewer does not. Result, three batteries in a row (0ee9cb82f, ff6e8eed6,
8135a71e2):

> "What numeric priority value should 'top priority' mean … should I set it to 1 (currently it is 4)?"

The user is asked to confirm a mapping the product already defines.

**2c. One revision per turn, then the user.** `MAX_CONTRACT_REVISIONS_PER_TURN = 1`. Today's
multi-update rep 1: the first contract was garbage (see 2d), the revision fixed it, the second
contract had one small flaw (an uncommissioned `description` note + the priority question from 2b),
and the reviewer's remaining exits were approve / read-only / ask-user → ask-user. The reviewer
prompt literally says "The acting model has already used its one correction for this turn; approve,
correct to read-only, or ask the user." A second minor flaw is routed to the human by design.

**2d. The acting model emits degenerate `target_ids` and the parser accepts them.** In three
batteries the first multi-update contract had an outcome with **50 target IDs, 4 unique** —
`deepseek-v4-flash` looping the same four IDs to the array cap. `readStringArray` accepts up to 50
without deduplication, so a nonsense outcome reaches the reviewer and burns the single revision.
A five-line dedupe/reject with a repair message would return it to the model for free.

**2e. The worker's organize path is deliberately harder than legacy's.** Legacy's
`move_document_in_tree` accepts `new_parent_title` and creates the parent on the fly — organize is
six calls, one phase. The worker catalog strips it ("Parent-by-title creation is not available in
the worker"), so organize becomes create → batch review → move → batch review. Legacy also has a
deterministic nudge (`buildOrganizeCommissionRepairInstruction`: "execute it now, one move per
document, same `new_parent_title` for a category") wired in `finalization-runner.ts`; the worker has
no equivalent. Same model, same test: legacy 3/3, worker 1/22. The gap is the harness, not the model.

### RC3 — Evidence and process gaps that keep hiding RC1 and RC2

- The artifact records `provider_tool_not_allowlisted` but not the rejected tool name, even though
  `providerToolNotAllowlistedError` already builds a diagnostic with `rejectedToolName` and
  `advertisedToolCount`. It just isn't in the retained observation allowlist.
- The artifact does not retain contract or reviewer arguments; every "why did it clarify" answer
  requires a database query. Three reports in two days described reviewer behavior from tool-name
  sequences alone.
- `prepared_prompt_hit` is `false` on all six harness turns (the harness never prewarms), so harness
  TTFT (7–11 s) is not what a real user sees — fine, but nobody has written that down.
- No pre-push regression battery. A reviewer-prompt edit can zero a scenario and ship.

## 4. Hookup audit

| Surface                                            | State | Note                                                       |
| -------------------------------------------------- | ----- | ---------------------------------------------------------- |
| Web → transport lease → worker admission           | ✅    | Exact `worker_realtime` lease on all 6; no legacy fallback |
| Worker claim / Realtime publish / durable terminal | ✅    | 6/6 `completed`; Realtime 1 channel, 0 failures            |
| Railway auto-deploy from `main`                    | ✅    | `b03daf6d` at `8135a71e2`; "Wait for CI" still off         |
| Cohort routing (Vercel ↔ Railway)                 | ⚠️    | Works; Railway has 2 IDs vs documented 1                   |
| Mutation provider capabilities                     | ❌    | empty                                                      |
| Mutation adapter capabilities                      | ❌    | empty                                                      |
| `/health` exposes write surface                    | ❌    | absent                                                     |
| Harness preflight checks write surface             | ❌    | lease only                                                 |
| Contract tool offered when no write tools          | ❌    | yes — wastes two reviewer calls per turn                   |
| Rejected tool name in evidence                     | ❌    | computed, not retained                                     |
| Worker `move_document_in_tree` parent-by-title     | ❌    | stripped; legacy has it                                    |
| Worker organize execution nudge                    | ❌    | web-only                                                   |
| Reviewer sees tool schemas                         | ❌    | messages only                                              |
| Contract `target_ids` dedupe                       | ❌    | accepts 50 dupes                                           |

## 5. What a real user would have experienced

Organize: ~110 s of "Checking the requested change…" then a question asking them to name the
folders — after the assistant had already told them, in prose, which six documents go in which
three folders. Multi-update: ~55 s then either "should top priority be 1?" or a generic streaming
error. The product promise ("turn messy thinking into structured work") is not being kept on the
worker path, and the failure mode is worse than doing nothing because it _looks_ like thinking.

## 6. Decisions for DJ

Each of these changes what users experience or spends money. Everything else below I'd just do.

**D1 — Turn on writes for the one-user canary worker.** Set both capability lists to
`createOntoDocument,updateOntoDocument,moveDocumentInTree,updateOntoTask,createOntoTask` (the 08-21
report's three-tool minimum is insufficient: every organize contract includes a START HERE
`update/document` outcome, and the 08-18–20 batteries already ran with four). Risk is bounded to
the two cohort users. Without this, no mutation battery can pass and none should be run.

**D2 — Lean vs ambitious on the reviewer.**
_Lean (prompt + small code, ~half a day):_ dedupe `target_ids`; put the priority scale and "delegated
organization resolves folder titles and destinations" into the reviewer's commission guidance; raise
revisions to 2; forbid the reviewer from asking the user for any value the contract already carries.
Expected: multi-update back to ~2/3, organize still mostly blocked by 2a.
_Ambitious (~2 days):_ give the contract symbolic references — a `create` outcome gets a `label`, a
`move` outcome gets `parent_label`; code binds the ID after the create executes; the reviewer is told
to judge the taxonomy, not the IDs. Restore `new_parent_title` on the worker move tool so organize
collapses to one phase like legacy. Port the organize nudge. This is the version where the worker
stops being structurally worse than legacy at the product's headline promise.

**D3 — Stop paying for impossible batteries.** Add capability names/counts to `/health`; make the
harness preflight fail closed when a scenario's required write tools aren't advertised; stop
offering `declare_turn_contract` when no reviewed mutation tool is in the surface. Cheap, and it
ends the class of report we wrote today.

## 7. Verification plan (after D1/D2 land)

1. Local worker with the five capabilities: focused suites for `turn-contract`, provider assembly,
   `readOnlyProvider` review paths, plus a new regression fixture for each observed
   revision→clarification shape (today's six are in the appendix).
2. Zero-spend preflight proving the write surface is advertised.
3. One smoke rep per scenario, zero retries, read `controlDecisions` and the DB contract rows first.
4. Only then the full six-scenario battery at ≥5 reps, and **compare against the previous six-scenario
   artifact before pushing any reviewer-prompt change** — that is the regression gate that has been
   missing.

## 8. Appendix — the reviewer's own words (08-21, from `chat_tool_executions`)

**organize rep 1** (`9a894ef6`): contract 1 = create ×3 (min 3), move ×6, update START HERE ×1.
Revision: "omits the required values … the three folder titles and positions, each document's
destination assignment, and the updated START HERE content." Contract 2 = three creates with
`changes:[title,position]`, moves split 2/3/1, START HERE content = a stub title. Clarify: "the newly
created folder IDs are not bound … Should the contract explicitly bind pricing ideas v2 FINAL and
random thoughts to Reference…" — asking the user to restate the model's own plan.

**organize rep 2** (`ef104bdf`): contract 1 = 4 creates, 4 moves, 1 update. Revision: enumerates all
six docs as uniquely resolved, then demands titles/destinations in the contract. Contract 2 adds
`required_fields` but no `changes`. Clarify: "what exact document titles should be used for the four
new parent documents (Reference, Planning, Pricing, Outreach)…"

**organize rep 3** (`3c38b38f`): approved on first review ("delegated organization request resolves
folder assignment"). Next pass: `create_onto_document` → not allowlisted. _Would have proceeded with
writes on._

**multi-update rep 1** (`64c3ba1d`): contract 1 = one outcome, 50 target IDs (4 unique), min 1.
Revision (correct and precise): three separate outcomes with exact IDs. Contract 2 = the three
correct changes + a fourth `description` note. Clarify: "loaded context does not define its numeric
mapping … do you also want the onsite-moved note recorded?"

**multi-update reps 2–3** (`3519facc`, `e0d9d3cd`): first declare rejected by the parser (min 2 on 1
target — the tasker 58 message now explains it; model repaired in one try). Revision: remove the
uncommissioned `in_progress`. Re-declare → **approved**. `update_onto_task` → not allowlisted.
_Both would very likely have passed with writes on._

**Earlier, with writes on** — 08-20 `49dcd5a2b` organize rep 1: contract approved, first batch
(create 4 folders) vetoed by the _batch_ reviewer: "omits the six commissioned document moves. Should
the batch be corrected to include all six moves?" — moves cannot be in the same batch as the creates
they depend on. (That specific veto was fixed in the 08-20 evening prompt; 2a is what remains.)

Queries used (now in the repo, untracked):
`apps/web/scripts/agentic-e2e/dump-turn-decisions.mjs` pulls `chat_tool_executions` by
`turn_run_id` for every turn in a retained artifact; `render-turn-decisions.py` renders the
contracts, reviewer revisions/clarifications/approvals, and mutation calls per turn. Run the first
from `apps/web` with `.env` loaded.
