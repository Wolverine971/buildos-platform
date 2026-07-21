<!-- apps/web/docs/technical/architecture/agent-work/DEEP_RESEARCH_ARCHITECTURE_2026-07-19.md -->

# Agentic Chat Deep Research — Architecture Direction

**Date:** 2026-07-19 (updated 2026-07-20)  
**Status:** All five base migrations (`20260719010000`–`050000`) **and** the
`20260720010000` audit-hardening migration are deployed and role-verified in production;
bounded worker orchestration, accounting, cost bridge, and OpenRouter reconciliation implemented;
worker/provider live smoke still pending (worker has no Tavily credential; Railway-worker/local-worker
claim race must be resolved for a controlled run). See the 2026-07-20 audit
(`../../audits/DEEP_RESEARCH_V01_AUDIT_2026-07-20.md`) for the remediation record.

**Builds on:** `AGENTIC_CHAT_RESEARCH_CAPABILITY_AUDIT_2026-07-18.md` and the durable Agent Work
substrate

## Outcome

The first production step should **not** be an unrestricted model-managed swarm.

Start with the existing durable Agent Run substrate and separate three concerns:

1. **Effort:** should this run use the standard model lane or a higher-quality, higher-reasoning
   lane?
2. **Research template:** is this a normal single-agent task or a bounded research
   plan → fan-out → synthesis workflow?
3. **Execution duration:** can it remain interactive, or must it run durably in the worker?

The first vertical slice now implements concern 1 and a deliberately narrow version of concern 2:

- `delegate_task` accepts `effort: "standard" | "deep"`.
- Deep runs use the `powerful` JSON profile and explicit `reasoning.effort: "high"`.
- Deep delegated runs default to a `$0.50` tracked-cost ceiling and reject requests above `$1`.
- Single-agent deep runs default to 12 tool calls. The deep-research template defaults to 10 tool
  calls; both use 60,000 observed tokens and a 10-minute wall-clock budget.
- Agent Run cost accounting now reads the shared LLM layer's actual `totalCost` field. Previously it
  read a non-existent `costUsd` field, so run cost metrics stayed at zero.
- `delegate_task` accepts `run_template: "deep_research"`.
- Explicit deep-research, delegation, subagent, or background-agent requests mount
  `delegate_task` directly; ordinary quick web lookups do not.
- A deep-research root checkpoints a high-reasoning plan, dispatches exactly two parallel depth-1
  researchers, releases its worker slot, and resumes for high-reasoning synthesis.
- Child IDs, queue deduplication, and a persisted `dispatching` checkpoint make fan-out retryable.
- A database trigger queues synthesis in the same transaction that settles the final child.
- The root checkpoints aggregated child usage with its synthesis state, making restart accounting
  idempotent before the synthesis provider call.
- Children receive only `util.web.search` and `util.web.visit`, cannot delegate, and stop on either
  a parent cancel signal or the parent's durable terminal status.
- PostgreSQL guards enforce the root/child shapes, a two-child cap under concurrent inserts, root
  and child budget envelopes, and an atomic per-user capacity reservation.
- Tavily Search credits are counted in leaf and root cost. A search is reserved before dispatch at
  basic = 1 credit / advanced = 2 credits and at no less than the public `$0.008/credit` PAYG
  price; the request explicitly asks for usage and provider-reported credits settle the estimate
  when available. Local validation failures are not charged.
- Budgeted LLM calls now use one catalog-priced model/attempt, conservatively reserve prompt cost,
  cap output tokens to the remaining call envelope, and disable unreserved fallback/parse retries.
- `agent_run_cost_entries` now durably records every budgeted deep-research LLM and Tavily attempt
  before provider dispatch. A `SECURITY DEFINER` reservation function locks the root, checks leaf
  and root exposure atomically, and rejects an over-budget or conflicting attempt key.
- Settlement is idempotent. Successful calls record actual cost/units and provider request IDs;
  missing usage, lost responses, and reservation overruns remain
  `reconciliation_required`. Direct table writes are rejected.
