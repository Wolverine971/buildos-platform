<!-- docs/technical/project-template-inheritance.md -->

# Project Template Inheritance Notes

_Last updated: 2025-11-12_

This note captures how project templates flow through the ontology system and into `onto_projects`. It is anchored to the current agentic chat `project_create` experience.

## 1. Template Registry (`onto_templates`)

- The template registry is defined in `supabase/migrations/20250601000001_ontology_system.sql:136-209`. Each row stores:
    - `scope`, `type_key`, `name`, `status`, and basic metadata
    - JSON columns for `schema`, `fsm`, `default_props`, `default_views`, `facet_defaults`, `metadata`
    - Optional parent (`parent_template_id`) + `is_abstract` flag for inheritance chains
- Example seed for `developer.app` lives at `supabase/migrations/20250601000001_ontology_system.sql:731-738`. Its `schema` defines fields such as `tech_stack`/`target_platform`/`mvp_date`, but `default_props` is `{}`; no values are supplied unless a caller fills them in.

### Schema vs. Defaults

- `schema` describes the _shape_ of `props` (JSON schema used by creation forms and validators). It does **not** copy values into projects.
- `default_props` holds actual key/value pairs that get merged into entity props during instantiation.
- `facet_defaults` holds contextual defaults (`context/scale/stage`) that also merge at instantiation time.

## 2. Template Inheritance Resolution

- `apps/web/src/lib/services/ontology/template-resolver.service.ts:80-169` walks the parent chain (up to depth 10) and builds a resolved template:
    - `schema.properties` and `schema.required` accumulate from parents to child; duplicates are deduped.
    - `metadata`, `facet_defaults`, `default_props` merge shallowly where leaf overrides parent values.
    - `default_views` and `fsm` are replaced wholesale by the leaf when present.
- `getAvailableTemplates` (`template-resolver.service.ts:256-295`) exposes fully resolved templates to higher layers (UI, agent context, `list_onto_templates` tool).

## 3. Project Instantiation Pipeline

1. **Tool call** – The agent eventually calls `create_onto_project`. The tool executor (`apps/web/src/lib/chat/tool-executor.ts:1023-1085`) turns the LLM payload into a `ProjectSpec`, auto-generates a context document when missing, and POSTs to `/api/onto/projects/instantiate`.
2. **API endpoint** – `/api/onto/projects/instantiate` (`apps/web/src/routes/api/onto/projects/instantiate/+server.ts`) validates the payload against `ProjectSpec` and hands off to `instantiateProject`.
3. **Template merge** – `instantiateProject` (`apps/web/src/lib/services/ontology/instantiation.service.ts:124-212`) loads the active template via `getProjectTemplate` and merges data:
    - `resolvedProjectFacets` merges `facet_defaults` with any user-provided `props.facets`.
    - `mergedProjectProps = mergeProps(template.default_props, spec.project.props)`; nested objects merge recursively.
    - The merged props are written directly into `onto_projects.props` (`instantiation.service.ts:180-189`).
    - A `project --uses_template--> template` edge is recorded so downstream systems know the lineage (`instantiation.service.ts:204-211`).

**Important:** Only `default_props` participate in this merge. Fields that exist only in the template `schema` but lack default values do **not** appear in the final project unless the caller explicitly includes them in `project.props`.

## 4. Implications for Agentic Project Creation

- The agent context for `project_create` surfaces a template overview (names, realms, facet defaults) via `loadTemplateOverview` (`apps/web/src/lib/services/agent-context-service.ts:203-389`). The overview does **not** enumerate template schemas or default prop keys, so the model does not automatically know about template-specific fields such as `mvp_date` or `tech_stack`.
- The only guaranteed inheritance at instantiation time is:
    1. `facet_defaults` → `props.facets`
    2. `default_props` → `props`
- Because most shipped project templates (e.g. `developer.app`) have empty `default_props`, the resulting `onto_projects.props` will contain only whatever the agent supplied (typically facets) unless the LLM fills template-specific keys itself.
- Agents may call `list_onto_templates` to retrieve each template’s `schema`/`default_props`, but nothing in the current prompt stack forces them to read that schema or map its fields into the `create_onto_project` payload.

## 5. How to Ensure Template Fields Appear in Projects

To guarantee `onto_projects.props` carries the template-specific fields:

1. **Seed defaults** – Add representative values to `default_props` for each template when reasonable. They will merge automatically for every instantiation.
2. **Prompting** – Augment the `project_create` planner prompt with template schema summaries so the agent knows which keys to populate, or instruct it to call `list_onto_templates` and mirror every `schema.properties.*.title` in `project.props`.
3. **Validation** – Add post-tool validation that checks the destination project props contain the required schema fields for the chosen template and ask the model to re-run with the missing keys when needed.

Until one of those improvements lands, the current system only persists the props supplied by the agent (plus any defaults stored in `default_props`), and template schemas function solely as documentation/validation for humans.
