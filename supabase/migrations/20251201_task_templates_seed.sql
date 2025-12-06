-- Migration: Seed task templates for onto_templates
-- Implements the task type_key taxonomy with 8 base work modes + 4 v1 specializations
--
-- Task Type Key Format: task.{work_mode}[.{specialization}]
--
-- 8 Base Work Modes (canonical task families):
--   task.create, task.refine, task.research, task.review,
--   task.coordinate, task.admin, task.plan, task.execute
--
-- 4 v1 Specializations (workflow patterns only):
--   task.coordinate.meeting, task.coordinate.standup,
--   task.execute.deploy, task.execute.checklist

-- Common FSM for all tasks: todo -> in_progress -> blocked -> done -> archived
-- with standard transitions

-- ============================================
-- BASE WORK MODE TEMPLATES
-- ============================================

-- task.execute - General execution/completion of work
insert into onto_templates (
    scope,
    type_key,
    name,
    status,
    is_abstract,
    created_by,
    schema,
    fsm,
    default_props,
    default_views,
    metadata
) values (
    'task',
    'task.execute',
    'Execute Task',
    'active',
    false,
    '00000000-0000-0000-0000-000000000000',
    '{
        "type": "object",
        "properties": {
            "description": { "type": "string" },
            "acceptance_criteria": { "type": "array", "items": { "type": "string" } },
            "blockers": { "type": "array", "items": { "type": "string" } }
        }
    }'::jsonb,
    '{
        "type_key": "task.execute",
        "initial": "todo",
        "states": ["todo", "in_progress", "blocked", "done", "archived"],
        "transitions": [
            { "from": "todo", "to": "in_progress", "event": "start" },
            { "from": "in_progress", "to": "blocked", "event": "block" },
            { "from": "in_progress", "to": "done", "event": "complete" },
            { "from": "blocked", "to": "in_progress", "event": "unblock" },
            { "from": "done", "to": "archived", "event": "archive" },
            { "from": "todo", "to": "archived", "event": "cancel" }
        ]
    }'::jsonb,
    '{}'::jsonb,
    '[]'::jsonb,
    '{
        "category": "Execution",
        "description": "General task for executing and completing work items",
        "typical_duration": "1-4 hours",
        "keywords": ["execute", "do", "complete", "finish", "implement"]
    }'::jsonb
) on conflict (scope, type_key) do update set
    name = excluded.name,
    schema = excluded.schema,
    fsm = excluded.fsm,
    metadata = excluded.metadata,
    updated_at = now();

-- task.create - Creating new artifacts, content, or features
insert into onto_templates (
    scope,
    type_key,
    name,
    status,
    is_abstract,
    created_by,
    schema,
    fsm,
    default_props,
    default_views,
    metadata
) values (
    'task',
    'task.create',
    'Create Task',
    'active',
    false,
    '00000000-0000-0000-0000-000000000000',
    '{
        "type": "object",
        "properties": {
            "description": { "type": "string" },
            "output_type": { "type": "string", "description": "Type of artifact being created" },
            "acceptance_criteria": { "type": "array", "items": { "type": "string" } }
        }
    }'::jsonb,
    '{
        "type_key": "task.create",
        "initial": "todo",
        "states": ["todo", "in_progress", "blocked", "done", "archived"],
        "transitions": [
            { "from": "todo", "to": "in_progress", "event": "start" },
            { "from": "in_progress", "to": "blocked", "event": "block" },
            { "from": "in_progress", "to": "done", "event": "complete" },
            { "from": "blocked", "to": "in_progress", "event": "unblock" },
            { "from": "done", "to": "archived", "event": "archive" },
            { "from": "todo", "to": "archived", "event": "cancel" }
        ]
    }'::jsonb,
    '{}'::jsonb,
    '[]'::jsonb,
    '{
        "category": "Creation",
        "description": "Task for creating new artifacts, content, or features from scratch",
        "typical_duration": "2-8 hours",
        "keywords": ["create", "build", "make", "write", "design", "develop", "author"]
    }'::jsonb
) on conflict (scope, type_key) do update set
    name = excluded.name,
    schema = excluded.schema,
    fsm = excluded.fsm,
    metadata = excluded.metadata,
    updated_at = now();

