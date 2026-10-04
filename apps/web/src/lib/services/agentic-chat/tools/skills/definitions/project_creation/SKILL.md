---
name: Project Creation
catalog_line: 'Turn a user idea into the smallest valid BuildOS project, then add only the goals and tasks the user described.'
description: Project creation playbook with inferred name, type_key, and description, then only the goals and tasks the user described, each created with its own tool.
skill_type: procedure # procedure | reference | strategy | resource | policy | orchestration
altitude: task # task | domain | meta
activation: progressive # always_on | progressive | invoked
preserve_markdown: true
legacy_paths:
    - onto.project.create.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/project_creation/SKILL.md
---

# Project Creation

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Contract → Policy → Knowledge → Related Tools → Examples → Provenance.
  This file is skill_type: procedure at task altitude — the Workflow is the spine, so Procedure carries the weight;
  Judgment holds the two minimality heuristics; Knowledge holds the closed facet vocabulary. It routes to no sibling
  skill (standalone root, no dependencies), so there is no Routing block.

  The project call creates the project and its Context document only: child records are created afterwards with
  their own tools, and project.props admits nothing but facets (the in-product adapter rejects other keys and any
  populated entities/relationships array). That order also works for external agents, so the wording stays
  host-neutral. The turn-contract shape in Procedure step 7 is checked against the worker's real contract
  validator by apps/worker/tests/agenticChatSkillContractExamples.test.ts.
-->

## Identity

Turn a user idea into one new BuildOS project — an inferred name, type_key, description, and optional facets — then add only the goals and tasks the user described, each with its own creation tool. This is a **procedure** skill at **task** altitude: an ordered runbook for the create call and its follow-up records, with a small judgment layer for minimality calls and the closed facet vocabulary in Knowledge.

## Activation

- The chat is in project_create mode
- The user wants to start a new project from scratch
- You need to infer a project name and type_key, plus the few goals or tasks the user described, from a rough idea
- If the chat is already inside a project and the user asks to create/start another project, ask: "You're already in this project. Are you sure you want to create a new project?" Do not call `create_onto_project` until they confirm.

## Judgment

- Project creation is a minimality exercise. Good first payloads are usually smaller than the model expects.
- The most common failures are project fields the create call does not accept (custom props keys) and child records packed into the project call instead of created afterwards.

## Procedure

1. Call `create_onto_project` with the smallest valid payload: project { name, type_key }, entities: [], relationships: []. Child records never go inside this call.
2. Infer project.name from the user message when it is reasonably clear; when the user named the project, use that name exactly as written. Do not ask for a name the user already implied.
3. Infer project.type_key using the project.{realm}.{domain}[.{variant}] pattern (realm: creative, technical, business, service, education, or personal). Pick the simplest accurate classification.
4. Put the concrete details the user gave in project.description. project.props takes only facets (context, scale, stage) from their fixed values; add state_key, start_at, or end_at only when the user stated them.
5. After the call returns project_id, create only the records the user described, each with that project_id: one goal per stated outcome with create_onto_goal, one task per concrete action with create_onto_task.
6. Ask one clarifying question only when the request is too vague to classify at all; otherwise create the project with what you know.
7. If the system holds your writes and asks for a turn contract, the project is one outcome with no label, required_fields, or changes (the create call's arguments carry its values), and each follow-up record is its own create outcome: `{"outcomes":[{"action":"create","entity_kind":"project","minimum_successful_effects":1},{"action":"create","entity_kind":"goal","changes":[{"field":"name","value":"Launch the beta"}],"minimum_successful_effects":1},{"action":"create","entity_kind":"task","changes":[{"field":"title","value":"Book the venue"}],"minimum_successful_effects":1}]}`
8. After the tool results return, summarize the new project briefly and continue in the created project context.

## Contract

The create call always has this shape:

- `project`: `{ name, type_key }`, plus `description`, `state_key`, `start_at`/`end_at`, and `props.facets` only when the user supplied them.
- `entities: []` and `relationships: []`; goals and tasks are created afterwards with their own tools.

After creation succeeds, briefly summarize the new project (name, type, and the goals or tasks created) and continue in the created project context.

Stop conditions before replying: `name` and `type_key` are not blank when inferable; project.props holds nothing but facets; no goal or task was created that the user did not describe; from inside an existing project, the second-project confirmation was asked before any create.

## Policy

- Do not call `create_onto_project({})` or omit the required project payload.
- Do not put goals, tasks, or relationships inside the create call; create them after it returns project_id.
- Do not add props keys other than facets, such as tech_stack or target_word_count; write those details into description.
- Do not leave project.name or project.type_key blank when they can be inferred from the user message.
- Do not add goals, plans, milestones, risks, or documents the user did not mention.
- Do not silently create a second project from inside an existing project chat; ask the confirmation warning first.

## Knowledge

- facets.context is one of personal, client, commercial, internal, open_source, community, academic, nonprofit, startup. (internal-default)
- facets.scale is one of micro, small, medium, large, epic; facets.stage is lifecycle only: discovery, planning, execution, launch, maintenance, complete. (internal-default)
- state_key is planning, active, paused, completed, or cancelled, and is distinct from facets.stage. (internal-default)
- Details such as a software stack, launch budget, venue and guest count, or a target word count belong in description. (internal-default)

## Related Tools

- `onto.project.create`

## Examples

### Create a minimal project from a brief idea

- Infer the project name and type_key from the message.
- Call `create_onto_project({ project: { name: "Backyard Garden Redesign", type_key: "project.personal.home", description: "Redesign the backyard garden before spring." }, entities: [], relationships: [] })`.
- Only ask a clarifying question if the request is too vague to classify at all.

### Create a project with one outcome and a few explicit actions

- Create the project first with empty entities and relationships.
- Then add the stated outcome with `create_onto_goal({ project_id: "<project_id from the receipt>", name: "Launch the beta" })` and one `create_onto_task({ project_id: "<project_id from the receipt>", title: "Book the venue" })` per action the user named.
- Report the project and the records created; do not add records the user did not describe.

## Provenance

- The project call creates the project and its generated Context document; everything else is a separate create. (internal-default)
