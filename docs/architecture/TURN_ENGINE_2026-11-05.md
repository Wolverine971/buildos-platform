<!-- docs/architecture/TURN_ENGINE_2026-11-05.md -->

# Turn engine: one chat, many project agents (2026-11-05)

**Status:** proposal for DJ. Nothing is built yet beyond the `/lab/chat` prototype
(`apps/web/src/lib/server/thread-chat/`, tasker 151).

**DJ's decision (2026-11-05): not §5.** A new tool doesn't guarantee the model calls it. Keep the
lab's design (plan call → parallel project threads → reply) and make the threads robust: tasker
[152](../../tasker/152-robust-threads.md). §2's ideas still guide the build: threads earn their
own budget, the commit work reuses real chat's write ledger, and the worker comes later.

**Sources:** three read-only code investigations (2026-11-05) covering:

- the worker agent loop;
- the worker workflow lane;
- real chat's writes, Undo and recovery.

Citations below are `file:line` from those investigations.

## 1. The problem

One chat message often touches several projects ("finished the sampler video, push the Priya
email to Friday, what did we decide about uploads?"). Today real chat handles that with one agent
loop that reads everything one item after another and holds one worker slot for the whole time.

The lab proved a better shape:

1. Split the message by project.
2. Run one agent loop per project, in parallel.
3. Apply the safe changes and ask about the unsure ones.
4. Carry what each project used into the next message.

Live numbers from the lab:

- A 2-project message: about 20 s and $0.006.
- A follow-up with carry: about 11 s and $0.0013.

DJ's requirements for the real version:

- **One loop.** Project agents reuse the worker's agent loop; no second bespoke loop.
- **Safety.** Errors, crashes and cancels are handled at least as well as real chat does today.
- **Budgets the agent can grow.** An agent that discovers more work can keep going, within reason.
- **Simple writes.** No complicated new commit machinery.
- **Clean scaling.** Don't drag in extra worker replicas or heavy Supabase traffic.
- **Fast to build.** Days, not weeks; the full system can come later.

## 2. The full design (north star)

This is what a well-funded team would build. **It is not the plan for now;** section 5 is. Its
purpose is to fix the target so the middle version grows toward it rather than away from it.

```
message ──► LEAD AGENT (the normal chat agent loop)
              │ calls explore_project(...) once per project, in one batch → run in parallel
              ├──► PROJECT AGENT  = same agent loop, scoped: one project, read tools only
              ├──► PROJECT AGENT    loop: read → think → read … until done or out of budget
              └──► PROJECT AGENT    returns: answer + citations, PROPOSED changes, questions, carry
              │
              ▼ lead agent writes the reply
            COMMIT (one function, not a service): policy → save or ask → write → undo record
              │
   every step ├──► durable step record (resume after a crash, audit, evals)
              └──► live progress (broadcast only, no database write) → web, phone, MCP
```

### 2.1 Project agents are the same loop, called as a tool (recursion depth 1)

This is the same pattern Claude Code uses for subagents: a lead agent hands a task to a
subagent through a tool call and gets a condensed result back. It is also how Anthropic's
multi-agent research system works.

- The lead agent gets one new read tool, `explore_project(project_id, task, effort?)`.
- **Parallel for free:** when the lead calls it for 3 projects in one response, the worker's
  existing tool-batch graph already runs read tools concurrently (`CHAT_MAX_TOOL_CONCURRENCY=4`).
- **Same loop:** the tool's executor runs the **same provider loop** as the main turn
  (`ProviderTurnState` + `streamActingPass`, `provider/turn-provider.ts:188-243, :357`). It runs
  through a new `prepareChild()` entry point with:
    - a project-agent system prompt;
    - a read-only tool surface;
    - its own budget;
    - the parent's cancel signal.
- **Feasible:** state is already per invocation, so a second copy can run inside a turn.
- **No recursion beyond one level:** `explore_project` is not on the child's tool list.
- **Rejected alternative: each project agent as its own queued turn ("a new worker").**
    - It needs a web-built prompt artifact, a claim, a lease, a finalizer and queue latency for
      every child.
    - A parent waiting on its children while holding a worker slot deadlocks at
      `CHAT_CONCURRENCY=1`.

### 2.2 Walls by data, not by prompt

A project agent gets a `ProjectPinnedAccess` wrapper around the existing read authorization:

- The shared read tools already check access through `context.access` (20 `assertProjectAccess`
  calls, 6 `resolveProjectSummaries` calls).
- The wrapper makes those calls see only project X and throw on any other project id.

The child surface is ontology reads only: no calendar, email, web, workspace or write tools. A
prompt-injected document can't reach another project, and the child has no write tool to misuse.

### 2.3 Budgets: the agent manages its own, inside a shared pool

DJ's pushback was right: the lead agent can't know up front how much a project needs, so it
shouldn't set exact numbers.

- **The lead gives a hint only:** `effort: "quick" | "normal" | "research"`. That sets a
  starting allowance, for example 2 / 4 / 6 rounds.
- **The agent can keep going on its own:** when its last round found something new, the runtime
  grants 2 more rounds without asking anyone, up to a hard ceiling (8 rounds, about 60k
  characters read, 90 s). "Found something new" is judged by real chat's existing stopping rule,
  the context-gathering ledger (`packages/agentic-chat-runtime/src/loop/context-gathering-ledger.ts`).
- **A shared pool per turn:** for example 24 child rounds and 3¢ in total. A greedy agent can't
  starve its siblings. When the pool runs low, every agent gets a "wrap up with what you have"
  round.
- **Or the agent asks:** it can return `needs_more: "the Q3 budget doc"`, and the lead decides
  whether to send a follow-up `explore_project`. That's how one agent's discovery can widen the
  whole job without the lead approving every round.

### 2.4 Commit: one function, mostly built already

A project agent never writes. It returns proposed changes (the lab's decision lines). The lead's
runtime runs one function over them:

```ts
for (const change of proposals) {
	const verdict = policy(change); // save | ask (sure? confirmed? archive/rename? destructive?)
	if (verdict === 'ask') {
		pending(change);
		continue;
	} // kept as data; "yes to 2" saves exactly it
	const tool = toWriteTool(change); // e.g. update_onto_task {id, state: 'done'}
	await mutationExecutor.run(tool, { effectId: id(turn, project, change.n) }); // existing ledger
	undo.record(change.before, change.after); // inverse for Undo
}
```

**What exists today:**

- **Idempotent writes:** a write's effect id is a stable uuid. The ledger refuses a different
  payload for the same id and replays a write that already succeeded instead of writing again
  (`effects/effect-identity.ts:20-61`, `chat_turn_effects`).
- **Crash fences:** every write is checked against the current generation and turn lease
  (`turn/write-fence.ts:13`, `mutation-executor.ts:326`).
- **Proposal cards with Undo:** a card rail with Undo for 7 days
  (`packages/shared-agent-ops/src/chat-cards/proposal-card.ts`).
- **Undo for documents and tables:** guarded against conflicting edits.
- **Change data for the UI:** `affected_entities` on every write event.

**What's missing:**

- One policy point (today it's split across the 3-write floor, the reviewer model and
  per-tool cards).
- "Ask" kept as an approvable pending change; today it's dropped and asked about in prose.
- Undo for task, goal, plan, milestone and risk updates; their receipts have no before-state.

### 2.5 Durable steps and resume

The worker's workflow lane already has the machinery:

- tables for runs, steps and dispatches (`20260914203007_agentic_chat_workflow_v1_storage.sql`);
- fenced step claims, accepted results reused after a crash, re-reading the database after an
  uncertain write;
- per-dispatch cost metering.

It's hard-wired to one read-only, fixed-shape review: step keys are fixed in SQL, there's one
project per run, and it runs its own separate loop. In the full design those tables are
generalized: open step keys, a project per step, a parent step, and a proposals table. A crashed
turn then resumes with the children that already finished.

### 2.6 The rest of the full design

- **Model routing scored live:** speed, errors and cost per zero-retention host, instead of
  hand-edited lists.
- **Cache-friendly prompt order:** stable instructions, tools and project index first.
- **Progressive reply:** each project's answer appears as soon as its agent finishes.
- **Golden-conversation replays in CI:** free, from the lab's replay harness.
- **Shadow runs on real traffic:** compare change sets before switching the default.

## 3. What exists today (inventory)

| Need                                                      | Exists?                        | Where                                                                               | Reuse                           |
| --------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------- |
| Agent loop with tools, stopping rule, forced final answer | yes                            | `provider/turn-provider.ts`, `turn-state.ts`, `forced-synthesis.ts`                 | **as-is**, via `prepareChild`   |
| Parallel read tools in one turn                           | yes                            | tool-batch graph, `CHAT_MAX_TOOL_CONCURRENCY=4`                                     | as-is                           |
| Read tool that runs its own inner loop                    | yes                            | `web_navigate` (Jev-driven)                                                         | pattern to copy                 |
| Project-scoped reads by data                              | yes                            | `context.access` in shared reads                                                    | wrap with `ProjectPinnedAccess` |
| Cancel, lease, 6-min limit, stalled-turn recovery         | yes                            | `turn-lease`, `host/stalled-recovery.ts`                                            | inherited by children           |
| Idempotent writes and crash fences                        | yes                            | effect ledger, write fence                                                          | as-is                           |
| Proposals the user approves, with Undo                    | yes, for 4 kinds               | proposal-card rail                                                                  | extend later                    |
| Undo for docs and tables                                  | yes                            | inverse receipts and revert routes                                                  | as-is                           |
| Undo for task/goal/plan/etc. updates                      | **no**                         | receipts carry the row after the write only                                         | new (later)                     |
| One save-or-ask policy point                              | **no**                         | split across floor, reviewer and cards                                              | new, small                      |
| Durable step checkpoints and resume                       | yes, in the workflow lane only | workflow tables                                                                     | generalize later                |
| Live progress without database writes                     | yes                            | broadcast-only preview channel; `onProgress` (16 per call)                          | as-is                           |
| Carry context between turns                               | lab only                       | `thread-chat-carry.ts`                                                              | port into the child             |
| Per-child usage and billing ids                           | **no**                         | usage id has no child key; parallel children collide (`openrouter/usage.ts:86-110`) | new, small                      |

## 4. Why not just build the full thing

The full design is about 4–6 weeks:

- generalizing the workflow tables;
- mid-turn resume;
- the policy point;
- uniform Undo;
- live provider scoring;
- evals and shadow runs.

Most of that hardens rare paths. Today's traffic is small (742 real chat model calls in 30 days),
and the core value is already visible in the lab. The middle version takes the ideas that cost
little and pay off now, and leaves seams where the rest can slot in.

## 5. The middle version (recommended)

**One sentence:** add `explore_project` as a read tool whose executor runs the same chat loop,
scoped to one project, and have the lead apply its proposals through the existing write ledger.

### 5.1 What it is

1. **`explore_project(project_id, task, effort?)`**, a concurrent read tool in the worker.
    - Its executor calls `prepareChild()`, which reuses `ProviderTurnState`, `streamActingPass`
      and forced synthesis.
    - It runs a small child pump of about 100 lines: run reads, collect the result, throw if a
      write is attempted.
    - Progress lines ("Read Worklist › Group 1") stream through the existing `onProgress`
      channel, broadcast only.
2. **The child prompt and result:** the lab's thread prompt and decision format, moved over
   as-is. The child returns `{answer, refs, proposals[], questions[], carry, needs_more?}` as the
   tool result. That result is already persisted in `chat_tool_executions`, so no new table.
3. **Walls:** `ProjectPinnedAccess` plus an ontology-reads-only child surface.
4. **Budgets:**
    - a starting allowance from `effort`;
    - self-extension while the ledger sees new material, up to the ceiling;
    - a turn-wide pool for children (rounds plus cost);
    - a "wrap up" round when the pool runs low.
5. **Writes:** - The lead's runtime maps each **sure, policy-approved** proposal to the normal write tool.
   It runs through the **existing mutation executor**, with an effect id of `(turn, project,
proposal n)`, so a retry never writes twice. - Archives, renames and unsure changes come back as numbered questions (the lab's rule). - The proposal is kept in the tool result, so "yes to 2" applies **exactly that** change
   instead of the model re-deriving it.
6. **Carry:** the next turn's `explore_project` for the same project reads the last carry for
   that project from the previous turn's tool result. That's tracker 151's working set, with no
   new storage.
7. **Usage ids:** add a `threadKey` to provider requests so parallel children log separate usage,
   billing and prompt-dump rows.
8. **Flag:** `AGENTIC_CHAT_EXPLORE_PROJECT` controls whether the tool is offered. Start with DJ's
   account only.

### 5.2 What it deliberately skips (until it earns it)

| Skipped                     | Why it's OK for now                                                                                                                                                                                                             | When to add                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Mid-turn resume             | Children are read-only, so a crash before any write requeues the turn and reruns them (money only). After a write, today's rule applies: the turn fails with "may already be saved", and the effect ledger stops double writes. | When crash rates or turn lengths make reruns costly                            |
| A separate planner call     | The lead agent picks projects in its opening pass, the way it picks tools today                                                                                                                                                 | If routing quality drops vs the lab's planner (measure with replays)           |
| Generalized workflow tables | Tool results already persist each child's outcome                                                                                                                                                                               | With mid-turn resume                                                           |
| Undo for task/goal updates  | Same as today's real chat                                                                                                                                                                                                       | Next, with the "where things went" UI (it needs a before-snapshot in receipts) |
| Live provider scoring       | The hand list was just refreshed (V4 Flash) and V4.1 already sorts by throughput                                                                                                                                                | When a host degrades and nobody notices                                        |

### 5.3 Size and order

The agent loop investigation estimates about 3 days for a flagged prototype and 6–8 days for
production quality.

| Step                                                                                           | Days | Proves                                                         |
| ---------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------- |
| 1. `threadKey` in usage ids; `prepareChild`; child pump; fixture-client tests                  | 1.5  | the same loop runs as a child, in parallel, with clean billing |
| 2. `ProjectPinnedAccess` + child surface; audit the 14 shared read files for unguarded queries | 0.5  | the walls hold                                                 |
| 3. Port the lab prompt, decision format, budgets and carry into the child; replay tests        | 1    | lab behavior inside the worker                                 |
| 4. Proposal → write mapping through the mutation executor + "yes to N" by proposal id          | 1    | safe saves, no double writes                                   |
| 5. Web admission: offer the tool (flag), Jev tool selector, lead prompt guidance               | 0.5  | it shows up in real chat                                       |
| 6. DJ-only live run (paid, needs OK) + `agentic:prod-battery` (paid, needs OK)                 | 0.5  | no regressions                                                 |

**Total: about 5 working days** to something DJ uses daily in real chat. Steps 1–3 alone (about
3 days) give a read-only version that answers across projects and proposes changes without
saving them.

### 5.4 Risks

- **The lead must choose to fan out.** Without the lab's dedicated plan call, the opening pass
  decides. Mitigations: lead prompt guidance, a tool description that says "use when a message
  touches 2+ projects", and replays comparing against the lab planner.
- **Cost multiplies with projects:** 3 children × about 4 rounds is about 12 more calls per
  turn. The pool cap and `effort` bound it; single-project messages don't fan out.
- **Byte-identical request rule.** The worker README requires structural moves to keep request
  JSON identical. `prepareChild` is additive, so the main turn's requests don't change. Don't
  extract a shared driver yet; that's the riskiest edit and can wait.
- **Unverified:**
    - that every shared read goes through `access` (step 2's audit);
    - that the usage-log table accepts a new pass role;
    - that a hand-built child surface decodes without artifact changes.

## 6. From middle to full, without throwing anything away

- `explore_project` stays the way children are spawned in the full design.
- Proposals in tool results become rows in a proposals table when "ask" needs to outlive a
  session.
- The proposal → write mapping becomes the commit function. Adding a before-snapshot gives
  uniform Undo.
- Tool-result persistence becomes step records once mid-turn resume is worth it, using the
  workflow lane's fencing.
- The lab stays as the free replay harness for every step.

## 7. Decisions for DJ

1. **Middle version as described?** About 5 days, behind a flag, DJ-only first.
2. **Lead picks the projects (no separate plan call)?** It's simpler and reuses the loop, but
   it's a small risk to routing quality. The alternative keeps the lab's fast plan call as a
   step in front of the lead, adding about 1 s and one more model call.
3. **Saves in the first version, or read-and-propose only?** Steps 1–3 (about 3 days) already
   answer across projects and show proposed changes; saving adds step 4.
