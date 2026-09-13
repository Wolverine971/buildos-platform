<!-- apps/worker/src/workers/agentic-chat/djflow.md -->

# DJ Flow — planned multi-agent orchestration

Status: design only. Written 2026-09-12 against the Anthropic guide
`Building Effective AI Agents` (Dec 2025) and the real code in
`apps/worker/src/workers/{agentic-chat,agent-run,project-loop}` plus
`packages/agent-orchestrator`.

**The headline, before anything else:** you have already built this three times,
each time hardcoded. The durable run engine, cost reservation, liveness
recovery, per-user capacity, parent/child hierarchy, pause-for-user, and
propose-don't-mutate are all in production today. **What is missing is one
thing: a planner that decides the shape of the fan-out instead of a constant.**

Flow is not a new system. Flow is `agent_runs` with a planner and a wave
scheduler on top. That is roughly one new table and one new worker lane, not a
greenfield.

Vocabulary: a request opens a **run**; a run advances through **stages**; a
stage fans out into **steps**; a step is one specialist agent (one `agent_runs`
row).

---

## 0. The guide, read against what we have

| PDF pattern                | BuildOS today                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Single agent               | **Shipped twice.** Chat (`streamActingPass`) and headless (`agentRunWorker.ts`)                                                               |
| Evaluator-optimizer        | **Shipped.** The chat reviewer lane (`provider/review/*`) over contracts and mutation batches                                                 |
| Parallel workflow          | **Shipped hardcoded, twice.** Deep research 1→2 children; project loop 1→4 detectors (and those run _serially_, see §1.3)                     |
| Sequential workflow        | Not built. No step ever depends on another step                                                                                               |
| Hierarchical / supervisory | **Half shipped.** `agent_runs.parent_run_id` + `depth` exist; the coordinator is bespoke to deep research and the fan-out width is a constant |
| Collaborative / swarm      | Not building                                                                                                                                  |

Take the guide's advice on three things:

1. **"Multi-agent systems use roughly 10-15x more tokens than single agents."**
   Escalation is a decision, not a default. "What's next on Cedar House" must
   never open a run.
2. **"The orchestrator agent may face the fundamental problem that context grows
   too complex for one agent to manage."** Named as _the_ failure mode of
   hierarchical systems. Fix: agents exchange bounded provenanced packets, never
   transcripts (§10).
3. **Observability first.** _"You can't simply examine a stack trace — you need
   visibility into prompt chains, model decision paths, retrieval contexts,
   token consumption, and the entire reasoning workflow."_ `agent_tool_executions`
   already does the per-step half of this.

Diverge on three things:

1. **The guide says "individual subagents are treated as tools, where a
   supervisor agent uses a tool-calling model to decide which agent tools to
   invoke."** Don't. That hands concurrency, spend, permission, and fan-out
   width to the model, and forces the whole run to live inside one context
   window. We want the model to **declare** a plan and code to **schedule** it.
   The model proposes; the compiler clamps; Postgres remembers.
2. **The guide treats sequential and parallel as separate patterns.** They are
   one primitive at different edge densities (§8).
3. **Collaborative / swarm is out of scope, probably forever.** The guide is
   honest that it brings _"emergent behaviors that arise without specific
   programming, where small changes can unpredictably affect how agents
   behave."_ We mutate real user projects and need chain of custody on every
   write.

---

## 1. You already built this three times

### 1.1 `agent_runs` is already the step table

Straight from `database.schema.ts` and `agent-work.types.ts`:

```
agent_runs
  parent_run_id, depth            ◄ hierarchy. already there.
  trigger  'chat'|'manual'|'scheduled'|'event'   ◄ MULTIPLE ENTRY POINTS. already there.
  run_template  'agent'|'deep_research'          ◄ the agent roster. two entries.
  goal, instructions, expected_output            ◄ ~= StepSpec
  allowed_ops, scope_mode 'read_only'|'read_write' ◄ ~= PermissionGrant
  budgets {wall_clock_ms, max_tokens, max_tool_calls, max_cost_usd}  ◄ ~= StepBudget
  effort  'standard'|'deep'                      ◄ model routing
  orchestration_state jsonb                      ◄ coordinator scratch space
  execution_generation                           ◄ the fence. already there.
  change_set, review_required                    ◄ propose-don't-mutate + review
  status  queued|running|paused|needs_input|proposal_ready
                |completed|partial|failed|cancelled   ◄ PAUSE IS ALREADY A STATE
  parent_session_id, parent_message_id           ◄ chat linkage
  source_decision, source_suggestion_id          ◄ project-loop linkage
  project_id, context_type, metrics, result
```

And alongside it, already in production:

- **`agentRunCostLedger.ts` / `agentRunCostPolicy.ts`** — reserve-then-settle
  spend accounting with `reserved_cost_usd` / `actual_cost_usd`, paid-tool
  charges, Tavily credits. This is the budget governor, built.
- **`agentRunStrandedSweep.ts`** — "SAFETY-CRITICAL liveness recovery." Detects
  runs whose worker died, re-enqueues on a stable dedup key, every action
  idempotent and bounded, conditional `UPDATE` keyed on non-terminal status
  **and** scanned `updated_at` so two sweeps can't double-act. And it correctly
  **never re-drives a run parked waiting for the user** (`paused`,
  `needs_input`, `proposal_ready`). That is the hard part of durability, done.
- **Per-user capacity slots** — already enforced, already accounted.
- **`agent_tool_executions`** — per-step tool trace with args, result, timing,
  tokens, gateway op, proposed-change linkage.

### 1.2 Deep research is a hardcoded 1→2 fan-out

`deepResearchOrchestrator.ts`:

```ts
export const DEEP_RESEARCH_CHILD_COUNT = 2;
export const DEEP_RESEARCH_ALLOWED_OPS = [AGENT_OP_WEB_SEARCH, AGENT_OP_WEB_VISIT];
```

A parent run plans, spawns exactly two children, **parks itself** waiting for
their wakes, then synthesizes from an evidence packet. Parent/child, fan-out,
park, wake, join, synthesize — the whole hierarchical pattern, with the width
frozen at 2 and the specialist frozen at web research.

**Flow is that orchestrator with `DEEP_RESEARCH_CHILD_COUNT` replaced by a
planner, and `DEEP_RESEARCH_ALLOWED_OPS` replaced by a roster.**

