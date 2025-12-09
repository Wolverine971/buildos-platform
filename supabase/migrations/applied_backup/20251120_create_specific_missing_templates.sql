-- supabase/migrations/applied_backup/20251120_create_specific_missing_templates.sql
-- Migration: Create Specific Missing Templates with Intelligent Schemas
-- Date: 2024-11-20
-- Purpose: Create missing templates identified in production with proper schemas and defaults

-- First, let's fix the data issues where type_keys don't match expected patterns

-- Fix outputs that have document.* type_keys (should be output.research.*)
UPDATE onto_outputs
SET type_key = 'output.research.database'
WHERE type_key = 'document.research.database';

UPDATE onto_outputs
SET type_key = 'output.research.profile'
WHERE type_key = 'document.research.profile';

UPDATE onto_outputs
SET type_key = 'output.research.visualization'
WHERE type_key = 'document.research.visualization';

-- Note: task.spec and task.scratch will be handled by a separate migration
-- that converts them to task.documentation with proper edge relationships

-- Now create the templates with proper schemas

-- 1. Document Templates

-- document.project.context - Project context and background documentation
INSERT INTO onto_templates (
  type_key,
  name,
  scope,
  status,
  is_abstract,
  fsm,
  schema,
  metadata,
  default_props,
  facet_defaults,
  created_by
) VALUES (
  'document.project.context',
  'Project Context Document',
  'document',
  'active',
  false,
  jsonb_build_object(
    'type_key', 'document.project.context',
    'states', jsonb_build_array('draft', 'review', 'published', 'archived'),
    'transitions', jsonb_build_array(
      jsonb_build_object('from', 'draft', 'to', 'review', 'event', 'submit_review', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'review', 'to', 'published', 'event', 'publish', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'review', 'to', 'draft', 'event', 'request_changes', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'published', 'to', 'archived', 'event', 'archive', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb)
    )
  ),
  jsonb_build_object(
    'type', 'object',
    'properties', jsonb_build_object(
      'summary', jsonb_build_object(
        'type', 'string',
        'description', 'Brief summary of the project context',
        'maxLength', 500
      ),
      'background', jsonb_build_object(
        'type', 'string',
        'description', 'Background information and history'
      ),
      'objectives', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object('type', 'string'),
        'description', 'Key project objectives'
      ),
      'stakeholders', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object(
          'type', 'object',
          'properties', jsonb_build_object(
            'name', jsonb_build_object('type', 'string'),
            'role', jsonb_build_object('type', 'string'),
            'contact', jsonb_build_object('type', 'string', 'format', 'email')
          )
        ),
        'description', 'Project stakeholders'
      ),
      'constraints', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'budget', jsonb_build_object('type', 'number'),
          'timeline', jsonb_build_object('type', 'string'),
          'resources', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string'))
        )
      ),
      'success_metrics', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object('type', 'string'),
        'description', 'How success will be measured'
      )
    ),
    'required', jsonb_build_array('summary')
  ),
  jsonb_build_object(
    'source', 'migration',
    'created_at', now(),
    'migration', '20251120_create_specific_missing_templates',
    'description', 'Template for project context documentation'
  ),
  jsonb_build_object(
    'template_version', '1.0.0',
    'auto_archive_after_days', 365
  ),
  jsonb_build_object(),
  gen_random_uuid()
);

