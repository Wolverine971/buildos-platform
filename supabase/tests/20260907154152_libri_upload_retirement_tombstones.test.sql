-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_upload_publication_contract_base.sql
\ir ../migrations/20260907043724_libri_upload_claim_deadline_refresh.sql
CREATE TEMP TABLE retirement_reserve_before AS SELECT prosrc,proacl,proowner,proconfig,prosecdef
 FROM pg_proc WHERE oid='libri.reserve_image_upload(uuid,uuid,text,jsonb)'::regprocedure;
CREATE TEMP TABLE retirement_acl_before AS SELECT oid,relacl,relrowsecurity,relforcerowsecurity
 FROM pg_class WHERE relnamespace IN ('libri'::regnamespace,'public'::regnamespace,'storage'::regnamespace,'auth'::regnamespace);
CREATE TEMP TABLE retirement_intents_before AS SELECT * FROM libri.image_upload_intents;
CREATE TEMP TABLE retirement_work_before AS SELECT * FROM libri.image_upload_processing;
CREATE TEMP TABLE retirement_publications_before AS SELECT * FROM libri.image_upload_publications;
CREATE TEMP TABLE retirement_images_before AS SELECT * FROM libri.images;
CREATE TEMP TABLE retirement_storage_before AS SELECT * FROM storage.objects;
\ir ../migrations/20260907154152_libri_upload_retirement_tombstones.sql
\ir 20260907154152_libri_upload_retirement_tombstones.production_verify.sql

SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM libri.image_upload_retirements)
 AND NOT EXISTS(SELECT 1 FROM libri.image_upload_cleanup_targets),'migration does not start cleanup');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM retirement_acl_before b JOIN pg_class p USING(oid)
 WHERE p.relacl IS DISTINCT FROM b.relacl OR p.relrowsecurity<>b.relrowsecurity OR p.relforcerowsecurity<>b.relforcerowsecurity),'existing ACL/RLS unchanged');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM retirement_reserve_before b CROSS JOIN pg_proc p
 WHERE p.oid='libri.reserve_image_upload(uuid,uuid,text,jsonb)'::regprocedure
 AND (p.proacl IS DISTINCT FROM b.proacl OR p.proowner<>b.proowner OR p.proconfig IS DISTINCT FROM b.proconfig
 OR p.prosecdef<>b.prosecdef OR p.prosrc<>replace(b.prosrc,
  'item.status IN (''reserved'', ''awaiting_verification'')',
  'item.status IN (''reserved'', ''awaiting_verification'', ''cleanup_pending'')'))),'reserve changes only quota predicate; privileges unchanged');
SELECT pg_temp.assert_true(NOT EXISTS((SELECT * FROM libri.image_upload_intents EXCEPT SELECT * FROM retirement_intents_before)
 UNION ALL (SELECT * FROM retirement_intents_before EXCEPT SELECT * FROM libri.image_upload_intents)),'no intent backfill');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_class WHERE oid IN
 ('libri.image_upload_retirements'::regclass,'libri.image_upload_cleanup_targets'::regclass)
 AND NOT (relrowsecurity AND relforcerowsecurity)),'new tables enable and force RLS');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='libri'
 AND tablename IN ('image_upload_retirements','image_upload_cleanup_targets')),'no browser policies');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='libri'::regnamespace
 AND proname IN ('retire_image_upload','list_image_upload_retirement_candidates')
 AND (prosecdef OR NOT proconfig @> ARRAY['search_path=pg_catalog, libri','lock_timeout=2s','statement_timeout=5s'])),'bounded invoker RPCs');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_proc p
 CROSS JOIN unnest(ARRAY['anon','authenticated','libri_worker','libri_frontend_reader']) role_name
 WHERE p.pronamespace='libri'::regnamespace AND p.proname IN ('retire_image_upload','list_image_upload_retirement_candidates')
 AND has_function_privilege(role_name,p.oid,'EXECUTE')),'no browser/worker/reader retirement authority');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','libri_worker','libri_frontend_reader']) role_name
 CROSS JOIN unnest(ARRAY['libri.image_upload_retirements','libri.image_upload_cleanup_targets']) relation
 WHERE has_table_privilege(role_name,relation,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),'no raw table access');
SELECT pg_temp.assert_true(NOT has_table_privilege('service_role','libri.image_upload_retirements','UPDATE,DELETE,TRUNCATE')
 AND NOT has_table_privilege('service_role','libri.image_upload_cleanup_targets','UPDATE,DELETE,TRUNCATE'),'service cannot erase or rewrite tombstones');

