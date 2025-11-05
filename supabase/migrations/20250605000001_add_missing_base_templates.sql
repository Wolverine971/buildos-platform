-- ============================================
-- Add Missing Base Templates for Ontology
-- Tasks, Goals, and Additional Plans
-- ============================================
--
-- Purpose: Add base template hierarchies for tasks and goals,
--          plus expand plan templates for common use cases.
--
-- Naming Conventions:
--   - Projects: {domain}.{deliverable}[.{variant}] (domain-specific)
--   - All others: {scope}.{type} (generic, reusable)
--
-- Examples:
--   - Projects: writer.book, coach.client, developer.app
--   - Tasks: task.quick, task.deep_work, task.recurring
--   - Goals: goal.outcome, goal.learning, goal.behavior
--   - Plans: plan.weekly, plan.content_calendar
--
-- Relationships:
--   - Dependencies: Use edges (task -[depends_on]-> task)
--   - Subtasks: Use edges (task -[has_subtask]-> task)
--   - NO dependencies array in props
--   - NO parent_task_id in schema
--
-- Date: 2025-11-04
-- Migration: 20250605000001
-- ============================================

-- Ensure we're in the correct schema context
SET search_path TO public;

-- System actor reference (must exist from previous migration)
DO $$
DECLARE
  v_system_actor_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Verify system actor exists
  IF NOT EXISTS (SELECT 1 FROM onto_actors WHERE id = v_system_actor_id) THEN
    RAISE EXCEPTION 'System actor not found. Run ontology_system migration first.';
  END IF;

  RAISE NOTICE 'System actor verified: %', v_system_actor_id;
END$$;

-- ============================================
-- PART 1: TASK TEMPLATES
-- ============================================

-- ---------------------------------------------
-- 1.1 task.base (Abstract Base Template)
-- ---------------------------------------------
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  is_abstract,
  parent_template_id,
  schema,
  fsm,
  default_props,
  default_views,
  facet_defaults,
  metadata,
  created_by
) VALUES (
  'task',
  'task.base',
  'Base Task',
  'active',
  true,  -- Abstract: cannot instantiate directly
  null,  -- No parent
  -- Schema: Core task properties (NO dependencies, NO parent_task_id)
  '{
    "type": "object",
    "properties": {
      "title": {
        "type": "string",
        "description": "Task title"
      },
      "description": {
        "type": "string",
        "description": "Detailed task description"
      },
      "estimated_duration_minutes": {
        "type": "number",
        "minimum": 5,
        "description": "Estimated time to complete (minutes)"
      },
      "actual_duration_minutes": {
        "type": "number",
        "minimum": 0,
        "description": "Actual time spent (minutes)"
      },
      "notes": {
        "type": "string",
        "description": "Additional notes and context"
      }
    },
    "required": ["title"]
  }'::jsonb,
  -- FSM: Standard task lifecycle (matches UI states in TaskCreateModal)
  '{
    "type_key": "task.base",
    "initial": "todo",
    "states": ["todo", "in_progress", "blocked", "done", "archived"],
    "transitions": [
      {
        "from": "todo",
        "to": "in_progress",
        "event": "start",
        "description": "Begin working on task"
      },
      {
        "from": "in_progress",
        "to": "blocked",
        "event": "block",
        "description": "Task is blocked by external dependency"
      },
      {
        "from": "blocked",
        "to": "in_progress",
        "event": "unblock",
        "description": "Blocker resolved, resume work"
      },
      {
        "from": "in_progress",
        "to": "done",
        "event": "complete",
        "description": "Task completed successfully"
      },
      {
        "from": "todo",
        "to": "archived",
        "event": "archive",
        "description": "Task no longer needed"
      },
      {
        "from": "in_progress",
        "to": "archived",
        "event": "archive",
        "description": "Stop work and archive task"
      },
      {
        "from": "blocked",
        "to": "archived",
        "event": "archive",
        "description": "Archive blocked task"
      },
      {
        "from": "done",
        "to": "archived",
        "event": "archive",
        "description": "Archive completed task"
      }
    ]
  }'::jsonb,
  '{}'::jsonb,  -- No default props
  '[{"view": "list", "sort_by": "priority"}]'::jsonb,
  '{"scale": "small"}'::jsonb,  -- Default scale facet
  -- Metadata
  '{
    "realm": "productivity",
    "description": "Abstract base template for all tasks",
    "typical_duration": "varies",
    "usage": "Base class for task inheritance"
  }'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- ---------------------------------------------
