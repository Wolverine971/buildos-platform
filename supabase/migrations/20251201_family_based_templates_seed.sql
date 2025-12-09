-- supabase/migrations/20251201_family_based_templates_seed.sql
-- Migration: Seed family-based templates for plans, goals, documents, outputs, risks, and events
-- Date: December 1, 2025
-- Purpose: Implement the new family-based taxonomy for ontology entities
--
-- Pattern: {scope}.{family}[.{variant}]
-- Abstract bases: {scope}.base and {scope}.{family}.base
--
-- This migration seeds:
-- - Plan templates (6 families)
-- - Goal templates (4 families)
-- - Document templates (6 families)
-- - Output templates (4 families)
-- - Risk templates (7 families)
-- - Event templates (3 families)

-- ============================================
-- HELPER: Standard task FSM definition
-- ============================================
-- All entities use a common FSM pattern unless overridden

-- ============================================
-- PLAN TEMPLATES
-- ============================================

-- plan.base - Root abstract plan template
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'plan', 'plan.base', 'Plan (Abstract)', 'active', true,
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"description": {"type": "string"}, "start_date": {"type": "string", "format": "date"}, "end_date": {"type": "string", "format": "date"}}}'::jsonb,
    '{"type_key": "plan.base", "initial": "draft", "states": ["draft", "active", "paused", "complete", "archived"], "transitions": [{"from": "draft", "to": "active", "event": "activate"}, {"from": "active", "to": "paused", "event": "pause"}, {"from": "paused", "to": "active", "event": "resume"}, {"from": "active", "to": "complete", "event": "complete"}, {"from": "complete", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Plan", "description": "Abstract base for all plan types"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- plan.timebox.base - Abstract timebox plan
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'plan', 'plan.timebox.base', 'Timebox Plan (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'plan.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"duration_days": {"type": "integer"}, "goal": {"type": "string"}}}'::jsonb,
    '{"type_key": "plan.timebox.base", "initial": "draft", "states": ["draft", "active", "complete", "archived"], "transitions": [{"from": "draft", "to": "active", "event": "start"}, {"from": "active", "to": "complete", "event": "complete"}, {"from": "complete", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Timebox", "description": "Short, fixed time window plans"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- plan.timebox.sprint
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'plan', 'plan.timebox.sprint', 'Sprint', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'plan.timebox.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"sprint_number": {"type": "integer"}, "velocity_target": {"type": "integer"}, "sprint_goal": {"type": "string"}}}'::jsonb,
    '{"type_key": "plan.timebox.sprint", "initial": "draft", "states": ["draft", "active", "review", "complete", "archived"], "transitions": [{"from": "draft", "to": "active", "event": "start"}, {"from": "active", "to": "review", "event": "end_sprint"}, {"from": "review", "to": "complete", "event": "close"}, {"from": "complete", "to": "archived", "event": "archive"}]}'::jsonb,
    '{"duration_days": 14}'::jsonb, '[]'::jsonb,
    '{"category": "Timebox", "description": "1-4 week development sprint", "typical_duration": "14 days", "keywords": ["sprint", "agile", "scrum", "iteration"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, default_props = EXCLUDED.default_props, metadata = EXCLUDED.metadata, updated_at = now();

-- plan.timebox.weekly
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'plan', 'plan.timebox.weekly', 'Weekly Plan', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'plan.timebox.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"week_of": {"type": "string", "format": "date"}, "focus_areas": {"type": "array", "items": {"type": "string"}}}}'::jsonb,
    '{"type_key": "plan.timebox.weekly", "initial": "draft", "states": ["draft", "active", "complete", "archived"], "transitions": [{"from": "draft", "to": "active", "event": "start"}, {"from": "active", "to": "complete", "event": "complete"}, {"from": "complete", "to": "archived", "event": "archive"}]}'::jsonb,
    '{"duration_days": 7}'::jsonb, '[]'::jsonb,
    '{"category": "Timebox", "description": "Weekly planning block", "typical_duration": "7 days", "keywords": ["weekly", "plan", "week"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, default_props = EXCLUDED.default_props, metadata = EXCLUDED.metadata, updated_at = now();

-- plan.campaign.base - Abstract campaign plan
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'plan', 'plan.campaign.base', 'Campaign Plan (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'plan.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"objective": {"type": "string"}, "channels": {"type": "array", "items": {"type": "string"}}, "budget": {"type": "number"}}}'::jsonb,
    '{"type_key": "plan.campaign.base", "initial": "draft", "states": ["draft", "planning", "active", "complete", "archived"], "transitions": [{"from": "draft", "to": "planning", "event": "plan"}, {"from": "planning", "to": "active", "event": "launch"}, {"from": "active", "to": "complete", "event": "complete"}, {"from": "complete", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Campaign", "description": "Multi-channel campaign plans"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- plan.campaign.marketing
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'plan', 'plan.campaign.marketing', 'Marketing Campaign', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'plan.campaign.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"target_audience": {"type": "string"}, "kpis": {"type": "array", "items": {"type": "string"}}, "messaging": {"type": "string"}}}'::jsonb,
    '{"type_key": "plan.campaign.marketing", "initial": "draft", "states": ["draft", "planning", "active", "complete", "archived"], "transitions": [{"from": "draft", "to": "planning", "event": "plan"}, {"from": "planning", "to": "active", "event": "launch"}, {"from": "active", "to": "complete", "event": "complete"}, {"from": "complete", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Campaign", "description": "Marketing campaign across multiple channels", "keywords": ["marketing", "campaign", "launch"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- plan.phase.base - Abstract phase plan
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'plan', 'plan.phase.base', 'Phase Plan (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'plan.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"phase_number": {"type": "integer"}, "deliverables": {"type": "array", "items": {"type": "string"}}}}'::jsonb,
    '{"type_key": "plan.phase.base", "initial": "draft", "states": ["draft", "active", "complete", "archived"], "transitions": [{"from": "draft", "to": "active", "event": "start"}, {"from": "active", "to": "complete", "event": "complete"}, {"from": "complete", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Phase", "description": "Project phase plans"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- plan.phase.project
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'plan', 'plan.phase.project', 'Project Phase', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'plan.phase.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"phase_name": {"type": "string"}, "entry_criteria": {"type": "array", "items": {"type": "string"}}, "exit_criteria": {"type": "array", "items": {"type": "string"}}}}'::jsonb,
    '{"type_key": "plan.phase.project", "initial": "draft", "states": ["draft", "active", "complete", "archived"], "transitions": [{"from": "draft", "to": "active", "event": "start"}, {"from": "active", "to": "complete", "event": "complete"}, {"from": "complete", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Phase", "description": "Generic project phase", "keywords": ["phase", "milestone", "stage"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- ============================================
