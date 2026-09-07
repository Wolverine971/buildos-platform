-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_images_private_storage_base.sql
\ir ../../scripts/database/provision-libri-worker-role.sql
\ir ../../scripts/database/provision-libri-frontend-reader-role.sql
GRANT USAGE ON SCHEMA libri TO libri_worker,libri_frontend_reader;
\ir ../migrations/20260906184227_libri_private_image_upload_admission.sql
\ir ../migrations/20260906201700_libri_upload_processing_leases.sql
\ir ../migrations/20260907015150_libri_upload_download_authorization.sql
CREATE TEMP TABLE old_acl AS SELECT oid,relacl,relrowsecurity,relforcerowsecurity FROM pg_class
	WHERE relnamespace IN ('libri'::regnamespace,'public'::regnamespace,'storage'::regnamespace,'auth'::regnamespace);
CREATE TEMP TABLE old_policies AS SELECT * FROM pg_policies;
CREATE TEMP TABLE old_buckets AS SELECT * FROM storage.buckets;
\ir ../migrations/20260907041707_libri_upload_publication_contract.sql

CREATE FUNCTION pg_temp.assert_true(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %',message; END IF; END;
$$;
CREATE FUNCTION pg_temp.expect_error(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	BEGIN EXECUTE statement;
	EXCEPTION WHEN OTHERS THEN
		IF SQLSTATE=expected THEN RETURN; END IF;
		RAISE EXCEPTION 'expected %, got %: %',expected,SQLSTATE,SQLERRM;
	END;
	RAISE EXCEPTION 'expected %, statement succeeded',expected;
END;
$$;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM libri.image_upload_publications)
	AND NOT EXISTS(SELECT 1 FROM libri.image_upload_controls),'migration creates no work or activation');
SELECT pg_temp.assert_true((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
	WHERE oid='libri.image_upload_publications'::regclass),'ledger enables and forces RLS');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='libri'::regnamespace
	AND proname IN ('lock_image_upload_publication','prepare_image_upload_publication','finalize_image_upload_publication')
	AND (prosecdef OR NOT proconfig @> ARRAY['search_path=pg_catalog, libri','lock_timeout=2s','statement_timeout=5s'])),'new RPCs use bounded invoker rights');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_proc p
	CROSS JOIN unnest(ARRAY['anon','authenticated','libri_worker','libri_frontend_reader']) role_name
	WHERE p.pronamespace='libri'::regnamespace
	AND p.proname IN ('lock_image_upload_publication','prepare_image_upload_publication','finalize_image_upload_publication')
	AND has_function_privilege(role_name,p.oid,'EXECUTE')),'worker/browser/reader cannot publish');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','libri_worker','libri_frontend_reader']) role_name
	WHERE has_table_privilege(role_name,'libri.image_upload_publications','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),'no raw ledger grant');
INSERT INTO auth.users(id) VALUES('11111111-1111-4111-8111-111111111111');
INSERT INTO libri.libraries(id,slug,name,created_by) VALUES
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','publication','Publication','11111111-1111-4111-8111-111111111111'),
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','other','Other','11111111-1111-4111-8111-111111111111');
INSERT INTO libri.library_members(library_id,user_id,role)
	SELECT id,'11111111-1111-4111-8111-111111111111','owner' FROM libri.libraries;
INSERT INTO libri.books(id,library_id,title) VALUES
	('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','Publication');
INSERT INTO libri.image_upload_controls(library_id,max_pending) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',1);
INSERT INTO libri.image_upload_intents(id,library_id,book_id,requested_by,idempotency_key,file_metadata,
	object_path,created_at,signing_deadline,expires_at,status,submitted_at)
VALUES('dddddddd-dddd-4ddd-8ddd-ddddddddddd1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','11111111-1111-4111-8111-111111111111','publication_fixture',
	'{"filename":"page.png","imageType":"page","mimeType":"image/png","byteSize":1024,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","description":"Source page"}',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/uploads/dddddddd-dddd-4ddd-8ddd-ddddddddddd1/original.png',
	now(),now()+interval '10 minutes',now()+interval '135 minutes','awaiting_verification',now());
CREATE FUNCTION pg_temp.verified() RETURNS jsonb LANGUAGE sql AS $$
	SELECT '{"mimeType":"image/png","byteSize":1024,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","width":32,"height":32,"channels":3}'::jsonb
$$;
CREATE FUNCTION pg_temp.prepare_publication(v jsonb DEFAULT pg_temp.verified(),token integer DEFAULT 1,attempt integer DEFAULT 1)
RETURNS jsonb LANGUAGE sql AS $$
	SELECT libri.prepare_image_upload_publication('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee'||token)::uuid,attempt,v)
$$;
CREATE FUNCTION pg_temp.finish_publication(object_id uuid DEFAULT 'ffffffff-ffff-4fff-8fff-fffffffffff1',
	v jsonb DEFAULT pg_temp.verified(),token integer DEFAULT 1,attempt integer DEFAULT 1)