-- 1.2 task.quick (Quick Task: 5-30 minutes)
-- ---------------------------------------------
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  is_abstract,
  parent_template_id,
  schema,
  fsm,
  default_props,
  facet_defaults,
  metadata,
  created_by
) VALUES (
  'task',
  'task.quick',
  'Quick Task',
  'active',
  false,
  (SELECT id FROM onto_templates WHERE type_key = 'task.base' AND scope = 'task'),
  -- Additional schema (inherits from task.base)
  '{
    "type": "object",
    "properties": {
      "is_urgent": {
        "type": "boolean",
        "default": false,
        "description": "Requires immediate attention"
      }
    }
  }'::jsonb,
  -- Simplified FSM (overrides parent)
  '{
    "type_key": "task.quick",
    "initial": "todo",
    "states": ["todo", "done"],
    "transitions": [
      {
        "from": "todo",
        "to": "done",
        "event": "complete",
        "description": "Mark as done"
      }
    ]
  }'::jsonb,
  '{"estimated_duration_minutes": 15}'::jsonb,
  '{"scale": "micro"}'::jsonb,
  '{
    "realm": "productivity",
    "category": "Quick Actions",
    "typical_duration": "5-30 minutes",
    "description": "Simple one-step tasks that can be done quickly",
    "usage": "Short tasks, quick wins, simple todos"
  }'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- ---------------------------------------------
-- 1.3 task.deep_work (Deep Work: 1-4 hours)
-- ---------------------------------------------
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  is_abstract,
  parent_template_id,
  schema,
  default_props,
  facet_defaults,
  metadata,
  created_by
) VALUES (
  'task',
  'task.deep_work',
  'Deep Work Task',
  'active',
  false,
  (SELECT id FROM onto_templates WHERE type_key = 'task.base' AND scope = 'task'),
  -- Additional schema (inherits FSM from task.base)
  '{
    "type": "object",
    "properties": {
      "requires_focus_time": {
        "type": "boolean",
        "default": true,
        "description": "Requires uninterrupted focus"
      },
      "preferred_time_of_day": {
        "type": "string",
        "enum": ["morning", "afternoon", "evening"],
        "description": "Optimal time for this work"
      },
      "work_sessions": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "date": {"type": "string", "format": "date-time"},
            "duration_minutes": {"type": "number"}
          }
        },
        "description": "Log of work sessions"
      }
    }
  }'::jsonb,
  '{
    "estimated_duration_minutes": 120,
    "requires_focus_time": true
  }'::jsonb,
  '{"scale": "small"}'::jsonb,
  '{
    "realm": "productivity",
    "category": "Deep Work",
    "typical_duration": "1-4 hours",
    "requires_deep_focus": true,
    "description": "Tasks requiring extended focused attention",
    "usage": "Complex work, creative tasks, problem-solving"
  }'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- ---------------------------------------------