### 1.3 The project loop is an unplanned wave running serially

`projectLoopWorker.ts` around line 3120 runs four independent lenses over the
same `ctx`:

```ts
const docOrg        = await runGenerator('doc organization', () => generateDocOrganization({...}));
const outdated      = await runGenerator('outdated docs',    () => generateOutdatedDocs({...}));
const drift         = await runGenerator('drift',            () => generateDrift({...}));
const taskConflicts = await runGenerator('task conflicts',   () => generateTaskConflicts({...}));
```

Read what that is:

- Four **independent** steps — no data dependency between them. A wave.
- Running **serially** — four sequential LLM round trips.
- `runGenerator` catches, records a `skippedLenses` entry, and returns `[]` —
  that is precisely `join_policy: 'best_effort'`.
- Writes `project_suggestions`, never mutating the project: _"It does NOT mutate
  the project — proposed changes are replayed by the web app on user approval."_
- Already syncs to the inbox, already deduped by entity fingerprint.

So the loop is a best-effort four-step wave, hardcoded, run in series. Making it
a real wave is a ~4x wall-clock cut on the loop's slowest phase with **identical
outputs** — same suppression, same inbox sync, same review UI. That is the
cheapest possible first proof of the scheduler, on production traffic (§17 WP-1).

### 1.4 What is actually missing

Only four things. This is the whole build:

1. **A planner.** Emits a stage as a DAG of steps instead of a constant width.
2. **Dependency edges + wave layering.** No step can depend on another today.
3. **A generic coordinator** (the tick), replacing the deep-research-specific one.
4. **Stage transitions.** Join a stage, digest it, decide `append_stage` /
   `complete` / `ask` / `fail`. Today a run has one shape and no replan.

Everything else — durability, fencing, cost, liveness, capacity, pause, review,
tracing, multi-trigger admission — exists.

### 1.5 The three runs, side by side

There are eight `*_runs` tables in the schema (`agent_runs`, `chat_turn_runs`,
`cycle_runs`, `project_loop_runs`, `question_tree_runs`, `homework_runs`,
`email_relevance_scan_runs`, `chat_prompt_eval_runs`). Three of them are
_agentic_ — they call a model to decide something:

|                        | `chat_turn_runs`                                                                        | `agent_runs`                                                                                         | `project_loop_runs`                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **What it is**         | one user message → one assistant reply                                                  | one headless goal → one result envelope                                                              | one project → a set of review suggestions                                                         |
| **Trigger vocabulary** | `source`                                                                                | `trigger`: `chat`\|`manual`\|`scheduled`\|`event`                                                    | `trigger_reason`: `end_of_day`\|`scheduled`\|`burst`\|`critical_change`\|`manual`                 |
| **Lifecycle**          | `queued→running→completed`\|`failed`\|`cancelled`                                       | `queued→running→paused`\|`needs_input`\|`proposal_ready→completed`\|`partial`\|`failed`\|`cancelled` | `queued→running→waiting_review`\|`completed`\|`failed`                                            |
| **Resumable?**         | **No.** `request_turn_clarification` _ends_ the turn; the user's answer opens a new row | **Yes.** `paused`/`needs_input` resume the same run                                                  | **No.** `waiting_review` is done-but-unresolved; resolving it doesn't resume the run              |
| **Agentic loop?**      | Yes — multi-round tool loop, read → disposition → reviewed write                        | Yes — JSON action loop: the model calls an op or submits a result                                    | **No.** Four single-shot structured generations with context pre-inlined. No tools at all         |
| **Tool surface**       | `mutationToolCatalog` + runtime read tools, phase-gated by `surfaceFor()`               | `shared-agent-ops` op catalog via the gateway, capability-gated on env                               | none                                                                                              |
| **Write authority**    | Can commit, but only through contract → independent reviewer → carve-out → mutate       | **Commits directly.** `mutation_mode` defaults to `'commit'`; staging is opt-in via `review: true`   | **Never writes.** Emits `project_suggestions`, replayed by web on approval                        |
| **Context assembly**   | prepared-prompt artifact + session history + cache/prewarm                              | the brief (`goal`/`instructions`/`expected_output`). No conversation history                         | `LoopContext` built from the project graph, capped doc count                                      |
| **Streaming**          | Durable `AgentStreamEventV1` + Supabase realtime + reconcile hints                      | **None.** Headless; progress = row updates + inbox sync                                              | **None.** Writes once at the end                                                                  |
| **Hierarchy**          | flat, one turn                                                                          | `parent_run_id` + `depth`; deep research spawns exactly 2 children                                   | flat                                                                                              |
| **Liveness recovery**  | `stalledRecovery.ts` + `execution_generation` + terminal reconcile                      | `agentRunStrandedSweep.ts` — conditional UPDATE on status **and** `updated_at`                       | **Age-based orphan reaping** in `enqueue.ts`: `STALE_RUNNING_RUN_MS` 1h, `STALE_QUEUED_RUN_MS` 6h |
| **Budget**             | provider budget ms, max tool rounds/calls, consumption billing                          | `budgets` jsonb + cost ledger with reserve/settle + paid-tool charges                                | `cost_usd` recorded after the fact ("~5 LLM calls, cost-capped")                                  |
| **Output**             | assistant message                                                                       | `result` envelope + `change_set` + `EntityTouch[]`                                                   | v2 manager `brief` + N suggestion rows                                                            |

#### Which differences are incidental

Four of these are the same problem solved three times. They should collapse, and
collapsing them is most of Flow's value even before the planner exists:

1. **Liveness recovery** — three mechanisms for one bug (generation fence /
   conditional-update sweep / age-based reaping). The sweep is the good one.
2. **Budget accounting** — three approaches. The cost ledger's reserve-then-settle
   is the only one that can refuse work _before_ spending.
3. **Context assembly** — three builders, all producing "a bounded packet about
   the user's world." Should be one WorldCard + `ContextPacket`.
4. **Trigger vocabulary** — `source` vs `trigger` vs `trigger_reason`, with
   `manual` and `scheduled` appearing in two of them with the same meaning. One
   enum.

#### Which differences are essential

Three are real, and they're exactly the three fields on the admission request
in §2. They don't merge — they become parameters.

1. **Resumability.** A chat turn _must_ terminate so the user gets a reply; a run
   may sleep for days. Both are needed. **Resolution: the run is resumable, and a
   chat turn is a _client_ of a run, not the run itself.** That's why
   `open_flow_run` ends the turn immediately rather than blocking it.
