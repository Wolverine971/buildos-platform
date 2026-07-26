<!-- docs/architecture/agent-first-orchestration/README.md -->

# Agent-First Orchestration System

**Status:** Proposed — **Phase A closed 2026-07-26**
**Date:** 2026-07-24 (Phase A closed 2026-07-26)
**Owner:** BuildOS
**Implementation state:** Phase A is **closed**; the recorded decision is in
[PHASE_A_RESULTS.md](./PHASE_A_RESULTS.md). The routing gate was recorded as
**instrument-limited**: the 65/72 bound was arithmetically unreachable (3 of 13 corpus labels
contested; two depend on snapshot facts the router cannot see), so the track was closed rather
than restated. Final scored state: A1 mitigation v2 = Change at 61/72; A2 built but never scored.
The architecture hypothesis is neither corroborated nor falsified; the quality question moves to
the [open-brief instrument](./OPEN_BRIEF_EVAL_METHODOLOGY.md). No durable system exists and Phase
B is not authorized.

## Purpose

Build a new, independent agent-first runtime alongside the existing context-first Agentic Chat and
Agent Run systems. The new runtime should let a lightweight CEO/orchestrator handle simple work
directly, assemble specialist teams for complex work, coordinate sequential and parallel steps,
carry durable artifacts between stages, and show truthful progress to the user.

This is a parallel product and architecture experiment. It is not a refactor, migration, or V3 of
the current chat harness. The existing system remains available as the control and production path
while the new system is developed and evaluated.

## Origin: From GBrain Research to Agent-First BuildOS

This work did not begin with a desire to add multiple agents. It began with an investigation of
Garry Tan's GBrain and a broader question: **what would BuildOS need to learn, absorb, or reject in
order to become a better organizational brain?**

The original investigation focused on GBrain's knowledge library, entity model, retrieval,
company-brain concept, tiered skills, background maintenance, and self-improvement loops. The
question was not whether BuildOS should clone GBrain. It was whether GBrain exposed missing
capabilities in BuildOS and whether BuildOS's project-centered model was still the right bet.

That investigation produced three important conclusions.

First, GBrain demonstrates the value of making dormant organizational knowledge useful again.
Durable knowledge, provenance, retrieval, librarian-style organization, and maintenance loops are
all valuable ideas. A system should be able to turn scattered evidence into compact, reusable
working context instead of repeatedly rediscovering the same facts.

Second, a large memory and retrieval surface does not automatically produce better decisions.
Broad recall can create noisy contexts, repeated enrichment can increase latency and cost, and a
system that combines knowledge storage, graph maintenance, skills, retrieval, background agents,
and self-improvement can become operationally heavy. Prompting an agent to "remember to use
memory" is also not a reliable invariant. Important lifecycle rules, permissions, and commits need
to be enforced by the runtime.

Third, BuildOS has a different center of gravity. GBrain is primarily organized around what an
organization knows. BuildOS is organized around what a project is trying to accomplish. The
project is therefore a strong boundary for intent, action, permissions, review, evidence, and
receipts—but it should not become the only place shared knowledge can live.

The resulting distinction was:

> GBrain helps the organization remember. BuildOS should help the organization remember **and
> act through its projects**.

### What the investigation changed

| GBrain-era finding                                                              | Design implication for BuildOS                                                                 |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Dormant knowledge becomes valuable when a librarian organizes and retrieves it  | Introduce a bounded librarian role that produces focused, provenance-backed context packets    |
| Foundational, routed, and dormant skills should not all be loaded at once       | Give each agent a narrow manifest instead of exposing a global skill and tool universe         |
| High-recall retrieval can still produce low-value or noisy working context      | Optimize context for the current decision, not for maximum recall                              |
| Prompt-only memory and workflow rules are easy for a model to skip              | Put scheduling, permissions, state transitions, budgets, and commits in deterministic code     |
| Knowledge maintenance and review loops create compounding value                 | Carry typed artifacts and receipts forward, then connect outcomes to later Project Reviews     |
| A universal knowledge container blurs authority and scope                       | Keep canonical BuildOS data authoritative and treat orchestration artifacts as derived records |
| Enriching every signal raises cost, privacy, and relevance problems             | Make retrieval and enrichment scoped, selective, budgeted, and observable                      |
| A single broad agent still has to choose among an expanding set of capabilities | Move capability boundaries into specialist agents selected by a small orchestrator             |

