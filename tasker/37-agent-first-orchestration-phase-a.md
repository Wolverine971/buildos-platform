<!-- tasker/37-agent-first-orchestration-phase-a.md -->

# 37 — Agent-First Orchestration: Phase A Falsification (Slice A0 kickoff)

**Created 2026-07-24.** Owner: agent-first orchestration implementer.
**Type:** bounded falsification build — model-behavior evidence before any durable engineering.
**Status: CLOSED 2026-07-26.** DJ closed the routing-gate track after the A1 label exercise showed
the 65/72 gate arithmetically unreachable (3/13 labels contested; two depend on post-route
knowledge). Recorded decision: `docs/architecture/agent-first-orchestration/PHASE_A_RESULTS.md`.
Final scored state: A1 mitigation v2 = Change (61/72); holdout 15/15 fast-path only; A2 built,
never scored. Carry-forward: peek-then-decide router design, a `context-then-decide` route, the
contracts package. The quality question continues in the open-brief instrument
(`OPEN_BRIEF_EVAL_METHODOLOGY.md` + `corpus/open-brief-v1.json`, Blocks B/C folded 2026-07-26).

**Architecture:** `docs/architecture/agent-first-orchestration/README.md` (system rationale),
`V0_ARCHITECTURE_PLAN.md` (contracts, state machines, phases — revised 2026-07-24),
`AUDIT_2026-07-24.md` (why the plan looks this way),
`PHASE_A_FALSIFICATION_PLAN.md` (this phase's spec — **read it in full before starting**).

## Outcome

Slice A0 done means: `packages/agent-orchestrator` exists with validated zod contracts and
contract tests; an 8-scenario corpus from real production transcripts is frozen with DJ-approved
route labels; control-lane TTFT/cost baselines are measured; the CEO evaluation model is pinned
in an ADR; and the go/change/stop decision rule is committed with real baseline numbers. That
unlocks A1 (route-accuracy measurement) and A2 (workflow lane vs. control comparison), which
produce `PHASE_A_RESULTS.md` and the recorded decision that gates Phase B.

## Non-goals (all of Phase A)

- no database tables, migrations, or RLS;
- no queue job types, leases, fencing, or reconciliation;
- no UI of any kind;
- no imports from the existing cognition layer (agentic-chat prompt builder/context
  loader/skills/supervisor, agent-run loop, deep-research orchestrator, tree-agent paths);
- no mutation scenarios — every comparison scenario is read-only;
- no autonomous BuildOS writes anywhere;
- everything except `src/contracts/` is allowed to be throwaway code.

## DJ gates (do not proceed past these without DJ)

1. **Corpus selection (end of WP-3):** agent presents 10–12 candidate scenarios; DJ picks 8 and
   confirms the route label for each. Labels are locked before any prompt work in A1.
2. **Contract review (end of WP-2):** DJ sanity-checks the drafted leaf types (~10 sub-types the
   architecture doc references but does not define). Agent drafts with rationale; does not block.
3. **Decision-rule sign-off (end of WP-5):** DJ approves the final thresholds after baselines
   are measured.
4. **Before A2 only:** blind-scoring mechanic. DJ approved exactly nine blind pairs, the frozen
   three-model judge panel, DJ blind-scoring all nine, and the 7/9 validation floor with
   scenario-inversion protection on 2026-07-25.

## Landmines and conventions (read before writing any code)

- **pnpm only, never npm.** Prettier: tabs, single quotes, no trailing commas, 100-char width.
- **Package scaffolding:** mirror `packages/shared-agent-ops` conventions (package.json scripts,
  tsup TS 5.9 build, tsconfig, vitest setup). Match the workspace's existing zod version — check
  what `apps/web` / sibling packages pin before adding the dependency.
- **Dependency direction from day one:** the package imports nothing from `apps/*` and nothing
  from agentic-chat / agent-run / deep-research / tree-agent paths. Add the architecture fitness
  test (a vitest that greps import statements for forbidden paths) in WP-1, not later.
- **`pnpm test:agentic` harness quirks** (control lane, lives at
  `apps/web/src/lib/tests/agentic-e2e/`): it drives the REAL v2 stream endpoint against a local
  dev server; the login route is `/api/auth/login` (not `/auth/login`); the test user must have a
  `public.users` row; throwaway test-user creds are already in the web `.env`; call the harness's
  releaseTurn between turns. **Local vite dev never finalizes `chat_turn_runs`**, so TTFT must be
  measured client-side in the harness (first SSE text event timestamp), never from telemetry rows.
- **LLM calls** go through `packages/smart-llm` (OpenRouter primary; keys in `.env`). Real API
  = real money; the `apps/web` `pnpm test:llm` lane is the precedent for tests that cost money —
  keep Phase A eval runs in an explicit script/lane, never in the default `pnpm test` path.
- **Production transcript pull** (`chat_sessions` / `chat_turn_runs`): use the supabase skill.
  If using the Supabase CLI, stable `2.90.0` is the validated version in this environment —
  `2.109.1` management commands hang (see tasker/36 A0). Anonymize any third-party names/emails
  before freezing fixtures.
- **Commits:** only when DJ asks, and always with an explicit pathspec
  (`git commit -- <paths>`) — unrelated work is routinely pre-staged in this repo.

## Work packages

### WP-1 — Package scaffold

- [x] `packages/agent-orchestrator` with the §4 directory skeleton (contracts/, domain/,
      application/, agents/, artifacts/, policy/, ports/, projections/, testing/) — empty
      modules are fine beyond `contracts/` and `testing/harness/`.
- [x] Vitest wired; `pnpm typecheck` and `pnpm test` green from the repo root via turbo.
- [x] Architecture fitness test: forbidden-import grep test passing.

### WP-2 — Contracts and contract tests

- [x] Zod schemas + inferred types for the eight core contracts: `RouteDecision` (closed
      `reason_code` union — enumerate it), `WorkflowStageSpec`, `StepSpec`, `StepAssignment`
      (+ `StepBudget`), `ContextPacket`, `AgentResult`, `ArtifactEnvelope`,
      `TransitionDecision`; plus `WorkflowStateDigest` and `DirectActionSpec`.
- [x] Draft the undefined leaf types with a one-line rationale each: `AcceptanceCriterion`
      (must carry a `machine_checkable` validator id where applicable), `AcceptanceResult`,
      `CapabilityGap`, `PermissionGrant` (per §10 fields), `ProvenancedFact`,
      `ProvenancedExcerpt`, `ArtifactReference`, `ArtifactProvenance`, `ArtifactDraft`,
      `RetrievalOption`, `ProjectScope`, `DirectOperation`.
- [x] Contract tests: valid fixtures accepted; malformed, oversized, and unknown-`schema_version`
      payloads rejected; round-trip without losing IDs/permissions/provenance.
- [x] **DJ gate 2:** DJ approved the draft leaf types on 2026-07-24.

### WP-3 — Corpus candidates and frozen snapshot

- [x] Pull 10–12 candidate scenarios from real production chat history covering the Phase A
      class mix (2× simple read, status summary, single-source lookup, multi-source research,
      context→research→recommendation, ambiguous, unsupported capability).
- [x] Freeze one project snapshot fixture (precedent:
      `tests/integration/fixtures/deep-research-base.sql`).
- [x] For each candidate: request text, snapshot ref, proposed route label, proposed
      machine-checkable acceptance checks. Anonymized.
- [x] **DJ gate 1:** DJ approved C01, C02, C04, C06, C07, C08, C09, and C12 and locked
      their labels on 2026-07-24. Store under
      `packages/agent-orchestrator/src/testing/harness/corpus/`.

### WP-4 — Control-lane baselines

- [x] Wire the 8 scenarios into the `test:agentic` harness as scenario files.
- [x] Add client-side timing capture if absent (TTFT = first text event; total duration; token
      usage/cost from the response metadata or `llm_usage_logs`).
- [x] Run the corpus once (3 runs for the timing-sensitive simple scenarios); record p50/p95
      TTFT and cost per scenario class in the tasker BUILD STATUS.

### WP-5 — Model pin and decision rule

- [x] Small ADR in `docs/architecture/agent-first-orchestration/adr/`: pinned CEO
      route/transition model (+ specialist model), with the smart-llm profile used.
- [x] Finalize the decision-rule numbers in `PHASE_A_FALSIFICATION_PLAN.md` using the WP-4
      baselines (replace the placeholder 1.5× TTFT bound with a measured-baseline-derived one).
- [x] **DJ gate 3:** DJ approved moving forward on 2026-07-24 after reviewing the measured
      thresholds and plain-English control results. Commit nothing until asked; record state here.

## Definition of done (Slice A0)

All five WPs checked, three DJ gates passed, and A1 can start without inventing anything: the
route function's inputs (world card sources, pinned model), its scoring corpus (labels frozen),
and its success bar (≥90% route accuracy, <75% = stop-and-diagnose) are all on paper.

## Next

Do not run the held-out score or A2 workflow cohort while the recorded A1 result is Change. No
fifth prompt tuning pass is permitted against the frozen eight. Any continuation needs a new,
pre-registered routing mitigation and a fresh affected-slice evaluation. Phase B does not start
without a recorded **go** in `PHASE_A_RESULTS.md`.

## BUILD STATUS

### 2026-07-25 — Prompt-v5 audited rerun = Change; architectural fallback complete

- Ran the explicitly approved 72-call Gemini→GLM route evaluation under prompt v5. It scored
  58/72 correct top-level routes and 22/27 comparison-scenario reasons, with no infrastructure
  invalidity. Direct route p50/p95 was 1,016/1,174 ms and passed both projected TTFT bounds.
- Canonical report: `route-eval-v5.json`, SHA-256
  `f36419724637bddb5a11ae3a64fc4ddbbb200b36ef716b4bafe06cb95b5a4e20`; total model cost
  $0.084033.
- Preserved the Change result. C09 was 0/9; C07 was 7/9; C08 was 6/9. No fifth prompt tuning pass
  was made against the same corpus.
- Implemented the pre-registered architectural fallback `observable-request-features-v1`:
  supplied URL → one researcher, project referent → librarian then research, self-contained brief
  → parallel research. Model reason codes are now diagnostic and cannot vary the executed plan.
- Verification: agent-orchestrator 108/108 tests; nine free Phase A web tests; package, worker,
  and web typechecks green. A2 remains blocked with zero scored workflow outputs.

### 2026-07-25 — Routing mitigation v2 and holdout frozen before output

- Implemented `phase-a-route-review-v2`: supplied URLs compile in code; contested research and
  research-workflow routes use a separate GLM scope prompt that cannot emit a route, reason,
  question, objective, agent, or plan. Code maps the bounded fact to the decision and retains
  `observable-request-features-v1` for topology.
- Pulled only the already-matched corpus owner's completed turns through a read-only production
  query. Froze C03/C05/C10 plus two fresh 2026-07-23 read-only requests with one-way hashes; no raw
  IDs or excluded email-bearing requests entered the repo. Holdout SHA-256: `7d791e00…6343`.
- Pre-registered exact models, prompt/policy hashes, 72 + 15 run counts, unchanged decision rule,
  and no-edit interval in `A1_ROUTE_MITIGATION_V2.md` before any v2 model output.
- Deterministic verification is 119/119 tests with agent-orchestrator typecheck green. The paid
  confirmation later returned Change, so A2 remains blocked.

### 2026-07-25 — Routing mitigation v2 = Change; cold holdout = 15/15

- Ran the frozen no-edit sequence. The full confirmation scored 61/72 routes (84.7%), below the
  unchanged 65/72 Go bound; comparison reasons improved to 25/27. Direct-expected p50/p95 was
  1,057/1,880 ms and passed the projected TTFT bounds. Total model cost was $0.082816.
- C09 remained 0/9: six direct-status decisions, one context-research decision, and two scored
  model-matched no-output failures. No infrastructure-invalid calls occurred.
- The cold holdout scored 15/15 routes and reasons for $0.008147, but invoked the reviewer zero
  times, so it validates only direct/capability fast-path non-regression.
- Canonical reports: `route-eval-mitigation-v2.json` (`07b78b69…bdd3`) and
  `route-eval-holdout-v1.json` (`32c0f21f…5b87`). No corpus-driven tuning or rerun follows. A2
  remains blocked with zero scored workflow outputs.
- Prepared `PHASE_A_POST_MITIGATION_HANDOFF_2026-07-25.md` for a fresh agent to independently
  verify the evidence and decide whether a bounded scope-availability preflight is warranted or
  Phase A should stop. The handoff authorizes analysis only, not another paid run or implementation.

### 2026-07-24 — WP-1 complete; WP-2 draft ready for DJ gate 2

- Added `@buildos/agent-orchestrator` using the `shared-agent-ops` package conventions: pnpm
  workspace package, tsup CJS/ESM + declarations, TypeScript 5.9, Vitest 3.2, and the workspace's
  Zod `^3.23.0` line.
- Added the complete §4 package directory skeleton. No app, database, queue, UI, or existing
  cognition runtime is imported.
- Added an AST-based architecture fitness suite covering forbidden existing cognition/app/provider
  imports, documented internal dependency direction, and contract isolation.
- Drafted all 10 requested core contracts and 12 undefined leaf contracts as strict Zod schemas
  with inferred types. Contract-review rationale and open calls are recorded in
  `docs/architecture/agent-first-orchestration/A0_CONTRACT_REVIEW.md`.
- Added route-specific closed reason-code unions, route/action discriminated payloads, exact UUID/
  permission/provenance handling, JSON-only 256 KB artifact payloads, 1,000-character summaries,
  4,000-token digest metadata bound, and same-stage dependency validation (duplicates, unknown
  keys, self-dependencies, cycles).
- Verification: package build and typecheck green; package Vitest **55/55** green across four test
  files; root Turbo typecheck **16/16 tasks** green; root Turbo test **16/16 tasks** green.
- First test run exposed one harness-only false positive: fitness rules treated contract test
  imports as runtime dependencies. The test now applies dependency-direction checks to production
  modules while continuing to scan all TypeScript files for forbidden cognition/provider imports.
- No production transcript reads, model calls, or paid evaluation runs performed. Current stop:
  **DJ gate 2**.

### 2026-07-24 — DJ gate 2 passed

- DJ approved the contract draft and leaf-type rationale. WP-2 is complete.
- `ArtifactEnvelope` remains aligned with §6.6 for Phase A (no self `artifact_id`); revisit the
  recommended self-identifying envelope before durable persistence.
- Work proceeds to WP-3 candidate selection and stops again at DJ gate 1 before labels are frozen.

### 2026-07-24 — WP-3 candidate preparation complete; awaiting DJ gate 1

- Performed read-only production queries and reviewed recent completed `live_ui` chat turns. No
  production rows were written or changed.
- Added 11 anonymized, production-derived candidate requests spanning the required eight-scenario
  class mix. Raw session/user/project/entity IDs are absent; source turn IDs are stored only as
  one-way 12-character hashes.
- Rejected one otherwise useful “update the document” candidate because Phase A excludes mutation
  scenarios.
- Added a shared anonymized production-derived snapshot: 11 tasks, five documents, one goal, three
  plans, and three relationship edges. Snapshot SHA-256 is
  `be9feaeade4134285f891f857ca02aad0a74cd1c890ba774c2b9ea1fa398af6c`.
- Added strict candidate/snapshot Zod validation plus four fixture tests covering count and unique
  production provenance, required class/route coverage, shared snapshot references, and exclusion
  of the raw production project ID.
- Verified the external-source candidate's supplied article is reachable and relevant to the
  requested source-constrained synthesis.
- Verification: package Vitest **59/59** green; package typecheck and build green; root Turbo
  typecheck and test both **16/16 tasks** green.
- Gate review and recommended eight are in
  `docs/architecture/agent-first-orchestration/A0_CORPUS_REVIEW.md`. Current stop: **DJ gate 1**;
  no labels have been frozen and no prompt work has begun.

### 2026-07-24 — DJ gate 1 passed

- DJ approved the recommended eight without substitutions or label changes: C01, C02, C04, C06,
  C07, C08, C09, and C12.
- The approved label mix is three direct (`simple_read`, `simple_read`, `status_summary`), three
  workflow (`single_source_research`, `multi_source_research`,
  `context_research_recommendation`), one clarify (`missing_required_context`), and one capability
  gap (`unsupported_capability`).
- WP-3 is complete. Work proceeds to the WP-4 control-lane baseline.

### 2026-07-24 — WP-4 control baseline complete; WP-5 ready for DJ gate 3

- DJ explicitly approved sending the anonymized Phase A corpus and fixture to hosted Supabase,
  OpenRouter/model providers, and public research sources. The paid lane used the real local v2
  SSE endpoint and hosted test-user data; it made no production writes.
- Added an opt-in `test:agentic:phase-a-control` script. The frozen JSON corpus is loaded directly,
  each run receives a freshly seeded project from the frozen snapshot, and all sessions/projects
  are removed afterward. The local endpoint is pinned to `127.0.0.1` to avoid an unrelated
  IPv6-localhost dev server.
- Added client-side request/header/first-event/first-text/terminal timing and stream-correlated
  `llm_usage_logs` aggregation. Timing and telemetry have deterministic unit coverage.
- Ran 12 intended control turns: C01 and C02 three times each; the other six scenarios once. The
  observed model was `deepseek/deepseek-v4-flash`, profile `balanced`, across DeepInfra,
  DigitalOcean, and SiliconFlow. There were 63 correlated model requests, 884,608 reported tokens,
  and $0.062782 canonical total cost.
- Vitest's global retry initially repeated C07 after the control runtime's bounded timeout. The
  canonical report retains the first real failure and removes only that framework-level duplicate;
  internal runtime retries remain included. The paid duplicate cost $0.00590265. The lane now sets
  `retry: 0` explicitly.
- Canonical control summary:

    | Cohort                            |   Runs |  Clean |     TTFT p50 |      TTFT p95 |     Total p50 |      Total p95 |     Mean cost |
    | --------------------------------- | -----: | -----: | -----------: | ------------: | ------------: | -------------: | ------------: |
    | `simple_read`                     |      6 |      6 |     8,860 ms |      9,849 ms |     50,000 ms |     105,803 ms |     $0.004740 |
    | `status_summary`                  |      1 |      1 |     7,973 ms |      7,973 ms |     39,464 ms |      39,464 ms |     $0.003193 |
    | `single_source_lookup`            |      1 |      1 |    12,461 ms |     12,461 ms |     96,662 ms |      96,662 ms |     $0.008604 |
    | `multi_source_research`           |      1 |      0 |     9,481 ms |      9,481 ms |    148,869 ms |     148,869 ms |     $0.007828 |
    | `context_research_recommendation` |      1 |      1 |    10,026 ms |     10,026 ms |     53,501 ms |      53,501 ms |     $0.006047 |
    | `ambiguous`                       |      1 |      1 |     5,485 ms |      5,485 ms |     43,623 ms |      43,623 ms |     $0.005476 |
    | `unsupported_capability`          |      1 |      1 |     4,472 ms |      4,472 ms |     24,623 ms |      24,623 ms |     $0.003191 |
    | **Overall**                       | **12** | **11** | **8,860 ms** | **12,461 ms** | **50,000 ms** | **148,869 ms** | **$0.005232** |

- Required machine checks passed in 5/12 runs. C07 timed out; C04/C06/C08/C09 failed substantive
  request requirements; one C01 and one C02 repeat also missed a required fact. Failed outputs and
  their full latency/cost remain in the baseline.
- The canonical report and normalization notes live in
  `packages/agent-orchestrator/src/testing/harness/results/`. SHA-256:
  `fc300f90b7376980424c9b4a8a8e4dc83f9d747a773b0585a019ffff41071768`.
- Hosted cleanup verification found zero remaining Phase A harness projects. Server traces and
  captured tool calls contained read tools only.
- Added ADR 0001: GLM 5.2 / JSON `powerful` for CEO route and transition, GLM 5.2 / text
  `quality` for CEO synthesis, DeepSeek V4 Pro / text `quality` for research, and no model for the
  deterministic librarian. Scored fallback-model substitution is forbidden.
- Replaced the placeholder decision rule with measured absolute draft bounds in
  `PHASE_A_FALSIFICATION_PLAN.md`. Current stop: **DJ gate 3**. No A1 prompt work or A2 comparison
  has begun.
- Verification: Phase A harness unit tests **12/12** green; agent-orchestrator tests **62/62**
  green; web check has zero errors; root Turbo typecheck and test both **16/16 tasks** green. The
  root check reports one unrelated pre-existing empty-CSS-ruleset warning in `Footer.svelte`.

### 2026-07-24 — DJ gate 3 passed; Slice A1 started

- DJ approved moving forward after reviewing the measured bounds and control-lane results in
  plain English. The corpus, labels, acceptance checks, model pins, and decision thresholds are
  frozen for the first scored pass.
- Slice A0 is complete. No commit was created because the task's explicit-commit convention still
  applies.
- Work proceeds to A1 world card v0, pinned route mode, and the 72-call route-accuracy score. If
  accuracy is below the pre-registered 75% floor, work stops for diagnosis before A2.

### 2026-07-24 — Slice A1 first scored pass = Change

- Implemented the deterministic 653-estimated-token world card, pure route-model port, validated
  route function, one bounded schema repair, deterministic decision compiler, and explicit paid
  evaluation lane. Package verification is 71/71 tests green with typecheck green.
- Ran all 72 pinned `z-ai/glm-5.2` route calls. Top-level route accuracy was **54/72 (75.0%)**,
  exactly the lower edge of the frozen Change band and below the 65/72 Go threshold. Six scenarios
  were 9/9; C01 was 0/9 because project-local “this score” was treated as ambiguous, and C09 was
  0/9 because an unrelated content-production scope was sent to research instead of clarification.
- Mean route cost was $0.001094 and total cost was $0.078734. Overall latency was 2,592 ms p50 and
  10,855 ms p95. Projected direct latency missed its p50 bound by 238 ms and its p95 bound by
  9,940 ms; C01's four repair paths and two final schema failures caused the tail.
- Exact reason-code agreement was 24/72 and is retained as a diagnostic. The frozen threshold is
  top-level route selection; the report/assertion now encode that approved metric. No raw result
  was changed, no run was infrastructure-invalid, and no mutation/write capability was called.
- Canonical report:
  `packages/agent-orchestrator/src/testing/harness/results/route-eval-v1.json`, SHA-256
  `3f75d91718406443921c6717b4a09d3d61ae20133c81ad8aead94680a3df49ed`.
- A1 remains active and A2 has not started. Prompt v2 adds general project-local-reference,
  scope-mismatch, concrete-research-objective, and complete-JSON rules. The corpus, labels,
  checks, thresholds, model pin, world card, and scoring remain unchanged for the full rerun.

### 2026-07-24 — Slice A1 second scored pass = Change

- Ran the complete 72-call prompt-v2 set. Accuracy improved to **59/72 (81.9%)** but remained
  below the 65/72 Go threshold. C01 improved to 9/9 while C09 stayed 0/9.
- The longer policy caused 13 repair paths and three final C07 JSON failures: GLM 5.2 repeatedly
  consumed the 900-token output limit on reasoning before emitting a complete object. Total cost
  rose to $0.161854; overall latency rose to 3,140 ms p50 and 24,307 ms p95.
- Direct route latency improved to 2,315 ms p50 and 4,791 ms p95. Projected p95 passed; projected
  p50 missed by about 75 ms.
- Canonical report: `route-eval-v2.json`, SHA-256
  `381ffa915ff1de6e606f7294d4c0dc4e417a4fb9f14f036a32c026f366ce2953`.
- A1 remains active and A2 remains blocked. Prompt v3 shortens the scope policy and pins low
  reasoning effort for the route call; all frozen evaluation inputs and thresholds stay unchanged.

### 2026-07-24 — Slice A1 third scored pass = Change

- Ran the complete 72-call prompt-v3 set with low reasoning effort. Accuracy improved to
  **61/72 (84.7%)** but remained below the Go threshold.
- C09 improved to 9/9 and no call ended without JSON, but C01 regressed to 5/9 and C08 to 2/9.
  Low reasoning did not improve performance: direct route latency rose to 4,234 ms p50 and
  18,070 ms p95, failing both projected direct bounds.
- Canonical report: `route-eval-v3.json`, SHA-256
  `22f58e6f234a15a382177a0f933bdd9cb2b313176ef663c0e3f9ddc9067fa59e`.
- V4 restores provider-default reasoning and consolidates the three project-relative cases into
  a compact precedence rule. If it remains below the gates, prompt tuning stops and A1 recommends
  a route-model repin or hybrid router instead of further corpus-specific iteration.

### 2026-07-24 — Slice A1 fourth pass, strategy pilots, and final Go

- Prompt v4 with GLM 5.2 reached 70/72 correct routes but failed both direct-latency bounds;
  prompt tuning stopped. Gemini Flash Lite alone (19/24) and DeepSeek V4 Flash alone (17/24) were
  rejected in separately labeled fast-model pilots.
- Implemented `phase-a-route-review-v1`: Gemini Flash Lite runs first; GLM reviews only after a
  primary failure or a `direct`/`clarify` route that conflicts with explicit research intent.
  Added deterministic unit coverage; orchestrator verification is **74/74** tests green with
  typecheck green.
- The 24-call strategy pilot scored 24/24 with direct route latency of 929/1,200 ms p50/p95. ADR
  0001 was amended and frozen before the full confirmation.
- The full run scored **72/72 (100%)**. Direct route latency was 898/1,310 ms p50/p95, projecting
  to 9,758/11,159 ms against bounds of 11,100/14,800 ms. All A1 routing and direct-latency bounds
  pass; no run was infrastructure-invalid and no mutation/write capability was called.
- Canonical report: `route-eval-fast-review-v1.json`, SHA-256
  `ab886492a6a788eede2bc64c3c8692bc9fd362ef492ecab69930d217eb78d378`.
- A1 is complete with a route-slice Go. This is not the overall Phase A/Phase B Go; A2 must still
  win ≥6/9 blind comparisons within the frozen cost/latency/safety bounds.
- Current stop: **DJ gate 4**. Proposed mechanic is in
  `docs/architecture/agent-first-orchestration/A2_BLIND_SCORING_PROPOSAL.md`. No A2 code or paid
  comparison run has started.

### 2026-07-25 — DJ gate 4 passed; A2 implementation and control cohort complete

- DJ approved exactly nine blind pairs, deterministic SHA lane assignment, workflow-win
  eligibility checks, DJ scoring before judge disclosure, the three-model panel, a 7/9 agreement
  floor, and complete-scenario inversion protection. The complete executable mechanic is frozen
  at SHA-256 `720a42ef192d961c77068c49aceec24c027cbf633259ddf0b91b73271619f4d8`.
- Implemented and unit-tested the deterministic librarian, bounded researcher, in-memory workflow
  engine, artifact/digest path, route compiler, safety/budget enforcement, acceptance reporting,
  blind-packet builder, and blind-judge validation. Agent-orchestrator verification is **95/95**
  tests green with package and paid-harness TypeScript green.
- The fresh control cohort completed all nine C06/C07/C08 runs with zero infrastructure-invalid
  runs and zero mutation calls. It had 6/9 clean completions and 0/9 required-check passes; all
  three C07 runs ended in a production model timeout. Total-duration p50/p95 was
  105,109/198,425 ms; mean cost was $0.007787. Canonical report: `control-a2-v1.json`, SHA-256
  `735a445023a62c37ceec538349f5c77499da3e5dc04cb9a7d7207f5f36ee2338`.
- The first C06 workflow attempt and its permitted replacement were infrastructure-invalid.
  OpenRouter rejected the frozen `deepseek/deepseek-v4-pro` researcher pin because no endpoint
  matched SmartLLM's `zdr: true` policy. Zero researcher tokens were produced and no workflow
  output entered scoring. Canonical diagnostic report: `workflow-eval-invalid-zdr-v1.json`,
  SHA-256 `25576e641bf8db1e9527b65e02ec15041038155739128eee921d88bbc15d60ca`.
- On 2026-07-25 DJ approved proceeding without zero-data retention for the anonymized Phase A
  provider payloads. No transport change or new test was run after that approval. Current stop:
  prepare an audit handoff, then implement a narrow evaluation-only opt-in and run the full
  workflow cohort only after DJ asks to resume. No blind packet or judge evaluation exists yet.