-- document.meeting.brief - Meeting documentation and notes
INSERT INTO onto_templates (
  type_key,
  name,
  scope,
  status,
  is_abstract,
  fsm,
  schema,
  metadata,
  default_props,
  facet_defaults,
  created_by
) VALUES (
  'document.meeting.brief',
  'Meeting Brief',
  'document',
  'active',
  false,
  jsonb_build_object(
    'type_key', 'document.meeting.brief',
    'states', jsonb_build_array('draft', 'review', 'published', 'archived'),
    'transitions', jsonb_build_array(
      jsonb_build_object('from', 'draft', 'to', 'review', 'event', 'submit_review', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'review', 'to', 'published', 'event', 'publish', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'review', 'to', 'draft', 'event', 'request_changes', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'published', 'to', 'archived', 'event', 'archive', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb)
    )
  ),
  jsonb_build_object(
    'type', 'object',
    'properties', jsonb_build_object(
      'meeting_date', jsonb_build_object(
        'type', 'string',
        'format', 'date-time',
        'description', 'When the meeting occurred'
      ),
      'attendees', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object(
          'type', 'object',
          'properties', jsonb_build_object(
            'name', jsonb_build_object('type', 'string'),
            'email', jsonb_build_object('type', 'string', 'format', 'email'),
            'role', jsonb_build_object('type', 'string')
          )
        ),
        'description', 'Meeting attendees'
      ),
      'agenda', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object('type', 'string'),
        'description', 'Meeting agenda items'
      ),
      'key_discussions', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object(
          'type', 'object',
          'properties', jsonb_build_object(
            'topic', jsonb_build_object('type', 'string'),
            'summary', jsonb_build_object('type', 'string'),
            'outcome', jsonb_build_object('type', 'string')
          )
        ),
        'description', 'Key discussion points'
      ),
      'decisions', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object(
          'type', 'object',
          'properties', jsonb_build_object(
            'decision', jsonb_build_object('type', 'string'),
            'rationale', jsonb_build_object('type', 'string'),
            'owner', jsonb_build_object('type', 'string')
          )
        ),
        'description', 'Decisions made'
      ),
      'action_items', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object(
          'type', 'object',
          'properties', jsonb_build_object(
            'action', jsonb_build_object('type', 'string'),
            'owner', jsonb_build_object('type', 'string'),
            'due_date', jsonb_build_object('type', 'string', 'format', 'date'),
            'status', jsonb_build_object(
              'type', 'string',
              'enum', jsonb_build_array('pending', 'in_progress', 'completed')
            )
          )
        ),
        'description', 'Action items from the meeting'
      ),
      'next_meeting', jsonb_build_object(
        'type', 'string',
        'format', 'date-time',
        'description', 'Next meeting scheduled'
      ),
      'recording_url', jsonb_build_object(
        'type', 'string',
        'format', 'uri',
        'description', 'Link to meeting recording'
      )
    ),
    'required', jsonb_build_array('meeting_date', 'attendees')
  ),
  jsonb_build_object(
    'source', 'migration',
    'created_at', now(),
    'migration', '20251120_create_specific_missing_templates',
    'description', 'Template for meeting documentation'
  ),
  jsonb_build_object(
    'send_summary_email', false,
    'track_action_items', true
  ),
  jsonb_build_object(),
  gen_random_uuid()
);