RETURNS jsonb LANGUAGE sql AS $$
	SELECT libri.finalize_image_upload_publication('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee'||token)::uuid,attempt,
		(SELECT id FROM libri.image_upload_publications WHERE upload_id='dddddddd-dddd-4ddd-8ddd-ddddddddddd1' AND attempt=1),object_id,v)
$$;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.prepare_publication() IS NULL,'default-off refuses preparation');
SELECT pg_temp.expect_error('SELECT pg_temp.prepare_publication(NULL)','22023');
SELECT pg_temp.expect_error($q$SELECT pg_temp.prepare_publication('[]')$q$,'22023');
SELECT pg_temp.expect_error($q$SELECT pg_temp.prepare_publication(pg_temp.verified()||'{"width":16385}')$q$,'22023');
SELECT pg_temp.expect_error($q$SELECT pg_temp.prepare_publication(pg_temp.verified()||'{"width":16000,"height":16000}')$q$,'22023');
SELECT pg_temp.expect_error($q$SELECT pg_temp.prepare_publication(pg_temp.verified()||'{"byteSize":"1024"}')$q$,'22023');
SELECT pg_temp.expect_error($q$SELECT pg_temp.prepare_publication(pg_temp.verified()||'{"channels":5}')$q$,'22023');
SELECT pg_temp.expect_error($q$SELECT pg_temp.prepare_publication(pg_temp.verified()||'{"unexpected":true}')$q$,'22023');
RESET ROLE;
SET ROLE authenticated;
SELECT pg_temp.expect_error('SELECT pg_temp.prepare_publication()','42501');
SELECT pg_temp.expect_error('SELECT * FROM libri.image_upload_publications','42501');
RESET ROLE;
SET ROLE libri_worker;
SELECT pg_temp.expect_error('SELECT pg_temp.prepare_publication()','42501');
SELECT pg_temp.expect_error('SELECT * FROM libri.image_upload_publications','42501');
RESET ROLE;
UPDATE libri.image_upload_controls SET admission_enabled=true,processing_enabled=true;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.prepare_publication() IS NULL,'unclaimed intent cannot prepare');
RESET ROLE;
SET ROLE libri_worker;
SELECT libri.claim_image_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','dddddddd-dddd-4ddd-8ddd-ddddddddddd1','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1');
RESET ROLE;
CREATE TEMP TABLE lease_before AS SELECT * FROM libri.image_upload_processing;
SET ROLE service_role;
SELECT pg_temp.expect_error($q$SELECT pg_temp.prepare_publication(pg_temp.verified()||'{"byteSize":1000}')$q$,'22023');
SELECT pg_temp.assert_true(pg_temp.prepare_publication()->>'status'='prepared','preparation succeeds');
SELECT pg_temp.assert_true(pg_temp.prepare_publication()->>'object_path'=
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/images/'||(pg_temp.prepare_publication()->>'publication_id')||'/original.png','SQL chooses exact canonical path');
SELECT pg_temp.assert_true(pg_temp.prepare_publication(pg_temp.verified(),2,1) IS NULL
	AND pg_temp.prepare_publication(pg_temp.verified(),1,2) IS NULL,'token and attempt fenced');
SELECT pg_temp.assert_true(libri.prepare_image_upload_publication('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
	'dddddddd-dddd-4ddd-8ddd-ddddddddddd1','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',1,pg_temp.verified()) IS NULL,'cross-library refused');
SELECT pg_temp.expect_error($q$SELECT pg_temp.prepare_publication(pg_temp.verified()||'{"width":31}')$q$,'22023');
SELECT pg_temp.expect_error('SELECT pg_temp.finish_publication(NULL)','22023');
SELECT pg_temp.expect_error($q$SELECT pg_temp.finish_publication('ffffffff-ffff-4fff-8fff-fffffffffff1',pg_temp.verified()||'{"width":31}')$q$,'22023');
SELECT pg_temp.assert_true(pg_temp.finish_publication('ffffffff-ffff-4fff-8fff-fffffffffff1',pg_temp.verified(),2,1) IS NULL,'wrong token cannot finish');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM libri.image_upload_publications)
	AND NOT EXISTS(SELECT 1 FROM libri.images) AND NOT EXISTS(SELECT 1 FROM libri.sources),'preparation is durable, idempotent, unpublished');
SELECT pg_temp.assert_true(NOT EXISTS((SELECT * FROM libri.image_upload_processing EXCEPT SELECT * FROM lease_before)
	UNION ALL (SELECT * FROM lease_before EXCEPT SELECT * FROM libri.image_upload_processing)),'preparation does not extend or mutate lease');
