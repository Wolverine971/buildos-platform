-- ============================================
-- BuildOS Project Ontology Schema
-- Master Migration v2 - Simplified Facets
-- ============================================

-- 1) Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
create extension if not exists "btree_gin";

-- 2) Dedicated ontology schema
create schema if not exists onto;

-- 3) Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'actor_kind') then
    create type onto.actor_kind as enum ('human','agent');
  end if;
  if not exists (select 1 from pg_type where typname = 'template_status') then
    create type onto.template_status as enum ('draft','active','deprecated');
  end if;
end$$;

-- ============================================
-- CORE REFERENCE TABLES
-- ============================================

-- Actors (humans and AI agents)
create table if not exists onto.actors (
  id uuid primary key default gen_random_uuid(),
  kind onto.actor_kind not null,
  name text not null,
  email text,
  org_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Tools registry (for provenance tracking)
create table if not exists onto.tools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  capability_key text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================
-- SIMPLIFIED FACETED METADATA SYSTEM (3 facets)
-- ============================================

-- Facet taxonomy definitions
create table if not exists onto.facet_definitions (
  key text primary key,
  name text not null,
  description text,
  allowed_values jsonb not null,             -- array of allowed values
  is_multi_value boolean default false,      -- can entity have multiple values?
  is_required boolean default false,
  applies_to text[] not null default '{project}',  -- which entities can use this facet
  created_at timestamptz not null default now()
);

-- Facet value metadata (for rich UI hints)
create table if not exists onto.facet_values (
  id uuid primary key default gen_random_uuid(),
  facet_key text not null references onto.facet_definitions(key) on delete cascade,
  value text not null,
  label text not null,
  description text,
  color text,                                -- UI color hint
  icon text,                                 -- UI icon hint
  parent_value_id uuid references onto.facet_values(id),
  sort_order int default 0,
  created_at timestamptz not null default now(),
  unique (facet_key, value)
);

-- ============================================
-- TEMPLATES REGISTRY
-- ============================================

-- Templates define schemas, FSMs, and defaults for typed entities
create table if not exists onto.templates (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  type_key text not null,
  name text not null,
  status onto.template_status not null default 'active',
  
  -- Template inheritance
  parent_template_id uuid references onto.templates(id),
  is_abstract boolean default false,
  
  -- Schemas and defaults
  schema jsonb not null default '{}'::jsonb,           -- JSON Schema for props validation
  fsm jsonb not null default '{}'::jsonb,              -- FSM definition (states, transitions)
  default_props jsonb not null default '{}'::jsonb,    -- Default property values
  default_views jsonb not null default '[]'::jsonb,    -- UI view hints (pipelines/boards)
  facet_defaults jsonb not null default '{}'::jsonb,   -- Default facet values
  
  -- Template metadata (NOT facets - for discovery/analytics only)
  metadata jsonb not null default '{}'::jsonb,  -- stores realm, output_type, etc
  
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  unique (scope, type_key),
  constraint chk_type_key_format check (type_key ~ '^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$'),
  constraint chk_scope_valid check (scope in ('project','plan','task','deliverable','document','goal','requirement','risk','milestone','metric'))
);

-- ============================================
-- CORE PROJECT ENTITIES
-- ============================================

-- Projects (top-level container)
create table if not exists onto.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,                               -- FK to orgs table (wire later)
  name text not null,
  description text,
  type_key text not null,                    -- e.g., 'writer.book', 'coach.client'
  also_types text[] default '{}',            -- multi-type support: ['developer.app', 'creator.product']
  state_key text not null default 'draft',
  props jsonb not null default '{}'::jsonb,
  
  -- Generated facet columns (only 3 facets)
  facet_context text generated always as (props->'facets'->>'context') stored,
  facet_scale text generated always as (props->'facets'->>'scale') stored,
  facet_stage text generated always as (props->'facets'->>'stage') stored,
  
  start_at timestamptz,
  end_at timestamptz,
  context_document_id uuid,
  
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add FK after documents table is created
-- alter table onto.projects add constraint fk_context_document foreign key (context_document_id) references onto.documents(id) on delete set null;

-- Goals
create table if not exists onto.goals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto.projects(id) on delete cascade,
  name text not null,
  type_key text,
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

-- Requirements
create table if not exists onto.requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto.projects(id) on delete cascade,
  text text not null,
  type_key text not null default 'requirement.general',
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

-- Plans
create table if not exists onto.plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto.projects(id) on delete cascade,
  name text not null,
  type_key text not null,
  state_key text not null default 'draft',
  props jsonb not null default '{}'::jsonb,
  
  -- Facet columns (plans use fewer facets)
  facet_context text generated always as (props->'facets'->>'context') stored,
  facet_scale text generated always as (props->'facets'->>'scale') stored,
  facet_stage text generated always as (props->'facets'->>'stage') stored,
  
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tasks
create table if not exists onto.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto.projects(id) on delete cascade,
  plan_id uuid references onto.plans(id) on delete set null,
  title text not null,
  state_key text not null default 'todo',
  priority int,
  due_at timestamptz,
  props jsonb not null default '{}'::jsonb,
  
  -- Facet column (tasks mainly use scale)
  facet_scale text generated always as (props->'facets'->>'scale') stored,
  
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deliverables
create table if not exists onto.deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto.projects(id) on delete cascade,
  name text not null,
  type_key text not null,
  state_key text not null default 'draft',
  props jsonb not null default '{}'::jsonb,
  
  -- Facet columns
  facet_stage text generated always as (props->'facets'->>'stage') stored,
  
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deliverable versions (for artifact history)
create table if not exists onto.deliverable_versions (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references onto.deliverables(id) on delete cascade,
  number int not null,
  storage_uri text not null,
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (deliverable_id, number)
);

-- Documents
create table if not exists onto.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto.projects(id) on delete cascade,
  title text not null,
  type_key text not null,
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

-- Now add the FK for context_document_id
alter table onto.projects 
  add constraint fk_context_document 
  foreign key (context_document_id) 
  references onto.documents(id) 
  on delete set null;

-- Document versions (with optional embeddings)
create table if not exists onto.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references onto.documents(id) on delete cascade,
  number int not null,
  storage_uri text not null,
  embedding vector(1536),
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (document_id, number)
);

