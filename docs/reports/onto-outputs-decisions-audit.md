<!-- docs/reports/onto-outputs-decisions-audit.md -->

# onto_outputs / onto_decisions Reference Audit

Generated via: `rg -n "onto_outputs|onto_decisions"`

```
packages/shared-types/src/database.types.ts:4202:      onto_decisions: {
packages/shared-types/src/database.types.ts:4256:            foreignKeyName: "onto_decisions_project_id_fkey"
packages/shared-types/src/database.types.ts:4932:            referencedRelation: "onto_outputs"
packages/shared-types/src/database.types.ts:4937:      onto_outputs: {
packages/shared-types/src/database.types.ts:4991:            foreignKeyName: "onto_outputs_project_id_fkey"
packages/shared-types/src/database.types.ts:4998:            foreignKeyName: "onto_outputs_source_document_id_fkey"
packages/shared-types/src/database.types.ts:5005:            foreignKeyName: "onto_outputs_source_document_id_fkey"
packages/shared-types/src/database.types.ts:5012:            foreignKeyName: "onto_outputs_source_event_id_fkey"
packages/shared-types/src/database.schema.ts:1000:	onto_decisions: {
packages/shared-types/src/database.schema.ts:1187:	onto_outputs: {
packages/shared-types/src/database.schema.ts:2249:	'onto_decisions',
packages/shared-types/src/database.schema.ts:2263:	'onto_outputs',
supabase/migrations/20251220_seed_apollo_program_example_project.sql:41:DELETE FROM onto_decisions WHERE project_id = '22222222-2222-2222-2222-222222222222';
supabase/migrations/20251220_seed_apollo_program_example_project.sql:853:INSERT INTO onto_decisions (id, project_id, title, decision_at, rationale, props, created_by) VALUES
supabase/migrations/20251224000000_ontology_search_vectors.sql:65:alter table onto_outputs
supabase/migrations/20251224000000_ontology_search_vectors.sql:71:create index if not exists idx_onto_outputs_search_vector on onto_outputs using gin (search_vector);
supabase/migrations/20251224000000_ontology_search_vectors.sql:72:create index if not exists idx_onto_outputs_name_trgm on onto_outputs using gin (name gin_trgm_ops);
supabase/migrations/20251224000000_ontology_search_vectors.sql:73:create index if not exists idx_onto_outputs_props_trgm on onto_outputs using gin ((props::text) gin_trgm_ops);
supabase/migrations/20251224000000_ontology_search_vectors.sql:279:    from onto_outputs o
supabase/migrations/20251220_seed_hail_mary_example_project.sql:32:DELETE FROM onto_decisions WHERE project_id = '33333333-3333-3333-3333-333333333333';
supabase/migrations/20251220_seed_hail_mary_example_project.sql:654:INSERT INTO onto_decisions (id, project_id, title, decision_at, rationale, props, created_by) VALUES
thoughts/shared/ideas/ontology/ontology-implementation-roadmap.md:539:- Create endpoint validates template via resolver, ensures actor via `ensure_actor_for_user`, merges template defaults, and inserts `onto_outputs` + `onto_edges`.
thoughts/shared/ideas/ontology/ontology-implementation-roadmap.md:609:- [x] Creates output in `onto_outputs`
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:10:-- 3. Updates production onto_outputs rows with new type_keys
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:12:-- 5. Adds promotion-related columns to onto_outputs
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:45:-- PART 2: Add source linking columns to onto_outputs for promotion flow
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:54:    WHERE table_name = 'onto_outputs' AND column_name = 'source_document_id'
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:56:    ALTER TABLE onto_outputs ADD COLUMN source_document_id uuid REFERENCES onto_documents(id) ON DELETE SET NULL;
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:62:    WHERE table_name = 'onto_outputs' AND column_name = 'source_event_id'
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:64:    ALTER TABLE onto_outputs ADD COLUMN source_event_id uuid REFERENCES onto_events(id) ON DELETE SET NULL;
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:69:CREATE INDEX IF NOT EXISTS idx_onto_outputs_source_document ON onto_outputs(source_document_id) WHERE source_document_id IS NOT NULL;
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:70:CREATE INDEX IF NOT EXISTS idx_onto_outputs_source_event ON onto_outputs(source_event_id) WHERE source_event_id IS NOT NULL;
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:72:COMMENT ON COLUMN onto_outputs.source_document_id IS 'Reference to source document when output was promoted from a document';
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:73:COMMENT ON COLUMN onto_outputs.source_event_id IS 'Reference to source event when output was promoted from an event';
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:391:-- PART 5: Migrate production onto_outputs rows
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:397:UPDATE onto_outputs SET
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:403:UPDATE onto_outputs SET
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:409:UPDATE onto_outputs SET
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:415:UPDATE onto_outputs SET
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:421:UPDATE onto_outputs SET
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:427:UPDATE onto_outputs SET
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:433:UPDATE onto_outputs SET
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:439:UPDATE onto_outputs SET
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:445:UPDATE onto_outputs SET
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:453:UPDATE onto_outputs
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:465:  SELECT COUNT(*) INTO v_migrated_count FROM onto_outputs WHERE props->>'legacy_type_key' IS NOT NULL;
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:466:  RAISE NOTICE 'Migrated % production onto_outputs rows', v_migrated_count;
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:682:  SELECT COUNT(*) INTO v_output_count FROM onto_outputs;
supabase/migrations/20251208_deliverable_taxonomy_migration.sql:692:  RAISE NOTICE 'Production onto_outputs rows: %', v_output_count;
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:160:-- PHASE 9: onto_outputs - Add new columns
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:163:-- Add new columns to onto_outputs
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:164:ALTER TABLE onto_outputs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:165:ALTER TABLE onto_outputs ADD COLUMN IF NOT EXISTS description text;
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:167:COMMENT ON COLUMN onto_outputs.deleted_at IS 'Soft delete timestamp - null means active';
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:168:COMMENT ON COLUMN onto_outputs.description IS 'Brief description of the output';
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:170:-- Create indexes for onto_outputs
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:171:CREATE INDEX IF NOT EXISTS idx_onto_outputs_deleted_at ON onto_outputs(deleted_at)
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:175:-- PHASE 10: onto_decisions - Add new columns
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:178:-- Add new columns to onto_decisions
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:179:ALTER TABLE onto_decisions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:180:ALTER TABLE onto_decisions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:182:COMMENT ON COLUMN onto_decisions.deleted_at IS 'Soft delete timestamp - null means active';
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:183:COMMENT ON COLUMN onto_decisions.updated_at IS 'Last update timestamp';
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:185:-- Create indexes for onto_decisions
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:186:CREATE INDEX IF NOT EXISTS idx_onto_decisions_deleted_at ON onto_decisions(deleted_at)
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:259:-- onto_outputs search vector update (add description)
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:264:    WHERE table_name = 'onto_outputs'
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:267:    ALTER TABLE onto_outputs DROP COLUMN IF EXISTS search_vector;
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:270:  ALTER TABLE onto_outputs ADD COLUMN search_vector tsvector
supabase/migrations/20251220_onto_plans_goals_milestones_risks_schema.sql:277:  CREATE INDEX IF NOT EXISTS idx_onto_outputs_search ON onto_outputs USING GIN(search_vector);
supabase/migrations/20250615000003_fix_fsm_variant_resolution.sql:59:			from onto_outputs o
supabase/migrations/20260320000002_project_sharing_access_fixes.sql:142:    'output_count', (SELECT count(*) FROM onto_outputs WHERE project_id = p.id AND deleted_at IS NULL),
supabase/migrations/20260320000002_project_sharing_access_fixes.sql:148:    'decision_count', (SELECT count(*) FROM onto_decisions WHERE project_id = p.id AND deleted_at IS NULL)
supabase/migrations/20260320000002_project_sharing_access_fixes.sql:220:      FROM onto_outputs o
supabase/migrations/20260320000002_project_sharing_access_fixes.sql:254:      FROM onto_decisions dc
supabase/migrations/20251220_seed_acotar_example_project.sql:77:DELETE FROM onto_decisions WHERE project_id = '55555555-5555-5555-5555-555555555555';
supabase/migrations/20251220_seed_acotar_example_project.sql:808:INSERT INTO onto_decisions (id, project_id, title, decision_at, rationale, props, created_by) VALUES
supabase/migrations/20251220_seed_grrm_writing_example_project.sql:55:DELETE FROM onto_decisions WHERE project_id = '44444444-4444-4444-4444-444444444444';
supabase/migrations/20251220_seed_grrm_writing_example_project.sql:553:INSERT INTO onto_decisions (id, project_id, title, decision_at, rationale, props, created_by) VALUES
supabase/migrations/20260128_update_onto_search_entities_soft_delete.sql:201:    from onto_outputs o
supabase/migrations/20250615000004_guard_visibility_and_fsm_fix.sql:58:			from onto_outputs o
supabase/migrations/20260125_add_type_key_to_onto_decisions.sql:1:-- supabase/migrations/20260125_add_type_key_to_onto_decisions.sql
supabase/migrations/20260125_add_type_key_to_onto_decisions.sql:2:-- Add type_key to onto_decisions for LLM classification
supabase/migrations/20260125_add_type_key_to_onto_decisions.sql:4:ALTER TABLE onto_decisions
supabase/migrations/20260125_add_type_key_to_onto_decisions.sql:7:UPDATE onto_decisions
supabase/migrations/20260125_add_type_key_to_onto_decisions.sql:11:ALTER TABLE onto_decisions
supabase/migrations/20260125_add_type_key_to_onto_decisions.sql:14:ALTER TABLE onto_decisions
supabase/migrations/20260125_add_type_key_to_onto_decisions.sql:17:COMMENT ON COLUMN onto_decisions.type_key IS 'Decision classification type key';
thoughts/shared/research/2025-11-04_ontology-naming-conventions-analysis.md:324:**Database Table**: `onto_outputs` (not `onto_deliverables`)
thoughts/shared/research/2025-11-04_ontology-naming-conventions-analysis.md:329:2. ✅ Database table is `onto_outputs`
thoughts/shared/research/2025-11-04_ontology-naming-conventions-analysis.md:472:ALTER TABLE onto_outputs ADD CONSTRAINT chk_output_type_key_format
supabase/migrations/20260320000000_project_sharing_membership.sql:290:    'onto_tasks', 'onto_decisions', 'onto_risks', 'onto_documents', 'onto_edges',
supabase/migrations/20260320000000_project_sharing_membership.sql:500:-- onto_decisions policies
supabase/migrations/20260320000000_project_sharing_membership.sql:502:  ON onto_decisions FOR SELECT
supabase/migrations/20260320000000_project_sharing_membership.sql:506:  ON onto_decisions FOR SELECT
supabase/migrations/20260320000000_project_sharing_membership.sql:510:  ON onto_decisions FOR SELECT
supabase/migrations/20260320000000_project_sharing_membership.sql:513:    WHERE p.id = onto_decisions.project_id AND p.is_public = true
supabase/migrations/20260320000000_project_sharing_membership.sql:517:  ON onto_decisions FOR INSERT
supabase/migrations/20260320000000_project_sharing_membership.sql:521:  ON onto_decisions FOR INSERT
supabase/migrations/20260320000000_project_sharing_membership.sql:525:  ON onto_decisions FOR UPDATE
supabase/migrations/20260320000000_project_sharing_membership.sql:529:  ON onto_decisions FOR UPDATE
supabase/migrations/20260320000000_project_sharing_membership.sql:533:  ON onto_decisions FOR DELETE
supabase/migrations/20260320000000_project_sharing_membership.sql:537:  ON onto_decisions FOR DELETE
supabase/migrations/20260328000000_add_onto_comments.sql:94:        SELECT 1 FROM onto_outputs o
supabase/migrations/20260328000000_add_onto_comments.sql:124:        SELECT 1 FROM onto_decisions dc
supabase/migrations/20251219_get_project_skeleton.sql:41:    'output_count', (SELECT count(*) FROM onto_outputs WHERE project_id = p.id),
supabase/migrations/20251213_fix_get_allowed_transitions_for_tasks.sql:53:			from onto_outputs o
supabase/migrations/20251205_delete_onto_project_function.sql:13:	v_output_ids uuid[] := coalesce((select array_agg(id) from onto_outputs where project_id = p_project_id), '{}'::uuid[]);
supabase/migrations/20251205_delete_onto_project_function.sql:16:	v_decision_ids uuid[] := coalesce((select array_agg(id) from onto_decisions where project_id = p_project_id), '{}'::uuid[]);
supabase/migrations/20251205_delete_onto_project_function.sql:70:			'onto_outputs',
supabase/migrations/20251205_delete_onto_project_function.sql:75:			'onto_decisions',
supabase/migrations/20251205_delete_onto_project_function.sql:92:	delete from onto_decisions where project_id = p_project_id;
supabase/migrations/20251205_delete_onto_project_function.sql:96:	delete from onto_outputs where project_id = p_project_id;
supabase/migrations/20251220_cleanup_washington_example_project.sql:31:  DELETE FROM onto_decisions WHERE project_id = project_uuid;
supabase/migrations/20251220_cleanup_washington_example_project.sql:32:  RAISE NOTICE 'Deleted onto_decisions';
supabase/migrations/20260126_update_get_project_full.sql:61:      FROM onto_outputs o
supabase/migrations/20260126_update_get_project_full.sql:95:      FROM onto_decisions dc
supabase/migrations/20250615000005_fsm_guard_failures.sql:61:            FROM onto_outputs o
supabase/migrations/20251212_simplify_fsm_to_enums.sql:167:ALTER TABLE onto_outputs
supabase/migrations/20251212_simplify_fsm_to_enums.sql:170:ALTER TABLE onto_outputs
supabase/migrations/20251212_simplify_fsm_to_enums.sql:183:ALTER TABLE onto_outputs
supabase/migrations/20251212_simplify_fsm_to_enums.sql:314:COMMENT ON COLUMN onto_outputs.state_key IS 'Output state (enum): draft, in_progress, review, published';
supabase/migrations/20251212_simplify_fsm_to_enums.sql:328:-- SELECT 'outputs' as entity, state_key, count(*) FROM onto_outputs GROUP BY state_key;
supabase/migrations/20251221_soft_delete_onto_projects.sql:63:  UPDATE onto_outputs
supabase/migrations/20251221_soft_delete_onto_projects.sql:78:  UPDATE onto_decisions
supabase/migrations/20251221_soft_delete_onto_projects.sql:134:  UPDATE onto_outputs
supabase/migrations/20251221_soft_delete_onto_projects.sql:146:  UPDATE onto_decisions
supabase/migrations/20251221_soft_delete_onto_projects.sql:215:    'output_count', (SELECT count(*) FROM onto_outputs WHERE project_id = p.id AND deleted_at IS NULL),
supabase/migrations/20251221_soft_delete_onto_projects.sql:315:      FROM onto_outputs o
supabase/migrations/20251221_soft_delete_onto_projects.sql:345:      FROM onto_decisions dc
supabase/migrations/20251212_get_project_full.sql:87:      FROM onto_outputs o
supabase/migrations/20251212_get_project_full.sql:117:      FROM onto_decisions dc
supabase/migrations/20251216_add_project_id_to_edges.sql:62:FROM onto_outputs o
supabase/migrations/20251216_add_project_id_to_edges.sql:83:FROM onto_decisions dec
supabase/migrations/20251216_add_project_id_to_edges.sql:128:FROM onto_outputs o
supabase/migrations/20251216_add_project_id_to_edges.sql:149:FROM onto_decisions dec
supabase/migrations/applied_backup/20251120_create_specific_missing_templates.sql:9:UPDATE onto_outputs
supabase/migrations/applied_backup/20251120_create_specific_missing_templates.sql:13:UPDATE onto_outputs
supabase/migrations/applied_backup/20251120_create_specific_missing_templates.sql:17:UPDATE onto_outputs
supabase/migrations/20260129_align_project_calendars_to_onto_projects.sql:52:	v_output_ids uuid[] := coalesce((select array_agg(id) from onto_outputs where project_id = p_project_id), '{}'::uuid[]);
supabase/migrations/20260129_align_project_calendars_to_onto_projects.sql:55:	v_decision_ids uuid[] := coalesce((select array_agg(id) from onto_decisions where project_id = p_project_id), '{}'::uuid[]);
supabase/migrations/20260129_align_project_calendars_to_onto_projects.sql:109:			'onto_outputs',
supabase/migrations/20260129_align_project_calendars_to_onto_projects.sql:114:			'onto_decisions',
supabase/migrations/20260129_align_project_calendars_to_onto_projects.sql:127:	DELETE FROM onto_decisions WHERE project_id = p_project_id;
supabase/migrations/20260129_align_project_calendars_to_onto_projects.sql:131:	DELETE FROM onto_outputs WHERE project_id = p_project_id;
supabase/migrations/20251201_task_type_key_and_edge_based_plans.sql:161:      from onto_outputs o
supabase/migrations/20250601000001_ontology_system.sql:12:drop table if exists onto_decisions cascade;
supabase/migrations/20250601000001_ontology_system.sql:17:drop table if exists onto_outputs cascade;
supabase/migrations/20250601000001_ontology_system.sql:284:create table if not exists onto_outputs (
supabase/migrations/20250601000001_ontology_system.sql:299:create index if not exists idx_onto_outputs_project on onto_outputs(project_id);
supabase/migrations/20250601000001_ontology_system.sql:300:create index if not exists idx_onto_outputs_type_key on onto_outputs(type_key);
supabase/migrations/20250601000001_ontology_system.sql:301:create index if not exists idx_onto_outputs_state on onto_outputs(state_key);
supabase/migrations/20250601000001_ontology_system.sql:302:create index if not exists idx_onto_outputs_props on onto_outputs using gin (props jsonb_path_ops);
supabase/migrations/20250601000001_ontology_system.sql:307:  output_id uuid not null references onto_outputs(id) on delete cascade,
supabase/migrations/20250601000001_ontology_system.sql:370:create table if not exists onto_decisions (
supabase/migrations/20250601000001_ontology_system.sql:381:create index if not exists idx_onto_decisions_project on onto_decisions(project_id);
supabase/migrations/20250601000001_ontology_system.sql:382:create index if not exists idx_onto_decisions_decision_at on onto_decisions(decision_at);
supabase/migrations/20250601000001_ontology_system.sql:549:create trigger trg_onto_outputs_updated before update on onto_outputs
supabase/migrations/20260116_ontology_brief_query_indexes.sql:24:CREATE INDEX IF NOT EXISTS idx_onto_outputs_project_active
supabase/migrations/20260116_ontology_brief_query_indexes.sql:25:  ON onto_outputs(project_id)
supabase/migrations/20260116_ontology_brief_query_indexes.sql:32:CREATE INDEX IF NOT EXISTS idx_onto_decisions_project_active
supabase/migrations/20260116_ontology_brief_query_indexes.sql:33:  ON onto_decisions(project_id)
supabase/migrations/20251211_remove_template_dependencies_from_rpc.sql:58:			FROM onto_outputs o
supabase/migrations/20251220_seed_manhattan_project_example_project.sql:39:DELETE FROM onto_decisions WHERE project_id = '66666666-6666-6666-6666-666666666666';
supabase/migrations/20251220_seed_manhattan_project_example_project.sql:960:INSERT INTO onto_decisions (id, project_id, title, decision_at, rationale, props, created_by) VALUES
supabase/migrations/20250601000002_ontology_helpers.sql:256:			from onto_outputs o
thoughts/shared/research/2025-11-04_ontology-templates-implementation-summary.md:290:ALTER TABLE onto_outputs
supabase/migrations/20251220_seed_washington_example_project.sql:54:DELETE FROM onto_decisions WHERE project_id = '11111111-1111-1111-1111-111111111111';
supabase/migrations/20251220_seed_washington_example_project.sql:649:INSERT INTO onto_decisions (id, project_id, title, decision_at, rationale, props, created_by) VALUES
supabase/migrations/20251220_seed_washington_example_project.sql:1403:INSERT INTO onto_decisions (id, project_id, title, decision_at, rationale, props, created_by) VALUES
supabase/migrations/20251220_seed_washington_example_project.sql:1925:INSERT INTO onto_decisions (id, project_id, title, decision_at, rationale, props, created_by) VALUES
docs/reports/ontology-implementation-audit.md:11:- ✅ The schema establishes the required core entities (`onto_templates`, `onto_projects`, `onto_tasks`, `onto_outputs`, etc.) and seeds the three canonical facets (context, scale, stage) as described in the master plan.
thoughts/shared/research/2025-11-04_17-32-44_ontology-graph-view-spec-reviewed.md:104:type OntoOutput = Database['public']['Tables']['onto_outputs']['Row'];
thoughts/shared/research/2025-11-04_17-32-44_ontology-graph-view-spec-reviewed.md:136:				adminClient.from('onto_outputs').select('*'),
thoughts/shared/research/2025-11-04_17-32-44_ontology-graph-view-spec-reviewed.md:199:type OntoOutput = Database['public']['Tables']['onto_outputs']['Row'];
supabase/migrations/20251231_enhance_onto_decisions.sql:1:-- supabase/migrations/20251231_enhance_onto_decisions.sql
supabase/migrations/20251231_enhance_onto_decisions.sql:2:-- Migration: Enhance onto_decisions for Mobile Command Center
supabase/migrations/20251231_enhance_onto_decisions.sql:6:-- PHASE 1: Add new columns to onto_decisions
supabase/migrations/20251231_enhance_onto_decisions.sql:10:ALTER TABLE onto_decisions ADD COLUMN IF NOT EXISTS state_key TEXT NOT NULL DEFAULT 'pending';
supabase/migrations/20251231_enhance_onto_decisions.sql:13:ALTER TABLE onto_decisions ADD COLUMN IF NOT EXISTS outcome TEXT;
supabase/migrations/20251231_enhance_onto_decisions.sql:16:ALTER TABLE onto_decisions ADD COLUMN IF NOT EXISTS description TEXT;
supabase/migrations/20251231_enhance_onto_decisions.sql:19:ALTER TABLE onto_decisions ALTER COLUMN decision_at DROP NOT NULL;
supabase/migrations/20251231_enhance_onto_decisions.sql:25:COMMENT ON COLUMN onto_decisions.state_key IS 'Decision state: pending, made, deferred, reversed';
supabase/migrations/20251231_enhance_onto_decisions.sql:26:COMMENT ON COLUMN onto_decisions.outcome IS 'What was decided - the actual decision made';
supabase/migrations/20251231_enhance_onto_decisions.sql:27:COMMENT ON COLUMN onto_decisions.description IS 'Context and background for the decision';
supabase/migrations/20251231_enhance_onto_decisions.sql:28:COMMENT ON COLUMN onto_decisions.decision_at IS 'When the decision was made (nullable for pending decisions)';
supabase/migrations/20251231_enhance_onto_decisions.sql:34:CREATE INDEX IF NOT EXISTS idx_onto_decisions_state_key ON onto_decisions(state_key);
supabase/migrations/20251231_enhance_onto_decisions.sql:44:    WHERE table_name = 'onto_decisions'
supabase/migrations/20251231_enhance_onto_decisions.sql:47:    ALTER TABLE onto_decisions ADD COLUMN search_vector tsvector
supabase/migrations/20251231_enhance_onto_decisions.sql:56:    CREATE INDEX IF NOT EXISTS idx_onto_decisions_search ON onto_decisions USING GIN(search_vector);
supabase/migrations/20251231_enhance_onto_decisions.sql:65:UPDATE onto_decisions
supabase/migrations/20251231_enhance_onto_decisions.sql:100:    'output_count', (SELECT count(*) FROM onto_outputs WHERE project_id = p.id AND deleted_at IS NULL),
supabase/migrations/20251231_enhance_onto_decisions.sql:106:    'decision_count', (SELECT count(*) FROM onto_decisions WHERE project_id = p.id AND deleted_at IS NULL)
supabase/migrations/20251231_enhance_onto_decisions.sql:120:  RAISE NOTICE 'onto_decisions enhancement complete - added state_key, outcome, description columns';
supabase/migrations/20251220_ontology_rls_policies.sql:8:--   onto_tasks, onto_decisions, onto_risks, onto_documents, onto_edges
supabase/migrations/20251220_ontology_rls_policies.sql:66:ALTER TABLE onto_decisions ENABLE ROW LEVEL SECURITY;
supabase/migrations/20251220_ontology_rls_policies.sql:83:    'onto_tasks', 'onto_decisions', 'onto_risks', 'onto_documents', 'onto_edges'
supabase/migrations/20251220_ontology_rls_policies.sql:374:-- STEP 9: onto_decisions policies
supabase/migrations/20251220_ontology_rls_policies.sql:378:  ON onto_decisions FOR SELECT
supabase/migrations/20251220_ontology_rls_policies.sql:381:    WHERE p.id = onto_decisions.project_id AND p.created_by = current_actor_id()
supabase/migrations/20251220_ontology_rls_policies.sql:385:  ON onto_decisions FOR SELECT
supabase/migrations/20251220_ontology_rls_policies.sql:389:  ON onto_decisions FOR SELECT
supabase/migrations/20251220_ontology_rls_policies.sql:392:    WHERE p.id = onto_decisions.project_id AND p.is_public = true
supabase/migrations/20251220_ontology_rls_policies.sql:396:  ON onto_decisions FOR INSERT
supabase/migrations/20251220_ontology_rls_policies.sql:399:    WHERE p.id = onto_decisions.project_id AND p.created_by = current_actor_id()
supabase/migrations/20251220_ontology_rls_policies.sql:403:  ON onto_decisions FOR INSERT
supabase/migrations/20251220_ontology_rls_policies.sql:407:  ON onto_decisions FOR UPDATE
supabase/migrations/20251220_ontology_rls_policies.sql:410:    WHERE p.id = onto_decisions.project_id AND p.created_by = current_actor_id()
supabase/migrations/20251220_ontology_rls_policies.sql:414:  ON onto_decisions FOR UPDATE
supabase/migrations/20251220_ontology_rls_policies.sql:418:  ON onto_decisions FOR DELETE
supabase/migrations/20251220_ontology_rls_policies.sql:421:    WHERE p.id = onto_decisions.project_id AND p.created_by = current_actor_id()
supabase/migrations/20251220_ontology_rls_policies.sql:425:  ON onto_decisions FOR DELETE
supabase/migrations/20251220_ontology_rls_policies.sql:603:GRANT SELECT, INSERT, UPDATE, DELETE ON onto_decisions TO authenticated;
supabase/migrations/20251220_ontology_rls_policies.sql:614:GRANT SELECT ON onto_decisions TO anon;
supabase/migrations/20251220_ontology_rls_policies.sql:643:  RAISE NOTICE '  - onto_decisions';
thoughts/shared/research/2025-02-11_ontology-deliverable-to-output-migration.md:33:- ✅ Updated table references: `'onto_deliverables' → 'onto_outputs'`
thoughts/shared/research/2025-02-11_ontology-deliverable-to-output-migration.md:51:- ✅ Tables already named `onto_outputs` and `onto_output_versions` ✅
thoughts/shared/research/2025-02-11_ontology-deliverable-to-output-migration.md:73:drop table if exists onto_decisions cascade;
thoughts/shared/research/2025-02-11_ontology-deliverable-to-output-migration.md:78:drop table if exists onto_outputs cascade;
thoughts/shared/research/2025-02-11_ontology-deliverable-to-output-migration.md:533:    - Insert into `onto_outputs` table
thoughts/shared/research/2025-12-23_agentic-chat-entity-update-gaps.md:79:    - `onto_decisions` (title/decision_at)
thoughts/shared/research/2025-12-23_agentic-chat-entity-update-gaps.md:86:  - `list_onto_outputs`, `get_onto_output_details`, `update_onto_output`
thoughts/shared/research/2025-12-23_agentic-chat-entity-update-gaps.md:89:  - `list_onto_decisions`, `get_onto_decision_details`, `update_onto_decision`
thoughts/shared/research/2025-11-04_CRUD_patterns_research.md:209:	.from('onto_outputs')
thoughts/shared/research/2025-11-01_19-51-42_ontology-schema-architectural-fix.md:91:- `onto_decisions` - Decision log
docs/technical/implementation/AGENT_CHAT_ONTOLOGY_INTEGRATION_SPEC.md:78:SELECT * FROM onto_outputs LIMIT 1;
docs/technical/implementation/AGENT_CHAT_ONTOLOGY_INTEGRATION_SPEC.md:486:			output: 'onto_outputs'
docs/technical/implementation/AGENT_CHAT_ONTOLOGY_INTEGRATION_SPEC.md:646:			'onto_outputs'
thoughts/shared/research/2025-11-04_CRUD_patterns_quick_reference.md:158:			.from('onto_outputs')
thoughts/shared/research/2025-11-04_CRUD_patterns_quick_reference.md:289:			.from('onto_outputs')
thoughts/shared/research/2025-11-04_CRUD_patterns_quick_reference.md:314:			.from('onto_outputs')
thoughts/shared/research/2025-11-04_CRUD_patterns_quick_reference.md:415:			.from('onto_outputs')
thoughts/shared/research/2025-11-04_CRUD_patterns_quick_reference.md:447:		const { error } = await supabase.from('onto_outputs').delete().eq('id', id);
thoughts/shared/research/2025-11-08_type_key_taxonomy_brainstorm.md:15:> "I have a clear naming convention for onto_projects: `{domain}.{deliverable}.{variant}`. Now I'm building onto_tasks, onto_plans, onto_outputs, and other tables. Do I need a separate taxonomy for each? At what point does the project define meaning, and at what point do sub-entities need their own independent taxonomy?"
thoughts/shared/research/2025-11-08_type_key_taxonomy_brainstorm.md:67:- `onto_outputs` ✅ Has type_key (`deliverable.chapter`, `deliverable.research_doc.icp`)
thoughts/shared/research/2025-11-08_type_key_taxonomy_brainstorm.md:86:- `onto_decisions` - Are decisions meaningful standalone? Maybe in a "decisions for this project"
thoughts/shared/research/2025-11-08_type_key_taxonomy_brainstorm.md:133:| **onto_outputs** | ✅ Yes | ✅ Yes | ✅ Yes | Own taxonomy | `deliverable.{type}.{variant}?` |
thoughts/shared/research/2025-11-08_type_key_taxonomy_brainstorm.md:142:| **onto_decisions** | ⚠️ Partial | ⚠️ Partial | ❌ No | **Project-derived** | (No separate type_key) |
thoughts/shared/research/2025-11-08_type_key_taxonomy_brainstorm.md:151:### 1. **onto_outputs** - YES, Own Taxonomy
thoughts/shared/research/2025-11-08_type_key_taxonomy_brainstorm.md:407:### 10. **onto_decisions** - Project-Derived (No Type Key)
thoughts/shared/research/2025-11-08_type_key_taxonomy_brainstorm.md:454:├── onto_outputs (deliverables)
thoughts/shared/research/2025-11-08_type_key_taxonomy_brainstorm.md:483:├── onto_decisions
thoughts/shared/research/2025-11-03_23-00-00_ontology-bug-fixes-comprehensive-report.md:43:**Root Cause**: Oversight in original migration. Other entity tables (`onto_projects`, `onto_plans`, `onto_tasks`, `onto_outputs`) all have `state_key`, but documents were missing it.
thoughts/shared/research/2025-11-03_23-00-00_ontology-bug-fixes-comprehensive-report.md:177:	.from('onto_outputs')
thoughts/shared/research/2025-11-03_23-00-00_ontology-bug-fixes-comprehensive-report.md:471:	if ('name' in entity && entity.type_key?.startsWith('output.')) return 'onto_outputs';
thoughts/shared/research/2026-01-03_modal-field-exposure-audit.md:194:### 7. OUTPUT (`onto_outputs`) - **CRITICAL GAPS**
thoughts/shared/research/2026-01-03_modal-field-exposure-audit.md:214:### 8. DECISION (`onto_decisions`) - Complete
apps/web/docs/technical/performance/PROJECT_PAGE_INSTANT_LOAD.md:137:    'output_count', (SELECT count(*) FROM onto_outputs WHERE project_id = p.id),
apps/web/scripts/reset-migration-last-2-hours.sql:23:DELETE FROM onto_outputs
apps/web/scripts/rollback-ontology-migration.sql:56:SELECT 'onto_outputs', COUNT(*)
apps/web/scripts/rollback-ontology-migration.sql:57:FROM onto_outputs, cutoff
apps/web/scripts/rollback-ontology-migration.sql:86:SELECT 'onto_decisions', COUNT(*)
apps/web/scripts/rollback-ontology-migration.sql:87:FROM onto_decisions, cutoff
apps/web/scripts/rollback-ontology-migration.sql:177:  DELETE FROM onto_outputs WHERE created_at >= cutoff_time;
apps/web/scripts/rollback-ontology-migration.sql:179:  RAISE NOTICE 'Deleted % onto_outputs', deleted_count;
apps/web/scripts/rollback-ontology-migration.sql:205:  DELETE FROM onto_decisions WHERE created_at >= cutoff_time;
apps/web/scripts/rollback-ontology-migration.sql:207:  RAISE NOTICE 'Deleted % onto_decisions', deleted_count;
docs/architecture/ONTOLOGY_DATA_MODEL_ANALYSIS.md:555:### `onto_outputs`
docs/architecture/ONTOLOGY_DATA_MODEL_ANALYSIS.md:562:### `onto_decisions`
docs/research/EXAMPLE_PROJECT_CREATION_GUIDE.md:23:| **Critical decisions**    | Maps to `onto_decisions`  | Technology choices, personnel          |
docs/research/EXAMPLE_PROJECT_CREATION_GUIDE.md:358:### Decisions (`onto_decisions` table)
docs/research/EXAMPLE_PROJECT_CREATION_GUIDE.md:361:INSERT INTO onto_decisions (
docs/research/EXAMPLE_PROJECT_CREATION_GUIDE.md:520:DELETE FROM onto_decisions WHERE project_id = '[PROJECT_UUID]';
docs/research/EXAMPLE_PROJECT_CREATION_GUIDE.md:642:SELECT 'decisions', COUNT(*) FROM onto_decisions WHERE project_id = '[UUID]'
docs/research/EXAMPLE_PROJECT_IDEAS.md:118:| Critical decisions    | `onto_decisions`  |
docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md:285:		supabase.from('onto_outputs').select('*').eq('project_id', projectId),
docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md:288:		supabase.from('onto_decisions').select('*').eq('project_id', projectId),
docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md:846:FROM onto_outputs o
docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md:864:FROM onto_decisions dec
docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md:1348:| Output    | `onto_outputs`    | ✅               | `task` → `produces` → `output`            |
docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md:1351:| Decision  | `onto_decisions`  | ✅               | (varies)                                  |
docs/specs/PROJECT_CONTEXT_ENRICHMENT_SPEC.md:239:- `onto_decisions`
docs/specs/PROJECT_CONTEXT_ENRICHMENT_SPEC.md:244:- `onto_outputs`
docs/specs/DAILY_BRIEF_ONTOLOGY_MIGRATION_SPEC.md:138:| **Outputs**      | `onto_outputs`      | Produced/target artifacts for outcomes                         |
docs/specs/DAILY_BRIEF_ONTOLOGY_MIGRATION_SPEC.md:140:| **Decisions**    | `onto_decisions`    | Recent decisions/ADRs (optional, include if any)               |
docs/specs/DAILY_BRIEF_ONTOLOGY_MIGRATION_SPEC.md:282:		supabase.from('onto_outputs').select('*').in('project_id', projectIds),
docs/specs/DAILY_BRIEF_ONTOLOGY_MIGRATION_SPEC.md:285:			.from('onto_decisions')
docs/specs/AGENTIC_CHAT_PROJECT_CONTEXT_ENRICHMENT_SPEC.md:346:- All `onto_decisions` columns
docs/specs/AGENTIC_CHAT_PROJECT_CONTEXT_ENRICHMENT_SPEC.md:390:- All `onto_outputs` columns
docs/specs/ONTOLOGY_LLM_CLASSIFICATION_SPEC.md:86:| Output    | `onto_outputs`    | `output.default`    | `output.written.report`   |
docs/specs/ONTOLOGY_LLM_CLASSIFICATION_SPEC.md:91:| Decision  | `onto_decisions`  | `decision.default`  | `decision.technical`      |
docs/specs/ONTOLOGY_LLM_CLASSIFICATION_SPEC.md:574:- [x] Add `type_key` column to `onto_decisions` with default `decision.default`
docs/specs/ONTOLOGY_LLM_CLASSIFICATION_SPEC.md:683:| **Decision Migration** | `/supabase/migrations/20260125_add_type_key_to_onto_decisions.sql` |
docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md:8:> **Progress:** All 10 Phases Complete (onto_tasks, onto_projects, onto_documents, onto_plans, onto_goals, onto_milestones, onto_risks, onto_requirements, onto_outputs, onto_decisions)
docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md:30:| `onto_outputs`      | `deleted_at`, `description`                                                      | —               | —                                                                        |
docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md:31:| `onto_decisions`    | `deleted_at`, `updated_at`                                                       | —               | —                                                                        |
docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md:47:9. **onto_outputs**
docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md:48:10. **onto_decisions**
docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md:416:## Phase 9: onto_outputs Migration ✅ COMPLETE
docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md:423:ALTER TABLE onto_outputs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md:424:ALTER TABLE onto_outputs ADD COLUMN IF NOT EXISTS description text;
docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md:426:CREATE INDEX IF NOT EXISTS idx_onto_outputs_deleted_at ON onto_outputs(deleted_at) WHERE deleted_at IS NULL;
docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md:429:ALTER TABLE onto_outputs ADD COLUMN search_vector tsvector
docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md:437:**Note:** `onto_outputs` already has `updated_at` column.
docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md:451:## Phase 10: onto_decisions Migration ✅ COMPLETE
docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md:458:ALTER TABLE onto_decisions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md:459:ALTER TABLE onto_decisions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md:461:CREATE INDEX IF NOT EXISTS idx_onto_decisions_deleted_at ON onto_decisions(deleted_at) WHERE deleted_at IS NULL;
docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md:532:| 9     | onto_outputs      | Low              | None                |
docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md:533:| 10    | onto_decisions    | Low              | None                |
apps/web/docs/technical/database/CALENDAR_AND_ONTOLOGY_SCHEMA.md:297:#### `onto_outputs` & `onto_output_versions` (Deliverables)
apps/web/docs/technical/database/CALENDAR_AND_ONTOLOGY_SCHEMA.md:300:onto_outputs:
apps/web/docs/technical/database/CALENDAR_AND_ONTOLOGY_SCHEMA.md:365:onto_decisions:
apps/web/docs/technical/database/CALENDAR_AND_ONTOLOGY_SCHEMA.md:553:trg_onto_outputs_updated
apps/web/docs/technical/database/CALENDAR_AND_ONTOLOGY_SCHEMA.md:1265:trg_onto_outputs_updated (onto_outputs)
apps/web/docs/features/project-activity-logging/IMPLEMENTATION_PLAN.md:109:- `output` - onto_outputs
apps/web/docs/features/ontology/NAMING_CONVENTIONS.md:583:SELECT * FROM onto_outputs
apps/web/docs/features/ontology/ONTOLOGY_FIRST_REFACTORING.md:198:- Outputs (onto_outputs): Deliverables
apps/web/docs/features/ontology/ONTOLOGY_FIRST_REFACTORING.md:321:**5. Outputs (onto_outputs)**
apps/web/docs/features/ontology/ONTOLOGY_FIRST_REFACTORING.md:346:  ├── onto_edges → onto_outputs (has_output)
apps/web/docs/features/ontology/CURRENT_STATUS.md:33:| `onto_outputs`      | `description`, `deleted_at`                                        |
apps/web/docs/features/ontology/CURRENT_STATUS.md:37:| `onto_decisions`    | `deleted_at`, `updated_at`                                         |
apps/web/docs/features/ontology/CURRENT_STATUS.md:90:✅ onto_outputs        -- Versioned deliverables
apps/web/docs/features/ontology/CURRENT_STATUS.md:98:✅ onto_decisions      -- Decision records (ADRs)
apps/web/docs/features/ontology/VERSIONING_IMPLEMENTATION_SUMMARY.md:36:1. **onto_outputs**: Version table exists but is **completely unused** (0 implementations)
apps/web/docs/features/ontology/DELIVERABLE_TAXONOMY_MIGRATION.md:66:### 3. Table Naming: Keep `onto_outputs`
apps/web/docs/features/ontology/DELIVERABLE_TAXONOMY_MIGRATION.md:68:Decision: Keep the table name `onto_outputs` rather than renaming to `onto_deliverables`.
apps/web/docs/features/ontology/DELIVERABLE_TAXONOMY_MIGRATION.md:78:Event deliverables live in `onto_outputs` table (not `onto_events`).
apps/web/docs/features/ontology/DELIVERABLE_TAXONOMY_MIGRATION.md:88:Decision: Don't add a `primitive` column to `onto_outputs`.
apps/web/docs/features/ontology/DELIVERABLE_TAXONOMY_MIGRATION.md:105:New columns added to `onto_outputs`:
apps/web/docs/features/ontology/DELIVERABLE_TAXONOMY_MIGRATION.md:118:5. **Migrates production data** - Updates `onto_outputs` rows
apps/web/docs/features/ontology/DATA_MODELS.md:42:| `onto_outputs`       | Deliverables/artifacts       | id, project_id, name, type_key, state_key, props, facet_stage                 |
apps/web/docs/features/ontology/DATA_MODELS.md:50:| `onto_decisions`     | Project decisions            | id, project_id, title, state_key, decision_at, outcome, description, props    |
apps/web/docs/features/ontology/DATA_MODELS.md:276:	output_id: uuid; // FK to onto_outputs
apps/web/docs/features/ontology/DATA_MODELS.md:668:  ├→ onto_outputs
apps/web/docs/features/ontology/DATA_MODELS.md:676:  ├→ onto_decisions
apps/web/docs/features/ontology/README.md:138:onto_outputs        -- Deliverables (versioned)
apps/web/docs/features/ontology/README.md:146:onto_decisions      -- Decision records
apps/web/docs/features/agentic-chat/PROJECT_CREATION_FLOW_ANALYSIS.md:291:- `onto_outputs` - Deliverables
apps/web/docs/features/agentic-chat/PROJECT_CREATION_FLOW_ANALYSIS.md:370:│      ├── Insert onto_outputs                                                 │
apps/web/docs/features/ontology/CRUD_TOOLS_IMPLEMENTATION.md:369:    - onto_outputs (deliverables)
apps/web/docs/features/ontology/CRUD_TOOLS_IMPLEMENTATION.md:376:3. 📋 Add tools for onto_outputs and onto_documents
apps/web/docs/features/ontology/VERSIONING_IMPLEMENTATION_SPEC.md:31:This specification outlines the implementation of a comprehensive versioning system for the BuildOS Ontology feature, specifically for `onto_outputs` and `onto_documents`. The system will provide complete audit trails, version comparison capabilities, and rollback functionality - essential features for the "Palantir of projects" vision.
apps/web/docs/features/ontology/VERSIONING_IMPLEMENTATION_SPEC.md:57:1. **onto_outputs**: Version table exists but is completely unused
apps/web/docs/features/ontology/VERSIONING_IMPLEMENTATION_SPEC.md:125:        D1[onto_outputs]
apps/web/docs/features/ontology/VERSIONING_IMPLEMENTATION_SPEC.md:160:    output_id uuid NOT NULL REFERENCES onto_outputs(id) ON DELETE CASCADE,
apps/web/docs/features/ontology/VERSIONING_IMPLEMENTATION_SPEC.md:250:		.from('onto_outputs')
apps/web/docs/features/ontology/VERSIONING_IMPLEMENTATION_SPEC.md:262:		.from('onto_outputs')
apps/web/docs/features/ontology/VERSIONING_IMPLEMENTATION_SPEC.md:488:		.from('onto_outputs')
apps/web/docs/features/ontology/VERSIONING_IMPLEMENTATION_SPEC.md:729:		const mainTable = entityType === 'output' ? 'onto_outputs' : 'onto_documents';
apps/web/docs/features/ontology/VERSIONING_IMPLEMENTATION_SPEC.md:1254:FROM onto_outputs o
apps/web/docs/features/ontology/TASK_LINKED_ENTITIES_SPEC.md:544:					.from('onto_outputs')
apps/web/docs/features/ontology/TASK_LINKED_ENTITIES_SPEC.md:550:					.from('onto_decisions')
apps/web/docs/features/ontology/missing_data_model_taxonomy_conventions.md:473:SELECT * FROM onto_outputs
apps/web/docs/features/agentic-chat/README.md:95:│  ├── onto_documents, onto_outputs, onto_edges                                    │
apps/web/docs/features/ontology/GRAPH_ENHANCEMENT_SPEC.md:32:| Outputs   | `onto_outputs`   | Yes    | Yes        |
apps/web/docs/features/ontology/GRAPH_ENHANCEMENT_SPEC.md:46:| Decisions      | `onto_decisions`     | Possible                          | LOW      |
apps/web/docs/features/ontology/GRAPH_ENHANCEMENT_SPEC.md:90:	adminClient.from('onto_outputs').select('*'),
apps/web/docs/features/ontology/ONTOLOGY_TAXONOMY_UPDATE_TASKS.md:173:SELECT * FROM onto_outputs
apps/web/docs/features/ontology/TYPE_KEY_TAXONOMY.md:19:| **onto_outputs**      | Yes           | `output.{family}[.{variant}]`               | 25+       | `output.written.chapter`, `output.media.slide_deck`       |
apps/web/docs/features/ontology/TYPE_KEY_TAXONOMY.md:26:| **onto_decisions**    | No            | Inherited from project                      | -         | N/A                                                       |
apps/web/docs/features/ontology/TYPE_KEY_TAXONOMY.md:290:#### onto_outputs (Deliverables)
apps/web/docs/features/ontology/TYPE_KEY_TAXONOMY.md:392:#### onto_decisions
apps/web/docs/features/ontology/TYPE_KEY_TAXONOMY.md:582:SELECT * FROM onto_outputs
apps/web/docs/features/agentic-chat/tool-system/QUICK_REFERENCE.md:35:list_onto_outputs
apps/web/docs/features/agentic-chat/tool-system/QUICK_REFERENCE.md:38:list_onto_decisions
apps/web/docs/features/ontology/chatgpt-outputs-chat.md:36:You already have the right building block for this: **`onto_outputs`**.
apps/web/docs/features/ontology/chatgpt-outputs-chat.md:38:I’d treat `onto_outputs` as the **canonical “Deliverable” table**, regardless of primitive (document, event, external artifact, etc.).
apps/web/docs/features/ontology/chatgpt-outputs-chat.md:48:For each row in `onto_outputs`, you already have `type_key`. Update the type_key s to have this naming convention like:
apps/web/docs/features/ontology/chatgpt-outputs-chat.md:58:- In `onto_outputs.props.primitive`, **or**
apps/web/docs/features/ontology/chatgpt-outputs-chat.md:83:- an **`onto_outputs` row** with `type_key = 'deliverable.document.X'`
apps/web/docs/features/ontology/chatgpt-outputs-chat.md:114:- One `onto_outputs` row (the collection itself)
apps/web/docs/features/ontology/chatgpt-outputs-chat.md:135:- Live as `onto_outputs` rows
apps/web/docs/features/ontology/chatgpt-outputs-chat.md:136:- Store the external URI in `onto_outputs.props.external_uri` **or** via an `onto_sources` link
apps/web/docs/features/ontology/chatgpt-outputs-chat.md:156:    - An `onto_outputs` row:
apps/web/docs/features/ontology/chatgpt-outputs-chat.md:170:- Create `onto_outputs` row:
apps/web/docs/features/ontology/chatgpt-outputs-chat.md:196:**`onto_outputs`** is the canonical deliverable/output:
apps/web/docs/features/ontology/chatgpt-outputs-chat.md:213:    - Link: `onto_outputs.props.document_id` (or via `onto_edges`).
apps/web/docs/features/ontology/chatgpt-outputs-chat.md:217:    - Link: `onto_outputs.props.event_id`.
apps/web/docs/features/ontology/FSM_SIMPLIFICATION_PLAN.md:246:ALTER TABLE onto_outputs
apps/web/docs/features/ontology/FSM_SIMPLIFICATION_PLAN.md:317:ALTER TABLE onto_outputs ALTER COLUMN state_key SET DEFAULT 'draft'::output_state;
apps/web/docs/features/ontology/TEMPLATE_REMOVAL_MIGRATION.md:55:- `onto_outputs` - `type_key` stays
apps/web/docs/features/agentic-chat/tool-system/DOCUMENTATION.md:76:| `list_onto_outputs`      | List outputs with status              | `project_id`, `state_key`, `limit`                                                  |
apps/web/docs/features/agentic-chat/tool-system/DOCUMENTATION.md:79:| `list_onto_decisions`    | List decisions                        | `project_id`, `limit`                                                               |
apps/web/docs/features/project-sharing/PROJECT_SHARING_SPEC.md:150:- `onto_outputs`
apps/web/docs/features/project-sharing/PROJECT_SHARING_SPEC.md:156:- `onto_decisions`
apps/web/docs/features/mobile-command-center/MOBILE_COMMAND_CENTER_SPEC.md:213:CREATE TABLE onto_decisions (
apps/web/docs/features/mobile-command-center/MOBILE_COMMAND_CENTER_SPEC.md:591:1. **Database Migration** - Create `onto_decisions` table
apps/web/docs/features/mobile-command-center/MOBILE_COMMAND_CENTER_SPEC.md:626:| `supabase/migrations/XXXXXX_create_onto_decisions.sql`                       | Database migration                   |
apps/web/src/lib/tests/test-onto-project-creation-business-owner.md:483:- ✅ **onto_outputs**: 3 deliverables
apps/web/src/lib/tests/test-onto-project-creation-business-owner.md:507:- ✅ **onto_decisions**: 1 decision
apps/web/src/lib/tests/test-onto-project-creation-business-owner.md:1188:- ✅ **onto_decisions**: 1 fundraising strategy decision
apps/web/src/lib/tests/test-onto-project-creation-researcher.md:514:- ✅ **onto_outputs**: 3 deliverables
apps/web/src/lib/tests/test-onto-project-creation-researcher.md:820:- ✅ **onto_outputs**: 1 deliverable (manuscript)
apps/web/src/lib/tests/test-onto-project-creation-researcher.md:1253:    search_onto_outputs({
apps/web/src/lib/tests/test-onto-project-creation-researcher.md:1308:- ✅ **onto_outputs**: 1 updated (manuscript in progress)
apps/web/src/lib/tests/test-onto-project-creation-researcher.md:1310:- ✅ **onto_decisions**: 1 journal selection decision
apps/web/src/lib/tests/test-onto-project-creation-writer.md:167:- ✅ **onto_outputs**: 1 output
apps/web/src/lib/tests/test-onto-project-creation-writer.md:245:- ✅ **onto_outputs**: 1 output (published series)
apps/web/src/lib/tests/test-onto-project-creation-writer.md:553:- ✅ **onto_decisions**: 1 decision record (KDP selection)
apps/web/src/lib/tests/test-onto-project-creation-designer.md:289:- ✅ **onto_outputs**: 3 deliverables
apps/web/src/lib/tests/test-onto-project-creation-designer.md:532:- ✅ **onto_outputs**: 2 deliverables (Figma library, JSON tokens)
apps/web/src/lib/tests/test-onto-project-creation-designer.md:698:- ✅ **onto_decisions**: 1 decision record with client feedback
apps/web/src/lib/tests/test-onto-project-creation-designer.md:751:    search_onto_outputs({
apps/web/src/lib/tests/test-onto-project-creation-designer.md:792:- ✅ **onto_outputs**: 1 updated (logo package in progress)
apps/web/src/lib/tests/test-onto-multi-entity-comprehensive.md:139:  // === OUTPUTS (onto_outputs) ===
apps/web/src/lib/tests/test-onto-multi-entity-comprehensive.md:307:  // === DECISIONS (onto_decisions) ===
apps/web/src/lib/tests/test-onto-multi-entity-comprehensive.md:376:5. ✅ **onto_outputs**: 3 deliverables
apps/web/src/lib/tests/test-onto-multi-entity-comprehensive.md:407:11. ✅ **onto_decisions**: 2 decisions
apps/web/src/lib/tests/test-onto-multi-entity-comprehensive.md:565:- ✅ **onto_decisions**: 1 updated decision (pricing considerations)
apps/web/src/lib/tests/test-onto-multi-entity-comprehensive.md:570:- ✅ onto_outputs, onto_documents, onto_requirements ✓
apps/web/src/lib/tests/test-onto-multi-entity-comprehensive.md:572:- ✅ onto_decisions, onto_sources ✓
apps/web/src/lib/tests/test-onto-multi-entity-comprehensive.md:678:- ✅ **onto_outputs**: 1 updated (state → alpha)
apps/web/src/lib/tests/test-onto-project-creation-developer.md:235:- ✅ **onto_outputs**: 1 release output
apps/web/src/lib/tests/test-onto-project-creation-developer.md:460:- ✅ **onto_decisions**: 1 decision record with rationale
apps/web/src/lib/tests/test-onto-project-creation-developer.md:562:- ✅ **onto_outputs**: 3 release outputs (alpha, beta, GA)
apps/web/src/lib/tests/test-onto-project-creation-event-planner.md:482:- ✅ **onto_outputs**: 2 deliverables
apps/web/src/lib/tests/test-onto-project-creation-event-planner.md:905:- ✅ **onto_decisions**: 1 vendor selection decision
apps/web/src/lib/tests/ONTOLOGY_TEST_SUITE_README.md:40:- onto_outputs (manuscript, published content)
apps/web/src/lib/tests/ONTOLOGY_TEST_SUITE_README.md:43:- onto_decisions (publishing strategy)
apps/web/src/lib/tests/ONTOLOGY_TEST_SUITE_README.md:77:- onto_decisions (architectural, infrastructure)
apps/web/src/lib/tests/ONTOLOGY_TEST_SUITE_README.md:115:- onto_outputs (logo packages, design libraries, UI mockups)
apps/web/src/lib/tests/ONTOLOGY_TEST_SUITE_README.md:118:- onto_decisions (design direction, tool selection)
apps/web/src/lib/tests/ONTOLOGY_TEST_SUITE_README.md:154:- onto_outputs (event program, floor plans)
apps/web/src/lib/tests/ONTOLOGY_TEST_SUITE_README.md:196:- onto_outputs (datasets, journal articles, conference presentations)
apps/web/src/lib/tests/ONTOLOGY_TEST_SUITE_README.md:242:- onto_outputs (product SKUs, websites, marketing assets)
apps/web/src/lib/tests/ONTOLOGY_TEST_SUITE_README.md:247:- onto_decisions (platform selection, fundraising strategy, vendor choices)
apps/web/src/lib/tests/ONTOLOGY_TEST_SUITE_README.md:279:- ✅ onto_outputs, onto_documents, onto_requirements
apps/web/src/lib/tests/ONTOLOGY_TEST_SUITE_README.md:282:- ✅ onto_decisions, onto_sources
apps/web/src/lib/tests/ONTOLOGY_TEST_SUITE_README.md:354:| onto_outputs   | Versioned deliverables | ✅ Multi-entity + Writer    |
apps/web/src/lib/tests/ONTOLOGY_TEST_SUITE_README.md:371:| onto_decisions | Decision records    | ✅ Writer + Developer |
```
