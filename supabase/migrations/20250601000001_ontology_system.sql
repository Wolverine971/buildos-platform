-- ============================================
-- BuildOS Ontology System Migration
-- Tables in PUBLIC schema with onto_ prefix
-- ============================================

-- Drop existing tables (clean slate)
drop table if exists onto_metric_points cascade;
drop table if exists onto_metrics cascade;
drop table if exists onto_milestones cascade;
drop table if exists onto_risks cascade;
drop table if exists onto_decisions cascade;
drop table if exists onto_sources cascade;
drop table if exists onto_document_versions cascade;
drop table if exists onto_documents cascade;
drop table if exists onto_output_versions cascade;
drop table if exists onto_outputs cascade;
drop table if exists onto_tasks cascade;
drop table if exists onto_plans cascade;
drop table if exists onto_requirements cascade;
drop table if exists onto_goals cascade;
drop table if exists onto_projects cascade;
drop table if exists onto_edges cascade;
drop table if exists onto_insights cascade;
drop table if exists onto_signals cascade;
drop table if exists onto_permissions cascade;
drop table if exists onto_assignments cascade;
drop table if exists onto_templates cascade;
drop table if exists onto_facet_values cascade;
drop table if exists onto_facet_definitions cascade;
drop table if exists onto_tools cascade;
drop table if exists onto_actors cascade;

-- Drop enums
drop type if exists onto_template_status cascade;
drop type if exists onto_actor_kind cascade;

-- Drop functions
drop function if exists ensure_actor_for_user(uuid) cascade;
drop function if exists set_updated_at() cascade;

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
create extension if not exists "btree_gin";

-- Enums (in public schema)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'onto_actor_kind') then
    create type onto_actor_kind as enum ('human','agent');
  end if;
  if not exists (select 1 from pg_type where typname = 'onto_template_status') then
    create type onto_template_status as enum ('draft','active','deprecated');
  end if;
end$$;

-- ============================================
-- CORE REFERENCE TABLES
-- ============================================

-- Actors (humans and AI agents)
create table if not exists onto_actors (
  id uuid primary key default gen_random_uuid(),
  kind onto_actor_kind not null,
  name text not null,
  email text,
  user_id uuid references public.users(id) on delete cascade,
  org_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  -- Constraints
  constraint chk_actor_identity check (
    (kind = 'human' and user_id is not null) or
    (kind = 'agent' and user_id is null)
  )
);

create unique index if not exists idx_onto_actors_user_id_unique
  on onto_actors(user_id)
  where user_id is not null;

create index if not exists idx_onto_actors_user_id on onto_actors(user_id) where user_id is not null;
create index if not exists idx_onto_actors_org on onto_actors(org_id);
create index if not exists idx_onto_actors_kind on onto_actors(kind);

-- Tools registry (for provenance tracking)
create table if not exists onto_tools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  capability_key text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================
-- FACETED METADATA SYSTEM (3 facets)
-- ============================================

-- Facet taxonomy definitions
create table if not exists onto_facet_definitions (
  key text primary key,
  name text not null,
  description text,
  allowed_values jsonb not null,
  is_multi_value boolean default false,
  is_required boolean default false,
  applies_to text[] not null default '{project}',
  created_at timestamptz not null default now()
);

-- Facet value metadata
create table if not exists onto_facet_values (
  id uuid primary key default gen_random_uuid(),
  facet_key text not null references onto_facet_definitions(key) on delete cascade,
  value text not null,
  label text not null,
  description text,
  color text,
  icon text,
  parent_value_id uuid references onto_facet_values(id),
  sort_order int default 0,
  created_at timestamptz not null default now(),
  unique (facet_key, value)
);

create index if not exists idx_onto_facet_values_facet_key on onto_facet_values(facet_key);

-- ============================================
-- TEMPLATES REGISTRY
-- ============================================

create table if not exists onto_templates (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  type_key text not null,
  name text not null,
  status onto_template_status not null default 'active',

  parent_template_id uuid references onto_templates(id),
  is_abstract boolean default false,

  schema jsonb not null default '{}'::jsonb,
  fsm jsonb not null default '{}'::jsonb,
  default_props jsonb not null default '{}'::jsonb,
  default_views jsonb not null default '[]'::jsonb,
  facet_defaults jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (scope, type_key),
  constraint chk_type_key_format check (type_key ~ '^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$'),
  constraint chk_scope_valid check (scope in ('project','plan','task','output','document','goal','requirement','risk','milestone','metric'))
);

