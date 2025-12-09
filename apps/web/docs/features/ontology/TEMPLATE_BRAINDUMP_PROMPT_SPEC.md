<!-- apps/web/docs/features/ontology/TEMPLATE_BRAINDUMP_PROMPT_SPEC.md -->

# Template Braindump Prompt Spec

**Last updated:** 2025-11-08  
**Source inspiration:** `thoughts/shared/research/2025-11-08_type_key_taxonomy_brainstorm.md`

This spec outlines how the Braindump modal should brief the LLM when gathering new
ontology template ideas. It operationalizes the “Emerging Ontology Structure” so
the AI consistently captures type keys, facets, and supporting metadata.

---

## Objectives

1. **Reinforce the taxonomy.** Every braindump must explicitly reason about:
    - Whether the entity is autonomous (needs its own type key) or inherits from the project.
    - The correct type key pattern for the selected scope.
    - How facets (context / scale / stage) refine an instance without redefining it.
2. **Collect templating inputs.** Capture everything required to seed
   `TemplateForm`, `FacetDefaultsEditor`, `FsmEditor`, and `SchemaBuilder`.
3. **Educate while capturing.** The modal should echo the ontology principles back
   to the user so they learn the framing as they describe their idea.

---

## Scope Categories

| Category            | Scopes                                                                 | Type Key Pattern                                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autonomous entities | project, plan, output, document, goal, task (optional)                 | project: `{domain}.{deliverable}[.{variant}]`; plan: `plan.{type}`; output: `deliverable.{type}`; document: `document.{type}`; goal: `goal.{type}`; task: `task.{type}` |
| Project-derived     | requirement, metric, milestone, risk                                   | Inherit from project unless schema divergence is justified.                                                                                                             |
| Reference/system    | facet definitions, assignments, permissions (not template scopes here) | No type keys – infrastructure only.                                                                                                                                     |

The braindump flow should always confirm the category first, because it
determines how strictly we enforce type key synthesis.

---

## Conversation Flow Requirements

1. **Scope affirmation**
    - Prompt: “Which scope are we templating: project, plan, output, document,
      goal, task, requirement, metric, milestone, or risk?”
    - Explain whether the scope is autonomous or project-derived, using the table above.

2. **Type key reasoning**
    - Prompt: “For {scope}, the type key template is {pattern}. Describe the intent
      so we can name it precisely.”
    - Output should include:
        ```json
        {
        	"type_key": "deliverable.research_doc.icp",
        	"type_key_rationale": "Autonomous output describing ICP research packets."
        }
        ```

3. **Facet defaults**
    - Remind the user: “Facets describe the specific instance. They do not replace the type key.”
    - Collect zero or more defaults for `context`, `scale`, `stage`.

4. **Realm + domain (if applicable)**
    - Realm is still needed for catalog navigation. Ask for the practitioner’s perspective.
    - For projects, also gather `domain` (`writer`, `founder`) and `deliverable`.

5. **Structural payloads**
    - `metadata`: name, short description, keywords, exemplar use cases.
    - `fsm`: key states + transitions.
    - `schema`: high-level JSON schema (field name, type, description, required flag).

6. **Quality gates**
    - If scope is project-derived and user insists on a new type key, the AI must ask
      why inheritance is insufficient and capture the explanation under
      `type_key_override_reason`.

---

## LLM Prompt Skeleton

````markdown
You are the BuildOS ontology co-designer.

Context:

- Autonomous entities need their own type keys so templates can be reused across projects.
- Project-derived entities usually inherit meaning from the parent project.
- Facets (context / scale / stage) only describe the instance; they never rename the entity.
- Reference: thoughts/shared/research/2025-11-08_type_key_taxonomy_brainstorm.md

Task:

1. Confirm the scope (project, plan, output, document, goal, task, requirement, metric, milestone, risk).
2. State whether it is autonomous or project-derived.
3. Generate the correct type key using the pattern for that scope.
4. Capture metadata, facets, FSM, and schema details supplied by the user.
5. Return a JSON payload matching the contract below.

Output JSON contract:

```json
{
  "scope": "plan",
  "entity_category": "autonomous",
  "realm": "coach",
  "type_key": "plan.onboarding",
  "type_key_rationale": "Reusable onboarding plan for coaching engagements.",
  "type_key_override_reason": null,
  "metadata": {
    "name": "Client Onboarding Plan",
    "summary": "...",
    "keywords": ["onboarding", "coaching"]
  },
  "facet_defaults": {
    "context": ["coach"],
    "scale": ["team"],
    "stage": ["activation"]
  },
  "fsm": {
    "states": [...],
    "transitions": [...]
  },
  "schema": [
    { "field": "milestone", "type": "string", "required": true, "description": "..." }
  ],
  "open_questions": [
    "What metrics prove onboarding success?"
  ]
}
```
````

---

## Modal Updates Needed

1. **Scoped helper copy**
    - When the user selects a scope, show its category, type key pattern, and facet expectations
      (reuse the same copy created for `/ontology/templates/new`).
2. **Structured hints**
    - Add inline hints in the textarea reminding the user of the type key formula for the selected scope.
3. **Validation**
    - After the LLM responds, highlight mismatches (e.g., returning a `deliverable.*` type key while scope is `plan`).
4. **Telemetry hooks**
    - Record whether the AI flagged a project-derived override. This will help determine if we need more taxonomy entries.

---

## Next Steps

1. Implement the UI copy + helper chips inside `BrainDumpModal`.
2. Update the braindump prompt templates to use the skeleton above.
3. Extend result parsing to surface `type_key_override_reason` and `open_questions`.
4. Validate with a few real templates (project, plan, requirement) before rolling out broadly.

Once approved, this spec becomes the contract for the braindump-driven template creation workflow.
