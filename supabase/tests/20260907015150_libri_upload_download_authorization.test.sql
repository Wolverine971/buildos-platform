-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_images_private_storage_base.sql
\ir ../../scripts/database/provision-libri-worker-role.sql
\ir ../../scripts/database/provision-libri-frontend-reader-role.sql
GRANT USAGE ON SCHEMA libri TO libri_worker, libri_frontend_reader;
\ir ../migrations/20260906184227_libri_private_image_upload_admission.sql
\ir ../migrations/20260906201700_libri_upload_processing_leases.sql
CREATE TEMP TABLE shared_acl_before AS SELECT oid,relacl FROM pg_class WHERE relnamespace <> 'libri'::regnamespace;
CREATE TEMP TABLE libri_acl_before AS SELECT oid,relacl FROM pg_class WHERE relnamespace = 'libri'::regnamespace;
CREATE TEMP TABLE policies_before AS SELECT * FROM pg_policies;
CREATE TEMP TABLE buckets_before AS SELECT * FROM storage.buckets;
\ir ../migrations/20260907015150_libri_upload_download_authorization.sql

CREATE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %',message; END IF; END;
$$;
CREATE FUNCTION pg_temp.expect_error(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	BEGIN EXECUTE statement;
	EXCEPTION WHEN OTHERS THEN
		IF SQLSTATE = expected THEN RETURN; END IF;
		RAISE EXCEPTION 'expected %, got %: %',expected,SQLSTATE,SQLERRM;
	END;
	RAISE EXCEPTION 'expected %, statement succeeded',expected;
END;
$$;
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM libri.image_upload_controls)
	AND NOT EXISTS (SELECT 1 FROM libri.image_upload_intents), 'migration does not enable or enqueue uploads');
SELECT pg_temp.assert_true((SELECT NOT prosecdef AND proconfig @> ARRAY[
	'search_path=pg_catalog, libri','lock_timeout=2s','statement_timeout=5s'] FROM pg_proc
	WHERE oid='libri.authorize_image_upload_download(uuid,uuid,uuid,integer)'::regprocedure), 'bounded invoker rights');
SELECT pg_temp.assert_true(has_function_privilege('service_role',
	'libri.authorize_image_upload_download(uuid,uuid,uuid,integer)','EXECUTE') AND NOT EXISTS (
	SELECT 1 FROM unnest(ARRAY['anon','authenticated','libri_worker','libri_frontend_reader']) role_name
	WHERE has_function_privilege(role_name,'libri.authorize_image_upload_download(uuid,uuid,uuid,integer)','EXECUTE')
), 'server only execution; no worker/browser grant');

INSERT INTO auth.users(id) VALUES ('11111111-1111-4111-8111-111111111111');
INSERT INTO libri.libraries(id,slug,name,created_by) VALUES
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','one','One','11111111-1111-4111-8111-111111111111'),
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','two','Two','11111111-1111-4111-8111-111111111111');
INSERT INTO libri.library_members(library_id,user_id,role) SELECT id,'11111111-1111-4111-8111-111111111111','owner' FROM libri.libraries;
INSERT INTO libri.books(id,library_id,title) VALUES
	('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','One');
INSERT INTO libri.image_upload_controls(library_id) SELECT id FROM libri.libraries;
INSERT INTO libri.image_upload_intents(id,library_id,book_id,requested_by,idempotency_key,file_metadata,
	object_path,created_at,signing_deadline,expires_at,status,submitted_at)
VALUES ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','11111111-1111-4111-8111-111111111111','download_fixture',
	'{"mimeType":"image/png","byteSize":1024,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/uploads/dddddddd-dddd-4ddd-8ddd-ddddddddddd1/original.png',
	now(),now()+interval '10 minutes',now()+interval '135 minutes','awaiting_verification',now());
CREATE FUNCTION pg_temp.authorize_download(token integer DEFAULT 1, attempt integer DEFAULT 1) RETURNS jsonb LANGUAGE sql AS $$
	SELECT libri.authorize_image_upload_download('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee'||token)::uuid,attempt)
$$;
SET ROLE authenticated;
SELECT pg_temp.expect_error('SELECT pg_temp.authorize_download()', '42501');
RESET ROLE;
SET ROLE libri_frontend_reader;
SELECT pg_temp.expect_error('SELECT pg_temp.authorize_download()', '42501');
RESET ROLE;
SET ROLE libri_worker;
SELECT pg_temp.expect_error('SELECT pg_temp.authorize_download()', '42501');
RESET ROLE;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.authorize_download() IS NULL, 'default-off denies download');
SELECT pg_temp.expect_error('SELECT libri.authorize_image_upload_download(NULL,NULL,NULL,1)', '22023');
SELECT pg_temp.expect_error('SELECT pg_temp.authorize_download(1,4)', '22023');
RESET ROLE;
UPDATE libri.image_upload_controls SET admission_enabled=true,processing_enabled=true;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.authorize_download() IS NULL, 'submission without a claim is not authority');
RESET ROLE;
SET ROLE libri_worker;
SELECT libri.claim_image_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','dddddddd-dddd-4ddd-8ddd-ddddddddddd1','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1');
RESET ROLE;
CREATE TEMP TABLE lease_before AS SELECT * FROM libri.image_upload_processing;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.authorize_download()->>'object_path' =
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/uploads/dddddddd-dddd-4ddd-8ddd-ddddddddddd1/original.png'
	AND pg_temp.authorize_download()->>'bucket_id'='libri-assets'
	AND (pg_temp.authorize_download()->>'byte_size')::integer=1024, 'service role obtains exact DB-derived path/declaration');
