-- ============================================
-- Add Base Abstract Output Templates
-- Adds inheritance structure for text documents
-- ============================================

-- First, create the base abstract template for all outputs
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  parent_template_id,
  is_abstract,
  schema,
  fsm,
  default_props,
  default_views,
  metadata,
  facet_defaults,
  created_by
) VALUES (
  'output',
  'output.base',
  'Base Output',
  'active',
  NULL,  -- No parent (this is the root)
  true,  -- Abstract - cannot be instantiated directly
  '{
    "type": "object",
    "properties": {
      "name": {"type": "string"},
      "description": {"type": "string"}
    },
    "required": ["name"]
  }'::jsonb,
  '{
    "type_key": "output.base",
    "states": ["draft", "review", "approved", "published"],
    "transitions": [
      {"from": "draft", "to": "review", "event": "submit"},
      {"from": "review", "to": "draft", "event": "request_changes"},
      {"from": "review", "to": "approved", "event": "approve"},
      {"from": "approved", "to": "published", "event": "publish"}
    ]
  }'::jsonb,
  '{}'::jsonb,
  '[{"view": "pipeline", "group_by": "state_key"}]'::jsonb,
  '{
    "realm": "output",
    "description": "Base template for all outputs"
  }'::jsonb,
  '{"stage": "planning"}'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- Create base text document template (inherits from output.base)
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  parent_template_id,
  is_abstract,
  schema,
  fsm,
  default_props,
  default_views,
  metadata,
  facet_defaults,
  created_by
) VALUES (
  'output',
  'output.document',
  'Text Document',
  'active',
  (SELECT id FROM onto_templates WHERE type_key = 'output.base' AND scope = 'output'),
  true,  -- Abstract - use specialized variants instead
  '{
    "type": "object",
    "properties": {
      "title": {"type": "string"},
      "content": {"type": "string"},
      "content_type": {"type": "string", "enum": ["html", "markdown"], "default": "html"},
      "word_count": {"type": "number", "minimum": 0, "default": 0},
      "author_notes": {"type": "string"}
    },
    "required": ["title"]
  }'::jsonb,
  '{
    "type_key": "output.document",
    "states": ["draft", "review", "approved", "published"],
    "transitions": [
      {"from": "draft", "to": "review", "event": "submit"},
      {"from": "review", "to": "draft", "event": "request_changes"},
      {"from": "review", "to": "approved", "event": "approve"},
      {"from": "approved", "to": "published", "event": "publish"}
    ]
  }'::jsonb,
  '{
    "content": "",
    "content_type": "html",
    "word_count": 0
  }'::jsonb,
  '[{"view": "document"}]'::jsonb,
  '{
    "primitive": "TEXT_DOCUMENT",
    "output_type": "content",
    "can_create_in_buildos": true,
    "description": "Base template for all text documents that can be created and edited in BuildOS"
  }'::jsonb,
  '{"stage": "planning"}'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- Update existing output.chapter to inherit from output.document
UPDATE onto_templates
SET
  parent_template_id = (SELECT id FROM onto_templates WHERE type_key = 'output.document' AND scope = 'output'),
  is_abstract = false,
  metadata = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{primitive}',
        '"TEXT_DOCUMENT"'
      ),
      '{typical_use_by}',
      '["writer"]'
    ),
    '{can_create_in_buildos}',
    'true'
  )
WHERE type_key = 'output.chapter' AND scope = 'output';

-- Add new specialized text document templates