-- 1.4 task.recurring (Recurring Task)
-- ---------------------------------------------
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  is_abstract,
  parent_template_id,
  schema,
  fsm,
  default_props,
  facet_defaults,
  metadata,
  created_by
) VALUES (
  'task',
  'task.recurring',
  'Recurring Task',
  'active',
  false,
  (SELECT id FROM onto_templates WHERE type_key = 'task.base' AND scope = 'task'),
  -- Additional schema for recurrence
  '{
    "type": "object",
    "properties": {
      "recurrence_rule": {
        "type": "string",
        "description": "RRULE format (RFC 5545)",
        "pattern": "^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)"
      },
      "recurrence_ends": {
        "type": "string",
        "format": "date",
        "description": "When recurrence stops"
      },
      "skip_count": {
        "type": "number",
        "default": 0,
        "description": "Number of skipped occurrences"
      },
      "completion_history": {
        "type": "array",
        "items": {
          "type": "string",
          "format": "date-time"
        },
        "description": "Dates when task was completed"
      }
    },
    "required": ["recurrence_rule"]
  }'::jsonb,
  -- Custom FSM for recurring tasks
  '{
    "type_key": "task.recurring",
    "initial": "active",
    "states": ["active", "paused", "completed_instance", "ended"],
    "transitions": [
      {
        "from": "active",
        "to": "paused",
        "event": "pause",
        "description": "Temporarily stop recurrence"
      },
      {
        "from": "paused",
        "to": "active",
        "event": "resume",
        "description": "Resume recurrence"
      },
      {
        "from": "active",
        "to": "completed_instance",
        "event": "complete_instance",
        "description": "Mark this occurrence as done",
        "actions": [
          {
            "type": "schedule_next_occurrence",
            "description": "Create next task instance"
          }
        ]
      },
      {
        "from": "active",
        "to": "ended",
        "event": "end_recurrence",
        "description": "Stop all future occurrences"
      }
    ]
  }'::jsonb,
  '{
    "recurrence_rule": "FREQ=WEEKLY;BYDAY=MO",
    "estimated_duration_minutes": 30
  }'::jsonb,
  '{"scale": "micro"}'::jsonb,
  '{
    "realm": "productivity",
    "category": "Recurring Tasks",
    "supports_recurrence": true,
    "description": "Tasks that repeat on a schedule",
    "usage": "Daily routines, weekly reviews, monthly reports"
  }'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- ---------------------------------------------
-- 1.5 task.milestone (Milestone Task)
-- ---------------------------------------------
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  is_abstract,
  parent_template_id,
  schema,
  fsm,
  default_props,
  facet_defaults,
  metadata,
  created_by
) VALUES (
  'task',
  'task.milestone',
  'Milestone',
  'active',
  false,
  (SELECT id FROM onto_templates WHERE type_key = 'task.base' AND scope = 'task'),
  -- Additional schema for milestones
  '{
    "type": "object",
    "properties": {
      "deliverable_output_id": {
        "type": "string",
        "format": "uuid",
        "description": "Associated deliverable"
      },
      "success_criteria": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Criteria for completion"
      },
      "stakeholders": {
        "type": "array",
        "items": {"type": "string"},
        "description": "People involved or affected"
      },
      "acceptance_notes": {
        "type": "string",
        "description": "Notes from stakeholder review"
      }
    }
  }'::jsonb,
  -- Custom FSM with review/acceptance flow
  '{
    "type_key": "task.milestone",
    "initial": "planned",
    "states": ["planned", "in_progress", "delivered", "accepted", "rejected"],
    "transitions": [
      {
        "from": "planned",
        "to": "in_progress",
        "event": "start",
        "description": "Begin milestone work"
      },
      {
        "from": "in_progress",
        "to": "delivered",
        "event": "deliver",
        "description": "Submit for review",
        "actions": [
          {
            "type": "notify",
            "message": "Milestone delivered for review"
          }
        ]
      },
      {
        "from": "delivered",
        "to": "accepted",
        "event": "accept",
        "description": "Stakeholder accepts milestone"
      },
      {
        "from": "delivered",
        "to": "rejected",
        "event": "reject",
        "description": "Stakeholder requests changes"
      },
      {
        "from": "rejected",
        "to": "in_progress",
        "event": "rework",
        "description": "Address feedback and revise"
      }
    ]
  }'::jsonb,
  '{}'::jsonb,
  '{"scale": "medium"}'::jsonb,
  '{
    "realm": "productivity",
    "category": "Milestones",
    "is_milestone": true,
    "description": "Critical project milestones with deliverables",
    "usage": "Major deliverables, phase completions, releases"
  }'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- ---------------------------------------------