2. **Who is listening** → the `interaction` axis (§2). Chat has a human present;
   a cron does not. This decides what `needs_input` even means.
3. **Write authority.** The genuine conflict: chat reviews then commits,
   `agent_runs` commits by default, the loop never writes. **Resolution: write
   authority is a property of the grant, not of the system.** Specialists never
   write (§11); the root proposes; `permission_grant` + `review_required` decide
   whether the proposal auto-commits or waits. The loop's "never writes" becomes
   a grant with no write ops — not a different code path.

#### The part that is a capability upgrade, not a refactor

The project loop is **not agentic today.** Its four lenses get a pre-built
`LoopContext` and return JSON; they cannot go look anything up. `generateDrift`
even opens with `if (ctx.documents.length === 0 && ctx.tasks.length === 0) return []` —
a hardcoded version of the decision a planner would make from the WorldCard.

Routing the loop through Flow doesn't just dedupe plumbing: it gives the review
lenses **tools**. A drift lens that can search the project's documents, pull a
task's history, or check the calendar is a materially better reviewer than one
handed a capped snapshot. That is the strongest product argument for the merge,
and it's why WP-1 (§17) targets the loop first.

---

## 2. Entry points: Flow has no front door

This is the answer to "maybe there are multiple ways for the request to enter."
There are, and it is not a fork to resolve — it is the design.

> **Flow has one admission function and zero knowledge of who called it.**
> `trigger` is recorded for observability. The engine never branches on it.

Callers differ along exactly four axes. A caller supplies these and nothing else:

```ts
type FlowRunRequest = {
	// 1. WHO ASKED — recorded, never branched on. Already `agent_runs.trigger`.
	trigger: 'chat' | 'manual' | 'scheduled' | 'event';
	source_ref: { session_id?; turn_id?; project_loop_run_id?; suggestion_id?; cron_id? };

	// 2. WHAT — the objective and the world it may touch
	objective: string;
	context_type: 'project' | 'global';
	project_scope: ProjectScope[];

	// 3. AUTHORITY — permission + money. NOT negotiable by the model.
	permission_grant: PermissionGrant; // scope_mode + allowed_ops
	budget: AgentRunBudgets; // max_cost_usd, max_tool_calls, ...

	// 4. HOW IT COMES BACK — the two ports that actually differ between callers
	delivery: DeliveryPort; // where the answer lands
	interaction: 'live' | 'deferred' | 'none'; // can it ask, and where do questions surface
};
```

**Axes 1–3 are already columns on `agent_runs`.** Axes 4 is the new part, and
it is the part people get wrong.

### Why `interaction` is the axis that matters

Chat has a human sitting there. A cron does not. That single difference decides
what `needs_input` means:

| `interaction` | Who's listening            | `needs_input` behavior                                                                           |
| ------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| `live`        | A human in an open session | Ask inline, stream the question, resume within seconds                                           |
| `deferred`    | Nobody right now           | Park the question in the inbox / brief. Resume days later, or TTL to `partial` keeping artifacts |
| `none`        | Nobody, ever               | `needs_input` is a **failure**. Settle `partial` with the question recorded as an open item      |

Get this wrong and a nightly loop stalls forever holding a capacity slot waiting
for an answer nobody will ever see. The stranded sweep already knows not to
re-drive a `needs_input` run — so without `interaction`, it parks correctly and
then waits forever, correctly. The TTL is the missing half.

### Case A — the agentic chat

Chat's semantic disposition gate (`provider/turn-phase.ts`) already forces the
acting model to pick exactly one of `declare_read_only_turn`,
`declare_turn_contract`, `request_turn_clarification`. Add a fourth:

```ts
open_flow_run({ objective, project_scope, why_decomposition_is_needed });

// delivery:    { kind: 'chat_session', session_id, turn_id }
// interaction: 'live'
// budget:      the user's session allowance (they asked, they're waiting)
```

The turn ends immediately with "this is real work, I'm on it." The run streams
into the same session. Chat stays fast for the ~80% that should never see a
planner; nothing about the hardened turn loop changes.

### Case B — the project review loop

`projectLoopWorker` calls Flow instead of its four hardcoded generators. The
planner picks which lenses this project actually needs — a project with no
documents should not pay for `generateOutdatedDocs` — and fans them out as one
wave.

```ts
// delivery:    { kind: 'project_suggestions', project_id, loop_run_id }
//              → writes the SAME project_suggestions rows + the same inbox sync,
//                so the entire existing review UI works unchanged.
// interaction: 'deferred'   → needs_input parks in the inbox
// budget:      the loop's automatic cap (nobody opted in per-run → tighter)
// trigger:     'scheduled' (end-of-day scan) or 'manual' (user hit review)
```

The delivery port for this case is mostly already written — it's the existing
suggestion-insert + `syncInboxItemForProjectSuggestion` path.

### Case C — later, free

`trigger: 'event'` (a braindump lands, a calendar conflict appears),
`trigger: 'manual'` from a Flow surface of its own, MCP/API. Each is a
`DeliveryPort` implementation, not an engine change.

### Why this shape is testable

Because `delivery` and `interaction` are ports, the identical run executes under
a `TestDeliveryPort` that just collects artifacts. Every eval, every battery
case, every regression test drives the real engine with no chat session, no
cron, and no UI. That is what makes "test it out down the line" cheap.

---

## 3. The reuse map

**Reused as-is (do not touch):**

|                                        | Where                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Durable run rows, hierarchy, fencing   | `agent_runs` (+ `parent_run_id`, `depth`, `execution_generation`)                                                   |
| Cost reserve/settle, paid-tool charges | `agentRunCostLedger.ts`, `agentRunCostPolicy.ts`                                                                    |
| Liveness recovery                      | `agentRunStrandedSweep.ts`                                                                                          |
| Per-user capacity slots                | `agentRunPolicy.ts` / `agentRunRuntimePolicy.ts`                                                                    |
| Per-step tool trace                    | `agent_tool_executions`                                                                                             |
| Read tools                             | `packages/agentic-chat-runtime/src/tools/*`, `@buildos/shared-agent-ops` op catalog                                 |
| Write path                             | `change_set` / `ProposedChange` + the reviewed chat mutation lane. **One place writes user data. That stays true.** |
| Provider routing                       | `packages/smart-llm` (OpenRouter + fallbacks)                                                                       |
| Web research, SSRF-safe                | `webResearchPort.ts`, `webSecurityPolicy.ts`                                                                        |
| Contracts                              | `packages/agent-orchestrator/src/contracts/*` — written for exactly this, currently eval-only                       |

