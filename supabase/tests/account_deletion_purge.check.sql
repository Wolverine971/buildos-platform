-- supabase/tests/account_deletion_purge.check.sql
-- Standing invariant (DEFAULT_CHECKS in scripts/migration-rehearsal/rehearse.py):
-- account deletion finishes on production's real schema and leaves nothing that
-- points at the person.
--
-- The hand-written contract (20260924190100_account_deletion_completeness.test.sql)
-- runs on stub tables, so it never saw production constraints such as
-- chk_actor_identity, and deletion failed in production for every account
-- (Tasker 103). This check runs the real pipeline on the real schema instead:
--
--   1. Two people: U deletes their account, O is a collaborator who stays.
--      U owns a project, edits in O's project, and has an agent run and a chat.
--   2. A generic seeder puts one row pointing at U in every table it can fill:
--      foreign keys to users/auth.users get U, to onto_actors get U's actor, to
--      onto_projects get U's project, to anything else get a row seeded earlier;
--      required columns get type-shaped values (CHECK literals and enum labels
--      first). A new table that references a person is covered without editing
--      this file. Tables it cannot fill are listed as WARNINGs, never failures.
--   3. The deletion pipeline as production runs it: request_account_deletion,
--      claim_due_account_deletions, libri.purge_account_deletion,
--      finalize_account_deletion_database, then the auth user delete
--      (auth.admin.deleteUser) as the service role would.
--   4. Assertions: no column that references U (a foreign key to users or
--      auth.users, or any column named user_id) still holds U, outside the two
--      opaque lifecycle records; U's actor is an anonymized tombstone and only
--      surviving shared-project rows point at it; U's email appears in no text
--      or JSON column anywhere; O, O's project and U's work in it survive.
--
-- DISPOSABLE DATABASE ONLY. Every fixture is invented; everything rolls back.

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL client_min_messages = warning;
-- Production resolves pgcrypto and friends through the extensions schema.
SET LOCAL search_path = public, extensions;

CREATE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	IF NOT coalesce(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

-- U = d9…01 (deletes their account), O = d9…02 (stays).
-- Actors d9…11/12, projects d9…21 (U's) and d9…22 (O's, U edits), U's task in O's project d9…31.
INSERT INTO auth.users (id, email) VALUES
	('d9000000-0000-4000-8000-000000000001', 'gone.person@example.com'),
	('d9000000-0000-4000-8000-000000000002', 'stays.person@example.com');
INSERT INTO public.users (id, email, name, username) VALUES
	('d9000000-0000-4000-8000-000000000001', 'gone.person@example.com', 'Gone Person', 'goneperson'),
	('d9000000-0000-4000-8000-000000000002', 'stays.person@example.com', 'Stays Person', 'staysperson')
	ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, kind, name, email, user_id) VALUES
	('d9000000-0000-4000-8000-000000000011', 'human', 'Gone Person', 'gone.person@example.com', 'd9000000-0000-4000-8000-000000000001'),
	('d9000000-0000-4000-8000-000000000012', 'human', 'Stays Person', 'stays.person@example.com', 'd9000000-0000-4000-8000-000000000002')
	ON CONFLICT DO NOTHING;
SELECT pg_temp.assert_true(
	(SELECT count(*) = 2 FROM public.onto_actors
		WHERE id IN ('d9000000-0000-4000-8000-000000000011', 'd9000000-0000-4000-8000-000000000012')),
	'fixture actors exist with their fixed ids');

INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key) VALUES
	('d9000000-0000-4000-8000-000000000021', 'Gone solo', 'project.default', 'd9000000-0000-4000-8000-000000000011', 'active'),
	('d9000000-0000-4000-8000-000000000022', 'Stays shared', 'project.default', 'd9000000-0000-4000-8000-000000000012', 'active');
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access) VALUES
	('d9000000-0000-4000-8000-000000000021', 'd9000000-0000-4000-8000-000000000011', 'owner', 'admin'),
	('d9000000-0000-4000-8000-000000000022', 'd9000000-0000-4000-8000-000000000012', 'owner', 'admin'),
	('d9000000-0000-4000-8000-000000000022', 'd9000000-0000-4000-8000-000000000011', 'editor', 'write')
	ON CONFLICT DO NOTHING;