-- document.marketing.strategy - Marketing strategy documentation
INSERT INTO onto_templates (
  type_key,
  name,
  scope,
  status,
  is_abstract,
  fsm,
  schema,
  metadata,
  default_props,
  facet_defaults,
  created_by
) VALUES (
  'document.marketing.strategy',
  'Marketing Strategy Document',
  'document',
  'active',
  false,
  jsonb_build_object(
    'type_key', 'document.marketing.strategy',
    'states', jsonb_build_array('draft', 'review', 'approved', 'active', 'archived'),
    'transitions', jsonb_build_array(
      jsonb_build_object('from', 'draft', 'to', 'review', 'event', 'submit_review', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'review', 'to', 'approved', 'event', 'approve', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'review', 'to', 'draft', 'event', 'request_changes', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'approved', 'to', 'active', 'event', 'activate', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'active', 'to', 'archived', 'event', 'archive', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb)
    )
  ),
  jsonb_build_object(
    'type', 'object',
    'properties', jsonb_build_object(
      'campaign_name', jsonb_build_object(
        'type', 'string',
        'description', 'Marketing campaign name'
      ),
      'target_audience', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'demographics', jsonb_build_object('type', 'object'),
          'psychographics', jsonb_build_object('type', 'object'),
          'behaviors', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string')),
          'pain_points', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string'))
        )
      ),
      'objectives', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object(
          'type', 'object',
          'properties', jsonb_build_object(
            'objective', jsonb_build_object('type', 'string'),
            'metric', jsonb_build_object('type', 'string'),
            'target', jsonb_build_object('type', 'number'),
            'timeline', jsonb_build_object('type', 'string')
          )
        )
      ),
      'channels', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object(
          'type', 'object',
          'properties', jsonb_build_object(
            'channel', jsonb_build_object('type', 'string'),
            'budget', jsonb_build_object('type', 'number'),
            'strategy', jsonb_build_object('type', 'string')
          )
        )
      ),
      'messaging', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'value_proposition', jsonb_build_object('type', 'string'),
          'key_messages', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string')),
          'call_to_action', jsonb_build_object('type', 'string')
        )
      ),
      'budget', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'total', jsonb_build_object('type', 'number'),
          'breakdown', jsonb_build_object('type', 'object')
        )
      ),
      'timeline', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'start_date', jsonb_build_object('type', 'string', 'format', 'date'),
          'end_date', jsonb_build_object('type', 'string', 'format', 'date'),
          'milestones', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'object'))
        )
      ),
      'success_metrics', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object('type', 'string')
      )
    ),
    'required', jsonb_build_array('campaign_name', 'target_audience', 'objectives')
  ),
  jsonb_build_object(
    'source', 'migration',
    'created_at', now(),
    'migration', '20251120_create_specific_missing_templates',
    'description', 'Template for marketing strategy documentation'
  ),
  jsonb_build_object(
    'review_required', true,
    'approval_required', true
  ),
  jsonb_build_object(),
  gen_random_uuid()
);

-- task.documentation - Generic template for task-related documents
-- Note: Replaces task.spec and task.scratch templates
-- Documents will be linked to tasks via onto_edges relationships
INSERT INTO onto_templates (
  type_key,
  name,
  scope,
  status,
  is_abstract,
  fsm,
  schema,
  metadata,
  default_props,
  facet_defaults,
  created_by
) VALUES (
  'task.documentation',
  'Task Documentation',
  'document',
  'active',
  false,
  jsonb_build_object(
    'type_key', 'task.documentation',
    'states', jsonb_build_array('draft', 'review', 'final', 'archived'),
    'transitions', jsonb_build_array(
      jsonb_build_object('from', 'draft', 'to', 'review', 'event', 'submit_review', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'review', 'to', 'final', 'event', 'approve', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'review', 'to', 'draft', 'event', 'request_changes', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'final', 'to', 'archived', 'event', 'archive', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb)
    )
  ),
  jsonb_build_object(
    'type', 'object',
    'properties', jsonb_build_object(
      'doc_type', jsonb_build_object(
        'type', 'string',
        'enum', jsonb_build_array('general', 'spec', 'notes', 'scratch', 'requirements', 'design', 'test_plan'),
        'description', 'Type of task documentation'
      ),
      'content', jsonb_build_object(
        'type', 'string',
        'description', 'Main content of the document'
      ),
      'sections', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object(
          'type', 'object',
          'properties', jsonb_build_object(
            'title', jsonb_build_object('type', 'string'),
            'content', jsonb_build_object('type', 'string'),
            'order', jsonb_build_object('type', 'integer')
          )
        ),
        'description', 'Structured sections within the document'
      ),
      'related_tasks', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object('type', 'string', 'format', 'uuid'),
        'description', 'UUIDs of related tasks (for edge creation)'
      ),
      'version', jsonb_build_object(
        'type', 'string',
        'pattern', '^\d+\.\d+\.\d+$',
        'description', 'Document version'
      ),
      'last_modified', jsonb_build_object(
        'type', 'string',
        'format', 'date-time',
        'description', 'Last modification timestamp'
      ),
      'tags', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object('type', 'string'),
        'description', 'Tags for organization'
      )
    ),
    'required', jsonb_build_array('doc_type', 'content')
  ),
  jsonb_build_object(
    'source', 'migration',
    'created_at', now(),
    'migration', '20251120_create_specific_missing_templates',
    'description', 'Generic template for task-related documentation'
  ),
  jsonb_build_object(
    'doc_type', 'general',
    'content', '',
    'sections', '[]'::jsonb,
    'related_tasks', '[]'::jsonb,
    'version', '1.0.0',
    'tags', '[]'::jsonb
  ),
  jsonb_build_object(),
  gen_random_uuid()
);