-- task.refine - Improving, editing, or iterating on existing work
insert into onto_templates (
    scope,
    type_key,
    name,
    status,
    is_abstract,
    created_by,
    schema,
    fsm,
    default_props,
    default_views,
    metadata
) values (
    'task',
    'task.refine',
    'Refine Task',
    'active',
    false,
    '00000000-0000-0000-0000-000000000000',
    '{
        "type": "object",
        "properties": {
            "description": { "type": "string" },
            "target_artifact": { "type": "string", "description": "What is being refined" },
            "improvement_goals": { "type": "array", "items": { "type": "string" } }
        }
    }'::jsonb,
    '{
        "type_key": "task.refine",
        "initial": "todo",
        "states": ["todo", "in_progress", "blocked", "done", "archived"],
        "transitions": [
            { "from": "todo", "to": "in_progress", "event": "start" },
            { "from": "in_progress", "to": "blocked", "event": "block" },
            { "from": "in_progress", "to": "done", "event": "complete" },
            { "from": "blocked", "to": "in_progress", "event": "unblock" },
            { "from": "done", "to": "archived", "event": "archive" },
            { "from": "todo", "to": "archived", "event": "cancel" }
        ]
    }'::jsonb,
    '{}'::jsonb,
    '[]'::jsonb,
    '{
        "category": "Refinement",
        "description": "Task for improving, editing, or iterating on existing work",
        "typical_duration": "1-4 hours",
        "keywords": ["refine", "improve", "edit", "revise", "polish", "iterate", "enhance"]
    }'::jsonb
) on conflict (scope, type_key) do update set
    name = excluded.name,
    schema = excluded.schema,
    fsm = excluded.fsm,
    metadata = excluded.metadata,
    updated_at = now();

-- task.research - Gathering information, learning, investigating
insert into onto_templates (
    scope,
    type_key,
    name,
    status,
    is_abstract,
    created_by,
    schema,
    fsm,
    default_props,
    default_views,
    metadata
) values (
    'task',
    'task.research',
    'Research Task',
    'active',
    false,
    '00000000-0000-0000-0000-000000000000',
    '{
        "type": "object",
        "properties": {
            "description": { "type": "string" },
            "research_questions": { "type": "array", "items": { "type": "string" } },
            "sources": { "type": "array", "items": { "type": "string" } },
            "findings_summary": { "type": "string" }
        }
    }'::jsonb,
    '{
        "type_key": "task.research",
        "initial": "todo",
        "states": ["todo", "in_progress", "blocked", "done", "archived"],
        "transitions": [
            { "from": "todo", "to": "in_progress", "event": "start" },
            { "from": "in_progress", "to": "blocked", "event": "block" },
            { "from": "in_progress", "to": "done", "event": "complete" },
            { "from": "blocked", "to": "in_progress", "event": "unblock" },
            { "from": "done", "to": "archived", "event": "archive" },
            { "from": "todo", "to": "archived", "event": "cancel" }
        ]
    }'::jsonb,
    '{}'::jsonb,
    '[]'::jsonb,
    '{
        "category": "Research",
        "description": "Task for gathering information, learning, or investigating topics",
        "typical_duration": "1-6 hours",
        "keywords": ["research", "investigate", "learn", "explore", "study", "analyze", "discover"]
    }'::jsonb
) on conflict (scope, type_key) do update set
    name = excluded.name,
    schema = excluded.schema,
    fsm = excluded.fsm,
    metadata = excluded.metadata,
    updated_at = now();

