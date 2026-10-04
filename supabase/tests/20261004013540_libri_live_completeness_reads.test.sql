-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_derived_artifacts_profiles_base.sql
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='libri_worker') THEN CREATE ROLE libri_worker NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='libri_frontend_reader') THEN CREATE ROLE libri_frontend_reader NOLOGIN; END IF;
END $$;
\ir ../migrations/20261004013540_libri_live_completeness_reads.sql
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003');
INSERT INTO libri.libraries(id,slug,name,created_by) VALUES ('00000000-0000-4000-8000-000000000010','one','One','00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000011','two','Two','00000000-0000-4000-8000-000000000003');
INSERT INTO libri.library_members(library_id,user_id,role) VALUES ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','owner'),('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','viewer'),('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000003','owner');
INSERT INTO libri.books(id,library_id,title) VALUES ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010','Book'),('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000011','Foreign');
SELECT pg_temp.assert_true((SELECT NOT prosecdef AND provolatile='s' FROM pg_proc WHERE oid='libri.read_book_completeness(uuid,uuid[])'::regprocedure),'completeness is a stable invoker');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','libri.read_book_completeness(uuid,uuid[])','EXECUTE'),'anonymous function denied');
SELECT pg_temp.assert_true(NOT has_function_privilege('libri_worker','libri.read_book_completeness(uuid,uuid[])','EXECUTE'),'worker grant unchanged');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT pg_temp.assert_true(completeness->>'score'='0' AND completeness->>'tier'='STUB' AND NOT indexing_enriched,'empty book starts at zero') FROM libri.read_book_completeness('00000000-0000-4000-8000-000000000010',ARRAY['00000000-0000-4000-8000-000000000020']::uuid[]);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.read_book_completeness('00000000-0000-4000-8000-000000000010',ARRAY['00000000-0000-4000-8000-000000000021']::uuid[])),'foreign book not returned');
DO $$ BEGIN
 BEGIN PERFORM * FROM libri.read_book_completeness('00000000-0000-4000-8000-000000000011',ARRAY['00000000-0000-4000-8000-000000000021']::uuid[]); RAISE EXCEPTION 'foreign library permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM libri.read_book_completeness('00000000-0000-4000-8000-000000000010','{}'::uuid[]); RAISE EXCEPTION 'empty batch permitted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM * FROM libri.read_book_completeness('00000000-0000-4000-8000-000000000010',ARRAY[NULL]::uuid[]); RAISE EXCEPTION 'null ID permitted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM * FROM libri.read_book_completeness('00000000-0000-4000-8000-000000000010',array_fill('00000000-0000-4000-8000-000000000020'::uuid,ARRAY[101])); RAISE EXCEPTION 'oversized batch permitted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO libri.chapters(id,library_id,book_id,position,number,title,summary,research_status,enrichment_payload) VALUES
 ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020',0,'1','Complete','Summary','complete','{"keyConcepts":["Concept"]}'),
 ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020',1,'2','Empty',NULL,'none','{}');
UPDATE libri.books SET indexing='{"hasCover":true,"hasToc":true,"chaptersExtracted":true}',page_count=100,year=2000,isbn10='0123456789',completeness='{"score":100,"tier":"EXPERT"}' WHERE id='00000000-0000-4000-8000-000000000020';
INSERT INTO libri.notes(library_id,book_id,owner_user_id,content) VALUES ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000001','Owner private');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SELECT pg_temp.assert_true(completeness->>'score'='35' AND completeness->>'tier'='MEDIUM' AND completeness#>>'{breakdown,chapterSummaries}'='7.50'
 AND completeness#>>'{breakdown,chapterConcepts}'='5.00' AND completeness#>>'{breakdown,hasNotes}'='0' AND NOT indexing_enriched,'legacy weights, rounding, privacy and incomplete chapter handling')