-- 1.6 task.meeting_prep (Meeting Preparation)
-- ---------------------------------------------
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  is_abstract,
  parent_template_id,
  schema,
  default_props,
  facet_defaults,
  metadata,
  created_by
) VALUES (
  'task',
  'task.meeting_prep',
  'Meeting Preparation',
  'active',
  false,
  (SELECT id FROM onto_templates WHERE type_key = 'task.base' AND scope = 'task'),
  -- Inherits FSM from task.base
  '{
    "type": "object",
    "properties": {
      "meeting_date": {
        "type": "string",
        "format": "date-time",
        "description": "When the meeting occurs"
      },
      "meeting_title": {
        "type": "string",
        "description": "Meeting name"
      },
      "agenda_items": {
        "type": "array",
        "items": {"type": "string"},
        "description": "What to prepare for"
      }
    }
  }'::jsonb,
  '{"estimated_duration_minutes": 30}'::jsonb,
  '{"scale": "micro"}'::jsonb,
  '{
    "realm": "productivity",
    "category": "Coordination",
    "description": "Preparation tasks for meetings",
    "usage": "Review materials, prepare talking points, gather data"
  }'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- ---------------------------------------------
-- 1.7 task.research (Research Task)
-- ---------------------------------------------
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  is_abstract,
  parent_template_id,
  schema,
  default_props,
  facet_defaults,
  metadata,
  created_by
) VALUES (
  'task',
  'task.research',
  'Research Task',
  'active',
  false,
  (SELECT id FROM onto_templates WHERE type_key = 'task.base' AND scope = 'task'),
  -- Inherits FSM from task.base
  '{
    "type": "object",
    "properties": {
      "research_question": {
        "type": "string",
        "description": "What needs to be discovered"
      },
      "sources": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Sources to investigate"
      },
      "findings": {
        "type": "string",
        "description": "Summary of findings"
      }
    }
  }'::jsonb,
  '{"estimated_duration_minutes": 60}'::jsonb,
  '{"scale": "small"}'::jsonb,
  '{
    "realm": "productivity",
    "category": "Research & Analysis",
    "description": "Information gathering and investigation tasks",
    "usage": "Market research, literature review, technical investigation"
  }'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- ---------------------------------------------
-- 1.8 task.review (Review Task)
-- ---------------------------------------------
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  is_abstract,
  parent_template_id,
  schema,
  default_props,
  facet_defaults,
  metadata,
  created_by
) VALUES (
  'task',
  'task.review',
  'Review Task',
  'active',
  false,
  (SELECT id FROM onto_templates WHERE type_key = 'task.base' AND scope = 'task'),
  -- Inherits FSM from task.base
  '{
    "type": "object",
    "properties": {
      "item_to_review": {
        "type": "string",
        "description": "What is being reviewed"
      },
      "review_criteria": {
        "type": "array",
        "items": {"type": "string"},
        "description": "What to check for"
      },
      "feedback": {
        "type": "string",
        "description": "Review feedback"
      },
      "approved": {
        "type": "boolean",
        "description": "Whether item passes review"
      }
    }
  }'::jsonb,
  '{"estimated_duration_minutes": 45}'::jsonb,
  '{"scale": "small"}'::jsonb,
  '{
    "realm": "productivity",
    "category": "Research & Analysis",
    "description": "Reviewing and providing feedback on work",
    "usage": "Code review, content editing, design feedback"
  }'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- ============================================
-- PART 2: GOAL TEMPLATES
-- ============================================