create index if not exists idx_onto_templates_scope on onto_templates(scope);
create index if not exists idx_onto_templates_type_key on onto_templates(type_key);
create index if not exists idx_onto_templates_status on onto_templates(status);
create index if not exists idx_onto_templates_parent on onto_templates(parent_template_id);
create index if not exists idx_onto_templates_metadata on onto_templates using gin (metadata jsonb_path_ops);

-- ============================================
-- CORE PROJECT ENTITIES
-- ============================================

-- Projects
create table if not exists onto_projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  name text not null,
  description text,
  type_key text not null,
  also_types text[] default '{}',
  state_key text not null default 'draft',
  props jsonb not null default '{}'::jsonb,

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

create index if not exists idx_onto_projects_org on onto_projects(org_id);
create index if not exists idx_onto_projects_type_key on onto_projects(type_key);
create index if not exists idx_onto_projects_state on onto_projects(state_key);
create index if not exists idx_onto_projects_also_types on onto_projects using gin(also_types);
create index if not exists idx_onto_projects_facet_context on onto_projects(facet_context) where facet_context is not null;
create index if not exists idx_onto_projects_facet_scale on onto_projects(facet_scale) where facet_scale is not null;
create index if not exists idx_onto_projects_facet_stage on onto_projects(facet_stage) where facet_stage is not null;
create index if not exists idx_onto_projects_props on onto_projects using gin (props jsonb_path_ops);
create index if not exists idx_onto_projects_name on onto_projects using gin (name gin_trgm_ops);
create index if not exists idx_onto_projects_description on onto_projects using gin (description gin_trgm_ops);

-- Goals
create table if not exists onto_goals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto_projects(id) on delete cascade,
  name text not null,
  type_key text,
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_onto_goals_project on onto_goals(project_id);
create index if not exists idx_onto_goals_type_key on onto_goals(type_key);

-- Requirements
create table if not exists onto_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto_projects(id) on delete cascade,
  text text not null,
  type_key text not null default 'requirement.general',
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_onto_requirements_project on onto_requirements(project_id);
create index if not exists idx_onto_requirements_type_key on onto_requirements(type_key);

-- Plans
create table if not exists onto_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto_projects(id) on delete cascade,
  name text not null,
  type_key text not null,
  state_key text not null default 'draft',
  props jsonb not null default '{}'::jsonb,

  facet_context text generated always as (props->'facets'->>'context') stored,
  facet_scale text generated always as (props->'facets'->>'scale') stored,
  facet_stage text generated always as (props->'facets'->>'stage') stored,

  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_onto_plans_project on onto_plans(project_id);
create index if not exists idx_onto_plans_type_key on onto_plans(type_key);
create index if not exists idx_onto_plans_state on onto_plans(state_key);
create index if not exists idx_onto_plans_props on onto_plans using gin (props jsonb_path_ops);

-- Tasks
create table if not exists onto_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto_projects(id) on delete cascade,
  plan_id uuid references onto_plans(id) on delete set null,
  title text not null,
  state_key text not null default 'todo',
  priority int,
  due_at timestamptz,
  props jsonb not null default '{}'::jsonb,

  facet_scale text generated always as (props->'facets'->>'scale') stored,

  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_onto_tasks_project on onto_tasks(project_id);
create index if not exists idx_onto_tasks_plan on onto_tasks(plan_id);
create index if not exists idx_onto_tasks_state on onto_tasks(state_key);
create index if not exists idx_onto_tasks_due_at on onto_tasks(due_at) where due_at is not null;
create index if not exists idx_onto_tasks_priority on onto_tasks(priority) where priority is not null;
create index if not exists idx_onto_tasks_props on onto_tasks using gin (props jsonb_path_ops);
create index if not exists idx_onto_tasks_title on onto_tasks using gin (title gin_trgm_ops);

-- outputs
create table if not exists onto_outputs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto_projects(id) on delete cascade,
  name text not null,
  type_key text not null,
  state_key text not null default 'draft',
  props jsonb not null default '{}'::jsonb,

  facet_stage text generated always as (props->'facets'->>'stage') stored,

  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_onto_outputs_project on onto_outputs(project_id);