UPDATE libri.library_members SET role='viewer';
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.finish_publication() IS NULL,'revocation refuses finalization');
RESET ROLE;
UPDATE libri.library_members SET role='owner';
UPDATE libri.image_upload_controls SET processing_enabled=false;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.finish_publication() IS NULL,'processing disable refuses finalization');
RESET ROLE;
UPDATE libri.image_upload_controls SET processing_enabled=true,admission_enabled=false;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.finish_publication() IS NULL,'admission disable refuses finalization');
RESET ROLE;
UPDATE libri.image_upload_controls SET admission_enabled=true;
UPDATE libri.image_upload_processing SET lease_expires_at=clock_timestamp()-interval '1 second';
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.finish_publication() IS NULL,'expired lease refuses new publication');
RESET ROLE;
UPDATE libri.image_upload_processing SET lease_expires_at=clock_timestamp()+interval '90 seconds',attempt=2;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.finish_publication() IS NULL,'replacement generation refuses old publication');
RESET ROLE;
UPDATE libri.image_upload_processing SET attempt=1;
-- Simulate a caller's SQL transaction failing after finalization.
BEGIN;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.finish_publication()->>'already_published'='false','first publication inside transaction');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM libri.images) AND (SELECT count(*)=1 FROM libri.sources)
	AND (SELECT count(*)=1 FROM libri.source_book_links)
	AND (SELECT followup_status='pending' FROM libri.image_upload_publications),'image/source/link/outbox commit together');
ROLLBACK;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM libri.images) AND NOT EXISTS(SELECT 1 FROM libri.sources)
	AND (SELECT status='prepared' FROM libri.image_upload_publications)
	AND (SELECT status='leased' FROM libri.image_upload_processing),'rollback leaves durable prepared intent, no partial publication');
-- Existing conflicting provenance must not be overwritten or adopted.
INSERT INTO libri.sources(library_id,source_type,source_key,title)
VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','scanned_image','upload:dddddddd-dddd-4ddd-8ddd-ddddddddddd1','Collision');
SET ROLE service_role;
SELECT pg_temp.expect_error('SELECT pg_temp.finish_publication()','23505');
RESET ROLE;
DELETE FROM libri.sources WHERE title='Collision';
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.finish_publication()->>'already_published'='false','successful atomic publication');
SELECT pg_temp.assert_true(pg_temp.finish_publication()->>'already_published'='true','unknown commit retry resolves exact published receipt');
RESET ROLE;
CREATE TEMP TABLE published_before AS SELECT * FROM libri.image_upload_publications;
CREATE TEMP TABLE processing_after AS SELECT * FROM libri.image_upload_processing;
UPDATE libri.library_members SET role='viewer';
UPDATE libri.image_upload_controls SET processing_enabled=false;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.finish_publication()->>'already_published'='true','already committed acknowledgement survives revocation; not new authority');
SELECT pg_temp.expect_error($q$SELECT pg_temp.finish_publication('ffffffff-ffff-4fff-8fff-fffffffffff2')$q$,'22023');
RESET ROLE;
UPDATE libri.library_members SET role='owner';
UPDATE libri.image_upload_controls SET processing_enabled=true;
SET ROLE libri_worker;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT * FROM libri.list_image_upload_candidates('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')),'published not discoverable for processing');
SELECT pg_temp.assert_true(libri.claim_image_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'dddddddd-dddd-4ddd-8ddd-ddddddddddd1','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1') IS NULL,'same-token claim cannot revive publication');
SELECT pg_temp.assert_true(libri.claim_image_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'dddddddd-dddd-4ddd-8ddd-ddddddddddd1','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2') IS NULL,'new-token claim cannot revive publication');
SELECT pg_temp.assert_true(libri.fail_image_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'dddddddd-dddd-4ddd-8ddd-ddddddddddd1','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',1,'invalid_image')=false,'failure cannot overwrite publication');
RESET ROLE;
SELECT pg_temp.assert_true(NOT EXISTS((SELECT * FROM libri.image_upload_publications EXCEPT SELECT * FROM published_before)
	UNION ALL (SELECT * FROM published_before EXCEPT SELECT * FROM libri.image_upload_publications)),'retries never mutate publication receipt');
SELECT pg_temp.assert_true(NOT EXISTS((SELECT * FROM libri.image_upload_processing EXCEPT SELECT * FROM processing_after)
	UNION ALL (SELECT * FROM processing_after EXCEPT SELECT * FROM libri.image_upload_processing)),'worker retries never mutate completed work');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT pg_temp.expect_error($q$SELECT libri.reserve_image_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','next_publication_fixture',
	'{"filename":"other.png","imageType":"page","mimeType":"image/png","byteSize":1024,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}')$q$,'53000');
RESET ROLE;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM storage.objects),'SQL never creates Storage objects');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM old_acl a JOIN pg_class c USING(oid)
	WHERE a.relacl IS DISTINCT FROM c.relacl OR a.relrowsecurity<>c.relrowsecurity OR a.relforcerowsecurity<>c.relforcerowsecurity),'preexisting table ACL/RLS unchanged');
SELECT pg_temp.assert_true(NOT EXISTS((SELECT * FROM pg_policies EXCEPT SELECT * FROM old_policies)
	UNION ALL(SELECT * FROM old_policies EXCEPT SELECT * FROM pg_policies)),'no new or changed Storage/public/browser policies');
SELECT pg_temp.assert_true(NOT EXISTS((SELECT * FROM storage.buckets EXCEPT SELECT * FROM old_buckets)
	UNION ALL(SELECT * FROM old_buckets EXCEPT SELECT * FROM storage.buckets)),'bucket unchanged');