-- Article/Essay template
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  parent_template_id,
  is_abstract,
  schema,
  fsm,
  default_props,
  default_views,
  metadata,
  facet_defaults,
  created_by
) VALUES (
  'output',
  'output.article',
  'Article/Essay',
  'active',
  (SELECT id FROM onto_templates WHERE type_key = 'output.document' AND scope = 'output'),
  false,
  '{
    "type": "object",
    "properties": {
      "publication": {"type": "string"},
      "target_word_count": {"type": "number", "minimum": 100},
      "keywords": {"type": "array", "items": {"type": "string"}},
      "seo_title": {"type": "string", "maxLength": 60},
      "meta_description": {"type": "string", "maxLength": 160},
      "publish_date": {"type": "string", "format": "date"}
    }
  }'::jsonb,
  '{
    "type_key": "output.article",
    "states": ["draft", "review", "approved", "published"],
    "transitions": [
      {"from": "draft", "to": "review", "event": "submit"},
      {"from": "review", "to": "draft", "event": "request_changes"},
      {"from": "review", "to": "approved", "event": "approve"},
      {"from": "approved", "to": "published", "event": "publish"}
    ]
  }'::jsonb,
  '{
    "target_word_count": 1000
  }'::jsonb,
  '[{"view": "document"}]'::jsonb,
  '{
    "primitive": "TEXT_DOCUMENT",
    "output_type": "content",
    "typical_use_by": ["writer", "marketer", "content-creator"],
    "can_create_in_buildos": true,
    "description": "Articles, essays, and published content pieces"
  }'::jsonb,
  '{"stage": "planning"}'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- Blog Post template
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  parent_template_id,
  is_abstract,
  schema,
  fsm,
  default_props,
  default_views,
  metadata,
  facet_defaults,
  created_by
) VALUES (
  'output',
  'output.blog_post',
  'Blog Post',
  'active',
  (SELECT id FROM onto_templates WHERE type_key = 'output.document' AND scope = 'output'),
  false,
  '{
    "type": "object",
    "properties": {
      "blog_name": {"type": "string"},
      "categories": {"type": "array", "items": {"type": "string"}},
      "tags": {"type": "array", "items": {"type": "string"}},
      "featured_image_url": {"type": "string", "format": "uri"},
      "publish_date": {"type": "string", "format": "date"},
      "excerpt": {"type": "string", "maxLength": 300},
      "slug": {"type": "string"}
    }
  }'::jsonb,
  '{
    "type_key": "output.blog_post",
    "states": ["draft", "review", "approved", "published"],
    "transitions": [
      {"from": "draft", "to": "review", "event": "submit"},
      {"from": "review", "to": "draft", "event": "request_changes"},
      {"from": "review", "to": "approved", "event": "approve"},
      {"from": "approved", "to": "published", "event": "publish"}
    ]
  }'::jsonb,
  '{
    "categories": [],
    "tags": []
  }'::jsonb,
  '[{"view": "document"}]'::jsonb,
  '{
    "primitive": "TEXT_DOCUMENT",
    "output_type": "content",
    "typical_use_by": ["writer", "marketer", "content-creator", "founder"],
    "can_create_in_buildos": true,
    "description": "Blog posts for websites and content marketing"
  }'::jsonb,
  '{"stage": "planning"}'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- Case Study template
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  parent_template_id,
  is_abstract,
  schema,
  fsm,
  default_props,
  default_views,
  metadata,
  facet_defaults,
  created_by
) VALUES (
  'output',
  'output.case_study',
  'Case Study',
  'active',
  (SELECT id FROM onto_templates WHERE type_key = 'output.document' AND scope = 'output'),
  false,
  '{
    "type": "object",
    "properties": {
      "client_name": {"type": "string"},
      "industry": {"type": "string"},
      "challenge": {"type": "string"},
      "solution": {"type": "string"},
      "results": {"type": "array", "items": {"type": "string"}},
      "testimonial": {"type": "string"},
      "project_duration": {"type": "string"},
      "team_size": {"type": "number"}
    },
    "required": ["client_name", "challenge"]
  }'::jsonb,
  '{
    "type_key": "output.case_study",
    "states": ["draft", "review", "approved", "published"],
    "transitions": [
      {"from": "draft", "to": "review", "event": "submit"},
      {"from": "review", "to": "draft", "event": "request_changes"},
      {"from": "review", "to": "approved", "event": "approve"},
      {"from": "approved", "to": "published", "event": "publish"}
    ]
  }'::jsonb,
  '{
    "results": []
  }'::jsonb,
  '[{"view": "document"}]'::jsonb,
  '{
    "primitive": "TEXT_DOCUMENT",
    "output_type": "content",
    "typical_use_by": ["marketer", "consultant", "agency", "founder"],
    "can_create_in_buildos": true,
    "description": "Customer case studies showcasing successful projects and outcomes"
  }'::jsonb,
  '{"stage": "planning"}'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- Whitepaper template
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  parent_template_id,
  is_abstract,
  schema,
  fsm,
  default_props,
  default_views,
  metadata,
  facet_defaults,
  created_by
) VALUES (
  'output',
  'output.whitepaper',
  'Whitepaper',
  'active',
  (SELECT id FROM onto_templates WHERE type_key = 'output.document' AND scope = 'output'),
  false,
  '{
    "type": "object",
    "properties": {
      "target_audience": {"type": "string"},
      "key_findings": {"type": "array", "items": {"type": "string"}},
      "data_sources": {"type": "array", "items": {"type": "string"}},
      "abstract": {"type": "string", "maxLength": 500},
      "target_word_count": {"type": "number", "minimum": 2000}
    }
  }'::jsonb,
  '{
    "type_key": "output.whitepaper",
    "states": ["draft", "review", "approved", "published"],
    "transitions": [
      {"from": "draft", "to": "review", "event": "submit"},
      {"from": "review", "to": "draft", "event": "request_changes"},
      {"from": "review", "to": "approved", "event": "approve"},
      {"from": "approved", "to": "published", "event": "publish"}
    ]
  }'::jsonb,
  '{
    "target_word_count": 3000,
    "key_findings": [],
    "data_sources": []
  }'::jsonb,
  '[{"view": "document"}]'::jsonb,
  '{
    "primitive": "TEXT_DOCUMENT",
    "output_type": "knowledge",
    "typical_use_by": ["marketer", "researcher", "consultant", "founder"],
    "can_create_in_buildos": true,
    "description": "Long-form thought leadership and research papers"
  }'::jsonb,
  '{"stage": "planning"}'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- Newsletter template