-- U's work inside O's project: it stays, credited to the anonymized actor.
INSERT INTO public.onto_tasks (id, project_id, title, state_key, created_by) VALUES
	('d9000000-0000-4000-8000-000000000031', 'd9000000-0000-4000-8000-000000000022', 'Shared work', 'todo', 'd9000000-0000-4000-8000-000000000011');

-- Files: one U uploaded (owner_id), U's data export (user-id prefix), and O's
-- export, which must stay.
INSERT INTO storage.buckets (id, name) VALUES
	('onto-assets', 'onto-assets'),
	('user-exports', 'user-exports')
	ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
	('onto-assets', 'uploads/gone-upload.png', 'd9000000-0000-4000-8000-000000000001'),
	('user-exports', 'd9000000-0000-4000-8000-000000000001/export.zip', NULL),
	('user-exports', 'd9000000-0000-4000-8000-000000000002/export.zip', 'd9000000-0000-4000-8000-000000000002');

-- Hand-written rows for tables whose CHECKs and triggers the generic seeder
-- cannot satisfy (chat turn children, cycles, comments, assets, proposals, ...).
\ir fixtures/account_deletion_purge_seed.sql

-- ---------------------------------------------------------------------------
-- Generic seeder
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE seed_outcome (
	relation text PRIMARY KEY,
	seeded boolean NOT NULL,
	detail text
) ON COMMIT DROP;

-- A SQL expression for one required column. p_attempt cycles through CHECK
-- literals and enum labels so a table with a status vocabulary gets a valid one.
CREATE FUNCTION pg_temp.seed_value(p_rel oid, p_attnum smallint, p_attempt integer)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
	v_att record;
	v_base oid;
	v_base_type record;
	v_choices text[];
	v_dims integer;
	v_value text;