-- task.review - Reviewing, approving, or providing feedback
insert into onto_templates (
    scope,
    type_key,
    name,
    status,
    is_abstract,
    created_by,
    schema,
    fsm,
    default_props,
    default_views,
    metadata
) values (
    'task',
    'task.review',
    'Review Task',
    'active',
    false,
    '00000000-0000-0000-0000-000000000000',
    '{
        "type": "object",
        "properties": {
            "description": { "type": "string" },
            "review_target": { "type": "string", "description": "What is being reviewed" },
            "review_criteria": { "type": "array", "items": { "type": "string" } },
            "feedback": { "type": "string" },
            "decision": { "type": "string", "enum": ["approved", "rejected", "needs_changes"] }
        }
    }'::jsonb,
    '{
        "type_key": "task.review",
        "initial": "todo",
        "states": ["todo", "in_progress", "blocked", "done", "archived"],
        "transitions": [
            { "from": "todo", "to": "in_progress", "event": "start" },
            { "from": "in_progress", "to": "blocked", "event": "block" },
            { "from": "in_progress", "to": "done", "event": "complete" },
            { "from": "blocked", "to": "in_progress", "event": "unblock" },
            { "from": "done", "to": "archived", "event": "archive" },
            { "from": "todo", "to": "archived", "event": "cancel" }
        ]
    }'::jsonb,
    '{}'::jsonb,
    '[]'::jsonb,
    '{
        "category": "Review",
        "description": "Task for reviewing, approving, or providing feedback on work",
        "typical_duration": "30min-2 hours",
        "keywords": ["review", "approve", "feedback", "evaluate", "assess", "critique", "validate"]
    }'::jsonb
) on conflict (scope, type_key) do update set
    name = excluded.name,
    schema = excluded.schema,
    fsm = excluded.fsm,
    metadata = excluded.metadata,
    updated_at = now();

-- task.coordinate - Coordinating with others, communication tasks
insert into onto_templates (
    scope,
    type_key,
    name,
    status,
    is_abstract,
    created_by,
    schema,
    fsm,
    default_props,
    default_views,
    metadata
) values (
    'task',
    'task.coordinate',
    'Coordinate Task',
    'active',
    false,
    '00000000-0000-0000-0000-000000000000',
    '{
        "type": "object",
        "properties": {
            "description": { "type": "string" },
            "participants": { "type": "array", "items": { "type": "string" } },
            "coordination_goal": { "type": "string" },
            "outcomes": { "type": "array", "items": { "type": "string" } }
        }
    }'::jsonb,
    '{
        "type_key": "task.coordinate",
        "initial": "todo",
        "states": ["todo", "in_progress", "blocked", "done", "archived"],
        "transitions": [
            { "from": "todo", "to": "in_progress", "event": "start" },
            { "from": "in_progress", "to": "blocked", "event": "block" },
            { "from": "in_progress", "to": "done", "event": "complete" },
            { "from": "blocked", "to": "in_progress", "event": "unblock" },
            { "from": "done", "to": "archived", "event": "archive" },
            { "from": "todo", "to": "archived", "event": "cancel" }
        ]
    }'::jsonb,
    '{}'::jsonb,
    '[]'::jsonb,
    '{
        "category": "Coordination",
        "description": "Task for coordinating with others or communication activities",
        "typical_duration": "15min-1 hour",
        "keywords": ["coordinate", "communicate", "discuss", "sync", "align", "collaborate"]
    }'::jsonb
) on conflict (scope, type_key) do update set
    name = excluded.name,
    schema = excluded.schema,
    fsm = excluded.fsm,
    metadata = excluded.metadata,
    updated_at = now();