The GBrain research therefore opened three related workstreams: a clearer skill hierarchy, a
deterministic memory and context lifecycle, and an orchestrator-plus-specialist agent architecture.
This document covers the third workstream. It deliberately does not require BuildOS to solve the
entire organizational-memory problem before it can test agent-first execution.

## Problems We Are Trying to Solve

The current BuildOS system has evolved by making a general agent more capable: load richer project
context, classify domains and capabilities, select skills, materialize tools, and give the agent
more ways to act. The domains-to-capabilities-to-skills-to-tools hierarchy is a reasonable response
to tool sprawl, but the same agent still has to understand and choose across the hierarchy while
carrying the user's conversation and project context.

That context-first approach works, but it faces diminishing returns as the system grows:

1. **Context saturation.** More potentially useful context can make the immediately relevant
   evidence harder to find, not easier.
2. **Capability sprawl.** One agent must discover, compare, and correctly use an expanding set of
   domains, skills, tools, and operating rules.
3. **Prompt-dependent invariants.** Permissions, memory use, validation, and workflow discipline
   cannot depend on the model remembering every instruction in a large prompt.
4. **Unclear work decomposition.** The system needs an explicit way to distinguish independent
   work that should run in parallel from dependent work that must run sequentially.
5. **Weak long-running continuity.** A large conversation transcript is a poor handoff format
   between stages, retries, browser sessions, and agents.
6. **Limited user visibility.** The user needs to see what is running, what is waiting, what
   finished, and what decision comes next without receiving fabricated or overly technical status.
7. **Broad permission surfaces.** A generally capable agent can receive more tools and authority
   than a particular assignment needs.
8. **Hidden capability gaps.** A general agent may improvise weakly when the system should instead
   say that it lacks the right agent, tool, knowledge, or permission.
9. **Architectural concentration.** Adding every new concern to the same orchestration path creates
   coupling, bloat, and pressure toward another multi-thousand-line runtime file.
10. **Anecdotal evaluation.** Without a parallel control, it is difficult to tell whether a more
    elaborate architecture actually improves quality enough to justify its latency and cost.

The core realization is that continually making one agent larger is not the only way to make the
system more capable. BuildOS can instead make the **team** more capable: keep the CEO small enough
to reason clearly, give specialists only the context and authority required for one assignment,
and use explicit artifacts to carry useful work forward.

Delegation alone does not solve these problems. Without typed assignments, bounded context,
least-privilege grants, durable results, receipts, deterministic joins, and explicit decision
gates, multiple agents would only distribute the confusion. The orchestration kernel—not the
number of agents—is the important architectural change.

## Why Build It as a Parallel System

The existing runtime is **context first**: begin with the user and project context, then determine
which skills and tools the general agent should receive. The proposed runtime is **agent first**:
begin with the objective, determine which agent or team owns each bounded assignment, and let each
agent's manifest define its context builder, skills, tools, permissions, and result contract.

Those are different organizing principles. Trying to introduce the new one by progressively
extending the existing runtime would make it difficult to preserve clean boundaries or determine
which architecture caused an outcome. It would also place an experimental control plane inside a
production path that already carries accumulated compatibility and product constraints.

The parallel system therefore provides three benefits:

- a clean architecture with no requirement to preserve current prompt, tool-selection, or runtime
  abstractions;
