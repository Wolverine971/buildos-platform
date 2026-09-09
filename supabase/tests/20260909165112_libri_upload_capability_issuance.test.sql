-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_upload_cleanup_base.sql
CREATE TEMP TABLE issuance_old_acl AS SELECT oid,relacl,relrowsecurity,relforcerowsecurity FROM pg_class
 WHERE relnamespace IN ('libri'::regnamespace,'public'::regnamespace,'storage'::regnamespace,'auth'::regnamespace);
CREATE TEMP TABLE issuance_old_routines AS SELECT oid,prosrc,proacl,proconfig,prosecdef FROM pg_proc
 WHERE pronamespace IN ('libri'::regnamespace,'public'::regnamespace);
\ir ../migrations/20260909165112_libri_upload_capability_issuance.sql
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM libri.image_upload_issuances),'no issuance backfill');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM issuance_old_acl b JOIN pg_class p USING(oid)
 WHERE p.relacl IS DISTINCT FROM b.relacl OR p.relrowsecurity<>b.relrowsecurity OR p.relforcerowsecurity<>b.relforcerowsecurity),'existing ACL and RLS unchanged');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM issuance_old_routines b JOIN pg_proc p USING(oid)
 WHERE p.prosrc<>b.prosrc OR p.proacl IS DISTINCT FROM b.proacl OR p.proconfig IS DISTINCT FROM b.proconfig
 OR p.prosecdef<>b.prosecdef),'existing functions unchanged');
SELECT pg_temp.assert_true((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
 WHERE oid='libri.image_upload_issuances'::regclass),'issuances force RLS');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='libri' AND tablename='image_upload_issuances'),'no browser policies');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='libri'::regnamespace
 AND proname IN ('begin_image_upload_issuance','observe_image_upload_issuance')
 AND (prosecdef OR NOT proconfig @> ARRAY['search_path=pg_catalog, libri','lock_timeout=2s','statement_timeout=5s'])),'bounded invokers');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','libri_worker','libri_frontend_reader']) role_name
 WHERE has_table_privilege(role_name,'libri.image_upload_issuances','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_any_column_privilege(role_name,'libri.image_upload_issuances','SELECT,INSERT,UPDATE')),'no browser/worker access');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN unnest(ARRAY['anon','authenticated','libri_worker','libri_frontend_reader']) role_name
 WHERE p.pronamespace='libri'::regnamespace AND p.proname IN ('begin_image_upload_issuance','observe_image_upload_issuance')
 AND has_function_privilege(role_name,p.oid,'EXECUTE')),'service-only routines');
SELECT pg_temp.assert_true(NOT has_table_privilege('service_role','libri.image_upload_issuances','UPDATE,DELETE,TRUNCATE')
 AND has_column_privilege('service_role','libri.image_upload_issuances','observed_at','UPDATE')
 AND NOT has_column_privilege('service_role','libri.image_upload_issuances','request_id','UPDATE'),'service may update only observations');