create index if not exists idx_onto_outputs_type_key on onto_outputs(type_key);
create index if not exists idx_onto_outputs_state on onto_outputs(state_key);
create index if not exists idx_onto_outputs_props on onto_outputs using gin (props jsonb_path_ops);

-- output versions
create table if not exists onto_output_versions (
  id uuid primary key default gen_random_uuid(),
  output_id uuid not null references onto_outputs(id) on delete cascade,
  number int not null,
  storage_uri text not null,
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (output_id, number)
);

create index if not exists idx_onto_output_versions_output on onto_output_versions(output_id);

-- Documents
create table if not exists onto_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto_projects(id) on delete cascade,
  title text not null,
  type_key text not null,
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_onto_documents_project on onto_documents(project_id);
create index if not exists idx_onto_documents_type_key on onto_documents(type_key);
create index if not exists idx_onto_documents_props on onto_documents using gin (props jsonb_path_ops);

-- Add FK for context_document_id now that documents table exists
alter table onto_projects
  add constraint fk_context_document
  foreign key (context_document_id)
  references onto_documents(id)
  on delete set null;

-- Document versions
create table if not exists onto_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references onto_documents(id) on delete cascade,
  number int not null,
  storage_uri text not null,
  embedding vector(1536),
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (document_id, number)
);

create index if not exists idx_onto_document_versions_document on onto_document_versions(document_id);

-- Sources
create table if not exists onto_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto_projects(id) on delete cascade,
  uri text not null,
  snapshot_uri text,
  captured_at timestamptz,
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_onto_sources_project on onto_sources(project_id);

-- Decisions
create table if not exists onto_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto_projects(id) on delete cascade,
  title text not null,
  decision_at timestamptz not null,
  rationale text,
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_onto_decisions_project on onto_decisions(project_id);
create index if not exists idx_onto_decisions_decision_at on onto_decisions(decision_at);

-- Risks
create table if not exists onto_risks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto_projects(id) on delete cascade,
  title text not null,
  type_key text,
  probability numeric check (probability >= 0 and probability <= 1),
  impact text not null default 'medium',
  state_key text not null default 'open',
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_onto_risks_project on onto_risks(project_id);
create index if not exists idx_onto_risks_state on onto_risks(state_key);
create index if not exists idx_onto_risks_type_key on onto_risks(type_key);

-- Milestones
create table if not exists onto_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto_projects(id) on delete cascade,
  title text not null,
  type_key text,
  due_at timestamptz not null,
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_onto_milestones_project on onto_milestones(project_id);
create index if not exists idx_onto_milestones_due_at on onto_milestones(due_at);
create index if not exists idx_onto_milestones_type_key on onto_milestones(type_key);

-- Metrics
create table if not exists onto_metrics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto_projects(id) on delete cascade,
  name text not null,
  type_key text,
  unit text not null,
  definition text,
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_onto_metrics_project on onto_metrics(project_id);
create index if not exists idx_onto_metrics_type_key on onto_metrics(type_key);

