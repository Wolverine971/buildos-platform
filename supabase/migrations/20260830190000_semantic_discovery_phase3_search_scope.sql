-- supabase/migrations/20260830190000_semantic_discovery_phase3_search_scope.sql
-- Phase 3 semantic discovery: make lexical search match semantic owner/member scope.

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
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
declare
	v_limit int := least(coalesce(p_limit, 50), 50);
	v_query tsquery;
	v_claims_text text;
	v_jwt_role text;
begin
	if coalesce(trim(p_query), '') = '' then
		return;
	end if;

	-- A service caller may search for an explicit actor; authenticated callers
	-- may only search as their own actor. The SECURITY DEFINER body below then
	-- applies owner/member access explicitly instead of relying on caller RLS.
	v_claims_text := nullif(current_setting('request.jwt.claims', true), '');
	if v_claims_text is not null then
		v_jwt_role := nullif((v_claims_text::jsonb) ->> 'role', '');
	end if;
	v_jwt_role := coalesce(
		v_jwt_role,
		nullif(current_setting('request.jwt.claim.role', true), '')
	);

	if v_jwt_role = 'service_role' then
		null;
	elsif v_jwt_role = 'authenticated' then
		if public.current_actor_id() is null
			or public.current_actor_id() is distinct from p_actor_id then
			raise exception 'onto_search_entities may only search as the authenticated actor'
				using errcode = '42501';
		end if;
	elsif v_jwt_role is not null then
		raise exception 'onto_search_entities requires authentication'
			using errcode = '42501';
	elsif session_user not in ('postgres', 'supabase_admin') then
		raise exception 'onto_search_entities requires a trusted database session'
			using errcode = '42501';
	end if;

	v_query := websearch_to_tsquery('english', p_query);

	return query
	with params as (select v_query as tsq),
	accessible as (
		select p.id, p.name
		from onto_projects p
		where p.deleted_at is null
			and (p_project_id is null or p.id = p_project_id)
			and (
				p.created_by = p_actor_id
				or exists (
					select 1
					from onto_project_members m
					where m.project_id = p.id
						and m.actor_id = p_actor_id
						and m.removed_at is null
						and m.access in ('read', 'write', 'admin')
				)
			)
	)
	select *
	from (
		-- Projects
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
		join accessible access on access.id = p.id
		where p.deleted_at is null
			and (p_types is null or 'project' = any(p_types))
			and (
				params.tsq @@ p.search_vector
				or similarity(coalesce(p.name, ''), p_query) >= 0.2
				or similarity(coalesce(p.description, ''), p_query) >= 0.12
			)

		union all

		-- Tasks
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
		join accessible p on p.id = t.project_id
		where t.deleted_at is null
			and (p_types is null or 'task' = any(p_types))
			and (
				params.tsq @@ t.search_vector
				or similarity(coalesce(t.title, ''), p_query) >= 0.2
				or similarity(coalesce(t.description, ''), p_query) >= 0.12
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
		join accessible p on p.id = pl.project_id
		where pl.deleted_at is null
			and (p_types is null or 'plan' = any(p_types))
			and (
				params.tsq @@ pl.search_vector
				or similarity(coalesce(pl.name, ''), p_query) >= 0.2
				or similarity(coalesce(pl.description, ''), p_query) >= 0.12
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
		join accessible p on p.id = g.project_id
		where g.deleted_at is null
			and (p_types is null or 'goal' = any(p_types))
			and (
				params.tsq @@ g.search_vector
				or similarity(coalesce(g.name, ''), p_query) >= 0.2
				or similarity(coalesce(g.description, ''), p_query) >= 0.12
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
		join accessible p on p.id = m.project_id
		where m.deleted_at is null
			and (p_types is null or 'milestone' = any(p_types))
			and (
				params.tsq @@ m.search_vector
				or similarity(coalesce(m.title, ''), p_query) >= 0.2
				or similarity(coalesce(m.description, ''), p_query) >= 0.12
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
		join accessible p on p.id = d.project_id
		where d.deleted_at is null
			and (p_types is null or 'document' = any(p_types))
			and (
				params.tsq @@ d.search_vector
				or similarity(coalesce(d.title, ''), p_query) >= 0.2
				or similarity(coalesce(d.description, ''), p_query) >= 0.12
			)

		union all

		-- Risks
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
		join accessible p on p.id = rk.project_id
		where rk.deleted_at is null
			and (p_types is null or 'risk' = any(p_types))
			and (
				params.tsq @@ rk.search_vector
				or similarity(coalesce(rk.title, ''), p_query) >= 0.2
				or similarity(coalesce(rk.content, ''), p_query) >= 0.12
			)

		union all

		-- Images
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
		join accessible p on p.id = a.project_id
		where a.deleted_at is null
			and (p_types is null or 'image' = any(p_types))
			and (
				params.tsq @@ a.search_vector
				or similarity(coalesce(a.caption, ''), p_query) >= 0.2
				or similarity(coalesce(a.alt_text, ''), p_query) >= 0.2
				or similarity(coalesce(a.original_filename, ''), p_query) >= 0.2
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
			(coalesce(ts_rank(r.search_vector, params.tsq), 0) * 0.7) +
			(similarity(coalesce(r."text", ''), p_query) * 0.3) as score,
			null::text as state_key,
			r.type_key::text as type_key
		from onto_requirements r
		join params on true
		join accessible p on p.id = r.project_id
		where r.deleted_at is null
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

REVOKE ALL ON FUNCTION public.onto_search_entities(uuid, text, uuid, text[], integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_search_entities(uuid, text, uuid, text[], integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.onto_search_entities(uuid, text, uuid, text[], integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_search_entities(uuid, text, uuid, text[], integer) TO service_role;

COMMENT ON FUNCTION public.onto_search_entities(uuid, text, uuid, text[], integer) IS
	'FTS + trigram ontology search scoped to projects the explicit actor owns or can read as an active member.';
