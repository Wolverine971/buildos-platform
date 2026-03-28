-- supabase/migrations/20260428000014_agentic_buildos_search_phase1.sql
-- Phase 1 agentic BuildOS search:
-- - add project/risk search vectors and indexes
-- - unify onto_search_entities coverage for project/task/goal/plan/milestone/document/risk/requirement/image

ALTER TABLE onto_projects
	ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
		setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
		setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
		setweight(jsonb_to_tsvector('english', props, '["string"]'), 'C')
	) STORED;

CREATE INDEX IF NOT EXISTS idx_onto_projects_search_vector
	ON onto_projects USING gin(search_vector);

CREATE INDEX IF NOT EXISTS idx_onto_projects_props_trgm
	ON onto_projects USING gin ((props::text) gin_trgm_ops);

ALTER TABLE onto_risks
	ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
		setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
		setweight(to_tsvector('english', COALESCE(content, '')), 'B') ||
		setweight(jsonb_to_tsvector('english', props, '["string"]'), 'C')
	) STORED;

CREATE INDEX IF NOT EXISTS idx_onto_risks_search_vector
	ON onto_risks USING gin(search_vector);

CREATE INDEX IF NOT EXISTS idx_onto_risks_title_trgm
	ON onto_risks USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_onto_risks_content_trgm
	ON onto_risks USING gin (content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_onto_risks_props_trgm
	ON onto_risks USING gin ((props::text) gin_trgm_ops);

DROP FUNCTION IF EXISTS onto_search_entities(uuid, text, uuid, text[], int);

CREATE OR REPLACE FUNCTION public.onto_search_entities(
	p_actor_id uuid,
	p_query text,
	p_project_id uuid DEFAULT NULL::uuid,
	p_types text[] DEFAULT NULL::text[],
	p_limit integer DEFAULT 50
)
RETURNS TABLE(
	type text,
	id uuid,
	project_id uuid,
	project_name text,
	title text,
	snippet text,
	score double precision,
	state_key text,
	type_key text
)
LANGUAGE plpgsql
AS $function$
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
		select
			'project'::text as type,
			p.id,
			p.id as project_id,
			p.name as project_name,
			p.name as title,
			ts_headline(
				'english',
				concat_ws(' ', coalesce(p.name, ''), coalesce(p.description, ''), coalesce(p.props::text, '')),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) as snippet,
			(coalesce(ts_rank(p.search_vector, params.tsq), 0) * 0.7) +
			(greatest(
				similarity(coalesce(p.name, ''), p_query),
				similarity(coalesce(p.description, ''), p_query)
			) * 0.3) as score,
			p.state_key::text as state_key,
			p.type_key::text as type_key
		from onto_projects p
		join params on true
		where p.created_by = p_actor_id
			and p.deleted_at is null
			and (p_project_id is null or p.id = p_project_id)
			and (p_types is null or 'project' = any(p_types))
			and (
				params.tsq @@ p.search_vector
				or similarity(coalesce(p.name, ''), p_query) >= 0.2
				or similarity(coalesce(p.description, ''), p_query) >= 0.12
			)

		union all

		select
			'task'::text as type,
			t.id,
			t.project_id,
			p.name as project_name,
			t.title as title,
			ts_headline(
				'english',
				concat_ws(
					' ',
					coalesce(t.title, ''),
					coalesce(t.description, ''),
					coalesce(t.props::text, '')
				),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) as snippet,
			(coalesce(ts_rank(t.search_vector, params.tsq), 0) * 0.65) +
			(greatest(
				similarity(coalesce(t.title, ''), p_query),
				similarity(coalesce(t.description, ''), p_query)
			) * 0.35) as score,
			t.state_key::text as state_key,
			t.type_key::text as type_key
		from onto_tasks t
		join params on true
		left join onto_projects p on p.id = t.project_id
		where t.created_by = p_actor_id
			and t.deleted_at is null
			and p.deleted_at is null
			and (p_project_id is null or t.project_id = p_project_id)
			and (p_types is null or 'task' = any(p_types))
			and (
				params.tsq @@ t.search_vector
				or similarity(coalesce(t.title, ''), p_query) >= 0.2
				or similarity(coalesce(t.description, ''), p_query) >= 0.12
			)

		union all

		select
			'plan'::text as type,
			pl.id,
			pl.project_id,
			p.name as project_name,
			pl.name as title,
			ts_headline(
				'english',
				concat_ws(
					' ',
					coalesce(pl.name, ''),
					coalesce(pl.description, ''),
					coalesce(pl.props::text, '')
				),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) as snippet,
			(coalesce(ts_rank(pl.search_vector, params.tsq), 0) * 0.65) +
			(greatest(
				similarity(coalesce(pl.name, ''), p_query),
				similarity(coalesce(pl.description, ''), p_query)
			) * 0.35) as score,
			pl.state_key::text as state_key,
			pl.type_key::text as type_key
		from onto_plans pl
		join params on true
		left join onto_projects p on p.id = pl.project_id
		where pl.created_by = p_actor_id
			and pl.deleted_at is null
			and p.deleted_at is null
			and (p_project_id is null or pl.project_id = p_project_id)
			and (p_types is null or 'plan' = any(p_types))
			and (
				params.tsq @@ pl.search_vector
				or similarity(coalesce(pl.name, ''), p_query) >= 0.2
				or similarity(coalesce(pl.description, ''), p_query) >= 0.12
			)

		union all

		select
			'goal'::text as type,
			g.id,
			g.project_id,
			p.name as project_name,
			g.name as title,
			ts_headline(
				'english',
				concat_ws(
					' ',
					coalesce(g.name, ''),
					coalesce(g.description, ''),
					coalesce(g.props::text, '')
				),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) as snippet,
			(coalesce(ts_rank(g.search_vector, params.tsq), 0) * 0.65) +
			(greatest(
				similarity(coalesce(g.name, ''), p_query),
				similarity(coalesce(g.description, ''), p_query)
			) * 0.35) as score,
			g.state_key::text as state_key,
			g.type_key::text as type_key
		from onto_goals g
		join params on true
		left join onto_projects p on p.id = g.project_id
		where g.created_by = p_actor_id
			and g.deleted_at is null
			and p.deleted_at is null
			and (p_project_id is null or g.project_id = p_project_id)
			and (p_types is null or 'goal' = any(p_types))
			and (
				params.tsq @@ g.search_vector
				or similarity(coalesce(g.name, ''), p_query) >= 0.2
				or similarity(coalesce(g.description, ''), p_query) >= 0.12
			)

		union all

		select
			'milestone'::text as type,
			m.id,
			m.project_id,
			p.name as project_name,
			m.title as title,
			ts_headline(
				'english',
				concat_ws(
					' ',
					coalesce(m.title, ''),
					coalesce(m.description, ''),
					coalesce(m.props::text, '')
				),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) as snippet,
			(coalesce(ts_rank(m.search_vector, params.tsq), 0) * 0.65) +
			(greatest(
				similarity(coalesce(m.title, ''), p_query),
				similarity(coalesce(m.description, ''), p_query)
			) * 0.35) as score,
			m.state_key::text as state_key,
			m.type_key::text as type_key
		from onto_milestones m
		join params on true
		left join onto_projects p on p.id = m.project_id
		where m.created_by = p_actor_id
			and m.deleted_at is null
			and p.deleted_at is null
			and (p_project_id is null or m.project_id = p_project_id)
			and (p_types is null or 'milestone' = any(p_types))
			and (
				params.tsq @@ m.search_vector
				or similarity(coalesce(m.title, ''), p_query) >= 0.2
				or similarity(coalesce(m.description, ''), p_query) >= 0.12
			)

		union all

		select
			'document'::text as type,
			d.id,
			d.project_id,
			p.name as project_name,
			d.title as title,
			ts_headline(
				'english',
				concat_ws(
					' ',
					coalesce(d.title, ''),
					coalesce(d.description, ''),
					coalesce(d.props::text, '')
				),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) as snippet,
			(coalesce(ts_rank(d.search_vector, params.tsq), 0) * 0.65) +
			(greatest(
				similarity(coalesce(d.title, ''), p_query),
				similarity(coalesce(d.description, ''), p_query)
			) * 0.35) as score,
			d.state_key::text as state_key,
			d.type_key::text as type_key
		from onto_documents d
		join params on true
		left join onto_projects p on p.id = d.project_id
		where d.created_by = p_actor_id
			and d.deleted_at is null
			and p.deleted_at is null
			and (p_project_id is null or d.project_id = p_project_id)
			and (p_types is null or 'document' = any(p_types))
			and (
				params.tsq @@ d.search_vector
				or similarity(coalesce(d.title, ''), p_query) >= 0.2
				or similarity(coalesce(d.description, ''), p_query) >= 0.12
			)

		union all

		select
			'risk'::text as type,
			rk.id,
			rk.project_id,
			p.name as project_name,
			rk.title as title,
			ts_headline(
				'english',
				concat_ws(
					' ',
					coalesce(rk.title, ''),
					coalesce(rk.content, ''),
					coalesce(rk.props::text, '')
				),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) as snippet,
			(coalesce(ts_rank(rk.search_vector, params.tsq), 0) * 0.65) +
			(greatest(
				similarity(coalesce(rk.title, ''), p_query),
				similarity(coalesce(rk.content, ''), p_query)
			) * 0.35) as score,
			rk.state_key::text as state_key,
			rk.type_key::text as type_key
		from onto_risks rk
		join params on true
		left join onto_projects p on p.id = rk.project_id
		where rk.created_by = p_actor_id
			and rk.deleted_at is null
			and p.deleted_at is null
			and (p_project_id is null or rk.project_id = p_project_id)
			and (p_types is null or 'risk' = any(p_types))
			and (
				params.tsq @@ rk.search_vector
				or similarity(coalesce(rk.title, ''), p_query) >= 0.2
				or similarity(coalesce(rk.content, ''), p_query) >= 0.12
			)

		union all

		select
			'image'::text as type,
			a.id,
			a.project_id,
			p.name as project_name,
			coalesce(a.caption, a.alt_text, a.original_filename, 'Image') as title,
			ts_headline(
				'english',
				concat_ws(
					' ',
					coalesce(a.caption, ''),
					coalesce(a.alt_text, ''),
					coalesce(a.extraction_summary, ''),
					coalesce(a.extracted_text, '')
				),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) as snippet,
			(coalesce(ts_rank(a.search_vector, params.tsq), 0) * 0.65) +
			(greatest(
				similarity(coalesce(a.caption, ''), p_query),
				similarity(coalesce(a.alt_text, ''), p_query),
				similarity(coalesce(a.original_filename, ''), p_query)
			) * 0.35) as score,
			a.ocr_status::text as state_key,
			a.kind::text as type_key
		from onto_assets a
		join params on true
		left join onto_projects p on p.id = a.project_id
		where a.created_by = p_actor_id
			and a.deleted_at is null
			and p.deleted_at is null
			and (p_project_id is null or a.project_id = p_project_id)
			and (p_types is null or 'image' = any(p_types))
			and (
				params.tsq @@ a.search_vector
				or similarity(coalesce(a.caption, ''), p_query) >= 0.2
				or similarity(coalesce(a.alt_text, ''), p_query) >= 0.2
				or similarity(coalesce(a.original_filename, ''), p_query) >= 0.2
			)

		union all

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
			(coalesce(ts_rank(r.search_vector, params.tsq), 0) * 0.7) +
			(similarity(coalesce(r."text", ''), p_query) * 0.3) as score,
			null::text as state_key,
			r.type_key::text as type_key
		from onto_requirements r
		join params on true
		left join onto_projects p on p.id = r.project_id
		where r.created_by = p_actor_id
			and r.deleted_at is null
			and p.deleted_at is null
			and (p_project_id is null or r.project_id = p_project_id)
			and (p_types is null or 'requirement' = any(p_types))
			and (
				params.tsq @@ r.search_vector
				or similarity(coalesce(r."text", ''), p_query) >= 0.2
			)
	) as results
	order by score desc, title asc nulls last
	limit v_limit;
end;
$function$;