- a safe experiment that does not destabilize the existing production path;
- a real comparison lane in which identical task suites can measure quality, latency, cost,
  reliability, permissions, and user comprehension.

Parallel does not mean rebuilding all of BuildOS. The experiment should reuse stable, canonical
platform operations through narrow interfaces while owning a separate orchestration control plane.
If it fails, it can be retired cheaply — though retirement must be planned rather than assumed:
the retired Tree Agent's application code was deleted while its database tables and a dead
shared-types module were left behind, so this experiment defines its teardown path (code, types,
tables) from day one. If it succeeds, adoption can be based on evidence and happen route by route
rather than through a rewrite.

## How We Got to This Plan

The decision path is intentionally incremental:

1. **Investigate GBrain.** Study its knowledge system, librarian behavior, skills, maintenance
   loops, retrieval, security, cost, and relationship to BuildOS.
2. **Reaffirm BuildOS's advantage.** Keep projects as the action and accountability boundary while
   allowing shared knowledge to support more than one project.
3. **Identify the scaling constraint.** Recognize that adding more knowledge, skills, and tools to
   one agent can degrade selection and reasoning even when the individual capabilities are useful.
4. **Change the unit of capability.** Make agents—not a global context bundle—the primary boundary
   for skills, tools, context construction, result contracts, and permission ceilings.
5. **Preserve a fast lane.** Let the CEO handle simple, low-risk work directly so specialization
   does not impose workflow overhead on every request.
6. **Falsify before building.** Test the routing and team-quality hypothesis with a cheap
   in-process harness against the current system (Phase A) before building any durable
   infrastructure. The hypothesis is about model behavior; it needs no database, queue, or UI to
   measure.
7. **Then build the orchestration kernel.** If Phase A shows a real win, prove parallel and
   sequential scheduling, joins, artifacts, decision gates, progress events, retries, and
   recovery before adding many agents or autonomous writes — reusing the production-proven
   execution substrate rather than rebuilding it.
8. **Start with a minimal team.** Use a CEO, a deterministic librarian, and a researcher to test
   the lifecycle; add planner, executor, and reviewer roles only when the kernel and evaluations
   justify them.
9. **Compare rather than assume.** Run the new and current systems against the same task corpus,
   with a decision rule written down before the first run, and use the results to decide whether
   to expand, revise, or stop the experiment.

This is why the first milestone is not a universal company brain, a complete autonomous agent
organization, or even a durable kernel. It is a falsification harness that tests whether the team
beats the single agent at all — followed, only on a recorded win, by a small, durable
orchestration system that can assemble a bounded team, move work through parallel and sequential
stages, show the user truthful progress, and use completed artifacts to decide what happens next.

## Product Hypothesis

A small orchestrator with a limited BuildOS world model, a few generalist skills, and strong team-
assembly and workflow skills can outperform a single context-heavy agent on complex work without
making simple work unacceptably slow.

The orchestrator should decide among four routes:

1. `direct` — complete a small, clear request itself;
2. `workflow` — create and supervise one or more specialist stages;
3. `clarify` — ask for information that materially changes the route or result;
4. `capability_gap` — report that no available agent, tool, permission, or knowledge package can
   safely perform the requested work.

The architecture succeeds only if delegation is selective. A specialist workflow must beat or
justify its additional latency and cost relative to the direct path.

## Target User Experience

A user gives BuildOS one objective. The CEO either acts immediately or shows a live, comprehensible
workflow such as:

```text
Gathering evidence
  ✓ Reading the launch project
  ◌ Researching competitor positioning
  ◌ Comparing current pricing

Next
  ○ Synthesizing the evidence
  ○ Planning recommended changes
  ○ Waiting for approval
  ○ Applying and reviewing changes
```

The browser may disconnect without interrupting the work. When agents finish, their results become
durable, versioned artifacts. The CEO wakes at explicit decision gates with a compact workflow
digest, reasons about what should happen next, and either creates another stage, asks the user,
finishes, or records a capability gap.

