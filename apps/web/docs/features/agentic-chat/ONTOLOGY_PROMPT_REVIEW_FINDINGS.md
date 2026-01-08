<!-- apps/web/docs/features/agentic-chat/ONTOLOGY_PROMPT_REVIEW_FINDINGS.md -->

# Ontology Prompt Review: Findings and Status

**Date:** 2026-01-07
**Last updated:** 2026-01-07
**Purpose:** Verify prompt alignment with ontology relationship specs and capture remaining risks.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Prompt Coverage](#current-prompt-coverage)
3. [Resolved Findings](#resolved-findings)
4. [Remaining Risks and Options](#remaining-risks-and-options)
5. [Validation Checklist](#validation-checklist)
6. [References](#references)

---

## Executive Summary

- The happy-path hierarchy, start-simple guidance, and anti-inference rules are now in the prompts.
- The create_onto_project tool definition now requires entities + relationships and includes minimal examples.
- Tool-system documentation reflects strict schema rules and the start-simple philosophy.
- Remaining: progressive structuring levels are still only in specs, and the manual prompt tests below are not run in this review.

## Current Prompt Coverage

### Data Model Overview (planner prompts)

- Includes the happy-path containment hierarchy and flexible skips.
- Reinforces start-simple guidance for new projects.

Source: `apps/web/src/lib/services/agentic-chat/prompts/config/planner-prompts.ts`

### Project Creation Workflow (context prompts)

- Anti-inference rules for goals, tasks, plans, milestones.
- relationships required even when empty; clarifications must include empty arrays.
- No FSM-level technical rules in the prompt (the resolver handles them).

Source: `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts`

### Tool Definition (create_onto_project)

- Language changed to “extract what the user explicitly mentioned.”
- Minimal examples included for single-goal, goals+tasks, and goals+plans cases.
- Entities + relationships required even if empty.

Source: `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts`

### Tool System Docs

- Documented strict schema (entities + relationships only) and start-simple philosophy.

Sources:

- `apps/web/docs/features/agentic-chat/tool-system/DOCUMENTATION.md`
- `apps/web/docs/features/agentic-chat/tool-system/QUICK_REFERENCE.md`

## Resolved Findings

- Missing hierarchy diagram in prompts: resolved in planner prompts.
- No start-simple guidance: resolved in planner + context prompts and tool docs.
- Technical FSM details in prompts: removed from context prompts.
- No minimal examples: added to create_onto_project tool definition.
- “Infer as much as possible” language: replaced with “extract explicitly mentioned.”

## Remaining Risks and Options

- Progressive structuring levels (Seed/Emerging/Structured/Mature) remain spec-only. Consider adding a brief summary to planner prompts if you want explicit threshold guidance in the LLM.
- No automated prompt regression tests were run in this review; consider adding snapshot tests if prompt drift becomes a problem.

## Validation Checklist

Manual tests to run (not executed in this review):

| Prompt                                                                                     | Expected result                                      | Status  |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------- |
| "I want to learn Spanish"                                                                  | project + 1 goal, no tasks                           | pending |
| "Start a side project to build a habit tracker"                                            | project + 1 goal, tasks only if actions are explicit | pending |
| "Plan my wedding with venue search and guest list"                                         | project + 1 goal + 2 plans (venue, guests)           | pending |
| "Help me brainstorm ideas for my podcast"                                                  | no project (conversation only)                       | pending |
| "Create a project to launch my product by February with a marketing phase and sales phase" | project + 1 goal + 2 plans + milestone               | pending |

## References

Specs and philosophy:

- `docs/specs/PROJECT_ONTOLOGY_LINKING_PHILOSOPHY.md`
- `docs/specs/ONTOLOGY_RELATIONSHIP_FSM_SPEC.md`
- `docs/specs/ONTOLOGY_AUTO_ORGANIZATION_SPEC.md`

Agentic chat docs:

- `apps/web/docs/features/agentic-chat/PROJECT_CREATION_FLOW_UPDATE_PLAN.md`
- `apps/web/docs/features/agentic-chat/tool-system/DOCUMENTATION.md`
- `apps/web/docs/features/agentic-chat/tool-system/QUICK_REFERENCE.md`