-- 2. Output Templates

-- output.research.database - Research database output
INSERT INTO onto_templates (
  type_key,
  name,
  scope,
  status,
  is_abstract,
  fsm,
  schema,
  metadata,
  default_props,
  facet_defaults,
  created_by
) VALUES (
  'output.research.database',
  'Research Database',
  'output',
  'active',
  false,
  jsonb_build_object(
    'type_key', 'output.research.database',
    'states', jsonb_build_array('draft', 'active', 'delivered', 'accepted'),
    'transitions', jsonb_build_array(
      jsonb_build_object('from', 'draft', 'to', 'active', 'event', 'activate', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'active', 'to', 'delivered', 'event', 'deliver', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'delivered', 'to', 'accepted', 'event', 'accept', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'delivered', 'to', 'active', 'event', 'revise', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb)
    )
  ),
  jsonb_build_object(
    'type', 'object',
    'properties', jsonb_build_object(
      'database_type', jsonb_build_object(
        'type', 'string',
        'enum', jsonb_build_array('relational', 'document', 'graph', 'key-value', 'spreadsheet'),
        'description', 'Type of database'
      ),
      'schema_definition', jsonb_build_object(
        'type', 'object',
        'description', 'Database schema or structure'
      ),
      'data_sources', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object(
          'type', 'object',
          'properties', jsonb_build_object(
            'source', jsonb_build_object('type', 'string'),
            'type', jsonb_build_object('type', 'string'),
            'last_updated', jsonb_build_object('type', 'string', 'format', 'date-time')
          )
        )
      ),
      'record_count', jsonb_build_object(
        'type', 'integer',
        'minimum', 0,
        'description', 'Number of records in database'
      ),
      'access_info', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'location', jsonb_build_object('type', 'string'),
          'credentials_location', jsonb_build_object('type', 'string'),
          'permissions', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string'))
        )
      ),
      'query_examples', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object(
          'type', 'object',
          'properties', jsonb_build_object(
            'description', jsonb_build_object('type', 'string'),
            'query', jsonb_build_object('type', 'string')
          )
        )
      )
    ),
    'required', jsonb_build_array('database_type')
  ),
  jsonb_build_object(
    'source', 'migration',
    'created_at', now(),
    'migration', '20251120_create_specific_missing_templates',
    'description', 'Template for research database outputs'
  ),
  jsonb_build_object(
    'content_type', 'database',
    'versioned', true
  ),
  jsonb_build_object(),
  gen_random_uuid()
);