This is the target experience for the _adopted_ system. During V0 evaluation, this progress view
renders only on an internal admin/debug surface; no new end-user surface ships until the
evaluation shows the architecture wins (see Non-Goals).

## System Outcomes

The complete system should provide:

- a fast path for simple BuildOS reads and low-risk actions;
- agent-first routing from a concise catalog of agent capabilities;
- explicit sequential and parallel orchestration;
- deterministic scheduling rather than model-managed polling;
- durable workflows that survive process and browser restarts;
- typed assignments, context packets, results, artifacts, and transition decisions;
- project- and operation-scoped permissions enforced at execution time;
- user-visible progress reconstructed from durable events;
- honest partial completion and recovery from child failure;
- traceability from the final answer or change back to artifacts and tool receipts;
- an evaluation harness that compares the new system with the existing system and direct-agent
  baselines.

## Architectural Boundary

The new system owns its control plane:

- API and session type;
- runtime package and prompts;
- agent catalog and agent manifests;
- workflow, stage, step, and transition semantics;
- persistence tables and queue job type;
- artifact, event, signal, and receipt contracts;
- frontend workflow projection;
- evaluation fixtures and scorers.

It may reuse stable BuildOS platform services only through narrow ports:

- authentication and user identity;
- project membership and authorization;
- canonical ontology and calendar operations;
- database queue primitives;
- model-provider and cost-accounting adapters;
- web research adapters;
- shared security and data-sanitization utilities.

The exclusion boundary is drawn around the **cognition layer**, not the execution substrate.

Excluded — must not import or extend: the current Agentic Chat prompt builder, context loader,
tool-surface selector, skills registry, turn supervisor, the chat agent loop, and the Agent Run
reasoning loop. (Deep Research is not a separate runtime — it is a mode inside the Agent Run
worker — and its orchestration logic is likewise excluded.)

Explicitly permitted and encouraged — the durable-execution substrate that already exists and is
production-proven: execution-generation fencing, the atomic run+job dispatch RPC pattern, the
advisory-lock concurrency-cap trigger, queue leases/heartbeats/stalled reclaim, AbortSignal
cancellation, the `agent_run_events` / `agent_run_signals` schema and RLS shapes, tool-receipt and
USD cost-ledger (reserve/settle) patterns, `WebResearchPort` and its hardened implementation,
`stageGatewayWriteOp` / `ProposedChange` staged mutations, and the reconnect-safe realtime
projection service.

Reusing a canonical data operation or this execution substrate is not reusing the current agent
architecture. It prevents the new system from creating a second, inconsistent implementation of
project mutation, security, and durability — machinery that is security-sensitive and was
hardened as recently as 2026-07-23.

## Operating Model

Four components have distinct responsibilities:

| Component         | Responsibility                                                                    |
| ----------------- | --------------------------------------------------------------------------------- |
| CEO/orchestrator  | Chooses the route, team, assignments, stages, decision gates, and next transition |
| Workflow engine   | Validates plans, schedules ready steps, enforces dependencies, budgets, and state |
| Specialist agents | Execute immutable, bounded assignments and produce typed results                  |
| Artifact store    | Carries durable, versioned information between steps and orchestrator wakeups     |

The CEO expresses intent. The workflow engine owns control flow. Specialist agents do not poll,
schedule siblings, expand their permissions, or delegate in V0.

## CEO Fast Lane

The CEO should remain generally capable without inheriting the current system's full context and
tool surface. Its initial direct capabilities should cover:

- basic BuildOS object and relationship understanding;
- project and workspace orientation;
- simple entity reads and status questions;
- a deliberately small set of low-risk direct actions;
- agent discovery and inspection;
- workflow construction and cancellation;
- artifact listing and selective loading;
- user clarification and capability-gap reporting.

