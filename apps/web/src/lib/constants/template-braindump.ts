// apps/web/src/lib/constants/template-braindump.ts
/**
 * Shared textual guidance for ontology template brain dumps.
 * Mirrors the requirements captured in
 * apps/web/docs/features/ontology/TEMPLATE_BRAINDUMP_PROMPT_SPEC.md
 * so prompts and inline helper copy stay consistent.
 */

export const TEMPLATE_TAXONOMY_SUMMARY = `
AUTONOMY MATRIX
- Autonomous entities: project, plan, document, goal, task (hybrid). They need independent type keys because they can be templated, filtered, and instantiated outside a single project.
- Project-derived entities: requirement, metric, milestone, risk. They typically inherit meaning from the project; only request a new taxonomy when the schema truly diverges.
- Reference/system entities: facet definitions, edges, assignments, permissions. They are structural and never receive templates.

TYPE KEY PATTERNS
- project → {domain}.{initiative}[.{variant}]
- plan → plan.{type}[.{variant}]
- document → document.{type}
- goal → goal.{type}
- task → task.{type} (optional, only when the task is reusable outside one project)
- risk → risk.{type} when different schemas are required, otherwise inherit.

FACETS VS TYPE KEYS
- Type key answers "What is this entity fundamentally?"
- Facets answer "How does this instance show up?" using context (who/perspective), scale (size/complexity), and stage (lifecycle position).
- Never redefine the entity in facets; they simply layer perspective on top of the type key.

QUALITY GATES
- If user insists on a project-derived entity receiving its own type key, capture why inheritance is insufficient (\${type_key_override_reason}).
- Highlight any open questions or missing inputs needed before finalizing the template.
`.trim();

export const TEMPLATE_BRAINDUMP_OUTPUT_CONTRACT = `
STRUCTURED PLAN CONTRACT
{
  "scope": "plan | project | document | goal | task | requirement | metric | milestone | risk",
  "entity_category": "autonomous" | "project_derived",
  "realm": "string or null",
  "type_key": "domain.initiative[.variant]",
  "type_key_rationale": "string",
  "type_key_override_reason": "string or null",
  "metadata": {
    "name": "string",
    "summary": "string",
    "keywords": ["string"],
    "exemplar_use_cases": ["string"]
  },
  "facet_defaults": {
    "context": ["string"],
    "scale": ["string"],
    "stage": ["string"]
  },
  "fsm": {
    "states": [{"key": "slug", "label": "string", "initial": boolean, "final": boolean, "description": "string"}],
    "transitions": [{"from": "state_key", "to": "state_key", "on": "trigger", "label": "string", "description": "string"}]
  },
  "schema": [
    {"field": "string", "type": "string", "required": boolean, "description": "string"}
  ],
  "open_questions": ["string"]
}

Always respond with \${structured_plan} plus the suggestion lists.
`.trim();