SELECT pg_temp.assert_true(pg_temp.authorize_download(2,1) IS NULL AND pg_temp.authorize_download(1,2) IS NULL, 'full token and generation fence');
SELECT pg_temp.assert_true(libri.authorize_image_upload_download('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
	'dddddddd-dddd-4ddd-8ddd-ddddddddddd1','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',1) IS NULL, 'cross-library denied even with same member');
RESET ROLE;
SELECT pg_temp.assert_true(NOT EXISTS ((SELECT * FROM libri.image_upload_processing EXCEPT SELECT * FROM lease_before)
	UNION ALL (SELECT * FROM lease_before EXCEPT SELECT * FROM libri.image_upload_processing)), 'repeated authorization does not mutate or renew lease');
UPDATE libri.image_upload_controls SET processing_enabled=false;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.authorize_download() IS NULL, 'processing kill switch applies to existing claim');
RESET ROLE;
UPDATE libri.image_upload_controls SET processing_enabled=true,admission_enabled=false;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.authorize_download() IS NULL, 'admission kill switch also applies');
RESET ROLE;
UPDATE libri.image_upload_controls SET admission_enabled=true;
UPDATE libri.library_members SET role='viewer';
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.authorize_download() IS NULL, 'revoked write membership denies existing claim');
RESET ROLE;
UPDATE libri.library_members SET role='editor';
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.authorize_download() IS NOT NULL, 'current editor is supported');
RESET ROLE;
UPDATE libri.image_upload_processing SET lease_expires_at=now()-interval '1 second';
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.authorize_download() IS NULL, 'expired lease denied');
RESET ROLE;
UPDATE libri.image_upload_processing SET lease_expires_at=now()+interval '90 seconds',status='blocked';
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.authorize_download() IS NULL, 'blocked attempt denied');
RESET ROLE;
UPDATE libri.image_upload_processing SET status='leased';
UPDATE libri.image_upload_intents SET file_metadata=file_metadata||'{"mimeType":"image/jpeg"}';
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.authorize_download() IS NULL, 'path and declaration mismatch denied');
RESET ROLE;
UPDATE libri.image_upload_intents SET file_metadata=file_metadata||'{"mimeType":"image/png","byteSize":"1024"}';
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.authorize_download() IS NULL, 'invalid stored metadata denied');
RESET ROLE;
UPDATE libri.image_upload_intents SET file_metadata=file_metadata||'{"byteSize":1024}',status='reserved',submitted_at=NULL;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.authorize_download() IS NULL, 'unsubmitted intent denied');
RESET ROLE;
UPDATE libri.image_upload_intents SET status='awaiting_verification',submitted_at=now(),created_at=now()-interval '135 minutes',
	signing_deadline=now()-interval '125 minutes',expires_at=now();
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.authorize_download() IS NULL, 'reservation expiry independently enforced');
RESET ROLE;

SELECT pg_temp.assert_true(NOT EXISTS ((SELECT oid,relacl FROM pg_class WHERE oid IN (SELECT oid FROM shared_acl_before)
	EXCEPT SELECT * FROM shared_acl_before) UNION ALL (SELECT * FROM shared_acl_before EXCEPT SELECT oid,relacl FROM pg_class))
	AND NOT EXISTS ((SELECT oid,relacl FROM pg_class WHERE oid IN (SELECT oid FROM libri_acl_before)
	EXCEPT SELECT * FROM libri_acl_before) UNION ALL (SELECT * FROM libri_acl_before EXCEPT SELECT oid,relacl FROM pg_class))
	AND NOT EXISTS ((SELECT * FROM pg_policies EXCEPT SELECT * FROM policies_before)
	UNION ALL (SELECT * FROM policies_before EXCEPT SELECT * FROM pg_policies))
	AND NOT EXISTS ((SELECT * FROM storage.buckets EXCEPT SELECT * FROM buckets_before)
	UNION ALL (SELECT * FROM buckets_before EXCEPT SELECT * FROM storage.buckets)), 'table grants/policies/buckets unchanged');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM libri.images) AND NOT EXISTS (SELECT 1 FROM storage.objects), 'no images or bytes published');
-- Leave one current lease for the disposable overlapping-session runner.
UPDATE libri.image_upload_intents SET created_at=now(),signing_deadline=now()+interval '10 minutes',expires_at=now()+interval '135 minutes';
UPDATE libri.library_members SET role='owner';
SELECT 'upload download authorization contract passed' AS result;
