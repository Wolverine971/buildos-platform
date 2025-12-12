<!-- apps/web/docs/features/ontology/TEMPLATE_REMOVAL_PROGRESS.md -->

# Template Removal Progress Tracker

**Started**: December 11, 2025
**Status**: In Progress

---

## Completed Tasks

### Phase 1: Documentation

- [x] Created `TEMPLATE_FREE_ONTOLOGY_SPEC.md` - Core design specification
- [x] Created `TEMPLATE_REMOVAL_MIGRATION.md` - Database migration plan
- [x] Defined standard states per entity type

### Phase 2: Project Pages

- [x] Removed Templates nav link from `/projects/+layout.svelte`
- [x] Deleted `/projects/templates/` directory (7 files)
- [x] Updated `OntologyProjectEditModal.svelte` - removed template prop
- [x] Updated `/projects/[id]/+page.svelte` - removed template={null}
- [x] Updated `/projects/projects-v2/[id]/+page.svelte` - removed template state
- [x] Updated `/projects/[id]/outputs/[outputId]/edit/+page.server.ts` - removed resolver
- [x] Updated `/projects/[id]/outputs/[outputId]/edit/+page.svelte` - use typeKey
- [x] Updated `DocumentEditor.svelte` - removed resolvedTemplate prop

### Phase 3: API Routes

- [x] Deleted `/api/onto/templates/` directory (10 files)

---

## Completed - API Cleanup

### Entity Create APIs (removed template-props-merger)

- [x] `/api/onto/tasks/create/+server.ts`
- [x] `/api/onto/plans/create/+server.ts`
- [x] `/api/onto/goals/create/+server.ts`
- [x] `/api/onto/milestones/create/+server.ts`
- [x] `/api/onto/risks/create/+server.ts`
- [x] `/api/onto/documents/create/+server.ts`
- [x] `/api/onto/outputs/create/+server.ts`

### Output Generation API

- [x] `/api/onto/outputs/generate/+server.ts` - removed template-resolver

### Project APIs

- [x] `/api/onto/projects/[id]/+server.ts` - replaced get_project_with_template RPC
- [x] `/api/onto/projects/instantiate/+server.ts` - updated

### Task APIs

- [x] `/api/onto/tasks/[id]/+server.ts` - removed template fetching

### Graph APIs

- [x] `/api/onto/graph/+server.ts` - removed template fetching
- [x] `/api/onto/projects/[id]/graph/+server.ts` - removed template fetching

### Admin APIs

- [x] `/api/admin/analytics/template-usage/+server.ts` - deleted

---

## Pending Tasks

### Phase 4: Graph Visualization

- [x] Update `/admin/ontology/graph/+page.server.ts`
- [x] Update `graph.service.ts` - remove templatesToNodes
- [x] Update `svelteflow.service.ts` - remove template handling
- [x] Update `g6.service.ts` - remove template handling
- [x] Update `graph.types.ts` - remove template types
- [x] Update `GraphControls.svelte` - remove template filter
- [x] Update `NodeDetailsPanel.svelte` - remove template case
- [x] Remove template SvelteFlow node component
- [ ] Update `/admin/ontology/graph/+page.svelte` (validate view mode/options after backend changes)

### Phase 5: Create Project Flow

- [x] Replace `/projects/create/+page.svelte` with agentic chat redirect
- [x] Update `/projects/create/+page.server.ts` - removed template loading
- [x] Remove Templates link from mobile nav on `/projects/+page.svelte`

### Phase 6: Template Services (DELETED)

- [x] `find-or-create-template.service.ts` - deleted
- [x] `template-resolver.service.ts` - deleted
- [x] `template-crud.service.ts` - deleted
- [x] `template-family-cache.service.ts` - deleted
- [x] `template-validation.service.ts` - deleted
- [x] `template-props-merger.service.ts` - deleted
- [x] `template-catalog-meta.service.ts` - deleted
- [x] `template-analyzer.service.ts` - deleted
- [x] `ontology-template-catalog.service.ts` - deleted
- [x] Updated migration services to remove template dependencies
- [x] Updated core ontology services (instantiation, fsm, agent-context)
- [x] Deleted all template test files

### Phase 7: Agentic Chat

- [x] Remove `list_onto_templates` tool
- [x] Remove `find_or_create_template` tool
- [x] Update `create_onto_project` tool
- [x] Update `tool-definitions.ts`
- [x] Update `tool-executor.ts`
- [x] Update `tools.config.ts`
- [x] Update `project-creation-enhanced.ts` prompt
- [x] Update `prompt-generation-service.ts`
- [x] Remove `TemplateSuggestionCard.svelte`
- [x] Update `AgentChatModal.svelte` - remove template events
- [x] Update `ThinkingBlock.svelte` - remove template activities
- [x] Update `agent-chat.types.ts` - remove template types

### Phase 8: Admin Migration Page

- [x] Removed `useFallbackTemplates` from `/admin/migration/errors/+page.svelte`
- [x] Removed `useFallbackTemplates` from `/api/admin/migration/retry/+server.ts`
- [x] Removed `useFallbackTemplates` from `RetryRequest` interface
- [x] Cleaned up `migration-retry.service.ts` - removed all template parameters

