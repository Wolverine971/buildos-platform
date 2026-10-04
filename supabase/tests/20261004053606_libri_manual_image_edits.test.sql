-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_chapter_research_base.sql
\ir ../migrations/20261004053606_libri_manual_image_edits.sql
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO auth.users(id) VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
INSERT INTO libri.libraries(id,slug,name,created_by) VALUES('00000000-0000-4000-8000-000000000010','one','One','00000000-0000-4000-8000-000000000001');
INSERT INTO libri.library_members(library_id,user_id,role) VALUES('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','owner'),('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','editor');
INSERT INTO libri.books(id,library_id,title,slug,updated_at) VALUES('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010','One','one','2000-01-01');
INSERT INTO libri.sources(id,library_id,source_type,source_key,title) VALUES
 ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000010','scanned_image','image-1','Image one'),
 ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000010','scanned_image','image-2','Image two');
INSERT INTO libri.images(id,library_id,book_id,source_id,object_path,original_filename,mime_type,byte_size,content_sha256,image_type,updated_at) VALUES
 ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000010/one','one.png','image/png',100,repeat('a',64),'page','2000-01-01'),
 ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000010/two','two.png','image/png',100,repeat('b',64),'cover','2000-01-01');
INSERT INTO libri.chapters(library_id,book_id,position,number,title,summary,research_payload) VALUES('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020',0,'1','Existing','Saved summary','{"evidence":"saved"}');
INSERT INTO libri.source_chunks(library_id,source_id,book_id,image_id,chunk_type,content,content_sha256,idempotency_key) VALUES('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','ocr','Prior OCR evidence',repeat('c',64),'prior');
INSERT INTO libri.derived_artifacts(library_id,book_id,artifact_type,content,content_sha256,idempotency_key) VALUES('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','book_analysis','Existing analysis',repeat('d',64),'analysis');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','libri.edit_application_image(uuid,uuid,text,timestamptz,timestamptz,jsonb)','EXECUTE') AND NOT has_function_privilege('libri_worker','libri.edit_application_image(uuid,uuid,text,timestamptz,timestamptz,jsonb)','EXECUTE'),'anonymous and worker cannot edit');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','libri.images','UPDATE'),'no raw client writes');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $$ BEGIN BEGIN PERFORM libri.edit_application_image('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000030','cover','2000-01-01','2000-01-01'); RAISE EXCEPTION 'editor accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
DO $$ BEGIN
 BEGIN PERFORM libri.edit_application_image('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000030','cover','2000-01-01','2000-01-01'); RAISE EXCEPTION 'foreign library'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM libri.edit_application_image('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000099','cover','2000-01-01','2000-01-01'); RAISE EXCEPTION 'unknown image'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN PERFORM libri.edit_application_image('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000030','cover','2000-01-02','2000-01-01'); RAISE EXCEPTION 'stale book'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN PERFORM libri.edit_application_image('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000030','cover','2000-01-01','2000-01-02'); RAISE EXCEPTION 'stale image'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN PERFORM libri.edit_application_image('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000030','toc','2000-01-01','2000-01-01','{"text":"Bad","chapters":[{"title":"Bad"}]}'); RAISE EXCEPTION 'bad chapter'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
BEGIN;
SELECT libri.edit_application_image('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000030','cover','2000-01-01','2000-01-01');
ROLLBACK;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT image_type='page' AND ocr_version=0 FROM libri.images WHERE id='00000000-0000-4000-8000-000000000030') AND (SELECT count(*)=0 FROM libri.activity_events),'rollback atomic');
SET ROLE authenticated;
SELECT libri.edit_application_image('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000030','cover','2000-01-01','2000-01-01') AS cover_receipt \gset
RESET ROLE;
SELECT pg_temp.assert_true(:'cover_receipt'::jsonb->>'demotedCoverCount'='1' AND (SELECT count(*)=1 FROM libri.images WHERE image_type='cover'),'single cover');
SELECT pg_temp.assert_true((SELECT image_type='cover' AND ocr_status='complete' AND ocr_version=1 AND object_path='00000000-0000-4000-8000-000000000010/one' FROM libri.images WHERE id='00000000-0000-4000-8000-000000000030'),'cover metadata and storage preserved');
SET ROLE authenticated;
SELECT libri.edit_application_image('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000030','toc',(:'cover_receipt'::jsonb->>'bookUpdatedAt')::timestamptz,(:'cover_receipt'::jsonb->>'updatedAt')::timestamptz,'{"text":"1 Existing ... 1\n2 New ... 10","chapters":[{"number":"1","title":"Existing","page":"1"},{"number":"2","title":"New","page":"10"},{"number":"2","title":"new","page":"10"}]}') AS toc_receipt \gset
RESET ROLE;
SELECT pg_temp.assert_true(:'toc_receipt'::jsonb->>'created'='1' AND (SELECT count(*)=2 FROM libri.chapters),'TOC exact deduplication');
SELECT pg_temp.assert_true((SELECT summary='Saved summary' AND research_payload->>'evidence'='saved' FROM libri.chapters WHERE number='1'),'preserves existing research');
SELECT pg_temp.assert_true((SELECT position=1 AND page_start='10' FROM libri.chapters WHERE number='2'),'appends in order');
SELECT pg_temp.assert_true((SELECT content='Prior OCR evidence' AND is_archived AND archived_at IS NOT NULL FROM libri.source_chunks),'prior evidence retained inactive');
SELECT pg_temp.assert_true((SELECT status='outdated' AND content='Existing analysis' FROM libri.derived_artifacts),'derived context marked outdated');
SELECT pg_temp.assert_true((SELECT indexing->>'hasToc'='true' AND indexing->>'chaptersExtracted'='true' AND toc->>'status'='from_images' FROM libri.books),'TOC readiness updated');
SELECT pg_temp.assert_true((SELECT ocr_metadata->'manualToc'->>'text'=E'1 Existing ... 1\n2 New ... 10' AND ocr_version=2 FROM libri.images WHERE id='00000000-0000-4000-8000-000000000030'),'manual provenance and version retained');
UPDATE libri.images SET ocr_status='processing' WHERE id='00000000-0000-4000-8000-000000000030';
SELECT updated_at::text AS image_version FROM libri.images WHERE id='00000000-0000-4000-8000-000000000030' \gset
SET ROLE authenticated;
SELECT set_config('test.book_version',:'toc_receipt'::jsonb->>'bookUpdatedAt',false),set_config('test.image_version',:'image_version',false);
DO $$ BEGIN BEGIN PERFORM libri.edit_application_image('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000030','cover',current_setting('test.book_version')::timestamptz,current_setting('test.image_version')::timestamptz); RAISE EXCEPTION 'processing image changed'; EXCEPTION WHEN serialization_failure THEN NULL; END; END $$;
RESET ROLE;
DELETE FROM libri.library_members WHERE user_id='00000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
DO $$ BEGIN BEGIN PERFORM libri.edit_application_image('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000030','cover','2000-01-01','2000-01-01'); RAISE EXCEPTION 'revoked owner'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM libri.activity_events) AND (SELECT count(*)=0 FROM libri.research_tasks),'only successful manual events, no executable work');