-- output.research.profile - Research profile output
INSERT INTO onto_templates (
  type_key,
  name,
  scope,
  status,
  is_abstract,
  fsm,
  schema,
  metadata,
  default_props,
  facet_defaults,
  created_by
) VALUES (
  'output.research.profile',
  'Research Profile',
  'output',
  'active',
  false,
  jsonb_build_object(
    'type_key', 'output.research.profile',
    'states', jsonb_build_array('draft', 'active', 'delivered', 'accepted'),
    'transitions', jsonb_build_array(
      jsonb_build_object('from', 'draft', 'to', 'active', 'event', 'activate', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'active', 'to', 'delivered', 'event', 'deliver', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'delivered', 'to', 'accepted', 'event', 'accept', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'delivered', 'to', 'active', 'event', 'revise', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb)
    )
  ),
  jsonb_build_object(
    'type', 'object',
    'properties', jsonb_build_object(
      'subject', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'name', jsonb_build_object('type', 'string'),
          'type', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('person', 'organization', 'product', 'topic')),
          'identifier', jsonb_build_object('type', 'string')
        ),
        'required', jsonb_build_array('name', 'type')
      ),
      'summary', jsonb_build_object(
        'type', 'string',
        'maxLength', 1000,
        'description', 'Executive summary of research findings'
      ),
      'key_findings', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object(
          'type', 'object',
          'properties', jsonb_build_object(
            'finding', jsonb_build_object('type', 'string'),
            'evidence', jsonb_build_object('type', 'string'),
            'confidence', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('high', 'medium', 'low'))
          )
        )
      ),
      'data_points', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object(
          'type', 'object',
          'properties', jsonb_build_object(
            'category', jsonb_build_object('type', 'string'),
            'metric', jsonb_build_object('type', 'string'),
            'value', jsonb_build_object('type', 'string'),
            'source', jsonb_build_object('type', 'string'),
            'date', jsonb_build_object('type', 'string', 'format', 'date')
          )
        )
      ),
      'sources', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object(
          'type', 'object',
          'properties', jsonb_build_object(
            'title', jsonb_build_object('type', 'string'),
            'url', jsonb_build_object('type', 'string', 'format', 'uri'),
            'author', jsonb_build_object('type', 'string'),
            'date', jsonb_build_object('type', 'string', 'format', 'date'),
            'credibility', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('high', 'medium', 'low'))
          )
        )
      ),
      'recommendations', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object('type', 'string'),
        'description', 'Recommendations based on research'
      )
    ),
    'required', jsonb_build_array('subject', 'summary')
  ),
  jsonb_build_object(
    'source', 'migration',
    'created_at', now(),
    'migration', '20251120_create_specific_missing_templates',
    'description', 'Template for research profile outputs'
  ),
  jsonb_build_object(
    'content_type', 'research',
    'format', 'profile'
  ),
  jsonb_build_object(),
  gen_random_uuid()
);

-- output.research.visualization - Research visualization output
INSERT INTO onto_templates (
  type_key,
  name,
  scope,
  status,
  is_abstract,
  fsm,
  schema,
  metadata,
  default_props,
  facet_defaults,
  created_by
) VALUES (
  'output.research.visualization',
  'Research Visualization',
  'output',
  'active',
  false,
  jsonb_build_object(
    'type_key', 'output.research.visualization',
    'states', jsonb_build_array('draft', 'active', 'delivered', 'accepted'),
    'transitions', jsonb_build_array(
      jsonb_build_object('from', 'draft', 'to', 'active', 'event', 'activate', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'active', 'to', 'delivered', 'event', 'deliver', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'delivered', 'to', 'accepted', 'event', 'accept', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'delivered', 'to', 'active', 'event', 'revise', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb)
    )
  ),
  jsonb_build_object(
    'type', 'object',
    'properties', jsonb_build_object(
      'visualization_type', jsonb_build_object(
        'type', 'string',
        'enum', jsonb_build_array('chart', 'graph', 'map', 'dashboard', 'infographic', 'diagram'),
        'description', 'Type of visualization'
      ),
      'data_source', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'type', jsonb_build_object('type', 'string'),
          'location', jsonb_build_object('type', 'string'),
          'query', jsonb_build_object('type', 'string')
        )
      ),
      'dimensions', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'width', jsonb_build_object('type', 'number'),
          'height', jsonb_build_object('type', 'number'),
          'responsive', jsonb_build_object('type', 'boolean')
        )
      ),
      'interactive_features', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object('type', 'string'),
        'description', 'Interactive features like zoom, filter, drill-down'
      ),
      'color_scheme', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'primary', jsonb_build_object('type', 'string'),
          'secondary', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string'))
        )
      ),
      'insights', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object('type', 'string'),
        'description', 'Key insights from the visualization'
      ),
      'embed_code', jsonb_build_object(
        'type', 'string',
        'description', 'HTML embed code if applicable'
      ),
      'export_formats', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('png', 'svg', 'pdf', 'html', 'json')),
        'description', 'Available export formats'
      )
    ),
    'required', jsonb_build_array('visualization_type')
  ),
  jsonb_build_object(
    'source', 'migration',
    'created_at', now(),
    'migration', '20251120_create_specific_missing_templates',
    'description', 'Template for research visualization outputs'
  ),
  jsonb_build_object(
    'content_type', 'visualization',
    'interactive', true
  ),
  jsonb_build_object(),
  gen_random_uuid()
);

