<!-- docs/specs/PROJECT_ONTOLOGY_LINKING_PHILOSOPHY.md -->

# Project Ontology Linking Philosophy

## Purpose

Define rules and heuristics for how the agent links ontology entities so project graphs stay navigable, with minimal early inference and increasing structure as projects grow.

## Research notes (existing docs)

- docs/examples/george-washington-revolutionary-war-project.md: key design principle is a deeply nested graph; tasks connect to plans or milestones, not directly to the project.
- docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md: canonical containment edges are project -> has_plan -> plan and plan -> has_task -> task. project_id answers ownership; edges answer how connected.

These sources emphasize nested graphs; this doc standardizes the linking policy and the agent workflow.

## Philosophy

1. Keep the project as a root index, not a task bucket.
2. Favor container nodes for scale and scanning: goals, plans, milestones, documents.
3. Minimize inference early; use reversible scaffolding.
4. Use edges for meaning; rely on project_id for ownership only.
5. Increase structural strictness as the project grows.

## Core containment rules

- Direct project links allowed: goals, plans, documents, risks, decisions.
- Milestones are sub-goals and must always be linked to a goal (goal -> has_milestone).
- Tasks should be linked to a container node: milestone (preferred), plan, goal (if no plan), or a neutral Backlog plan.
- Documents are not task parents by default; use references or implements edges for task -> document.
- Outputs should be produced by tasks (task -> produces -> output).
- Dependencies, blockers, subtasks are always edges between tasks, not props.
- Risks and decisions should attach to the most specific affected entity (task, plan, milestone, or goal). Only link to project if impact is truly global.

## Progressive structuring levels

Level 0: Seed

- Use when project has 1 to 5 tasks and low certainty.
- Create project + Backlog plan if any tasks exist.
- Do not infer goals unless user states an explicit outcome.

Level 1: Emerging

- Trigger: 6+ tasks, multiple themes, or mention of phases, milestones, or deadlines.
- Propose goals and 1 to 3 plans.
- Reparent existing tasks into plans; leave unknown tasks in Backlog.

Level 2: Structured

- Trigger: 16+ tasks, multiple milestones, or explicit deliverables.
- Enforce that new tasks must attach to a plan or milestone.
- Create goals for stated outcomes; link tasks to goals via contributes_to.

Level 3: Mature

- Trigger: 40+ tasks or long timeline.
- Require plan or milestone for every task.
- Encourage goal -> milestone -> plan -> task chains.

## Linking decision order for tasks

1. Milestone if task is time or event bound.
2. Plan if task is part of a phase or workstream.
3. Goal if task is directly about the outcome and no plan exists.
4. Backlog plan as default.
5. Project direct link only if user explicitly asks for a flat structure.

## Milestones as sub-goals

- Every milestone must have a parent goal (goal -> has_milestone).
- If a milestone appears before a goal exists, create a scaffold goal (is_scaffold: true) and ask for confirmation.
- Milestones can own plans or tasks, but their semantic parent is always a goal.

## Risks and decisions (semantic placement)

- Risk: link to the entity it threatens (goal, milestone, plan, task). Use project only for cross-cutting risk.
- Decision: link to the entity it resolves or commits to. If it determines a milestone or plan, link there first.
- Preferred edge patterns:
  - entity -> has_risk -> risk
  - entity -> has_decision -> decision
  - decision -> resolves -> risk (optional when explicitly stated)

## Simple linking system for the agent

Goal: keep reasoning lightweight and avoid deep inference while still producing a coherent graph.

### Step 1: Bucket by intent (single-pass)

Assign each item to one of five buckets using surface cues:

- Outcome: goals, success criteria, end states.
- Checkpoint: milestones, dates, launch markers.
- Plan: phases, workstreams, sprints, approaches.
- Work: tasks, actions, to-dos.
- Evidence: documents, notes, assets.
- Risk/Decision: explicit risks, blockers, commitments.

### Step 2: Attach to the nearest semantic parent

- Milestone -> Goal (required)
- Plan -> Goal (if plan is a path to a goal), else Project
- Task -> Milestone or Plan; if neither exists, Backlog plan
- Document -> Entity it describes (task/plan/goal), else Project
- Risk/Decision -> Most specific impacted entity

### Step 3: Scaffold instead of inferring

- If a required parent is missing, create a scaffold node with {is_scaffold: true, confidence: low}.
- Ask one clarifying question if more than one parent is plausible.
- Avoid inventing new goals/plans unless the user states an explicit outcome or phase.

### Step 4: Enforce thresholds

- Once Level 1+ triggers, auto-create a Backlog plan if it does not exist.
- Once Level 2+ triggers, block creation of new tasks without a container.

## Tool-calling simplification

To reduce cognitive load, prefer a small, repeatable tool sequence:

1. create_entities: create goals, milestones, plans, tasks, risks, decisions, documents in a single batch.
2. link_entities: apply parent-child edges using a constrained schema: {from_kind, from_id, rel, to_kind, to_id, reason}.
3. annotate_scaffolds: mark low-confidence nodes for review.

If only one tool exists, the payload should accept:

```json
{
  "entities": [{ "kind": "goal|milestone|plan|task|risk|decision|document", "title": "...", "props": {} }],
  "links": [{ "from": "entity_id", "to": "entity_id", "rel": "has_goal|has_milestone|has_plan|has_task|has_risk|has_decision|references|produces", "reason": "short" }],
  "scaffolds": ["entity_id"]
}
```

This keeps the LLM focused on three steps: create, link, mark.

## Agent guardrails

- Ask when uncertain; do not infer goals or plans from a single vague task.
- Use scaffold containers with props {is_scaffold: true, confidence: low}.
- Avoid creating many direct project -> task edges.
- If direct project -> task edges exist, migrate them into plans once triggers fire.
- Keep edge types canonical: has_plan, has_goal, has_milestone, has_document, has_task, has_risk, has_decision, contributes_to, depends_on.

## Implementation notes

- Project ownership still uses project_id on tasks; the linking policy only affects edges.
- Update migration and agent linking rules to prefer plan -> has_task.
- Add UI signals: loose tasks count, structure recommended prompt when thresholds hit.
- Log agent decisions with confidence to allow undo or user review.

## Open questions

- Should the Backlog plan be created automatically or only after first task?
- Should a single task be allowed to exist without any container if the user opts into flat mode?