A V0 request should remain direct when it has one resolved scope, one clear target, no external
research, no material ambiguity, and at most a small number of predictable operations. A direct
request may be promoted into a workflow if new complexity appears.

## Workflow Shape

The persisted model is a dependency graph. The CEO-facing authoring model is deliberately simpler:
sequential stages containing parallel or explicitly dependent steps.

```text
Stage 1: [A, B, C in parallel]
  join -> CEO decision gate
Stage 2: [D after Stage 1]
  join -> deterministic continuation
Stage 3: [E]
  join -> user approval gate
```

The CEO should use receding-horizon planning. It plans the current stage and, at most, the likely
next stage. It does not attempt to predict a long workflow end-to-end before evidence exists.

The workflow engine automatically starts work whose dependencies are satisfied. It wakes the CEO
only for an initial route, declared decision gate, material failure, user signal, or terminal
synthesis. The CEO never stays alive to babysit child work.

## Initial Agent Catalog

V0 begins with three agents:

| Agent          | Job                                                          | Permission ceiling                   |
| -------------- | ------------------------------------------------------------ | ------------------------------------ |
| CEO/generalist | Route, act directly, assemble stages, synthesize, and replan | Small direct surface + orchestration |
| Librarian      | Build focused BuildOS context packets with provenance        | Read-only BuildOS data               |
| Researcher     | Gather and structure external evidence                       | Read-only web search and visit       |

The architecture reserves clear extension points for planner, executor, and reviewer agents, but
they are not required to prove the orchestration kernel.

Skills belong to agent manifests. The CEO selects an agent from the agent catalog; the selected
agent's manifest determines its skills, context builder, tools, permissions, model policy, and
result contract. There is no global skill-first routing requirement in the new runtime.

## V0 Scope

V0 proves the lifecycle before autonomous mutation:

- CEO direct versus workflow routing;
- one or more sequential stages;
- multiple steps running in parallel;
- `all` and `best_effort` join policies;
- immutable assignments and permission grants;
- versioned artifacts and selective artifact loading;
- CEO decision gates and at least one replanning cycle;
- durable progress events and a reconnect-safe admin projection;
- cancel signals (pause and user-guidance deferred; they inherit the existing
  `agent_run_signals` pattern when needed);
- partial and failed specialist results;
- final CEO synthesis with artifact provenance;
- read-only execution plus proposed or staged actions for mutation scenarios.

V0 does not autonomously commit BuildOS writes.

## Non-Goals

- Replacing or migrating the current Agentic Chat or Agent Run systems.
- Porting the current prompt, context, or skill registries wholesale.
- Restoring the retired Tree Agent implementation.
- Recursive delegation or arbitrary agent depth.
- Unlimited children, budgets, or workflow duration.
- Multi-agent debate as a default pattern.
- A marketplace or user-authored agent builder.
- A new end-user product surface in V0. Progress is inspected through an admin/debug view; a
  winning architecture is adopted inside the existing chat entry point as a routing decision, not
  shipped as a fifth parallel destination. (Chat modal, agent runs/inbox, project reviews, and
  deep research already exist; the retired Tree Agent died as an orphaned fifth surface.)
- Perfect support for every BuildOS domain.
- Autonomous irreversible or external side effects.
- Persisting private model reasoning or exposing chain-of-thought in the UI.

## Engineering Principles

1. **Agent first.** Agent manifests are the primary capability boundary.
2. **Deterministic control flow.** Models propose work; code validates and schedules it.
3. **Artifacts over transcripts.** Steps exchange typed deliverables, not entire conversations.
4. **Receding-horizon planning.** Replan at evidence-backed gates instead of guessing the whole run.
5. **Least privilege.** Effective permissions are intersected and checked again at operation time.
6. **Durable by default.** No browser connection or in-memory promise owns workflow survival.
7. **Observable without revealing reasoning.** Persist facts, decisions, progress, artifacts, and
   receipts—not hidden deliberation.