-- ---------------------------------------------
-- 2.1 goal.base (Abstract Base Template)
-- ---------------------------------------------
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  is_abstract,
  parent_template_id,
  schema,
  fsm,
  default_props,
  default_views,
  facet_defaults,
  metadata,
  created_by
) VALUES (
  'goal',
  'goal.base',
  'Base Goal',
  'active',
  true,  -- Abstract
  null,
  '{
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": "Goal name"
      },
      "description": {
        "type": "string",
        "description": "Detailed description"
      },
      "target_date": {
        "type": "string",
        "format": "date",
        "description": "Target completion date"
      },
      "measurement_criteria": {
        "type": "string",
        "description": "How to measure progress"
      },
      "success_definition": {
        "type": "string",
        "description": "What success looks like"
      },
      "priority": {
        "type": "string",
        "enum": ["high", "medium", "low"],
        "default": "medium",
        "description": "Goal priority"
      },
      "notes": {
        "type": "string",
        "description": "Additional context"
      }
    },
    "required": ["name", "success_definition"]
  }'::jsonb,
  '{
    "type_key": "goal.base",
    "initial": "draft",
    "states": ["draft", "active", "on_track", "at_risk", "achieved", "missed"],
    "transitions": [
      {
        "from": "draft",
        "to": "active",
        "event": "commit",
        "description": "Commit to pursuing this goal"
      },
      {
        "from": "active",
        "to": "on_track",
        "event": "assess_progress",
        "description": "Goal is progressing well"
      },
      {
        "from": "active",
        "to": "at_risk",
        "event": "assess_progress",
        "description": "Goal may not be achieved without intervention"
      },
      {
        "from": "on_track",
        "to": "at_risk",
        "event": "assess_progress",
        "description": "Progress has slowed or stalled"
      },
      {
        "from": "at_risk",
        "to": "on_track",
        "event": "assess_progress",
        "description": "Back on track after intervention"
      },
      {
        "from": "active",
        "to": "achieved",
        "event": "achieve",
        "description": "Goal successfully achieved",
        "actions": [
          {
            "type": "notify",
            "message": "Congratulations on achieving your goal!"
          }
        ]
      },
      {
        "from": "on_track",
        "to": "achieved",
        "event": "achieve",
        "description": "Goal successfully achieved"
      },
      {
        "from": "at_risk",
        "to": "achieved",
        "event": "achieve",
        "description": "Goal achieved despite challenges"
      },
      {
        "from": "active",
        "to": "missed",
        "event": "miss",
        "description": "Goal deadline passed without achievement"
      },
      {
        "from": "on_track",
        "to": "missed",
        "event": "miss",
        "description": "Goal deadline passed without achievement"
      },
      {
        "from": "at_risk",
        "to": "missed",
        "event": "miss",
        "description": "Goal deadline passed without achievement"
      }
    ]
  }'::jsonb,
  '{"priority": "medium"}'::jsonb,
  '[{"view": "list", "sort_by": "target_date"}]'::jsonb,
  '{}'::jsonb,  -- No default facets
  '{
    "realm": "goals",
    "description": "Abstract base template for all goals"
  }'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- ---------------------------------------------
-- 2.2 goal.outcome (Outcome Goal)
-- ---------------------------------------------
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  is_abstract,
  parent_template_id,
  schema,
  default_props,
  metadata,
  created_by
) VALUES (
  'goal',
  'goal.outcome',
  'Outcome Goal',
  'active',
  false,
  (SELECT id FROM onto_templates WHERE type_key = 'goal.base' AND scope = 'goal'),
  -- Inherits FSM from goal.base
  '{
    "type": "object",
    "properties": {
      "desired_outcome": {
        "type": "string",
        "description": "Specific result to achieve"
      },
      "current_state": {
        "type": "string",
        "description": "Where you are now"
      },
      "obstacles": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Known challenges"
      },
      "action_plan": {
        "type": "string",
        "description": "Steps to achieve outcome"
      }
    },
    "required": ["desired_outcome"]
  }'::jsonb,
  '{}'::jsonb,
  '{
    "realm": "goals",
    "category": "Outcomes",
    "goal_type": "outcome",
    "measurement_type": "Binary completion",
    "description": "Goals focused on achieving specific outcomes",
    "usage": "Complete a project, launch a product, publish a book"
  }'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- ---------------------------------------------
