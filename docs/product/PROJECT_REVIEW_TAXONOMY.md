<!-- docs/product/PROJECT_REVIEW_TAXONOMY.md -->

# BuildOS Project Review And Loop Taxonomy

**Status:** Canonical terminology
**Adopted:** 2026-07-22

This document governs product copy, new documentation, planning, and architecture
descriptions. It separates three ideas that earlier BuildOS documents sometimes called
"loops."

## Canonical Terms

| Term                       | Meaning in BuildOS                                                                                                                                                                                                     | Use it for                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Project Review**         | The product capability that periodically assesses a project and surfaces a brief, findings, or decisions.                                                                                                              | UI labels, product strategy, customer-facing explanations, and the general feature name.                                                     |
| **Project review pass**    | One bounded execution of the lightweight review worker. A trigger loads project context, builds a brief, runs a fixed set of checks, applies suppression/freshness/attention policy, persists review items, and stops. | A single manual, end-of-day, or activity-triggered run. "Light review pass" is acceptable when contrasting it with a Complete Project Audit. |
| **Project review cycle**   | The larger lifecycle across time: project activity -> review pass -> human decision -> durable update or feedback -> a later review.                                                                                   | Describing the recurring feedback system, including the user's role.                                                                         |
| **Complete Project Audit** | A deeper, less frequent, evidence-backed whole-project assessment with a durable report and bounded follow-ups.                                                                                                        | The existing audit product and architecture. Do not shorten this to "loop."                                                                  |
| **Agent loop**             | Iterative model execution in which the model observes results and chooses another action/tool call until a stop condition or budget is reached.                                                                        | Agentic Chat, Agent Runs, and other genuinely iterative model/tool runtimes.                                                                 |
| **The Loop**               | A possible name for the human practice: capture context, structure it, act in the world, update BuildOS, and return.                                                                                                   | Brand or ritual language only, qualified on first use as a human workflow or practice.                                                       |
| **Review item**            | An evidence-backed finding, proposal, or decision produced by a review pass or audit.                                                                                                                                  | Project Inbox and AI Inbox artifacts.                                                                                                        |
| **Review check/family**    | One bounded evaluator inside a review pass, such as drift or outdated-document detection.                                                                                                                              | Describing the fixed assessments that the worker runs. It is not the name of the whole capability.                                           |
| **Project cleanup**        | The one living change set per project: open review findings, audit recommendations and the freshness radar bundle, shown as one AI Inbox card with Ready to apply / Needs your call / Worth knowing (2026-09-29).      | The inbox card, the chat read (`get_project_cleanup`), and the change set as a whole. See `PROJECT_CLEANUP_CHANGE_SET.md`.                   |
| **Finding lineage**        | One review finding carried across passes: confirmed in place, revised, merged, or closed with a recorded reason.                                                                                                       | Explaining why a finding persists or closed. Internal field: `project_suggestions.lineage_id`.                                               |

## The Implemented Review Pass

The lightweight Project Review path is a bounded pipeline, not an agent loop:

```text
manual / schedule / activity trigger
  -> load bounded project context (plus a compact line per live document and the open cleanup list)
  -> run four fixed review families
     (document organization, outdated records, drift, task conflicts)
  -> suppress what the user already decided, stamp freshness
  -> roll up: carry open findings forward as lineages, close only with a recorded reason
  -> one roll-up synthesis call judges and groups the whole cleanup list
  -> sync the project's one Project cleanup card (attention budget applies) and stop
```

Until 2026-09-29, each pass rotated out the previous pass's unconfirmed findings after 72 hours
and wrote a separate manager brief. Tasker 112 replaced both with the roll-up. See
[`PROJECT_CLEANUP_CHANGE_SET.md`](PROJECT_CLEANUP_CHANGE_SET.md).

The system becomes cyclical only when later user decisions and feedback influence future
reviews. That larger behavior is the **project review cycle**.

## Naming Rules

- Say **"run a project review"** or **"run a review pass,"** not "run a loop."
- Say **"scheduled/background Project Reviews"** when describing the product behavior.
- Use **"Project Review"** for surfaces and **"review item"** for individual findings.
- Use **"review check"** or **"review family"** for one fixed assessment inside a pass.
- Use **"Complete Project Audit"** for the deeper report path.
- Use **"agent loop"** only when observed results can cause the model to choose another
  action within the same run.
- If brand work uses **"The Loop,"** state that it is the human practice or product ritual;
  it is not the Project Review worker and not an agent-execution primitive.

## Legacy And Internal Identifiers

Existing implementation names remain valid when discussing code or data, including
`buildos_project_loop`, `project_loop_runs`, `ProjectLoopWorker`, project-loop routes,
feature flags, directories, and telemetry. Treat these as legacy/internal identifiers,
not as the current product taxonomy. A terminology cleanup does not by itself authorize a
schema, API, queue, or code-symbol rename.

Dated brainstorms, audits, and handoffs may preserve "Project Loops" when quoting the name
used at that time. New conclusions derived from those documents should use the canonical
terms above.

## Cross-Family Synthesis (closed 2026-09-29)

The light review pass now ends with one bounded roll-up call. It reconciles every open finding
across families and across passes: still true or resolved, merges, sections and groups, and the
bottom line. That closes the gap tracked in
[`tasker/34-project-review-holistic-synthesis.md`](../../tasker/34-project-review-holistic-synthesis.md)
(absorbed by tasker 112). It is not an agent loop: one call per pass, with structured output that
code validates. Complete Project Audit stays the deeper, slower report. Its recommendations are
items in the same Project cleanup change set.
