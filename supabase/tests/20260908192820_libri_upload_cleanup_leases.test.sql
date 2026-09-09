-- supabase/tests/20260908192820_libri_upload_cleanup_leases.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_upload_retirement_base.sql
CREATE TEMP TABLE cleanup_old_acl AS SELECT oid,relacl,relrowsecurity,relforcerowsecurity FROM pg_class
 WHERE relnamespace IN ('libri'::regnamespace,'public'::regnamespace,'storage'::regnamespace,'auth'::regnamespace);
\ir ../migrations/20260908192820_libri_upload_cleanup_leases.sql
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM libri.image_upload_cleanup_checks)
 AND NOT EXISTS(SELECT 1 FROM libri.image_upload_controls WHERE cleanup_enabled),'cleanup remains default-off and empty');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM cleanup_old_acl b JOIN pg_class p USING(oid)
 WHERE p.relacl IS DISTINCT FROM b.relacl OR p.relrowsecurity<>b.relrowsecurity OR p.relforcerowsecurity<>b.relforcerowsecurity),'existing ACL and RLS unchanged');
SELECT pg_temp.assert_true((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='libri.image_upload_cleanup_checks'::regclass),'checks force RLS');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='libri'::regnamespace
 AND proname IN ('lock_image_upload_cleanup','list_image_upload_cleanup_candidates','claim_image_upload_cleanup','authorize_image_upload_cleanup','finish_image_upload_cleanup')
 AND (prosecdef OR NOT proconfig @> ARRAY['search_path=pg_catalog, libri','lock_timeout=2s','statement_timeout=5s'])),'new cleanup APIs are bounded invokers');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','libri_worker','libri_frontend_reader']) role_name
 CROSS JOIN pg_proc p WHERE p.pronamespace='libri'::regnamespace
 AND p.proname IN ('lock_image_upload_cleanup','list_image_upload_cleanup_candidates','claim_image_upload_cleanup','authorize_image_upload_cleanup','finish_image_upload_cleanup')
 AND has_function_privilege(role_name,p.oid,'EXECUTE')),'only service can clean up');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','libri_worker','libri_frontend_reader']) role_name
 WHERE has_table_privilege(role_name,'libri.image_upload_cleanup_checks','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),'no browser/worker raw checks');
SELECT pg_temp.assert_true(NOT has_table_privilege('service_role','libri.image_upload_cleanup_checks','DELETE,TRUNCATE'),'cleanup receipts cannot be erased by service');

SET ROLE service_role;
SELECT pg_temp.prepare_publication();
RESET ROLE;
SELECT pg_temp.expire_retirement_fixture();
SET ROLE service_role;
SELECT pg_temp.retire_upload();
RESET ROLE;
CREATE FUNCTION pg_temp.cleanup_target() RETURNS uuid LANGUAGE sql AS $$
 SELECT id FROM libri.image_upload_cleanup_targets WHERE kind='staging'
$$;
CREATE FUNCTION pg_temp.cleanup_claim(token integer DEFAULT 1) RETURNS jsonb LANGUAGE sql AS $$
 SELECT libri.claim_image_upload_cleanup('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',pg_temp.cleanup_target(),
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc'||token)::uuid)
$$;
CREATE FUNCTION pg_temp.cleanup_authorize(token integer DEFAULT 1,generation integer DEFAULT 1) RETURNS jsonb LANGUAGE sql AS $$
 SELECT libri.authorize_image_upload_cleanup('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',pg_temp.cleanup_target(),
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc'||token)::uuid,generation)
$$;
CREATE FUNCTION pg_temp.cleanup_finish(outcome text DEFAULT 'absent',token integer DEFAULT 1,generation integer DEFAULT 1) RETURNS boolean LANGUAGE sql AS $$
 SELECT libri.finish_image_upload_cleanup('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',pg_temp.cleanup_target(),
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc'||token)::uuid,generation,outcome)
$$;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.cleanup_claim() IS NULL,'disabled cleanup refuses claims');
RESET ROLE;
UPDATE libri.image_upload_controls SET cleanup_enabled=true;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.cleanup_claim() IS NULL,'early inspection is not authorized');
RESET ROLE;
UPDATE libri.image_upload_retirements SET retired_at=statement_timestamp()-interval '28 hours',inspect_after=statement_timestamp()-interval '1 hour';
SET ROLE service_role;
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM libri.list_image_upload_cleanup_candidates('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')),'eligible targets discovered');
SELECT pg_temp.assert_true(pg_temp.cleanup_claim()->>'generation'='1','first cleanup generation');
SELECT pg_temp.assert_true(pg_temp.cleanup_claim()->>'object_path'=(SELECT object_path FROM libri.image_upload_intents),'claim uses exact stored path');
SELECT pg_temp.assert_true(pg_temp.cleanup_authorize()->>'generation'='1','same live fence authorizes');
SELECT pg_temp.assert_true(pg_temp.cleanup_authorize(2,1) IS NULL AND pg_temp.cleanup_authorize(1,2) IS NULL,'wrong token/generation refused');
SELECT pg_temp.assert_true(libri.authorize_image_upload_cleanup('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',pg_temp.cleanup_target(),
 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',1) IS NULL,'cross-library cleanup refused');
SELECT pg_temp.assert_true(libri.claim_image_upload_cleanup('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
 (SELECT id FROM libri.image_upload_cleanup_targets WHERE kind='unpublished'),'cccccccc-cccc-4ccc-8ccc-ccccccccccc2') IS NULL,'one active cleanup per library');
SELECT pg_temp.assert_true(pg_temp.cleanup_claim(2) IS NULL,'new token cannot steal lease');
RESET ROLE;
CREATE TEMP TABLE cleanup_lease_before AS SELECT * FROM libri.image_upload_cleanup_checks;
SELECT pg_temp.expect_error($q$UPDATE libri.image_upload_cleanup_checks SET status='absent',observed_at=clock_timestamp(),last_outcome=NULL$q$,'23514');
SELECT pg_temp.expect_error($q$UPDATE libri.image_upload_cleanup_checks SET status='retry_wait',observed_at=clock_timestamp(),last_outcome=NULL$q$,'23514');
SET ROLE service_role;
SELECT pg_temp.cleanup_claim();
RESET ROLE;
SELECT pg_temp.assert_true(NOT EXISTS((SELECT * FROM libri.image_upload_cleanup_checks EXCEPT SELECT * FROM cleanup_lease_before)
 UNION ALL(SELECT * FROM cleanup_lease_before EXCEPT SELECT * FROM libri.image_upload_cleanup_checks)),'same-token retry does not extend deadline');
UPDATE libri.image_upload_controls SET cleanup_enabled=false;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.cleanup_authorize() IS NULL AND NOT pg_temp.cleanup_finish(),'kill switch blocks authorization/settlement');
RESET ROLE;
UPDATE libri.image_upload_controls SET cleanup_enabled=true;
BEGIN;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.cleanup_finish(),'absence can settle inside transaction');
ROLLBACK;
SELECT pg_temp.assert_true((SELECT status='leased' FROM libri.image_upload_cleanup_checks),'failed settlement transaction leaves live lease');
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.cleanup_finish('unavailable'),'provider failure settles with retry delay');
SELECT pg_temp.assert_true(pg_temp.cleanup_finish('unavailable') AND NOT pg_temp.cleanup_finish('absent'),'only identical settled outcome acknowledges');
SELECT pg_temp.assert_true(pg_temp.cleanup_claim() IS NULL AND pg_temp.cleanup_claim(2) IS NULL,'settled token/backoff cannot claim again');
SELECT pg_temp.assert_true((SELECT status='retry_wait' AND next_check_at>=observed_at+interval '10 minutes' FROM libri.image_upload_cleanup_checks),'bounded retry delay');
RESET ROLE;
UPDATE libri.image_upload_cleanup_checks SET next_check_at=statement_timestamp()-interval '1 second';
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.cleanup_claim(2)->>'generation'='2','fresh token advances generation');
SELECT pg_temp.assert_true(NOT pg_temp.cleanup_finish('absent',1,1),'stale completion fenced');
RESET ROLE;
UPDATE libri.image_upload_cleanup_checks SET lease_expires_at=statement_timestamp()-interval '1 second';
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.cleanup_authorize(2,2) IS NULL AND NOT pg_temp.cleanup_finish('absent',2,2),'expired lease cannot authorize or settle');
SELECT pg_temp.assert_true(pg_temp.cleanup_claim(3)->>'generation'='3','crashed lease recoverable with next token');
SELECT pg_temp.assert_true(pg_temp.cleanup_finish('absent',3,3),'verified absence settles');
SELECT pg_temp.assert_true((SELECT next_check_at=observed_at+interval '24 hours' FROM libri.image_upload_cleanup_checks),'absent targets scheduled for another scan');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM libri.image_upload_cleanup_targets)
 AND (SELECT count(*)=1 FROM libri.image_upload_retirements)
 AND (SELECT status='cleanup_pending' FROM libri.image_upload_intents),'absence does not erase tombstones or release quota');
