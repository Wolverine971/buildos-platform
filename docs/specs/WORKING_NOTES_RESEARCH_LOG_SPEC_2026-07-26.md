<!-- docs/specs/WORKING_NOTES_RESEARCH_LOG_SPEC_2026-07-26.md -->

# Working Notes / Research Log — Spec

**Date:** 2026-07-26
**Status:** Proposed. One DJ decision open (§8).
**Tracker:** [`tasker/40-working-notes-artifacts.md`](../../tasker/40-working-notes-artifacts.md)
**Supersedes the storage leaning in** tracker 40 §3 D1 (which favored a new table) — see §3.

**The requirement, from DJ:**

> "Scratch pad for notes is like progress notes. It needs to be **created, read from, edited**, and
> all done very well... it needs to plug in elegantly into this flow."

---

## 1. Problem

An agent turn can learn six things and persist none of them. Research capture was fixed at the
instruction layer on 2026-07-25 (1/6 → 4/5), but the remaining 1/5 is a model choice, and forward-carry
("I'm waiting to hear back") is 0/12 — it has nowhere to land at all.

The gap is not compliance. **There is no durable place for intermediate work**, so every fix is a
prompt rule hoping the model writes a full document.

---

## 2. Three constraints discovered before designing

### 2.1 A task-scoped scratch pad exists and is invisible to the agent

A document linked to a task by an edge with `props.role === 'scratch'`, type `document.task.scratch`,
with a working promote endpoint (`api/onto/tasks/[id]/documents/[documentId]/promote`).

But `ontology-context-loader.ts:641` — and five other call sites — filter out any `type_key`
containing `scratch` or `workspace`. **The existing scratch pad can be written but never read back.**
Reusing a `*scratch*` type key silently fails DJ's "read from" requirement.

The exclusion is correct on its own terms: scratch content is noisy, and unbudgeted retrieval is
documented as actively harmful (`research/SYNTHESIS.md` §3 — _Lost in the Middle_: 53.8% mid-context
vs a 56.1% closed-book baseline). The fix is a different type key, not removing the filter.

### 2.2 "Scratchpad" already means the opposite thing in this codebase

`build-lite-prompt.ts:64` tells the model to never emit "reasoning, **scratchpad**, prompt analysis"
into assistant content, and `assistant-text-sanitization.ts` strips "scratchpad leakage."

**Never use "scratchpad" in prompt text, tool names, or user-facing copy.** Use **Research Log**
(the record) and **working note** (an entry).

### 2.3 `activation: always_on` is a dead enum

Parsed and echoed, acted on nowhere. All 52 runtime skills are `progressive`, and across 10
instrumented turns the model issued exactly **one** `skill_load`.

**Anything that must hold every turn lives in the base prompt or in code.** This is why §4 capture is
deterministic rather than skill-driven.

---

## 3. Decision: a per-project Research Log document

Adopting the [prompt-architecture audit](../architecture/agent-first-orchestration/PROMPT_INSTRUCTION_ARCHITECTURE_AUDIT_2026-07-26.md)
§5 decision over tracker 40's "new table" leaning. Reasons:

- It does not couple a shipping fix to `packages/agent-orchestrator/src/artifacts/`, which is an
  empty directory in a package the chat runtime does not consume.
- **`document.knowledge.research` is not caught by the §2.1 exclusion filter**, so read-back works
  with zero new retrieval plumbing.
- Project context already loads **document highlights (cap 10)** with bodies fetched on demand via
  `get_document_outline` / `read_document_section`. That is exactly the summary-in-context /
  payload-on-demand split this needs — for free.
- Promotion is already a normal chat request ("turn this into a real doc"), needing no new infra.

If agent-first artifacts are ever built, Research Log rows are the obvious migration source.

---

## 4. The three operations

### 4.1 Create / append — deterministic, cannot fail

**Trigger:** a turn whose web research calls ≥ 2 — the condition `shouldRepairResearchNoPersist`
already computes in `finalization-runner.ts`.

**Actor:** the server, at finalization. **No model call.**

**Behavior:** lazily create (or find) a `document.knowledge.research` document titled **"Research
Log"** in the focused project, and append one entry:

```markdown
## 2026-07-26 · <triggering user message, trimmed to 140 chars>

- Queries: "competitor pricing scheduling", "acuity pricing 2026"
- Visited: https://… , https://…
- Findings: <one-line snippet per source>
- Unresolved: <what was searched for and not found, when derivable>
```

Deterministic capture is the floor. The model's own synthesis (§4.4) is the upgrade.

### 4.2 Read — already works, but must be verified

The Research Log appears in project document highlights by title; the agent opens it with
`get_document_outline` / `read_document_section`.

**This is the operation most likely to silently regress** (§2.1 is exactly that failure, already
shipped once). It needs its own e2e scenario — §9 item 3.

### 4.3 Edit — append-only, with an explicit compaction pass

Entries are **appended, never rewritten**. "Edit" for a log means supersession, not mutation:
correcting an entry appends a correction referencing the original.

This is where `ArtifactEnvelope`'s `supersedes_artifact_id` shape is right in spirit even though the
storage differs — history survives, which is what an audit trail means.

### 4.4 Synthesis and promotion — model's job, unchanged

The existing prompt rule and `research_capture` skill keep steering the model to write the _good_
document. When it does, the deterministic entry still appends and cross-links it. Promotion is a
normal chat request.

---

## 5. The growth problem — not addressed by the audit

