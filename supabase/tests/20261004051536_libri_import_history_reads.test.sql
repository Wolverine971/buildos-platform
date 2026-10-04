-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_chapter_research_base.sql
\ir ../migrations/20261004051536_libri_import_history_reads.sql
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO auth.users(id) VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003');
INSERT INTO libri.libraries(id,slug,name,created_by) VALUES('00000000-0000-4000-8000-000000000010','one','One','00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000011','two','Two','00000000-0000-4000-8000-000000000002');
INSERT INTO libri.library_members(library_id,user_id,role) VALUES('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','owner'),('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000003','viewer');
INSERT INTO libri.books(id,library_id,title,slug) VALUES('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010','One','one');
INSERT INTO libri.sources(id,library_id,source_type,source_key,title) VALUES('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000010','youtube_video','video-test','Video title');
INSERT INTO libri.youtube_videos(id,library_id,source_id,youtube_video_id) VALUES('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000021','abcdefghijk');
INSERT INTO libri.import_history(id,library_id,kind,book_id,video_id,source_id,source_sha256,archive_sha256,original_status,created_at,record) VALUES
 ('00000000-0000-5000-8000-000000000040','00000000-0000-4000-8000-000000000010','book','00000000-0000-4000-8000-000000000020',NULL,'book-old',repeat('a',64),repeat('b',64),'complete',now()-interval '1 day','{"_id":"old-book-import","bookId":"old-book","status":"complete","photos":[{"storageId":"legacy-only"}]}'),
 ('00000000-0000-5000-8000-000000000041','00000000-0000-4000-8000-000000000010','video',NULL,'00000000-0000-4000-8000-000000000022','video-old',repeat('a',64),repeat('b',64),'needs_review',now(),' {"_id":"old-video-import","videoId":"old-video","input":{"youtubeVideoId":"abcdefghijk","transcriptText":"Owner-only transcript"},"status":"needs_review"}');
SELECT pg_temp.assert_true((SELECT relforcerowsecurity FROM pg_class WHERE oid='libri.import_history'::regclass),'forced RLS');
SELECT pg_temp.assert_true(NOT has_table_privilege('libri_worker','libri.import_history','SELECT') AND NOT has_table_privilege('authenticated','libri.import_history','INSERT'),'no worker/raw client authority');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','libri.read_import_history(uuid,text,uuid,integer,boolean)','EXECUTE'),'anonymous denied');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT libri.read_import_history('00000000-0000-4000-8000-000000000010','book') AS history \gset
SELECT pg_temp.assert_true(jsonb_array_length(:'history'::jsonb)=1 AND :'history'::jsonb->0->>'_id'='00000000-0000-5000-8000-000000000040' AND :'history'::jsonb->0->>'bookId'='00000000-0000-4000-8000-000000000020','kind and mapped identity');
SELECT pg_temp.assert_true(:'history'::jsonb->0->>'bookSlug'='one' AND :'history'::jsonb->0->>'status'='archived' AND :'history'::jsonb->0->>'originalStatus'='complete','preserve original completion without active work');
SELECT libri.read_import_history('00000000-0000-4000-8000-000000000010','video') AS history \gset
SELECT pg_temp.assert_true(:'history'::jsonb->0->'input'->>'transcriptText'='Owner-only transcript' AND :'history'::jsonb->0->>'videoId'='00000000-0000-4000-8000-000000000022','owner raw payload and mapped video');
SELECT pg_temp.assert_true(:'history'::jsonb->0->'video'->>'title'='Video title' AND :'history'::jsonb->0->'transcriptStats'->>'totalSegments'='0','video display projection');
SELECT libri.read_import_history('00000000-0000-4000-8000-000000000010','video',NULL,25,true) AS history \gset
SELECT pg_temp.assert_true(NOT (:'history'::jsonb->0 ? 'input') AND :'history'::jsonb->0->>'inputYoutubeVideoId'='abcdefghijk','snapshot excludes raw transcript');
SELECT pg_temp.assert_true(libri.read_import_history('00000000-0000-4000-8000-000000000010','book','00000000-0000-5000-8000-000000000041')='[]','cross-kind ID denied');
DO $$ BEGIN
 BEGIN PERFORM libri.read_import_history('00000000-0000-4000-8000-000000000011','book'); RAISE EXCEPTION 'foreign library'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM libri.read_import_history('00000000-0000-4000-8000-000000000010','book',NULL,51); RAISE EXCEPTION 'unbounded'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.import_history),'viewer raw history denied');
DO $$ BEGIN BEGIN PERFORM libri.read_import_history('00000000-0000-4000-8000-000000000010','book'); RAISE EXCEPTION 'viewer RPC'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
DELETE FROM libri.books WHERE id='00000000-0000-4000-8000-000000000020';
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM libri.import_history WHERE kind='book' AND book_id IS NULL),'canonical deletion retains inert source history');
DELETE FROM libri.library_members WHERE user_id='00000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
DO $$ BEGIN BEGIN PERFORM libri.read_import_history('00000000-0000-4000-8000-000000000010','book'); RAISE EXCEPTION 'revoked owner'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.research_tasks),'no executable tasks from archive');