CREATE FUNCTION pg_temp.retire_upload() RETURNS jsonb LANGUAGE sql AS $$
 SELECT libri.retire_image_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','dddddddd-dddd-4ddd-8ddd-ddddddddddd1')
$$;
-- The inherited fixture is published: recover a lost success response while controls
-- are off and membership is revoked, without altering a single canonical row.
UPDATE libri.library_members SET role='viewer';
UPDATE libri.image_upload_controls SET admission_enabled=false,processing_enabled=false;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.retire_upload()->>'outcome'='published','lost success recovered after revocation/disable');
SELECT pg_temp.assert_true(pg_temp.retire_upload()->>'target_count'='1','published upload only retains staging cleanup target');
SELECT pg_temp.assert_true((SELECT protected_publication_id FROM libri.image_upload_retirements)=(SELECT id FROM libri.image_upload_publications),'committed identity protected');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM libri.image_upload_cleanup_targets t JOIN libri.images i
 ON i.bucket_id='libri-assets' AND i.object_path=t.object_path),'no published bytes targeted');
SELECT pg_temp.assert_true((SELECT inspect_after=retired_at+interval '27 hours' AND inspect_after>clock_timestamp()+interval '26 hours' FROM libri.image_upload_retirements),'inspection delay starts at retirement, not preparation');
SELECT pg_temp.assert_true(pg_temp.finish_publication()->>'already_published'='true','published acknowledgement still works after retirement');
SELECT pg_temp.assert_true(libri.retire_image_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','dddddddd-dddd-4ddd-8ddd-ddddddddddd1') IS NULL,'cross-library retirement denied');
SELECT pg_temp.expect_error('SELECT libri.retire_image_upload(NULL,NULL)','22023');
RESET ROLE;
CREATE TEMP TABLE retirement_receipt_before AS SELECT * FROM libri.image_upload_retirements;
CREATE TEMP TABLE retirement_targets_before AS SELECT * FROM libri.image_upload_cleanup_targets;
SET ROLE service_role;
SELECT pg_temp.retire_upload();
SELECT pg_temp.expect_error('DELETE FROM libri.image_upload_cleanup_targets','42501');
SELECT pg_temp.expect_error('UPDATE libri.image_upload_retirements SET retired_at=clock_timestamp()','42501');
RESET ROLE;
SELECT pg_temp.assert_true(NOT EXISTS((SELECT * FROM libri.image_upload_retirements EXCEPT SELECT * FROM retirement_receipt_before)
 UNION ALL (SELECT * FROM retirement_receipt_before EXCEPT SELECT * FROM libri.image_upload_retirements)),'retry does not refresh inspection deadline');
SELECT pg_temp.assert_true(NOT EXISTS((SELECT * FROM libri.image_upload_cleanup_targets EXCEPT SELECT * FROM retirement_targets_before)
 UNION ALL (SELECT * FROM retirement_targets_before EXCEPT SELECT * FROM libri.image_upload_cleanup_targets)),'retry reuses exact target IDs');
SELECT pg_temp.assert_true(NOT EXISTS((SELECT * FROM libri.image_upload_processing EXCEPT SELECT * FROM retirement_work_before)
 UNION ALL (SELECT * FROM retirement_work_before EXCEPT SELECT * FROM libri.image_upload_processing)),'processing unchanged by retirement');
SELECT pg_temp.assert_true(NOT EXISTS((SELECT * FROM libri.image_upload_publications EXCEPT SELECT * FROM retirement_publications_before)
 UNION ALL (SELECT * FROM retirement_publications_before EXCEPT SELECT * FROM libri.image_upload_publications)),'publication/outbox unchanged');
SELECT pg_temp.assert_true(NOT EXISTS((SELECT * FROM libri.images EXCEPT SELECT * FROM retirement_images_before)
 UNION ALL (SELECT * FROM retirement_images_before EXCEPT SELECT * FROM libri.images)),'canonical images unchanged');
SELECT pg_temp.assert_true(NOT EXISTS((SELECT * FROM storage.objects EXCEPT SELECT * FROM retirement_storage_before)
 UNION ALL (SELECT * FROM retirement_storage_before EXCEPT SELECT * FROM storage.objects)),'Storage metadata untouched');
UPDATE libri.library_members SET role='owner';
UPDATE libri.image_upload_controls SET admission_enabled=true,processing_enabled=true;
SET ROLE libri_worker;
SELECT pg_temp.assert_true(libri.claim_image_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2') IS NULL,'retired cannot be reclaimed');
SELECT pg_temp.expect_error('SELECT pg_temp.retire_upload()','42501');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT pg_temp.expect_error($q$SELECT libri.reserve_image_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','another_reservation',
 '{"filename":"page.png","imageType":"page","mimeType":"image/png","byteSize":1024,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}')$q$,'53000');
SELECT pg_temp.expect_error($q$SELECT libri.submit_image_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1')$q$,'22023');
SELECT pg_temp.expect_error('SELECT pg_temp.retire_upload()','42501');
RESET ROLE;

CREATE FUNCTION pg_temp.reset_retirement_fixture() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 DELETE FROM libri.image_upload_cleanup_targets;
 DELETE FROM libri.image_upload_retirements;
 DELETE FROM libri.image_upload_publications;
 DELETE FROM libri.images;
 DELETE FROM libri.source_book_links;
 DELETE FROM libri.sources;
 UPDATE libri.image_upload_intents SET status='awaiting_verification',submitted_at=statement_timestamp(),created_at=statement_timestamp(),
  signing_deadline=statement_timestamp()+interval '10 minutes',expires_at=statement_timestamp()+interval '135 minutes';
 INSERT INTO libri.image_upload_processing(upload_id,status,attempt,lease_token,lease_expires_at,available_at,updated_at)
 VALUES('dddddddd-dddd-4ddd-8ddd-ddddddddddd1','leased',1,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
  statement_timestamp()+interval '90 seconds',statement_timestamp(),statement_timestamp())
 ON CONFLICT(upload_id) DO UPDATE SET status='leased',attempt=1,lease_token=excluded.lease_token,
  lease_expires_at=excluded.lease_expires_at,last_failure=NULL;
 UPDATE libri.image_upload_controls SET admission_enabled=true,processing_enabled=true;
 UPDATE libri.library_members SET role='owner';
END;
$$;
CREATE FUNCTION pg_temp.expire_retirement_fixture() RETURNS void LANGUAGE sql AS $$
 UPDATE libri.image_upload_intents SET created_at=statement_timestamp()-interval '3 hours',
 signing_deadline=statement_timestamp()-interval '170 minutes',expires_at=statement_timestamp()-interval '45 minutes';
$$;
SELECT pg_temp.reset_retirement_fixture();
SET ROLE service_role;
SELECT pg_temp.prepare_publication();
SELECT pg_temp.assert_true(pg_temp.retire_upload() IS NULL,'active unpublished upload is never retired');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT * FROM libri.list_image_upload_retirement_candidates('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')),'active upload not a candidate');
RESET ROLE;
SELECT pg_temp.expire_retirement_fixture();
BEGIN;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.retire_upload()->>'outcome'='expired','expired publication can retire');
ROLLBACK;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM libri.image_upload_retirements)
 AND NOT EXISTS(SELECT 1 FROM libri.image_upload_cleanup_targets)
 AND (SELECT status='awaiting_verification' FROM libri.image_upload_intents),'retirement rollback is all-or-nothing');
