-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_ocr_batch_dispatcher_access_base.sql
\ir ../migrations/20260901153414_libri_ocr_admission_dispatch_timestamp_guard.sql
\ir ../migrations/20260901155435_libri_ocr_admission_finalizer_hardening.sql
\ir ../migrations/20260901163552_libri_ocr_admission_production_drift_correction.sql
\ir ../../scripts/database/provision-libri-frontend-reader-role.sql
\ir ../migrations/20260906184227_libri_private_image_upload_admission.sql
\ir ../migrations/20260906201700_libri_upload_processing_leases.sql
\ir ../migrations/20260907015150_libri_upload_download_authorization.sql
\ir ../migrations/20260907041707_libri_upload_publication_contract.sql
\ir ../migrations/20261004012059_libri_upload_ocr_handoff_receipt.sql
CREATE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %',message; END IF; END; $$;
CREATE FUNCTION pg_temp.expect_error(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE=expected THEN RETURN; END IF; RAISE EXCEPTION 'expected %, got %: %',expected,SQLSTATE,SQLERRM;
 END;
 RAISE EXCEPTION 'expected %, statement succeeded',expected;
END; $$;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM libri.image_upload_controls)
 AND NOT EXISTS(SELECT 1 FROM libri.image_upload_publications),'migration activates no work');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','libri_worker','libri_frontend_reader']) role_name
 WHERE has_function_privilege(role_name,'libri.record_upload_ocr_handoff()','EXECUTE')
 OR has_table_privilege(role_name,'libri.image_upload_publications','SELECT,INSERT,UPDATE,DELETE')),'no new browser/worker/reader authority');
SELECT pg_temp.assert_true((SELECT NOT prosecdef FROM pg_proc WHERE oid='libri.record_upload_ocr_handoff()'::regprocedure),'handoff stays invoker');
INSERT INTO auth.users (id) VALUES ('d1000000-0000-4000-8000-000000000001');
INSERT INTO libri.libraries (id, slug, name, created_by) VALUES (
	'd2000000-0000-4000-8000-000000000001',
	'finalizer-hardening',
	'Finalizer hardening',
	'd1000000-0000-4000-8000-000000000001'
);
INSERT INTO libri.library_members (library_id, user_id, role) VALUES (
	'd2000000-0000-4000-8000-000000000001',
	'd1000000-0000-4000-8000-000000000001',
	'owner'
);
INSERT INTO libri.books (id, library_id, title) VALUES (
	'd3000000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000001',
	'Finalizer hardening'
);
INSERT INTO libri.sources (
	id, library_id, source_type, source_key, title, status, discovered_by
) VALUES (
	'd5000000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000001',
	'scanned_image',
	'finalizer-hardening:image',
	'Finalizer hardening image',
	'ready',
	'convex_migration'
);
INSERT INTO libri.images (
	id, library_id, book_id, source_id, object_path, original_filename,
	mime_type, byte_size, content_sha256, image_type, ocr_status, ocr_version
) VALUES (
	'd5000000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000001',
	'd3000000-0000-4000-8000-000000000001',
	'd5000000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000001/books/d3000000-0000-4000-8000-000000000001/images/d5000000-0000-4000-8000-000000000001/original.jpeg',
	'page.jpeg',
	'image/jpeg',
	1024,
	repeat('a', 64),
	'page',
	'pending',
	0
);

SELECT run_id
FROM libri.plan_explicit_ocr_batch(
	'd2000000-0000-4000-8000-000000000001',
	'd3000000-0000-4000-8000-000000000001',
	ARRAY['d5000000-0000-4000-8000-000000000001'::uuid],
	'ocr-batch:finalizer-hardening',
	'd1000000-0000-4000-8000-000000000001'
)
\gset planned_

SELECT
	item.step_id,
	item.image_id,
	item.position,
	item.expected_ocr_version,
	item.image_content_sha256,
	step.priority,
	step.payload_version,
	run.correlation_id,
	encode(
		pg_catalog.sha256(
			convert_to(
				'{"version":1,"runId":"' || item.run_id::text
					|| '","libraryId":"' || item.library_id::text
					|| '","bookId":"d3000000-0000-4000-8000-000000000001"'
					|| ',"items":[{"stepId":"' || item.step_id::text
					|| '","imageId":"' || item.image_id::text
					|| '","position":' || item.position::text
					|| ',"expectedOcrVersion":' || item.expected_ocr_version::text
					|| ',"imageContentSha256":"' || item.image_content_sha256 || '"}]}',
				'UTF8'
			)
		),
		'hex'
	) AS manifest_sha256