-- GOAL TEMPLATES
-- ============================================

-- goal.base - Root abstract goal template
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'goal', 'goal.base', 'Goal (Abstract)', 'active', true,
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"description": {"type": "string"}, "success_criteria": {"type": "string"}, "target_date": {"type": "string", "format": "date"}}}'::jsonb,
    '{"type_key": "goal.base", "initial": "draft", "states": ["draft", "active", "achieved", "missed", "archived"], "transitions": [{"from": "draft", "to": "active", "event": "activate"}, {"from": "active", "to": "achieved", "event": "achieve"}, {"from": "active", "to": "missed", "event": "miss"}, {"from": "achieved", "to": "archived", "event": "archive"}, {"from": "missed", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Goal", "description": "Abstract base for all goal types"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- goal.outcome.base
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'goal', 'goal.outcome.base', 'Outcome Goal (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'goal.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"completion_criteria": {"type": "string"}}}'::jsonb,
    '{"type_key": "goal.outcome.base", "initial": "draft", "states": ["draft", "active", "achieved", "missed", "archived"], "transitions": [{"from": "draft", "to": "active", "event": "activate"}, {"from": "active", "to": "achieved", "event": "achieve"}, {"from": "active", "to": "missed", "event": "miss"}, {"from": "achieved", "to": "archived", "event": "archive"}, {"from": "missed", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Outcome", "description": "Binary completion goals"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- goal.outcome.project
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'goal', 'goal.outcome.project', 'Project Outcome', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'goal.outcome.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"deliverables": {"type": "array", "items": {"type": "string"}}}}'::jsonb,
    '{"type_key": "goal.outcome.project", "initial": "draft", "states": ["draft", "active", "achieved", "missed", "archived"], "transitions": [{"from": "draft", "to": "active", "event": "activate"}, {"from": "active", "to": "achieved", "event": "achieve"}, {"from": "active", "to": "missed", "event": "miss"}, {"from": "achieved", "to": "archived", "event": "archive"}, {"from": "missed", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Outcome", "description": "Project-level outcome goal", "keywords": ["launch", "publish", "ship", "complete"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- goal.metric.base
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'goal', 'goal.metric.base', 'Metric Goal (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'goal.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"target_value": {"type": "number"}, "unit": {"type": "string"}, "current_value": {"type": "number"}}}'::jsonb,
    '{"type_key": "goal.metric.base", "initial": "draft", "states": ["draft", "tracking", "achieved", "missed", "archived"], "transitions": [{"from": "draft", "to": "tracking", "event": "start"}, {"from": "tracking", "to": "achieved", "event": "achieve"}, {"from": "tracking", "to": "missed", "event": "miss"}, {"from": "achieved", "to": "archived", "event": "archive"}, {"from": "missed", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Metric", "description": "Numeric/quantitative target goals"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- goal.metric.revenue
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'goal', 'goal.metric.revenue', 'Revenue Goal', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'goal.metric.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"revenue_type": {"type": "string", "enum": ["mrr", "arr", "gmv", "revenue"]}}}'::jsonb,
    '{"type_key": "goal.metric.revenue", "initial": "draft", "states": ["draft", "tracking", "achieved", "missed", "archived"], "transitions": [{"from": "draft", "to": "tracking", "event": "start"}, {"from": "tracking", "to": "achieved", "event": "achieve"}, {"from": "tracking", "to": "missed", "event": "miss"}, {"from": "achieved", "to": "archived", "event": "archive"}, {"from": "missed", "to": "archived", "event": "archive"}]}'::jsonb,
    '{"unit": "USD"}'::jsonb, '[]'::jsonb,
    '{"category": "Metric", "description": "Revenue-based goal (MRR, ARR, GMV)", "keywords": ["revenue", "mrr", "arr", "income", "sales"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, default_props = EXCLUDED.default_props, metadata = EXCLUDED.metadata, updated_at = now();