SET ROLE service_role;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM libri.list_image_upload_retirement_candidates('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')),'expired candidate discovered');
SELECT pg_temp.assert_true(pg_temp.retire_upload()->>'target_count'='2','expired prepared upload retains staging and canonical target');
SELECT pg_temp.assert_true(pg_temp.retire_upload()->'protected_publication_id'='null'::jsonb,'no fabricated committed receipt');
SELECT pg_temp.assert_true(pg_temp.finish_publication() IS NULL AND pg_temp.prepare_publication() IS NULL,'retired cannot publish or prepare');
SELECT pg_temp.assert_true(libri.authorize_image_upload_download('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',1) IS NULL,'retired cannot download');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT * FROM libri.list_image_upload_retirement_candidates('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')),'retired omitted from discovery');
RESET ROLE;
SELECT pg_temp.expect_error($q$DELETE FROM auth.users WHERE id='11111111-1111-4111-8111-111111111111'$q$,'23503');
SELECT pg_temp.expect_error('DELETE FROM libri.image_upload_intents','23503');
SELECT pg_temp.expect_error('DELETE FROM libri.books','23503');

-- Unknown/mismatched ownership fails closed, never creates destructive authority.
SELECT pg_temp.reset_retirement_fixture();
SET ROLE service_role;
SELECT pg_temp.prepare_publication();
SELECT pg_temp.finish_publication();
RESET ROLE;
UPDATE libri.images SET content_sha256=repeat('b',64);
SET ROLE service_role;
SELECT pg_temp.expect_error('SELECT pg_temp.retire_upload()','55000');
RESET ROLE;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM libri.image_upload_retirements),'ownership conflict does not partially retire');
UPDATE libri.images SET content_sha256=repeat('a',64);
UPDATE libri.image_upload_processing SET status='blocked';
SET ROLE service_role;
SELECT pg_temp.expect_error('SELECT pg_temp.retire_upload()','55000');
RESET ROLE;
SELECT pg_temp.reset_retirement_fixture();
SET ROLE service_role;
SELECT pg_temp.prepare_publication();
RESET ROLE;
SELECT pg_temp.expire_retirement_fixture();
INSERT INTO libri.sources(id,library_id,source_type,source_key,title)
 SELECT id,library_id,'scanned_image','conflicting-provenance','Conflict' FROM libri.image_upload_publications;
