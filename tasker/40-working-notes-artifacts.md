<!-- tasker/40-working-notes-artifacts.md -->

# 40 — Working notes / artifacts: durable intermediate memory

> **DJ DIRECTION 2026-07-26 (constrains every design below): START HERE freshness must be
> MECHANICAL and CHANNEL-AGNOSTIC.** His reasoning, near-verbatim: a project gets updated through
> the agentic chat, manual edits in the project, someone's third-party agent (OpenClaw / Claude /
> Codex via the agent-call gateway), and loops — "there are multiple ways a project could be
> updated, so the START HERE document does need to be asynchronously updated... it should be
> partially updated from this running log... this should be more mechanical." Consequence: the
> refresh trigger is project ACTIVITY from any source (the activity substrate already records all
> four channels), the owner is asynchronous (the project-loop family, not a chat-side behavior),
> and the running log is an input to START HERE, not a chat artifact. Chat-side floors (Research
> Log, stated-future capture) stay as deterministic FEEDERS.
> **Measuring stick:** `project-catchup-cold` e2e scenario (added 2026-07-26) — a cold session
> must deliver an accurate catch-up past a stale START HERE. If the read side already passes,
> the async refresh is an efficiency play; if it fails, this build is the fix.
>
> **MEASURED 2026-07-26 (night): 3/3 PASS.** (An earlier 0/3 was instrument error — the seed
> description leaked the premise and the anti-parrot check punished surfaced contradictions;
> both fixed before the verdict run.) The cold agent reads the live surfaces, reports the fresh
> facts (proposal sent / waiting on reply / monthly decided), and does not repeat stale claims
> as current. **Verdict: the async refresh is NOT needed for agent-side catch-up correctness.**
> What it still buys, and why this tasker stays open at lower priority: the HUMAN-facing START
> HERE document itself remains stale on screen — the agent compensates, the UI does not. Build
> the mechanical channel-agnostic refresh for the human surface when prioritized; agent
> correctness no longer depends on it.

**Created 2026-07-25.** DJ:

> "The artifacts are the same idea as a scratch pad in my mind... Scratch pad for notes is like
> progress notes. It needs to be **created, read from, edited**, and all done very well. We need to go
> deep into this, and it needs to **plug in elegantly into this flow**."

**Type:** Design-first. Exit condition is a decided contract + integration points, then a build.
Do not start with a migration.

**Why it matters beyond research capture:** BuildOS's pitch is that it holds your context so you
don't have to. Today an agent turn can learn six things and persist none of them. Research capture
(fixed 2026-07-25, 4/5) proved the _behavior_ is reachable; this makes the _place_ real.

---

## 1. THREE FINDINGS THAT CONSTRAIN THE DESIGN — read before designing

### 1.1 A scratch pad already exists. It is task-scoped and write-mostly.

Not hypothetical, shipped:

- A document linked to a **task** by an edge with `props.role === 'scratch'`
  (`api/onto/tasks/[id]/documents/+server.ts:119`), default `type_key: 'document.task.scratch'` (`:223`).
- A **promote** endpoint already exists — `api/onto/tasks/[id]/documents/[documentId]/promote`,
  transitioning FSM state (default → ready). The capture-then-promote lifecycle is already modeled.
- `fetchTaskDocuments` / `createTaskDocument` / `promoteTaskDocument` in
  `lib/services/ontology/task-document.service.ts`.

**Do not build a parallel system.** The question is whether to widen this one or supersede it.

### 1.2 Scratch content is DELIBERATELY EXCLUDED from agent context — this breaks "read from"

`ontology-context-loader.ts:641`:

```ts
return !typeKey.includes('scratch') && !typeKey.includes('workspace');
```

The same exclusion is repeated in at least five more places (`edges/available`, `edges/linked` ×2,
`entity-linked-helpers`, `task-linked-helpers`) and the task UI filters `role === 'scratch'` out of
the workspace list.

**So the existing scratch pad is write-only from the agent's perspective.** DJ's requirement is
"created, **read from**, edited." Today, an agent that writes a note can never read it back — the
note is invisible to every context path. Any design that reuses `type_key: *scratch*` inherits this
and silently fails the core requirement.