-- goal.behavior.base
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'goal', 'goal.behavior.base', 'Behavior Goal (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'goal.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"frequency": {"type": "string"}, "streak_count": {"type": "integer"}}}'::jsonb,
    '{"type_key": "goal.behavior.base", "initial": "draft", "states": ["draft", "active", "achieved", "paused", "archived"], "transitions": [{"from": "draft", "to": "active", "event": "start"}, {"from": "active", "to": "achieved", "event": "achieve"}, {"from": "active", "to": "paused", "event": "pause"}, {"from": "paused", "to": "active", "event": "resume"}, {"from": "achieved", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Behavior", "description": "Frequency and consistency goals"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- goal.behavior.cadence
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'goal', 'goal.behavior.cadence', 'Cadence Goal', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'goal.behavior.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"target_frequency": {"type": "string"}, "activity": {"type": "string"}}}'::jsonb,
    '{"type_key": "goal.behavior.cadence", "initial": "draft", "states": ["draft", "active", "achieved", "paused", "archived"], "transitions": [{"from": "draft", "to": "active", "event": "start"}, {"from": "active", "to": "achieved", "event": "achieve"}, {"from": "active", "to": "paused", "event": "pause"}, {"from": "paused", "to": "active", "event": "resume"}, {"from": "achieved", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Behavior", "description": "Regular activity cadence goal", "keywords": ["habit", "routine", "daily", "weekly", "cadence"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- goal.learning.base
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'goal', 'goal.learning.base', 'Learning Goal (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'goal.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"skill_level": {"type": "string", "enum": ["beginner", "intermediate", "advanced", "expert"]}, "resources": {"type": "array", "items": {"type": "string"}}}}'::jsonb,
    '{"type_key": "goal.learning.base", "initial": "draft", "states": ["draft", "learning", "achieved", "paused", "archived"], "transitions": [{"from": "draft", "to": "learning", "event": "start"}, {"from": "learning", "to": "achieved", "event": "achieve"}, {"from": "learning", "to": "paused", "event": "pause"}, {"from": "paused", "to": "learning", "event": "resume"}, {"from": "achieved", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Learning", "description": "Skill development goals"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- goal.learning.skill
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'goal', 'goal.learning.skill', 'Skill Learning Goal', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'goal.learning.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"skill_name": {"type": "string"}, "proficiency_target": {"type": "string"}}}'::jsonb,
    '{"type_key": "goal.learning.skill", "initial": "draft", "states": ["draft", "learning", "achieved", "paused", "archived"], "transitions": [{"from": "draft", "to": "learning", "event": "start"}, {"from": "learning", "to": "achieved", "event": "achieve"}, {"from": "learning", "to": "paused", "event": "pause"}, {"from": "paused", "to": "learning", "event": "resume"}, {"from": "achieved", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Learning", "description": "Learn a specific skill", "keywords": ["learn", "skill", "training", "education"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- ============================================
-- DOCUMENT TEMPLATES
-- ============================================

-- document.base - Root abstract document template
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'document', 'document.base', 'Document (Abstract)', 'active', true,
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"body": {"type": "string"}, "summary": {"type": "string"}}}'::jsonb,
    '{"type_key": "document.base", "initial": "draft", "states": ["draft", "review", "approved", "archived"], "transitions": [{"from": "draft", "to": "review", "event": "submit"}, {"from": "review", "to": "approved", "event": "approve"}, {"from": "review", "to": "draft", "event": "reject"}, {"from": "approved", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Document", "description": "Abstract base for all document types"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- document.context.base
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'document', 'document.context.base', 'Context Document (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'document.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"background": {"type": "string"}, "objectives": {"type": "array", "items": {"type": "string"}}}}'::jsonb,
    '{"type_key": "document.context.base", "initial": "draft", "states": ["draft", "active", "archived"], "transitions": [{"from": "draft", "to": "active", "event": "activate"}, {"from": "active", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Context", "description": "Big picture, intent, and constraints"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- document.context.project
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'document', 'document.context.project', 'Project Context', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'document.context.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"project_vision": {"type": "string"}, "stakeholders": {"type": "array", "items": {"type": "string"}}, "constraints": {"type": "array", "items": {"type": "string"}}}}'::jsonb,
    '{"type_key": "document.context.project", "initial": "draft", "states": ["draft", "active", "archived"], "transitions": [{"from": "draft", "to": "active", "event": "activate"}, {"from": "active", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Context", "description": "Canonical project context document", "keywords": ["context", "project", "overview", "background"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- document.knowledge.base
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'document', 'document.knowledge.base', 'Knowledge Document (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'document.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"findings": {"type": "array", "items": {"type": "string"}}, "sources": {"type": "array", "items": {"type": "string"}}}}'::jsonb,
    '{"type_key": "document.knowledge.base", "initial": "draft", "states": ["draft", "review", "approved", "archived"], "transitions": [{"from": "draft", "to": "review", "event": "submit"}, {"from": "review", "to": "approved", "event": "approve"}, {"from": "review", "to": "draft", "event": "reject"}, {"from": "approved", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Knowledge", "description": "Research, findings, and raw learning"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- document.knowledge.research
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'document', 'document.knowledge.research', 'Research Document', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'document.knowledge.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"research_questions": {"type": "array", "items": {"type": "string"}}, "methodology": {"type": "string"}, "conclusions": {"type": "string"}}}'::jsonb,
    '{"type_key": "document.knowledge.research", "initial": "draft", "states": ["draft", "review", "approved", "archived"], "transitions": [{"from": "draft", "to": "review", "event": "submit"}, {"from": "review", "to": "approved", "event": "approve"}, {"from": "review", "to": "draft", "event": "reject"}, {"from": "approved", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Knowledge", "description": "Research notes and findings", "keywords": ["research", "study", "analysis", "investigation"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- document.decision.base
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'document', 'document.decision.base', 'Decision Document (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'document.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"decision": {"type": "string"}, "rationale": {"type": "string"}, "alternatives": {"type": "array", "items": {"type": "string"}}}}'::jsonb,
    '{"type_key": "document.decision.base", "initial": "draft", "states": ["draft", "proposed", "approved", "archived"], "transitions": [{"from": "draft", "to": "proposed", "event": "propose"}, {"from": "proposed", "to": "approved", "event": "approve"}, {"from": "proposed", "to": "draft", "event": "reject"}, {"from": "approved", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Decision", "description": "Decisions and commitments"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- document.decision.meeting_notes
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'document', 'document.decision.meeting_notes', 'Meeting Notes', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'document.decision.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"attendees": {"type": "array", "items": {"type": "string"}}, "agenda": {"type": "array", "items": {"type": "string"}}, "action_items": {"type": "array", "items": {"type": "string"}}, "decisions_made": {"type": "array", "items": {"type": "string"}}}}'::jsonb,
    '{"type_key": "document.decision.meeting_notes", "initial": "draft", "states": ["draft", "published", "archived"], "transitions": [{"from": "draft", "to": "published", "event": "publish"}, {"from": "published", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Decision", "description": "Meeting notes with decisions and action items", "keywords": ["meeting", "notes", "minutes", "decisions"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- ============================================