FROM libri.ocr_batch_items AS item
JOIN libri.research_steps AS step
	ON step.library_id = item.library_id
	AND step.run_id = item.run_id
	AND step.id = item.step_id
JOIN libri.research_runs AS run
	ON run.library_id = item.library_id AND run.id = item.run_id
WHERE item.run_id = :'planned_run_id'
\gset item_

INSERT INTO libri.ocr_batch_admissions (
	id, library_id, run_id, confirmation_id, confirmed_by, manifest_sha256
) VALUES (
	'd6000000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000001',
	:'planned_run_id',
	'd7000000-0000-4000-8000-000000000001',
	'd1000000-0000-4000-8000-000000000001',
	:'item_manifest_sha256'
);


-- Synthetic already-verified publication: no Storage or external provider is called.
INSERT INTO libri.image_upload_intents(id,library_id,book_id,requested_by,idempotency_key,file_metadata,object_path,signing_deadline,expires_at)
VALUES ('d8000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',
 'handoff_fixture_0001','{}','d2000000-0000-4000-8000-000000000001/uploads/d8000000-0000-4000-8000-000000000001/original.jpeg',now()+interval '10 minutes',now()+interval '135 minutes');
INSERT INTO libri.image_upload_publications(id,upload_id,library_id,book_id,attempt,lease_token,object_path,file_metadata,verified_metadata,status,published_at,storage_object_id,image_id,source_id,followup_status)
VALUES ('d5000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',1,'d9000000-0000-4000-8000-000000000001',
 'd2000000-0000-4000-8000-000000000001/images/d5000000-0000-4000-8000-000000000001/original.jpeg','{}',jsonb_build_object('sha256',repeat('a',64)),
 'published',now(),'da000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','pending');
SELECT pg_temp.assert_true((SELECT followup_status='pending' AND followup_admission_id IS NULL FROM libri.image_upload_publications),'confirmation alone does not hand off upload');
SET ROLE libri_worker;
SELECT pg_temp.expect_error($q$SELECT * FROM libri.finalize_ocr_batch_admission_dispatch('d6000000-0000-4000-8000-000000000001',clock_timestamp()+interval '5 minutes')$q$,'42501');
RESET ROLE;
BEGIN;
SET LOCAL ROLE libri_worker;
INSERT INTO public.queue_jobs (
	queue_job_id, user_id, job_type, metadata, status, priority,
	scheduled_for, dedup_key, attempts, max_attempts
) VALUES (
	'libri_ingest_finalizer_hardening',
	'd1000000-0000-4000-8000-000000000001',
	'libri_ingest',
	jsonb_build_object(
		'correlationId', :'item_correlation_id',
		'libraryId', 'd2000000-0000-4000-8000-000000000001',
		'researchRunId', :'planned_run_id',
		'researchStepId', :'item_step_id',
		'payloadVersion', :'item_payload_version'::integer,
		'libriAdmissionId', 'd6000000-0000-4000-8000-000000000001',
		'libriManifestSha256', :'item_manifest_sha256',
		'libriBatchPosition', :'item_position'::integer
	),
	'pending',
	:'item_priority'::integer,
	transaction_timestamp(),
	'libri:research-step:' || :'item_step_id',
	0,
	1
)
RETURNING id
\gset queue_
UPDATE libri.research_steps
SET
	status = 'queued',
	scheduled_for = transaction_timestamp(),
	active_queue_job_id = :'queue_id',
	updated_at = now()
WHERE id = :'item_step_id';