### Additional Cleanup (Post-Phase 8)

- [x] Deleted `src/lib/components/ontology/templates/` directory (13 files)
- [x] Removed TemplateNode export from `graph/svelteflow/nodes/index.ts`
- [x] Rewrote `OutputCreateModal.svelte` - uses hardcoded OUTPUT_TYPES instead of templates
- [x] Updated `OutputEditModal.svelte` - removed ResolvedTemplate import, loadTemplate function, resolvedTemplate prop
- [x] Rewrote `PlanCreateModal.svelte` - uses hardcoded PLAN_TYPES (Sprint, Project Phase, Quarterly Plan, Custom Plan)
- [x] Rewrote `GoalCreateModal.svelte` - uses hardcoded GOAL_TYPES (Project Outcome, OKR, Milestone Goal, Metric Goal)
- [x] Rewrote `TaskCreateModal.svelte` - uses hardcoded TASK_TYPES (Execute, Review, Research, Planning, Meeting)

### Service & FSM Cleanup (Post-Phase 8)

- [x] Deleted `schema-auto-repair.service.ts` - was only for template schema repair
- [x] Deleted `create-doc-from-template.ts` FSM action and test
- [x] Deleted `create-research-doc.ts` FSM action and test (depended on create-doc-from-template)
- [x] Updated `engine.ts` - removed imports and case handlers for deleted actions
- [x] Updated `onto.ts` - removed 'create_doc_from_template', 'create_research_doc' from FSMActionType enum, removed template_key field
- [x] Updated `create-output.ts` - loadOutputTemplate returns null (template query removed)
- [x] Updated `onto-event.service.ts` - resolveTemplate returns null unless snapshot provided
- [x] Updated `batch-task-migration.service.ts` - removed TemplateRow type and template queries
- [x] Deleted SQL template files:
    - `find-missing-templates.sql`
    - `find-missing-templates-simple.sql`
    - `verify-migration-results.sql`
- [x] Updated `LLM_TOOL_INSTRUCTIONS.md` - removed all template references, added standard type_key patterns

### Phase 9: Database Migration

#### Step 1: Remove RPC Dependencies (COMPLETED)

- [x] Created `20251211_remove_template_dependencies_from_rpc.sql`
- [x] Rewrote `get_allowed_transitions` with hardcoded FSM (no template query)
- [x] Updated `get_project_with_template` to return NULL for template
- [x] Dropped `get_template_catalog` function

#### Step 2: Drop Tables/Columns (CREATED - ready to run)

- [x] Created final migration: `20251212_drop_template_system.sql`
- [ ] Run migration to drop `agent_template_creation_requests` table
- [ ] Run migration to drop `template_id` and `template_snapshot` columns from `onto_events`
- [ ] Run migration to drop `onto_templates` table
- [ ] Run migration to drop `onto_template_status` enum

---

## Files Deleted (Final Cleanup) - COMPLETED

```
# Template Services - ALL DELETED
✅ src/lib/services/ontology/find-or-create-template.service.ts
✅ src/lib/services/ontology/template-resolver.service.ts
✅ src/lib/services/ontology/template-crud.service.ts
✅ src/lib/services/ontology/template-family-cache.service.ts
✅ src/lib/services/ontology/template-validation.service.ts
✅ src/lib/services/ontology/template-props-merger.service.ts
✅ src/lib/services/ontology/template-catalog-meta.service.ts
✅ src/lib/services/ontology/template-analyzer.service.ts
✅ src/lib/services/ontology/ontology-template-catalog.service.ts
✅ src/lib/services/ontology/migration/schema-auto-repair.service.ts

# Template Components - ALL DELETED
✅ src/lib/components/agent/TemplateSuggestionCard.svelte
✅ src/lib/components/ontology/templates/ (13 files)

# FSM Actions (template-dependent) - ALL DELETED
✅ src/lib/server/fsm/actions/create-doc-from-template.ts
✅ src/lib/server/fsm/actions/__tests__/create-doc-from-template.test.ts
✅ src/lib/server/fsm/actions/create-research-doc.ts
✅ src/lib/server/fsm/actions/__tests__/create-research-doc.test.ts

# SQL Template Files - ALL DELETED
✅ src/lib/sql/find-missing-templates.sql
✅ src/lib/sql/find-missing-templates-simple.sql
✅ src/lib/sql/verify-migration-results.sql

# Template Types - Kept only for migration service backward compat
⚠️ src/lib/services/ontology/migration/enhanced-migration.types.ts (has stub type)
```

---

## Notes

- `project_brief_templates` and `emailTemplate` are DIFFERENT systems - do not remove
- Keep `type_key` column on all entities - just remove template lookup
- Keep `state_key` column - use hardcoded transitions in app layer
- Database migration should be run LAST after all code changes
- Migration services still reference templates (needed until DB migration runs)

---

**Last Updated**: December 11, 2025 (Created Phase 9 Step 2: `20251212_drop_template_system.sql` - final migration to drop onto_templates table, agent_template_creation_requests table, template_id/template_snapshot columns from onto_events, and onto_template_status enum)