INSERT INTO onto_templates (
  scope,
  type_key,
  name,
  status,
  parent_template_id,
  is_abstract,
  schema,
  fsm,
  default_props,
  default_views,
  metadata,
  facet_defaults,
  created_by
) VALUES (
  'output',
  'output.newsletter',
  'Newsletter Edition',
  'active',
  (SELECT id FROM onto_templates WHERE type_key = 'output.document' AND scope = 'output'),
  false,
  '{
    "type": "object",
    "properties": {
      "edition_number": {"type": "number"},
      "send_date": {"type": "string", "format": "date"},
      "subject_line": {"type": "string", "maxLength": 90},
      "preview_text": {"type": "string", "maxLength": 140},
      "subscriber_segment": {"type": "string"}
    }
  }'::jsonb,
  '{
    "type_key": "output.newsletter",
    "states": ["draft", "review", "scheduled", "sent"],
    "transitions": [
      {"from": "draft", "to": "review", "event": "submit"},
      {"from": "review", "to": "draft", "event": "request_changes"},
      {"from": "review", "to": "scheduled", "event": "schedule"},
      {"from": "scheduled", "to": "sent", "event": "send"}
    ]
  }'::jsonb,
  '{}'::jsonb,
  '[{"view": "document"}]'::jsonb,
  '{
    "primitive": "TEXT_DOCUMENT",
    "output_type": "content",
    "typical_use_by": ["marketer", "writer", "content-creator", "founder"],
    "can_create_in_buildos": true,
    "description": "Newsletter editions for email marketing campaigns"
  }'::jsonb,
  '{"stage": "planning"}'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- Add comment
COMMENT ON COLUMN onto_templates.parent_template_id IS
  'ID of parent template for inheritance. Null for root templates. Child templates inherit schema properties and can override FSM.';

COMMENT ON COLUMN onto_templates.is_abstract IS
  'If true, template cannot be instantiated directly. Used for base templates like output.document.';

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Base output templates with inheritance created successfully';
  RAISE NOTICE 'Templates added: output.base, output.document (abstract)';
  RAISE NOTICE 'Text document variants: output.article, output.blog_post, output.case_study, output.whitepaper, output.newsletter';
  RAISE NOTICE 'Updated output.chapter to inherit from output.document';
END$$;