**Built new (the actual work):**

|                                                     | Why                                                             |
| --------------------------------------------------- | --------------------------------------------------------------- |
| `flow_stages` table                                 | Stage-level bookkeeping: spec, join/failure policy, wave cursor |
| `wave_index` + `depends_on_step_keys` on child runs | The DAG. Column or `orchestration_state` — see §4               |
| `flow_tick` lane + the tick function                | Generic coordinator. Pure function of persisted state           |
| The planner                                         | WorldCard → `WorkflowStageSpec`, validated and clamped          |
| The transition gate                                 | Digest → `append_stage` / `complete` / `ask` / `fail`           |
| `DeliveryPort` / `interaction`                      | §2                                                              |
| Specialist roster beyond `deep_research`            | §16                                                             |

**Deleted:** `packages/agentic-chat-runtime/src/supervisor/` is dead code today
(re-exported, never constructed; the chat README says the supervisor was
removed). Delete it in the first PR or the name will confuse this work for a
year.

**Honest risk of reuse:** `orchestration_state` is currently deep-research
shaped, and `DEEP_RESEARCH_CHILD_COUNT = 2` is baked into the stranded sweep's
slot accounting ("all three slots"). Generalizing means touching a
safety-critical file. That is the one real argument for greenfield, and it is
fork **F1** in §18.

---

## 4. Data model delta

Root run and every step are both `agent_runs` rows. That is deliberate: the
cost ledger, the stranded sweep, capacity slots, and inbox sync all apply to the
root for free.

```
agent_runs                       -- EXISTING. additions:
  run_template += 'flow'         -- the root coordinator
  run_template += <specialist ids>  -- 'librarian' | 'researcher' | 'drafter' | ...
  flow_stage_id      uuid null   -- which stage this step belongs to
  wave_index         int  null   -- DERIVED by layerIntoWaves(). never model-chosen.
  client_step_key    text null   -- planner-chosen DAG node name
  depends_on_keys    text[] null -- the DAG edges
  input_artifact_ids uuid[] null -- EXPLICIT inputs. no ambient access.
  UNIQUE (flow_stage_id, client_step_key)

flow_stages                      -- NEW. the only genuinely new table.
  id, run_id (root), stage_index
  spec            jsonb   -- WorkflowStageSpec, validated + compiled
  join_policy     'all' | 'best_effort'
  failure_policy  'replan' | 'complete_partial' | 'fail'
  decision_gate   boolean -- pause for approval before running this stage
  wave_cursor     int
  status          'pending'|'running'|'joined'|'failed'

flow_artifacts                   -- NEW, or reuse RunResultArtifact + a table
  id, run_id, produced_by_run_id, attempt
  envelope       jsonb   -- ArtifactEnvelope: type, payload, provenance, as_of
  content_hash   text
  draft_key      text
  UNIQUE (produced_by_run_id, attempt, draft_key)   -- idempotent retry

flow_events                      -- NEW. append-only. the execution record.
  id, run_id, sequence_index, step_run_id null
  kind    'run_opened'|'stage_planned'|'wave_materialized'|'step_started'
        | 'step_progress'|'step_finished'|'stage_joined'|'transition_decided'
        | 'awaiting_user'|'user_answered'|'synthesized'|'run_settled'
  payload jsonb
  UNIQUE (run_id, sequence_index)
```

Four invariants encoded above, worth naming:

- **`wave_index` is derived, never declared.** The planner gives edges; code
  computes waves (§8).
- **Artifacts unique per `(step, attempt, draft_key)`.** A step that crashes
  after writing artifacts does not duplicate them on retry.
- **A step's result and artifacts commit in one transaction.** Partial step
  state is not representable.
- **`execution_generation` fences late writes** — already the pattern
  everywhere in chat. A result from attempt 1 is rejected once attempt 2 is
  current.

---

## 5. The engine: two lanes, one lock

The single decision everything follows from:

> **Nothing important lives in worker memory. The queue only delivers wake-ups.**

```
flow_step   expensive, parallel, many at once.  Executes exactly ONE step.
            (this is today's agentRunWorker, narrowed to read-only + structured output)
flow_tick   cheap, serialized per run.          Advances the state machine.

INVARIANT: at most one tick per run at a time.
           SELECT ... FOR UPDATE on the root agent_runs row,
           or pg_advisory_xact_lock(run_id).
           Every scheduling decision in the system happens under that lock.
```

Every step completion enqueues a tick. Every tick is idempotent. The tick
**never blocks on a step** — it reads rows, makes one decision, writes, exits.
That is why there is no wall-clock ceiling on a run.

---

## 6. The tick — pseudo-code

