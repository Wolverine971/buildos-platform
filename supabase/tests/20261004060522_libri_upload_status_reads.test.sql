-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_upload_publication_contract_base.sql
CREATE TEMP TABLE status_before_publications AS SELECT * FROM libri.image_upload_publications;
CREATE TEMP TABLE status_before_processing AS SELECT * FROM libri.image_upload_processing;
CREATE TEMP TABLE status_before_intents AS SELECT * FROM libri.image_upload_intents;
\ir ../migrations/20261004060522_libri_upload_status_reads.sql
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','libri.read_image_upload_status(uuid,uuid)','EXECUTE') AND NOT has_function_privilege('libri_worker','libri.read_image_upload_status(uuid,uuid)','EXECUTE') AND NOT has_function_privilege('service_role','libri.read_image_upload_status(uuid,uuid)','EXECUTE'),'status is caller-only');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','libri.image_upload_processing','SELECT') AND NOT has_table_privilege('authenticated','libri.image_upload_publications','SELECT'),'no raw progress authority');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT libri.read_image_upload_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','dddddddd-dddd-4ddd-8ddd-ddddddddddd1') AS receipt \gset
SELECT pg_temp.assert_true(:'receipt'::jsonb->'progress'->>'phase'='published' AND :'receipt'::jsonb->'progress'->>'ocrStatus'='pending','published receipt is distinct from pending OCR');
SELECT pg_temp.assert_true((:'receipt'::jsonb->'progress'->>'imageId')::uuid IS NOT NULL AND NOT :'receipt'::jsonb->'progress' ? 'leaseToken' AND NOT :'receipt'::jsonb->'upload' ? 'object_path','no lease/storage authority in projection');
SELECT pg_temp.assert_true(libri.read_image_upload_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','dddddddd-dddd-4ddd-8ddd-ddddddddddd1') IS NULL,'foreign scoped upload hidden');
SELECT pg_temp.assert_true(libri.read_image_upload_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','dddddddd-dddd-4ddd-8ddd-ddddddddddd2') IS NULL,'missing upload hidden');
SELECT pg_temp.expect_error($q$SELECT libri.read_image_upload_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',NULL)$q$,'22023');
RESET ROLE;
SELECT pg_temp.assert_true(NOT EXISTS((SELECT * FROM libri.image_upload_publications EXCEPT SELECT * FROM status_before_publications) UNION ALL(SELECT * FROM status_before_publications EXCEPT SELECT * FROM libri.image_upload_publications)),'read never mutates publication');
SELECT pg_temp.assert_true(NOT EXISTS((SELECT * FROM libri.image_upload_processing EXCEPT SELECT * FROM status_before_processing) UNION ALL(SELECT * FROM status_before_processing EXCEPT SELECT * FROM libri.image_upload_processing)),'read never mutates processing');
SELECT pg_temp.assert_true(NOT EXISTS((SELECT * FROM libri.image_upload_intents EXCEPT SELECT * FROM status_before_intents) UNION ALL(SELECT * FROM status_before_intents EXCEPT SELECT * FROM libri.image_upload_intents)),'read never mutates intake');
UPDATE libri.image_upload_processing SET lease_token='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9' WHERE upload_id='dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
SET ROLE authenticated;
SELECT pg_temp.assert_true(libri.read_image_upload_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','dddddddd-dddd-4ddd-8ddd-ddddddddddd1')->'progress'->>'phase'='reconciliation_required','published work must retain the matching publication fence');
RESET ROLE;
UPDATE libri.image_upload_processing w SET lease_token=p.lease_token FROM status_before_processing p WHERE w.upload_id=p.upload_id;
INSERT INTO auth.users(id) VALUES('11111111-1111-4111-8111-111111111112');
INSERT INTO libri.library_members(library_id,user_id,role) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','11111111-1111-4111-8111-111111111112','owner');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111112',false);
SELECT pg_temp.assert_true(libri.read_image_upload_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','dddddddd-dddd-4ddd-8ddd-ddddddddddd1') IS NULL,'another owner cannot inspect caller-owned intent');
RESET ROLE;
UPDATE libri.library_members SET role='viewer' WHERE user_id='11111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT pg_temp.expect_error($q$SELECT libri.read_image_upload_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','dddddddd-dddd-4ddd-8ddd-ddddddddddd1')$q$,'42501');
RESET ROLE;
UPDATE libri.library_members SET role='editor' WHERE user_id='11111111-1111-4111-8111-111111111111';
INSERT INTO libri.image_upload_intents(id,library_id,book_id,requested_by,idempotency_key,file_metadata,object_path,created_at,signing_deadline,expires_at,status,submitted_at)
 SELECT 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',library_id,book_id,requested_by,'status_fixture_two',file_metadata,
 replace(object_path,'dddddddd-dddd-4ddd-8ddd-ddddddddddd1','dddddddd-dddd-4ddd-8ddd-ddddddddddd2'),created_at,signing_deadline,expires_at,'reserved',NULL FROM libri.image_upload_intents WHERE id='dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
CREATE FUNCTION pg_temp.phase_two() RETURNS text LANGUAGE sql AS $$ SELECT libri.read_image_upload_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','dddddddd-dddd-4ddd-8ddd-ddddddddddd2')->'progress'->>'phase' $$;
SET ROLE authenticated;
SELECT pg_temp.assert_true(pg_temp.phase_two()='reserved','editor own reserved upload');
RESET ROLE;
UPDATE libri.image_upload_intents SET status='awaiting_verification',submitted_at=now() WHERE id='dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
SET ROLE authenticated;
SELECT pg_temp.assert_true(pg_temp.phase_two()='awaiting_verification','submitted is not completed');
RESET ROLE;
INSERT INTO libri.image_upload_processing(upload_id,status,attempt,lease_token,lease_expires_at,available_at,updated_at)
 VALUES('dddddddd-dddd-4ddd-8ddd-ddddddddddd2','leased',1,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',now()+interval '90 seconds',now(),now());
SET ROLE authenticated;
SELECT pg_temp.assert_true(pg_temp.phase_two()='verifying','live lease');
RESET ROLE;
UPDATE libri.image_upload_processing SET lease_expires_at=now()-interval '1 second' WHERE upload_id='dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
SET ROLE authenticated;
SELECT pg_temp.assert_true(pg_temp.phase_two()='awaiting_verification','expired lease is not active');
RESET ROLE;
UPDATE libri.image_upload_processing SET status='retry_wait',last_failure='verification_unavailable' WHERE upload_id='dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
SET ROLE authenticated;
SELECT pg_temp.assert_true(pg_temp.phase_two()='retry_wait','bounded retry waiting');
RESET ROLE;
UPDATE libri.image_upload_processing SET status='blocked',last_failure='invalid_image' WHERE upload_id='dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
SET ROLE authenticated;
SELECT pg_temp.assert_true(pg_temp.phase_two()='blocked','definitive failure');
RESET ROLE;
INSERT INTO libri.image_upload_publications(id,upload_id,library_id,book_id,attempt,lease_token,object_path,file_metadata,verified_metadata)
 SELECT 'ffffffff-ffff-4fff-8fff-fffffffffff2','dddddddd-dddd-4ddd-8ddd-ddddddddddd2',library_id,book_id,1,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',library_id::text||'/images/ffffffff-ffff-4fff-8fff-fffffffffff2/original.png',file_metadata,verified_metadata FROM libri.image_upload_publications;
SET ROLE authenticated;
SELECT pg_temp.assert_true(pg_temp.phase_two()='reconciliation_required','durable uncertain publication never looks retryable');
RESET ROLE;
UPDATE libri.image_upload_processing SET status='leased',lease_expires_at=now()+interval '90 seconds' WHERE upload_id='dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
SET ROLE authenticated;
SELECT pg_temp.assert_true(pg_temp.phase_two()='publishing','prepared publication with matching current fence');
RESET ROLE;
UPDATE libri.image_upload_processing SET lease_token='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3' WHERE upload_id='dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
SET ROLE authenticated;
SELECT pg_temp.assert_true(pg_temp.phase_two()='reconciliation_required','mismatched publication fence remains uncertain');
RESET ROLE;
DELETE FROM libri.image_upload_publications WHERE id='ffffffff-ffff-4fff-8fff-fffffffffff2';
UPDATE libri.image_upload_intents SET expires_at=now()-interval '45 minutes',signing_deadline=now()-interval '170 minutes',created_at=now()-interval '3 hours',submitted_at=now()-interval '160 minutes' WHERE id='dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
SET ROLE authenticated;
SELECT pg_temp.assert_true(pg_temp.phase_two()='expired','expired intent is not active');
RESET ROLE;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM storage.objects),'no Storage writes');