RESET ROLE;
SAVEPOINT before_bad_hash;
UPDATE libri.image_upload_publications SET verified_metadata=jsonb_build_object('sha256',repeat('b',64));
SET LOCAL ROLE libri_worker;
SELECT pg_temp.expect_error($q$SELECT * FROM libri.finalize_ocr_batch_admission_dispatch('d6000000-0000-4000-8000-000000000001',clock_timestamp()+interval '5 minutes')$q$,'42501');
ROLLBACK TO before_bad_hash;
RESET ROLE;
SAVEPOINT before_revocation;
UPDATE libri.library_members SET role='viewer';
SET LOCAL ROLE libri_worker;
SELECT pg_temp.expect_error($q$SELECT * FROM libri.finalize_ocr_batch_admission_dispatch('d6000000-0000-4000-8000-000000000001',clock_timestamp()+interval '5 minutes')$q$,'42501');
ROLLBACK TO before_revocation;
SET LOCAL ROLE libri_worker;
SELECT * FROM libri.finalize_ocr_batch_admission_dispatch('d6000000-0000-4000-8000-000000000001',clock_timestamp()+interval '5 minutes');

RESET ROLE;
SELECT pg_temp.assert_true((SELECT publication.followup_status='dispatched' AND publication.followup_admission_id=admission.id
 AND publication.followup_step_id=:'item_step_id'::uuid AND publication.followup_dispatched_at=admission.enqueued_at
 FROM libri.image_upload_publications publication JOIN libri.ocr_batch_admissions admission ON admission.id=publication.followup_admission_id),'exact durable handoff receipt');
ROLLBACK;
SELECT pg_temp.assert_true((SELECT followup_status='pending' AND followup_admission_id IS NULL FROM libri.image_upload_publications) AND NOT EXISTS(SELECT 1 FROM public.queue_jobs),'rollback removes queue work and handoff together');
BEGIN;
SET LOCAL ROLE libri_worker;
INSERT INTO public.queue_jobs (
	queue_job_id, user_id, job_type, metadata, status, priority,
	scheduled_for, dedup_key, attempts, max_attempts
) VALUES (
	'libri_ingest_finalizer_hardening',
	'd1000000-0000-4000-8000-000000000001',
	'libri_ingest',
	jsonb_build_object(
		'correlationId', :'item_correlation_id',
		'libraryId', 'd2000000-0000-4000-8000-000000000001',
		'researchRunId', :'planned_run_id',
		'researchStepId', :'item_step_id',
		'payloadVersion', :'item_payload_version'::integer,
		'libriAdmissionId', 'd6000000-0000-4000-8000-000000000001',
		'libriManifestSha256', :'item_manifest_sha256',
		'libriBatchPosition', :'item_position'::integer
	),
	'pending',
	:'item_priority'::integer,
	transaction_timestamp(),
	'libri:research-step:' || :'item_step_id',
	0,
	1
)
RETURNING id
\gset queue_
UPDATE libri.research_steps
SET
	status = 'queued',
	scheduled_for = transaction_timestamp(),
	active_queue_job_id = :'queue_id',
	updated_at = now()
WHERE id = :'item_step_id';
SELECT * FROM libri.finalize_ocr_batch_admission_dispatch('d6000000-0000-4000-8000-000000000001',clock_timestamp()+interval '5 minutes');

RESET ROLE;
SELECT pg_temp.assert_true((SELECT publication.followup_status='dispatched' AND publication.followup_admission_id=admission.id
 AND publication.followup_step_id=:'item_step_id'::uuid AND publication.followup_dispatched_at=admission.enqueued_at
 FROM libri.image_upload_publications publication JOIN libri.ocr_batch_admissions admission ON admission.id=publication.followup_admission_id),'exact durable handoff receipt');
COMMIT;

-- Later same-status updates cannot replace the first durable receipt.
UPDATE libri.ocr_batch_admissions SET updated_at=now();
SELECT pg_temp.assert_true((SELECT followup_admission_id='d6000000-0000-4000-8000-000000000001'::uuid FROM libri.image_upload_publications),'receipt survives replay');
SELECT pg_temp.expect_error($q$UPDATE libri.image_upload_publications SET followup_admission_id=NULL$q$,'23514');
SELECT pg_temp.expect_error($q$DELETE FROM libri.ocr_batch_admissions$q$,'23503');
-- Existing account purge order remains valid.
DELETE FROM libri.image_upload_publications;
DELETE FROM libri.ocr_batch_admissions;
DELETE FROM libri.ocr_batch_items;
DELETE FROM libri.research_steps;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM libri.image_upload_publications),'publication-first purge order remains valid');