-- output.book - Book output
INSERT INTO onto_templates (
  type_key,
  name,
  scope,
  status,
  is_abstract,
  fsm,
  schema,
  metadata,
  default_props,
  facet_defaults,
  created_by
) VALUES (
  'output.book',
  'Book',
  'output',
  'active',
  false,
  jsonb_build_object(
    'type_key', 'output.book',
    'states', jsonb_build_array('outline', 'writing', 'editing', 'review', 'published'),
    'transitions', jsonb_build_array(
      jsonb_build_object('from', 'outline', 'to', 'writing', 'event', 'start_writing', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'writing', 'to', 'editing', 'event', 'start_editing', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'editing', 'to', 'review', 'event', 'submit_review', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'review', 'to', 'editing', 'event', 'request_changes', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'review', 'to', 'published', 'event', 'publish', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb)
    )
  ),
  jsonb_build_object(
    'type', 'object',
    'properties', jsonb_build_object(
      'title', jsonb_build_object(
        'type', 'string',
        'description', 'Book title'
      ),
      'subtitle', jsonb_build_object(
        'type', 'string',
        'description', 'Book subtitle'
      ),
      'author', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'name', jsonb_build_object('type', 'string'),
          'bio', jsonb_build_object('type', 'string'),
          'email', jsonb_build_object('type', 'string', 'format', 'email')
        )
      ),
      'genre', jsonb_build_object(
        'type', 'string',
        'description', 'Book genre or category'
      ),
      'target_audience', jsonb_build_object(
        'type', 'string',
        'description', 'Target readership'
      ),
      'synopsis', jsonb_build_object(
        'type', 'string',
        'maxLength', 2000,
        'description', 'Book synopsis'
      ),
      'outline', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object(
          'type', 'object',
          'properties', jsonb_build_object(
            'chapter_number', jsonb_build_object('type', 'integer'),
            'chapter_title', jsonb_build_object('type', 'string'),
            'summary', jsonb_build_object('type', 'string'),
            'word_count_target', jsonb_build_object('type', 'integer'),
            'status', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('not_started', 'in_progress', 'completed'))
          )
        )
      ),
      'word_count', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'current', jsonb_build_object('type', 'integer'),
          'target', jsonb_build_object('type', 'integer')
        )
      ),
      'isbn', jsonb_build_object(
        'type', 'string',
        'pattern', '^(97[89])?[0-9]{10}$',
        'description', 'ISBN number'
      ),
      'publication_details', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'publisher', jsonb_build_object('type', 'string'),
          'publication_date', jsonb_build_object('type', 'string', 'format', 'date'),
          'edition', jsonb_build_object('type', 'string'),
          'format', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('hardcover', 'paperback', 'ebook', 'audiobook')))
        )
      ),
      'marketing_copy', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'back_cover', jsonb_build_object('type', 'string'),
          'author_platform', jsonb_build_object('type', 'string'),
          'comparable_titles', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string'))
        )
      )
    ),
    'required', jsonb_build_array('title', 'author', 'genre')
  ),
  jsonb_build_object(
    'source', 'migration',
    'created_at', now(),
    'migration', '20251120_create_specific_missing_templates',
    'description', 'Template for book outputs'
  ),
  jsonb_build_object(
    'content_type', 'book',
    'long_form', true,
    'versioned', true
  ),
  jsonb_build_object(),
  gen_random_uuid()
);

-- 3. Project Templates