-- OUTPUT TEMPLATES
-- ============================================

-- output.base - Root abstract output template
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'output', 'output.base', 'Output (Abstract)', 'active', true,
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"description": {"type": "string"}, "format": {"type": "string"}}}'::jsonb,
    '{"type_key": "output.base", "initial": "draft", "states": ["draft", "review", "approved", "published", "archived"], "transitions": [{"from": "draft", "to": "review", "event": "submit"}, {"from": "review", "to": "approved", "event": "approve"}, {"from": "review", "to": "draft", "event": "reject"}, {"from": "approved", "to": "published", "event": "publish"}, {"from": "published", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Output", "description": "Abstract base for all output types"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- output.written.base
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'output', 'output.written.base', 'Written Output (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'output.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"word_count": {"type": "integer"}, "content": {"type": "string"}}}'::jsonb,
    '{"type_key": "output.written.base", "initial": "draft", "states": ["draft", "writing", "editing", "review", "published", "archived"], "transitions": [{"from": "draft", "to": "writing", "event": "start"}, {"from": "writing", "to": "editing", "event": "complete_draft"}, {"from": "editing", "to": "review", "event": "submit"}, {"from": "review", "to": "published", "event": "publish"}, {"from": "review", "to": "editing", "event": "revise"}, {"from": "published", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Written", "description": "Long-form text and structured writing"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- output.written.chapter
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'output', 'output.written.chapter', 'Book Chapter', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'output.written.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"chapter_number": {"type": "integer"}, "chapter_title": {"type": "string"}, "target_word_count": {"type": "integer"}}}'::jsonb,
    '{"type_key": "output.written.chapter", "initial": "draft", "states": ["draft", "writing", "editing", "review", "published", "archived"], "transitions": [{"from": "draft", "to": "writing", "event": "start"}, {"from": "writing", "to": "editing", "event": "complete_draft"}, {"from": "editing", "to": "review", "event": "submit"}, {"from": "review", "to": "published", "event": "publish"}, {"from": "review", "to": "editing", "event": "revise"}, {"from": "published", "to": "archived", "event": "archive"}]}'::jsonb,
    '{"target_word_count": 5000}'::jsonb, '[]'::jsonb,
    '{"category": "Written", "description": "Book chapter", "keywords": ["chapter", "book", "writing"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, default_props = EXCLUDED.default_props, metadata = EXCLUDED.metadata, updated_at = now();

-- output.written.article
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'output', 'output.written.article', 'Article', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'output.written.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"headline": {"type": "string"}, "subheadline": {"type": "string"}, "keywords": {"type": "array", "items": {"type": "string"}}}}'::jsonb,
    '{"type_key": "output.written.article", "initial": "draft", "states": ["draft", "writing", "editing", "review", "published", "archived"], "transitions": [{"from": "draft", "to": "writing", "event": "start"}, {"from": "writing", "to": "editing", "event": "complete_draft"}, {"from": "editing", "to": "review", "event": "submit"}, {"from": "review", "to": "published", "event": "publish"}, {"from": "review", "to": "editing", "event": "revise"}, {"from": "published", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Written", "description": "Article or essay", "keywords": ["article", "essay", "writing", "content"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- output.media.base
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'output', 'output.media.base', 'Media Output (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'output.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"file_format": {"type": "string"}, "dimensions": {"type": "string"}}}'::jsonb,
    '{"type_key": "output.media.base", "initial": "draft", "states": ["draft", "production", "review", "approved", "archived"], "transitions": [{"from": "draft", "to": "production", "event": "start"}, {"from": "production", "to": "review", "event": "complete"}, {"from": "review", "to": "approved", "event": "approve"}, {"from": "review", "to": "production", "event": "revise"}, {"from": "approved", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Media", "description": "Visual, audio, and video artifacts"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- output.media.design_mockup
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'output', 'output.media.design_mockup', 'Design Mockup', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'output.media.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"design_tool": {"type": "string"}, "figma_url": {"type": "string"}, "iterations": {"type": "integer"}}}'::jsonb,
    '{"type_key": "output.media.design_mockup", "initial": "draft", "states": ["draft", "production", "review", "approved", "archived"], "transitions": [{"from": "draft", "to": "production", "event": "start"}, {"from": "production", "to": "review", "event": "complete"}, {"from": "review", "to": "approved", "event": "approve"}, {"from": "review", "to": "production", "event": "revise"}, {"from": "approved", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Media", "description": "Design mockup or Figma frame", "keywords": ["design", "mockup", "figma", "ui", "ux"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- output.software.base
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'output', 'output.software.base', 'Software Output (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'output.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"version": {"type": "string"}, "repository_url": {"type": "string"}}}'::jsonb,
    '{"type_key": "output.software.base", "initial": "draft", "states": ["draft", "development", "testing", "staged", "released", "archived"], "transitions": [{"from": "draft", "to": "development", "event": "start"}, {"from": "development", "to": "testing", "event": "complete"}, {"from": "testing", "to": "staged", "event": "approve"}, {"from": "testing", "to": "development", "event": "reject"}, {"from": "staged", "to": "released", "event": "release"}, {"from": "released", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Software", "description": "Code, releases, and APIs"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- output.software.feature
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'output', 'output.software.feature', 'Software Feature', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'output.software.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"feature_name": {"type": "string"}, "acceptance_criteria": {"type": "array", "items": {"type": "string"}}, "pr_url": {"type": "string"}}}'::jsonb,
    '{"type_key": "output.software.feature", "initial": "draft", "states": ["draft", "development", "testing", "staged", "released", "archived"], "transitions": [{"from": "draft", "to": "development", "event": "start"}, {"from": "development", "to": "testing", "event": "complete"}, {"from": "testing", "to": "staged", "event": "approve"}, {"from": "testing", "to": "development", "event": "reject"}, {"from": "staged", "to": "released", "event": "release"}, {"from": "released", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Software", "description": "Shipped software feature", "keywords": ["feature", "ship", "deploy", "release"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- output.operational.base
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'output', 'output.operational.base', 'Operational Output (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'output.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"audience": {"type": "string"}, "frequency": {"type": "string"}}}'::jsonb,
    '{"type_key": "output.operational.base", "initial": "draft", "states": ["draft", "review", "approved", "active", "archived"], "transitions": [{"from": "draft", "to": "review", "event": "submit"}, {"from": "review", "to": "approved", "event": "approve"}, {"from": "review", "to": "draft", "event": "reject"}, {"from": "approved", "to": "active", "event": "activate"}, {"from": "active", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Operational", "description": "Business and ops deliverables"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- output.operational.report
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'output', 'output.operational.report', 'Report', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'output.operational.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"report_type": {"type": "string"}, "period": {"type": "string"}, "metrics": {"type": "array", "items": {"type": "string"}}}}'::jsonb,
    '{"type_key": "output.operational.report", "initial": "draft", "states": ["draft", "review", "approved", "published", "archived"], "transitions": [{"from": "draft", "to": "review", "event": "submit"}, {"from": "review", "to": "approved", "event": "approve"}, {"from": "review", "to": "draft", "event": "reject"}, {"from": "approved", "to": "published", "event": "publish"}, {"from": "published", "to": "archived", "event": "archive"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Operational", "description": "Recurring or ad-hoc report", "keywords": ["report", "analytics", "metrics", "dashboard"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- ============================================