An append-only log grows without bound, and it permanently occupies one of the **10** project
document-highlight slots. Left alone it becomes the context-rot bomb §2.1's filter was defending
against.

Required, not optional:

- **Entry cap:** keep the most recent N entries inline (start N = 20); older entries roll into a
  `Research Log (Archive)` document, which is _not_ highlighted.
- **Byte cap:** hard cap the live log (start 24 KB). Rotation triggers on whichever cap trips first.
- **Per-entry cap:** one entry is at most ~600 chars. A research turn that wants more should be
  writing a real document, which is what §4.4 is for.
- **Idempotency:** one entry per `stream_run_id`. A repair round must not double-append — the
  finalization path can run more than once per turn.

---

## 6. Data model

No migration. Reuses `onto_documents` + `onto_edges`.

| Field        | Value                                                                   |
| ------------ | ----------------------------------------------------------------------- |
| `type_key`   | `document.knowledge.research` (deliberately **not** `*scratch*` — §2.1) |
| `title`      | `Research Log` / `Research Log (Archive)`                               |
| `project_id` | the focused project                                                     |
| edge         | standard project→document edge; **no** `role: 'scratch'` prop           |

Global-context turns (no focused project) have no home. **Scope v1 to project context**; global-scope
capture is deferred, not silently dropped — see §8.

---

## 7. Integration points

| Point                           | Change                                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `finalization-runner.ts`        | after the repair checks, deterministic append (§4.1)                                                                                               |
| `shouldRepairResearchNoPersist` | a successful log append **counts** as a durable write and clears the floor                                                                         |
| `research_capture` skill        | add to `tools/domains/catalog.ts` web-research domain — it is absent, so sensing can never rank or preload it (independent bug found in the audit) |
| `build-lite-prompt.ts`          | no new bullet. The mechanism replaces the rule; §2.3 is why                                                                                        |
| `/today`, Project Review        | Research Log entries are raw material for "what changed"                                                                                           |

---

## 8. Open decision for DJ

**Auto-created "Research Log" documents will appear in projects without the user asking.** Three
options:

| Option                                  | Trade                                                                                                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Always auto-create** (audit's rec) | Simplest, always captures. Adds a doc the user didn't ask for                                                                                                   |
| **B. Capture only on repair**           | Smallest footprint — log appears only when the model failed to save. But the 4/5 turns that _did_ save leave no per-step trail, which is the thing DJ asked for |
| **C. Timeline record, not a document**  | Cleanest separation, no doc-tree pollution. More work, and **loses read-back** — the timeline is not in agent context, re-creating §2.1                         |

**Recommendation: A.** It is the only one that satisfies "created, read from, edited" for every
research turn. B gives up the per-step trail; C gives up read-back, which is the requirement that has
already been silently broken once.

Also open, lower stakes: whether global-context turns get a user-level Research Log or stay
project-only in v1 (§6).

---

## 9. Exit conditions

1. ~~`document-from-vague-description` passes **5/5**~~ — **this exit condition was wrong and is
   withdrawn.** It assumed deterministic capture would remove the scenario's remaining failure. It
   does not: that scenario asserts the _model_ authored a real, structured pricing document, while
   capture writes a raw log of queries and URLs. Capture guarantees research is not **lost**; it
   does not make the model write a good document. Those are different properties.

    That scenario is model-bound and stays so. Measured 2/5 after this work vs 4/5 before, but the
    comparison is not clean: one of the three failures was an infrastructure stream error, the
    assertion got legitimately **stricter** (see §9.1), and n=5 cannot separate that from variance.
    No mechanism links capture to the model's in-turn behavior — capture runs _after_ the stream
    resolves and each run seeds a fresh project, so no Research Log exists while the model is
    deciding.

2. Log append is idempotent per `stream_run_id`, verified by a unit test that runs finalization twice.
3. **A new e2e scenario proves read-back**: a note written in one session is retrieved in a later,
   cold session. Without this, §4.2 is untested and §2.1 regresses silently.
4. Rotation verified: exceeding the entry or byte cap produces an archive document and leaves the
   live log under cap.
5. Full suite green; run every scenario **≥5×** with `--retry=0` — the agentic config defaults to
   `retry: 1`, which at a 40% failure rate reports green ~84% of the time.

### 9.1 A system-written document must never satisfy an assertion about model output

Found the hard way: the auto-created Research Log landed in the "documents the model created" set,
so a turn that wrote nothing looked like it had written something.

The sharp case is `task-complete-cold-reference`, whose forward-carry check passes when **any** of
four surfaces changed — one being "a new document exists." An auto-captured log on a research-bearing
turn would have flipped that scenario green **while the user's stated next step was still dropped**,
silently retiring a real 0/12 finding.

`excludeSystemDocuments` in `agentic-e2e/harness/assertions.ts` is the guard. Any new scenario that
counts created documents must use it, and any new system-written document must be added to
`SYSTEM_DOCUMENT_TITLES`.

---

## 10. Related

- [`tasker/40-working-notes-artifacts.md`](../../tasker/40-working-notes-artifacts.md) — tracker
- [`PROMPT_INSTRUCTION_ARCHITECTURE_AUDIT_2026-07-26.md`](../architecture/agent-first-orchestration/PROMPT_INSTRUCTION_ARCHITECTURE_AUDIT_2026-07-26.md) §5 — the landing-place decision
- `packages/agent-orchestrator/src/contracts/artifact.ts` — the envelope shape §4.3 borrows from
- `apps/web/src/lib/services/ontology-context-loader.ts:641` — the exclusion filter
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/finalization-runner.ts` — capture point