CREATE FUNCTION pg_temp.begin_issuance(n integer DEFAULT 1) RETURNS jsonb LANGUAGE sql AS $$
 SELECT libri.begin_image_upload_issuance('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1','11111111-1111-4111-8111-111111111111',
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc'||n)::uuid)
$$;
CREATE FUNCTION pg_temp.observe_issuance(expiry timestamptz,n integer DEFAULT 1) RETURNS boolean LANGUAGE sql AS $$
 SELECT libri.observe_image_upload_issuance('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',('cccccccc-cccc-4ccc-8ccc-ccccccccccc'||n)::uuid,expiry)
$$;
UPDATE libri.image_upload_intents SET status='reserved',submitted_at=NULL;
DELETE FROM libri.image_upload_processing;
UPDATE libri.image_upload_controls SET admission_enabled=false;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.begin_issuance() IS NULL,'disabled admission cannot begin');
RESET ROLE;
UPDATE libri.image_upload_controls SET admission_enabled=true;
UPDATE libri.library_members SET role='viewer';
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.begin_issuance() IS NULL,'viewer cannot begin');
RESET ROLE;
UPDATE libri.library_members SET role='owner';
SET ROLE service_role;
SELECT pg_temp.assert_true(libri.begin_image_upload_issuance('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1','11111111-1111-4111-8111-111111111111',gen_random_uuid()) IS NULL,'foreign library denied');
SELECT pg_temp.assert_true(libri.begin_image_upload_issuance('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1','22222222-2222-4222-8222-222222222222',gen_random_uuid()) IS NULL,'wrong requester denied');
SELECT pg_temp.expect_error('SELECT libri.begin_image_upload_issuance(NULL,NULL,NULL,NULL)','22023');
RESET ROLE;
BEGIN;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.begin_issuance() IS NOT NULL,'first transactional begin');
ROLLBACK;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM libri.image_upload_issuances),'rollback retains no attempt');
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.begin_issuance()->>'object_path'=(SELECT object_path FROM libri.image_upload_intents),'committed begin binds exact path');
SELECT pg_temp.assert_true(pg_temp.begin_issuance() IS NULL AND pg_temp.begin_issuance(2) IS NULL,'neither same nor different request can resign');
SELECT pg_temp.assert_true((SELECT sign_before=attempted_at+interval '10 seconds' AND observed_at IS NULL FROM libri.image_upload_issuances),'bounded pending attempt');
SELECT pg_temp.expect_error('DELETE FROM libri.image_upload_issuances','42501');
SELECT pg_temp.expect_error('UPDATE libri.image_upload_issuances SET request_id=gen_random_uuid()','42501');
SELECT pg_temp.assert_true(NOT pg_temp.observe_issuance(clock_timestamp()-interval '1 second')
 AND NOT pg_temp.observe_issuance(clock_timestamp()+interval '3 hours')
 AND NOT pg_temp.observe_issuance(clock_timestamp()+interval '2 hours',2),'bad lifetime or wrong request refused');
SELECT pg_temp.expect_error($q$SELECT pg_temp.observe_issuance('infinity')$q$,'22023');
RESET ROLE;
CREATE TEMP TABLE issuance_expiry AS SELECT date_trunc('second',attempted_at+interval '2 hours') AS expiry FROM libri.image_upload_issuances;
GRANT SELECT ON issuance_expiry TO service_role;
UPDATE libri.library_members SET role='viewer';
UPDATE libri.image_upload_controls SET admission_enabled=false;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.observe_issuance((SELECT expiry FROM issuance_expiry)),'observation remains evidence after revocation');
SELECT pg_temp.assert_true(pg_temp.observe_issuance((SELECT expiry FROM issuance_expiry)),'same receipt acknowledges lost reply');
SELECT pg_temp.assert_true(NOT pg_temp.observe_issuance((SELECT expiry+interval '1 second' FROM issuance_expiry)),'conflicting observation refused');
SELECT pg_temp.assert_true(pg_temp.begin_issuance() IS NULL,'observation does not reauthorize');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT status='reserved' FROM libri.image_upload_intents)
 AND NOT EXISTS(SELECT 1 FROM libri.image_upload_retirements),'issuance does not publish, retire or release quota');
-- Constraint NULL semantics must not permit partial observations.
SELECT pg_temp.expect_error('UPDATE libri.image_upload_issuances SET observed_at=NULL','23514');
SELECT pg_temp.expect_error('UPDATE libri.image_upload_issuances SET token_expires_at=NULL','23514');
-- Restore a reserved fixture; the pipeline integration suite covers real overlaps.
DELETE FROM libri.image_upload_issuances;
UPDATE libri.library_members SET role='owner';
UPDATE libri.image_upload_controls SET admission_enabled=true;
UPDATE libri.image_upload_intents SET status='cleanup_pending';
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.begin_issuance() IS NULL,'retired state cannot sign');
RESET ROLE;
UPDATE libri.image_upload_intents SET status='reserved';
SELECT pg_temp.expire_retirement_fixture();
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.begin_issuance() IS NULL,'expired window cannot sign');
RESET ROLE;
UPDATE libri.image_upload_intents SET created_at=statement_timestamp(),signing_deadline=statement_timestamp()+interval '10 minutes',expires_at=statement_timestamp()+interval '135 minutes';
\ir 20260909165112_libri_upload_capability_issuance.production_verify.sql