-- RISK TEMPLATES
-- ============================================

-- risk.base - Root abstract risk template
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'risk', 'risk.base', 'Risk (Abstract)', 'active', true,
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"description": {"type": "string"}, "probability": {"type": "number", "minimum": 0, "maximum": 1}, "impact": {"type": "string", "enum": ["low", "medium", "high", "critical"]}, "mitigation": {"type": "string"}}}'::jsonb,
    '{"type_key": "risk.base", "initial": "identified", "states": ["identified", "analyzing", "mitigating", "monitoring", "occurred", "closed"], "transitions": [{"from": "identified", "to": "analyzing", "event": "analyze"}, {"from": "analyzing", "to": "mitigating", "event": "mitigate"}, {"from": "mitigating", "to": "monitoring", "event": "monitor"}, {"from": "monitoring", "to": "occurred", "event": "trigger"}, {"from": "monitoring", "to": "closed", "event": "close"}, {"from": "occurred", "to": "closed", "event": "resolve"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Risk", "description": "Abstract base for all risk types"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- risk.technical.base
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'risk', 'risk.technical.base', 'Technical Risk (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'risk.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"technical_domain": {"type": "string"}, "affected_systems": {"type": "array", "items": {"type": "string"}}}}'::jsonb,
    '{"type_key": "risk.technical.base", "initial": "identified", "states": ["identified", "analyzing", "mitigating", "monitoring", "occurred", "closed"], "transitions": [{"from": "identified", "to": "analyzing", "event": "analyze"}, {"from": "analyzing", "to": "mitigating", "event": "mitigate"}, {"from": "mitigating", "to": "monitoring", "event": "monitor"}, {"from": "monitoring", "to": "occurred", "event": "trigger"}, {"from": "monitoring", "to": "closed", "event": "close"}, {"from": "occurred", "to": "closed", "event": "resolve"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Technical", "description": "Tech, architecture, security, and reliability risks"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- risk.technical.security
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'risk', 'risk.technical.security', 'Security Risk', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'risk.technical.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"threat_vector": {"type": "string"}, "vulnerability_type": {"type": "string"}, "affected_assets": {"type": "array", "items": {"type": "string"}}}}'::jsonb,
    '{"type_key": "risk.technical.security", "initial": "identified", "states": ["identified", "analyzing", "mitigating", "monitoring", "occurred", "closed"], "transitions": [{"from": "identified", "to": "analyzing", "event": "analyze"}, {"from": "analyzing", "to": "mitigating", "event": "mitigate"}, {"from": "mitigating", "to": "monitoring", "event": "monitor"}, {"from": "monitoring", "to": "occurred", "event": "trigger"}, {"from": "monitoring", "to": "closed", "event": "close"}, {"from": "occurred", "to": "closed", "event": "resolve"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Technical", "description": "Security-specific technical risk", "keywords": ["security", "vulnerability", "threat", "breach"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- risk.schedule.base
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'risk', 'risk.schedule.base', 'Schedule Risk (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'risk.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"deadline": {"type": "string", "format": "date"}, "delay_days": {"type": "integer"}}}'::jsonb,
    '{"type_key": "risk.schedule.base", "initial": "identified", "states": ["identified", "analyzing", "mitigating", "monitoring", "occurred", "closed"], "transitions": [{"from": "identified", "to": "analyzing", "event": "analyze"}, {"from": "analyzing", "to": "mitigating", "event": "mitigate"}, {"from": "mitigating", "to": "monitoring", "event": "monitor"}, {"from": "monitoring", "to": "occurred", "event": "trigger"}, {"from": "monitoring", "to": "closed", "event": "close"}, {"from": "occurred", "to": "closed", "event": "resolve"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Schedule", "description": "Timing and deadline risks"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- risk.schedule.dependency
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'risk', 'risk.schedule.dependency', 'Dependency Risk', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'risk.schedule.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"dependent_on": {"type": "string"}, "expected_delivery": {"type": "string", "format": "date"}}}'::jsonb,
    '{"type_key": "risk.schedule.dependency", "initial": "identified", "states": ["identified", "analyzing", "mitigating", "monitoring", "occurred", "closed"], "transitions": [{"from": "identified", "to": "analyzing", "event": "analyze"}, {"from": "analyzing", "to": "mitigating", "event": "mitigate"}, {"from": "mitigating", "to": "monitoring", "event": "monitor"}, {"from": "monitoring", "to": "occurred", "event": "trigger"}, {"from": "monitoring", "to": "closed", "event": "close"}, {"from": "occurred", "to": "closed", "event": "resolve"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Schedule", "description": "Timing risk from external dependencies", "keywords": ["dependency", "delay", "blocker", "external"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- risk.resource.base
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'risk', 'risk.resource.base', 'Resource Risk (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'risk.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"resource_type": {"type": "string"}, "shortage_impact": {"type": "string"}}}'::jsonb,
    '{"type_key": "risk.resource.base", "initial": "identified", "states": ["identified", "analyzing", "mitigating", "monitoring", "occurred", "closed"], "transitions": [{"from": "identified", "to": "analyzing", "event": "analyze"}, {"from": "analyzing", "to": "mitigating", "event": "mitigate"}, {"from": "mitigating", "to": "monitoring", "event": "monitor"}, {"from": "monitoring", "to": "occurred", "event": "trigger"}, {"from": "monitoring", "to": "closed", "event": "close"}, {"from": "occurred", "to": "closed", "event": "resolve"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Resource", "description": "People, skills, and bandwidth risks"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- risk.resource.skill_gap
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'risk', 'risk.resource.skill_gap', 'Skill Gap Risk', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'risk.resource.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"missing_skill": {"type": "string"}, "training_plan": {"type": "string"}, "hiring_option": {"type": "boolean"}}}'::jsonb,
    '{"type_key": "risk.resource.skill_gap", "initial": "identified", "states": ["identified", "analyzing", "mitigating", "monitoring", "occurred", "closed"], "transitions": [{"from": "identified", "to": "analyzing", "event": "analyze"}, {"from": "analyzing", "to": "mitigating", "event": "mitigate"}, {"from": "mitigating", "to": "monitoring", "event": "monitor"}, {"from": "monitoring", "to": "occurred", "event": "trigger"}, {"from": "monitoring", "to": "closed", "event": "close"}, {"from": "occurred", "to": "closed", "event": "resolve"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Resource", "description": "Missing expertise or skill gap", "keywords": ["skill", "expertise", "gap", "training", "hiring"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- ============================================