-- task.admin - Administrative tasks, maintenance, bookkeeping
insert into onto_templates (
    scope,
    type_key,
    name,
    status,
    is_abstract,
    created_by,
    schema,
    fsm,
    default_props,
    default_views,
    metadata
) values (
    'task',
    'task.admin',
    'Admin Task',
    'active',
    false,
    '00000000-0000-0000-0000-000000000000',
    '{
        "type": "object",
        "properties": {
            "description": { "type": "string" },
            "admin_type": { "type": "string", "enum": ["maintenance", "bookkeeping", "organizing", "cleanup"] }
        }
    }'::jsonb,
    '{
        "type_key": "task.admin",
        "initial": "todo",
        "states": ["todo", "in_progress", "blocked", "done", "archived"],
        "transitions": [
            { "from": "todo", "to": "in_progress", "event": "start" },
            { "from": "in_progress", "to": "blocked", "event": "block" },
            { "from": "in_progress", "to": "done", "event": "complete" },
            { "from": "blocked", "to": "in_progress", "event": "unblock" },
            { "from": "done", "to": "archived", "event": "archive" },
            { "from": "todo", "to": "archived", "event": "cancel" }
        ]
    }'::jsonb,
    '{}'::jsonb,
    '[]'::jsonb,
    '{
        "category": "Administration",
        "description": "Administrative tasks, maintenance, and bookkeeping activities",
        "typical_duration": "15min-1 hour",
        "keywords": ["admin", "maintain", "organize", "cleanup", "file", "update", "manage"]
    }'::jsonb
) on conflict (scope, type_key) do update set
    name = excluded.name,
    schema = excluded.schema,
    fsm = excluded.fsm,
    metadata = excluded.metadata,
    updated_at = now();

-- task.plan - Planning, strategizing, decision-making
insert into onto_templates (
    scope,
    type_key,
    name,
    status,
    is_abstract,
    created_by,
    schema,
    fsm,
    default_props,
    default_views,
    metadata
) values (
    'task',
    'task.plan',
    'Plan Task',
    'active',
    false,
    '00000000-0000-0000-0000-000000000000',
    '{
        "type": "object",
        "properties": {
            "description": { "type": "string" },
            "planning_scope": { "type": "string" },
            "decisions_needed": { "type": "array", "items": { "type": "string" } },
            "plan_output": { "type": "string" }
        }
    }'::jsonb,
    '{
        "type_key": "task.plan",
        "initial": "todo",
        "states": ["todo", "in_progress", "blocked", "done", "archived"],
        "transitions": [
            { "from": "todo", "to": "in_progress", "event": "start" },
            { "from": "in_progress", "to": "blocked", "event": "block" },
            { "from": "in_progress", "to": "done", "event": "complete" },
            { "from": "blocked", "to": "in_progress", "event": "unblock" },
            { "from": "done", "to": "archived", "event": "archive" },
            { "from": "todo", "to": "archived", "event": "cancel" }
        ]
    }'::jsonb,
    '{}'::jsonb,
    '[]'::jsonb,
    '{
        "category": "Planning",
        "description": "Task for planning, strategizing, and decision-making",
        "typical_duration": "1-4 hours",
        "keywords": ["plan", "strategize", "decide", "prioritize", "roadmap", "schedule", "organize"]
    }'::jsonb
) on conflict (scope, type_key) do update set
    name = excluded.name,
    schema = excluded.schema,
    fsm = excluded.fsm,
    metadata = excluded.metadata,
    updated_at = now();

-- ============================================
-- SPECIALIZATION TEMPLATES (v1)
-- ============================================

