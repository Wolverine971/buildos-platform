-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_images_private_storage_base.sql

-- A non-Libri control represents the shared application's existing data/policy.
CREATE TABLE public.buildos_upload_control (id integer PRIMARY KEY, value text);
INSERT INTO public.buildos_upload_control VALUES (1, 'unchanged');
ALTER TABLE public.buildos_upload_control ENABLE ROW LEVEL SECURITY;
CREATE POLICY buildos_upload_control_read ON public.buildos_upload_control
	FOR SELECT TO authenticated USING (id = 1);
CREATE POLICY existing_buildos_storage_policy ON storage.objects
	FOR SELECT TO authenticated USING (bucket_id = 'existing-buildos');
CREATE TEMP TABLE policy_before AS SELECT * FROM pg_policies WHERE schemaname IN ('public', 'storage');
CREATE TEMP TABLE buckets_before AS SELECT * FROM storage.buckets;

\ir ../migrations/20260906184227_libri_private_image_upload_admission.sql

CREATE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %', message; END IF;
END;
$$;
CREATE FUNCTION pg_temp.expect_error(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	BEGIN
		EXECUTE statement;
	EXCEPTION WHEN OTHERS THEN
		IF SQLSTATE = expected THEN RETURN; END IF;
		RAISE EXCEPTION 'expected SQLSTATE %, got %: %', expected, SQLSTATE, SQLERRM;
	END;
	RAISE EXCEPTION 'expected SQLSTATE %, statement succeeded: %', expected, statement;
END;
$$;

SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM libri.image_upload_controls), 'empty controls fail closed');
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM pg_class
	WHERE oid IN ('libri.image_upload_controls'::regclass, 'libri.image_upload_intents'::regclass)
	AND relrowsecurity AND relforcerowsecurity), 'both staging tables force RLS');
SELECT pg_temp.assert_true(
	NOT has_table_privilege('authenticated', 'libri.image_upload_controls', 'SELECT, INSERT, UPDATE, DELETE')
	AND NOT has_table_privilege('authenticated', 'libri.image_upload_intents', 'INSERT, UPDATE, DELETE')
	AND has_table_privilege('authenticated', 'libri.image_upload_intents', 'SELECT')
	AND NOT has_table_privilege('anon', 'libri.image_upload_intents', 'SELECT, INSERT, UPDATE, DELETE'),
	'clients cannot bypass admission or read controls');
SELECT pg_temp.assert_true(NOT EXISTS (
	SELECT 1 FROM pg_proc WHERE oid IN (
		'libri.reserve_image_upload(uuid,uuid,text,jsonb)'::regprocedure,
		'libri.submit_image_upload(uuid,uuid)'::regprocedure)
	AND (NOT prosecdef OR NOT proconfig @> ARRAY['search_path=pg_catalog, libri']
		OR has_function_privilege('anon', oid, 'EXECUTE')
		OR has_function_privilege('service_role', oid, 'EXECUTE')
		OR NOT has_function_privilege('authenticated', oid, 'EXECUTE'))
), 'only authenticated may invoke fixed-search-path admission APIs');
SELECT pg_temp.assert_true(NOT EXISTS (
	SELECT 1 FROM pg_constraint fk WHERE fk.contype = 'f'
	AND fk.conrelid IN ('libri.image_upload_controls'::regclass, 'libri.image_upload_intents'::regclass)
	AND NOT EXISTS (SELECT 1 FROM pg_index idx WHERE idx.indrelid = fk.conrelid AND idx.indisvalid
		AND (SELECT array_agg(att ORDER BY ordinal) FROM unnest(idx.indkey::smallint[])
			WITH ORDINALITY AS col(att, ordinal) WHERE ordinal <= cardinality(fk.conkey)) = fk.conkey)
), 'all new foreign keys have leading indexes');

INSERT INTO auth.users (id) VALUES
	('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222'),
	('33333333-3333-4333-8333-333333333333'), ('44444444-4444-4444-8444-444444444444');