```ts
// ═══════════════════════════════════════════════════════════════════════
// flow_tick — the whole orchestrator. Serialized per run.
// A pure-ish function of persisted state → writes. The scheduling logic is
// testable with NO provider and NO delivery target.
// ═══════════════════════════════════════════════════════════════════════
async function tick(runId: string) {
  return db.transaction(async (tx) => {
    const run = await tx.selectForUpdate('agent_runs', runId);      // ◄ THE LOCK
    if (isTerminal(run.status)) return;
    if (run.cancel_requested_at) return cancelRun(tx, run);
    if (budgetExhausted(run))    return settle(tx, run, 'partial', 'budget');

    switch (run.status) {
      // ── plan the first stage ────────────────────────────────────────
      case 'queued': {
        const world = await buildWorldCard(tx, run);      // bounded, NO model call
        const spec  = await planStage(world, run.goal, /* priorDigest */ null);
        //            ▲ ONE stage. never the whole tree. §7.2

        const stage = await compileAndPersistStage(tx, run, spec);
        //            ▲ validate → clamp → layerIntoWaves → insert child agent_runs
        if (stage.decision_gate) return askUser(tx, run, approvalFor(stage));
        await materializeWave(tx, run, stage, 0);
        return tx.update(run, { status: 'running', orchestration_state: { stage_id: stage.id } });
      }

      // ── advance the current stage ───────────────────────────────────
      case 'running': {
        const stage = await tx.loadStage(run.orchestration_state.stage_id);
        const steps = await tx.loadSteps(stage.id);
        const wave  = steps.filter((s) => s.wave_index === stage.wave_cursor);

        if (wave.some(isInFlight)) return;                 // not our turn yet
        await reapExpiredLeases(tx, wave);                 // crash recovery

        if (stage.join_policy === 'all' && wave.some((s) => s.status === 'failed')) {
          return applyFailurePolicy(tx, run, stage);
        }

        const nextWave = stage.wave_cursor + 1;
        if (steps.some((s) => s.wave_index === nextWave)) {
          await materializeWave(tx, run, stage, nextWave); // unblock dependents
          return tx.update(stage, { wave_cursor: nextWave });
        }

        // ── stage joined: the decision gate ──────────────────────────
        await tx.update(stage, { status: 'joined' });
        await emit(tx, run, 'stage_joined', { stage_id: stage.id });

        const digest = await buildWorkflowStateDigest({     // ≤ MAX_DIGEST_TOKENS (4k)
          objective: run.goal,
          currentStage: stage, stages: await tx.loadStages(run.id),
          artifacts: await tx.loadArtifactSummaries(run.id),
          budget: budgetStateOf(run),
          allowedTransitions: legalTransitions(run, stage, steps),   // ◄ CODE decides
        });

        const decision = digest.allowed_transitions.length === 1
          ? forcedTransition(digest)                // no model call. free.
          : await transitionModel.decide(digest);   // one small call
        await emit(tx, run, 'transition_decided', decision);

        switch (decision.action) {
          case 'append_stage': {
            if (atPlanLimits(run)) return tx.update(run, { status: 'synthesizing' });
            const next = await compileAndPersistStage(tx, run, decision.next_stage);
            await materializeWave(tx, run, next, 0);
            return tx.update(run, {
              orchestration_state: { stage_id: next.id },
              execution_generation: run.execution_generation + 1,  // fence stale results
            });
          }
          case 'continue_existing_graph':
            return tx.update(stage, { status: 'running' });
          case 'request_user_input':
            return askUser(tx, run, decision.questions);     // §12 — honors `interaction`
          case 'complete':
          case 'complete_partial':
            return tx.update(run, { status: 'synthesizing' });
          case 'capability_gap':
          case 'fail':
            return settle(tx, run, 'failed', decision.reason_code);
        }
      }

      // ── parked. a user answer (or a TTL) wakes it. ──────────────────
      case 'paused':
      case 'needs_input':
      case 'proposal_ready':
        return;

      // ── one voice: the root writes the answer, then delivers it ─────
      case 'synthesizing':
        return synthesizeAndDeliver(tx, run);   // → run.delivery port. §2
    }
  });
}

// Materializing a wave is the ONLY place steps become runnable.
async function materializeWave(tx, run, stage, waveIndex: number) {
  const wave = await tx.loadSteps(stage.id, { wave_index: waveIndex });

  for (const step of wave) {
    await tx.update(step, {
      status: 'queued',
      // inputs resolve to EXPLICIT artifact ids from the steps it depends on.
      // no ambient access to the run's artifact pile.
      input_artifact_ids: await resolveInputs(tx, step, stage),
    });
  }

  await emit(tx, run, 'wave_materialized', {
    stage_id: stage.id, wave_index: waveIndex,
    labels: wave.map((s) => s.label),
  });

  // reserve BEFORE spend, via the existing cost ledger. a wave that doesn't
  // fit the remaining budget is refused, not overrun.
  await reserveBudget(tx, run, sum(wave.map((s) => s.budgets.max_cost_usd)));

  await queue.enqueueMany('flow_step',
    wave.map((s) => ({ run_id: run.id, step_run_id: s.id, generation: s.execution_generation })));
}

// `interaction` decides what a question even means. §2
async function askUser(tx, run, questions) {
  await emit(tx, run, 'awaiting_user', { questions });
  switch (run.interaction) {
    case 'live':     return tx.update(run, { status: 'needs_input' });  // streams to session
    case 'deferred': await run.delivery.parkQuestions(questions);       // inbox / brief
                     return tx.update(run, { status: 'needs_input', needs_input_ttl: in(7, 'days') });
    case 'none':     return settle(tx, run, 'partial', 'question_unanswerable');
  }
}
```

---

## 7. Decomposition — how a request becomes a stage DAG

### 7.1 The planner never sees the database

It sees a **WorldCard**: bounded, deterministic, no model call, built from data
we already load. `application/route-mode/world-card.ts` is the existing version.

```
WorldCard {
  now, timezone
  current_project    { id, name, stage, next_step, counts }
  other_projects     [ { id, name, stage } ]        // names only
  recent_activity    [ short lines ]
  available_agents   [ { agent_id, what_it_does, tools_it_may_use } ]
  permission_grant   { scope_mode, allowed_ops, external egress? }
  budget_remaining   { usd }
}
```

Two invariants: it is capped, and it enumerates **capabilities**. The planner
cannot invent an agent, a tool, or a permission it doesn't have — an unknown
`agent_id` fails compilation, it does not fail at runtime in production.

`available_agents` is what makes a project with no documents skip the
outdated-docs lens: the card carries the counts, and a good planner won't spend
on a lens with nothing to look at. That's the loop's immediate win (§1.3).

### 7.2 Plan one stage deep, never the whole tree

The most important decomposition decision, and the counterintuitive one.

A planner asked for a complete four-stage plan up front **will hallucinate
stages 3 and 4**, because the information needed to plan them does not exist
yet — it is produced by stage 1. So the planner emits exactly one stage. After
the stage joins, the transition gate decides whether to append another, using a
digest of what actually came back.

This is why `RouteDecisionSchema.workflow` carries `initial_stage`, singular, and
why `TransitionActionSchema` has `append_stage`. That design is right. Keep it.

Corollary now that there is no wall clock: afford **more stages, not bigger
ones**. `maxStages` 5 → ~8. Cut `MAX_STEPS_PER_STAGE` from 20 → ~6. A 20-wide
fan-out is a planner that failed to think, and it's a money bomb.

### 7.3 What a step declaration must contain

`StepSpecSchema` already has the right fields. Why each exists:

