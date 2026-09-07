-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_upload_publication_contract_base.sql
CREATE TEMP TABLE claim_security_before AS
 SELECT proacl,proowner,proconfig,prosecdef FROM pg_proc
 WHERE oid='libri.claim_image_upload(uuid,uuid,uuid)'::regprocedure;
CREATE TEMP TABLE work_before_deadline_fix AS SELECT * FROM libri.image_upload_processing;
CREATE TEMP TABLE publication_before_deadline_fix AS SELECT * FROM libri.image_upload_publications;
\ir ../migrations/20260907043724_libri_upload_claim_deadline_refresh.sql
SELECT pg_temp.assert_true(NOT EXISTS (
 SELECT 1 FROM claim_security_before b CROSS JOIN pg_proc p
 WHERE p.oid='libri.claim_image_upload(uuid,uuid,uuid)'::regprocedure
 AND (p.proacl IS DISTINCT FROM b.proacl OR p.proowner<>b.proowner
  OR p.proconfig IS DISTINCT FROM b.proconfig OR p.prosecdef<>b.prosecdef)
),'claim deadline correction preserves all security boundaries');
SELECT pg_temp.assert_true(NOT EXISTS (
 (SELECT * FROM libri.image_upload_processing EXCEPT SELECT * FROM work_before_deadline_fix)
 UNION ALL (SELECT * FROM work_before_deadline_fix EXCEPT SELECT * FROM libri.image_upload_processing)
),'claim deadline correction never mutates work');
SELECT pg_temp.assert_true(NOT EXISTS (
 (SELECT * FROM libri.image_upload_publications EXCEPT SELECT * FROM publication_before_deadline_fix)
 UNION ALL (SELECT * FROM publication_before_deadline_fix EXCEPT SELECT * FROM libri.image_upload_publications)
),'claim deadline correction never mutates publications');
-- The runner replays publication races and observes a claim crossing its deadline
-- while blocked on another real transaction's processing-row lock.