-- task.coordinate.meeting - Scheduled meeting with others
insert into onto_templates (
    scope,
    type_key,
    name,
    status,
    is_abstract,
    parent_template_id,
    created_by,
    schema,
    fsm,
    default_props,
    default_views,
    metadata
) values (
    'task',
    'task.coordinate.meeting',
    'Meeting',
    'active',
    false,
    (select id from onto_templates where type_key = 'task.coordinate' limit 1),
    '00000000-0000-0000-0000-000000000000',
    '{
        "type": "object",
        "properties": {
            "description": { "type": "string" },
            "meeting_type": { "type": "string", "enum": ["one_on_one", "team", "client", "interview", "workshop"] },
            "participants": { "type": "array", "items": { "type": "string" } },
            "agenda": { "type": "array", "items": { "type": "string" } },
            "location": { "type": "string" },
            "meeting_link": { "type": "string", "format": "uri" },
            "notes": { "type": "string" },
            "action_items": { "type": "array", "items": { "type": "string" } }
        }
    }'::jsonb,
    '{
        "type_key": "task.coordinate.meeting",
        "initial": "todo",
        "states": ["todo", "in_progress", "blocked", "done", "archived"],
        "transitions": [
            { "from": "todo", "to": "in_progress", "event": "start" },
            { "from": "in_progress", "to": "blocked", "event": "block" },
            { "from": "in_progress", "to": "done", "event": "complete" },
            { "from": "blocked", "to": "in_progress", "event": "unblock" },
            { "from": "done", "to": "archived", "event": "archive" },
            { "from": "todo", "to": "archived", "event": "cancel" }
        ]
    }'::jsonb,
    '{}'::jsonb,
    '[]'::jsonb,
    '{
        "category": "Coordination",
        "description": "Scheduled meeting with one or more participants",
        "typical_duration": "30min-2 hours",
        "keywords": ["meeting", "call", "sync", "one-on-one", "team meeting", "client call"]
    }'::jsonb
) on conflict (scope, type_key) do update set
    name = excluded.name,
    parent_template_id = excluded.parent_template_id,
    schema = excluded.schema,
    fsm = excluded.fsm,
    metadata = excluded.metadata,
    updated_at = now();

-- task.coordinate.standup - Daily standup or quick sync
insert into onto_templates (
    scope,
    type_key,
    name,
    status,
    is_abstract,
    parent_template_id,
    created_by,
    schema,
    fsm,
    default_props,
    default_views,
    metadata
) values (
    'task',
    'task.coordinate.standup',
    'Standup',
    'active',
    false,
    (select id from onto_templates where type_key = 'task.coordinate' limit 1),
    '00000000-0000-0000-0000-000000000000',
    '{
        "type": "object",
        "properties": {
            "description": { "type": "string" },
            "yesterday": { "type": "string", "description": "What was accomplished yesterday" },
            "today": { "type": "string", "description": "What will be worked on today" },
            "blockers": { "type": "array", "items": { "type": "string" } }
        }
    }'::jsonb,
    '{
        "type_key": "task.coordinate.standup",
        "initial": "todo",
        "states": ["todo", "in_progress", "blocked", "done", "archived"],
        "transitions": [
            { "from": "todo", "to": "in_progress", "event": "start" },
            { "from": "in_progress", "to": "blocked", "event": "block" },
            { "from": "in_progress", "to": "done", "event": "complete" },
            { "from": "blocked", "to": "in_progress", "event": "unblock" },
            { "from": "done", "to": "archived", "event": "archive" },
            { "from": "todo", "to": "archived", "event": "cancel" }
        ]
    }'::jsonb,
    '{}'::jsonb,
    '[]'::jsonb,
    '{
        "category": "Coordination",
        "description": "Daily standup or quick sync meeting",
        "typical_duration": "15min",
        "keywords": ["standup", "daily", "sync", "scrum", "check-in"]
    }'::jsonb
) on conflict (scope, type_key) do update set
    name = excluded.name,
    parent_template_id = excluded.parent_template_id,
    schema = excluded.schema,
    fsm = excluded.fsm,
    metadata = excluded.metadata,
    updated_at = now();