-- 2.3 goal.learning (Learning Goal)
-- ---------------------------------------------
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  is_abstract,
  parent_template_id,
  schema,
  default_props,
  metadata,
  created_by
) VALUES (
  'goal',
  'goal.learning',
  'Learning Goal',
  'active',
  false,
  (SELECT id FROM onto_templates WHERE type_key = 'goal.base' AND scope = 'goal'),
  -- Inherits FSM from goal.base
  '{
    "type": "object",
    "properties": {
      "skill_to_learn": {
        "type": "string",
        "description": "What to learn"
      },
      "current_level": {
        "type": "string",
        "enum": ["beginner", "intermediate", "advanced"],
        "description": "Current skill level"
      },
      "target_level": {
        "type": "string",
        "enum": ["beginner", "intermediate", "advanced", "expert"],
        "description": "Desired skill level"
      },
      "learning_resources": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Books, courses, tutorials"
      },
      "practice_schedule": {
        "type": "string",
        "description": "How often to practice"
      }
    },
    "required": ["skill_to_learn"]
  }'::jsonb,
  '{}'::jsonb,
  '{
    "realm": "goals",
    "category": "Personal Development",
    "goal_type": "learning",
    "measurement_type": "Skill level progression",
    "description": "Goals focused on acquiring new skills or knowledge",
    "usage": "Learn a language, master a technology, develop expertise"
  }'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- ---------------------------------------------
-- 2.4 goal.behavior (Behavior Change Goal)
-- ---------------------------------------------
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  is_abstract,
  parent_template_id,
  schema,
  default_props,
  metadata,
  created_by
) VALUES (
  'goal',
  'goal.behavior',
  'Behavior Change Goal',
  'active',
  false,
  (SELECT id FROM onto_templates WHERE type_key = 'goal.base' AND scope = 'goal'),
  -- Inherits FSM from goal.base
  '{
    "type": "object",
    "properties": {
      "current_behavior": {
        "type": "string",
        "description": "Behavior to change"
      },
      "target_behavior": {
        "type": "string",
        "description": "Desired behavior"
      },
      "frequency_target": {
        "type": "string",
        "description": "How often (daily, weekly, etc.)"
      },
      "tracking_method": {
        "type": "string",
        "description": "How to track progress"
      },
      "completion_log": {
        "type": "array",
        "items": {
          "type": "string",
          "format": "date-time"
        },
        "description": "Dates when behavior was performed"
      },
      "streak": {
        "type": "number",
        "default": 0,
        "description": "Current streak count"
      }
    }
  }'::jsonb,
  '{"streak": 0}'::jsonb,
  '{
    "realm": "goals",
    "category": "Personal Development",
    "goal_type": "behavior",
    "measurement_type": "Frequency & consistency",
    "description": "Goals focused on changing habits and behaviors",
    "usage": "Exercise regularly, wake up early, meditate daily"
  }'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- ---------------------------------------------
-- 2.5 goal.metric (Metric Goal)
-- ---------------------------------------------
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  is_abstract,
  parent_template_id,
  schema,
  default_props,
  metadata,
  created_by
) VALUES (
  'goal',
  'goal.metric',
  'Metric Goal',
  'active',
  false,
  (SELECT id FROM onto_templates WHERE type_key = 'goal.base' AND scope = 'goal'),
  -- Inherits FSM from goal.base
  '{
    "type": "object",
    "properties": {
      "metric_name": {
        "type": "string",
        "description": "Name of the metric"
      },
      "current_value": {
        "type": "number",
        "description": "Starting value"
      },
      "target_value": {
        "type": "number",
        "description": "Goal value"
      },
      "unit": {
        "type": "string",
        "description": "Unit of measurement (pages, users, $, etc.)"
      },
      "measurement_frequency": {
        "type": "string",
        "enum": ["daily", "weekly", "monthly"],
        "description": "How often to measure"
      },
      "data_points": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "date": {"type": "string", "format": "date"},
            "value": {"type": "number"}
          }
        },
        "description": "Historical measurements"
      }
    },
    "required": ["metric_name", "target_value", "unit"]
  }'::jsonb,
  '{}'::jsonb,
  '{
    "realm": "goals",
    "category": "Metrics & KPIs",
    "goal_type": "metric",
    "measurement_type": "Numeric target",
    "description": "Goals focused on achieving specific numeric targets",
    "usage": "Reach revenue target, gain followers, write X words"
  }'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- ============================================
-- PART 3: ADDITIONAL PLAN TEMPLATES
-- ============================================

