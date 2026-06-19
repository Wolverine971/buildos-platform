<!-- apps/web/src/lib/tests/test-onto-project-creation-writer.md -->

# Writer Tests — moved

These tests were expanded beyond project creation and split into a per-project folder:

➡️ **[`onto/writer/`](./onto/writer/README.md)**

| File                                                                                     | What it covers                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`onto/writer/01-create-project.md`](./onto/writer/01-create-project.md)                 | Project creation (comprehensive + minimal + clarify-when-vague)                                                                                       |
| [`onto/writer/02-tasks.md`](./onto/writer/02-tasks.md)                                   | Follow-up: create & update tasks, incl. the "do the work, don't make a task" boundary, duplicate avoidance, and partial/props-merge updates           |
| [`onto/writer/03-documents-and-recall.md`](./onto/writer/03-documents-and-recall.md)     | Follow-up: create a document, then **answer a question by reading it** (search → outline → read), with hallucination / "not in the doc" failure modes |
| [`onto/writer/04-goals-milestones-risks.md`](./onto/writer/04-goals-milestones-risks.md) | Follow-up: goals, a publishing milestone timeline, and a risk audit                                                                                   |

See [`onto/README.md`](./onto/README.md) for the structure and conventions. The other personas
(`test-onto-project-creation-developer.md`, `-designer.md`, `-event-planner.md`, `-researcher.md`,
`-business-owner.md`) still live as flat creation-only files and are next to migrate into
`onto/<persona>/`.

> Note: the old version of this file referenced a `create_onto_requirement` tool that does not
> exist. The new tests model "requirements" as milestones/goals/risks instead.
