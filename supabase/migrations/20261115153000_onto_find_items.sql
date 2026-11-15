-- supabase/migrations/20261115153000_onto_find_items.sql
-- Workspace search (tasker 159): the instant "word matches" lane behind the search box on
-- /projects and ⌘K. One call returns the signed-in person's matching projects, notes, docs,
-- tasks and goals across every project they can open, their Workspace included, note text
-- included.
--
-- Why not onto_search_entities (checked 2026-11-15): it is the chat's search and stays as is.
-- For a box that searches as you type it falls short in three ways:
--   - Whole words only (websearch_to_tsquery): "gunsm" finds nothing until "gunsmith" is
--     typed. Here every word is a prefix ('gunsm':*), and a title also matches on a part of a
--     word ("smith" finds "Gunsmith").
--   - Its document snippet is built from title + description + props, so a match inside a
--     note's text shows no context. Here the snippet comes from the text that matched (a
--     note's body, a task's description) with the matched words marked.
--   - No dates or Workspace flag for the rows the UI draws.
--
-- Identity comes from the caller's session (current_actor_id() reads auth.uid()), so there is
-- no actor argument to spoof. Access is the same owner-or-active-member rule as
-- onto_search_entities' accessible CTE, with the same archived/merged project rule for an
-- unscoped search: archived projects (merged sources included) and their records are skipped.
-- Record-level exclusions match too: deleted or archived records, and documents archived from
-- the tree (state_key 'archived'), never come back.
--
-- Snippet markers: chr(2) opens a matched word and chr(3) closes it. The client splits on
-- them and draws text nodes, so no markup ever comes from the database.
--
-- Grants: the web server calls this with the signed-in person's session (role
-- authenticated), so authenticated may execute it; anon and PUBLIC may not.

BEGIN;

CREATE OR REPLACE FUNCTION public.onto_find_items(p_query text, p_limit integer DEFAULT 40)
 RETURNS TABLE(
	kind text,
	id uuid,
	project_id uuid,
	project_name text,
	in_workspace boolean,
	title text,
	snippet text,
	state_key text,
	type_key text,
	due_at timestamptz,
	updated_at timestamptz,
	score double precision
 )
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
	v_actor uuid := public.current_actor_id();
	v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 60);
	v_text text := left(coalesce(p_query, ''), 200);
	v_words text[];
	v_like text[];
	v_tsq tsquery;
	v_headline_opts text :=
		'MaxFragments=1,MaxWords=18,MinWords=8,ShortWord=2,StartSel=' || chr(2) || ',StopSel=' || chr(3);