-- EVENT TEMPLATES
-- ============================================

-- event.base - Root abstract event template
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'event', 'event.base', 'Event (Abstract)', 'active', true,
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"title": {"type": "string"}, "start_at": {"type": "string", "format": "date-time"}, "end_at": {"type": "string", "format": "date-time"}, "all_day": {"type": "boolean"}}}'::jsonb,
    '{"type_key": "event.base", "initial": "scheduled", "states": ["scheduled", "in_progress", "completed", "cancelled"], "transitions": [{"from": "scheduled", "to": "in_progress", "event": "start"}, {"from": "in_progress", "to": "completed", "event": "complete"}, {"from": "scheduled", "to": "cancelled", "event": "cancel"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Event", "description": "Abstract base for all event types"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- event.work.base
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'event', 'event.work.base', 'Work Event (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'event.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"focus_area": {"type": "string"}, "energy_level": {"type": "string", "enum": ["low", "medium", "high"]}}}'::jsonb,
    '{"type_key": "event.work.base", "initial": "scheduled", "states": ["scheduled", "in_progress", "completed", "cancelled"], "transitions": [{"from": "scheduled", "to": "in_progress", "event": "start"}, {"from": "in_progress", "to": "completed", "event": "complete"}, {"from": "scheduled", "to": "cancelled", "event": "cancel"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Work", "description": "Individual work sessions and focus time"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- event.work.focus_block
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'event', 'event.work.focus_block', 'Focus Block', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'event.work.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"task_ids": {"type": "array", "items": {"type": "string"}}, "distractions_blocked": {"type": "boolean"}}}'::jsonb,
    '{"type_key": "event.work.focus_block", "initial": "scheduled", "states": ["scheduled", "in_progress", "completed", "cancelled"], "transitions": [{"from": "scheduled", "to": "in_progress", "event": "start"}, {"from": "in_progress", "to": "completed", "event": "complete"}, {"from": "scheduled", "to": "cancelled", "event": "cancel"}]}'::jsonb,
    '{"distractions_blocked": true}'::jsonb, '[]'::jsonb,
    '{"category": "Work", "description": "Deep work focus block", "keywords": ["focus", "deep work", "concentration", "productivity"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, default_props = EXCLUDED.default_props, metadata = EXCLUDED.metadata, updated_at = now();

