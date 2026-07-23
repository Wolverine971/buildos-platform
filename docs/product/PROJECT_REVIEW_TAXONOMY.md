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

## The Implemented Review Pass

The lightweight Project Review path is a bounded pipeline, not an agent loop:

```text
manual / schedule / activity trigger
  -> load bounded project context
  -> build project brief
  -> run four fixed review families
     (document organization, outdated documents, drift, task conflicts)
  -> suppress duplicates, stamp freshness, rotate stale findings, enforce attention budget
  -> persist review items and stop
```

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

## Current Product Gap

The light review pass builds its brief before the four review families run, then combines
their outputs using deterministic suppression and ranking. It does not yet perform a final
semantic synthesis across the generated findings. Complete Project Audit does provide a
holistic evidence-backed synthesis, but at a different depth, cadence, and artifact shape.

The missing light-path layer is tracked in
[`tasker/34-project-review-holistic-synthesis.md`](../../tasker/34-project-review-holistic-synthesis.md):
a final, bounded, cross-family reconciliation that explains what matters now without
turning Project Reviews into an open-ended agent loop or duplicating Complete Project Audit.