BEGIN
	IF v_actor IS NULL THEN
		RETURN;
	END IF;

	-- The query's words: the simple parser's tokens (lowercased, punctuation dropped), in the
	-- order typed, at most 8, single characters skipped. Tokenizing only; nothing here decides
	-- what the query means.
	SELECT array_agg(t.lexeme ORDER BY t.first_pos)
	INTO v_words
	FROM (
		SELECT u.lexeme, u.positions[1] AS first_pos
		FROM unnest(to_tsvector('simple', v_text)) AS u
		WHERE char_length(u.lexeme) >= 2
		ORDER BY u.positions[1]
		LIMIT 8
	) AS t;

	IF v_words IS NULL OR cardinality(v_words) = 0 THEN
		RETURN;
	END IF;

	-- Every word as a prefix, all required, stemmed like the stored search_vector. Stop words
	-- drop out (to_tsquery ignores them), so "the gun" searches for 'gun':*.
	SELECT to_tsquery(
		'english',
		string_agg(quote_literal(w) || ':*', ' & ')
	)
	INTO v_tsq
	FROM unnest(v_words) AS w;

	-- Title part-of-word matching: words of 3+ characters, LIKE wildcards escaped.
	SELECT array_agg(
		'%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%'
	)
	INTO v_like
	FROM unnest(v_words) AS w
	WHERE char_length(w) >= 3;

	RETURN QUERY
	WITH accessible AS (
		SELECT p.id, p.name, (p.kind = 'workspace') AS is_workspace
		FROM onto_projects p
		WHERE p.deleted_at IS NULL
			AND p.archived_at IS NULL
			AND (
				p.created_by = v_actor
				OR EXISTS (
					SELECT 1
					FROM onto_project_members m
					WHERE m.project_id = p.id
						AND m.actor_id = v_actor
						AND m.removed_at IS NULL
						AND m.access IN ('read', 'write', 'admin')
				)
			)
	),
	hits AS (
		-- Projects by name (the Workspace itself is never a result).
		SELECT
			'project'::text AS kind,
			p.id,
			p.id AS project_id,
			p.name AS project_name,
			false AS in_workspace,
			p.name AS title,
			NULL::text AS body,
			p.state_key::text AS state_key,
			p.type_key::text AS type_key,
			NULL::timestamptz AS due_at,
			p.updated_at,
			(CASE WHEN v_like IS NOT NULL AND p.name ILIKE ALL (v_like) THEN 1.0 ELSE 0 END)
				+ coalesce(ts_rank(p.search_vector, v_tsq), 0)
				+ similarity(coalesce(p.name, ''), v_text) * 0.5 AS score
		FROM onto_projects p
		JOIN accessible a ON a.id = p.id AND NOT a.is_workspace
		WHERE p.search_vector @@ v_tsq
			OR (v_like IS NOT NULL AND p.name ILIKE ALL (v_like))

		UNION ALL

		-- Documents and notes: title and text (the stored search_vector covers both).
		SELECT
			'document'::text,
			d.id,
			d.project_id,
			a.name,
			a.is_workspace,
			coalesce(nullif(trim(d.title), ''), 'Untitled'),
			left(d.content, 20000),
			d.state_key::text,
			d.type_key::text,
			NULL::timestamptz,
			d.updated_at,
			(CASE WHEN v_like IS NOT NULL AND d.title ILIKE ALL (v_like) THEN 1.0 ELSE 0 END)
				+ coalesce(ts_rank(d.search_vector, v_tsq), 0)
				+ similarity(coalesce(d.title, ''), v_text) * 0.5
		FROM onto_documents d
		JOIN accessible a ON a.id = d.project_id
		WHERE d.deleted_at IS NULL
			AND d.archived_at IS NULL
			AND coalesce(d.state_key::text, '') <> 'archived'
			AND (
				d.search_vector @@ v_tsq
				OR (v_like IS NOT NULL AND d.title ILIKE ALL (v_like))
			)

		UNION ALL

		-- Tasks, done ones included (the UI marks them).
		SELECT
			'task'::text,
			t.id,
			t.project_id,
			a.name,
			a.is_workspace,
			t.title,
			t.description,
			t.state_key::text,
			t.type_key::text,
			t.due_at,
			t.updated_at,
			(CASE WHEN v_like IS NOT NULL AND t.title ILIKE ALL (v_like) THEN 1.0 ELSE 0 END)
				+ coalesce(ts_rank(t.search_vector, v_tsq), 0)
				+ similarity(coalesce(t.title, ''), v_text) * 0.5
		FROM onto_tasks t
		JOIN accessible a ON a.id = t.project_id
		WHERE t.deleted_at IS NULL
			AND t.archived_at IS NULL
			AND (
				t.search_vector @@ v_tsq
				OR (v_like IS NOT NULL AND t.title ILIKE ALL (v_like))
			)

		UNION ALL

		-- Goals.
		SELECT
			'goal'::text,
			g.id,
			g.project_id,
			a.name,
			a.is_workspace,
			g.name,
			g.description,
			g.state_key::text,
			g.type_key::text,
			NULL::timestamptz,
			g.updated_at,
			(CASE WHEN v_like IS NOT NULL AND g.name ILIKE ALL (v_like) THEN 1.0 ELSE 0 END)
				+ coalesce(ts_rank(g.search_vector, v_tsq), 0)
				+ similarity(coalesce(g.name, ''), v_text) * 0.5
		FROM onto_goals g
		JOIN accessible a ON a.id = g.project_id
		WHERE g.deleted_at IS NULL
			AND g.archived_at IS NULL
			AND (
				g.search_vector @@ v_tsq
				OR (v_like IS NOT NULL AND g.name ILIKE ALL (v_like))
			)
	),
	top AS (
		SELECT h.*
		FROM hits h
		ORDER BY h.score DESC, h.updated_at DESC NULLS LAST
		LIMIT v_limit
	)
	SELECT
		top.kind,
		top.id,
		top.project_id,
		top.project_name,
		top.in_workspace,
		top.title,
		-- Headlines only for the rows returned, and only from text that holds a match.
		CASE
			WHEN top.body IS NULL OR btrim(top.body) = '' THEN NULL
			WHEN NOT (to_tsvector('english', top.body) @@ v_tsq) THEN NULL
			ELSE ts_headline('english', top.body, v_tsq, v_headline_opts)
		END,
		top.state_key,
		top.type_key,
		top.due_at,
		top.updated_at,
		top.score::double precision
	FROM top
	ORDER BY top.score DESC, top.updated_at DESC NULLS LAST;
END;
$function$;

REVOKE ALL ON FUNCTION public.onto_find_items(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_find_items(text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.onto_find_items(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_find_items(text, integer) TO service_role;

COMMENT ON FUNCTION public.onto_find_items(text, integer) IS
	'Workspace search (tasker 159): prefix word matches across the caller''s accessible projects, Workspace included, with marked snippets from matching text. Identity from auth.uid().';

COMMIT;
