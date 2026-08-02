<!-- docs/technical/agentic-chat-book-writing-eval-2026-07-29.md -->

# Agentic Chat Book-Writing Journey — First Executable Baseline

- Date: 2026-07-29
- Scenario: `book-writing-journey`
- Runtime: production `/api/agent/v2/stream` path with the normal agentic-chat model selection
- Judge: none; deterministic SSE, tool-call, database, and content checks only
- Command: `pnpm --filter @buildos/web test:agentic:book`

## Outcome

The journey exposed both promising behavior and concrete gaps. One provider-level
attempt failed before writing anything; Vitest's configured retry then completed
all four turns and produced an aggregated checkpoint report.

The completed journey proved that BuildOS can maintain a character sheet over
multiple turns and retrieve book canon in a cold chat. It did not yet produce a
clean, naturally organized book workspace from the opening brain dump.

## What worked

1. **Useful initial decomposition:** the create turn produced six authored
   documents, including dedicated sheets for Mara Venn, Ilyan Rook, Archivist
   Senn, Bellwether, and the emotional spine/themes. It did not collapse the
   entire book into one giant document.
2. **Character continuity:** the second turn updated the existing Ilyan document
   rather than creating a duplicate. Earlier canon (customs role and missing
   brother) survived, and the brass whistle, evidence drawer, and procedural
   stress response were added.
3. **Cross-artifact propagation:** the Chapter 4 turn updated Ilyan's motivation
   and created a usable plot/chapter artifact containing the Chapter 4 choice,
   Mara's mistaken interpretation, the Salt Archive motive, and the Chapter 5 /
   Part II handoff.
4. **No document spray:** the two follow-up canon turns stayed within the
   scenario's document-growth budget.
5. **Cold retrieval:** the new chat read two document outlines and four targeted
   sections across the Ilyan and story artifacts. It did not depend on prior chat
   history.
6. **Option restraint and grounding:** the cold turn left durable documents
   unchanged, presented at least three distinct options, and grounded the answer
   in multiple established Ilyan/plot facts.

## Product findings

### P0 — Weak-model latency can prevent the workspace from being created

The first full scenario attempt exhausted two 60-second LLM-pass attempts before
the first tool call:

- 38,034 reasoning characters received
- 319 assistant-text characters received
- 0 tool calls
- terminal error after roughly 120 seconds

The model had already stated the right intent, but continued reasoning instead
of emitting `create_onto_project`. This is a reliability and cost problem for
large brain dumps, independent of document quality.

The successful retry also needed a final-synthesis retry after the cold retrieval
turn hit the same 60-second boundary. Retrieval completed quickly; response
finalization was the slow segment.

### P1 — The opening turn did not persist a plot/chapter reference artifact

The initial six-document set covered characters, setting, theme, and the managed
project context. The three-part structure was represented as milestones instead
of a plot/outline document. A dedicated `Plot Outline & Story Beats` document
only appeared after the later Chapter 4 turn.

For the intended book workflow, the opening brain dump should leave the author
with a durable story-structure surface immediately, even if it is only a light
scaffold.

### P1 — Document hierarchy stayed flat

All opening documents remained at the root of `onto_projects.doc_structure`.
The names were sensible, but there were no groupings such as Characters,
World/Setting, or Plot & Structure. This is the clearest miss against “the
structure should naturally take place.”

### P1 — The agent invented dates for story parts

The user supplied Part I, II, and III names but no schedule. The create turn
modeled them as milestones and assigned dates approximately three months apart.
That turns narrative structure into fabricated delivery commitments. Parts
should remain undated story structure unless the author supplies a schedule.

### P2 — The plot outline used a product-spec document type

`Plot Outline & Story Beats` was stored as `document.spec.product`. The content
was useful, but the semantic type belongs to a product/software domain and may
degrade filtering, retrieval, or future UI behavior for creative projects.

### P2 — Follow-up writes carried avoidable discovery overhead

The character and plot updates eventually landed, but the turns loaded a
document skill and performed tool discovery despite already having exact
document references and read tools. This did not fail a checkpoint, but it adds
latency and tokens to a workflow that should become cheaper as the project gains
structure.

## Harness correction made from the run

Two initial checkpoint misses were test errors and were corrected:

- The cold turn was originally required to call `search_project`. The project
  knowledge map already supplied exact document IDs, and the agent performed the
  stronger behavior—outline and section reads on both relevant documents—so the
  redundant search requirement was removed.
- Story-document discovery originally matched titles only. The managed project
  context document is a legitimate high-level story source, so
  `document.context.project` is now included before checking whether the actual
  plot/part facts were persisted.

The paid journey was not rerun after these assertion-only corrections. Free
harness tests and the full web type-check passed afterward.

## Recommended next implementation targets

1. Add a creative-project organization policy for the initial create payload:
   character sheets, a high-level plot/story-bible document, a chapter/beat
   scaffold, and deliberate tree placement.
2. Prevent undated narrative parts from being coerced into dated milestones.
3. Add creative document type keys or a safe creative fallback; never route a
   novel outline to `document.spec.product`.
4. Investigate why the default model can spend 60 seconds and tens of thousands
   of reasoning characters before its first tool call. Enforce an earlier
   tool-emission boundary for `project_create` brain dumps.
5. Rerun this exact scenario after each change. The accumulated checkpoints make
   it possible to improve opening organization without losing visibility into
   later canon propagation and cold retrieval.