BEGIN
	SELECT a.atttypid, a.atttypmod, format_type(a.atttypid, a.atttypmod) AS type_name
	INTO v_att
	FROM pg_attribute AS a
	WHERE a.attrelid = p_rel AND a.attnum = p_attnum;

	v_base := v_att.atttypid;
	WHILE (SELECT typtype FROM pg_type WHERE oid = v_base) = 'd' LOOP
		v_base := (SELECT typbasetype FROM pg_type WHERE oid = v_base);
	END LOOP;
	SELECT typname, typtype, typcategory INTO v_base_type FROM pg_type WHERE oid = v_base;

	IF v_base_type.typtype = 'e' THEN
		v_choices := ARRAY(SELECT enumlabel::text FROM pg_enum WHERE enumtypid = v_base ORDER BY enumsortorder);
	ELSIF v_base_type.typcategory = 'S' THEN
		-- Quoted literals from the CHECK constraints on this column (structured
		-- catalog text, not user text), skipping regex patterns, then generic
		-- shapes: a word and a sha256 hex digest.
		v_choices := ARRAY(
			SELECT DISTINCT replace(match[1], '''''', '''')
			FROM pg_constraint AS con
			CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(con.oid), '''((?:[^'']|'''')*)''', 'g') AS match
			WHERE con.conrelid = p_rel AND con.contype = 'c' AND p_attnum = ANY(con.conkey)
				AND match[1] !~ '[\^$\[\]{}*+?|\\]'
			ORDER BY 1
		) || ARRAY['seed', encode(sha256('seed'::bytea), 'hex')];
	END IF;

	IF cardinality(v_choices) > 0 THEN
		v_value := v_choices[(p_attempt % cardinality(v_choices)) + 1];
	ELSIF v_base_type.typname IN ('json', 'jsonb') THEN
		v_value := CASE WHEN p_attempt % 2 = 0 THEN '{}' ELSE '[]' END;
	ELSIF v_base_type.typname = 'uuid' THEN
		v_value := gen_random_uuid()::text;
	ELSIF v_base_type.typname IN ('vector', 'halfvec') THEN
		v_dims := CASE WHEN v_att.atttypmod > 0 THEN v_att.atttypmod ELSE 3 END;
		v_value := '[' || array_to_string(array_fill(0, ARRAY[v_dims]), ',') || ']';
	ELSIF v_base_type.typname = 'tsvector' THEN
		v_value := '';
	ELSIF v_base_type.typname = 'bytea' THEN
		v_value := '\x00';
	ELSIF v_base_type.typname = 'date' THEN
		v_value := current_date::text;
	ELSIF v_base_type.typname IN ('time', 'timetz') THEN
		v_value := '09:00';
	ELSIF v_base_type.typcategory = 'D' THEN
		-- Later columns get later times (created, started, finished, expires),
		-- and odd attempts push everything into the future.
		v_value := (now() + p_attnum * interval '1 minute'
			+ CASE WHEN p_attempt % 2 = 1 THEN interval '1 day' ELSE interval '0' END)::text;
	ELSIF v_base_type.typcategory = 'T' THEN
		v_value := '1 day';
	ELSIF v_base_type.typcategory = 'N' THEN
		v_value := CASE WHEN p_attempt % 2 = 0 THEN '1' ELSE '0' END;
	ELSIF v_base_type.typcategory = 'B' THEN
		v_value := CASE WHEN p_attempt % 2 = 0 THEN 'false' ELSE 'true' END;
	ELSIF v_base_type.typcategory = 'A' THEN
		v_value := '{}';
	ELSIF v_base_type.typcategory = 'I' THEN
		v_value := '127.0.0.1';
	ELSE
		v_value := 'seed';
	END IF;

	RETURN quote_literal(v_value) || '::' || v_att.type_name;
END;
$$;

DO $seed$
DECLARE
	v_user constant uuid := 'd9000000-0000-4000-8000-000000000001';
	v_actor constant uuid := 'd9000000-0000-4000-8000-000000000011';
	v_project constant uuid := 'd9000000-0000-4000-8000-000000000021';
	v_pass integer;
	v_progress boolean;
	v_rel record;
	v_fk record;
	v_col record;
	v_cols text[];
	v_vals text[];
	v_ref text[];
	v_waiting text;
	v_attempt integer;
	v_sql text;
	v_error text;
	i integer;
BEGIN
	FOR v_pass IN 1..8 LOOP
		v_progress := false;
		FOR v_rel IN
			SELECT class.oid AS relid, format('%I.%I', namespace.nspname, class.relname) AS relation
			FROM pg_class AS class
			JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
			WHERE namespace.nspname IN ('public', 'libri', 'onto', 'private', 'agentic_chat_internal', 'app_auth')
				AND class.relkind IN ('r', 'p')
				AND NOT class.relispartition
				AND NOT EXISTS (
					SELECT 1 FROM seed_outcome AS done
					WHERE done.relation = format('%I.%I', namespace.nspname, class.relname) AND done.seeded
				)
			ORDER BY 2
		LOOP
			v_error := NULL;
			FOR v_attempt IN 0..7 LOOP
				v_cols := '{}';
				v_vals := '{}';
				v_waiting := NULL;

				FOR v_fk IN
					SELECT con.confrelid,
						array_agg(attribute.attname::text ORDER BY key.ord) AS cols,
						array_agg(referenced.attname::text ORDER BY key.ord) AS ref_cols,
						array_agg(format_type(attribute.atttypid, attribute.atttypmod) ORDER BY key.ord) AS types,
						bool_or(attribute.attnotnull) AS required
					FROM pg_constraint AS con
					CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS key(attnum, ref_attnum, ord)
					JOIN pg_attribute AS attribute ON attribute.attrelid = con.conrelid AND attribute.attnum = key.attnum
					JOIN pg_attribute AS referenced ON referenced.attrelid = con.confrelid AND referenced.attnum = key.ref_attnum
					WHERE con.conrelid = v_rel.relid AND con.contype = 'f'
					GROUP BY con.oid, con.confrelid
					ORDER BY cardinality(array_agg(attribute.attname)) DESC, con.oid
				LOOP
					CONTINUE WHEN v_fk.cols && v_cols;
					IF cardinality(v_fk.cols) = 1 AND v_fk.confrelid IN ('auth.users'::regclass, 'public.users'::regclass) THEN
						v_cols := v_cols || v_fk.cols;
						v_vals := v_vals || (quote_literal(v_user) || '::' || v_fk.types[1]);
					ELSIF cardinality(v_fk.cols) = 1 AND v_fk.confrelid = 'public.onto_actors'::regclass THEN
						v_cols := v_cols || v_fk.cols;
						v_vals := v_vals || (quote_literal(v_actor) || '::' || v_fk.types[1]);
					ELSIF cardinality(v_fk.cols) = 1 AND v_fk.confrelid = 'public.onto_projects'::regclass THEN
						v_cols := v_cols || v_fk.cols;
						v_vals := v_vals || (quote_literal(v_project) || '::' || v_fk.types[1]);
					ELSIF v_fk.confrelid = v_rel.relid THEN
						IF v_fk.required THEN
							v_waiting := 'required self reference';
						END IF;
					ELSE
						EXECUTE format(
							'SELECT ARRAY[%s] FROM %s LIMIT 1',
							(SELECT string_agg(format('%I::text', name), ', ') FROM unnest(v_fk.ref_cols) AS name),
							v_fk.confrelid::regclass
						) INTO v_ref;
						IF v_ref IS NULL THEN
							IF v_fk.required THEN
								v_waiting := 'waiting for a row in ' || v_fk.confrelid::regclass::text;
							END IF;
						ELSE
							FOR i IN 1..cardinality(v_fk.cols) LOOP
								v_cols := v_cols || v_fk.cols[i];
								v_vals := v_vals || CASE
									WHEN v_ref[i] IS NULL THEN 'NULL'
									ELSE quote_literal(v_ref[i]) || '::' || v_fk.types[i]
								END;
							END LOOP;
						END IF;
					END IF;
				END LOOP;

				EXIT WHEN v_waiting IS NOT NULL;

				FOR v_col IN
					SELECT attribute.attnum, attribute.attname::text AS name, attribute.attnotnull,
						format_type(attribute.atttypid, attribute.atttypmod) AS type_name,
						default_value.adbin IS NOT NULL AS has_default
					FROM pg_attribute AS attribute
					LEFT JOIN pg_attrdef AS default_value
						ON default_value.adrelid = attribute.attrelid AND default_value.adnum = attribute.attnum
					WHERE attribute.attrelid = v_rel.relid
						AND attribute.attnum > 0
						AND NOT attribute.attisdropped
						AND attribute.attgenerated = ''
						AND attribute.attidentity = ''
						AND NOT (attribute.attname::text = ANY(v_cols))
					ORDER BY attribute.attnum
				LOOP
					IF v_col.name = 'user_id' AND v_col.type_name IN ('uuid', 'text') THEN
						v_cols := v_cols || v_col.name;
						v_vals := v_vals || (quote_literal(v_user) || '::' || v_col.type_name);
					ELSIF v_col.attnotnull AND NOT v_col.has_default THEN
						v_cols := v_cols || v_col.name;
						v_vals := v_vals || pg_temp.seed_value(v_rel.relid, v_col.attnum, v_attempt);
					END IF;
				END LOOP;

				v_sql := CASE
					WHEN cardinality(v_cols) = 0 THEN format('INSERT INTO %s DEFAULT VALUES', v_rel.relation)
					ELSE format(
						'INSERT INTO %s (%s) VALUES (%s)',
						v_rel.relation,
						(SELECT string_agg(quote_ident(name), ', ') FROM unnest(v_cols) AS name),
						array_to_string(v_vals, ', ')
					)
				END;

				BEGIN
					EXECUTE v_sql;
					v_error := NULL;
					v_progress := true;
					EXIT;
				EXCEPTION WHEN OTHERS THEN
					v_error := SQLERRM;
				END;
			END LOOP;

			INSERT INTO seed_outcome (relation, seeded, detail)
			VALUES (v_rel.relation, v_waiting IS NULL AND v_error IS NULL, coalesce(v_waiting, v_error))
			ON CONFLICT (relation) DO UPDATE SET seeded = EXCLUDED.seeded, detail = EXCLUDED.detail;
		END LOOP;
		EXIT WHEN NOT v_progress;
	END LOOP;
END;
$seed$;

-- ---------------------------------------------------------------------------
-- Every column that can point at the person
-- ---------------------------------------------------------------------------
-- Single-column foreign keys to users / auth.users / onto_actors, plus every
-- column named user_id (the purge's generic sweep keys on that name).

CREATE TEMP TABLE person_columns ON COMMIT DROP AS
SELECT DISTINCT
	format('%I.%I', namespace.nspname, class.relname) AS relation,
	attribute.attname::text AS column_name,
	CASE WHEN con.confrelid = 'public.onto_actors'::regclass THEN 'actor' ELSE 'user' END AS points_at,
	con.confdeltype AS delete_rule
FROM pg_class AS class
JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
JOIN pg_attribute AS attribute ON attribute.attrelid = class.oid AND attribute.attnum > 0 AND NOT attribute.attisdropped
LEFT JOIN pg_constraint AS con
	ON con.conrelid = class.oid
	AND con.contype = 'f'
	AND con.conkey = ARRAY[attribute.attnum]
	AND con.confrelid IN ('auth.users'::regclass, 'public.users'::regclass, 'public.onto_actors'::regclass)
WHERE namespace.nspname IN ('public', 'libri', 'onto', 'private', 'agentic_chat_internal', 'app_auth')
	AND class.relkind IN ('r', 'p')
	AND NOT class.relispartition
	AND (
		con.oid IS NOT NULL
		OR (attribute.attname = 'user_id' AND format_type(attribute.atttypid, attribute.atttypmod) IN ('uuid', 'text'))
	);

CREATE TEMP TABLE person_rows (
	phase text,
	relation text,
	column_name text,
	points_at text,
	delete_rule "char",
	row_count bigint
) ON COMMIT DROP;

CREATE FUNCTION pg_temp.count_person_rows(p_phase text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	v_col record;
	v_count bigint;
BEGIN
	FOR v_col IN SELECT * FROM person_columns ORDER BY relation, column_name LOOP
		EXECUTE format('SELECT count(*) FROM %s WHERE %I::text = $1', v_col.relation, v_col.column_name)
		INTO v_count
		USING CASE v_col.points_at
			WHEN 'actor' THEN 'd9000000-0000-4000-8000-000000000011'
			ELSE 'd9000000-0000-4000-8000-000000000001'
		END;
		IF v_count > 0 THEN
			INSERT INTO person_rows
			VALUES (p_phase, v_col.relation, v_col.column_name, v_col.points_at, v_col.delete_rule, v_count);
		END IF;
	END LOOP;
END;
$$;

SELECT pg_temp.count_person_rows('before');

DO $report$
DECLARE
	v_row record;
	v_seeded integer;
	v_unseeded integer;
	v_covered integer;
BEGIN
	SELECT count(*) FILTER (WHERE seeded), count(*) FILTER (WHERE NOT seeded)
	INTO v_seeded, v_unseeded
	FROM seed_outcome;
	SELECT count(DISTINCT relation) INTO v_covered FROM person_rows WHERE phase = 'before';
	RAISE WARNING 'account deletion check: seeded % tables (% could not be filled); % tables held rows pointing at the person before the purge',
		v_seeded, v_unseeded, v_covered;
	FOR v_row IN
		SELECT seed.relation, seed.detail
		FROM seed_outcome AS seed
		WHERE NOT seed.seeded
			AND EXISTS (SELECT 1 FROM person_columns AS person WHERE person.relation = seed.relation)
			AND NOT EXISTS (SELECT 1 FROM person_rows AS row WHERE row.relation = seed.relation AND row.phase = 'before')
		ORDER BY 1
	LOOP
		RAISE WARNING 'not covered (references a person, could not seed): % — %', v_row.relation, left(v_row.detail, 160);
	END LOOP;
END;
$report$;

-- ---------------------------------------------------------------------------
-- The deletion pipeline, as production runs it
-- ---------------------------------------------------------------------------

SET LOCAL ROLE service_role;
SELECT request_id IS NOT NULL AS requested
FROM public.request_account_deletion('d9000000-0000-4000-8000-000000000001');
RESET ROLE;

UPDATE public.account_deletion_requests
SET scheduled_for = now() - interval '1 minute'
WHERE user_id = 'd9000000-0000-4000-8000-000000000001';

CREATE TEMP TABLE claimed (user_id uuid) ON COMMIT DROP;
CREATE TEMP TABLE libri_scope (scope jsonb) ON COMMIT DROP;
CREATE TEMP TABLE doomed_files (bucket_id text, object_name text) ON COMMIT DROP;
GRANT ALL ON claimed, libri_scope, doomed_files TO service_role;

SET LOCAL ROLE service_role;
INSERT INTO claimed SELECT user_id FROM public.claim_due_account_deletions(5, 15);

-- Files first: the listing needs the rows the database purge removes.
INSERT INTO libri_scope SELECT libri.account_deletion_storage_scope('d9000000-0000-4000-8000-000000000001');
INSERT INTO doomed_files
SELECT listed.bucket_id, listed.object_name
FROM public.list_account_deletion_storage_objects(
	'd9000000-0000-4000-8000-000000000001',
	ARRAY(SELECT jsonb_array_elements_text(scope->'library_ids')::uuid FROM libri_scope)
) AS listed
UNION
SELECT 'libri-assets', jsonb_array_elements_text(scope->'object_paths') FROM libri_scope;
RESET ROLE;

-- admin.storage.from(bucket).remove(paths)
SET LOCAL storage.allow_delete_query = 'true';
DELETE FROM storage.objects AS object
USING doomed_files AS doomed
WHERE object.bucket_id = doomed.bucket_id AND object.name = doomed.object_name;

SET LOCAL ROLE service_role;
SELECT libri.purge_account_deletion('d9000000-0000-4000-8000-000000000001');
SELECT public.finalize_account_deletion_database('d9000000-0000-4000-8000-000000000001');
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT array_agg(user_id) = ARRAY['d9000000-0000-4000-8000-000000000001'::uuid] FROM claimed),
	'the due request is claimed');

-- auth.admin.deleteUser
DELETE FROM auth.users WHERE id = 'd9000000-0000-4000-8000-000000000001';

SELECT pg_temp.count_person_rows('after');

-- ---------------------------------------------------------------------------
-- Assertions
-- ---------------------------------------------------------------------------


-- 1. Nothing points at the person, outside the opaque lifecycle records. Only
--    RESTRICT / NO ACTION references (authorship of surviving shared work) may
--    still point at the anonymized actor; CASCADE and SET NULL ones must not.
DO $assert$
DECLARE
	v_left text;
BEGIN
	SELECT string_agg(format('%s.%s (%s)', relation, column_name, row_count), ', ' ORDER BY relation)
	INTO v_left
	FROM person_rows
	WHERE phase = 'after'
		AND points_at = 'user'
		AND relation NOT IN (
			'public.account_deletion_requests',
			'public.legal_acceptances',
			'public.legal_acceptance_intents'
		);
	IF v_left IS NOT NULL THEN
		RAISE EXCEPTION 'assertion_failed: rows still point at the deleted person: %', v_left;
	END IF;

	SELECT string_agg(format('%s.%s (%s)', relation, column_name, row_count), ', ' ORDER BY relation)
	INTO v_left
	FROM person_rows
	WHERE phase = 'after'
		AND points_at = 'actor'
		AND delete_rule NOT IN ('a', 'r');
	IF v_left IS NOT NULL THEN
		RAISE EXCEPTION 'assertion_failed: cascade / set-null references still point at the deleted actor: %', v_left;
	END IF;
END;
$assert$;

-- 2. The actor is a tombstone: no person, no email, no name.
SELECT pg_temp.assert_true(
	(SELECT user_id IS NULL AND email IS NULL AND name = 'Deleted user'
			AND metadata = '{"account_deleted": true}'::jsonb AND account_deleted_at IS NOT NULL
		FROM public.onto_actors WHERE id = 'd9000000-0000-4000-8000-000000000011'),
	'the deleted person''s actor is an anonymized tombstone');

-- 3. U's own project is gone; O's project, O and U's work in it remain.
SELECT pg_temp.assert_true(
	NOT EXISTS (SELECT 1 FROM public.onto_projects WHERE id = 'd9000000-0000-4000-8000-000000000021'),
	'the person''s own project is deleted');
SELECT pg_temp.assert_true(
	(SELECT created_by = 'd9000000-0000-4000-8000-000000000011'
		FROM public.onto_tasks WHERE id = 'd9000000-0000-4000-8000-000000000031'),
	'their work in a collaborator''s project survives, credited to the tombstone');
SELECT pg_temp.assert_true(
	EXISTS (SELECT 1 FROM public.onto_projects WHERE id = 'd9000000-0000-4000-8000-000000000022')
	AND EXISTS (SELECT 1 FROM public.users WHERE id = 'd9000000-0000-4000-8000-000000000002')
	AND EXISTS (SELECT 1 FROM auth.users WHERE id = 'd9000000-0000-4000-8000-000000000002')
	AND EXISTS (
		SELECT 1 FROM public.onto_project_members
		WHERE project_id = 'd9000000-0000-4000-8000-000000000022'
			AND actor_id = 'd9000000-0000-4000-8000-000000000012'
	),
	'the collaborator, their project and their membership are untouched');
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1 FROM public.onto_project_members
		WHERE actor_id = 'd9000000-0000-4000-8000-000000000011'
	),
	'the person no longer belongs to any project');

