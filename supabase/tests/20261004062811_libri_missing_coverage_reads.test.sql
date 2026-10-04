-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_chapter_research_base.sql
\ir ../migrations/20261004062811_libri_missing_coverage_reads.sql
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO auth.users(id) VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
INSERT INTO libri.libraries(id,slug,name,created_by) VALUES('00000000-0000-4000-8000-000000000010','one','One','00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000011','two','Two','00000000-0000-4000-8000-000000000002');
INSERT INTO libri.library_members(library_id,user_id,role) VALUES('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','viewer');
INSERT INTO libri.books(id,library_id,title,slug,indexing) VALUES('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010','One','one','{}'),('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000010','Two','two','{"hasCover":true,"hasToc":true}'),('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000011','Foreign','foreign','{}');
INSERT INTO libri.sources(id,library_id,source_type,source_key,title) VALUES
 ('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000010','scanned_image','coverage-cover','Cover'),
 ('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000010','scanned_image','coverage-toc','TOC');
INSERT INTO libri.images(id,library_id,book_id,source_id,bucket_id,object_path,original_filename,byte_size,content_sha256,image_type,ocr_status,mime_type)
 SELECT s.id,s.library_id,'00000000-0000-4000-8000-000000000020',s.id,'libri-assets',s.library_id::text||'/images/'||s.id::text||'/original.png','page.png',100,repeat('a',64),CASE s.title WHEN 'Cover' THEN 'cover' ELSE 'toc' END,CASE s.title WHEN 'Cover' THEN 'failed' ELSE 'pending' END,'image/png'
 FROM libri.sources s WHERE s.source_key IN ('coverage-cover','coverage-toc');
INSERT INTO libri.glossary_terms(library_id,book_id,term,term_normalized,definition) VALUES
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000021','Term','term','Definition'),('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000022','Private','private','Hidden');
SELECT pg_temp.assert_true((SELECT relforcerowsecurity FROM pg_class WHERE oid='libri.glossary_terms'::regclass),'forced RLS');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','libri.glossary_terms','INSERT') AND NOT has_table_privilege('anon','libri.glossary_terms','SELECT') AND NOT has_table_privilege('libri_worker','libri.glossary_terms','SELECT'),'no unqualified writes or anonymous/worker access');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM libri.glossary_terms),'viewer sees only their library terms');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM libri.read_missing_book_coverage('00000000-0000-4000-8000-000000000010',ARRAY['00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000022']::uuid[])),'foreign requested ID is invisible');
SELECT pg_temp.assert_true((SELECT has_cover AND has_toc AND has_cover_image AND has_toc_image AND NOT has_glossary AND glossary_term_count=0 FROM libri.read_missing_book_coverage('00000000-0000-4000-8000-000000000010',ARRAY['00000000-0000-4000-8000-000000000020']::uuid[])),'captured images count even before OCR success');
SELECT pg_temp.assert_true((SELECT has_cover AND has_toc AND NOT has_cover_image AND NOT has_toc_image AND has_glossary AND glossary_term_count=1 FROM libri.read_missing_book_coverage('00000000-0000-4000-8000-000000000010',ARRAY['00000000-0000-4000-8000-000000000021']::uuid[])),'manual flags and glossary terms count');
DO $$ BEGIN
 BEGIN PERFORM libri.read_missing_book_coverage('00000000-0000-4000-8000-000000000011',ARRAY['00000000-0000-4000-8000-000000000022']::uuid[]); RAISE EXCEPTION 'foreign accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM libri.read_missing_book_coverage('00000000-0000-4000-8000-000000000010',ARRAY[]::uuid[]); RAISE EXCEPTION 'empty accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM libri.read_missing_book_coverage('00000000-0000-4000-8000-000000000010',array_fill('00000000-0000-4000-8000-000000000020'::uuid,ARRAY[101])); RAISE EXCEPTION 'unbounded accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM libri.read_missing_book_coverage('00000000-0000-4000-8000-000000000010',ARRAY['00000000-0000-4000-8000-000000000020',NULL]::uuid[]); RAISE EXCEPTION 'null accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
UPDATE libri.images SET image_type='glossary' WHERE image_type='toc';
SET ROLE authenticated;
SELECT pg_temp.assert_true((SELECT has_glossary AND has_glossary_image AND NOT has_toc FROM libri.read_missing_book_coverage('00000000-0000-4000-8000-000000000010',ARRAY['00000000-0000-4000-8000-000000000020']::uuid[])),'live image type changes alter coverage');
RESET ROLE;
DELETE FROM libri.library_members WHERE user_id='00000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.glossary_terms),'revoked member cannot read terms');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.research_tasks),'coverage never enqueues work');