FROM libri.read_book_completeness('00000000-0000-4000-8000-000000000010',ARRAY['00000000-0000-4000-8000-000000000020']::uuid[]);
INSERT INTO libri.notes(library_id,book_id,owner_user_id,content) VALUES ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000002','Own private');
SELECT pg_temp.assert_true(completeness->>'score'='37' AND completeness#>>'{breakdown,counts,notes}'='1','note create immediately changes score')
FROM libri.read_book_completeness('00000000-0000-4000-8000-000000000010',ARRAY['00000000-0000-4000-8000-000000000020']::uuid[]);
DELETE FROM libri.notes WHERE owner_user_id='00000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true(completeness->>'score'='35' AND completeness#>>'{breakdown,counts,notes}'='0','note delete immediately changes score')
FROM libri.read_book_completeness('00000000-0000-4000-8000-000000000010',ARRAY['00000000-0000-4000-8000-000000000020']::uuid[]);
RESET ROLE;
-- Current artifacts contribute; rejected/superseded records cannot inflate counts.
INSERT INTO libri.derived_artifacts(library_id,book_id,chapter_id,artifact_type,content,content_sha256,idempotency_key,status) VALUES
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000031','chapter_summary','Summary',repeat('a',64),'summary','generated'),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000031','key_concepts','Concepts',repeat('b',64),'concepts','rejected');
INSERT INTO libri.derived_artifacts(library_id,book_id,artifact_type,content,content_sha256,idempotency_key,input_snapshot,generated_at) VALUES
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','book_analysis','Analysis',repeat('c',64),'analysis','{"noteCount":1}','2000-01-01');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SET ROLE authenticated;
SELECT pg_temp.assert_true(completeness#>>'{breakdown,chapterSummaries}'='15.00' AND completeness#>>'{breakdown,chapterConcepts}'='5.00'
 AND completeness#>>'{breakdown,chapterAiContent}'='5.00' AND completeness#>>'{breakdown,counts,bookSynthesisRecords}'='1'
 AND completeness->'gaps' @> '[{"area":"book_analysis_stale"}]'::jsonb,'current artifacts and edited-note staleness')
FROM libri.read_book_completeness('00000000-0000-4000-8000-000000000010',ARRAY['00000000-0000-4000-8000-000000000020']::uuid[]);
RESET ROLE;
SELECT pg_temp.assert_true((SELECT completeness->>'score'='100' FROM libri.books WHERE id='00000000-0000-4000-8000-000000000020'),'read never mutates imported score');
INSERT INTO libri.sources(id,library_id,source_type,source_key,title) VALUES
 ('00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000010','podcast_episode','podcast','Podcast'),
 ('00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000010','scanned_image','scan','Scan');
INSERT INTO libri.source_book_links(library_id,source_id,book_id) SELECT library_id,id,'00000000-0000-4000-8000-000000000020' FROM libri.sources;
INSERT INTO libri.images(id,library_id,book_id,source_id,object_path,original_filename,mime_type,byte_size,content_sha256,image_type) VALUES
 ('00000000-0000-4000-8000-000000000070','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000010/fixture.png','fixture.png','image/png',100,repeat('f',64),'page');
INSERT INTO libri.source_chunks(library_id,book_id,source_id,image_id,chunk_type,content,content_sha256,idempotency_key,is_archived,archived_at) VALUES
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000070','ocr','Active',repeat('d',64),'active',false,NULL),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000070','ocr','Archived',repeat('e',64),'archived',true,now());
INSERT INTO libri.people(id,library_id,name,bio,links) VALUES ('00000000-0000-4000-8000-000000000060','00000000-0000-4000-8000-000000000010','Author','Biography','{"website":"https://example.invalid"}');
INSERT INTO libri.book_people(library_id,book_id,person_id,role) VALUES ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000060','author');
SET ROLE authenticated;
SELECT pg_temp.assert_true(completeness#>>'{breakdown,counts,fragments}'='1' AND completeness#>>'{breakdown,counts,externalSources}'='1'
 AND completeness#>>'{breakdown,counts,linkedPodcasts}'='1' AND completeness#>>'{breakdown,fragmentCoverageDepth}'='0.83'
 AND completeness#>>'{breakdown,externalSources}'='1.60' AND completeness#>>'{breakdown,podcasts}'='2.50'
 AND completeness#>>'{breakdown,authorEnriched}'='3','archives and scans excluded; source, depth and author weights retained')
FROM libri.read_book_completeness('00000000-0000-4000-8000-000000000010',ARRAY['00000000-0000-4000-8000-000000000020']::uuid[]);
RESET ROLE;
DELETE FROM libri.library_members WHERE user_id='00000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM * FROM libri.read_book_completeness('00000000-0000-4000-8000-000000000010',ARRAY['00000000-0000-4000-8000-000000000020']::uuid[]); RAISE EXCEPTION 'revoked membership permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
