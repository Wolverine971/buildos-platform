-- Migration: Ontology cross-entity search vectors and RPC
-- Date: 2025-12-24
-- Purpose: Enable fuzzy, cross-entity search across ontology data types for agentic chat

-- ============================================
-- Generated search_vector columns + indexes
-- ============================================

-- Tasks
alter table onto_tasks
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(jsonb_to_tsvector('english', props, '["string"]'), 'B')
  ) stored;

create index if not exists idx_onto_tasks_search_vector on onto_tasks using gin (search_vector);
create index if not exists idx_onto_tasks_props_trgm on onto_tasks using gin ((props::text) gin_trgm_ops);

-- Plans
alter table onto_plans
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(jsonb_to_tsvector('english', props, '["string"]'), 'B')
  ) stored;

create index if not exists idx_onto_plans_search_vector on onto_plans using gin (search_vector);
create index if not exists idx_onto_plans_name_trgm on onto_plans using gin (name gin_trgm_ops);
create index if not exists idx_onto_plans_props_trgm on onto_plans using gin ((props::text) gin_trgm_ops);

-- Goals
alter table onto_goals
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(jsonb_to_tsvector('english', props, '["string"]'), 'B')
  ) stored;

create index if not exists idx_onto_goals_search_vector on onto_goals using gin (search_vector);
create index if not exists idx_onto_goals_name_trgm on onto_goals using gin (name gin_trgm_ops);
create index if not exists idx_onto_goals_props_trgm on onto_goals using gin ((props::text) gin_trgm_ops);

-- Milestones
alter table onto_milestones
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(jsonb_to_tsvector('english', props, '["string"]'), 'B')
  ) stored;

create index if not exists idx_onto_milestones_search_vector on onto_milestones using gin (search_vector);
create index if not exists idx_onto_milestones_title_trgm on onto_milestones using gin (title gin_trgm_ops);
create index if not exists idx_onto_milestones_props_trgm on onto_milestones using gin ((props::text) gin_trgm_ops);

-- Documents
alter table onto_documents
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(jsonb_to_tsvector('english', props, '["string"]'), 'B')
  ) stored;

create index if not exists idx_onto_documents_search_vector on onto_documents using gin (search_vector);
create index if not exists idx_onto_documents_title_trgm on onto_documents using gin (title gin_trgm_ops);
create index if not exists idx_onto_documents_props_trgm on onto_documents using gin ((props::text) gin_trgm_ops);

-- Outputs
alter table onto_outputs
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(jsonb_to_tsvector('english', props, '["string"]'), 'B')
  ) stored;

create index if not exists idx_onto_outputs_search_vector on onto_outputs using gin (search_vector);
create index if not exists idx_onto_outputs_name_trgm on onto_outputs using gin (name gin_trgm_ops);
create index if not exists idx_onto_outputs_props_trgm on onto_outputs using gin ((props::text) gin_trgm_ops);

-- Requirements
alter table onto_requirements
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce("text", '')), 'A') ||
    setweight(jsonb_to_tsvector('english', props, '["string"]'), 'B')
  ) stored;

create index if not exists idx_onto_requirements_search_vector on onto_requirements using gin (search_vector);
create index if not exists idx_onto_requirements_text_trgm on onto_requirements using gin ("text" gin_trgm_ops);
create index if not exists idx_onto_requirements_props_trgm on onto_requirements using gin ((props::text) gin_trgm_ops);

-- ============================================
-- RPC: onto_search_entities
-- ============================================

drop function if exists onto_search_entities(uuid, text, uuid, text[], int);

create or replace function onto_search_entities(
  p_actor_id uuid,
  p_query text,
  p_project_id uuid default null,
  p_types text[] default null,
  p_limit int default 50
)
returns table (
  type text,
  id uuid,
  project_id uuid,
  project_name text,
  title text,
  snippet text,
  score double precision
)
language plpgsql
as $$
declare
  v_limit int := least(coalesce(p_limit, 50), 50);
  v_query tsquery;