-- Sources (external references)
create table if not exists onto.sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto.projects(id) on delete cascade,
  uri text not null,
  snapshot_uri text,
  captured_at timestamptz,
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

-- Decisions
create table if not exists onto.decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto.projects(id) on delete cascade,
  title text not null,
  decision_at timestamptz not null,
  rationale text,
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

-- Risks
create table if not exists onto.risks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto.projects(id) on delete cascade,
  title text not null,
  type_key text,
  probability numeric check (probability >= 0 and probability <= 1),
  impact text not null default 'medium',
  state_key text not null default 'open',
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

-- Milestones
create table if not exists onto.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto.projects(id) on delete cascade,
  title text not null,
  type_key text,
  due_at timestamptz not null,
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

-- Metrics
create table if not exists onto.metrics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto.projects(id) on delete cascade,
  name text not null,
  type_key text,
  unit text not null,
  definition text,
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

-- Metric data points
create table if not exists onto.metric_points (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references onto.metrics(id) on delete cascade,
  ts timestamptz not null,
  numeric_value numeric not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================
-- GRAPH & RELATIONSHIPS
-- ============================================

-- Universal edges (typed relationships between any entities)
create table if not exists onto.edges (
  id uuid primary key default gen_random_uuid(),
  src_kind text not null,
  src_id uuid not null,
  rel text not null,
  dst_kind text not null,
  dst_id uuid not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================
-- ACCESS CONTROL
-- ============================================

-- Assignments (actor roles on objects)
create table if not exists onto.assignments (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references onto.actors(id) on delete cascade,
  object_kind text not null,
  object_id uuid not null,
  role_key text not null,
  created_at timestamptz not null default now(),
  unique (actor_id, object_kind, object_id, role_key)
);

-- Permissions (fine-grained access control)
create table if not exists onto.permissions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  role_key text,
  object_kind text not null,
  object_id uuid not null,
  access text not null,
  created_at timestamptz not null default now()
);

-- ============================================
-- SIGNALS & INSIGHTS
-- ============================================

-- Signals (external events feeding into projects)
create table if not exists onto.signals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto.projects(id) on delete cascade,
  ts timestamptz not null default now(),
  channel text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- Insights (derived from signals or analysis)
create table if not exists onto.insights (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto.projects(id) on delete cascade,
  title text not null,
  derived_from_signal_id uuid references onto.signals(id) on delete set null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================
-- TRIGGERS
-- ============================================

-- Updated_at trigger function
create or replace function onto.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

-- Apply to tables with updated_at
create trigger trg_templates_updated before update on onto.templates
for each row execute function onto.set_updated_at();

create trigger trg_projects_updated before update on onto.projects
for each row execute function onto.set_updated_at();

create trigger trg_plans_updated before update on onto.plans
for each row execute function onto.set_updated_at();

create trigger trg_tasks_updated before update on onto.tasks
for each row execute function onto.set_updated_at();

create trigger trg_deliverables_updated before update on onto.deliverables
for each row execute function onto.set_updated_at();

-- ============================================
-- INDEXES
-- ============================================

-- Actors
create index idx_actors_org on onto.actors(org_id);
create index idx_actors_kind on onto.actors(kind);

-- Facet definitions
create index idx_facet_values_facet_key on onto.facet_values(facet_key);

-- Templates
create index idx_templates_scope on onto.templates(scope);
create index idx_templates_type_key on onto.templates(type_key);
create index idx_templates_status on onto.templates(status);
create index idx_templates_parent on onto.templates(parent_template_id);
create index gin_templates_metadata on onto.templates using gin (metadata jsonb_path_ops);

-- Projects
create index idx_projects_org on onto.projects(org_id);
create index idx_projects_type_key on onto.projects(type_key);
create index idx_projects_state on onto.projects(state_key);
create index idx_projects_also_types on onto.projects using gin(also_types);

-- Project facet indexes (only 3)
create index idx_projects_facet_context on onto.projects(facet_context) where facet_context is not null;
create index idx_projects_facet_scale on onto.projects(facet_scale) where facet_scale is not null;
create index idx_projects_facet_stage on onto.projects(facet_stage) where facet_stage is not null;

-- Goals
create index idx_goals_project on onto.goals(project_id);
create index idx_goals_type_key on onto.goals(type_key);

-- Requirements
create index idx_requirements_project on onto.requirements(project_id);
create index idx_requirements_type_key on onto.requirements(type_key);

-- Plans
create index idx_plans_project on onto.plans(project_id);
create index idx_plans_type_key on onto.plans(type_key);
create index idx_plans_state on onto.plans(state_key);
create index idx_plans_facet_context on onto.plans(facet_context) where facet_context is not null;
create index idx_plans_facet_scale on onto.plans(facet_scale) where facet_scale is not null;
create index idx_plans_facet_stage on onto.plans(facet_stage) where facet_stage is not null;

-- Tasks
create index idx_tasks_project on onto.tasks(project_id);
create index idx_tasks_plan on onto.tasks(plan_id);
create index idx_tasks_state on onto.tasks(state_key);
create index idx_tasks_due_at on onto.tasks(due_at) where due_at is not null;
create index idx_tasks_priority on onto.tasks(priority) where priority is not null;
create index idx_tasks_facet_scale on onto.tasks(facet_scale) where facet_scale is not null;

-- Deliverables
create index idx_deliverables_project on onto.deliverables(project_id);
create index idx_deliverables_type_key on onto.deliverables(type_key);
create index idx_deliverables_state on onto.deliverables(state_key);
create index idx_deliverables_facet_stage on onto.deliverables(facet_stage) where facet_stage is not null;

-- Deliverable versions
create index idx_deliverable_versions_deliverable on onto.deliverable_versions(deliverable_id);

-- Documents
create index idx_documents_project on onto.documents(project_id);
create index idx_documents_type_key on onto.documents(type_key);

-- Document versions
create index idx_document_versions_document on onto.document_versions(document_id);

-- Sources
create index idx_sources_project on onto.sources(project_id);

-- Decisions
create index idx_decisions_project on onto.decisions(project_id);
create index idx_decisions_decision_at on onto.decisions(decision_at);

-- Risks
create index idx_risks_project on onto.risks(project_id);
create index idx_risks_state on onto.risks(state_key);
create index idx_risks_type_key on onto.risks(type_key);

-- Milestones
create index idx_milestones_project on onto.milestones(project_id);
create index idx_milestones_due_at on onto.milestones(due_at);
create index idx_milestones_type_key on onto.milestones(type_key);

-- Metrics
create index idx_metrics_project on onto.metrics(project_id);
create index idx_metrics_type_key on onto.metrics(type_key);

-- Metric points
create index idx_metric_points_metric on onto.metric_points(metric_id);
create index idx_metric_points_ts on onto.metric_points(ts);

-- Edges (graph queries)
create index idx_edges_src on onto.edges(src_kind, src_id);
create index idx_edges_dst on onto.edges(dst_kind, dst_id);
create index idx_edges_rel on onto.edges(rel);

-- Assignments
create index idx_assignments_actor on onto.assignments(actor_id);
create index idx_assignments_object on onto.assignments(object_kind, object_id);

-- Permissions
create index idx_permissions_actor on onto.permissions(actor_id);
create index idx_permissions_role on onto.permissions(role_key);
create index idx_permissions_object on onto.permissions(object_kind, object_id);

-- Signals
create index idx_signals_project on onto.signals(project_id);
create index idx_signals_ts on onto.signals(ts);
create index idx_signals_channel on onto.signals(channel);

-- Insights
create index idx_insights_project on onto.insights(project_id);
create index idx_insights_signal on onto.insights(derived_from_signal_id);

-- JSONB indexes (GIN for containment queries)
create index gin_projects_props on onto.projects using gin (props jsonb_path_ops);
create index gin_plans_props on onto.plans using gin (props jsonb_path_ops);
create index gin_tasks_props on onto.tasks using gin (props jsonb_path_ops);
create index gin_deliverables_props on onto.deliverables using gin (props jsonb_path_ops);
create index gin_documents_props on onto.documents using gin (props jsonb_path_ops);

-- Text search indexes (trigram for fuzzy matching)
create index trgm_projects_name on onto.projects using gin (name gin_trgm_ops);
create index trgm_projects_description on onto.projects using gin (description gin_trgm_ops);
create index trgm_tasks_title on onto.tasks using gin (title gin_trgm_ops);
create index trgm_deliverables_name on onto.deliverables using gin (name gin_trgm_ops);
create index trgm_documents_title on onto.documents using gin (title gin_trgm_ops);

-- ============================================
-- SEED DATA - SIMPLIFIED FACETS (3 only)
-- ============================================

-- Core facet definitions (only 3)
insert into onto.facet_definitions (key, name, description, allowed_values, applies_to, is_required) values
  ('context', 'Context', 'Work context and organizational setting', 
   '["personal","client","commercial","internal","open_source","community","academic","nonprofit","startup"]'::jsonb, 
   '{project,plan}', false),
  
  ('scale', 'Scale', 'Project size and typical duration', 
   '["micro","small","medium","large","epic"]'::jsonb, 
   '{project,plan,task}', false),
  
  ('stage', 'Stage', 'Current phase in project lifecycle', 
   '["discovery","planning","execution","launch","maintenance","complete"]'::jsonb, 
   '{project,plan,deliverable}', false)
on conflict (key) do nothing;

-- Context facet values
insert into onto.facet_values (facet_key, value, label, description, color, sort_order) values
  ('context', 'personal', 'Personal', 'Personal side project or passion project', '#ec4899', 10),
  ('context', 'client', 'Client Work', 'Client services, consulting, freelance work', '#10b981', 20),
  ('context', 'commercial', 'Commercial', 'For-profit product or business', '#f59e0b', 30),
  ('context', 'internal', 'Internal', 'Internal company or team project', '#64748b', 40),
  ('context', 'open_source', 'Open Source', 'Open source software or community project', '#0ea5e9', 50),
  ('context', 'community', 'Community', 'Community-driven or volunteer initiative', '#8b5cf6', 60),
  ('context', 'academic', 'Academic', 'Academic research or educational institution', '#6366f1', 70),
  ('context', 'nonprofit', 'Nonprofit', 'Social impact, charitable, or nonprofit work', '#22c55e', 80),
  ('context', 'startup', 'Startup', 'Early-stage venture or startup company', '#ef4444', 90)
on conflict (facet_key, value) do nothing;

-- Scale facet values
insert into onto.facet_values (facet_key, value, label, description, color, sort_order) values
  ('scale', 'micro', 'Micro', 'Less than 1 week of effort', '#22c55e', 10),
  ('scale', 'small', 'Small', '1-4 weeks of effort', '#84cc16', 20),
  ('scale', 'medium', 'Medium', '1-3 months of effort', '#f59e0b', 30),
  ('scale', 'large', 'Large', '3-12 months of effort', '#f97316', 40),
  ('scale', 'epic', 'Epic', 'More than 1 year of effort', '#ef4444', 50)
on conflict (facet_key, value) do nothing;

-- Stage facet values
insert into onto.facet_values (facet_key, value, label, description, color, sort_order) values
  ('stage', 'discovery', 'Discovery', 'Research, exploration, problem definition', '#a855f7', 10),
  ('stage', 'planning', 'Planning', 'Planning, design, architecture', '#3b82f6', 20),
  ('stage', 'execution', 'Execution', 'Active development and implementation', '#f59e0b', 30),
  ('stage', 'launch', 'Launch', 'Launch preparation and go-live', '#10b981', 40),
  ('stage', 'maintenance', 'Maintenance', 'Ongoing operation and support', '#64748b', 50),
  ('stage', 'complete', 'Complete', 'Finished and archived', '#22c55e', 60)
on conflict (facet_key, value) do nothing;

-- ============================================
-- SEED TEMPLATES WITH TYPE_KEYS
-- ============================================

-- System actor for seeding
insert into onto.actors (id, kind, name, email) 
values ('00000000-0000-0000-0000-000000000001', 'agent', 'System', 'system@buildos.ai')
on conflict do nothing;

-- Writer templates
insert into onto.templates (scope, type_key, name, status, metadata, facet_defaults, schema, fsm, default_props, default_views, created_by) values
('project', 'writer.book', 'Book Project', 'active',
 '{"realm":"creative","output_type":"content","typical_scale":"large"}'::jsonb,
 '{"context":"personal","scale":"large","stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"genre":{"type":"string"},"target_word_count":{"type":"number"},"deadline":{"type":"string","format":"date"}}}'::jsonb,
 '{"states":["draft","writing","editing","published"],"transitions":[{"from":"draft","to":"writing","event":"start_writing"},{"from":"writing","to":"editing","event":"complete_draft"},{"from":"editing","to":"published","event":"publish"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"pipeline","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

('project', 'writer.article', 'Article/Essay', 'active',
 '{"realm":"creative","output_type":"content","typical_scale":"small"}'::jsonb,
 '{"context":"client","scale":"small","stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"publication":{"type":"string"},"word_count":{"type":"number"},"due_date":{"type":"string","format":"date"}}}'::jsonb,
 '{"states":["draft","writing","review","published"],"transitions":[{"from":"draft","to":"writing","event":"start"},{"from":"writing","to":"review","event":"submit"},{"from":"review","to":"published","event":"publish"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"pipeline","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001');

-- Coach templates
insert into onto.templates (scope, type_key, name, status, metadata, facet_defaults, schema, fsm, default_props, default_views, created_by) values
('project', 'coach.client', 'Coaching Client', 'active',
 '{"realm":"service","output_type":"service","typical_scale":"medium"}'::jsonb,
 '{"context":"client","scale":"medium","stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"client_name":{"type":"string"},"time_horizon_weeks":{"type":"integer"},"session_frequency":{"type":"string"}}}'::jsonb,
 '{"states":["intake","active","paused","completed"],"transitions":[{"from":"intake","to":"active","event":"begin_coaching"},{"from":"active","to":"paused","event":"pause"},{"from":"paused","to":"active","event":"resume"},{"from":"active","to":"completed","event":"complete"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"pipeline","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

('project', 'coach.program', 'Group Coaching Program', 'active',
 '{"realm":"service","output_type":"service","typical_scale":"medium"}'::jsonb,
 '{"context":"commercial","scale":"medium","stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"program_name":{"type":"string"},"cohort_size":{"type":"integer"},"duration_weeks":{"type":"integer"}}}'::jsonb,
 '{"states":["planning","enrollment","active","completed"],"transitions":[{"from":"planning","to":"enrollment","event":"open_enrollment"},{"from":"enrollment","to":"active","event":"start_program"},{"from":"active","to":"completed","event":"finish"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"pipeline","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001');

-- Developer templates
insert into onto.templates (scope, type_key, name, status, metadata, facet_defaults, schema, fsm, default_props, default_views, created_by) values
('project', 'developer.app', 'Application Development', 'active',
 '{"realm":"technical","output_type":"software","typical_scale":"large"}'::jsonb,
 '{"context":"commercial","scale":"large","stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"tech_stack":{"type":"array"},"target_platform":{"type":"string"},"mvp_date":{"type":"string","format":"date"}}}'::jsonb,
 '{"states":["planning","development","testing","deployed"],"transitions":[{"from":"planning","to":"development","event":"start_dev"},{"from":"development","to":"testing","event":"code_complete"},{"from":"testing","to":"deployed","event":"deploy"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"kanban","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

('project', 'developer.feature', 'Feature Development', 'active',
 '{"realm":"technical","output_type":"software","typical_scale":"small"}'::jsonb,
 '{"context":"internal","scale":"small","stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"feature_name":{"type":"string"},"epic_id":{"type":"string"},"story_points":{"type":"integer"}}}'::jsonb,
 '{"states":["backlog","in_progress","review","done"],"transitions":[{"from":"backlog","to":"in_progress","event":"start"},{"from":"in_progress","to":"review","event":"submit_pr"},{"from":"review","to":"done","event":"merge"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"kanban","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001');

-- Founder templates
insert into onto.templates (scope, type_key, name, status, metadata, facet_defaults, schema, fsm, default_props, default_views, created_by) values
('project', 'founder.startup', 'Startup Launch', 'active',
 '{"realm":"business","output_type":"relationship","typical_scale":"epic"}'::jsonb,
 '{"context":"startup","scale":"epic","stage":"discovery"}'::jsonb,
 '{"type":"object","properties":{"company_name":{"type":"string"},"target_market":{"type":"string"},"funding_stage":{"type":"string"}}}'::jsonb,
 '{"states":["ideation","building","launching","growth"],"transitions":[{"from":"ideation","to":"building","event":"start_building"},{"from":"building","to":"launching","event":"launch"},{"from":"launching","to":"growth","event":"achieve_pmf"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"pipeline","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

('project', 'founder.product', 'Product Launch', 'active',
 '{"realm":"business","output_type":"software","typical_scale":"large"}'::jsonb,
 '{"context":"commercial","scale":"large","stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"product_name":{"type":"string"},"target_customers":{"type":"string"},"pricing_model":{"type":"string"}}}'::jsonb,
 '{"states":["concept","development","beta","launched"],"transitions":[{"from":"concept","to":"development","event":"greenlight"},{"from":"development","to":"beta","event":"beta_launch"},{"from":"beta","to":"launched","event":"public_launch"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"pipeline","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001');

-- Student templates
insert into onto.templates (scope, type_key, name, status, metadata, facet_defaults, schema, fsm, default_props, default_views, created_by) values
('project', 'student.assignment', 'Assignment/Homework', 'active',
 '{"realm":"education","output_type":"knowledge","typical_scale":"micro"}'::jsonb,
 '{"context":"academic","scale":"micro","stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"course_name":{"type":"string"},"due_date":{"type":"string","format":"date"},"grade_weight":{"type":"number"}}}'::jsonb,
 '{"states":["assigned","working","submitted","graded"],"transitions":[{"from":"assigned","to":"working","event":"start"},{"from":"working","to":"submitted","event":"submit"},{"from":"submitted","to":"graded","event":"receive_grade"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"list","sort_by":"due_date"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

('project', 'student.project', 'Student Project', 'active',
 '{"realm":"education","output_type":"knowledge","typical_scale":"medium"}'::jsonb,
 '{"context":"academic","scale":"medium","stage":"discovery"}'::jsonb,
 '{"type":"object","properties":{"project_title":{"type":"string"},"subject":{"type":"string"},"presentation_date":{"type":"string","format":"date"}}}'::jsonb,
 '{"states":["assigned","research","building","presenting","complete"],"transitions":[{"from":"assigned","to":"research","event":"start_research"},{"from":"research","to":"building","event":"start_building"},{"from":"building","to":"presenting","event":"present"},{"from":"presenting","to":"complete","event":"grade_received"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"pipeline","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001');

-- Personal templates
insert into onto.templates (scope, type_key, name, status, metadata, facet_defaults, schema, fsm, default_props, default_views, created_by) values
('project', 'personal.goal', 'Personal Goal', 'active',
 '{"realm":"personal_dev","output_type":"process","typical_scale":"medium"}'::jsonb,
 '{"context":"personal","scale":"medium","stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"goal_description":{"type":"string"},"target_date":{"type":"string","format":"date"},"measurement":{"type":"string"}}}'::jsonb,
 '{"states":["planning","active","achieved","abandoned"],"transitions":[{"from":"planning","to":"active","event":"commit"},{"from":"active","to":"achieved","event":"complete"},{"from":"active","to":"abandoned","event":"abandon"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"list","sort_by":"target_date"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

('project', 'personal.routine', 'Habit/Routine', 'active',
 '{"realm":"personal_dev","output_type":"process","typical_scale":"epic"}'::jsonb,
 '{"context":"personal","scale":"epic","stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"routine_name":{"type":"string"},"frequency":{"type":"string"},"time_of_day":{"type":"string"}}}'::jsonb,
 '{"states":["designing","testing","established","maintaining"],"transitions":[{"from":"designing","to":"testing","event":"start_trial"},{"from":"testing","to":"established","event":"make_habit"},{"from":"established","to":"maintaining","event":"sustain"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"checklist","group_by":"day"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001');

-- Plan templates
insert into onto.templates (scope, type_key, name, status, metadata, facet_defaults, schema, fsm, default_props, default_views, created_by) values
('plan', 'plan.weekly', 'Weekly Plan', 'active',
 '{"typical_scale":"micro"}'::jsonb,
 '{"scale":"micro","stage":"execution"}'::jsonb,
 '{"type":"object","properties":{"week_starting":{"type":"string","format":"date"},"focus_areas":{"type":"array"}}}'::jsonb,
 '{"states":["planning","active","review","complete"],"transitions":[{"from":"planning","to":"active","event":"start_week"},{"from":"active","to":"review","event":"week_end"},{"from":"review","to":"complete","event":"archive"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"calendar","group_by":"day"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

('plan', 'plan.sprint', 'Sprint (2 weeks)', 'active',
 '{"typical_scale":"small"}'::jsonb,
 '{"scale":"small","stage":"execution"}'::jsonb,
 '{"type":"object","properties":{"sprint_number":{"type":"integer"},"sprint_goal":{"type":"string"},"capacity":{"type":"number"}}}'::jsonb,
 '{"states":["planning","active","review","complete"],"transitions":[{"from":"planning","to":"active","event":"start_sprint"},{"from":"active","to":"review","event":"sprint_end"},{"from":"review","to":"complete","event":"retrospective_done"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"kanban","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001');

-- Deliverable templates
insert into onto.templates (scope, type_key, name, status, metadata, facet_defaults, schema, fsm, default_props, default_views, created_by) values
('deliverable', 'deliverable.chapter', 'Book Chapter', 'active',
 '{"output_type":"content"}'::jsonb,
 '{"stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"chapter_number":{"type":"integer"},"chapter_title":{"type":"string"},"target_words":{"type":"number"}}}'::jsonb,
 '{"states":["outline","draft","revision","final"],"transitions":[{"from":"outline","to":"draft","event":"start_writing"},{"from":"draft","to":"revision","event":"first_draft_done"},{"from":"revision","to":"final","event":"approve"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"pipeline","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

('deliverable', 'deliverable.design', 'Design Asset', 'active',
 '{"output_type":"content"}'::jsonb,
 '{"stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"asset_type":{"type":"string"},"dimensions":{"type":"string"},"format":{"type":"string"}}}'::jsonb,
 '{"states":["concept","draft","review","approved"],"transitions":[{"from":"concept","to":"draft","event":"start_designing"},{"from":"draft","to":"review","event":"submit"},{"from":"review","to":"approved","event":"approve"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"pipeline","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

('deliverable', 'deliverable.workout_plan', 'Workout Plan', 'active',
 '{"output_type":"knowledge"}'::jsonb,
 '{"stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"split":{"type":"string"},"weeks":{"type":"integer"},"equipment":{"type":"array"}}}'::jsonb,
 '{"states":["draft","review","active","completed"],"transitions":[{"from":"draft","to":"review","event":"submit"},{"from":"review","to":"active","event":"approve"},{"from":"active","to":"completed","event":"complete"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"pipeline","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001');

-- Document templates
insert into onto.templates (scope, type_key, name, status, metadata, facet_defaults, schema, fsm, default_props, default_views, created_by) values
('document', 'doc.brief', 'Project Brief', 'active',
 '{"output_type":"knowledge"}'::jsonb,
 '{}'::jsonb,
 '{"type":"object","properties":{"purpose":{"type":"string"},"audience":{"type":"string"}}}'::jsonb,
 '{"states":["draft","review","approved"],"transitions":[{"from":"draft","to":"review","event":"submit"},{"from":"review","to":"approved","event":"approve"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"document"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

('document', 'doc.notes', 'Notes/Research', 'active',
 '{"output_type":"knowledge"}'::jsonb,
 '{}'::jsonb,
 '{"type":"object","properties":{"topic":{"type":"string"},"tags":{"type":"array"}}}'::jsonb,
 '{"states":["active","archived"],"transitions":[{"from":"active","to":"archived","event":"archive"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"document"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

('document', 'doc.intake', 'Intake Form', 'active',
 '{"output_type":"knowledge"}'::jsonb,
 '{}'::jsonb,
 '{"type":"object","properties":{"client_info":{"type":"object"},"responses":{"type":"array"}}}'::jsonb,
 '{"states":["draft","submitted","reviewed"],"transitions":[{"from":"draft","to":"submitted","event":"submit"},{"from":"submitted","to":"reviewed","event":"review"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"form"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001');

-- ============================================
-- COMPLETE
-- ============================================

do $$
begin
  raise notice 'BuildOS ontology schema created successfully';
  raise notice 'Simplified facets seeded: context, scale, stage (3 only)';
  raise notice 'Templates seeded: 16 project templates + 2 plan + 3 deliverable + 3 document templates';
  raise notice 'realm and output_type moved to template metadata for discovery/analytics';
end$$;