SET ROLE service_role;
SELECT pg_temp.expect_error('SELECT pg_temp.retire_upload()','55000');
RESET ROLE;
SELECT pg_temp.reset_retirement_fixture();
DELETE FROM libri.image_upload_processing;
UPDATE libri.image_upload_intents SET status='reserved',submitted_at=NULL;
SELECT pg_temp.expire_retirement_fixture();
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.retire_upload()->>'target_count'='1','never-submitted reservation retains its staging tombstone');
RESET ROLE;
-- Three attempts must retain every unpublished path, never the committed winner.
SELECT pg_temp.reset_retirement_fixture();
SET ROLE service_role;
SELECT pg_temp.prepare_publication();
RESET ROLE;
UPDATE libri.image_upload_processing SET attempt=2,lease_token='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
SET ROLE service_role;
SELECT pg_temp.prepare_publication(pg_temp.verified(),2,2);
RESET ROLE;
UPDATE libri.image_upload_processing SET attempt=3,lease_token='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3';
SET ROLE service_role;
SELECT pg_temp.prepare_publication(pg_temp.verified(),3,3);
SELECT libri.finalize_image_upload_publication('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3',3,
 (SELECT id FROM libri.image_upload_publications WHERE attempt=3),'ffffffff-ffff-4fff-8fff-fffffffffff3',pg_temp.verified());
SELECT pg_temp.assert_true(pg_temp.retire_upload()->>'target_count'='3','staging plus two abandoned attempts retained');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM libri.image_upload_cleanup_targets target
 JOIN libri.image_upload_publications publication ON publication.id=target.publication_id
 WHERE publication.status='published'),'committed third attempt excluded');
RESET ROLE;
SELECT pg_temp.reset_retirement_fixture();
-- An existing canonical image on the staging path is a conflict, not garbage.
SET ROLE service_role;
SELECT pg_temp.prepare_publication();
SELECT pg_temp.finish_publication();
RESET ROLE;
UPDATE libri.images SET object_path=(SELECT object_path FROM libri.image_upload_intents);
SET ROLE service_role;
SELECT pg_temp.expect_error('SELECT pg_temp.retire_upload()','55000');
RESET ROLE;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM libri.image_upload_retirements),'canonical staging collision creates no tombstone');
SELECT pg_temp.reset_retirement_fixture();
-- The scanner is fixed-size and library-scoped even with malformed admin-loaded backlog.
INSERT INTO libri.image_upload_intents(id,library_id,book_id,requested_by,idempotency_key,file_metadata,
 object_path,created_at,signing_deadline,expires_at)
SELECT id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
 '11111111-1111-4111-8111-111111111111','retirement_backlog_'||n,'{}'::jsonb,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/uploads/'||id::text||'/original.png',
 statement_timestamp()-interval '3 hours',statement_timestamp()-interval '170 minutes',statement_timestamp()-interval '45 minutes'
FROM (SELECT n,gen_random_uuid() id FROM generate_series(1,30) n) fixture;
SET ROLE service_role;
SELECT pg_temp.assert_true((SELECT count(*)=25 FROM libri.list_image_upload_retirement_candidates('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')),'candidate discovery bounded to 25');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT * FROM libri.list_image_upload_retirement_candidates('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2')),'scanner library scoped');
RESET ROLE;
DELETE FROM libri.image_upload_intents WHERE idempotency_key LIKE 'retirement_backlog_%';
-- Restore a fresh single-upload fixture for observed concurrency cases.
SELECT pg_temp.reset_retirement_fixture();
UPDATE libri.image_upload_intents SET submitted_at=statement_timestamp();