-- 4. The person's files are gone; the collaborator's file stays.
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1 FROM storage.objects
		WHERE owner_id = 'd9000000-0000-4000-8000-000000000001'
			OR name LIKE 'd9000000-0000-4000-8000-000000000001/%'
	),
	'the person''s storage objects are removed');
SELECT pg_temp.assert_true(
	EXISTS (SELECT 1 FROM storage.objects WHERE name = 'd9000000-0000-4000-8000-000000000002/export.zip'),
	'the collaborator''s storage object stays');

-- 5. Residue, in every text, JSON, uuid or array column of every table
--    (including auth and storage): the person's email appears nowhere; their
--    id only in the opaque lifecycle records; their actor id only on the
--    tombstone itself and in authorship columns of surviving shared work.
DO $residue$
DECLARE
	v_col record;
	v_needle record;
	v_count bigint;
	v_found text[] := '{}';
BEGIN
	FOR v_col IN
		SELECT format('%I.%I', namespace.nspname, class.relname) AS relation,
			attribute.attname::text AS column_name,
			(
				SELECT con.confdeltype
				FROM pg_constraint AS con
				WHERE con.conrelid = class.oid
					AND con.contype = 'f'
					AND con.conkey = ARRAY[attribute.attnum]
					AND con.confrelid = 'public.onto_actors'::regclass
			) AS actor_delete_rule
		FROM pg_class AS class
		JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
		JOIN pg_attribute AS attribute ON attribute.attrelid = class.oid AND attribute.attnum > 0 AND NOT attribute.attisdropped
		JOIN pg_type AS type ON type.oid = attribute.atttypid
		WHERE namespace.nspname IN ('public', 'libri', 'onto', 'private', 'agentic_chat_internal', 'app_auth', 'auth', 'storage')
			AND class.relkind IN ('r', 'p')
			AND NOT class.relispartition
			AND (type.typcategory IN ('S', 'A') OR type.typname IN ('json', 'jsonb', 'uuid'))
	LOOP
		FOR v_needle IN
			SELECT * FROM (VALUES
				('email', 'gone.person@example.com'),
				('user id', 'd9000000-0000-4000-8000-000000000001'),
				('actor id', 'd9000000-0000-4000-8000-000000000011')
			) AS needle(kind, value)
		LOOP
			CONTINUE WHEN v_needle.kind = 'user id' AND v_col.relation IN (
				'public.account_deletion_requests',
				'public.legal_acceptances',
				'public.legal_acceptance_intents'
			) AND v_col.column_name = 'user_id';
			-- Authorship: RESTRICT / NO ACTION foreign keys, and *_by columns
			-- that carry no foreign key (onto_tasks.created_by, ...).
			CONTINUE WHEN v_needle.kind = 'actor id' AND (
				(v_col.relation = 'public.onto_actors' AND v_col.column_name = 'id')
				OR v_col.actor_delete_rule IN ('a', 'r')
				OR (v_col.actor_delete_rule IS NULL AND v_col.column_name ~ '_by$')
			);
			EXECUTE format('SELECT count(*) FROM %s WHERE strpos(lower(%I::text), $1) > 0', v_col.relation, v_col.column_name)
			INTO v_count
			USING v_needle.value;
			IF v_count > 0 THEN
				v_found := v_found || format('%s in %s.%s (%s)', v_needle.kind, v_col.relation, v_col.column_name, v_count);
			END IF;
		END LOOP;
	END LOOP;
	IF cardinality(v_found) > 0 THEN
		RAISE EXCEPTION 'assertion_failed: the deleted person survives in %', array_to_string(v_found, ', ');
	END IF;
END;
$residue$;

ROLLBACK;
