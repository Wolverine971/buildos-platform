<!-- apps/web/src/lib/tests/onto/writer/README.md -->

# Writer / Author — Ontology Agentic-Chat Tests

**Persona**: novelist / author
**Templates**: `writer.book`, `writer.blog`, `writer.article`
**Project under test**: _The Last Ember_ (a fantasy novel)

This suite walks one project through its real lifecycle: create it, then live inside it — adding
and updating tasks, writing documents, and asking the agent questions it must answer by reading
those documents.

## Files

| File                                                             | Operation                                 | Entry context               |
| ---------------------------------------------------------------- | ----------------------------------------- | --------------------------- |
| [`01-create-project.md`](./01-create-project.md)                 | Create project + initial graph            | `project_create`            |
| [`02-tasks.md`](./02-tasks.md)                                   | Create & update tasks (+ negative cases)  | `project`                   |
| [`03-documents-and-recall.md`](./03-documents-and-recall.md)     | Create docs, then **answer from them**    | `project`                   |
| [`04-goals-milestones-risks.md`](./04-goals-milestones-risks.md) | Goals, milestones, risks, publishing plan | `project` / `project_audit` |

Run them in order — each file assumes the fixture below already exists.

## Shared fixture (created by `01-create-project.md`)

Follow-up tests use these placeholders. In a real run, substitute the IDs returned by `01`.

**Project**

- `{{PROJECT_ID}}` — _The Last Ember_, `type_key: project.creative.book` (the `writer.book`
  _template_ is what the agent searches for; the stored project `type_key` is a `project.*` key),
  state `active`

**Plans**

- `{{PLAN_WORLDBUILDING}}` — "World Building" (active)
- `{{PLAN_CHARACTER}}` — "Character Development" (active)
- `{{PLAN_CHAPTERS}}` — "Chapter Outlines" (draft)

**Goals**

- `{{GOAL_DRAFT}}` — "Complete first draft" (`goal.outcome`)
- `{{GOAL_MAGIC}}` — "Develop magic system" (`goal.learning`)

**Tasks** (initial)

- `{{TASK_BACKSTORY}}` — "Develop the protagonist (the young blacksmith)" → `{{PLAN_CHARACTER}}`
- `{{TASK_MAGIC}}` — "Design the magic system for forging weapons" → `{{PLAN_WORLDBUILDING}}`
- `{{TASK_KINGDOM}}` — "Map out the kingdom" → `{{PLAN_WORLDBUILDING}}`
- `{{TASK_OUTLINE}}` — "Outline the first three chapters" → `{{PLAN_CHAPTERS}}`

**Documents**

- `{{DOC_OVERVIEW}}` — "The Last Ember — Project Overview" (`document.context.project`) — has the
  premise; grows over the suite.
- `{{DOC_PROTAGONIST}}` — created in `01` as an empty stub "Character Profile — Protagonist"; the
  author names the protagonist **Elena** and fills it in `03.1`.
- `{{DOC_MAGIC}}` — created in `01` as an empty stub "Magic System"; the author fills the rules in
  `03.2` and it becomes "Magic System — Living Steel".
- `{{DOC_KINGDOM}}` — created in `03.3` ("Kingdom — Emberhold"); does **not** exist until then.

> **Canon is author-supplied, never invented by the agent.** Nothing is named at creation: the `01`
> prompt gives only a premise (a young female blacksmith who forges magical weapons). The
> protagonist's name **Elena** + her orphan/raised-at-the-forge backstory come from the author in
> `03.1`; the magic system **living steel** and its **memory cost** from `03.2`; the kingdom
> **Emberhold** from `03.3`. These author-supplied facts are the ground truth the recall tests
> (`03` §B) check against — and the create test (`01`) explicitly fails the agent for inventing any
> of them early.

## Conventions

- `[today]` = the date the test is run (suite was authored 2026-06-18; absolute dates use 2026).
- Tool argument blocks show only the arguments that matter for the assertion; omitted optional
  args are fine.
- ✅ = pass criteria, ❌ = anti-pattern / failure mode.