This is the single biggest decision in the tracker: **the exclusion exists for a good reason** (scratch
content is noisy and would pollute project context). Re-including it naively re-creates context rot,
which the research dossier documents as actively harmful — _Lost in the Middle_: 53.8% mid-context vs
a 56.1% closed-book baseline. Retrieval must be **deliberate and budgeted**, not "unfilter it."

### 1.3 "Scratchpad" is already a loaded word in the prompt — and means the opposite

`build-lite-prompt.ts:64` instructs the model:

> "use assistant content only for final user-visible prose, **never reasoning, scratchpad, prompt
> analysis, rubric checks**, or tool-result bookkeeping"

And `stream-orchestrator/assistant-text-sanitization.ts` actively strips "scratchpad leakage."

In this codebase **scratchpad currently means "model reasoning that must never surface."** Telling
the agent to "save findings to your scratchpad" collides head-on with an instruction telling it
scratchpad content must never reach the user.

**Recommendation:** do not use "scratchpad" in any prompt text or tool name. Use **working note** /
**progress note** user-facing (DJ's own phrase), and **artifact** as the typed internal name.

---

## 2. The contract already exists and has the right shape

`packages/agent-orchestrator/src/contracts/artifact.ts` — written, validated, and backed by an
**empty `src/artifacts/` directory**. `ArtifactEnvelope`:

```
schema_version, artifact_type, artifact_version, run_id, producer_step_id,
supersedes_artifact_id, summary, payload, provenance[], created_at
```

Why this is the right shape for DJ's ask rather than a coincidence:

| DJ's requirement                    | Field that serves it                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| "see what was learned **per step**" | `producer_step_id` + `created_at` — append-only entries, not one mutable blob                          |
| "**edited**... done very well"      | `artifact_version` + `supersedes_artifact_id` — edit is supersession with lineage, so history survives |
| "read from"                         | `summary` is separately addressable from `payload` — cheap to list, expensive to open                  |
| research capture                    | `provenance[]` already carries source URLs                                                             |

The `summary`/`payload` split is the key to §1.2: **list summaries in context (cheap), fetch payloads
on demand (expensive).** That is how retrieval gets budgeted instead of unfiltered.

`ArtifactDraft` (no identity/lineage) vs `ArtifactEnvelope` (storage-assigned) is already the
create-vs-stored split.

---

## 3. Open design decisions — these need DJ

### D1. Storage: widen `onto_documents`, or a new table?

- **Widen documents.** Reuses RLS, edges, promote, the tree, and the UI. Cost: notes become documents,
  and every "list documents" surface must learn to exclude them (the §1.2 filter problem, now
  everywhere).
- **New `agent_artifacts` table.** Clean separation, native `artifact_version`/`supersedes` lineage,
  no pollution of the document tree. Cost: new RLS, new UI, new retrieval path, and a second place
  "knowledge" can live — which cuts against the ontology being the single source of truth.

Leaning: **new table.** Documents are user-authored deliverables; notes are agent working memory with
different lifecycle, different noise profile, and different retrieval rules. Conflating them is what
produced the six-place exclusion filter already in the codebase.

### D2. Scope: what does a note attach to?

Existing scratch is task-scoped only. Research usually happens at **project** or **global** scope.
Minimum: `project_id` nullable + optional `entity_ref` (task/document/goal). Decide whether a
session-scoped note (chat session, no project) is allowed — it is the common case for global chat.

### D3. Retrieval: how does the agent read notes back without re-creating context rot?

Options, cheapest first:

1. **Summaries only, budgeted** — N most recent note summaries for the active project injected into
   context (~a few hundred tokens), payloads fetched via a tool.
2. **Tool-only** — `list_working_notes` / `read_working_note`; nothing in the base prompt. Zero
   passive cost, but relies on the model choosing to look — and the measured `skill_load` rate is
   **1 call in 10 turns**, so "the model will look" is not a safe assumption.
3. **Situational injection** — inject note summaries only when the turn looks like continuation of
   prior work. Ties directly to the
   [prompt-instruction architecture audit](../docs/architecture/agent-first-orchestration/PROMPT_INSTRUCTION_ARCHITECTURE_AUDIT_2026-07-26.md)'s
   situational-blocks design.

Leaning: **1 + 2 together.** Summaries passively (so the agent knows notes exist), payloads by tool.

### D4. Write trigger: deterministic capture, or model-authored?

- **Deterministic** — after a turn with ≥2 research calls, the server writes a note containing
  queries, URLs, and result snippets. Cannot fail, needs no model call, always fires.
- **Model-authored synthesis** — better prose, costs a call, and **can be skipped**, which is the
  exact failure mode that cost an evening on 2026-07-25.

Recommendation: **capture deterministically, synthesize opportunistically, promote on demand.**
The deterministic write is the floor; synthesis is an upgrade applied to an already-safe record.

### D5. Edit semantics

`supersedes_artifact_id` implies append-with-lineage rather than destructive update. Confirm that is
what DJ means by "edited," or whether notes are mutable in place with history discarded. This
determines whether a note is a log or a living document — and DJ's "progress notes" framing suggests
**log**.

### D6. Promotion

The task promote endpoint is the precedent. A note promoted to a real `onto_document` should carry
its provenance forward. Decide: does promotion consume the note (moves) or copy it (note remains as
the audit trail)? DJ's "audit trail" language on 2026-07-25 argues for **copy**.

---

## 4. Where it plugs into the flow

| Integration point                     | What happens                                                          |
| ------------------------------------- | --------------------------------------------------------------------- |
| `stream-orchestrator` post-research   | D4 deterministic capture fires after a turn with ≥2 research calls    |
| Research-budget `must_synthesize`     | Already fixed to allow one capture write; a note write satisfies it   |
| `research_capture` skill              | Currently unreachable (see §5); it should target notes, not documents |
| `shouldRepairResearchNoPersist` floor | A successful note write should clear the floor                        |
| Context loader                        | D3 summary injection, budgeted                                        |
| Agent Runs / worker                   | `run_id` + `producer_step_id` are already in the envelope             |
| `/today` + Project Review             | Notes are the raw material for "what changed" and review passes       |

---

## 5. Hard constraint carried from tracker 39

**`activation: always_on` is a dead enum.** Present in `skill.schema.ts`, parsed by
`markdown-skill.ts`, echoed in `skill_load` and `skill-search` payloads — **no runtime code acts on
it.** All 52 runtime skills are `progressive`; across 10 instrumented turns the model issued exactly
one `skill_load`.

**Anything that must hold every turn has two homes today: the base prompt, or code.** A note-writing
rule that lives only in `research_capture` will not fire. D4's deterministic capture is the design
response to this, not a belt-and-braces extra.

---

## 6. Exit condition

1. D1–D6 decided and written down.
2. A contract exists — either `ArtifactEnvelope` adopted as-is or a documented delta from it.
3. Retrieval budget named in tokens, with the §1.2 exclusion either kept-and-bypassed-deliberately or
   removed with a stated reason.
4. Naming settled (§1.3) and applied consistently across prompt, tools, and UI.
5. `document-from-vague-description` passes **5/5** with `--retry=0` — currently 4/5, where the
   remaining failure is a model choice a deterministic capture removes.
6. A second scenario exists asserting a note written in one session is **read back in a later one**.
   Without it, "read from" is untested and §1.2 will silently regress.

---

## 7. Related

- `packages/agent-orchestrator/src/contracts/artifact.ts` — the contract; `src/artifacts/` is empty
- `apps/web/src/routes/api/onto/tasks/[id]/documents/` — the existing task scratch pad + promote
- `apps/web/src/lib/services/ontology-context-loader.ts:641` — the exclusion that blocks read-back
- `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/research_capture/SKILL.md` — written, unreachable
- [Prompt-instruction architecture audit](../docs/architecture/agent-first-orchestration/PROMPT_INSTRUCTION_ARCHITECTURE_AUDIT_2026-07-26.md) — situational instruction blocks; D3 depends on it
- `docs/architecture/agent-first-orchestration/research/SYNTHESIS.md` §3 — why unbudgeted retrieval hurts