-- project.community.forum - Community forum project
INSERT INTO onto_templates (
  type_key,
  name,
  scope,
  status,
  is_abstract,
  fsm,
  schema,
  metadata,
  default_props,
  facet_defaults,
  created_by
) VALUES (
  'project.community.forum',
  'Community Forum Project',
  'project',
  'active',
  false,
  jsonb_build_object(
    'type_key', 'project.community.forum',
    'states', jsonb_build_array('planning', 'development', 'beta', 'active', 'maintenance', 'archived'),
    'transitions', jsonb_build_array(
      jsonb_build_object('from', 'planning', 'to', 'development', 'event', 'start_development', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'development', 'to', 'beta', 'event', 'launch_beta', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'beta', 'to', 'active', 'event', 'go_live', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'active', 'to', 'maintenance', 'event', 'enter_maintenance', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb),
      jsonb_build_object('from', 'maintenance', 'to', 'archived', 'event', 'archive', 'guards', '[]'::jsonb, 'actions', '[]'::jsonb)
    )
  ),
  jsonb_build_object(
    'type', 'object',
    'properties', jsonb_build_object(
      'forum_details', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'platform', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('discourse', 'flarum', 'nodebb', 'vanilla', 'custom')),
          'url', jsonb_build_object('type', 'string', 'format', 'uri'),
          'launch_date', jsonb_build_object('type', 'string', 'format', 'date')
        )
      ),
      'community', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'target_size', jsonb_build_object('type', 'integer'),
          'current_members', jsonb_build_object('type', 'integer'),
          'active_members', jsonb_build_object('type', 'integer'),
          'growth_rate', jsonb_build_object('type', 'number'),
          'demographics', jsonb_build_object('type', 'object')
        )
      ),
      'categories', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object(
          'type', 'object',
          'properties', jsonb_build_object(
            'name', jsonb_build_object('type', 'string'),
            'description', jsonb_build_object('type', 'string'),
            'moderators', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string')),
            'rules', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string'))
          )
        )
      ),
      'moderation', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'guidelines', jsonb_build_object('type', 'string'),
          'team_size', jsonb_build_object('type', 'integer'),
          'automation_tools', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string'))
        )
      ),
      'engagement_metrics', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'daily_active_users', jsonb_build_object('type', 'integer'),
          'posts_per_day', jsonb_build_object('type', 'number'),
          'avg_response_time', jsonb_build_object('type', 'number'),
          'user_retention', jsonb_build_object('type', 'number')
        )
      ),
      'features', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object(
          'type', 'object',
          'properties', jsonb_build_object(
            'feature', jsonb_build_object('type', 'string'),
            'status', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('planned', 'in_development', 'live', 'deprecated')),
            'priority', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('high', 'medium', 'low'))
          )
        )
      ),
      'technical_stack', jsonb_build_object(
        'type', 'object',
        'properties', jsonb_build_object(
          'hosting', jsonb_build_object('type', 'string'),
          'database', jsonb_build_object('type', 'string'),
          'cdn', jsonb_build_object('type', 'string'),
          'monitoring', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string'))
        )
      )
    ),
    'required', jsonb_build_array('forum_details', 'community')
  ),
  jsonb_build_object(
    'source', 'migration',
    'created_at', now(),
    'migration', '20251120_create_specific_missing_templates',
    'description', 'Template for community forum projects'
  ),
  jsonb_build_object(
    'requires_moderation', true,
    'public_facing', true,
    'requires_maintenance', true
  ),
  jsonb_build_object(),
  gen_random_uuid()
);

-- Log what we created
DO $$
BEGIN
  RAISE NOTICE 'Migration completed. Templates created for:';
  RAISE NOTICE '- Documents: project.context, meeting.brief, marketing.strategy, task.documentation';
  RAISE NOTICE '- Outputs: research.database, research.profile, research.visualization, book';
  RAISE NOTICE '- Projects: community.forum';
  RAISE NOTICE '';
  RAISE NOTICE 'Also fixed data issues:';
  RAISE NOTICE '- Updated outputs with document.* type_keys to output.* type_keys';
  RAISE NOTICE '- Task.spec and task.scratch documents handled by separate migration';
END $$;