```
client_step_key       planner-chosen id; the DAG node name
agent_id              which specialist (must exist in the WorldCard)
goal                  what this step is for
non_goals             ◄── THE ANTI-DUPLICATION FENCE. Without it, three parallel
                          agents all search the web for the same thing. The guide
                          names this exact failure: agents must "divide monitoring
                          responsibilities to avoid duplication."
input_artifact_ids    what it may read from earlier steps. explicit, not ambient.
depends_on_step_keys  ◄── THE DAG EDGES. this is what makes it sequential or
                          parallel. §8.
deliverable_type      what shape comes back
acceptance_criteria   what "done" means. `machine_checkable` (a validator_id runs
                      in code) or `judgment` (a critic grades it). The
                      discriminated union exists so a step cannot self-grade.
user_visible_label    what streams while it runs
```

### 7.4 Validation is deterministic and unforgiving

Already implemented in `contracts/workflow-stage.ts`: rejects self-dependency,
duplicate keys, unknown same-stage dependencies, and cycles (DFS).

Then **compile**: `StepSpec` → `StepAssignment` → an `agent_runs` row. This is
where the model's proposal meets reality. Compile binds `scope_mode`,
`allowed_ops`, `budgets`, and `effort` from **policy**, never from the model's
text. One bounded repair round on schema failure; then fail planning honestly
rather than guessing.

---

## 8. Sequential vs parallel — one mechanism

The guide presents these as two patterns. They are one primitive at different
edge densities:

```
parallel              sequential            mixed (the real case)
  a  b  c               a → b → c             a   b
   \ | /                                        \ /
     d                                           c → d
```

All three are just `depends_on_step_keys`. The scheduler does Kahn-style
topological layering into **waves**; every step in a wave runs concurrently.
Sequential is a chain. We never ask the model "should this be parallel" — we
derive it from the edges it declared.

```ts
// Runs at compile time. wave_index is persisted on each step row.
function layerIntoWaves(steps: StepSpec[]): StepSpec[][] {
	const remaining = new Map(steps.map((s) => [s.client_step_key, s]));
	const satisfied = new Set<string>();
	const waves: StepSpec[][] = [];

	while (remaining.size > 0) {
		const wave = [...remaining.values()].filter((s) =>
			s.depends_on_step_keys.every((k) => satisfied.has(k))
		);
		if (wave.length === 0) throw new PlanCompileError('cycle'); // schema catches first
		for (const s of wave) remaining.delete(s.client_step_key);
		for (const s of wave) satisfied.add(s.client_step_key);
		waves.push(wave);
	}
	return waves;
}
```

The same algorithm already lives in `toolExecutionGraph.ts` for tool calls.
This is the agent-level version, one floor up.

Planner guidance, from the guide, restated:

- **Parallel** when subtasks are independent and each deserves focused
  attention: _"AI models generally perform better when each consideration is
  handled by a separate call."_ Web research ‖ internal data. The loop's four
  lenses. Competing drafts for a vote.
- **Sequential** when stage N+1 genuinely needs N's output: outline → validate
  outline → write doc. Draft → review → polish.
- The guide's main "avoid parallel" warning — _"agents can't reliably coordinate
  changes to shared state"_ — does not apply to us, because specialists never
  write (§11). That whole failure class is designed out.

---

## 9. A step — pseudo-code

This is `agentRunWorker.ts` narrowed: read-only surface, structured output,
no orchestration decisions.

```ts
// ═══════════════════════════════════════════════════════════════════════
// flow_step — one specialist. Own window, own budget, READ-ONLY.
// ═══════════════════════════════════════════════════════════════════════
async function runStep(job: { run_id: string; step_run_id: string; generation: number }) {
	const lease = await takeLease(job, POLICY.leaseMs); // conditional UPDATE
	if (!lease) return; // someone else owns it
	if (lease.step.execution_generation !== job.generation) return; // stale. fenced.

	const { root, step } = lease;
	const signal = abortOn([lease.expiry, cancelWatch(root.id), stepTimeout(step)]);
	const inputs = await loadArtifacts(step.input_artifact_ids); // PACKETS
	const agent = AGENT_REGISTRY[step.run_template];
	const surface = agent.readOnlyToolSurface(step.allowed_ops, step.scope_mode);
	//              ▲ read-only BY CONSTRUCTION. a write op reaching here is a
	//                WorkflowSafetyViolation — a bug, not a runtime decision.

	await emit(root, 'step_started', { step_run_id: step.id, label: step.label });

	let messages = [
		agent.systemPrompt(step), // goal, non_goals, acceptance criteria
		contextMessage(inputs) // ArtifactEnvelopes. NOT transcripts.
	];
	let spentUsd = 0,
		toolCalls = 0,
		pass;

	for (let round = 0; round < agent.maxRounds; round++) {
		throwIfAborted(signal);
		if (spentUsd > step.budgets.max_cost_usd) break;
		if (toolCalls > step.budgets.max_tool_calls) break;

		// reservation via the EXISTING ledger: reserve per call, settle after
		pass = await provider.stream({
			messages,
			tools: surface,
			signal,
			spendLimit: reservationFor(step, spentUsd)
		});
		spentUsd += pass.usage.totalCostUsd;
		await renewLease(lease); // long steps keep the lease

		if (pass.finish === 'tool_calls') {
			const results = await executeReads(pass.toolCalls, { signal });
			toolCalls += pass.toolCalls.length;
			messages.push(pass.assistant, ...compact(results)); // tool-payload-compaction
			await emit(root, 'step_progress', { step_run_id: step.id, round, toolCalls });
			continue;
		}
		break;
	}

	// specialists return STRUCTURE, not prose. prose is the root's job.
	const result = AgentResultSchema.parse(pass.structured);

	// acceptance runs in CODE wherever a validator exists
	result.acceptance_results = await evaluateAcceptance(step.acceptance_criteria, result, {
		evaluation_source: 'runtime'
	});

	// ONE transaction: result + artifacts + usage + budget settle. No partial step.
	await db.transaction(async (tx) => {
		const stored = await tx.upsertArtifacts(result.artifact_drafts, {
			produced_by_run_id: step.id,
			attempt: step.attempt // UNIQUE → idempotent
		});
		await tx.update(step, {
			status: result.status,
			result,
			metrics: metricsOf(pass),
			finished_at: now()
		});
		await settleBudget(tx, root, { reserved: step.budgets.max_cost_usd, actual: spentUsd });
		await emit(tx, root, 'step_finished', {
			step_run_id: step.id,
			status: result.status,
			summary: result.summary, // ≤ MAX_SUMMARY_CHARS (1_000)
			artifact_ids: stored.map((a) => a.id)
		});
	});

	await queue.enqueue('flow_tick', { run_id: root.id }); // ◄ wake the orchestrator
}
```

