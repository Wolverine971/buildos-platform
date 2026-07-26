<!-- docs/architecture/agent-first-orchestration/TIER_1_RESULTS_2026-07-25.md -->

# Tier 1 Breadth — First Scored Run

**Date:** 2026-07-25
**Instrument:** `apps/web/src/lib/tests/agentic-e2e/` (7 new scenarios)
**Model under test:** `deepseek/deepseek-v4-flash` via DeepInfra — the production cheap/weak route
**Scaffold:** `baseline` (fingerprint `1f4697c0bbbd…`), no pinned models
**Environment:** local `vite dev`, hosted Supabase, real model calls
**Run 1 result: 4 passed / 3 failed.** All three failures are product findings, not
harness defects. **Run 2 (after fixes, same day): 1 fixed and verified, 2 confirmed
as real product gaps** — see [Verification run](#verification-run) at the bottom.

> Telemetry caveat: `chat_turn_runs` never finalizes under local `vite dev`, so
> telemetry assertions were soft. Every finding below rests on the SSE stream and
> ground-truth `onto_*` rows, which are authoritative locally.

---

## Failures

### 1. The stated next step never becomes work — `task-complete-cold-reference`

```
[assert] the stated next step ("waiting to hear back") did not become a task.
New tasks this turn: [none]
```

Everything before that assertion passed. Given a dictated, cold message naming a
company that appears only inside a task title, the agent **searched, found, and
closed the right task**, and left the two control tasks untouched. Cold entity
resolution works.

What it did not do is carry the second half of the sentence forward. This is DJ's
own description of the gap, 2026-07-25:

> "It should mark that task done or completed and move on, and should create
> something new about waiting to hear back."

**Still unknown:** whether START HERE gets updated. That assertion is ordered last
and was never reached. It needs a re-run after the follow-up-task gap is fixed.

### 2. "Top priority" moves the task to the _lowest_ priority — `task-multi-update`

```
[assert] 1 of 3 operations from one sentence did not land:
  - clause 3: "Prep system design answers for Halcyon Labs" priority is 5,
    expected 1-2 (seeded at 4)
```

Two of three clauses landed correctly — both "I knocked out X and Y" completions
were applied. The third failed in the most useful possible way.

`onto_tasks.priority` is 1–5 where **1 is highest**. The user said _"the halcyon
prep needs to be top priority now."_ The agent wrote **5**, moving it from 4 to
the bottom of the queue — the opposite of the request, silently, in a turn that
otherwise looked successful.

This is a scale-direction misunderstanding, not a resolution failure: the agent
found the right task and wrote the right field. Likely fixable in the tool schema
description rather than the prompt. Worth checking whether the same inversion
appears anywhere else priority is written.

### 3. Ten tool calls, six web searches, no document — `document-from-vague-description`

```
[assert] expected tool "create_onto_document" to be called; got
[get_document_outline, read_document_section, libri_search_capabilities,
 tool_search, web_search, web_search, web_search, web_search, web_search, web_search]
```

Assistant text opened: _"Let me start by checking what we already know about the
product, then research the pricing landscape."_ It then researched at length and
reported findings **in chat**, producing no artifact.

Two distinct problems stacked:

- **Non-imperative phrasing is read as conversation.** "I think we need to figure
  out the research on X — like a doc about it or something" never says _create_,
  and the agent never commissioned itself.
- **This is the shape of DJ's #1 failure.** He described it as "it'll do a bunch
  of research, and then it fails to deliver the result." Here the turn did
  finalize with text — so `assertNonEmptyAssistantText` would have passed — but
  the _deliverable_ was still dropped. Worth noting the failure survives even a
  correctly finalizing turn, which is why the ground-truth row check matters more
  than the stream check.

---

## Passes — including two that overturn prior assumptions

| Scenario                         | What it establishes                                                                                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity-resolution-misspelled`   | Voice-transcription corruption of a project name (`tacemos` → `Tacemus`) is handled, with a decoy project present. DJ's habit of spelling project names carefully may be a workaround for a problem that no longer exists on this path. |
| `research-turn-finalizes`        | The agent **did** narrate before acting, and did finish with a real answer after multiple tool rounds. The silent-pause complaint is therefore not universal — it needs a narrower repro.                                               |
| `restraint-noop-and-ambiguity`   | Zero writes on a passing mention; on an ambiguous referent it asked **and** named at least two of the three candidate tasks **and** wrote nothing. Confirms DJ's read that spurious writes are rare.                                    |
| `task-reschedule-cold-reference` | Cold resolution plus a date mutation; did not confuse a reschedule for a completion, did not fork a duplicate.                                                                                                                          |

The first two are the reason to keep the passes visible. `entity-resolution-misspelled`
and `research-turn-finalizes` were both written expecting failure, from DJ's
reported experience. They passed. Either the paths improved since he last hit
them, or his repro conditions differ from the scenario in a way worth finding.

---

---

## Verification run

Same day, after fixes. `AGENTIC_SCENARIOS=task-multi-update,task-complete-cold-reference,document-from-vague-description`.
**1 passed / 2 failed.**

### FIXED — priority scale (`task-multi-update` now passes)

Root cause was not a missing hint but an actively **wrong** one:

```ts
// apps/web/src/lib/services/agentic-chat/tools/core/definitions/field-metadata.ts
description: 'Optional numeric priority (1-5). Higher numbers mean more important.',
example: '4'
```

That is backwards — `insight-panel-config.ts:594` renders `priority <= 2` as
`P{n} High`. The metadata taught the model the inverted scale, so "top priority"
produced 5. Corrected there plus two schema sites that said "1-5" with no
direction (`op-execution-gateway.config.ts` create + update,
`ontology-write.ts`). `shared-agent-ops` was rebuilt because the web app resolves
it from `dist`, not source.

All three operations from one dictated sentence now land.

### CONFIRMED GAP — forward-carry hits zero of four surfaces

The assertion was relaxed to DJ's own policy (any ONE of task / document / event /
START HERE). It still fails, with nothing at all:

```
- no follow-up task (new tasks: [none])
- no new document
- no new event
- START HERE unchanged
```

Cold resolution and task closure still work. The half of the sentence describing
the future is simply dropped. Because the bar is now as low as the policy allows,
this is not a strictness artifact — it needs a product change.

### CONFIRMED GAP — six searches, nothing learned

```
[assert] the agent ran 6 research call(s) ([web_search x6]) and persisted none of it.
```

Opening text: _"Let me pull up the Product Overview doc to understand the product
better, and start researching competitor pricing at the same time."_ It narrated
well, read project context, ran six searches, and put every finding in the chat
reply.

Note this turn **finalized correctly with substantial text** — every stream-level
signal looked healthy. Only the ground-truth row check catches it. That is the
argument for keeping L1-style ground-truth checks below any judge.

---

## What to do next

1. ~~Fix the priority scale direction.~~ **Done and verified.**
2. **Make a stated future become a record.** The forward-carry gap is the one DJ
   named unprompted, twice, and it fails the most generous form of his own
   policy. Highest-value remaining fix.
3. **Persist research.** Tie the "learn through each chat" principle to an actual
   write path, with the no-bloat cap already asserted (≤2 new documents).
4. **Narrow the silent-pause repro** with DJ, since the scenario written from his
   description passes.

Both remaining gaps are permanently guarded by assertions
(`task-complete-cold-reference`, `assertResearchPersisted`), so a future fix will
be confirmed automatically rather than assumed.

## Reproducing

```bash
# terminal 1
pnpm dev --filter=@buildos/web

# terminal 2 — subset runner added 2026-07-25; unset AGENTIC_SCENARIOS runs all
AGENTIC_SCENARIOS=task-complete-cold-reference,task-multi-update \
  pnpm --filter @buildos/web test:agentic
```