INSERT INTO libri.libraries (id, slug, name, created_by) VALUES
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'one', 'One', '11111111-1111-4111-8111-111111111111'),
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'two', 'Two', '11111111-1111-4111-8111-111111111111');
INSERT INTO libri.library_members (library_id, user_id, role) VALUES
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'owner'),
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '22222222-2222-4222-8222-222222222222', 'editor'),
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '33333333-3333-4333-8333-333333333333', 'viewer');
INSERT INTO libri.books (id, library_id, title) VALUES
	('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'One'),
	('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Two'),
	('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Three');
INSERT INTO libri.chapters (id, library_id, book_id, position, number, title) VALUES
	('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 0, '1', 'One'),
	('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 0, '1', 'Two'),
	('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 0, '1', 'Three');

CREATE FUNCTION pg_temp.reserve(key text, overrides jsonb DEFAULT '{}'::jsonb,
	book uuid DEFAULT 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1')
RETURNS libri.image_upload_intents LANGUAGE sql AS $$
	SELECT libri.reserve_image_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', book, key,
		jsonb_build_object('filename', 'page.jpeg', 'mimeType', 'image/jpeg', 'byteSize', 1024,
			'sha256', repeat('a', 64), 'imageType', 'page') || overrides)
$$;
CREATE FUNCTION pg_temp.submit(key text) RETURNS libri.image_upload_intents LANGUAGE sql AS $$
	SELECT libri.submit_image_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		(SELECT id FROM libri.image_upload_intents WHERE idempotency_key = key AND requested_by = auth.uid()))
$$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve('missing_controls')$q$, '42501');
RESET ROLE;
INSERT INTO libri.image_upload_controls (library_id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
SET ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve('default_disabled')$q$, '42501');
SELECT pg_temp.expect_error('UPDATE libri.image_upload_controls SET admission_enabled = true', '42501');
SELECT pg_temp.expect_error('INSERT INTO libri.image_upload_intents DEFAULT VALUES', '42501');
SELECT pg_temp.expect_error('UPDATE libri.image_upload_intents SET status = ''expired''', '42501');
SELECT pg_temp.expect_error('DELETE FROM libri.image_upload_intents', '42501');
RESET ROLE;
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM libri.image_upload_intents), 'disabled attempts do not insert');
UPDATE libri.image_upload_controls SET admission_enabled = true;
SET ROLE authenticated;

-- A verified user ID, not a self-reported role or app metadata, controls access.
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve('missing_identity')$q$, '42501');
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
SELECT set_config('request.jwt.claim.user_metadata', '{"role":"owner"}', false);
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve('viewer_cannot_do')$q$, '42501');
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', false);
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve('nonmember_cannot')$q$, '42501');
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve('crosslib_book_no', '{}', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2')$q$, '42501');
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve('crosslib_chapter', '{"chapterId":"cccccccc-cccc-4ccc-8ccc-ccccccccccc2"}')$q$, '42501');
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve('crossbook_chap_no', '{"chapterId":"cccccccc-cccc-4ccc-8ccc-ccccccccccc3"}')$q$, '42501');
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve('short')$q$, '22023');
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve(NULL)$q$, '22023');
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve(repeat('x', 129))$q$, '22023');
SELECT pg_temp.expect_error($q$SELECT libri.reserve_image_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'invalid_declare1', '{}')$q$, '22023');