-- ---------------------------------------------
-- 3.1 plan.content_calendar (Content Calendar)
-- ---------------------------------------------
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  is_abstract,
  parent_template_id,
  schema,
  fsm,
  default_props,
  facet_defaults,
  metadata,
  created_by
) VALUES (
  'plan',
  'plan.content_calendar',
  'Content Calendar',
  'active',
  false,
  null,
  '{
    "type": "object",
    "properties": {
      "theme": {
        "type": "string",
        "description": "Overall content theme"
      },
      "platforms": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Publishing platforms"
      },
      "publish_frequency": {
        "type": "string",
        "description": "How often to publish"
      },
      "content_types": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Types of content (blog, video, social, etc.)"
      }
    }
  }'::jsonb,
  '{
    "type_key": "plan.content_calendar",
    "initial": "planning",
    "states": ["planning", "scheduled", "publishing", "complete"],
    "transitions": [
      {"from": "planning", "to": "scheduled", "event": "schedule"},
      {"from": "scheduled", "to": "publishing", "event": "start_publishing"},
      {"from": "publishing", "to": "complete", "event": "finish"}
    ]
  }'::jsonb,
  '{}'::jsonb,
  '{"scale": "medium", "stage": "execution"}'::jsonb,
  '{
    "typical_use_by": ["marketer", "writer", "content-creator"],
    "description": "Plan for organizing content creation and publishing",
    "usage": "Editorial calendar, social media planning, blog scheduling"
  }'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- ---------------------------------------------
-- 3.2 plan.client_onboarding (Client Onboarding)
-- ---------------------------------------------
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  is_abstract,
  parent_template_id,
  schema,
  fsm,
  default_props,
  facet_defaults,
  metadata,
  created_by
) VALUES (
  'plan',
  'plan.client_onboarding',
  'Client Onboarding',
  'active',
  false,
  null,
  '{
    "type": "object",
    "properties": {
      "client_name": {
        "type": "string",
        "description": "Client name"
      },
      "start_date": {
        "type": "string",
        "format": "date",
        "description": "Onboarding start date"
      },
      "onboarding_duration_days": {
        "type": "number",
        "description": "Expected duration"
      },
      "key_milestones": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Critical onboarding steps"
      }
    }
  }'::jsonb,
  '{
    "type_key": "plan.client_onboarding",
    "initial": "preparing",
    "states": ["preparing", "in_progress", "complete", "paused"],
    "transitions": [
      {"from": "preparing", "to": "in_progress", "event": "start"},
      {"from": "in_progress", "to": "paused", "event": "pause"},
      {"from": "paused", "to": "in_progress", "event": "resume"},
      {"from": "in_progress", "to": "complete", "event": "finish"}
    ]
  }'::jsonb,
  '{}'::jsonb,
  '{"context": "client", "scale": "small"}'::jsonb,
  '{
    "typical_use_by": ["coach", "consultant", "agency"],
    "description": "Structured plan for onboarding new clients",
    "usage": "Client kickoff, intake process, initial setup"
  }'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- ---------------------------------------------
-- 3.3 plan.product_roadmap (Product Roadmap)
-- ---------------------------------------------
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  is_abstract,
  parent_template_id,
  schema,
  fsm,
  default_props,
  facet_defaults,
  metadata,
  created_by
) VALUES (
  'plan',
  'plan.product_roadmap',
  'Product Roadmap',
  'active',
  false,
  null,
  '{
    "type": "object",
    "properties": {
      "product_name": {
        "type": "string",
        "description": "Product name"
      },
      "quarters": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "quarter": {"type": "string"},
            "themes": {"type": "array", "items": {"type": "string"}}
          }
        },
        "description": "Quarterly themes"
      },
      "major_features": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Planned major features"
      }
    }
  }'::jsonb,
  '{
    "type_key": "plan.product_roadmap",
    "initial": "draft",
    "states": ["draft", "approved", "in_progress", "complete"],
    "transitions": [
      {"from": "draft", "to": "approved", "event": "approve"},
      {"from": "approved", "to": "in_progress", "event": "start_execution"},
      {"from": "in_progress", "to": "complete", "event": "finish"}
    ]
  }'::jsonb,
  '{}'::jsonb,
  '{"scale": "large", "stage": "planning"}'::jsonb,
  '{
    "typical_use_by": ["founder", "developer", "product-manager"],
    "description": "Long-term product development plan",
    "usage": "Product strategy, feature planning, release scheduling"
  }'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- ============================================