begin
  if coalesce(trim(p_query), '') = '' then
    return;
  end if;

  v_query := websearch_to_tsquery('english', p_query);

  return query
  with params as (select v_query as tsq)
  select *
  from (
    -- Tasks
    select
      'task'::text as type,
      t.id,
      t.project_id,
      p.name as project_name,
      t.title as title,
      ts_headline(
        'english',
        concat_ws(' ', coalesce(t.title, ''), coalesce(t.props::text, '')),
        params.tsq,
        'MaxFragments=2,MinWords=5,MaxWords=18'
      ) as snippet,
      (coalesce(ts_rank(t.search_vector, params.tsq), 0) * 0.6) +
      (similarity(coalesce(t.title, ''), p_query) * 0.4) as score
    from onto_tasks t
    join params on true
    left join onto_projects p on p.id = t.project_id
    where t.created_by = p_actor_id
      and (p_project_id is null or t.project_id = p_project_id)
      and (p_types is null or 'task' = any(p_types))
      and (
        params.tsq @@ t.search_vector
        or similarity(coalesce(t.title, ''), p_query) >= 0.2
      )

    union all

    -- Plans
    select
      'plan'::text as type,
      pl.id,
      pl.project_id,
      p.name as project_name,
      pl.name as title,
      ts_headline(
        'english',
        concat_ws(' ', coalesce(pl.name, ''), coalesce(pl.props::text, '')),
        params.tsq,
        'MaxFragments=2,MinWords=5,MaxWords=18'
      ) as snippet,
      (coalesce(ts_rank(pl.search_vector, params.tsq), 0) * 0.6) +
      (similarity(coalesce(pl.name, ''), p_query) * 0.4) as score
    from onto_plans pl
    join params on true
    left join onto_projects p on p.id = pl.project_id
    where pl.created_by = p_actor_id
      and (p_project_id is null or pl.project_id = p_project_id)
      and (p_types is null or 'plan' = any(p_types))
      and (
        params.tsq @@ pl.search_vector
        or similarity(coalesce(pl.name, ''), p_query) >= 0.2
      )

    union all

    -- Goals
    select
      'goal'::text as type,
      g.id,
      g.project_id,
      p.name as project_name,
      g.name as title,
      ts_headline(
        'english',
        concat_ws(' ', coalesce(g.name, ''), coalesce(g.props::text, '')),
        params.tsq,
        'MaxFragments=2,MinWords=5,MaxWords=18'
      ) as snippet,
      (coalesce(ts_rank(g.search_vector, params.tsq), 0) * 0.6) +
      (similarity(coalesce(g.name, ''), p_query) * 0.4) as score
    from onto_goals g
    join params on true
    left join onto_projects p on p.id = g.project_id
    where g.created_by = p_actor_id
      and (p_project_id is null or g.project_id = p_project_id)
      and (p_types is null or 'goal' = any(p_types))
      and (
        params.tsq @@ g.search_vector
        or similarity(coalesce(g.name, ''), p_query) >= 0.2
      )

    union all

    -- Milestones
    select
      'milestone'::text as type,
      m.id,
      m.project_id,
      p.name as project_name,
      m.title as title,
      ts_headline(
        'english',
        concat_ws(' ', coalesce(m.title, ''), coalesce(m.props::text, '')),
        params.tsq,
        'MaxFragments=2,MinWords=5,MaxWords=18'
      ) as snippet,
      (coalesce(ts_rank(m.search_vector, params.tsq), 0) * 0.6) +
      (similarity(coalesce(m.title, ''), p_query) * 0.4) as score
    from onto_milestones m
    join params on true
    left join onto_projects p on p.id = m.project_id
    where m.created_by = p_actor_id
      and (p_project_id is null or m.project_id = p_project_id)
      and (p_types is null or 'milestone' = any(p_types))
      and (
        params.tsq @@ m.search_vector
        or similarity(coalesce(m.title, ''), p_query) >= 0.2
      )

    union all

    -- Documents
    select
      'document'::text as type,
      d.id,
      d.project_id,
      p.name as project_name,
      d.title as title,
      ts_headline(
        'english',
        concat_ws(' ', coalesce(d.title, ''), coalesce(d.props::text, '')),
        params.tsq,
        'MaxFragments=2,MinWords=5,MaxWords=18'
      ) as snippet,
      (coalesce(ts_rank(d.search_vector, params.tsq), 0) * 0.6) +
      (similarity(coalesce(d.title, ''), p_query) * 0.4) as score
    from onto_documents d
    join params on true
    left join onto_projects p on p.id = d.project_id
    where d.created_by = p_actor_id
      and (p_project_id is null or d.project_id = p_project_id)
      and (p_types is null or 'document' = any(p_types))
      and (
        params.tsq @@ d.search_vector
        or similarity(coalesce(d.title, ''), p_query) >= 0.2
      )

    union all

    -- Outputs
    select
      'output'::text as type,
      o.id,
      o.project_id,
      p.name as project_name,
      o.name as title,
      ts_headline(
        'english',
        concat_ws(' ', coalesce(o.name, ''), coalesce(o.props::text, '')),
        params.tsq,
        'MaxFragments=2,MinWords=5,MaxWords=18'
      ) as snippet,
      (coalesce(ts_rank(o.search_vector, params.tsq), 0) * 0.6) +
      (similarity(coalesce(o.name, ''), p_query) * 0.4) as score
    from onto_outputs o
    join params on true
    left join onto_projects p on p.id = o.project_id
    where o.created_by = p_actor_id
      and (p_project_id is null or o.project_id = p_project_id)
      and (p_types is null or 'output' = any(p_types))
      and (
        params.tsq @@ o.search_vector
        or similarity(coalesce(o.name, ''), p_query) >= 0.2
      )

    union all

    -- Requirements
    select
      'requirement'::text as type,
      r.id,
      r.project_id,
      p.name as project_name,
      r."text" as title,
      ts_headline(
        'english',
        concat_ws(' ', coalesce(r."text", ''), coalesce(r.props::text, '')),
        params.tsq,
        'MaxFragments=2,MinWords=5,MaxWords=18'
      ) as snippet,
      (coalesce(ts_rank(r.search_vector, params.tsq), 0) * 0.6) +
      (similarity(coalesce(r."text", ''), p_query) * 0.4) as score
    from onto_requirements r
    join params on true
    left join onto_projects p on p.id = r.project_id
    where r.created_by = p_actor_id
      and (p_project_id is null or r.project_id = p_project_id)
      and (p_types is null or 'requirement' = any(p_types))
      and (
        params.tsq @@ r.search_vector
        or similarity(coalesce(r."text", ''), p_query) >= 0.2
      )
  ) as results
  order by score desc
  limit v_limit;
end;
$$;