DO $$
DECLARE bad jsonb;
BEGIN
	FOREACH bad IN ARRAY ARRAY[
		'null'::jsonb, '[]'::jsonb, '{"filename":null}'::jsonb, '{"filename":""}'::jsonb,
		'{"filename":"../page.jpeg"}'::jsonb, jsonb_build_object('filename', E'path\\page.jpeg'),
		jsonb_build_object('filename', E'page\n.jpeg'), '{"filename":" page.jpeg "}'::jsonb,
		'{"mimeType":"image/svg+xml"}'::jsonb, '{"mimeType":null}'::jsonb,
		'{"byteSize":0}'::jsonb, '{"byteSize":-1}'::jsonb, '{"byteSize":"1024"}'::jsonb,
		'{"byteSize":1.5}'::jsonb, '{"byteSize":26214401}'::jsonb, '{"byteSize":1e100}'::jsonb,
		'{"sha256":"bad"}'::jsonb, jsonb_build_object('sha256', repeat('A', 64)),
		'{"imageType":"arbitrary"}'::jsonb, '{"chapterId":5}'::jsonb, '{"chapterId":"bad"}'::jsonb,
		'{"pageLabel":" "}'::jsonb, '{"pageLabel":7}'::jsonb, jsonb_build_object('pageLabel', E'1\n2'),
		'{"description":true}'::jsonb, jsonb_build_object('description', repeat('a', 4001)),
		jsonb_build_object('filename', repeat('x', 256)), jsonb_build_object('filename', repeat('x', 17000)),
		'{"object_path":"overwrite"}'::jsonb, '{"status":"verified"}'::jsonb
	] LOOP
		PERFORM pg_temp.expect_error(format('SELECT pg_temp.reserve(''invalid_metadata'', %L::jsonb)', bad), '22023');
	END LOOP;
END;
$$;

SELECT pg_temp.assert_true((pg_temp.reserve('successful_owner', '{"chapterId":"cccccccc-cccc-4ccc-8ccc-ccccccccccc1"}')).status = 'reserved', 'owner reserves');
SELECT pg_temp.assert_true((SELECT object_path = library_id::text || '/uploads/' || id::text || '/original.jpeg'
	AND requested_by = auth.uid() AND chapter_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
	AND signing_deadline = created_at + interval '10 minutes' AND expires_at = created_at + interval '135 minutes'
	FROM libri.image_upload_intents WHERE idempotency_key = 'successful_owner'), 'immutable staging path and finite windows');
SELECT pg_temp.assert_true((pg_temp.reserve('successful_owner', '{"chapterId":"cccccccc-cccc-4ccc-8ccc-ccccccccccc1"}')).id =
	(SELECT id FROM libri.image_upload_intents WHERE idempotency_key = 'successful_owner'), 'retry returns same identity');
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve('successful_owner', '{"filename":"different.jpeg"}')$q$, '22023');
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve('successful_owner', '{}', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3')$q$, '22023');
SELECT id AS owner_intent_id FROM libri.image_upload_intents WHERE idempotency_key = 'successful_owner' \gset
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM libri.image_upload_intents), 'editor cannot read another requester intents');
SELECT pg_temp.expect_error(format('SELECT libri.submit_image_upload(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'', %L)', :'owner_intent_id'), '42501');
SELECT pg_temp.assert_true((pg_temp.reserve('successful_owner', '{"mimeType":"image/png"}')).object_path LIKE '%/original.png', 'retry keys scoped to caller; editor allowed');
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.image_upload_intents), 'owner does not see editor staging intents');
SELECT pg_temp.assert_true((pg_temp.reserve('successful_webp_', '{"mimeType":"image/webp","byteSize":26214400,"chapterId":null,"pageLabel":null,"description":null}')).object_path LIKE '%/original.webp', 'WebP and maximum size accepted');
SELECT pg_temp.assert_true((pg_temp.submit('successful_owner')).status = 'awaiting_verification', 'submit is not verified and needs no assumed bytes');
SELECT submitted_at::text AS submitted_stamp FROM libri.image_upload_intents WHERE idempotency_key = 'successful_owner' \gset
SELECT pg_temp.assert_true((pg_temp.submit('successful_owner')).submitted_at = :'submitted_stamp'::timestamptz, 'submit retry preserves timestamp');