-- Metric data points
create table if not exists onto_metric_points (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references onto_metrics(id) on delete cascade,
  ts timestamptz not null,
  numeric_value numeric not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_onto_metric_points_metric on onto_metric_points(metric_id);
create index if not exists idx_onto_metric_points_ts on onto_metric_points(ts);

-- ============================================
-- GRAPH & RELATIONSHIPS
-- ============================================

create table if not exists onto_edges (
  id uuid primary key default gen_random_uuid(),
  src_kind text not null,
  src_id uuid not null,
  rel text not null,
  dst_kind text not null,
  dst_id uuid not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_onto_edges_src on onto_edges(src_kind, src_id);
create index if not exists idx_onto_edges_dst on onto_edges(dst_kind, dst_id);
create index if not exists idx_onto_edges_rel on onto_edges(rel);

-- ============================================
-- ACCESS CONTROL
-- ============================================

create table if not exists onto_assignments (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references onto_actors(id) on delete cascade,
  object_kind text not null,
  object_id uuid not null,
  role_key text not null,
  created_at timestamptz not null default now(),
  unique (actor_id, object_kind, object_id, role_key)
);

create index if not exists idx_onto_assignments_actor on onto_assignments(actor_id);
create index if not exists idx_onto_assignments_object on onto_assignments(object_kind, object_id);

create table if not exists onto_permissions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  role_key text,
  object_kind text not null,
  object_id uuid not null,
  access text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_onto_permissions_actor on onto_permissions(actor_id);
create index if not exists idx_onto_permissions_role on onto_permissions(role_key);
create index if not exists idx_onto_permissions_object on onto_permissions(object_kind, object_id);

-- ============================================
-- SIGNALS & INSIGHTS
-- ============================================

create table if not exists onto_signals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto_projects(id) on delete cascade,
  ts timestamptz not null default now(),
  channel text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_onto_signals_project on onto_signals(project_id);
create index if not exists idx_onto_signals_ts on onto_signals(ts);
create index if not exists idx_onto_signals_channel on onto_signals(channel);

create table if not exists onto_insights (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto_projects(id) on delete cascade,
  title text not null,
  derived_from_signal_id uuid references onto_signals(id) on delete set null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_onto_insights_project on onto_insights(project_id);
create index if not exists idx_onto_insights_signal on onto_insights(derived_from_signal_id);

-- ============================================
-- TRIGGERS
-- ============================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

create trigger trg_onto_templates_updated before update on onto_templates
for each row execute function set_updated_at();

create trigger trg_onto_projects_updated before update on onto_projects
for each row execute function set_updated_at();

create trigger trg_onto_plans_updated before update on onto_plans
for each row execute function set_updated_at();

create trigger trg_onto_tasks_updated before update on onto_tasks
for each row execute function set_updated_at();

create trigger trg_onto_outputs_updated before update on onto_outputs
for each row execute function set_updated_at();

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Ensure actor exists for a user
create or replace function ensure_actor_for_user(p_user_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_actor_id uuid;
  v_user_name text;
  v_user_email text;
begin
  -- Check if actor already exists
  select id into v_actor_id
  from onto_actors
  where user_id = p_user_id;

  if v_actor_id is not null then
    return v_actor_id;
  end if;

  -- Get user info
  select name, email into v_user_name, v_user_email
  from public.users
  where id = p_user_id;

  if v_user_name is null then
    raise exception 'User not found: %', p_user_id;
  end if;

  -- Create new actor
  insert into onto_actors (kind, name, email, user_id)
  values ('human', coalesce(v_user_name, v_user_email, 'Unknown User'), v_user_email, p_user_id)
  returning id into v_actor_id;

  return v_actor_id;
end;
$$;

grant execute on function ensure_actor_for_user(uuid) to authenticated;

comment on function ensure_actor_for_user(uuid) is
  'Ensures an actor record exists for a given user_id, creating one if needed. Returns actor_id.';

-- ============================================
-- SEED DATA
-- ============================================

-- Core facet definitions
insert into onto_facet_definitions (key, name, description, allowed_values, applies_to, is_required) values
  ('context', 'Context', 'Work context and organizational setting',
   '["personal","client","commercial","internal","open_source","community","academic","nonprofit","startup"]'::jsonb,
   '{project,plan}', false),

  ('scale', 'Scale', 'Project size and typical duration',
   '["micro","small","medium","large","epic"]'::jsonb,
   '{project,plan,task}', false),

  ('stage', 'Stage', 'Current phase in project lifecycle',
   '["discovery","planning","execution","launch","maintenance","complete"]'::jsonb,
   '{project,plan,output}', false)
on conflict (key) do nothing;

-- Context facet values
insert into onto_facet_values (facet_key, value, label, description, color, sort_order) values
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
insert into onto_facet_values (facet_key, value, label, description, color, sort_order) values
  ('scale', 'micro', 'Micro', 'Less than 1 week of effort', '#22c55e', 10),
  ('scale', 'small', 'Small', '1-4 weeks of effort', '#84cc16', 20),
  ('scale', 'medium', 'Medium', '1-3 months of effort', '#f59e0b', 30),
  ('scale', 'large', 'Large', '3-12 months of effort', '#f97316', 40),
  ('scale', 'epic', 'Epic', 'More than 1 year of effort', '#ef4444', 50)
on conflict (facet_key, value) do nothing;

-- Stage facet values
insert into onto_facet_values (facet_key, value, label, description, color, sort_order) values
  ('stage', 'discovery', 'Discovery', 'Research, exploration, problem definition', '#a855f7', 10),
  ('stage', 'planning', 'Planning', 'Planning, design, architecture', '#3b82f6', 20),
  ('stage', 'execution', 'Execution', 'Active development and implementation', '#f59e0b', 30),
  ('stage', 'launch', 'Launch', 'Launch preparation and go-live', '#10b981', 40),
  ('stage', 'maintenance', 'Maintenance', 'Ongoing operation and support', '#64748b', 50),
  ('stage', 'complete', 'Complete', 'Finished and archived', '#22c55e', 60)
on conflict (facet_key, value) do nothing;

-- System actor for seeding
insert into onto_actors (id, kind, name, email)
values ('00000000-0000-0000-0000-000000000001', 'agent', 'System', 'system@buildos.ai')
on conflict do nothing;

-- Writer templates
insert into onto_templates (scope, type_key, name, status, metadata, facet_defaults, schema, fsm, default_props, default_views, created_by) values
('project', 'writer.book', 'Book Project', 'active',
 '{"realm":"creative","output_type":"content","typical_scale":"large","keywords":["writing","book","novel","author","manuscript","publishing"]}'::jsonb,
 '{"context":"personal","scale":"large","stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"genre":{"type":"string"},"target_word_count":{"type":"number","minimum":1000},"deadline":{"type":"string","format":"date"},"publisher":{"type":"string"},"draft_complete_date":{"type":"string","format":"date"}}}'::jsonb,
 '{
   "type_key":"writer.book",
   "states":["planning","writing","editing","published"],
   "transitions":[
     {
       "from":"planning",
       "to":"writing",
       "event":"start_writing",
       "guards":[{"type":"has_property","path":"props.target_word_count"}],
       "actions":[
         {"type":"spawn_tasks","titles":["Draft Chapter 1","Draft Chapter 2","Draft Chapter 3","Draft Chapter 4","Draft Chapter 5"],"props_template":{"facets":{"scale":"medium"}}},
         {"type":"update_facets","facets":{"stage":"execution"}},
         {"type":"notify","message":"Writing phase started! Time to create your manuscript."}
       ]
     },
     {
       "from":"writing",
       "to":"editing",
       "event":"complete_draft",
       "guards":[{"type":"has_property","path":"props.draft_complete_date"}],
       "actions":[
         {"type":"spawn_tasks","titles":["First editing pass - structure and flow","Second editing pass - prose and style","Proofread for grammar and typos","Format manuscript"],"props_template":{"facets":{"scale":"small"}}},
         {"type":"update_facets","facets":{"stage":"launch"}},
         {"type":"notify","message":"Draft complete! Moving to editing phase."}
       ]
     },
     {
       "from":"editing",
       "to":"published",
       "event":"publish",
       "actions":[
         {"type":"update_facets","facets":{"stage":"complete"}},
         {"type":"notify","message":"Congratulations! Your book is published!"},
         {"type":"email_user","subject":"Your book is published!","body_template":"Congratulations on publishing your book!"}
       ]
     }
   ]
 }'::jsonb,
 '{"default_chapter_count":10}'::jsonb,
 '[{"view":"pipeline","group_by":"state_key"},{"view":"kanban","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

('project', 'writer.article', 'Article/Essay', 'active',
 '{"realm":"creative","output_type":"content","typical_scale":"small"}'::jsonb,
 '{"context":"client","scale":"small","stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"publication":{"type":"string"},"word_count":{"type":"number"},"due_date":{"type":"string","format":"date"}}}'::jsonb,
 '{"states":["draft","writing","review","published"],"transitions":[{"from":"draft","to":"writing","event":"start"},{"from":"writing","to":"review","event":"submit"},{"from":"review","to":"published","event":"publish"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"pipeline","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

-- Coach templates
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
 '00000000-0000-0000-0000-000000000001'),

-- Developer templates
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
 '00000000-0000-0000-0000-000000000001'),

-- Founder templates
('project', 'founder.startup', 'Startup Launch', 'active',
 '{"realm":"business","output_type":"relationship","typical_scale":"epic","keywords":["startup","founder","entrepreneur","company","business","venture","product-market-fit","fundraising"]}'::jsonb,
 '{"context":"startup","scale":"epic","stage":"discovery"}'::jsonb,
 '{"type":"object","properties":{"company_name":{"type":"string"},"target_market":{"type":"string"},"value_proposition":{"type":"string"},"funding_stage":{"type":"string","enum":["bootstrapped","pre-seed","seed","series-a"]},"mvp_complete":{"type":"boolean","default":false},"first_customer_date":{"type":"string","format":"date"},"customer_count":{"type":"number","minimum":0},"mrr":{"type":"number","minimum":0}}}'::jsonb,
 '{
   "type_key":"founder.startup",
   "states":["ideation","building","launching","growth"],
   "transitions":[
     {
       "from":"ideation",
       "to":"building",
       "event":"start_building",
       "guards":[
         {"type":"has_property","path":"props.company_name"},
         {"type":"has_property","path":"props.target_market"},
         {"type":"has_property","path":"props.value_proposition"}
       ],
       "actions":[
         {"type":"spawn_tasks","titles":["Define MVP features","Build core product","Set up development environment","Create landing page","Design user onboarding flow"],"props_template":{"facets":{"scale":"large"}}},
         {"type":"update_facets","facets":{"stage":"execution"}},
         {"type":"notify","message":"Building phase started! Time to create your MVP."}
       ]
     },
     {
       "from":"building",
       "to":"launching",
       "event":"launch",
       "guards":[
         {"type":"has_property","path":"props.mvp_complete"}
       ],
       "actions":[
         {"type":"spawn_tasks","titles":["Create launch plan","Set up analytics","Prepare marketing materials","Reach out to beta users","Launch on Product Hunt"],"props_template":{"facets":{"scale":"medium"}}},
         {"type":"create_output","name":"Launch Plan","type_key":"output.launch_plan","props":{"stage":"planning"}},
         {"type":"update_facets","facets":{"stage":"launch"}},
         {"type":"notify","message":"Launch phase! Time to get your first customers."}
       ]
     },
     {
       "from":"launching",
       "to":"growth",
       "event":"achieve_pmf",
       "guards":[
         {"type":"has_property","path":"props.customer_count"},
         {"type":"has_property","path":"props.first_customer_date"}
       ],
       "actions":[
         {"type":"spawn_tasks","titles":["Scale customer acquisition","Optimize conversion funnel","Build growth loops","Hire first team members","Raise funding"],"props_template":{"facets":{"scale":"large"}}},
         {"type":"update_facets","facets":{"stage":"maintenance"}},
         {"type":"notify","message":"Product-market fit achieved! Focus on growth."},
         {"type":"email_user","subject":"Congratulations on achieving PMF!","body_template":"Your startup has reached product-market fit. Time to scale!"}
       ]
     },
     {
       "from":"building",
       "to":"ideation",
       "event":"pivot",
       "actions":[
         {"type":"update_facets","facets":{"stage":"discovery"}},
         {"type":"notify","message":"Pivoting! Time to rethink your approach."}
       ]
     }
   ]
 }'::jsonb,
 '{"default_funding_stage":"bootstrapped"}'::jsonb,
 '[{"view":"pipeline","group_by":"state_key"},{"view":"kanban","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

('project', 'founder.product', 'Product Launch', 'active',
 '{"realm":"business","output_type":"software","typical_scale":"large"}'::jsonb,
 '{"context":"commercial","scale":"large","stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"product_name":{"type":"string"},"target_customers":{"type":"string"},"pricing_model":{"type":"string"}}}'::jsonb,
 '{"states":["concept","development","beta","launched"],"transitions":[{"from":"concept","to":"development","event":"greenlight"},{"from":"development","to":"beta","event":"beta_launch"},{"from":"beta","to":"launched","event":"public_launch"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"pipeline","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

-- Student templates
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
 '00000000-0000-0000-0000-000000000001'),

-- Personal templates
('project', 'personal.goal', 'Personal Goal', 'active',
 '{"realm":"personal_dev","output_type":"process","typical_scale":"medium"}'::jsonb,
 '{"context":"personal","scale":"medium","stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"goal_description":{"type":"string"},"target_date":{"type":"string","format":"date"},"measurement":{"type":"string"}}}'::jsonb,
 '{"states":["planning","active","achieved","abandoned"],"transitions":[{"from":"planning","to":"active","event":"commit"},{"from":"active","to":"achieved","event":"complete"},{"from":"active","to":"abandoned","event":"abandon"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"list","sort_by":"target_date"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

('project', 'personal.routine', 'Habit/Routine', 'active',
 '{"realm":"personal_dev","output_type":"process","typical_scale":"epic","keywords":["habit","routine","practice","daily","weekly","consistency","self-improvement"]}'::jsonb,
 '{"context":"personal","scale":"epic","stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"routine_name":{"type":"string"},"frequency":{"type":"string","enum":["daily","weekly","monthly"]},"time_of_day":{"type":"string","enum":["morning","afternoon","evening","night"]},"trial_days":{"type":"number","minimum":7},"days_completed":{"type":"number","default":0},"target_streak":{"type":"number","minimum":21}}}'::jsonb,
 '{
   "type_key":"personal.routine",
   "states":["designing","testing","established","maintaining"],
   "transitions":[
     {
       "from":"designing",
       "to":"testing",
       "event":"start_trial",
       "guards":[
         {"type":"has_property","path":"props.frequency"},
         {"type":"has_property","path":"props.time_of_day"}
       ],
       "actions":[
         {"type":"schedule_rrule","rrule":"FREQ=DAILY;COUNT=21","task_template":{"title":"Complete routine","props":{"facets":{"scale":"micro"}}}},
         {"type":"update_facets","facets":{"stage":"execution"}},
         {"type":"notify","message":"Trial started! Track your progress for the next 21 days."}
       ]
     },
     {
       "from":"testing",
       "to":"established",
       "event":"make_habit",
       "guards":[
         {"type":"has_property","path":"props.days_completed"}
       ],
       "actions":[
         {"type":"update_facets","facets":{"stage":"maintenance"}},
         {"type":"notify","message":"Great job! Your routine is now established. Keep it going!"}
       ]
     },
     {
       "from":"established",
       "to":"maintaining",
       "event":"sustain",
       "actions":[
         {"type":"schedule_rrule","rrule":"FREQ=DAILY","task_template":{"title":"Maintain routine"}},
         {"type":"notify","message":"Routine is now part of your lifestyle!"}
       ]
     },
     {
       "from":"testing",
       "to":"designing",
       "event":"restart",
       "actions":[
         {"type":"update_facets","facets":{"stage":"planning"}},
         {"type":"notify","message":"Routine reset. Let''s redesign and try again!"}
       ]
     }
   ]
 }'::jsonb,
 '{"target_streak":21}'::jsonb,
 '[{"view":"checklist","group_by":"day"},{"view":"calendar","group_by":"week"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

-- Marketer templates
('project', 'marketer.campaign', 'Marketing Campaign', 'active',
 '{"realm":"business","output_type":"content","typical_scale":"medium","keywords":["marketing","campaign","advertising","content","brand","social-media","email","launch"]}'::jsonb,
 '{"context":"commercial","scale":"medium","stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"campaign_name":{"type":"string"},"campaign_goal":{"type":"string","enum":["brand-awareness","lead-generation","product-launch","engagement","sales"]},"target_audience":{"type":"string"},"budget":{"type":"number","minimum":0},"channels":{"type":"array","items":{"type":"string","enum":["social-media","email","paid-ads","content-marketing","influencer"]}},"start_date":{"type":"string","format":"date"},"end_date":{"type":"string","format":"date"},"assets_complete":{"type":"boolean","default":false},"approval_date":{"type":"string","format":"date"},"performance_metrics":{"type":"object","properties":{"impressions":{"type":"number"},"clicks":{"type":"number"},"conversions":{"type":"number"},"roi":{"type":"number"}}}}}'::jsonb,
 '{
   "type_key":"marketer.campaign",
   "states":["planning","creating","reviewing","launched","analyzing"],
   "transitions":[
     {
       "from":"planning",
       "to":"creating",
       "event":"start_creation",
       "guards":[
         {"type":"has_property","path":"props.campaign_goal"},
         {"type":"has_property","path":"props.target_audience"},
         {"type":"has_property","path":"props.channels"}
       ],
       "actions":[
         {"type":"spawn_tasks","titles":["Create social media graphics","Write ad copy","Design landing page","Create email templates","Develop content calendar"],"props_template":{"facets":{"scale":"small"}}},
         {"type":"update_facets","facets":{"stage":"execution"}},
         {"type":"notify","message":"Asset creation started! Build your campaign materials."}
       ]
     },
     {
       "from":"creating",
       "to":"reviewing",
       "event":"submit_for_review",
       "guards":[
         {"type":"has_property","path":"props.assets_complete"}
       ],
       "actions":[
         {"type":"spawn_tasks","titles":["Review brand consistency","Check messaging alignment","Legal compliance check","Stakeholder approval"],"props_template":{"facets":{"scale":"micro"}}},
         {"type":"notify","message":"Campaign submitted for review. Awaiting stakeholder approval."}
       ]
     },
     {
       "from":"reviewing",
       "to":"creating",
       "event":"request_changes",
       "actions":[
         {"type":"notify","message":"Changes requested. Update campaign assets."}
       ]
     },
     {
       "from":"reviewing",
       "to":"launched",
       "event":"approve_and_launch",
       "guards":[
         {"type":"has_property","path":"props.approval_date"},
         {"type":"has_property","path":"props.start_date"}
       ],
       "actions":[
         {"type":"spawn_tasks","titles":["Schedule social posts","Launch paid ads","Send email campaign","Monitor performance","Engage with audience"],"props_template":{"facets":{"scale":"small"}}},
         {"type":"schedule_rrule","rrule":"FREQ=DAILY;COUNT=30","task_template":{"title":"Check campaign metrics"}},
         {"type":"update_facets","facets":{"stage":"launch"}},
         {"type":"notify","message":"Campaign launched! Monitor performance daily."},
         {"type":"email_user","subject":"Campaign is live!","body_template":"Your marketing campaign has launched successfully."}
       ]
     },
     {
       "from":"launched",
       "to":"analyzing",
       "event":"start_analysis",
       "guards":[
         {"type":"has_property","path":"props.end_date"}
       ],
       "actions":[
         {"type":"spawn_tasks","titles":["Gather performance data","Analyze ROI","Create performance report","Document learnings","Share results with team"],"props_template":{"facets":{"scale":"small"}}},
         {"type":"create_doc_from_template","template_key":"doc.campaign_report","variables":{"campaign_name":"{{props.campaign_name}}"}},
         {"type":"update_facets","facets":{"stage":"complete"}},
         {"type":"notify","message":"Campaign complete! Time to analyze results."}
       ]
     }
   ]
 }'::jsonb,
 '{}'::jsonb,
 '[{"view":"pipeline","group_by":"state_key"},{"view":"kanban","group_by":"state_key"},{"view":"timeline","sort_by":"start_date"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

-- Plan templates
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
 '00000000-0000-0000-0000-000000000001'),

-- output templates
('output', 'output.chapter', 'Book Chapter', 'active',
 '{"output_type":"content"}'::jsonb,
 '{"stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"chapter_number":{"type":"integer"},"chapter_title":{"type":"string"},"target_words":{"type":"number"}}}'::jsonb,
 '{"states":["outline","draft","revision","final"],"transitions":[{"from":"outline","to":"draft","event":"start_writing"},{"from":"draft","to":"revision","event":"first_draft_done"},{"from":"revision","to":"final","event":"approve"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"pipeline","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

('output', 'output.design', 'Design Asset', 'active',
 '{"output_type":"content"}'::jsonb,
 '{"stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"asset_type":{"type":"string"},"dimensions":{"type":"string"},"format":{"type":"string"}}}'::jsonb,
 '{"states":["concept","draft","review","approved"],"transitions":[{"from":"concept","to":"draft","event":"start_designing"},{"from":"draft","to":"review","event":"submit"},{"from":"review","to":"approved","event":"approve"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"pipeline","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

('output', 'output.workout_plan', 'Workout Plan', 'active',
 '{"output_type":"knowledge"}'::jsonb,
 '{"stage":"planning"}'::jsonb,
 '{"type":"object","properties":{"split":{"type":"string"},"weeks":{"type":"integer"},"equipment":{"type":"array"}}}'::jsonb,
 '{"states":["draft","review","active","completed"],"transitions":[{"from":"draft","to":"review","event":"submit"},{"from":"review","to":"active","event":"approve"},{"from":"active","to":"completed","event":"complete"}]}'::jsonb,
 '{}'::jsonb,
 '[{"view":"pipeline","group_by":"state_key"}]'::jsonb,
 '00000000-0000-0000-0000-000000000001'),

-- Document templates
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

-- Complete
do $$
begin
  raise notice 'BuildOS ontology system created successfully';
  raise notice 'Facets: context, scale, stage (3 facets)';
  raise notice 'Templates: 25 templates seeded (13 project + 2 plan + 3 output + 3 document + 4 enhanced FSMs)';
  raise notice 'Enhanced FSMs: writer.book, personal.routine, founder.startup, marketer.campaign';
  raise notice 'Tables created with onto_ prefix in public schema';
  raise notice 'All tables dropped and recreated for clean slate';
end$$;
