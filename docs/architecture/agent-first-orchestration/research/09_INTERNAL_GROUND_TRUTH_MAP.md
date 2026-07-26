<!-- docs/architecture/agent-first-orchestration/research/09_INTERNAL_GROUND_TRUTH_MAP.md -->

# Internal Ground-Truth Map — what the agent-first experiment actually is in code

**Date:** 2026-07-25
**Method:** Direct reading of `packages/agent-orchestrator/src/`, both paid harnesses, every
`docs/architecture/agent-first-orchestration/` markdown file, every result artifact, plus executed
verification (package typecheck, package Vitest, SHA-256 recomputation, blind-mapping
recomputation, one isolated `tsc` probe). No paid model call was made. No file was modified except
this one.

---

## Scope

Read in full:

- `packages/agent-orchestrator/` — all 71 `.ts` files under `src/` (5,652 runtime lines,
  2,254 test lines), `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.
- `src/testing/harness/` — `corpus/phase-a.json`, `corpus/phase-a-holdout.json`,
  `candidates/candidates.json`, `fixtures/project-alpha.snapshot.json`, all 14 `results/*.json`,
  and `results/README.md`.
- `docs/architecture/agent-first-orchestration/` — all 15 markdown files including `adr/0001` and
  `research/00_SYSTEM_UNDER_REVIEW.md`.
- Paid harnesses: `apps/web/src/lib/tests/agentic-e2e/phase-a/` (5 source files) and
  `apps/worker/tests/phase-a/phaseAWorkflowEval.test.ts`; the npm scripts at
  `apps/web/package.json:39-44` and `apps/worker/package.json:24`.

Verified by execution: `npx tsc --noEmit` in the package (exit 0); `npx vitest run` in the package
(**15 files, 119 tests, all green**); `shasum -a 256` over all result JSONs; recomputation of
`BLIND_JUDGE_MECHANIC_SHA256` and the counterbalanced blind mapping; a standalone `tsc` probe of
`RouteEvalUsageEvent`.

---

## What exists in code

### Contracts (`src/contracts/`, 22 files, ~800 lines)

Zod schemas with inferred types, all `.strict()`, all carrying `schema_version: 1`
(`limits.ts:2`). The notable ones:

- `RouteDecisionSchema` (`route-decision.ts:56-61`) — discriminated union over `route`, with
  route-specific payloads (`direct_action`, `initial_stage`, `questions`, `gap`).
- `route-reason-code.ts:4-29` — four closed reason-code enums, one per route.
- `WorkflowStageSpecSchema` (`workflow-stage.ts:34-79`) — enforces unique step keys, known
  same-stage dependencies, and cycle rejection via `findCycle` (`workflow-stage.ts:8-32`).
- `AcceptanceCriterionSchema` (`acceptance.ts:20-31`) — discriminated on
  `machine_checkable | judgment`, forcing an explicit `validator_id` or an explicit `null`.
- `WorkflowStateDigestSchema` (`workflow-state-digest.ts:83-108`) — hard-caps
  `estimated_tokens` at `MAX_DIGEST_TOKENS = 4_000` (`limits.ts:12`) and requires an
  `overflow` record.
- `BoundedJsonValueSchema` (`primitives.ts:71-74`) — 256 KB UTF-8 payload cap.
- `ModelUsageEvent` (`model-usage.ts:15-25`) — carries an optional `role: ModelUsageRole | null`.

Unused-in-runtime contracts: `StepAssignmentSchema` / `StepBudgetSchema`
(`step-assignment.ts:14-40`) appear only in `testing/fixtures/base.ts:182`; `DirectActionSpec` is
_produced_ by the router (`route-mode.ts:62-78`) but nothing executes it; `RetrievalOption` is
emitted by the librarian (`deterministic-librarian.ts:243-252`) and read by nothing.

### Route mode (`src/application/route-mode/`, 8 files)

`buildPhaseAWorldCard` (`world-card.ts:91-184`) deterministically builds a card containing the
object model, current-project identity and entity counts, two direct capabilities, two agent
cards, a workflow grammar (`max_stages: 5`, `max_replans: 2`, `max_parallel_steps: 4`), a
read-only permission ceiling, and artifact types. It self-converges `estimated_tokens` over four
passes and throws above 1,600 estimated tokens (`world-card.ts:171-181`). The measured card is
well under budget (`route-mode.test.ts:67-76`).

`routeRequest` (`route-mode.ts:147-211`) is one model call plus at most one bounded repair.
`compileRouteDecision` (`route-mode.ts:43-119`) turns the model's `RouteProposal` into a validated
`RouteDecision` **in code**: it hardcodes `project_ids` to the current project, hardcodes `risk`,
synthesizes the `direct_action` operation list, and delegates workflow topology to
`compileWorkflowStage`.

The **fast-then-review** strategy is `routeRequestWithReview`
(`route-mode-with-review.ts:112-194`), policy version `phase-a-route-review-v2`
(`route-mode-with-review.ts:11`):

1. Primary model (Gemini 3.1 Flash Lite) produces a full proposal.
2. Primary failure → one full-route GLM 5.2 fallback (`:132-150`).
3. `capability_gap` short-circuits on the fast path (`:152-154`).
4. A supplied URL is detected **by regex in code** and compiles to
   `workflow / single_source_research` with no reviewer (`:156-170`, regex at `:30`).
5. `routeNeedsReview` (`:32-39`) triggers the reviewer for every workflow proposal whose reason is
   not `multi_step_synthesis`, and for any `direct`/`clarify` proposal matching the research-intent
   regex at `:28-29`.
6. The reviewer runs `classifyWorkflowScope` (`workflow-scope.ts:110-159`), which is constrained by
   `WorkflowScopeFactSchema` (`workflow-scope.ts:10-22`) to emit only
   `{schema_version, classification, confidence}` — one of five semantic classes.
7. `proposalForScope` (`route-mode-with-review.ts:41-77`) maps that class to route + reason code +
   the clarification question, entirely in code.

Workflow topology is then selected by `selectWorkflowPlanShape` (`workflow-plan.ts:24-30`) —
policy `observable-request-features-v1` (`workflow-plan.ts:5`) — from two regexes: a URL
(`:12`) or a project-referent pattern (`:14-18`). The three shapes compile to a librarian-only
stage, a single researcher step, or a two-researcher fan-out with deliberately domain-neutral
foci (`workflow-plan.ts:99-111`).

### Workflow engine (`src/application/workflow-engine/`, 4 files)

`executeWorkflow` (`workflow-engine.ts:320-506`) is a single `while` loop:

- **Guards before each stage:** `stages.length >= PHASE_A_MAX_STAGES` (5) →
  `policy_limit_reached`; `remainingBudget <= 0` or wall-clock exceeded → `budget_exhausted`
  (`:352-361`).
- **Stage execution** (`executeStage`, `:193-318`): repeatedly computes the _ready wave_ — steps
  whose `depends_on_step_keys` are all complete (`:212-214`) — and runs the wave with
  `Promise.all` (`:221-272`). No executable wave throws (`:215-219`). Each step gets
  `maxCostUsd = remainingBudget / ready.length` (`:220`) — naive division, not the reservation
  ledger the V0 plan specifies.
- **Safety stop:** any returned tool call with `effect: 'write'` throws `WorkflowSafetyViolation`
  (`:274-277`); `assertReadOnlyPermission` rejects any non-`read_only` grant up front (`:117-130`).
- **Artifacts:** each `artifact_draft` becomes an `ArtifactEnvelope` with a
  SHA-256-derived deterministic UUID (`:94-100`, `:281-300`).
- **Stage status:** derived from failed/partial counts and artifact count (`:307-315`).
- **Transition policy** (`transitionPolicy`, `:156-187`): purely deterministic on stage status and
  artifact types present. Failure/partial gates offer two actions; the two success paths offer
  exactly one (`append_research` when a context packet exists without research; `complete` when
  research exists).
- **Gate execution** (`:394-405`): if more than one action is legal, call the transition model;
  otherwise construct the proposal in code via `forcedTransitionProposal`
  (`transition.ts:96-103`) and count it as `forcedTransitions`.
- **Replan accounting** (`:433-442`): `replanCount` increments only when `action === 'append_stage'`
  **and** `stage.status !== 'completed'`.
- **Synthesis** (`:446-472`): one text call over selected artifacts, prompt at `synthesis.ts:8-35`,
  payload truncated at 20,000 chars per artifact (`synthesis.ts:12-21`).
- **Post-hoc budget check** (`:484-489`): if `modelCostUsd + toolCostUsd > maxUsd`, the run status
  is forced to `failed` and `output` is blanked — _after_ synthesis has already been paid for.

`buildWorkflowStateDigest` (`digest.ts:22-151`) assembles the digest, sorts steps
failure-first (`:56-60`), tags every artifact `content_trust: 'untrusted'` (`:75`), and applies a
deterministic overflow order (older artifacts → completed steps → open questions → artifacts →
steps → acceptance failures, `:116-147`).

### Librarian (`src/agents/librarian/deterministic-librarian.ts`, 300 lines)

No LLM. Lexical scoring with a 25-word stop list (`:62-90`), token-length weighting (`:102-109`),
and a two-pass expansion in which selected tasks widen the query token set before documents are
ranked (`:163-177`) — this is what resolves C08's "this". Emits a `ContextPacket` with provenanced
facts, ≤4,000-char excerpts, `intentionally_excluded` counts, and one `retrieval_option`
(`:220-255`), wrapped in an `AgentResult` with a self-reported `acceptance_results` entry
(`:282-292`).

### Researcher (`src/agents/researcher/researcher.ts`, 389 lines)

One LLM call over web evidence. Evidence bounds are derived from the assignment, not scenario IDs
(`:193-197`): supplied URLs → visit exactly those and require all of them cited; otherwise 3 visits
(cap 5) and a 2-citation floor. Search query splices up to 800 chars of context-packet facts
(`:134-151`). Visited content is capped at 8,000 chars (`:249-262`).

The genuine architectural asset is the **code-level citation gate** (`:304-322`): URLs are
extracted from the memo, canonicalized, and intersected with the set of URLs actually visited
(including redirect aliases). Anything else is an `unknownCitation`; the run is `partial` unless
`validCitations.length >= minimumCitations && unknownCitations === 0 && requiredSuppliedUrlsMissing === 0`.
Only `validCitations` reach the artifact payload (`:338-343`), and provenance is emitted only for
cited evidence (`:344-353`).

### Ports / adapters (`src/ports/`, 6 files, 124 lines)

`RouteModelPort`, `ResearchModelPort`, `TransitionModelPort`, `SynthesisModelPort`,
`AgentExecutorPort`, `WebResearchPort` — all pure interfaces. `WebResearchPort`
(`web-research.ts:1-4`) is a locally re-declared two-optional-method shape, **not** the
`shared-agent-ops` type the V0 plan says to reuse; the worker harness adapts the production Tavily
implementation into it (`phaseAWorkflowEval.test.ts:51`, `:322-328`).

Only `RouteModelPort` returns unmetered `unknown` (`route-model.ts:12-14`); every other model port
returns usage events. There is no `IdentityPort`, `ProjectAuthorizationPort`, `BuildosReadPort`,
`BuildosOperationPort`, `QueuePort`, `ClockPort`, `IdGeneratorPort`, or `EventSinkPort` — the
V0 plan's other nine ports do not exist.

### The <300-line guardrail

`README.md:411-412` sets a 300-line soft limit and a 400-line "split review" trigger. Four runtime
files exceed 300 lines; one exceeds 400:

| File                                             |                     Lines |
| ------------------------------------------------ | ------------------------: |
| `application/workflow-engine/workflow-engine.ts` |                   **506** |
| `agents/researcher/researcher.ts`                |                       389 |
| `testing/harness/corpus-schema.ts`               |                       379 |
| `testing/harness/blind-judge.ts`                 |                       351 |
| `agents/librarian/deterministic-librarian.ts`    | 300 (exactly at the line) |

`architecture-fitness.test.ts:99-157` enforces forbidden imports, layer direction, and
contracts-only-zod. It does **not** enforce any file-size rule, despite
`V0_ARCHITECTURE_PLAN.md:901` listing "source-file size warning at 300 lines and required
architecture review above 400" as an architecture fitness test.

---

## The measurement pipeline

### Route lane (scenario → `results/route-eval-*.json`)

1. `apps/web/package.json:41-44` sets env: strategy, primary/review model, profiles, output path;
   `--retry=0`.
2. `fixtures.ts:108-113` reads `corpus/${PHASE_A_ROUTE_CORPUS || 'phase-a.json'}` and the snapshot
   from disk.
3. `route-mode-eval.test.ts:293` builds **one** world card from the snapshot, reused for all
   scenarios and all runs.
4. 8 scenarios × 9 runs = 72 logical runs, executed by 3 concurrent workers (`:294-337`).
5. Each run calls `routeRequestWithReview` (or `routeRequest`) through `createPinnedModelPort`
   (`:134-196`), which pins the exact model, disables SmartLLM's internal retry, caps spend at
   $0.02/call, and pushes a role-tagged usage event per call.
6. `infrastructureInvalidReason` (`:111-132`) marks a run unscored if there is no usage event, an
   untagged event, a per-role pin mismatch, or a `released`+0-token provider pre-inference
   rejection. One replacement run is executed per invalid logical run (`:318-328`).
7. `routeMatch = actualRoute === expected_route`; `reasonCodeMatch` likewise; `strictMatch` is the
   conjunction (`:260-273`).
8. `buildRouteEvalReport` (`route-eval-report.ts:198-268`) aggregates over **scored runs only**,
   computes nearest-rank p50/p95 (`:118-123`), and emits `decision` from route accuracy alone
   (`:224-229`).
9. The JSON is written to `/tmp`, then manually copied into `results/` and hashed
   (`NEXT_ITERATION.md:80-89`).

### Workflow lane (scenario → `results/workflow-eval-*.json`)

`apps/worker/package.json:24` → `phaseAWorkflowEval.test.ts`. Per run
(`:427-578`): route through `routeRequestWithReview` with worker-side ports → assert the route is
`workflow` → `executeWorkflow` with a hand-built read-only `PermissionGrant` (`:479-501`),
`maxUsd: 0.05`, `maxWallClockMs: 300_000`, and the route usage seeded as `initialUsage` → run
`evaluateHarnessAcceptance` over `workflow.output` → per-role pin verification
(`:397-425`) → build the report incrementally after every run (`:612-618`).

The agent executor (`:288-367`) dispatches `librarian.v0` to `runDeterministicLibrarian` reading
the snapshot **in process**, and `researcher.v0` to `runResearcher` over the production Tavily
port, reserving $0.008 of tool budget when no URL is supplied (`:319-320`).

Acceptance is evaluated by `acceptance-eval.ts:33-123` against the **final synthesized prose**, not
against artifacts, using literal lowercase substring / regex-section / URL matching.
`allRequiredChecksPassed` is the AND of all `required` checks (`:540-542`).

### Blind comparison (never executed)

`buildBlindComparisonPackets` (`blind-packet.ts:56-124`) requires exactly 3 scenarios × 3 runs,
pairs by `scenarioId-r{runIndex}`, and produces two files: the judge packet and a separate lane
mapping. `createBlindMapping` (`blind-judge.ts:182-215`) derives a rotation from
`sha256(policy_version + "\n" + corpus_version)` then assigns sides structurally. `isWorkflowWin`
(`:282-291`) requires both the panel majority and `workflowRequiredChecksPassed`.
`validatePanelAgainstDj` (`:310-351`) enforces 9 labels, ≥7 agreement, and no complete
scenario inversion.

---

## Every metric and threshold

| Metric                             | Where computed                 | What it actually measures                                                 | Threshold                                                                                                                                                                              | What it does NOT capture                                                       |
| ---------------------------------- | ------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `routeAccuracy`                    | `route-eval-report.ts:145-148` | scored runs whose top-level route string equals the hand label            | ≥0.9 → `routeAccuracyBoundPassed` (`:216`); ≥65/72 Go, 54–64 Change (`PHASE_A_FALSIFICATION_PLAN.md:141`)                                                                              | whether the route was _useful_; whether the compiled plan was right            |
| `reasonCodeAccuracy`               | `:149-152`                     | exact reason-code string match                                            | none (diagnostic)                                                                                                                                                                      | nothing about execution since `observable-request-features-v1`                 |
| `decisionAccuracy` (`strictMatch`) | `:153-156`                     | route AND reason both match                                               | none                                                                                                                                                                                   | —                                                                              |
| `planCriticalReasonAccuracy`       | `:161-167`                     | reason match on C06/C07/C08 only                                          | `PLAN_CRITICAL_REASON_BOUND = 25` of 27 (`:18-19`), applied only when `gatePlanCriticalReasons` is true (`:217-223`) — the web test now passes `false` (`route-mode-eval.test.ts:374`) | now a dead gate                                                                |
| `latencyP50Ms` / `latencyP95Ms`    | `:168-175`                     | wall-clock of the whole route call incl. repair/review                    | direct-expected p50/p95 projected onto control TTFT anchors ≤11,100 / ≤14,800 ms — **computed by hand, not by the report**                                                             | TTFT of any actual streamed answer; the 80 s tail is hidden by p95             |
| `meanCostUsd` / `totalCostUsd`     | `:176-181`                     | sum of `usage[].totalCostUsd`                                             | none for route                                                                                                                                                                         | tool spend (none in this lane)                                                 |
| `repairCount`, `reviewedCount`     | `:157-158`                     | schema repairs; reviewer invocations                                      | none                                                                                                                                                                                   | —                                                                              |
| `infrastructureInvalidCount`       | `:141`                         | runs failing pin/usage checks                                             | expected 0                                                                                                                                                                             | a model-matched timeout (deliberately scored)                                  |
| `decision`                         | `:224-229`                     | `go_candidate` iff route accuracy ≥0.9 and the reason gate is not `false` | —                                                                                                                                                                                      | **latency and cost are not inputs** — see Discrepancies                        |
| `completedCount`                   | `workflow-eval-report.ts:110`  | scored runs with `status === 'completed'`                                 | none                                                                                                                                                                                   | partial-but-good outputs                                                       |
| `requiredAcceptancePassCount`      | `:111`                         | runs where every required check passed                                    | eligibility gate for a blind win                                                                                                                                                       | semantic correctness; en-dash vs hyphen, "usability testing" vs "user testing" |
| `mutationCallCount`                | `:112-114`                     | tool calls with `effect: 'write'`                                         | must be 0 → `safetyPassed` (`:168`)                                                                                                                                                    | anything the engine never saw (the librarian reports no tool calls at all)     |
| `meanModelCostUsd`                 | `:123`                         | model spend only                                                          | ≤ `COST_BOUND_USD = 0.022479` (`:7-8`)                                                                                                                                                 | Tavily spend                                                                   |
| `meanCostUsd` (workflow)           | `:124`                         | model + tool                                                              | reported via `allInCostBoundPassed` (`:158-159`) against the _same_ bound                                                                                                              | the control lane's tool spend, which is not instrumented at all                |
| `durationP50Ms` / `durationP95Ms`  | `:115-122`                     | total run wall clock                                                      | ≤193,325 / ≤297,738 ms (`:9-10`)                                                                                                                                                       | queue/persistence latency (none exists)                                        |
| Blind wins                         | `blind-judge.ts:263-291`       | majority of 3 pinned judges, gated on required checks                     | ≥6/9 overall and ≥3/6 on C06+C08                                                                                                                                                       | never executed                                                                 |
| Panel validity                     | `blind-judge.ts:310-351`       | ≥7/9 agreement with DJ, no complete scenario inversion                    | invalid → stop                                                                                                                                                                         | never executed                                                                 |
| `estimated_tokens` (world card)    | `world-card.ts:83-85`          | UTF-8 bytes ÷ 4                                                           | ≤1,600, throws otherwise                                                                                                                                                               | real tokenizer counts                                                          |
| `estimated_tokens` (digest)        | `digest.ts:18-20`              | JSON **chars** ÷ 4                                                        | ≤4,000 via schema (`workflow-state-digest.ts:106`)                                                                                                                                     | real tokens; inconsistent with the world-card estimator                        |

---

## What is measured vs. what is claimed

`README.md:228-241` lists eleven "System Outcomes". Against the code:

| Claim                                                          | Phase A status                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deterministic scheduling rather than model-managed polling** | **Partially exercised.** `executeStage` (`workflow-engine.ts:211-272`) does compute dependency waves in code, but every stage compiled by `workflow-plan.ts` has either one step or two independent steps with empty `depends_on_step_keys`. The dependency solver has never had a real intra-stage edge outside `workflow-engine.test.ts`.                      |
| **Decision gates / receding-horizon replanning**               | **Not touched.** `transitionPolicy` (`:156-187`) offers exactly one legal action on both success paths, so the model is skipped by construction (`:394-405`). `workflow-engine.test.ts:238-240` asserts `transitionModelCalls === 0` on the two-stage path. ADR 0001 (`adr/0001:97`) now concedes "Phase A therefore does **not** test decision-gate reasoning." |
| **Replanning**                                                 | **Unreachable.** `replanCount` increments only when `stage.status !== 'completed'` (`workflow-engine.ts:434`), but `append_stage` is only reachable via `append_research`, which `transitionPolicy` returns only when the stage _is_ completed (`:166-182`). `PHASE_A_MAX_REPLANS` and the `replanCount > 2` guard (`:435-439`) are dead code.                   |
| **Least privilege / permissions at execution time**            | **Not touched.** One hand-written `PermissionGrant` is asserted to be `read_only` once (`:117-130`) and passed through to `AgentExecutorPort`. No agent checks it; there is no operation-time re-check, no intersection, and no `BuildosOperationPort`.                                                                                                          |
| **Parallel execution**                                         | **Minimally exercised.** Real `Promise.all` fan-out exists (`:221`) and the unit test proves concurrency 2 (`workflow-engine.test.ts:178`). But the only production-shaped fan-out is the 2-researcher `parallel_research` shape, and _zero scored workflow runs exist_. Contention, caps, and starvation are untested.                                          |
| **Artifact provenance**                                        | **Exercised, and it is the strongest real result.** `researcher.ts:304-353` will not let an unvisited URL into `citations` or provenance; `deterministic-librarian.ts:119-132` attaches `buildos_entity` sources to every fact/excerpt. Verified by `researcher.test.ts`.                                                                                        |
| **Durability / survives restarts**                             | **Not touched.** Zero persistence. Artifacts live in a JS array (`workflow-engine.ts:342`).                                                                                                                                                                                                                                                                      |
| **User-visible progress from durable events**                  | **Does not exist.** No event types, no projection, no UI.                                                                                                                                                                                                                                                                                                        |
| **Honest partial completion / recovery from child failure**    | **Partially exercised in unit tests only** (`workflow-engine.test.ts:249-292`). No scored run has ever produced a partial.                                                                                                                                                                                                                                       |
| **Traceability from answer back to artifacts and receipts**    | **Half-built.** Artifacts carry `producer_step_id` and provenance, but the synthesis prompt (`synthesis.ts:23-35`) hands the model artifact payloads with no requirement to attribute, and nothing maps final-answer sentences back to artifact IDs.                                                                                                             |
| **Evaluation harness comparing new vs. existing**              | **Built, never run to completion.** Both lanes exist; the workflow lane has 0 scored runs.                                                                                                                                                                                                                                                                       |

Blunt summary: of the seven headline architectural claims, Phase A exercises **two** (artifact
provenance, bounded specialist context), partially exercises **two** (deterministic wave
scheduling, parallelism), and does not touch **three** (decision gates/replanning, least privilege
at execution, durability). `PHASE_A_AUDIT_2026-07-25.md:323-327` and `NEXT_ITERATION.md:211-215`
both state this correctly — but `README.md` (the top-level document a reader starts from) still
presents the full list as the system being validated.

---

## Recorded results so far

**Scored, valid, canonical:**

| Report                                        | Corpus               | Prompt / policy                   | Routes           | Reasons                        | p50/p95 ms         | Cost      | Decision                                                     |
| --------------------------------------------- | -------------------- | --------------------------------- | ---------------- | ------------------------------ | ------------------ | --------- | ------------------------------------------------------------ |
| `route-eval-v1.json`                          | frozen-v1            | v1, GLM 5.2 single                | 54/72 (75.0%)    | 24/72                          | 2,592 / 10,855     | $0.078734 | change                                                       |
| `route-eval-v2.json`                          | frozen-v1            | v2                                | 59/72 (81.9%)    | 46/72                          | 3,140 / 24,307     | $0.161854 | change                                                       |
| `route-eval-v3.json`                          | frozen-v1            | v3 + low reasoning                | 61/72 (84.7%)    | 28/72                          | 6,728 / 20,934     | $0.140776 | change                                                       |
| `route-eval-v4.json`                          | frozen-v1            | v4                                | 70/72 (97.2%)    | 41/72                          | 4,572 / **75,054** | $0.194495 | `go_candidate` in JSON; **Change** in docs (latency)         |
| `route-model-pilot-gemini-flash-lite-v1.json` | frozen-v1 (24 calls) | v4, Gemini alone                  | 19/24            | 10/24                          | 1,005 / 2,361      | $0.014037 | change                                                       |
| `route-model-pilot-deepseek-v4-flash-v1.json` | frozen-v1 (24 calls) | v4, DeepSeek Flash                | 17/24            | 9/24                           | 2,717 / 12,304     | $0.002180 | stop                                                         |
| `route-strategy-pilot-fast-review-v1.json`    | frozen-v1 (24 calls) | v4 + review-v1                    | 24/24            | 12/24                          | 949 / 4,709        | $0.017058 | go_candidate                                                 |
| `route-eval-fast-review-v1.json`              | frozen-v1            | v4 + review-v1                    | **72/72 (100%)** | 38/72                          | 1,014 / 6,891      | $0.079365 | go_candidate — **later invalidated as a training-set score** |
| `route-eval-v5.json`                          | frozen-v1            | v5 + review-v1                    | 58/72 (80.6%)    | 58/72; plan-critical 22/27     | 1,123 / 17,749     | $0.084033 | change                                                       |
| `route-eval-mitigation-v2.json`               | frozen-v1            | v5 + review-**v2** + scope prompt | 61/72 (84.7%)    | 61/72; plan-critical **25/27** | 1,221 / 21,269     | $0.082816 | change                                                       |
| `route-eval-holdout-v1.json`                  | **holdout-v1**       | v5 + review-v2                    | 15/15 (100%)     | 15/15                          | 938 / 1,572        | $0.008147 | `go_candidate` in JSON; "reported only" in docs              |

**Control lanes:** `control-baseline-v1.json` — 12 runs, 11 clean, TTFT p50/p95 8,860/12,461 ms,
total p50/p95 50,000/148,869 ms, mean $0.005232, required checks 5/12.
`control-a2-v1.json` — 9 scored runs, 6 clean, TTFT p50/p95 6,556/14,744 ms, total p50/p95
105,109/198,425 ms, mean $0.007787, **required checks 0/9**, 0 mutations. All three C07 runs:
`finishedReason: "error"`, `["An error occurred while streaming."]`, assistant text 89/173/73
characters, tool traces containing only `skill_load` / `skill_reference_load`.

**Invalidated:** `workflow-eval-invalid-zdr-v1.json` — 2 attempts, **0 scored**, both
`"Provider rejected a model request before inference."`, $0.023824 operational spend, 0 mutations.
Its two runs recorded route `workflow / context_research_recommendation` for C06 — the pre-fix
reason-driven plan, which under today's code would compile to `single_source_research`.

**Never produced:** any scored workflow output, any blind pair, any judge call, any DJ label, and
`PHASE_A_RESULTS.md` itself. The overall Phase A Go/Change/Stop decision does not exist.

---

## Determinism and reproducibility inventory

**Pinned / hashed:** prompt version + `sha256(ROUTE_SYSTEM_PROMPT)`, world-card version +
`sha256(serializeWorldCard(card))` (`route-mode-eval.test.ts:350-376`); scope prompt version +
hash (added in the same file); corpus version and `snapshot_sha256`, asserted byte-exactly by
`corpus-fixtures.test.ts:149-156`; the blind mechanic hash, which I recomputed as
`ba2602e89290f76688b61ffc957f58591405de01547be0e493c657059ca774d2` — matching
`A2_BLIND_SCORING_PROPOSAL.md:110`. The counterbalanced mapping recomputes exactly to the
documented table (C06 `A B A`, C07 `B A B`, C08 `A B A`).

**Deterministic in code:** world card (`route-mode.test.ts:69-74`), librarian ranking (stable
`localeCompare` tiebreak, `deterministic-librarian.ts:141-143`), artifact/stage/step IDs
(SHA-256-derived, `workflow-engine.ts:94-100`), the plan-shape regexes, the route/reason compiler,
and the transition compiler.

**Nondeterminism enters at:** every model call (temperature 0.1 router, 0 elsewhere, but
providers vary — v1 alone recorded CoreWeave/Decart/Fireworks); OpenRouter provider routing;
`Date.now()` and `randomUUID()` defaults in `executeWorkflow` (`:329-331`) — overridable but the
worker harness does not override them; `new Date().toISOString()` in researcher provenance
(`researcher.ts:351`); live web content and Tavily result ordering; `urlResolves` network checks in
acceptance (`phaseAWorkflowEval.test.ts:369-384`); and 3-way concurrency in the route harness
(`route-mode-eval.test.ts:44`), which affects timing but not scoring.

**Could a run be reproduced exactly? No,** and not approximately either. Beyond model
nondeterminism, three concrete blockers:

1. `route-eval-v5.json` was produced under `phase-a-route-review-v1`, but the constant is now
   `'phase-a-route-review-v2'` (`route-mode-with-review.ts:11`) and the strategy code has been
   rewritten. Re-running `pnpm test:agentic:phase-a-route-v5` today executes mitigation-v2.
2. `route-eval-fast-review-v1.json`, `route-eval-v1..v4`, and the pilots were produced under
   prompt v1–v4, whose text no longer exists in the repo (only v5 does). The recorded
   `prompt_sha256` values are unverifiable against any current file.
3. The report _shape_ has changed at least twice: `route-eval-fast-review-v1.json` runs lack
   `planCritical` / `reviewed` / `reviewReason`; `route-eval-v5.json` lacks
   `planCriticalReasonGateApplied`, `review_prompt_version`, and `review_prompt_sha256`;
   `workflow-eval-invalid-zdr-v1.json` lacks `meanModelCostUsd`, `allInCostBoundPassed`,
   `transitionModelCalls`, and `forcedTransitions`, and still carries
   `latencyP50BoundPassed: false` for a zero-sample run.

---

## Discrepancies

**D1 — Two canonical result SHA-256 values no longer reproduce.**
`PHASE_A_AUDIT_2026-07-25.md:284` states "All eight canonical SHA-256 values reproduce
byte-exactly," and `results/README.md:5-6` states "every SHA-256 still reproduces." They do not.
Recomputed on disk:

- `control-a2-v1.json` → `0180a1b7f2bdc500dd8f7f832d56dbbe2a7740c20d5609fc4fdda70091a5904c`
  (documented `735a445023a62c37ceec538349f5c77499da3e5dc04cb9a7d7207f5f36ee2338`).
- `workflow-eval-invalid-zdr-v1.json` → `db06229b172a9495c785f149ea1713059dd5520657cf5d64a48164fa75f96445`
  (documented `25576e641bf8db1e9527b65e02ec15041038155739128eee921d88bbc15d60ca`).

Cause: both files were re-indented from two spaces to tabs (verified by `od -c` and by a
`JSON.stringify` deep-equality check against the git-staged blobs — the parsed content is
identical). The evidence is unchanged; the provenance mechanism is broken. A formatter can silently
void a hash that the entire experiment's credibility rests on, and nothing in CI or the test suite
detects it. The other twelve reports still match.

**D2 — `RouteEvalUsageEvent` has no `role` field, and the web harness depends on one.**
`route-eval-report.ts:25-33` defines the interface without `role` (in both the staged and worktree
revisions). `route-mode-eval.test.ts:86,90` use `RouteEvalUsageEvent['role']` and `:107` assigns
`role` into that type. An isolated `tsc --strict` probe returns:

```
error TS2339: Property 'role' does not exist on type 'RouteEvalUsageEvent'.
error TS2353: Object literal may only specify known properties, and 'role' does not exist in type 'RouteEvalUsageEvent'.
```

It is not caught because **neither paid harness is typechecked**: `apps/web/tsconfig.json` excludes
`**/*.test.ts`, and `apps/worker/tsconfig.json` includes only `src/**/*`. So
`A2_PROGRESS.md:107-108` ("typecheck green across the package, `apps/worker`, and `apps/web`") is
literally true and materially misleading — the two files that spend money are outside both
typechecks. Runtime behavior is fine (the field is set and read as plain JS, and it does appear in
`route-eval-v5.json` / `route-eval-mitigation-v2.json` usage events), but S4's "per-role
verification in both paid harnesses" is only type-safe in one of them.

**D3 — `pnpm test:agentic:phase-a-route-v5` no longer runs v5.**
`apps/web/package.json:42` and `:43` are byte-identical except for the output path. The v5 script
now exercises review policy v2 and would emit `review_policy_version: "phase-a-route-review-v2"`.
`NEXT_ITERATION.md:50-52` still presents it as the command that produced `route-eval-v5.json`, and
the project memory index still lists it as the next action.

**D4 — The report's `decision` field is not the pre-registered decision.**
`route-eval-report.ts:224-229` computes `decision` from route accuracy alone.
`route-eval-v4.json` therefore carries `"decision": "go_candidate"` while every document records v4
as **Change** because both direct-latency bounds failed. `route-eval-holdout-v1.json` likewise
carries `"decision": "go_candidate"` for a set the plan says is "reported only" and non-gating.
Anyone reading the artifacts without the prose will draw the wrong conclusion twice.

**D5 — B3 is only half-fixed; the all-in cost comparison is not computable.**
The audit's fix (`PHASE_A_AUDIT_2026-07-25.md:130-133`) has two halves: split model-only from
all-in _and_ "instrument the control's tool spend from its tool receipts." Only the first was done
(`workflow-eval-report.ts:123-124`, `:156-159`). `StreamUsageSummary`
(`agentic-e2e/harness/telemetry.ts:44-54`) has no tool-cost field, and `control-a2-v1.json`'s
`totalOperationalCostUsd` equals its model-only `totalCostUsd`. The control demonstrably used paid
search: C08 run 1 made 4 `web_search` + 2 `web_visit`, run 2 made 2 + 2. The pre-registered
"honest headline number" (`PHASE_A_FALSIFICATION_PLAN.md:78-81`) cannot be produced for the
control lane.

**D6 — `results/README.md` still carries the C07 characterization that `A2_PROGRESS.md` retracted.**
`results/README.md:190-192`: "All three C07 runs ended with the production lane's model-matched
timeout after its internal retry." `A2_PROGRESS.md:48-54` explicitly corrects this
("The artifact does not show a timeout; it shows a stream error after skill loading"). The JSON
agrees with the correction: `finishedReason: "error"`. Two canonical docs, one uncorrected.

**D7 — `research/00_SYSTEM_UNDER_REVIEW.md` is stale in two load-bearing places.**
Line 53 says A1 returned Change "at 58/72" (that is v5; the current recorded result is 61/72 from
mitigation-v2). Line 82 says the held-out corpus "has not been scored" — it was scored 15/15 and
`route-eval-holdout-v1.json` exists. This is the file being handed to external researchers.

**D8 — Test-count claims are stale.** `A2_PROGRESS.md:107` claims "14 files, 108/108 tests green."
Actual, run in this session: **15 files, 119 tests**.

**D9 — `workflow-engine.ts` grew past the recorded exception.** `PHASE_A_AUDIT_2026-07-25.md:274`
records N4 at 486 lines, "past the README's own 400-line split-review trigger, with no recorded
exception." It is now **506** lines. It grew while the finding was open.

**D10 — Acceptance criteria are authored, then ignored.** Every compiled `StepSpec` carries
`acceptance_criteria` (`workflow-plan.ts:53-58`, `:81-87`, `transition.ts:206`), and
`AcceptanceCriterionSchema` was designed to prevent self-grading (`A0_CONTRACT_REVIEW.md:31`). No
runtime code reads `step.acceptance_criteria`. The researcher emits `criterion_id:
'research.citations.valid'` unconditionally (`researcher.ts:358-364`), which does not match the
criterion IDs the fan-out steps declare (`research-source-a.cited_findings`). The `judgment`-kind
criteria the plan compiler emits have `validator_id: null` and are never judged by anything. The
only real acceptance evaluation is the harness's substring matcher over the final prose.

**D11 — `join_policy`, `decision_gate`, and `failure_policy` are decorative.** They are written by
`workflow-plan.ts:90-92`, `:118-120` and `transition.ts:210-212`, validated by the schema, and read
by no runtime code (verified by grep across `src/`). `executeStage` always waits for all steps and
derives status from counts (`workflow-engine.ts:307-315`); `best_effort` is never produced and
would behave identically if it were.

**D12 — Three corpus validators have no implementation in the package harness.**
`corpus/phase-a.json` uses `answer.bullet_count` (C04), `route.asks_question` (C09), and
`route.reports_gap` (C12). `acceptance-eval.ts:44-114` implements six validators, none of them
these three; the `default` branch returns `passed: false` with "unsupported A2 workflow validator"
(`:112-113`). They are implemented only in the control-lane copy
(`agentic-e2e/phase-a/acceptance.ts:66-144`). Harmless today because only C06/C07/C08 run through
the workflow lane, but it is a live instance of audit finding N2 (duplicate validator
implementations) with a real behavioral divergence already present.

**D13 — `context_type` is recorded and ignored by the route lane.** Three holdout scenarios are
`context_type: 'global'` (`phase-a-holdout.json`), yet `route-mode-eval.test.ts:293` builds a
single project world card and reuses it for every scenario. A "global" request is scored against a
world card that asserts one specific current project. Only the control lane honors the field
(`phase-a-control.test.ts:92`).

**D14 — The workflow harness discards the model's normalized objective.**
`compileWorkflowStage` sets `step.goal` from `proposal.objective`, but the harness passes
`objective: params.scenario.request_text` and `focus: request.step.goal`
(`phaseAWorkflowEval.test.ts:333-334`). So the researcher's `extractHttpUrls` and search query are
built from the raw request, not from the routed objective — convenient for C06's URL, but it means
the objective-normalization step is untested end to end.

**D15 — `WebResearchPort` is redeclared, not reused.** `V0_ARCHITECTURE_PLAN.md:69` says the port
"Exists under this exact name… Reuse it; do not define a competing type." `ports/web-research.ts:1-4`
defines a competing four-line type with two optional methods; the worker harness adapts between
them.

---

## Dead ends, stubs, and unused code

- **Replan machinery.** `PHASE_A_MAX_REPLANS`, the `replanCount` increment, and the
  `policy_limit_reached` branch (`workflow-engine.ts:38`, `:433-439`) are unreachable given
  `transitionPolicy`. Likewise `PHASE_A_MAX_STAGES = 5` — the only append path produces at most two
  stages.
- **Transition contract surface.** `TransitionDecisionSchema` defines seven actions
  (`transition-decision.ts:31-54`); `compileTransitionDecision` (`transition.ts:174-236`) can emit
  four. `continue_existing_graph`, `request_user_input`, and `capability_gap` are never produced.
  Ten of the fourteen `TransitionReasonCode` values are unreachable.
- **`StepAssignment` / `StepBudget`** (`step-assignment.ts`) — contract-only; the engine passes
  `StepSpec` + grant + `maxCostUsd` straight to the executor. The plan's model-authored /
  policy-derived split (`V0_ARCHITECTURE_PLAN.md:391-396`) is not implemented.
- **`DirectActionSpec`** — compiled by `route-mode.ts:62-78` and thrown away. The CEO fast lane is
  not implemented, so the projected-TTFT bound is an arithmetic projection, never a measurement.
- **`RetrievalOption`** — the librarian emits exactly one (`deterministic-librarian.ts:243-252`);
  nothing consumes it.
- **Digest fields permanently empty:** `contradictions` and `user_signals`
  (`digest.ts:78`, `:80`). `DigestUserSignalSchema` has no producer.
- **`ResearcherInput.minimumCitations` / `maxVisits`** — the S2 de-scenario-ization left these
  parameters in place (`researcher.ts:62-65`) with no caller supplying them.
- **`WebResearchPort.search` / `.visit` are both optional** — the researcher handles absence with
  early-return failure paths (`researcher.ts:203-216`, `:245`) that only unit tests reach.
- **`architecture-fitness.test.ts:34-42`** whitelists `artifacts` and `projections` directories
  that do not exist, and has no rule for `testing/`, so harness code may import anything.
- **`MAX_DIGEST_TOKENS`** is imported by the schema but `digest.ts:113` hardcodes `4_000` rather
  than using the constant.
- **`candidates/candidates.json`** — 11 proposed candidates retained as selection provenance;
  three now also live in the holdout corpus, and `corpus-fixtures.test.ts:136-147` cross-checks
  them for drift. The remaining rejected item ("Yes, update the document") is not retained anywhere
  (`A0_CORPUS_REVIEW.md:46-47`).
- **`PHASE_A_RESULTS.md`** — referenced by seven documents; does not exist.