RESET ROLE;
UPDATE libri.image_upload_controls SET max_pending = 3;
SET ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve('pending_limit_no')$q$, '53000');
SELECT pg_temp.assert_true((pg_temp.reserve('successful_owner', '{"chapterId":"cccccccc-cccc-4ccc-8ccc-ccccccccccc1"}')).status = 'awaiting_verification', 'retry allowed at capacity');
RESET ROLE;
UPDATE libri.image_upload_intents SET created_at = created_at - interval '3 hours', signing_deadline = signing_deadline - interval '3 hours', expires_at = expires_at - interval '3 hours';
SET ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve('expired_pending_')$q$, '53000');
SELECT pg_temp.expect_error($q$SELECT pg_temp.submit('successful_webp_')$q$, '22023');
SELECT pg_temp.assert_true((pg_temp.reserve('successful_webp_', '{"mimeType":"image/webp","byteSize":26214400,"chapterId":null,"pageLabel":null,"description":null}')).signing_deadline < now(), 'retry never renews deadline');
RESET ROLE;
-- Simulate privileged cleanup after expiry. Preserve the submission audit timestamp.
UPDATE libri.image_upload_intents SET status = 'expired';
UPDATE libri.image_upload_controls SET max_daily = 3;
SET ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve('daily_limit_no__')$q$, '53000');
SELECT pg_temp.expect_error($q$SELECT pg_temp.submit('successful_owner')$q$, '22023');
RESET ROLE;
UPDATE libri.image_upload_intents SET created_at = created_at - interval '25 hours', signing_deadline = signing_deadline - interval '25 hours', expires_at = expires_at - interval '25 hours';
SET ROLE authenticated;
SELECT pg_temp.assert_true((pg_temp.reserve('next_day_allowed')).status = 'reserved', 'rolling daily budget recovers only outside window');
RESET ROLE;
UPDATE libri.image_upload_controls SET admission_enabled = false;
SET ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve('next_day_allowed')$q$, '42501');
SELECT pg_temp.expect_error($q$SELECT pg_temp.submit('next_day_allowed')$q$, '42501');
RESET ROLE;
UPDATE libri.image_upload_controls SET admission_enabled = true;
UPDATE libri.library_members SET role = 'viewer' WHERE user_id = '11111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT pg_temp.submit('next_day_allowed')$q$, '42501');
RESET ROLE;
DELETE FROM libri.library_members WHERE user_id = '11111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM libri.image_upload_intents), 'membership revocation removes reads');
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve('revoked_member__')$q$, '42501');
RESET ROLE;

SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM libri.images)
	AND NOT EXISTS (SELECT 1 FROM libri.sources) AND NOT EXISTS (SELECT 1 FROM storage.objects),
	'admission never creates canonical images, sources, or Storage bytes');
SELECT pg_temp.assert_true((SELECT value = 'unchanged' FROM public.buildos_upload_control WHERE id = 1)
	AND NOT EXISTS ((SELECT * FROM pg_policies WHERE schemaname IN ('public','storage') EXCEPT SELECT * FROM policy_before)
		UNION ALL (SELECT * FROM policy_before EXCEPT SELECT * FROM pg_policies WHERE schemaname IN ('public','storage')))
	AND NOT EXISTS ((SELECT * FROM storage.buckets EXCEPT SELECT * FROM buckets_before)
		UNION ALL (SELECT * FROM buckets_before EXCEPT SELECT * FROM storage.buckets)),
	'BuildOS data/policies and all bucket settings remain identical');
SELECT pg_temp.assert_true(NOT EXISTS (
	SELECT 1 FROM pg_constraint fk JOIN pg_class tbl ON tbl.oid = fk.conrelid
	WHERE fk.contype = 'f' AND tbl.relnamespace <> 'libri'::regnamespace
	AND fk.confrelid IN ('libri.image_upload_controls'::regclass, 'libri.image_upload_intents'::regclass)
), 'shared schemas do not depend on staging tables');

-- Restore a clean admission sandbox for the optional real-session race runner.
INSERT INTO libri.library_members (library_id, user_id, role) VALUES
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'owner');
DELETE FROM libri.image_upload_intents;
UPDATE libri.image_upload_controls SET max_pending = 1, max_daily = 50;
SELECT 'private image upload admission contract passed' AS result;