RESET ROLE;
-- A late upload can arrive after an absence receipt. The retained target can be
-- re-leased; no assumption of permanent absence or token revocation is made.
UPDATE libri.image_upload_cleanup_checks SET next_check_at=statement_timestamp()-interval '1 second';
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.cleanup_claim(4)->>'generation'='4','late-arrival sweep retains same target');
SELECT pg_temp.assert_true(pg_temp.cleanup_authorize(4,4) IS NOT NULL,'new sweep authorized');
SELECT pg_temp.expect_error($q$SELECT pg_temp.cleanup_finish('deleted',4,4)$q$,'22023');
RESET ROLE;
SET ROLE authenticated;
SELECT pg_temp.expect_error('SELECT pg_temp.cleanup_claim()','42501');
RESET ROLE;
SET ROLE libri_worker;
SELECT pg_temp.expect_error('SELECT * FROM libri.image_upload_cleanup_checks','42501');
RESET ROLE;
-- Fake canonical adoption must invalidate a previously live cleanup lease.
INSERT INTO libri.sources(id,library_id,source_type,source_key,title)
 SELECT id,library_id,'scanned_image','adopted','Adopted' FROM libri.image_upload_publications;
INSERT INTO libri.images(id,library_id,book_id,source_id,bucket_id,object_path,original_filename,mime_type,byte_size,content_sha256,image_type)
 SELECT p.id,p.library_id,p.book_id,p.id,'libri-assets',i.object_path,'page.png','image/png',1024,repeat('a',64),'page'
 FROM libri.image_upload_publications p JOIN libri.image_upload_intents i ON i.id=p.upload_id;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.cleanup_authorize(4,4) IS NULL AND NOT pg_temp.cleanup_finish('absent',4,4),'canonical ownership invalidates live cleanup');
SELECT pg_temp.assert_true(libri.lock_image_upload_cleanup('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
 (SELECT id FROM libri.image_upload_cleanup_targets WHERE kind='unpublished')) IS NULL,'unpublished source adoption also refuses cleanup');
RESET ROLE;
DELETE FROM libri.images;
DELETE FROM libri.source_book_links;
DELETE FROM libri.sources;
-- Final baseline for the real concurrency runner.
DELETE FROM libri.image_upload_cleanup_checks;
\ir 20260908192820_libri_upload_cleanup_leases.production_verify.sql