-- task.execute.deploy - Deployment or release task
insert into onto_templates (
    scope,
    type_key,
    name,
    status,
    is_abstract,
    parent_template_id,
    created_by,
    schema,
    fsm,
    default_props,
    default_views,
    metadata
) values (
    'task',
    'task.execute.deploy',
    'Deploy',
    'active',
    false,
    (select id from onto_templates where type_key = 'task.execute' limit 1),
    '00000000-0000-0000-0000-000000000000',
    '{
        "type": "object",
        "properties": {
            "description": { "type": "string" },
            "environment": { "type": "string", "enum": ["development", "staging", "production"] },
            "version": { "type": "string" },
            "deploy_checklist": { "type": "array", "items": { "type": "string" } },
            "rollback_plan": { "type": "string" },
            "post_deploy_verification": { "type": "array", "items": { "type": "string" } }
        }
    }'::jsonb,
    '{
        "type_key": "task.execute.deploy",
        "initial": "todo",
        "states": ["todo", "in_progress", "blocked", "done", "archived"],
        "transitions": [
            { "from": "todo", "to": "in_progress", "event": "start" },
            { "from": "in_progress", "to": "blocked", "event": "block" },
            { "from": "in_progress", "to": "done", "event": "complete" },
            { "from": "blocked", "to": "in_progress", "event": "unblock" },
            { "from": "done", "to": "archived", "event": "archive" },
            { "from": "todo", "to": "archived", "event": "cancel" }
        ]
    }'::jsonb,
    '{}'::jsonb,
    '[]'::jsonb,
    '{
        "category": "Execution",
        "description": "Deployment or release task with environment and verification steps",
        "typical_duration": "30min-2 hours",
        "keywords": ["deploy", "release", "ship", "publish", "launch", "rollout"]
    }'::jsonb
) on conflict (scope, type_key) do update set
    name = excluded.name,
    parent_template_id = excluded.parent_template_id,
    schema = excluded.schema,
    fsm = excluded.fsm,
    metadata = excluded.metadata,
    updated_at = now();

-- task.execute.checklist - Checklist-based task with items to complete
insert into onto_templates (
    scope,
    type_key,
    name,
    status,
    is_abstract,
    parent_template_id,
    created_by,
    schema,
    fsm,
    default_props,
    default_views,
    metadata
) values (
    'task',
    'task.execute.checklist',
    'Checklist',
    'active',
    false,
    (select id from onto_templates where type_key = 'task.execute' limit 1),
    '00000000-0000-0000-0000-000000000000',
    '{
        "type": "object",
        "properties": {
            "description": { "type": "string" },
            "checklist_items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "text": { "type": "string" },
                        "completed": { "type": "boolean" }
                    }
                }
            },
            "completion_threshold": { "type": "number", "description": "Percentage of items needed to complete (default 100)" }
        }
    }'::jsonb,
    '{
        "type_key": "task.execute.checklist",
        "initial": "todo",
        "states": ["todo", "in_progress", "blocked", "done", "archived"],
        "transitions": [
            { "from": "todo", "to": "in_progress", "event": "start" },
            { "from": "in_progress", "to": "blocked", "event": "block" },
            { "from": "in_progress", "to": "done", "event": "complete" },
            { "from": "blocked", "to": "in_progress", "event": "unblock" },
            { "from": "done", "to": "archived", "event": "archive" },
            { "from": "todo", "to": "archived", "event": "cancel" }
        ]
    }'::jsonb,
    '{ "checklist_items": [], "completion_threshold": 100 }'::jsonb,
    '[]'::jsonb,
    '{
        "category": "Execution",
        "description": "Checklist-based task with trackable items to complete",
        "typical_duration": "varies",
        "keywords": ["checklist", "todo", "items", "steps", "process", "procedure"]
    }'::jsonb
) on conflict (scope, type_key) do update set
    name = excluded.name,
    parent_template_id = excluded.parent_template_id,
    schema = excluded.schema,
    fsm = excluded.fsm,
    default_props = excluded.default_props,
    metadata = excluded.metadata,
    updated_at = now();

-- Log completion
do $$
begin
    raise notice 'Task templates seeded: 8 base work modes + 4 specializations';
end $$;
