-- supabase/tests/project_fold_table_coverage.check.sql
-- Standing rehearsal check (scripts/migration-rehearsal/rehearse.py DEFAULT_CHECKS).
--
-- Project fold ("Combine", 20260930220000_project_fold_foundation.sql) moves a
-- project's records into another project according to
-- private.project_fold_table_policy. Every column that points at a project must
-- be classified there, or a fold would silently strand its rows in the archived
-- source. This fails the rehearsal of any migration that:
--   * adds a column named project_id / *_project_id / *project_ids in public or
--     private, or a single-column foreign key to public.onto_projects, without a
--     policy row;
--   * drops or renames a classified column without removing its policy row;
--   * classifies a column as move/repoint that the fold does not implement
--     (private.project_fold_implemented), or the reverse.
-- Before the fold foundation is in the schema it passes with a notice.
-- Read-only: no rows are written.

\set ON_ERROR_STOP on

DO $coverage$
DECLARE
	v_projects regclass := to_regclass('public.onto_projects');
	v_gaps text;
BEGIN
	IF to_regclass('private.project_fold_table_policy') IS NULL THEN
		RAISE NOTICE 'project_fold_table_coverage: no private.project_fold_table_policy in this schema; skipped';
		RETURN;
	END IF;

	WITH discovered AS (
		SELECT n.nspname::text AS s, c.relname::text AS t, a.attname::text AS col
		FROM pg_catalog.pg_attribute a
		JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
			AND n.nspname IN ('public', 'private') AND a.attnum > 0 AND NOT a.attisdropped
			AND (a.attname = 'project_id' OR a.attname LIKE '%\_project\_id' OR a.attname LIKE '%project\_ids')
		UNION
		SELECT n.nspname::text, c.relname::text, a.attname::text
		FROM pg_catalog.pg_constraint k
		JOIN pg_catalog.pg_class c ON c.oid = k.conrelid
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		JOIN pg_catalog.pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
		WHERE v_projects IS NOT NULL AND k.contype = 'f' AND k.confrelid = v_projects
			AND cardinality(k.conkey) = 1 AND NOT c.relispartition
	),
	policy AS (
		SELECT p.table_schema, p.table_name, p.column_name FROM private.project_fold_table_policy p
	),
	gaps AS (
		SELECT format('unclassified column %I.%I.%I', d.s, d.t, d.col) AS gap FROM discovered d
		WHERE NOT EXISTS (SELECT 1 FROM policy p WHERE p.table_schema = d.s AND p.table_name = d.t AND p.column_name = d.col)
		UNION
		SELECT format('policy row names a missing column %I.%I.%I', p.table_schema, p.table_name, p.column_name) FROM policy p
		WHERE NOT EXISTS (
			SELECT 1 FROM pg_catalog.pg_attribute a
			JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
			JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = p.table_schema AND c.relname = p.table_name AND c.relkind IN ('r', 'p')
				AND a.attname = p.column_name AND a.attnum > 0 AND NOT a.attisdropped)
	)
	SELECT string_agg(gap, E'\n  ' ORDER BY gap) INTO v_gaps FROM gaps;

	-- The fold's own view, which also compares classification to implementation.
	IF to_regprocedure('private.project_fold_policy_gaps()') IS NOT NULL THEN
		SELECT concat_ws(E'\n  ', v_gaps, string_agg(format('%s %I.%I.%I', g.problem, g.table_schema, g.table_name, g.column_name), E'\n  '
			ORDER BY g.problem, g.table_schema, g.table_name, g.column_name))
		INTO v_gaps FROM private.project_fold_policy_gaps() g
		WHERE g.problem NOT IN ('unclassified', 'policy_names_missing_column');
	END IF;

	IF coalesce(v_gaps, '') <> '' THEN
		RAISE EXCEPTION E'project fold table policy is out of date:\n  %', v_gaps
			USING HINT = 'In the same migration: INSERT INTO private.project_fold_table_policy (table_schema, table_name, column_name, action, reason) '
				|| 'VALUES (''public'', ''<table>'', ''<column>'', ''leave_behind'' | ''rebuild'' | ''move'' | ''repoint'', ''<why>''); '
				|| 'or delete the row of a dropped column. move/repoint also need private.project_fold_implemented() and the fold/unfold RPCs '
				|| 'to handle the table (supabase/migrations/20260930220000_project_fold_foundation.sql).';
	END IF;
END
$coverage$;