-- PART 4: NAMING CONVENTION NOTES
-- ============================================

-- Note: Naming conventions are documented here but NOT enforced via DB constraints
-- to allow flexibility and avoid breaking existing templates from previous migrations.
-- Application-level validation should enforce these patterns for NEW templates.
--
-- Recommended Naming Conventions:
--   Projects:  {domain}.{deliverable}[.{variant}]  (e.g., writer.book, developer.app.web)
--   Tasks:     task.{type}                          (e.g., task.quick, task.deep_work)
--   Goals:     goal.{type}                          (e.g., goal.outcome, goal.learning)
--   Plans:     plan.{type}                          (e.g., plan.weekly, plan.content_calendar)
--   Outputs:   output.{type}                        (e.g., output.document, output.deliverable)
--
-- These templates follow the above conventions and establish best practices
-- for future template creation.

-- ============================================
-- COMPLETION & VERIFICATION
-- ============================================

-- Count templates by scope and display summary
DO $$
DECLARE
  v_task_count int;
  v_goal_count int;
  v_plan_count int;
  v_project_count int;
  v_output_count int;
  v_doc_count int;
BEGIN
  SELECT COUNT(*) INTO v_task_count FROM onto_templates WHERE scope = 'task';
  SELECT COUNT(*) INTO v_goal_count FROM onto_templates WHERE scope = 'goal';
  SELECT COUNT(*) INTO v_plan_count FROM onto_templates WHERE scope = 'plan';
  SELECT COUNT(*) INTO v_project_count FROM onto_templates WHERE scope = 'project';
  SELECT COUNT(*) INTO v_output_count FROM onto_templates WHERE scope = 'output';
  SELECT COUNT(*) INTO v_doc_count FROM onto_templates WHERE scope = 'document';

  RAISE NOTICE '';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'MIGRATION COMPLETE: Missing Base Templates Added';
  RAISE NOTICE '================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Template Summary:';
  RAISE NOTICE '  - Task templates: % (1 abstract + 7 concrete)', v_task_count;
  RAISE NOTICE '  - Goal templates: % (1 abstract + 4 concrete)', v_goal_count;
  RAISE NOTICE '  - Plan templates: % (includes 3 new)', v_plan_count;
  RAISE NOTICE '  - Project templates: % (from previous migration)', v_project_count;
  RAISE NOTICE '  - Output templates: % (from previous migration)', v_output_count;
  RAISE NOTICE '  - Document templates: % (from previous migration)', v_doc_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Total templates: %', v_task_count + v_goal_count + v_plan_count + v_project_count + v_output_count + v_doc_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Naming Conventions:';
  RAISE NOTICE '  - Projects: {domain}.{deliverable}[.{variant}]';
  RAISE NOTICE '  - Tasks: task.{type}';
  RAISE NOTICE '  - Goals: goal.{type}';
  RAISE NOTICE '  - Plans: plan.{type}';
  RAISE NOTICE '  - Outputs: output.{type}';
  RAISE NOTICE '';
  RAISE NOTICE 'Key Changes:';
  RAISE NOTICE '  ✓ NO dependencies array in task schemas';
  RAISE NOTICE '  ✓ NO parent_task_id in task schemas';
  RAISE NOTICE '  ✓ Use edges for task relationships';
  RAISE NOTICE '  ✓ Recurrence properties in task.recurring props';
  RAISE NOTICE '  ✓ Naming conventions documented (enforced at app level)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '  1. Test template resolution: SELECT * FROM onto_templates WHERE scope IN (''task'', ''goal'');';
  RAISE NOTICE '  2. Create test task: Use task.quick template';
  RAISE NOTICE '  3. Create test goal: Use goal.outcome template';
  RAISE NOTICE '  4. Update UI to show task/goal type selection';
  RAISE NOTICE '  5. Implement edge-based task dependencies';
  RAISE NOTICE '';
  RAISE NOTICE '================================================';
END$$;
