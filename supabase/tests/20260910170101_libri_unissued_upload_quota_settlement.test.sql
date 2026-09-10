-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_upload_issuance_base.sql
CREATE TEMP TABLE quota_old_acl AS SELECT oid,relacl,relrowsecurity,relforcerowsecurity FROM pg_class
 WHERE relnamespace IN ('libri'::regnamespace,'public'::regnamespace,'storage'::regnamespace,'auth'::regnamespace);
CREATE TEMP TABLE quota_old_routines AS SELECT oid,prosrc,proacl,proowner,proconfig,prosecdef FROM pg_proc
 WHERE pronamespace IN ('libri'::regnamespace,'public'::regnamespace);
CREATE TEMP TABLE quota_old_intents AS SELECT to_jsonb(item) AS row FROM libri.image_upload_intents item;
\ir ../migrations/20260910170101_libri_unissued_upload_quota_settlement.sql
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM libri.image_upload_intents
 WHERE quota_policy_version<>0 OR pending_slot_released_at IS NOT NULL),'no legacy upgrade or release');
SELECT pg_temp.assert_true(NOT EXISTS(
 (SELECT to_jsonb(item)-'quota_policy_version'-'pending_slot_released_at' FROM libri.image_upload_intents item EXCEPT SELECT row FROM quota_old_intents)
 UNION ALL (SELECT row FROM quota_old_intents EXCEPT SELECT to_jsonb(item)-'quota_policy_version'-'pending_slot_released_at' FROM libri.image_upload_intents item)
),'no intent backfill');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM quota_old_acl b JOIN pg_class p USING(oid)
 WHERE p.relacl IS DISTINCT FROM b.relacl OR p.relrowsecurity<>b.relrowsecurity OR p.relforcerowsecurity<>b.relforcerowsecurity),'all existing relation ACL and RLS unchanged');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM quota_old_routines b JOIN pg_proc p USING(oid)
 WHERE p.proacl IS DISTINCT FROM b.proacl OR p.proowner<>b.proowner OR p.proconfig IS DISTINCT FROM b.proconfig
 OR p.prosecdef<>b.prosecdef OR (p.oid<>'libri.reserve_image_upload(uuid,uuid,text,jsonb)'::regprocedure AND p.prosrc<>b.prosrc)),'all prior routine authority and non-admission bodies unchanged');
\ir 20260910170101_libri_unissued_upload_quota_settlement.production_verify.sql

CREATE FUNCTION pg_temp.release_slot() RETURNS boolean LANGUAGE sql AS $$
 SELECT libri.release_unissued_image_upload_slot('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','dddddddd-dddd-4ddd-8ddd-ddddddddddd1')
$$;
CREATE FUNCTION pg_temp.reserve_slot(k text) RETURNS libri.image_upload_intents LANGUAGE sql AS $$
 SELECT libri.reserve_image_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',k,
 '{"filename":"page.png","imageType":"page","mimeType":"image/png","byteSize":1024,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}')
$$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
-- Legacy retry keeps its original identity and unproven policy.
SET ROLE authenticated;
SELECT pg_temp.assert_true((libri.reserve_image_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',(SELECT idempotency_key FROM libri.image_upload_intents),
 (SELECT file_metadata FROM libri.image_upload_intents))).quota_policy_version=0,'legacy replay not upgraded');
SELECT pg_temp.expect_error('SELECT pg_temp.release_slot()','42501');
RESET ROLE;
SELECT pg_temp.expire_retirement_fixture();
SET ROLE service_role;
SELECT pg_temp.retire_upload();
SELECT pg_temp.assert_true(NOT pg_temp.release_slot(),'legacy absence is not proof of unissued capability');
SELECT pg_temp.expect_error('SELECT libri.release_unissued_image_upload_slot(NULL,NULL)','22023');
SELECT pg_temp.assert_true(NOT libri.release_unissued_image_upload_slot('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'),'foreign library refused');
RESET ROLE;
-- Synthetic version-1 fixture for adversarial state checks; production never upgrades.
UPDATE libri.image_upload_intents SET quota_policy_version=1;
BEGIN;
DELETE FROM libri.image_upload_cleanup_targets;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(NOT pg_temp.release_slot(),'missing tombstone refused');
ROLLBACK;
BEGIN;
UPDATE libri.image_upload_cleanup_targets SET object_path=replace(object_path,'original.png','original.jpeg');
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(NOT pg_temp.release_slot(),'mismatched staging identity refused');
ROLLBACK;
BEGIN;
INSERT INTO libri.image_upload_processing(upload_id,status,attempt,lease_token,lease_expires_at,available_at,updated_at)
 VALUES('dddddddd-dddd-4ddd-8ddd-ddddddddddd1','retry_wait',1,gen_random_uuid(),now(),now(),now());
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(NOT pg_temp.release_slot(),'processing evidence refused');
ROLLBACK;
BEGIN;
UPDATE libri.image_upload_intents SET submitted_at=created_at+interval '1 minute';
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(NOT pg_temp.release_slot(),'submission evidence refused');
ROLLBACK;
BEGIN;
INSERT INTO libri.image_upload_issuances(upload_id,library_id,request_id,object_path,attempted_at,sign_before,reservation_expires_at)
 SELECT id,library_id,'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',object_path,created_at,created_at+interval '10 seconds',expires_at
 FROM libri.image_upload_intents;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(NOT pg_temp.release_slot(),'uncertain issuance refused even after expiry');