8. **Progressive autonomy.** Read, propose, stage, review, and only later consider direct commit.
9. **Baseline before complexity.** Parallelism or specialization must justify itself empirically.
10. **Small, cohesive modules.** No orchestration god object or multi-thousand-line worker.

### Anti-bloat guardrails

- The core package uses domain, application, ports, adapters, and contracts as explicit boundaries.
- Runtime domain code has no direct Supabase, web-framework, queue, or model-provider imports.
- Each agent, state machine, scheduler concern, policy, and artifact codec lives in its own module.
- Source files should normally stay below 300 lines. A file approaching 400 lines triggers a split
  review; an exception requires a documented reason.
- One module owns one state transition or policy family. Shared helpers do not become dumping
  grounds.
- Contract schemas and pure state transitions are tested independently from providers and storage.
- Architecture fitness tests prohibit imports from the existing agent runtimes and direct adapter
  access from the domain layer.

Line count is a warning signal, not the design goal. Cohesion, testability, and dependency direction
remain the actual standard.

## Evaluation Plan

### Comparison lanes

Lanes are phased so the first read is cheap and the control is unambiguous:

**Phase A (initial read):**

1. the existing system — specifically the production agentic-chat v2 stream path
   (`/api/agent/v2/stream`), which is the named control lane;
2. the new specialist workflow (in-process harness).

**Phase B (only if Phase A shows signal):**

3. the new CEO fast lane;
4. a single-agent or sequential baseline without fan-out.

Read-only cases use the same frozen project snapshot. Mutation cases produce staged proposals so
comparison lanes do not make competing live changes; the control lane must itself run
proposal-only for those scenarios (forced review/stage mode) or they are not comparable.
Scenarios are drawn from real production chat sessions wherever possible rather than invented
fixtures, and each scenario runs repeatedly (≥3 runs per lane) so quality deltas can be separated
from model variance.

### Initial scenario corpus

- simple project question;
- simple entity read or update proposal;
- project status summary;
- single-source lookup;
- multi-source parallel research;
- sequential research then planning;
- parallel research then synthesis then planning;
- BuildOS context gathering followed by a proposed update;
- an ambiguous request requiring clarification;
- conflicting specialist evidence;
- one failed or timed-out specialist;
- a user cancellation during a run;
- a cross-project scope attempt;
- prompt injection in a document or webpage;
- a task with no supported agent or tool.

### Metrics

- task and acceptance-criteria success;
- correct `direct | workflow | clarify | capability_gap` routing;
- simple-task latency and unnecessary-delegation rate;
- workflow dependency and join correctness;
- quality, completeness, calibration, and synthesis faithfulness;
- artifact schema and provenance validity;
- unsupported-claim and invalid-citation rates;
- project, operation, and permission violations;
- progress-event truthfulness and reconnect recovery;
- partial-failure recovery and user-steering behavior;
- tokens, total cost, p50/p95 duration, and marginal quality per dollar;
- blind human preference and decision usefulness.

### Decision rule (pre-registered)

The go/change/stop thresholds are written down before the first comparison run, and
current-system baselines (p50/p95 time-to-first-token and cost per scenario class) are measured
before the thresholds are finalized. Starting template, finalized in the Phase A plan:

- **Go:** the workflow lane wins ≥60% of blind comparisons on complex scenarios at ≤3× the
  control lane's cost, and route accuracy is ≥90% on the labeled corpus.
- **Change:** the workflow lane wins on quality but violates the cost/latency bounds, or route
  accuracy lands between 75–90% — revise and re-run Phase A rather than start building.
- **Stop:** no blind-preference win on complex work, or the direct-lane p50 latency exceeds 1.5×
  current chat TTFT with no identified mitigation.

A marginal result is a stop, not a go. The burden of proof is on the new architecture.

### Hard safety gates