What a step does **not** do: decide what happens next, write prose to the user,
mutate user data, or read another step's transcript.

---

## 10. Context management

The guide names this as the key challenge of hierarchical systems. The rules:

1. **Agents exchange packets, never transcripts.** A step's input is
   `ContextPacket` / `ArtifactEnvelope` — provenanced facts, excerpts, refs,
   `as_of`. No step sees another step's message list.
2. **The root's context does not grow with fan-out width.** It holds the
   objective, the WorldCard, artifact _summaries_, and one digest per stage
   (≤ 4k tokens). Ten specialists cost the root the same as two. **This is the
   entire reason to fan out.**
3. **Hard caps, already written** in `contracts/limits.ts`:
   `MAX_SUMMARY_CHARS 1_000`, `MAX_EXCERPT_CHARS 12_000`, `MAX_ARRAY_ITEMS 50`,
   `MAX_ARTIFACT_PAYLOAD_BYTES 256KB`, `MAX_DIGEST_TOKENS 4_000`. Lower
   `MAX_STEPS_PER_STAGE` 20 → ~6.
4. **Artifacts pass by id.** A step declares `input_artifact_ids` and gets
   exactly those rows.
5. **Reuse `tool-payload-compaction.ts`** in each specialist loop. The guide
   suggests capping tool responses ~25k tokens; we already compact.
6. **Durability is the memory tool.** The guide recommends _"memory tools [that]
   let your agents store and retrieve information outside the context window
   through file-based systems that persist across sessions."_ `flow_artifacts`
   is that, and it's queryable.

---

## 11. Writes — the invariant that makes this safe

**Specialists never write. Ever.**

- A specialist's op surface is read-only by construction, not by instruction
  (`scope_mode: 'read_only'`, `allowed_ops` narrowed).