RESET ROLE;
UPDATE libri.image_upload_issuances SET observed_at=attempted_at+interval '1 second',token_expires_at=attempted_at+interval '2 hours';
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(NOT pg_temp.release_slot(),'observed expired capability still refused');
ROLLBACK;
BEGIN;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.release_slot(),'eligible within transaction');
ROLLBACK;
SELECT pg_temp.assert_true((SELECT pending_slot_released_at IS NULL FROM libri.image_upload_intents),'rollback keeps quota');
CREATE TEMP TABLE quota_retirements AS SELECT * FROM libri.image_upload_retirements;
CREATE TEMP TABLE quota_targets AS SELECT * FROM libri.image_upload_cleanup_targets;
UPDATE libri.image_upload_controls SET admission_enabled=false,processing_enabled=false,cleanup_enabled=false;
UPDATE libri.library_members SET role='viewer';
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.release_slot(),'safe release works after revocation and disable');
RESET ROLE;
CREATE TEMP TABLE quota_receipt AS SELECT pending_slot_released_at FROM libri.image_upload_intents;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.release_slot(),'same receipt acknowledges replay');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT pending_slot_released_at FROM libri.image_upload_intents)=(SELECT pending_slot_released_at FROM quota_receipt),'receipt never refreshed');
SELECT pg_temp.assert_true(NOT EXISTS((SELECT * FROM libri.image_upload_retirements EXCEPT SELECT * FROM quota_retirements)
 UNION ALL (SELECT * FROM quota_retirements EXCEPT SELECT * FROM libri.image_upload_retirements)),'retirements retained exactly');
SELECT pg_temp.assert_true(NOT EXISTS((SELECT * FROM libri.image_upload_cleanup_targets EXCEPT SELECT * FROM quota_targets)
 UNION ALL (SELECT * FROM quota_targets EXCEPT SELECT * FROM libri.image_upload_cleanup_targets)),'targets retained exactly');
SELECT pg_temp.expect_error('UPDATE libri.image_upload_intents SET quota_policy_version=0','23514');
SELECT pg_temp.expect_error($q$UPDATE libri.image_upload_intents SET pending_slot_released_at='infinity'$q$,'23514');
SELECT pg_temp.expect_error($q$UPDATE libri.image_upload_intents SET status='reserved'$q$,'23514');
UPDATE libri.library_members SET role='owner';
UPDATE libri.image_upload_controls SET admission_enabled=true,max_pending=1,max_daily=1;
SET ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve_slot('quota_daily_still_counts')$q$,'53000');
RESET ROLE;
UPDATE libri.image_upload_controls SET max_daily=50;
SET ROLE authenticated;
SELECT pg_temp.assert_true((pg_temp.reserve_slot('quota_fresh_reservation')).quota_policy_version=1,'released pending slot admits new policy reservation');
SELECT pg_temp.expect_error($q$SELECT pg_temp.reserve_slot('quota_pending_full_again')$q$,'53000');
SELECT pg_temp.assert_true((pg_temp.reserve_slot('quota_fresh_reservation')).id=(SELECT id FROM libri.image_upload_intents WHERE status='reserved'),'fresh replay reuses slot');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM libri.image_upload_intents),'all daily admission evidence retained');
-- Leave one expired, retired version-1 fixture for real-transaction race coverage.
DELETE FROM libri.image_upload_intents WHERE id<>'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
UPDATE libri.image_upload_intents SET pending_slot_released_at=NULL;
UPDATE libri.image_upload_controls SET max_pending=1,max_daily=50;