-- event.collab.base
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'event', 'event.collab.base', 'Collaboration Event (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'event.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"participants": {"type": "array", "items": {"type": "string"}}, "meeting_link": {"type": "string"}}}'::jsonb,
    '{"type_key": "event.collab.base", "initial": "scheduled", "states": ["scheduled", "in_progress", "completed", "cancelled"], "transitions": [{"from": "scheduled", "to": "in_progress", "event": "start"}, {"from": "in_progress", "to": "completed", "event": "complete"}, {"from": "scheduled", "to": "cancelled", "event": "cancel"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Collaboration", "description": "Coordination with others"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- event.collab.meeting.base
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'event', 'event.collab.meeting.base', 'Meeting (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'event.collab.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"agenda": {"type": "array", "items": {"type": "string"}}, "notes": {"type": "string"}, "action_items": {"type": "array", "items": {"type": "string"}}}}'::jsonb,
    '{"type_key": "event.collab.meeting.base", "initial": "scheduled", "states": ["scheduled", "in_progress", "completed", "cancelled"], "transitions": [{"from": "scheduled", "to": "in_progress", "event": "start"}, {"from": "in_progress", "to": "completed", "event": "complete"}, {"from": "scheduled", "to": "cancelled", "event": "cancel"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Collaboration", "description": "Abstract meeting template"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- event.collab.meeting.standup
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'event', 'event.collab.meeting.standup', 'Standup Meeting', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'event.collab.meeting.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"yesterday": {"type": "string"}, "today": {"type": "string"}, "blockers": {"type": "array", "items": {"type": "string"}}}}'::jsonb,
    '{"type_key": "event.collab.meeting.standup", "initial": "scheduled", "states": ["scheduled", "in_progress", "completed", "cancelled"], "transitions": [{"from": "scheduled", "to": "in_progress", "event": "start"}, {"from": "in_progress", "to": "completed", "event": "complete"}, {"from": "scheduled", "to": "cancelled", "event": "cancel"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Collaboration", "description": "Daily standup meeting", "keywords": ["standup", "daily", "sync", "scrum"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- event.marker.base
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'event', 'event.marker.base', 'Marker Event (Abstract)', 'active', true,
    (SELECT id FROM onto_templates WHERE type_key = 'event.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"marker_type": {"type": "string"}}}'::jsonb,
    '{"type_key": "event.marker.base", "initial": "active", "states": ["active", "passed", "cancelled"], "transitions": [{"from": "active", "to": "passed", "event": "pass"}, {"from": "active", "to": "cancelled", "event": "cancel"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Marker", "description": "Deadlines, reminders, and status markers"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- event.marker.deadline
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'event', 'event.marker.deadline', 'Deadline', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'event.marker.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"deliverable": {"type": "string"}, "hard_deadline": {"type": "boolean"}}}'::jsonb,
    '{"type_key": "event.marker.deadline", "initial": "active", "states": ["active", "met", "missed", "cancelled"], "transitions": [{"from": "active", "to": "met", "event": "meet"}, {"from": "active", "to": "missed", "event": "miss"}, {"from": "active", "to": "cancelled", "event": "cancel"}]}'::jsonb,
    '{"hard_deadline": false}'::jsonb, '[]'::jsonb,
    '{"category": "Marker", "description": "Project deadline marker", "keywords": ["deadline", "due", "target"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, default_props = EXCLUDED.default_props, metadata = EXCLUDED.metadata, updated_at = now();

-- ============================================
-- REQUIREMENT TEMPLATES
-- Format: requirement.{type}[.{category}]
-- ============================================

-- requirement.base - Root abstract requirement template
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'requirement', 'requirement.base', 'Requirement (Abstract)', 'active', true, null,
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"title": {"type": "string"}, "description": {"type": "string"}, "rationale": {"type": "string"}, "priority": {"type": "string", "enum": ["must_have", "should_have", "could_have", "wont_have"]}, "source": {"type": "string"}, "stakeholders": {"type": "array", "items": {"type": "string"}}, "acceptance_criteria": {"type": "array", "items": {"type": "string"}}, "dependencies": {"type": "array", "items": {"type": "string"}}, "version": {"type": "string"}}, "required": ["title", "priority"]}'::jsonb,
    '{"type_key": "requirement.base", "initial": "draft", "states": ["draft", "proposed", "approved", "implemented", "verified", "deferred", "rejected"], "transitions": [{"from": "draft", "to": "proposed", "event": "propose"}, {"from": "proposed", "to": "approved", "event": "approve"}, {"from": "proposed", "to": "rejected", "event": "reject"}, {"from": "proposed", "to": "deferred", "event": "defer"}, {"from": "approved", "to": "implemented", "event": "implement"}, {"from": "implemented", "to": "verified", "event": "verify"}, {"from": "implemented", "to": "approved", "event": "fail_verification"}, {"from": "deferred", "to": "proposed", "event": "reactivate"}]}'::jsonb,
    '{"priority": "should_have", "version": "1.0"}'::jsonb, '[]'::jsonb,
    '{"category": "Requirement", "description": "Abstract base for all requirement types"}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- requirement.functional
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'requirement', 'requirement.functional', 'Functional Requirement', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'requirement.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"feature_area": {"type": "string"}, "user_story": {"type": "string"}, "preconditions": {"type": "array", "items": {"type": "string"}}, "postconditions": {"type": "array", "items": {"type": "string"}}, "test_cases": {"type": "array", "items": {"type": "string"}}, "ui_mockup_url": {"type": "string", "format": "uri"}}}'::jsonb,
    '{"type_key": "requirement.functional", "initial": "draft", "states": ["draft", "proposed", "approved", "implemented", "verified", "deferred", "rejected"], "transitions": [{"from": "draft", "to": "proposed", "event": "propose"}, {"from": "proposed", "to": "approved", "event": "approve"}, {"from": "proposed", "to": "rejected", "event": "reject"}, {"from": "proposed", "to": "deferred", "event": "defer"}, {"from": "approved", "to": "implemented", "event": "implement"}, {"from": "implemented", "to": "verified", "event": "verify"}, {"from": "implemented", "to": "approved", "event": "fail_verification"}, {"from": "deferred", "to": "proposed", "event": "reactivate"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Functional", "description": "What the system should do", "keywords": ["feature", "user story", "functionality"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- requirement.non_functional
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'requirement', 'requirement.non_functional', 'Non-Functional Requirement', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'requirement.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"quality_attribute": {"type": "string", "enum": ["performance", "scalability", "reliability", "availability", "security", "usability", "maintainability", "portability"]}, "metric": {"type": "string"}, "target_value": {"type": "string"}, "current_value": {"type": "string"}, "measurement_method": {"type": "string"}, "environment": {"type": "string"}}}'::jsonb,
    '{"type_key": "requirement.non_functional", "initial": "draft", "states": ["draft", "proposed", "approved", "implemented", "verified", "deferred", "rejected"], "transitions": [{"from": "draft", "to": "proposed", "event": "propose"}, {"from": "proposed", "to": "approved", "event": "approve"}, {"from": "proposed", "to": "rejected", "event": "reject"}, {"from": "proposed", "to": "deferred", "event": "defer"}, {"from": "approved", "to": "implemented", "event": "implement"}, {"from": "implemented", "to": "verified", "event": "verify"}, {"from": "implemented", "to": "approved", "event": "fail_verification"}, {"from": "deferred", "to": "proposed", "event": "reactivate"}]}'::jsonb,
    '{}'::jsonb, '[]'::jsonb,
    '{"category": "Non-Functional", "description": "How the system should perform", "keywords": ["performance", "security", "scalability", "quality"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, metadata = EXCLUDED.metadata, updated_at = now();