- Specialists return `artifact_drafts` and _proposed_ operations as data.
- If the run should change the user's projects, drafts become a `change_set`
  and enter the existing reviewed path — the same one both
  `projectLoopWorker` (_"does NOT mutate the project — proposed changes are
  replayed by the web app on user approval"_) and the chat contract lane
  already use.

Consequences worth stating out loud:

- Flow inherits the security fence, the reviewer, the write ledger, effect
  idempotency, and compensating cleanup **for free**.
- Parallel steps can never conflict on shared state. The guide's whole "when to
  avoid parallel workflows" section stops applying to us.
- Exactly one place in the codebase mutates user data. That stays true.
- Review happens **once, over the whole run's proposal** — not per step. One
  approval surface for the user, not six.

---

## 12. Pause is a state, not a failure

`agent_runs.status` already has `paused | needs_input | proposal_ready`, and the
stranded sweep already knows never to re-drive a run parked for the user. Two
things are missing and both are small:

1. **The `interaction` port** (§2) — so a question knows where to surface.
2. **A TTL on `needs_input`** — auto-settle to `partial` after N days keeping
   artifacts, plus a "waiting on you" surface. Without it a `deferred` run parks
   correctly and waits forever, correctly, holding a capacity slot.

What that unlocks, once the planner exists:

- _"I found three ways to structure this. Which one?"_ — mid-run, with the
  research already done and paid for.
- **Approval gates on expensive stages.** `WorkflowStageSpec.decision_gate` is
  already a field. A stage about to spend $0.30 on deep research asks first.
- **Genuinely long work.** A run can wait for tomorrow's calendar, an email
  reply, or a document the user hasn't written yet.

---

## 13. Budget is the governor

No wall clock means **money and patience** are the limits, so they have to be
real. The good news: `agentRunCostLedger.ts` already implements the hard part.

- **Reserve before spend, settle after.** Reserve at wave materialization; a
  wave that doesn't fit the remaining budget is refused → `complete_partial`.
  Overrun is not representable.
- **Estimate before starting.** Above a floor, tell the user roughly what the
  run costs and how long, before it opens. The guide's 10-15x multiplier is the
  product's cost structure, not a footnote.
- **`trigger` sets the default ceiling, not the engine's behavior.** A `chat`
  run can spend more (the user asked and is waiting). A `scheduled` run gets a
  tighter automatic cap plus a per-user daily ceiling, because nobody opted in
  per-run.
- Caps: `maxStages ~8`, `maxReplans 2`, `MAX_STEPS_PER_STAGE ~6`,
  `MAX_AGENT_FANOUT ~4`, `MAX_ATTEMPTS 2` per step.
- **Separate capacity from chat.** `flow_step` gets its own queue concurrency
  and its own `providerCapacity` entry. Chat's pool is
  `MAX_AGENTIC_CHAT_CONCURRENCY = 2` — do not share it.

---

## 14. Observability

Nearly free, because the event log **is** the execution record rather than
commentary on it.

- `flow_events` append-only, totally ordered per run
  (`UNIQUE (run_id, sequence_index)`). Replaying it reconstructs the run: UI
  stream, audit trail, and debugger in one table.
- **One step = one `agent_runs` row = one trace**, with
  `agent_tool_executions` underneath it (already built: args, result, timing,
  tokens, gateway op, proposed-change linkage).
- **`forcedTransitions` vs `transitionModelCalls` is the single best health
  metric.** High forced share = policy is doing the work; low share = we're
  paying a model to state the obvious. The existing engine already counts both.
- Prompt dumps (`AGENTIC_CHAT_LOCAL_PROMPT_DUMPS`) get a `step_key` segment.
- Roll cost to the root and surface it in `/admin`. **Measure** the 10-15x
  multiplier; don't assume it.
- A run detail page — stage DAG, per-step status/cost/duration, artifacts,
  transition decisions with reasons — is the debugging tool. It's also the demo.

---

## 15. Failure and liveness

Most of this is `agentRunStrandedSweep.ts`, which already does it correctly.

| Failure                           | Mechanism                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Worker dies mid-step              | Lease expiry → re-enqueue on stable dedup key, `attempt + 1`. Existing sweep, generalized                                      |
| Step legitimately fails           | `status = 'failed'`; stage `join_policy` + `failure_policy` decide                                                             |
| Step hangs on a provider          | Step `budgets.wall_clock_ms` + lease expiry backstop                                                                           |
| Duplicate delivery                | Lease is a conditional UPDATE keyed on status **and** `updated_at`; loser exits. Artifacts `UNIQUE (step, attempt, draft_key)` |
| Late result after replan          | `execution_generation` fence                                                                                                   |
| Two ticks race                    | `SELECT ... FOR UPDATE` on the root row. Non-negotiable                                                                        |
| Coordinator parks and never wakes | Already the sweep's explicit case: a parked deep-research root gets re-driven through a DB guard RPC                           |
| Cancel mid-run                    | `cancel_requested_at` → ticks stop materializing, in-flight steps abort at round boundaries, bounded drain, artifacts kept     |
| Poison step                       | `MAX_ATTEMPTS 2` → `failed` → `failure_policy`                                                                                 |
| Budget blown                      | Reserve-before-spend makes it unreachable; belt-and-braces check at tick entry                                                 |
| `needs_input` never answered      | **The one genuinely missing piece:** TTL → `partial`, artifacts kept (§12)                                                     |

---

## 16. The roster

`run_template` is today `'agent' | 'deep_research'`. Flow turns it into a
registry. Start with four; two already exist in `packages/agent-orchestrator`.

| agent_id     | Exists?                                                            | Does                                                                                     | Ops                       |
| ------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------- |
| `librarian`  | ✅ `agents/librarian/deterministic-librarian.ts`                   | Builds a `ContextPacket` from project data. **No model call.** Free, fast, usually first | direct reads              |
| `researcher` | ✅ `agents/researcher/researcher.ts` (+ prod `webResearchPort.ts`) | Web search + visit → provenanced facts                                                   | `web.search`, `web.visit` |
| `drafter`    | ▲ new                                                              | Packets → `artifact_drafts` (doc, plan, task set)                                        | read-only ontology reads  |
| `critic`     | ▲ new, mostly code                                                 | Runs `machine_checkable` acceptance; judgment only where unavoidable                     | none                      |

Then the project loop's four lenses become four more templates
(`lens_drift`, `lens_outdated_docs`, `lens_task_conflicts`, `lens_doc_org`) by
wrapping the existing generators — no new prompts needed for WP-1.

Explicitly **not** in the roster: a "committer" or "scheduler" agent. Writes
stay in the reviewed lane (§11).

`librarian` being deterministic matters more than it looks: WP-0 can prove the
entire engine with **zero** model calls.

---

## 17. Prototype slice

The claim to test: **a planned fan-out of narrow specialists beats one agent
doing serial work — measurably, on real BuildOS data, at a token multiple we're
willing to pay.**

**WP-0 — The engine, zero intelligence.**
`flow_stages`, the DAG columns, the `flow_tick` lane, the tick, wave
materialization, lease reaping. Drive it with a **hardcoded** two-wave stage of
fake steps that sleep and return canned `AgentResult`s. Prove: waves schedule,
joins fire, `kill -9` recovers, ticks are idempotent, events order correctly,
cancel drains. **No model calls.** This is the work that makes everything after
it boring.

**WP-1 — Parallelize the project loop. ◄ START HERE for real traffic.**
Wrap the four existing generators as templates and run them as one
`best_effort` wave instead of four sequential awaits. Still no planner — the
stage is hardcoded. Same outputs, same suppression, same inbox sync, same
review UI. **Measurable win: ~4x wall-clock cut on the loop's slowest phase.**
Proves the scheduler on production traffic with near-zero product risk, and
`delivery` gets its first real implementation (`project_suggestions`).

**WP-2 — Let the model declare the stage.**
Planner emits a `WorkflowStageSpec`; validate, compile, layer. Bounded repair
round. Now decomposition is real, and the loop can skip lenses a project doesn't
need. **Measure: how often is the first-try DAG legal?** That single number
decides whether this architecture is viable.

**WP-3 — The transition gate.**
`legalTransitions` + forced-vs-model + `append_stage`. Measure the forced share.

**WP-4 — Chat entry + `live` interaction.**
`open_flow_run` as the fourth disposition; `delivery: chat_session`; questions
streaming inline. Now both entry points are real and the ports have proven they
abstract the right thing.

**WP-5 — `needs_input` TTL + the "waiting on you" surface.**
The missing half of pause (§12). Cheap once WP-0 exists, and it's the demo.

**WP-6 — Drafts into the reviewed write lane.**
`change_set`. Where it stops being a research toy and starts changing projects.

**WP-7 — Acceptance validators.**
A real `validator_id` registry (entity exists, date in range, field non-empty,
citation resolves). Turns acceptance from vibes into a gate.

**Gate to keep going:** a side-by-side on ~10 real multi-domain requests
(`pnpm agentic:gate` battery style) where Flow beats the single-agent lane on
answer quality at a cost multiple we accept. If it's 12x the tokens for a 10%
better answer, the honest outcome is to keep the single agent and add Skills
instead — literally the guide's own advice: _"before scaling to multi-agent
systems, consider whether adding specialized skills to your single agent might
achieve your accuracy requirements more efficiently."_

---

## 18. Open forks

**F1 — Generalize `agent_runs`, or greenfield?** _The one that decides the size
of this._

- **(a) Generalize (recommended).** Root and steps are `agent_runs` rows;
  `flow_stages` is the only new table. Inherits cost ledger, stranded sweep,
  capacity slots, inbox sync, fencing, `trigger`. Cost: touching
  safety-critical liveness code, and `orchestration_state` /
  `DEEP_RESEARCH_CHILD_COUNT` are deep-research shaped.
- **(b) Greenfield `flow_*` tables.** Clean semantics, no risk to a running
  system, but you re-earn reserve/settle accounting, liveness recovery, capacity
  accounting, and inbox integration — which is where the real bugs live.

**F2 — Who speaks to the user.** Root-only prose, with specialists emitting
structured results + labeled progress, vs. specialists streaming their own text.
_Recommend root-only_ — the guide's "full orchestration" variant, and it avoids
the doubled-reply class already fixed once in chat.

**F3 — The money.** A real per-run `max_cost_usd` by `trigger`, plus a per-user
daily ceiling. And: above what estimate do we show the user the cost first?

**F4 — Naming.** `flow_*` and "run / stage / step". BuildOS already has
"Project Loops", "Agent Runs", and "workflow" in use — "run" is now overloaded
three ways. Worth settling before migrations land.
