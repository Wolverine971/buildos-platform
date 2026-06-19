<!-- apps/web/src/lib/tests/onto/README.md -->

# Ontology Agentic-Chat Test Suite (per-project structure)

These are **manual / LLM-eval spec tests** for the ontology agentic-chat system. Each test
describes a user turn, the tool calls the agent _should_ make, and what makes the response
correct or incorrect. They are not executable `*.test.ts` files (yet) — they are the source of
truth that a future LLM test runner converts into assertions.

## Why subfolders

The original suite was one flat file per persona (`test-onto-project-creation-*.md`), and every
file was almost entirely about **project creation**. Real usage is mostly _follow-up_ work inside
a project that already exists: adding tasks, updating tasks, writing documents, and asking
questions the agent must answer by **reading** project context rather than guessing.

So each project/persona now gets its own subfolder. Within it, tests are split by the **operation
being exercised**, and they share one **fixture** (a single project created in `01-*`) so that
follow-up tests can reference stable entities.

```
onto/
  README.md                  ← you are here (conventions)
  writer/                    ← worked example (fully built out)
    README.md                ← suite index + shared fixture state
    01-create-project.md     ← creation (project + initial entities)
    02-tasks.md              ← follow-up: create & update tasks (+ negative cases)
    03-documents-and-recall.md ← follow-up: create a doc, then answer FROM the doc
    04-goals-milestones-risks.md ← follow-up: planning entities
  developer/   designer/   event-planner/   researcher/   business-owner/
    (to migrate from the flat test-onto-project-creation-*.md files)
```

`writer/` is the model. The other personas still live as flat files one level up and should be
migrated into this shape as they get follow-up coverage.

## What every test case must specify

1. **Entry context** — `context_type` (`global` | `project_create` | `project` | `project_audit`)
   and, for follow-ups, the `entity_id` (project being worked in).
2. **User input** — the literal message the user types.
3. **Expected tool calls** — exact tool names and the arguments that matter. Use real tool names
   (see "Tool reference" below); do not invent tools.
4. **Pass criteria** — the observable facts that make the turn correct.
5. **Fail / anti-patterns** — what a _wrong_ agent does. A test without a failure mode is weak.

The last two are the point. "It created a task" is not a good test. "It created exactly one task,
linked to the World Building plan, and did **not** also create a duplicate of the existing Chapter
3 task" is a good test.

## Tool reference (real tools, verified against source)

Write tools (`ontology-write.ts`):
`create_onto_project`, `create_onto_task`, `create_onto_goal`, `create_onto_plan`,
`create_onto_milestone`, `create_onto_risk`, `create_onto_document`, `create_task_document`,
`update_onto_task`, `update_onto_project`, `update_onto_goal`, `update_onto_plan`,
`update_onto_milestone`, `update_onto_risk`, `update_onto_document`,
`link_onto_entities`, `tag_onto_entity`, `move_document_in_tree`, plus the `delete_*` family.

Read tools (`ontology-read.ts`):
`search_project` (primary in-project search), `search_all_projects`, `search_ontology`,
`search_onto_tasks` / `search_onto_documents` / `search_onto_projects` / etc. (type-scoped),
`get_onto_project_details`, `get_onto_task_details`, `get_onto_document_details`,
`get_document_tree`, `get_document_path`, `get_document_outline`, `read_document_section`,
`list_onto_tasks` / `list_onto_documents` / etc., `get_entity_relationships`,
`get_linked_entities`.

> ⚠️ There is **no** `create_onto_requirement` tool. The old flat files reference it — it does not
> exist. `requirement` is only a _search type filter_. Model constraints as `onto_risks`,
> milestones, or project/doc props until a requirement-write tool ships.

## The document-recall flow (the important one)

When the user asks a question whose answer lives in a project document, the correct chain is:

1. `search_project(project_id, query)` — find candidate docs (returns snippets, not bodies).
2. `get_document_outline(document_id)` — cheap TOC scan to confirm relevance + find the section.
3. `read_document_section(document_id, anchor)` — pull only the relevant section.
   (Or `get_onto_document_details` when the whole short doc is needed.)
4. Answer **grounded in what was read**, and reference the document.

A failing agent answers from chat memory / its own prior generation, dumps the entire document,
or fabricates a detail the document does not contain.