- Zero cross-project or unauthorized-operation execution.
- Every attempted tool operation produces a durable receipt.
- No completed research result contains unresolved or invalid required citations.
- No staged proposal is applied without its declared approval path.
- No specialist can add children, permissions, scope, or budget.
- Workflow recovery does not blindly replay a successful non-idempotent operation.

### V0 definition of done

V0 is complete when:

1. The CEO can correctly keep a simple fixture direct and create a valid multi-stage workflow for a
   complex fixture.
2. Independent steps execute concurrently and dependent steps cannot start early.
3. A joined stage wakes the CEO exactly once with a compact workflow digest.
4. The CEO can append a new stage after observing artifacts rather than relying on its initial plan.
5. Artifacts and tool receipts survive worker and browser restarts and remain attributable to their
   producing step.
6. The UI reconstructs the same active, completed, blocked, and waiting state after reconnect.
7. Cancellation, a partial child, a failed child, and user guidance all produce valid, tested state
   transitions.
8. The permission and project-scope hard gates pass with zero violations.
9. The initial corpus can run through both the old and new systems with captured model, latency,
   token, cost, route, artifact, and outcome data.
10. A recorded evaluation determines where the new system wins, loses, or is not yet justified.

## Milestones

Falsification precedes construction. Phase A is deliberately cheap and disposable; Phase B is
gated on Phase A's recorded go/change/stop decision.

**Phase A — falsification harness (no database, no queue, no UI):**

1. **Corpus and baselines:** freeze ~8 scenarios drawn from real chat sessions plus a frozen
   project snapshot; hand-label expected routes; measure current-system latency/cost baselines;
   finalize the pre-registered decision rule.
2. **Route mode:** implement the CEO route function and world card; score routing accuracy
   against the labels.
3. **In-process workflow lane:** specialists as plain async calls with typed artifacts in
   memory; digest → transition → synthesis; run the comparison against the control lane and
   record the go/change/stop decision.

**Phase B — durable system (only on a recorded go):**

4. **Architecture foundation:** finalize contracts, state machines, package boundaries,
   persistence, queue semantics, and fitness rules; run the substrate spike (reuse `agent_runs`
   scaffolding vs. new `orchestrator_*` tables).
5. **Deterministic simulator:** execute workflow fixtures with fake agents and no database or
   model.
6. **Durable kernel:** persistence, atomic scheduling, leases, recovery, signals, and events —
   reusing the production fencing/dispatch/events/signals patterns.
7. **CEO and initial agents:** direct lane, agent catalog, librarian, researcher, artifact
   passing, decision gates, and synthesis.
8. **Progress projection:** reconnect-safe stage and task projections on an admin surface, plus
   cancellation.
9. **Full parallel evaluation and expansion decision:** all four lanes against the frozen
   corpus; only then plan the planner, staged executor, reviewer, and controlled writes.

## Related Documents

- [V0 Architecture Plan](./V0_ARCHITECTURE_PLAN.md)
- [Audit 2026-07-24](./AUDIT_2026-07-24.md) — pre-implementation audit; source of the Phase A/B
  restructure, the substrate-reuse boundary, and the contract fixes
- [Phase A Falsification Plan](./PHASE_A_FALSIFICATION_PLAN.md) — the executable first step
- [Phase A Audit 2026-07-25](./PHASE_A_AUDIT_2026-07-25.md) — independent audit of the built A0–A2
  work; source of the amended decision rule and the eval-validity fixes
- [Next Iteration Runbook](./NEXT_ITERATION.md) — the ordered, costed steps that remain
- [Agentic Chat Operating Model](../../specs/agentic-chat-operating-model.md) — existing-system
  control, not a dependency of the new runtime
- [Tree Agent LLM Orchestration Spec](../../specs/tree-agent/tree-agent-llm-orchestration-spec.md) —
  historical reference only
- [Worker Flow Audit](../../../apps/worker/docs/WORKER_FLOW_AUDIT_2026-07-01.md) — historical failure
  and lifecycle lessons