-- requirement.constraint
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'requirement', 'requirement.constraint', 'Constraint', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'requirement.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"constraint_type": {"type": "string", "enum": ["technical", "business", "regulatory", "resource", "time", "budget"]}, "imposed_by": {"type": "string"}, "negotiable": {"type": "boolean"}, "workarounds": {"type": "array", "items": {"type": "string"}}, "expiration": {"type": "string", "format": "date"}}}'::jsonb,
    '{"type_key": "requirement.constraint", "initial": "draft", "states": ["draft", "proposed", "approved", "implemented", "verified", "deferred", "rejected"], "transitions": [{"from": "draft", "to": "proposed", "event": "propose"}, {"from": "proposed", "to": "approved", "event": "approve"}, {"from": "proposed", "to": "rejected", "event": "reject"}, {"from": "proposed", "to": "deferred", "event": "defer"}, {"from": "approved", "to": "implemented", "event": "implement"}, {"from": "implemented", "to": "verified", "event": "verify"}, {"from": "implemented", "to": "approved", "event": "fail_verification"}, {"from": "deferred", "to": "proposed", "event": "reactivate"}]}'::jsonb,
    '{"negotiable": false}'::jsonb, '[]'::jsonb,
    '{"category": "Constraint", "description": "Limitations or restrictions on the solution", "keywords": ["constraint", "limitation", "restriction", "budget", "regulatory"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, default_props = EXCLUDED.default_props, metadata = EXCLUDED.metadata, updated_at = now();

-- requirement.assumption
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'requirement', 'requirement.assumption', 'Assumption', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'requirement.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"assumption_basis": {"type": "string"}, "confidence_level": {"type": "string", "enum": ["high", "medium", "low"]}, "validation_method": {"type": "string"}, "validation_date": {"type": "string", "format": "date"}, "risk_if_wrong": {"type": "string"}, "validated": {"type": "boolean"}}}'::jsonb,
    '{"type_key": "requirement.assumption", "initial": "unvalidated", "states": ["unvalidated", "validating", "validated", "invalidated"], "transitions": [{"from": "unvalidated", "to": "validating", "event": "start_validation"}, {"from": "validating", "to": "validated", "event": "confirm"}, {"from": "validating", "to": "invalidated", "event": "disprove"}]}'::jsonb,
    '{"confidence_level": "medium", "validated": false}'::jsonb, '[]'::jsonb,
    '{"category": "Assumption", "description": "Working assumptions that need validation", "keywords": ["assumption", "hypothesis", "belief"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, default_props = EXCLUDED.default_props, metadata = EXCLUDED.metadata, updated_at = now();

-- requirement.dependency
INSERT INTO onto_templates (
    scope, type_key, name, status, is_abstract, parent_template_id, created_by,
    schema, fsm, default_props, default_views, metadata
) VALUES (
    'requirement', 'requirement.dependency', 'External Dependency', 'active', false,
    (SELECT id FROM onto_templates WHERE type_key = 'requirement.base' LIMIT 1),
    '00000000-0000-0000-0000-000000000000',
    '{"type": "object", "properties": {"dependency_type": {"type": "string", "enum": ["api", "service", "data", "system", "vendor", "team"]}, "external_party": {"type": "string"}, "contact_info": {"type": "string"}, "sla": {"type": "string"}, "required_by": {"type": "string", "format": "date"}, "fallback_plan": {"type": "string"}, "integration_status": {"type": "string", "enum": ["planned", "in_progress", "complete", "blocked"]}}}'::jsonb,
    '{"type_key": "requirement.dependency", "initial": "identified", "states": ["identified", "negotiating", "agreed", "available", "integrated", "blocked"], "transitions": [{"from": "identified", "to": "negotiating", "event": "engage"}, {"from": "negotiating", "to": "agreed", "event": "agree"}, {"from": "agreed", "to": "available", "event": "provision"}, {"from": "available", "to": "integrated", "event": "integrate"}, {"from": "negotiating", "to": "blocked", "event": "block"}, {"from": "blocked", "to": "negotiating", "event": "unblock"}]}'::jsonb,
    '{"integration_status": "planned"}'::jsonb, '[]'::jsonb,
    '{"category": "Dependency", "description": "External dependencies the project relies on", "keywords": ["dependency", "external", "integration", "vendor", "api"]}'::jsonb
) ON CONFLICT (scope, type_key) DO UPDATE SET
    name = EXCLUDED.name, parent_template_id = EXCLUDED.parent_template_id, schema = EXCLUDED.schema, fsm = EXCLUDED.fsm, default_props = EXCLUDED.default_props, metadata = EXCLUDED.metadata, updated_at = now();

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Family-based templates seeded successfully';
    RAISE NOTICE '- Plan templates: 7 (1 root + 3 family bases + 3 concrete)';
    RAISE NOTICE '- Goal templates: 9 (1 root + 4 family bases + 4 concrete)';
    RAISE NOTICE '- Document templates: 7 (1 root + 3 family bases + 3 concrete)';
    RAISE NOTICE '- Output templates: 9 (1 root + 4 family bases + 4 concrete)';
    RAISE NOTICE '- Risk templates: 7 (1 root + 3 family bases + 3 concrete)';
    RAISE NOTICE '- Event templates: 8 (1 root + 3 family bases + 4 concrete)';
    RAISE NOTICE '- Requirement templates: 6 (1 root + 5 concrete)';
    RAISE NOTICE 'Total: 53 templates';
END $$;