- `20260719040000_agent_run_cost_reconciliation.sql` adds bounded `SKIP LOCKED` claims, expiring
  lease tokens, retry limits, and an operator-needed state for unresolved exposure. A disabled-by-
  default five-minute scheduler queries the authoritative
  [OpenRouter generation endpoint](https://openrouter.ai/docs/api/api-reference/generations/get-generation)
  and settles returned `total_cost`.
- SmartLLM preserves OpenRouter's `X-Generation-Id` even when the response body is lost. That
  closes the correlation gap between a conservative reservation and the later provider lookup.

This is a working V0.1 control flow, not a finished research product. It returns a sourced report to
chat, but does not yet persist a report document or a typed claim-to-source manifest.

Deployment checkpoint on 2026-07-19, updated 2026-07-20:

- The configured production PostgREST endpoint returns the cost ledger with all reconciliation
  columns through the service role.
- All reservation, settlement, claim, release, reconciliation, and synthesis RPC routes are exposed
  to `service_role` and **denied to `anon`/`authenticated`** (re-probed live 2026-07-20: 42501).
- `20260719050000_agent_run_cost_rpc_privileges.sql` **is deployed** (the 2026-07-19 note calling it
  "not yet deployed" was stale). The 2026-07-20 audit found it had missed
  `queue_deep_research_synthesis(UUID)`, which was verified anon-callable (HTTP 200) in production.
- `20260720010000_deep_research_hardening.sql` **is deployed** (2026-07-20, atomic transaction,
  preconditions verified: ledger empty, FK names present). It revokes `queue_deep_research_synthesis`
  from anon/authenticated (re-probed: now 42501), fails the synthesis stage-guard closed on a missing
  `stage` key, rounds ledger idempotency comparisons to column scale, preserves recorded overrun
  actuals, restricts ledger-run deletion, and removes two reproduced lock-order deadlocks.
- Cost bridge landed: OpenRouter requests now send `usage: {include: true}` (provider-reported
  settlement instead of catalog estimate), a 200 with missing usage on a budgeted call settles
  `reconciliation_required` (not `$0`), and settled Tavily charges now also write `llm_usage_logs`
  (`agent_run_web_search`) so research spend appears in admin analytics.
- Database type regeneration still blocked on a missing `SUPABASE_ACCESS_TOKEN`; the deployed schema
  is verified, but generated `database.types.ts` remains stale.
- No paid provider smoke has run yet: the worker environment has no Tavily credential and the live
  Railway worker would race a local worker for the queued jobs (see the audit's smoke plan).

## What BuildOS already has

| Capability                   | Current state                                                         |
| ---------------------------- | --------------------------------------------------------------------- |
| Durable background execution | `agent_runs` + `queue_jobs` + Railway worker                          |
| Progress and control         | Events, Realtime, steer, pause, resume, cancel                        |
| Parent/child identity        | `parent_run_id` and DB-enforced depth `0..1`                          |
| Parallel capacity            | Two concurrent children plus their root; DB-enforced per-user reserve |
| Web evidence                 | Worker-safe Tavily search and SSRF-safe page visit                    |
| Tool security                | `scope_mode` + `allowed_ops`; child runs can remain read-only         |
| Result bridge                | Terminal run result is injected back into the originating chat        |
| Model tiers                  | `balanced`, `powerful`, and `maximum` JSON profiles                   |
| Usage telemetry              | Run metrics plus durable LLM/Tavily reservation and settlement rows   |

Important remaining gaps:

- Child evidence is constrained Markdown, not yet a validated claim-to-source JSON contract.
- The synthesized report is injected into chat but is not yet persisted as a BuildOS document.
- V0.1 uses two children so root + children fit the existing three-active-run ceiling.
- `max_cost_usd` now has a durable, atomic leaf/root reservation ledger and automatic OpenRouter
  lookup. Moonshot direct calls and Tavily Search still lack an implemented authoritative
  per-request lookup.
- A process crash after provider acceptance leaves a conservative inspectable reservation and the
  same logical attempt key cannot dispatch again. OpenRouter rows with a captured generation ID
  self-reconcile; missing IDs and unsupported providers retain exposure and are marked for
  operator action.
- Provider billing discrepancies and catalog-price drift are recorded conservatively but do not
  yet trigger automated alerts or a circuit breaker.
- No `max_web_searches`, per-domain policy, per-user daily research budget, or research eval.

## Current provider capabilities and why they do not replace the BuildOS substrate

OpenAI exposes three relevant but distinct capabilities:

1. Reasoning effort is a model-call control. Higher effort generally increases quality, latency,
   and token use. It does not itself create a research workflow. See
   [Reasoning models](https://developers.openai.com/api/docs/guides/reasoning).
2. Background Responses execute asynchronously and can be polled or completed via webhook. See
   [Background mode](https://developers.openai.com/api/docs/guides/background).
3. GPT-5.6 Multi-agent beta lets a root model spawn parallel subagents and synthesize their work.
   The API defaults to three concurrent subagents, but documents no fixed total-agent or tree-depth
   limit. See [Multi-agent](https://developers.openai.com/api/docs/guides/responses-multi-agent).

OpenAI also offers specialized deep-research models that can search and synthesize large source
sets and may take tens of minutes. They support web search, file search, remote MCP, and code
interpreter, but not ordinary function calling. See
[Deep research](https://developers.openai.com/api/docs/guides/deep-research).

These are useful future adapters, not the initial control plane:

- Hosted Multi-agent matches the desired UX but does not expose a hard dollar budget or a fixed
  total-agent/depth cap.
- Specialized deep research is strong for provider-managed web synthesis but cannot use the normal
  BuildOS function-tool surface.
- A single opaque provider request weakens per-child observability, source-policy enforcement, and
  deterministic budget allocation.
- BuildOS already has durability, control signals, policy fences, web tools, and result persistence.

Recommendation: keep provider adapters behind an experiment flag and compare them in the research
eval after the bounded BuildOS workflow is working.

## The target V1: bounded map/reduce research

```text
agentic chat
  └─ deep_research tool
      └─ root Agent Run (depth 0, read-only, effort=deep)
          1. PLAN       higher-reasoning model produces 2 bounded questions
          2. DISPATCH   deterministic code validates and enqueues child runs
          3. RESEARCH   child Agent Runs (depth 1) search + visit in parallel
          4. REDUCE     root is requeued only after children become terminal
          5. SYNTHESIZE higher-reasoning root reconciles evidence and gaps
          6. PERSIST    report + source manifest, then inject summary into chat
```

The model proposes the plan; application code owns the graph.

The root must not receive a general-purpose `spawn_agent` tool. Instead, it returns a typed plan:

```ts
type ResearchPlan = {
	questions: Array<{
		id: string;
		question: string;
		rationale: string;
		preferred_domains?: string[];
	}>;
};
```

Deterministic validation then enforces:

- exactly 2 questions in V0.1;
- unique, bounded scopes;
- read-only child ops;
- depth exactly 1;
- no child delegation;
- per-child and total budget allocations;
- optional domain allow/block lists;
- user/project ownership;
- one active research root per user for V1.

Each child should return evidence rather than prose-only summaries:

```ts
type ResearchFinding = {
	question_id: string;
	claims: Array<{
		claim: string;
		source_urls: string[];
		support: 'direct' | 'inferred' | 'conflicting';
	}>;
	sources: Array<{
		url: string;
		title?: string;
		publisher?: string;
		published_at?: string;
		accessed_at: string;
	}>;
	gaps: string[];
	confidence: number;
};
```

The root synthesizer receives these compact contracts, not every child transcript. Full transcripts
remain in run events for audit/debugging.

## Durable state machine

Do not leave a worker process waiting for children.

The root should persist a research state and release its queue slot:

```ts
type DeepResearchState =
	| { stage: 'planning' }
	| { stage: 'researching'; child_run_ids: string[]; plan: ResearchPlan }
	| { stage: 'synthesizing'; child_run_ids: string[] }
	| { stage: 'completed'; report_document_id?: string };
```

Suggested transitions:

1. Root job claims `queued`, generates and validates the plan.
2. A persisted `dispatching` checkpoint gives each child a stable ID; idempotent insert/enqueue
   operations recover safely if the worker retries midway through fan-out.
3. Root remains `running` with `stage: "researching"` but its queue job completes.
4. Every child terminal transition checks whether all siblings are terminal.
5. A database function locks the root, changes its state, and enqueues
   `agent-run:<root>:synthesis` atomically when the final child settles.
6. Root aggregates completed/partial/failed child envelopes, synthesizes, and finalizes.
7. A child stops when it observes a parent cancel signal or a durable terminal parent status. The
   status check closes the race where the root consumes its signal before a child sees it.

This supports work beyond ten minutes without holding an HTTP request or a worker slot.

## Routing thresholds

Select by work shape first, duration second.

| Request shape                                                                             | Execution                                                                   |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Answerable from current context; no broad evidence gathering                              | Interactive standard chat                                                   |
| Difficult analysis over supplied context; few/no tools                                    | Interactive high reasoning if it can finish inside about 60–90 seconds      |
| Difficult task likely to exceed 90 seconds or needing durable control                     | Single Agent Run with `effort: "deep"`                                      |
| Current-fact lookup with 1–3 known sources                                                | Normal web research in chat or one background run                           |
| Multi-part question needing 4+ sources, source reconciliation, or independent workstreams | Bounded `deep_research` template                                            |
| Work expected to exceed 10 minutes                                                        | Always durable root/child state machine; never a long-held HTTP/SSE request |

Duration is an execution-substrate threshold, not the definition of deep research. A hard proof can
need deep reasoning without web research; a ten-source price comparison can need research without
the most expensive reasoning model on every step.

## Budget policy

V1 product defaults:

- Default total target: `$0.50`.
- User-selectable ceiling: up to `$1.00`.
- Emergency platform ceiling: `$10.00`, not user-facing.
- Maximum concurrent child researchers in V0.1: 2 (three active rows including the root).
- Maximum depth: 1.
- Default wall clock: 10 minutes; enforced maximum: 20 minutes.
- Root limits: `$0.25–$1.00`, 4–40 tool calls, and 12,000–100,000 tokens.
- Each child is capped at the lesser of its fixed researcher maximum and its proportional share of
  the root's cost, tools, tokens, and wall-clock envelope.

Starting `$0.50` allocation is dynamic:

- Planning usage is measured first.
- 35% of the total ceiling is reserved for synthesis.
- The remaining budget is split evenly between the two researchers.
- At least `$0.02` must remain for each child and for synthesis; otherwise the workflow stops
  honestly with a failed or partial result.

Use the stronger model for planning and synthesis. Child researchers should default to the cheaper
standard lane because their task is narrow and evidence-oriented.

The local V0.1 now persists every budgeted deep-research LLM and Tavily reservation before provider
dispatch and settles it idempotently. The database serializes sibling reservations on the root row
and atomically enforces both the leaf allocation and root `max_cost_usd`. Caller-stable attempt keys
make a retry inspect the existing exposure instead of paying for a duplicate request.

The remaining accounting work is:

1. deploy `20260719050000_agent_run_cost_rpc_privileges.sql`, repeat anonymous/authenticated and
   service-role probes, then deploy/live-smoke the worker reconciler and enable its flag after a
   clearly scoped environment decision; the read-only operator report is implemented;
2. identify a documented per-request audit path for Tavily Search or reconcile those rows through
   a separately tracked project/account delta without pretending aggregate usage proves one call;
3. add atomic user-daily and platform balances beyond the existing per-leaf/per-root limits;
4. version/monitor provider prices and fail closed on unknown or stale pricing;
5. alert and trip a circuit breaker when actual provider billing exceeds reservation.

`max_cost_usd` is now a durable BuildOS dispatch boundary. It is still not a prepaid balance or a
guarantee that an external provider will bill exactly what it reported.

## Security and “do not go rogue” controls

V1 deep research should be read-only:

- Allow `util.web.search`, `util.web.visit`, and explicitly selected ontology read ops.
- Do not expose ontology writes, calendar writes, arbitrary HTTP, shell, or delegation to children.
- Treat every web payload as untrusted evidence and never as instructions.
- Keep SSRF-safe fetch and redirect-hop revalidation.
- Put validation next to each tool boundary. Agent-level input/output guardrails are insufficient
  for every tool call; this matches OpenAI's
  [guardrail guidance](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals).
- Store visited URLs and claim-to-source links.
- Reject final “completed” status when important claims have no supporting URLs.
- Cancel all children when the root is cancelled.
- Persist partial evidence if time/cost is exhausted; do not fabricate a complete report.

Persistence should initially create a report document only after synthesis. Any future mutation of
project knowledge should use the existing staged Change Set review path.

## Implementation sequence

### Slice A — implemented in this change

- Agent Run `effort` column and contract.
- `delegate_task` and manual dispatch accept `effort`.
- Deep effort maps to `powerful` + explicit high reasoning.
- Shared non-streaming JSON calls now forward provider reasoning controls.
- Deep delegated defaults: `$0.50`, max `$1`, 12 tool calls, 60k observed tokens, 10 minutes.
- `max_cost_usd` validation and loop stop.
- Agent Run LLM cost accumulation bug fixed.

### Slice B — implemented first orchestration pass

- `run_template: "deep_research"` and persisted `orchestration_state`.
- High-reasoning planner with deterministic validation and fallback workstreams.
- Exactly two depth-1 children restricted to web search and SSRF-safe page visit.
- Retry-safe child IDs and queue deduplication.
- Transactional final-child wakeup and idempotent parent synthesis queueing.
- Partial-result synthesis and parent-to-child stop propagation.
- Database-enforced root/child permissions, budget envelopes, active-slot reservation, and
  race-safe two-child cap.
- Injectable coordinator runtime for deterministic lifecycle testing without external services.

### Focused verification added with Slice B

- Worker contracts: 44 passing tests across model/cancellation policy, queue metadata, planning,
  fan-out, retries, waiting, synthesis, partial results, and budget exhaustion.
- Web dispatch budget policy: 4 passing tests.
- Shared queue metadata validation: 5 passing tests.
- Disposable PostgreSQL migration suite: 17 passing tests, including three simultaneous child
  inserts, unsafe child rejection, active-slot reservation, coordinator reclaim, exactly-once
  synthesis wakeup, the fast-child race, atomic root-cost oversubscription, reconciliation leases,
  lease-token fencing, crashed-final-lease recovery, authoritative overrun settlement, and the
  response-settlement/provider-lookup race, plus explicit denial of ledger/RPC access to
  `anon`/`authenticated`.
- The PostgreSQL suite has its own command,
  `pnpm --filter @buildos/worker test:deep-research:integration`; it does not replace the older
  externally configured worker integration suite.

The first four Agent Run/deep-research migrations are deployed. The fifth privilege-hardening
migration must be deployed and role-probed before worker rollout. Cost reconciliation additionally
requires `AGENT_RUN_COST_RECONCILIATION_ENABLED=true`; it remains off by default and must stay off
until that check passes.

### Slice C — budget and evidence correctness

- Add `max_web_searches` and `max_web_visits`.
- **Implemented locally:** include Tavily credits in leaf/root totals and reserve paid search
  before dispatch.
- **Implemented locally:** pre-call LLM spend envelope with conservative prompt estimate, output
  cap, one priced model, no unreserved retries, and OpenRouter provider-price filtering.
- **Implemented locally:** durable unified root/child cost ledger with atomic reservation,
  idempotent settlement, lease-based stale-row claims, and authoritative OpenRouter generation
  reconciliation
  ([tasker 29](../../../../../../tasker/29-deep-research-cost-ledger-and-hard-budgets.md)).
- Add a per-user daily research allowance.
- Replace Markdown evidence packets with a typed claim/source/support contract.
- Persist the final report and normalized source manifest.
- Add reconciliation for stranded `dispatching` or `researching` roots.

### Slice D — product and evaluation

- Add a dedicated `deep_research` chat tool rather than exposing a `delegate_task` template flag.
- Show plan, active researchers, source count, elapsed time, and budget usage in the Agent Run UI.
- Add fixed-domain research evals for claim support, source quality, contradiction handling, and
  budget adherence.
- Compare BuildOS orchestration with OpenAI hosted Multi-agent and specialized deep-research models
  behind feature flags.

## Decisions still requiring evidence

- Whether `powerful` should remain a routed model lane or pin a model for reproducible research
  evals.
- Whether two children remain the quality/cost optimum under a `$0.50` ceiling.
- Whether 10 minutes is enough for the default or should be an initial soft deadline with a
  user-visible extension.
- Tavily's effective per-search cost in the deployed account (the guard currently uses the public
  PAYG ceiling) and whether advanced search should be reserved for root-selected questions.
- Whether reports should persist automatically or ask the user after the summary is delivered.
- Whether hosted GPT-5.6 Multi-agent exposes sufficient aggregate usage/cancellation behavior in a
  live API smoke to satisfy the budget ledger.

Do not answer these from model intuition. Resolve them with a small eval corpus and production-like
cost traces.
